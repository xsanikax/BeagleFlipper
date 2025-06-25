// hybridAnalytics.js
// VERSION: Fast & Safe. Uses instantaneous prices to increase trade velocity
//          while guaranteeing historical profit margins before AI validation.
// FIXED: Now dynamically uses timeframe from frontend instead of hardcoded values

const wikiApi = require('./wikiApiHandler');
const modelRunner = require('./model_runner');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const config = require('./tradingConfig'); // NEW: Import centralized configuration

// Removed hardcoded constants as they are now in tradingConfig.js
// const TAX_RATE = 0.02;
// const TIER1_MIN_VOLUME = 2500;
// const TIER1_MIN_PROFIT = 1;
// const MIN_AI_CONFIDENCE_THRESHOLD = 0.60;
// const TARGET_COMMODITIES = new Set([...]); // Will use config.TARGET_COMMODITIES
// const PROFIT_TARGETS = new Map([...]); // Will be derived from config.TARGET_COMMODITIES

async function getHybridSuggestion(userState, db, displayName, timeframe = 5) {
    const { inventory = [], offers = [] } = userState || {};
    
    // Convert timeframe to hours and set strategy flags dynamically
    const tradeDurationHours = timeframe === 5 ? 0.15 : (timeframe / 60); // 5 min = 0.15 hours, others convert from minutes
    const strategy5m = timeframe === 5 ? 1 : 0;
    const strategy8h = timeframe === 480 ? 1 : 0;
    
    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData.latest || !marketData.mapping) return { type: "wait", message: "Waiting for market data..." };
    
    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));

    // PRIORITY 1: COLLECT
    const completedOffer = offers.find(o => o.quantity > 0 && o.quantitySold === o.quantity);
    if (completedOffer) {
        const itemName = marketData.mapping.find(m => m.id === completedOffer.item_id)?.name || 'item';
        return { type: "collect", message: `Collect your completed ${completedOffer.type} offer for ${itemName}!` };
    }
    
    // PRIORITY 2: RESPONSIVE SELL
    const itemToSell = inventory.find(item => config.TARGET_COMMODITIES.hasOwnProperty(item.id) && !activeOfferItemIds.has(item.id) && item.amount > 0 && item.id !== 995); // Use config
    if (itemToSell) {
        const item_id = itemToSell.id;
        const mappingInfo = marketData.mapping.find(m => m.id === item_id);
        const latestData = marketData.latest[item_id];
        // NEW STRATEGY: Sell at the current instant-buy price for faster turnover.
        if (mappingInfo && latestData && latestData.high > 0) {
            return { type: "sell", message: `Selling ${itemToSell.amount} ${mappingInfo.name}`, item_id, name: mappingInfo.name, quantity: itemToSell.amount, price: latestData.high };
        }
    }

    // PRIORITY 3: AI-DRIVEN, PROFIT-GUARANTEED BUY
    const emptySlots = offers.filter(offer => offer.status === 'empty').length;
    if (emptySlots === 0) return { type: "wait", message: "All slots active. Monitoring." };
    const availableCash = inventory.find(item => item.id === 995)?.amount || 0;
    const cashPerSlot = Math.floor(availableCash / emptySlots);
    if (cashPerSlot < config.TRADING_CONFIG.MIN_CASH_PER_SLOT) return { type: "wait", message: "Not enough cash per slot." }; // Use config
    const recentlyBought = await getRecentlyBoughtQuantities(db, displayName);

    let candidates = [];
    const commodityCheckPromises = Object.keys(config.TARGET_COMMODITIES).map(async (itemIdStr) => { // Iterate over config
        const itemId = parseInt(itemIdStr);
        const mappingInfo = marketData.mapping.find(m => m.id === itemId);
        if (!mappingInfo || activeOfferItemIds.has(itemId)) return null;
        
        const latestData = marketData.latest[itemId];
        if (!latestData) return null;

        // 1. Determine the realistic, fast sell price
        const potentialSellPrice = latestData.high;

        // 2. Determine the required profit target
        // Get profit target from config.TARGET_COMMODITIES priority (can define a target profit per item there later)
        // For now, using a simple fixed profit or derived from minimum margin percentage.
        const requiredProfit = potentialSellPrice * config.TRADING_CONFIG.MIN_MARGIN_PERCENTAGE; // Use config
        
        // 3. Calculate the MAXIMUM buy price that GUARANTEES profit after tax
        const maxBuyPrice = Math.floor(potentialSellPrice * (1 - config.TRADING_CONFIG.GE_TAX_RATE)) - requiredProfit; // Use config

        // 4. The target buy price is the current instant-sell price
        const targetBuyPrice = latestData.low;
        
        // 5. Check if this flip is mathematically viable RIGHT NOW
        if (targetBuyPrice > maxBuyPrice || targetBuyPrice <= 0 || targetBuyPrice > cashPerSlot) {
            return null; // This flip is not currently viable
        }

        // Use limit from TARGET_COMMODITIES in config
        const itemConfig = config.TARGET_COMMODITIES[itemIdStr];
        const remainingLimit = itemConfig.limit - (recentlyBought.get(itemId) || 0);
        let quantityToBuy = Math.floor(cashPerSlot / targetBuyPrice);
        quantityToBuy = Math.min(quantityToBuy, remainingLimit);
        if (quantityToBuy <= 0) return null;

        const timeseries = await wikiApi.fetchTimeseriesForItem(itemId);
        if (!timeseries || timeseries.length < 4) return null;
        const recentHistory = timeseries.slice(-4);

        const latestTimeseriesData = recentHistory[recentHistory.length - 1];
        const fiveMinVolume = (latestTimeseriesData.highPriceVolume || 0) + (latestTimeseriesData.lowPriceVolume || 0);
        if (fiveMinVolume < config.TRADING_CONFIG.MIN_VOLUME_THRESHOLD) return null; // Use config

        // This trade is viable. Now, let the AI validate it.
        const now = new Date();
        const recentPrices = recentHistory.map(p => (p.avgLowPrice + p.avgHighPrice) / 2);
        const modelInput = { 
            buy_price: targetBuyPrice, 
            quantity: quantityToBuy, 
            trade_duration_hours: tradeDurationHours, 
            buy_day_of_week: now.getUTCDay(), 
            buy_hour_of_day: now.getUTCHours(), 
            strategy_5m: strategy5m, 
            strategy_8h: strategy8h, 
            volatility: calculateVolatility(recentPrices), 
            momentum: calculateMomentum(recentPrices),
            ma_price_ratio: calculateMAPriceRatio(targetBuyPrice, recentPrices)
        };
        const confidence = modelRunner.predict(modelInput);
        
        if (confidence >= config.TRADING_CONFIG.MIN_AI_CONFIDENCE_THRESHOLD) { // Use config
            return { itemId, name: mappingInfo.name, buyPrice: targetBuyPrice, quantityToBuy, confidence };
        }
        return null;
    });

    const commodityResults = await Promise.allSettled(commodityCheckPromises);
    candidates = commodityResults.filter(result => result.status === 'fulfilled' && result.value !== null).map(result => result.value);
    
    if (candidates.length === 0) return { type: "wait", message: "AI found no profitable opportunities. Waiting..." };

    candidates.sort((a, b) => b.confidence - a.confidence);
    const bestNewFlip = candidates[0];

    return { 
        type: "buy", 
        message: `AI Confidence (${timeframe}min): ${Math.round(bestNewFlip.confidence * 100)}%`, 
        item_id: bestNewFlip.itemId, 
        price: bestNewFlip.buyPrice,
        quantity: bestNewFlip.quantityToBuy, 
        name: bestNewFlip.name 
    };
}

async function getPriceSuggestion(itemId, type = 'buy') {
    await wikiApi.ensureMarketDataIsFresh();
    const { latest } = wikiApi.getMarketData();
    if (!latest || !latest[itemId]) return { price: null };
    const itemData = latest[itemId];
    const price = type === 'sell' ? itemData.high : itemData.low;
    return { price };
}

// These helper functions are not used in hybridAnalytics currently, but were in your old AI setup.
// They are kept here for now but will eventually be moved/removed with the new quant algorithm.
function calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    return Math.sqrt(variance);
}
function calculateMomentum(prices) {
    if (prices.length < 2) return 0;
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    if (startPrice === 0) return 0;
    return (endPrice - startPrice) / startPrice;
}
function calculateMAPriceRatio(currentPrice, prices) {
    if (prices.length === 0) return 1;
    const movingAverage = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (movingAverage === 0) return 1;
    return currentPrice / movingAverage;
}


module.exports = { getHybridSuggestion, getPriceSuggestion };
