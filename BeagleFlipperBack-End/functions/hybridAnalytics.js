const wikiApi = require('./wikiApiHandler');
const modelRunner = require('./model_runner');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const config = require('./tradingConfig');

async function getHybridSuggestionList(userState, db, displayName, timeframe = 5) {
    const { inventory = [], offers = [] } = userState || {};
    const tradeDurationHours = timeframe === 5 ? 0.15 : (timeframe / 60);
    const strategy5m = timeframe === 5 ? 1 : 0;
    const strategy8h = timeframe === 480 ? 1 : 0;

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData.latest || !marketData.mapping) return [];

    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));

    const completedOffer = offers.find(o => o.quantity > 0 && o.quantitySold === o.quantity);
    if (completedOffer) {
        const itemName = marketData.mapping.find(m => m.id === completedOffer.item_id)?.name || 'item';
        return [{ type: "collect", message: `Collect your completed ${completedOffer.type} offer for ${itemName}!` }];
    }
    const itemToSell = inventory.find(item => config.TARGET_COMMODITIES.hasOwnProperty(item.id) && !activeOfferItemIds.has(item.id) && item.amount > 0 && item.id !== 995);
    if (itemToSell) {
        const item_id = itemToSell.id;
        const mappingInfo = marketData.mapping.find(m => m.id === item_id);
        const latestData = marketData.latest[item_id];
        if (mappingInfo && latestData && latestData.high > 0) {
            return [{ type: "sell", message: `Selling ${itemToSell.amount} ${mappingInfo.name}`, item_id, name: mappingInfo.name, quantity: itemToSell.amount, price: latestData.high }];
        }
    }

    const emptySlots = offers.filter(offer => offer.status === 'empty').length;
    if (emptySlots === 0) return [];
    const availableCash = inventory.find(item => item.id === 995)?.amount || 0;
    const cashPerSlot = Math.floor(availableCash / emptySlots);
    if (cashPerSlot < config.TRADING_CONFIG.MIN_CASH_PER_SLOT) return [];
    const recentlyBought = await getRecentlyBoughtQuantities(db, displayName);

    const commodityCheckPromises = Object.keys(config.TARGET_COMMODITIES).map(async (itemIdStr) => {
        const itemId = parseInt(itemIdStr);
        const mappingInfo = marketData.mapping.find(m => m.id === itemId);
        if (!mappingInfo || activeOfferItemIds.has(itemId)) return null;
        const latestData = marketData.latest[itemId];
        if (!latestData) return null;
        const potentialSellPrice = latestData.high;
        const requiredProfit = potentialSellPrice * config.TRADING_CONFIG.MIN_MARGIN_PERCENTAGE;
        const maxBuyPrice = Math.floor(potentialSellPrice * (1 - config.TRADING_CONFIG.GE_TAX_RATE)) - requiredProfit;
        const targetBuyPrice = latestData.low;
        if (targetBuyPrice > maxBuyPrice || targetBuyPrice <= 0 || targetBuyPrice > cashPerSlot) return null;
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
        if (fiveMinVolume < config.TRADING_CONFIG.MIN_VOLUME_THRESHOLD) return null;
        const now = new Date();
        const recentPrices = recentHistory.map(p => (p.avgLowPrice + p.avgHighPrice) / 2);
        const modelInput = {
            buy_price: targetBuyPrice, quantity: quantityToBuy, trade_duration_hours: tradeDurationHours,
            buy_day_of_week: now.getUTCDay(), buy_hour_of_day: now.getUTCHours(),
            strategy_5m: strategy5m, strategy_8h: strategy8h,
            volatility: calculateVolatility(recentPrices), momentum: calculateMomentum(recentPrices),
            ma_price_ratio: calculateMAPriceRatio(targetBuyPrice, recentPrices)
        };
        const confidence = modelRunner.predict(modelInput);
        if (confidence >= config.TRADING_CONFIG.MIN_AI_CONFIDENCE_THRESHOLD) {
            return { type: "buy", message: `AI Confidence (${timeframe}min): ${Math.round(confidence * 100)}%`, item_id: itemId, price: targetBuyPrice, quantity: quantityToBuy, name: mappingInfo.name, confidence };
        }
        return null;
    });

    const commodityResults = await Promise.allSettled(commodityCheckPromises);
    const candidates = commodityResults.filter(result => result.status === 'fulfilled' && result.value !== null).map(result => result.value);

    if (candidates.length === 0) return [];

    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates;
}

async function getPriceSuggestion(itemId, type = 'buy') {
    await wikiApi.ensureMarketDataIsFresh();
    const { latest } = wikiApi.getMarketData();
    if (!latest || !latest[itemId]) return { price: null };
    const itemData = latest[itemId];
    const price = type === 'sell' ? itemData.high : itemData.low;
    return { price };
}

function calculateVolatility(prices) { if (prices.length < 2) return 0; const mean = prices.reduce((a, b) => a + b, 0) / prices.length; const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length; return Math.sqrt(variance); }
function calculateMomentum(prices) { if (prices.length < 2) return 0; const startPrice = prices[0]; const endPrice = prices[prices.length - 1]; if (startPrice === 0) return 0; return (endPrice - startPrice) / startPrice; }
function calculateMAPriceRatio(currentPrice, prices) { if (prices.length === 0) return 1; const movingAverage = prices.reduce((a, b) => a + b, 0) / prices.length; if (movingAverage === 0) return 1; return currentPrice / movingAverage; }

module.exports = { getHybridSuggestionList, getPriceSuggestion };