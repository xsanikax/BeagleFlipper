const wikiApi = require('./wikiApiHandler');
const modelRunner = require('./model_runner_8h');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const config = require('./tradingConfig');

async function prepareAIMarketData(itemId, latestData) {
    try {
        const timeseries = await wikiApi.fetchTimeseriesForItem(itemId, '5m');
        if (!timeseries || timeseries.length === 0) return null;
        const recent = timeseries.slice(-24);
        const latestTimeSeriesData = recent[recent.length - 1];
        const prices = recent.map(t => (t.avgHighPrice + t.avgLowPrice) / 2).filter(p => p > 0);
        const volatility = prices.length > 1 ? Math.sqrt(prices.slice(1).map((p, i) => Math.pow((p - prices[i]) / prices[i], 2)).reduce((sum, val) => sum + val, 0) / (prices.length - 1)) : 0;
        const momentum = prices.length >= 2 ? (prices[prices.length-1] - prices[0]) / prices[0] : 0;
        const totalVolume = recent.reduce((sum, t) => sum + (t.highPriceVolume || 0) + (t.lowPriceVolume || 0), 0);
        const avgVolumePerHour = totalVolume / 2;
        const currentPrice = (latestTimeSeriesData.avgHighPrice + latestTimeSeriesData.avgLowPrice) / 2;
        const movingAvg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const ma_price_ratio = currentPrice / movingAvg;
        return {
            instant_buy_price: latestData.high, instant_sell_price: latestData.low,
            current_spread: latestData.high - latestData.low, volatility, momentum,
            ma_price_ratio, volume_per_hour: avgVolumePerHour,
            buy_day_of_week: new Date().getUTCDay(), buy_hour_of_day: new Date().getUTCHours(),
            strategy_5m: 0, strategy_8h: 1, trade_duration_hours: 8
        };
    } catch (error) {
        console.log(`⚠️ Error preparing AI data for ${itemId}:`, error.message);
        return null;
    }
}

async function getAITradingDecision(itemId, marketData, maxCash) {
    try {
        const maxQuantity = Math.floor(maxCash / marketData.instant_sell_price);
        if (maxQuantity <= 0) return null;

        const quantityTests = [ Math.min(maxQuantity, 50), Math.min(maxQuantity, 10) ].filter(q => q > 0);
        let bestDecision = null;
        let bestScore = 0;

        for (const quantity of quantityTests) {
            const aiInput = {
                buy_price: marketData.instant_sell_price, quantity,
                trade_duration_hours: marketData.trade_duration_hours, buy_day_of_week: marketData.buy_day_of_week,
                buy_hour_of_day: marketData.buy_hour_of_day, strategy_5m: marketData.strategy_5m,
                strategy_8h: marketData.strategy_8h, volatility: marketData.volatility,
                momentum: marketData.momentum, ma_price_ratio: marketData.ma_price_ratio
            };
            const confidence = modelRunner.predict(aiInput);
            if (confidence > config.TRADING_CONFIG.AI_CONFIDENCE_THRESHOLD_8H) {
                const spreadRatio = marketData.current_spread / marketData.instant_sell_price;
                const confidenceMultiplier = 1 + (confidence - 0.5) * spreadRatio;
                const predictedSellPrice = Math.floor(marketData.instant_buy_price * confidenceMultiplier);
                const totalCost = marketData.instant_sell_price * quantity;
                const grossRevenue = predictedSellPrice * quantity;
                const netRevenue = Math.floor(grossRevenue * (1 - config.TRADING_CONFIG.GE_TAX_RATE));
                const profitGP = netRevenue - totalCost;
                const profitPercent = profitGP / totalCost;

                if (profitGP >= config.TRADING_CONFIG.MIN_PROFIT_PER_ITEM && profitPercent >= config.TRADING_CONFIG.MIN_MARGIN_PERCENTAGE) {
                    const score = confidence * profitPercent * quantity;
                    if (score > bestScore) {
                        bestScore = score;
                        bestDecision = {
                            buyPrice: marketData.instant_sell_price, sellPrice: predictedSellPrice,
                            quantity, confidence, profitGP, profitPercent, totalCost, score
                        };
                    }
                }
            }
        }
        return bestDecision;
    } catch (error) {
        console.log(`⚠️ AI decision error for ${itemId}:`, error.message);
        return null;
    }
}

async function getEightHourSuggestion(reqBody, db, displayName, timeframe = 480) {
    console.log(`\n=== AI-DRIVEN 8H QUANT STRATEGY ===`);

    // --- FIX: Now reads the blocked and recently suggested items from the request ---
    const { inventory = [], offers, blocked_items = [], recently_suggested = [] } = reqBody || {};
    const blockedItemsSet = new Set(blocked_items);
    const recentlySuggestedSet = new Set(recently_suggested);

    const gp = inventory.find(item => item.id === 995)?.amount || 0;
    console.log(`💰 Available GP: ${gp.toLocaleString()}`);

    await wikiApi.ensureMarketDataIsFresh();
    const { mapping, latest } = wikiApi.getMarketData();
    if (!mapping || !latest) {
        return { type: "wait", message: "Waiting for market data..." };
    }

    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
    const emptySlots = 8 - activeOfferItemIds.size;
    console.log(`🔄 Active: ${activeOfferItemIds.size}/8, Empty slots: ${emptySlots}`);

    if (emptySlots === 0) return { type: "wait", message: "All slots active." };

    const cashPerSlot = Math.floor(gp / emptySlots);
    if (cashPerSlot < config.TRADING_CONFIG.MIN_CASH_PER_SLOT_8H) {
        return { type: "wait", message: `Need ${config.TRADING_CONFIG.MIN_CASH_PER_SLOT_8H}gp per slot, have ${cashPerSlot}gp` };
    }

    const recentlyBought = await getRecentlyBoughtQuantities(db, displayName);

    const preFiltered = mapping.filter(item => {
        // --- THE FIX: This single check respects both blocked and skipped items ---
        if (blockedItemsSet.has(item.id) || recentlySuggestedSet.has(item.id)) {
            return false;
        }

        if (activeOfferItemIds.has(item.id)) return false;
        if (!item.limit || item.limit <= 0) return false;
        const latestData = latest[item.id];
        if (!latestData || !latestData.high || !latestData.low) return false;
        const spread = latestData.high - latestData.low;
        if (spread < 2) return false;
        if (latestData.low < 5 || latestData.high > config.TRADING_CONFIG.MAX_PRICE_PER_ITEM) return false;
        const recentlyBoughtCount = recentlyBought.get(item.id) || 0;
        if (item.limit - recentlyBoughtCount <= 0) return false;
        return true;
    });

    console.log(`🤖 Analyzing top ${Math.min(preFiltered.length, 20)} items for AI opportunities...`);

    const topItems = preFiltered
        .sort((a, b) => (latest[b.id].high - latest[b.id].low) - (latest[a.id].high - latest[a.id].low))
        .slice(0, 20);

    const candidates = [];
    let analyzed = 0;

    for (const item of topItems) {
        const latestData = latest[item.id];
        const remainingLimit = item.limit - (recentlyBought.get(item.id) || 0);
        const marketData = {
            instant_buy_price: latestData.high, instant_sell_price: latestData.low,
            current_spread: latestData.high - latestData.low, volatility: 0.02,
            momentum: 0.01, ma_price_ratio: 1.0, volume_per_hour: 100,
            buy_day_of_week: new Date().getUTCDay(), buy_hour_of_day: new Date().getUTCHours(),
            strategy_5m: 0, strategy_8h: 1, trade_duration_hours: 8
        };
        analyzed++;

        const aiDecision = await getAITradingDecision(item.id, marketData, cashPerSlot);
        if (!aiDecision) continue;

        const finalQuantity = Math.min(aiDecision.quantity, remainingLimit);
        if (finalQuantity <= 0) continue;

        candidates.push({ itemId: item.id, name: item.name, ...aiDecision, quantity: finalQuantity, marketData });

        if (candidates.length <= 3) {
            console.log(`🎯 Candidate ${candidates.length}: ${item.name}`);
        }
        if (candidates.length >= 5) break;
    }

    console.log(`🤖 AI analyzed ${analyzed} items, found ${candidates.length} profitable opportunities`);
    if (candidates.length === 0) {
        return { type: "wait", message: `AI found no profitable 8h opportunities (analyzed ${analyzed} items)` };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    console.log(`\n🏆 AI SELECTED: ${best.name}`);
    return {
        type: "buy",
        message: `AI: ${best.profitGP.toLocaleString()}gp profit (${Math.round(best.profitPercent*100)}%) @ ${Math.round(best.confidence*100)}% confidence`,
        item_id: best.itemId, price: best.buyPrice, quantity: best.quantity, name: best.name,
        predicted_sell_price: best.sellPrice, ai_confidence: best.confidence
    };
}

module.exports = { getEightHourSuggestion };
