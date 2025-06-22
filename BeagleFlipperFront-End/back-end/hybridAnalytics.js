// hybridAnalytics.js
// VERSION: Fast & Safe. Uses instantaneous prices to increase trade velocity
//          while guaranteeing historical profit margins before AI validation.
// FIXED: Now dynamically uses timeframe from frontend instead of hardcoded values

const wikiApi = require('./wikiApiHandler');
const modelRunner = require('./model_runner');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');

// --- Configuration & Constants ---
const TAX_RATE = 0.02;
const TIER1_MIN_VOLUME = 2500;
const TIER1_MIN_PROFIT = 1;
const MIN_AI_CONFIDENCE_THRESHOLD = 0.60;

const TARGET_COMMODITIES = new Set([
    2, 231, 199, 201, 203, 205, 207, 209, 211, 213, 215, 217, 219, 2485,
    3049, 3051, 11230, 6685, 2434, 169, 3040, 383, 227, 453, 235, 1777,
    13439, 11934, 560, 565, 555, 554, 557, 556, 9075, 8839, 8840, 2353,
    2363, 2361, 2359, 2351, 2349, 11212, 11235, 4585, 12934, 13357, 
    13441, 11936, 19912, 19948, 19960, 19972, 19984, 20002, 20014, 20026, 
    20038, 20050, 20062, 20074, 20086, 20098, 20849, 20904, 21880, 22296, 
    22826, 23583, 23595, 23607, 23619, 23631, 24538, 26233, 26245, 26257, 
    26269, 26281, 26293, 26305, 27158, 562, 563, 561, 811, 221, 223, 
    225, 237, 2481, 5316, 13437
]);
const PROFIT_TARGETS = new Map([
    [561, 3], [2, 6], [231, 4], [199, 5], [201, 5], [203, 5], [205, 7], 
    [207, 6], [209, 8], [211, 6], [213, 7], [215, 8], [217, 8], [219, 9], 
    [2485, 50], [3049, 21], [3051, 16], [11230, 133], [6685, 86], [2434, 13], 
    [169, 7], [3040, 48], [383, 10], [227, 4], [453, 2], [235, 3], [1777, 6], 
    [13439, 5], [11934, 5], [560, 2], [565, 2], [555, 1], [554, 1], [557, 1], 
    [556, 1], [9075, 2], [8839, 30], [8840, 20], [2353, 5], [2363, 15], 
    [2361, 10], [2359, 8], [2351, 5], [2349, 4], [11212, 100], [11235, 150], 
    [4585, 30], [12934, 500], [13357, 5], [13441, 10], [11936, 10], [19912, 5], 
    [19948, 5], [19960, 5], [19972, 5], [19984, 5], [20002, 5], [20014, 5], 
    [20026, 5], [20038, 5], [20050, 5], [20062, 5], [20074, 5], [20086, 5], 
    [20098, 5], [20849, 5], [20904, 5], [21880, 5], [22296, 5], [22826, 5], 
    [23583, 5], [23595, 5], [23607, 5], [23619, 5], [23631, 5], [24538, 5], 
    [26233, 5], [26245, 5], [26257, 5], [26269, 5], [26281, 5], [26293, 5], 
    [26305, 5], [27158, 5], [562, 2], [563, 2], [811, 3], [221, 4], [223, 5], 
    [225, 4], [237, 4], [2481, 20], [5316, 30], [13437, 8]
]);

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
    const itemToSell = inventory.find(item => TARGET_COMMODITIES.has(item.id) && !activeOfferItemIds.has(item.id) && item.amount > 0 && item.id !== 995);
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
    if (cashPerSlot < 10000) return { type: "wait", message: "Not enough cash per slot." };
    const recentlyBought = await getRecentlyBoughtQuantities(db, displayName);

    let candidates = [];
    const commodityCheckPromises = Array.from(TARGET_COMMODITIES).map(async (itemId) => {
        const mappingInfo = marketData.mapping.find(m => m.id === itemId);
        if (!mappingInfo || activeOfferItemIds.has(itemId)) return null;
        
        const latestData = marketData.latest[itemId];
        if (!latestData) return null;

        // 1. Determine the realistic, fast sell price
        const potentialSellPrice = latestData.high;

        // 2. Determine the required profit target
        const requiredProfit = PROFIT_TARGETS.get(itemId) || TIER1_MIN_PROFIT;
        
        // 3. Calculate the MAXIMUM buy price that GUARANTEES profit after tax
        const maxBuyPrice = Math.floor(potentialSellPrice * (1 - TAX_RATE)) - requiredProfit;

        // 4. The target buy price is the current instant-sell price
        const targetBuyPrice = latestData.low;
        
        // 5. Check if this flip is mathematically viable RIGHT NOW
        if (targetBuyPrice > maxBuyPrice || targetBuyPrice <= 0 || targetBuyPrice > cashPerSlot) {
            return null; // This flip is not currently viable
        }

        const remainingLimit = mappingInfo.limit - (recentlyBought.get(itemId) || 0);
        let quantityToBuy = Math.floor(cashPerSlot / targetBuyPrice);
        quantityToBuy = Math.min(quantityToBuy, remainingLimit);
        if (quantityToBuy <= 0) return null;

        const timeseries = await wikiApi.fetchTimeseriesForItem(itemId);
        if (!timeseries || timeseries.length < 4) return null;
        const recentHistory = timeseries.slice(-4);

        const latestTimeseriesData = recentHistory[recentHistory.length - 1];
        const fiveMinVolume = (latestTimeseriesData.highPriceVolume || 0) + (latestTimeseriesData.lowPriceVolume || 0);
        if (fiveMinVolume < TIER1_MIN_VOLUME) return null;

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
        
        if (confidence >= MIN_AI_CONFIDENCE_THRESHOLD) {
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

module.exports = { getHybridSuggestion, getPriceSuggestion };
