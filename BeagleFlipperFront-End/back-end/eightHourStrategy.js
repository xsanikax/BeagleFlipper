// eightHourStrategy.js - AI-Driven Quant Trading
const wikiApi = require('./wikiApiHandler');
const modelRunner = require('./model_runner_8h');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');

const TAX_RATE = 0.01;

const CONFIG_8H = {
    MIN_VOLUME_PER_HOUR: 50,
    MIN_CASH_PER_SLOT: 1000,
    AI_CONFIDENCE_THRESHOLD: 0.65,  // Higher threshold for AI-driven decisions
    MIN_PROFIT_GP: 10,
    MIN_PROFIT_PERCENT: 0.05,  // 5% minimum
    MAX_PRICE_UPDATE_AGE_HOURS: 2   // Only recent data
};

// Prepare comprehensive market data for AI model
async function prepareAIMarketData(itemId, latestData) {
    try {
        // Get recent timeseries data for pattern analysis
        const timeseries = await wikiApi.fetchTimeseriesForItem(itemId, '5m');
        if (!timeseries || timeseries.length === 0) {
            return null;
        }

        const recent = timeseries.slice(-24); // Last 2 hours of 5-minute data
        const latest = recent[recent.length - 1];
        
        // Calculate volatility from recent prices
        const prices = recent.map(t => (t.avgHighPrice + t.avgLowPrice) / 2).filter(p => p > 0);
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        const volatility = returns.length > 1 ? Math.sqrt(returns.reduce((sum, r) => sum + r*r, 0) / returns.length) : 0;

        // Calculate momentum
        const momentum = prices.length >= 2 ? (prices[prices.length-1] - prices[0]) / prices[0] : 0;

        // Volume analysis
        const totalVolume = recent.reduce((sum, t) => sum + (t.highPriceVolume || 0) + (t.lowPriceVolume || 0), 0);
        const avgVolumePerHour = totalVolume / 2; // 2 hours of data

        // Price ratio analysis
        const currentPrice = (latest.avgHighPrice + latest.avgLowPrice) / 2;
        const movingAvg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const ma_price_ratio = currentPrice / movingAvg;

        return {
            // Current market state
            instant_buy_price: latestData.high,    // What we can sell at immediately
            instant_sell_price: latestData.low,   // What we can buy at immediately
            current_spread: latestData.high - latestData.low,
            
            // Technical indicators
            volatility,
            momentum,
            ma_price_ratio,
            volume_per_hour: avgVolumePerHour,
            
            // Market timing
            buy_day_of_week: new Date().getUTCDay(),
            buy_hour_of_day: new Date().getUTCHours(),
            
            // Strategy flags
            strategy_5m: 0,
            strategy_8h: 1,
            trade_duration_hours: 8
        };
    } catch (error) {
        console.log(`⚠️ Error preparing AI data for ${itemId}:`, error.message);
        return null;
    }
}

// Let AI determine optimal buy and sell prices (optimized for speed)
async function getAITradingDecision(itemId, marketData, maxCash) {
    try {
        // Calculate maximum affordable quantity at instant-sell price
        const maxQuantity = Math.floor(maxCash / marketData.instant_sell_price);
        if (maxQuantity <= 0) return null;
        
        // Test only 2 quantity scenarios for speed
        const quantityTests = [
            Math.min(maxQuantity, 50),
            Math.min(maxQuantity, 10)
        ].filter(q => q > 0);

        let bestDecision = null;
        let bestScore = 0;

        for (const quantity of quantityTests) {
            const aiInput = {
                buy_price: marketData.instant_sell_price,
                quantity,
                trade_duration_hours: marketData.trade_duration_hours,
                buy_day_of_week: marketData.buy_day_of_week,
                buy_hour_of_day: marketData.buy_hour_of_day,
                strategy_5m: marketData.strategy_5m,
                strategy_8h: marketData.strategy_8h,
                volatility: marketData.volatility,
                momentum: marketData.momentum,
                ma_price_ratio: marketData.ma_price_ratio
            };
            
            const confidence = modelRunner.predict(aiInput);
            
            if (confidence > CONFIG_8H.AI_CONFIDENCE_THRESHOLD) {
                // AI confidence-based sell price prediction
                const spreadRatio = marketData.current_spread / marketData.instant_sell_price;
                const confidenceMultiplier = 1 + (confidence - 0.5) * spreadRatio;
                const predictedSellPrice = Math.floor(marketData.instant_buy_price * confidenceMultiplier);
                
                const totalCost = marketData.instant_sell_price * quantity;
                const grossRevenue = predictedSellPrice * quantity;
                const netRevenue = Math.floor(grossRevenue * (1 - TAX_RATE));
                const profitGP = netRevenue - totalCost;
                const profitPercent = profitGP / totalCost;
                
                if (profitGP >= CONFIG_8H.MIN_PROFIT_GP && profitPercent >= CONFIG_8H.MIN_PROFIT_PERCENT) {
                    const score = confidence * profitPercent * quantity;
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestDecision = {
                            buyPrice: marketData.instant_sell_price,
                            sellPrice: predictedSellPrice,
                            quantity,
                            confidence,
                            profitGP,
                            profitPercent,
                            totalCost,
                            score
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
    
    const { inventory = [], offers } = reqBody || {};
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

    if (emptySlots === 0) {
        return { type: "wait", message: "All slots active." };
    }

    const cashPerSlot = Math.floor(gp / emptySlots);
    if (cashPerSlot < CONFIG_8H.MIN_CASH_PER_SLOT) {
        return { type: "wait", message: `Need ${CONFIG_8H.MIN_CASH_PER_SLOT}gp per slot, have ${cashPerSlot}gp` };
    }

    const recentlyBought = await getRecentlyBoughtQuantities(db, displayName);
    
    // Pre-filter items for faster processing
    const preFiltered = mapping.filter(item => {
        if (activeOfferItemIds.has(item.id)) return false;
        if (!item.limit || item.limit <= 0) return false;
        
        const latestData = latest[item.id];
        if (!latestData || !latestData.high || !latestData.low) return false;
        
        const spread = latestData.high - latestData.low;
        if (spread < 2) return false;
        if (latestData.low < 5 || latestData.high > 50000000) return false;
        
        const recentlyBoughtCount = recentlyBought.get(item.id) || 0;
        if (item.limit - recentlyBoughtCount <= 0) return false;
        
        return true;
    });
    
    console.log(`🤖 Analyzing top ${Math.min(preFiltered.length, 20)} items for AI opportunities...`);
    
    // Only analyze top 20 most promising items to avoid timeout
    const topItems = preFiltered
        .sort((a, b) => {
            const aData = latest[a.id];
            const bData = latest[b.id];
            const aSpread = aData.high - aData.low;
            const bSpread = bData.high - bData.low;
            return bSpread - aSpread; // Sort by largest spread first
        })
        .slice(0, 20);
    
    const candidates = [];
    let analyzed = 0;
    
    for (const item of topItems) {
        const latestData = latest[item.id];
        const recentlyBoughtCount = recentlyBought.get(item.id) || 0;
        const remainingLimit = item.limit - recentlyBoughtCount;
        
        // Quick market data preparation (no API calls)
        const marketData = {
            instant_buy_price: latestData.high,
            instant_sell_price: latestData.low,
            current_spread: latestData.high - latestData.low,
            volatility: 0.02, // Default values for speed
            momentum: 0.01,
            ma_price_ratio: 1.0,
            volume_per_hour: 100, // Assume decent volume
            buy_day_of_week: new Date().getUTCDay(),
            buy_hour_of_day: new Date().getUTCHours(),
            strategy_5m: 0,
            strategy_8h: 1,
            trade_duration_hours: 8
        };
        
        analyzed++;
        
        // Get AI's trading decision
        const aiDecision = await getAITradingDecision(item.id, marketData, cashPerSlot);
        if (!aiDecision) continue;
        
        // Ensure we don't exceed buy limits
        const finalQuantity = Math.min(aiDecision.quantity, remainingLimit);
        if (finalQuantity <= 0) continue;
        
        candidates.push({
            itemId: item.id,
            name: item.name,
            ...aiDecision,
            quantity: finalQuantity,
            marketData
        });
        
        // Log top candidates
        if (candidates.length <= 3) {
            console.log(`🎯 Candidate ${candidates.length}: ${item.name}`);
            console.log(`   Buy: ${aiDecision.buyPrice}gp x${finalQuantity} = ${(aiDecision.buyPrice * finalQuantity).toLocaleString()}gp`);
            console.log(`   Sell: ${aiDecision.sellPrice}gp (AI confidence: ${(aiDecision.confidence*100).toFixed(1)}%)`);
            console.log(`   Profit: ${aiDecision.profitGP.toLocaleString()}gp (${(aiDecision.profitPercent*100).toFixed(1)}%)`);
        }
        
        // Stop early if we have enough good candidates
        if (candidates.length >= 5) break;
    }
    
    console.log(`🤖 AI analyzed ${analyzed} items, found ${candidates.length} profitable opportunities`);
    
    if (candidates.length === 0) {
        return { 
            type: "wait", 
            message: `AI found no profitable 8h opportunities (analyzed ${analyzed} items)` 
        };
    }
    
    // Sort by AI score (confidence * profit * quantity)
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    console.log(`\n🏆 AI SELECTED: ${best.name}`);
    console.log(`   📊 Market: Buy@${best.marketData.instant_sell_price} → Sell@${best.marketData.instant_buy_price} (spread: ${best.marketData.current_spread})`);
    console.log(`   🤖 AI Decision: Buy@${best.buyPrice} → Target@${best.sellPrice}`);
    console.log(`   💰 Trade: ${best.quantity}x @ ${best.buyPrice}gp = ${(best.buyPrice * best.quantity).toLocaleString()}gp`);
    console.log(`   📈 Expected: ${best.profitGP.toLocaleString()}gp profit (${(best.profitPercent*100).toFixed(1)}%)`);
    console.log(`   🎯 AI Confidence: ${(best.confidence*100).toFixed(1)}%`);
    console.log(`   📊 Volatility: ${(best.marketData.volatility*100).toFixed(2)}%, Momentum: ${(best.marketData.momentum*100).toFixed(2)}%`);
    console.log(`=== END AI STRATEGY ===\n`);
    
    return {
        type: "buy",
        message: `AI: ${best.profitGP.toLocaleString()}gp profit (${Math.round(best.profitPercent*100)}%) @ ${Math.round(best.confidence*100)}% confidence`,
        item_id: best.itemId,
        price: best.buyPrice,
        quantity: best.quantity,
        name: best.name,
        // Include sell price for immediate listing
        predicted_sell_price: best.sellPrice,
        ai_confidence: best.confidence
    };
}

module.exports = { getEightHourSuggestion };
