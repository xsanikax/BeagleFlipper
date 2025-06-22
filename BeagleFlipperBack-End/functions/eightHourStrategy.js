const wikiApi = require('./wikiApiHandler');
const modelRunner = require('./model_runner_8h');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const config = require('./tradingConfig');

async function getAITradingDecision(itemId, marketData, maxCash) {
    try {
        const maxQuantity = Math.floor(maxCash / marketData.instant_sell_price);
        if (maxQuantity <= 0) return null;
        const quantityTests = [Math.min(maxQuantity, 50), Math.min(maxQuantity, 10)].filter(q => q > 0);
        let bestDecision = null;
        let bestScore = 0;
        for (const quantity of quantityTests) {
            const aiInput = {
                buy_price: marketData.instant_sell_price, quantity, trade_duration_hours: marketData.trade_duration_hours,
                buy_day_of_week: marketData.buy_day_of_week, buy_hour_of_day: marketData.buy_hour_of_day,
                strategy_5m: marketData.strategy_5m, strategy_8h: marketData.strategy_8h,
                volatility: marketData.volatility, momentum: marketData.momentum, ma_price_ratio: marketData.ma_price_ratio
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
                            buyPrice: marketData.instant_sell_price, sellPrice: predictedSellPrice, quantity,
                            confidence, profitGP, profitPercent, totalCost, score
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

async function getEightHourSuggestionList(userState, db, displayName, timeframe = 480) {
    const { inventory = [], offers } = userState || {};
    const gp = inventory.find(item => item.id === 995)?.amount || 0;
    await wikiApi.ensureMarketDataIsFresh();
    const { mapping, latest } = wikiApi.getMarketData();
    if (!mapping || !latest) return [];
    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
    const emptySlots = 8 - activeOfferItemIds.size;
    if (emptySlots === 0) return [];
    const cashPerSlot = Math.floor(gp / emptySlots);
    if (cashPerSlot < config.TRADING_CONFIG.MIN_CASH_PER_SLOT_8H) return [];
    const recentlyBought = await getRecentlyBoughtQuantities(db, displayName);
    const preFiltered = mapping.filter(item => {
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
    const topItems = preFiltered.sort((a, b) => (latest[b.id].high - latest[b.id].low) - (latest[a.id].high - latest[a.id].low)).slice(0, 20);
    const candidates = [];
    for (const item of topItems) {
        const latestData = latest[item.id];
        const recentlyBoughtCount = recentlyBought.get(item.id) || 0;
        const remainingLimit = item.limit - recentlyBoughtCount;
        const marketData = {
            instant_buy_price: latestData.high, instant_sell_price: latestData.low, current_spread: latestData.high - latestData.low,
            volatility: 0.02, momentum: 0.01, ma_price_ratio: 1.0, volume_per_hour: 100,
            buy_day_of_week: new Date().getUTCDay(), buy_hour_of_day: new Date().getUTCHours(),
            strategy_5m: 0, strategy_8h: 1, trade_duration_hours: 8
        };
        const aiDecision = await getAITradingDecision(item.id, marketData, cashPerSlot);
        if (!aiDecision) continue;
        const finalQuantity = Math.min(aiDecision.quantity, remainingLimit);
        if (finalQuantity <= 0) continue;
        candidates.push({
            type: "buy", message: `AI: ${aiDecision.profitGP.toLocaleString()}gp profit (${Math.round(aiDecision.profitPercent*100)}%) @ ${Math.round(aiDecision.confidence*100)}% confidence`,
            item_id: item.id, price: aiDecision.buyPrice, quantity: finalQuantity, name: item.name,
            predicted_sell_price: aiDecision.sellPrice, ai_confidence: aiDecision.confidence, score: aiDecision.score
        });
        if (candidates.length >= 5) break;
    }
    if (candidates.length === 0) return [];
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

module.exports = { getEightHourSuggestionList };