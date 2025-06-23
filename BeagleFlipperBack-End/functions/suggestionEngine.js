const { analyzeHistoricFlips } = require('./historicalAnalyzer');
const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const config = require('./tradingConfig');
const modelRunner = require('./model_runner');

// Helper functions to prepare data for your AI model
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

class SuggestionEngine {
    constructor(db, config) {
        this.db = db;
        this.config = config;
        this.targetItems = { ...this.config.TARGET_COMMODITIES };
    }

    async initialize() {
        console.log("Initializing DaBeagleBoss Engine: Learning from trade history...");
        try {
            const dynamicTargets = analyzeHistoricFlips();
            dynamicTargets.forEach(target => {
                if (!this.targetItems[target.id]) {
                    this.targetItems[target.id] = target;
                }
            });
            console.log(`Engine initialized with ${Object.keys(this.targetItems).length} total targets.`);
        } catch (e) {
            console.error("Failed to analyze historical flips during initialization.", e);
        }
    }

    async getRankedSuggestions(userState) {
        const { gp = 0, offers = [], display_name: displayName, blocked_items = [], timeframe = 5 } = userState || {};
        const blockedItemsSet = new Set(blocked_items);

        await wikiApi.ensureMarketDataIsFresh();
        const marketData = wikiApi.getMarketData();
        if (!marketData || !marketData.latest) return [];

        const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
        const emptySlots = 8 - activeOfferItemIds.size;
        if (emptySlots <= 0) return [];

        const cashPerSlot = Math.floor(gp / emptySlots);
        if (cashPerSlot < this.config.TRADING_CONFIG.MIN_CASH_PER_SLOT) return [];

        const recentlyBought = await getRecentlyBoughtQuantities(this.db, displayName);

        const analysisPromises = Object.keys(this.targetItems).map(async (itemIdStr) => {
            const itemId = parseInt(itemIdStr);

            if (blockedItemsSet.has(itemId) || activeOfferItemIds.has(itemId)) return null;

            const mappingInfo = marketData.mapping.find(m => m.id === itemId);
            const latest = marketData.latest[itemId];
            if (!mappingInfo || !latest || latest.low <= 0) return null;

            // --- Your Proven "DaBeagleBoss" Buffered Pricing Logic ---
            const priceBuffer = Math.max(1, latest.low * 0.015);
            const buyPrice = Math.ceil(latest.low + priceBuffer);
            const sellPrice = Math.floor(latest.high - priceBuffer);

            if (sellPrice <= buyPrice || buyPrice > cashPerSlot) return null;

            const netProfitPerItem = Math.floor(sellPrice * (1 - this.config.TRADING_CONFIG.GE_TAX_RATE)) - buyPrice;
            if (netProfitPerItem < this.config.TRADING_CONFIG.MIN_PROFIT_PER_ITEM) return null;

            const remainingLimit = (mappingInfo.limit || 0) - (recentlyBought.get(itemId) || 0);
            const quantityToBuy = Math.min(Math.floor(cashPerSlot / buyPrice), remainingLimit);
            if (quantityToBuy <= 0) return null;

            // --- AI Model Validation ---
            const timeseries = await wikiApi.fetchTimeseriesForItem(itemId);
            if (!timeseries || timeseries.length < 4) return null;

            const recentPrices = timeseries.slice(-4).map(p => (p.avgLowPrice + p.avgHighPrice) / 2);
            const modelInput = {
                buy_price: buyPrice, quantity: quantityToBuy,
                trade_duration_hours: timeframe === 5 ? 0.15 : (timeframe / 60),
                buy_day_of_week: new Date().getUTCDay(), buy_hour_of_day: new Date().getUTCHours(),
                strategy_5m: timeframe === 5 ? 1 : 0, strategy_8h: timeframe === 480 ? 1 : 0,
                volatility: calculateVolatility(recentPrices), momentum: calculateMomentum(recentPrices),
                ma_price_ratio: calculateMAPriceRatio(buyPrice, recentPrices)
            };

            const confidence = modelRunner.predict(modelInput);
            if (confidence < this.config.TRADING_CONFIG.MIN_AI_CONFIDENCE_THRESHOLD) return null;

            return { itemId, itemName: mappingInfo.name, confidence, currentBuyPrice: buyPrice, quantityToBuy };
        });

        const settledResults = await Promise.allSettled(analysisPromises);
        const candidates = settledResults.filter(res => res.status === 'fulfilled' && res.value).map(res => res.value);

        candidates.sort((a, b) => b.confidence - a.confidence);
        console.log(`[DaBeagleBoss Engine] Found ${candidates.length} AI-approved suggestions.`);
        return candidates.slice(0, 20);
    }
}

module.exports = { SuggestionEngine };
