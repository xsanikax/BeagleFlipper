// The Ultimate Trader - FIXED VERSION
// Removed the problematic getMapping call that was causing the error

const { TRADING_CONFIG } = require('./tradingConfig');

// --- Helper Functions to calculate market metrics ---

function calculateLiquidityScore(timeseries, limit) {
    if (!timeseries || timeseries.length < 3) return 0;
    const recentVolume = timeseries.slice(-3).reduce((sum, point) => sum + (point.lowPriceVolume || 0) + (point.highPriceVolume || 0), 0) / 3;
    const volumes = timeseries.slice(-6).map(point => (point.lowPriceVolume || 0) + (point.highPriceVolume || 0));
    if (volumes.length === 0) return 0;
    const volumeMean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    if (volumeMean === 0) return 0;
    const volumeStdDev = Math.sqrt(volumes.reduce((sum, vol) => sum + Math.pow(vol - volumeMean, 2), 0) / volumes.length);
    const consistencyRatio = (volumeMean - volumeStdDev) / volumeMean;
    const volumeToLimitRatio = Math.min(recentVolume / (limit || 1000), 10);
    return Math.max(0, volumeToLimitRatio * Math.max(0.3, consistencyRatio) * 100);
}

function analyzeSpreadOpportunity(latest, timeseries) {
    if (!latest || !timeseries || timeseries.length < 2) return { spreadStability: 0, currentSpreadPercent: 0 };
    const currentSpread = latest.high - latest.low;
    const currentSpreadPercent = latest.low > 0 ? (currentSpread / latest.low) * 100 : 0;
    const recentSpreads = timeseries.slice(-6).map(point => point.avgHighPrice - point.avgLowPrice).filter(s => s >= 0);
    if (recentSpreads.length < 2) return { spreadStability: 0.5, currentSpreadPercent };
    const avgSpread = recentSpreads.reduce((a, b) => a + b, 0) / recentSpreads.length;
    let spreadStability = 0;
    if (avgSpread > 0) {
        const stdDev = Math.sqrt(recentSpreads.reduce((sum, spread) => sum + Math.pow(spread - avgSpread, 2), 0) / recentSpreads.length);
        spreadStability = 1 - (stdDev / avgSpread);
    }
    return { spreadStability: Math.max(0, spreadStability), currentSpreadPercent };
}

/**
 * The "Brain" of the bot. Implements the final meta-strategy to calculate prices.
 * This is the logic we reverse-engineered from your successful trade history.
 */
function calculateUltimatePrices(timeseries, timeframe) {
    // New, corrected logic for windowSize to handle your 5m strategy
    let windowSize;
    if (timeframe === 5) {
        // For the 5m strategy, look at the last two 5-minute intervals.
        windowSize = 2;
    } else {
        // For all other strategies (30m, 2h, 8h), use the original calculation.
        windowSize = Math.ceil(timeframe / 5);
    }

    if (!timeseries || timeseries.length < windowSize) return { buyPrice: null, sellPrice: null };

    const windowData = timeseries.slice(-windowSize);

    const lowPrice = windowData.reduce((min, p) => Math.min(min, p.avgLowPrice), Infinity);
    const highPrice = windowData.reduce((max, p) => Math.max(max, p.avgHighPrice), 0);
    const prices = windowData.map(p => (p.avgLowPrice + p.avgHighPrice) / 2).filter(p => p > 0);
    if (prices.length === 0) return { buyPrice: null, sellPrice: null };
    const smaPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    let buyPrice, sellPrice;
    const spreadAnalysis = analyzeSpreadOpportunity({ low: lowPrice, high: highPrice }, timeseries);

    // BUY LOGIC: Always "Snipe the Floor"
    buyPrice = lowPrice + 1;

    // SELL LOGIC: Adapts based on item stability
    if (spreadAnalysis && spreadAnalysis.currentSpreadPercent < 1.5 && spreadAnalysis.spreadStability > 0.85) {
        // For stable, low-margin items, aggressively target the peak
        sellPrice = highPrice - 1;
    } else {
        // For all other items, target the safer statistical center (the SMA)
        sellPrice = smaPrice;
    }

    if (!buyPrice || !sellPrice || isNaN(buyPrice) || isNaN(sellPrice) || sellPrice <= buyPrice) {
        return { buyPrice: null, sellPrice: null };
    }
    return { buyPrice, sellPrice };
}


/**
 * Main suggestion function, called by index.js
 */
async function getSuggestions(userState, db, displayName, timeframe, dependencies) {
    try {
        console.log('[Suggestion Engine] Starting getSuggestions...');

        const { wikiApi, getRecentlyBoughtQuantities } = dependencies;

        // Validate inputs
        if (!userState || typeof userState !== 'object') {
            return { type: "wait", message: "Invalid user state..." };
        }

        if (!wikiApi) {
            return { type: "wait", message: "Wiki API not available..." };
        }

        const { gp = 0, offers = [], blocked_items = [] } = userState;
        console.log('[Suggestion Engine] User state - GP:', gp, 'Offers:', offers.length, 'Blocked items:', blocked_items.length);

        // Get market data
        let marketData;
        try {
            console.log('[Suggestion Engine] Ensuring market data is fresh...');
            await wikiApi.ensureMarketDataIsFresh();
            marketData = wikiApi.getMarketData();
            console.log('[Suggestion Engine] Market data retrieved, items:', marketData?.itemCount || 0);
        } catch (error) {
            console.error('[Suggestion Engine] Error getting market data:', error);
            return { type: "wait", message: "Refreshing market data..." };
        }

        // Check if we have the required data
        if (!marketData || !marketData.latest || !marketData.mapping) {
            console.log('[Suggestion Engine] Missing market data components:', {
                hasMarketData: !!marketData,
                hasLatest: !!marketData?.latest,
                hasMapping: !!marketData?.mapping
            });
            return { type: "wait", message: "Waiting for market data..." };
        }

        // FIXED: Use mapping from market data directly (it's already loaded in ensureMarketDataIsFresh)
        const mapping = marketData.mapping;
        if (!mapping || !Array.isArray(mapping)) {
            console.log('[Suggestion Engine] No mapping data available, type:', typeof mapping, 'isArray:', Array.isArray(mapping));
            return { type: "wait", message: "Loading item mappings..." };
        }

        console.log('[Suggestion Engine] Mapping loaded, items:', mapping.length);

        const activeOfferItemIds = new Set(offers.filter(o => o && o.status !== 'empty').map(o => o.item_id));
        const emptySlots = 8 - activeOfferItemIds.size;
        console.log('[Suggestion Engine] Active offers:', activeOfferItemIds.size, 'Empty slots:', emptySlots);

        if (emptySlots <= 0) return { type: "wait", message: "All slots active." };

        const cashPerSlot = Math.floor(gp / emptySlots);
        console.log('[Suggestion Engine] Cash per slot:', cashPerSlot);

        if (cashPerSlot < 1000) {
            return { type: "wait", message: "Not enough cash per slot..." };
        }

        // Get recently bought quantities
        let recentlyBought = new Map();
        try {
            if (getRecentlyBoughtQuantities) {
                recentlyBought = await getRecentlyBoughtQuantities(db, displayName);
                console.log('[Suggestion Engine] Recently bought items:', recentlyBought.size);
            }
        } catch (error) {
            console.warn('[Suggestion Engine] Error getting recently bought quantities:', error);
        }

        const blockedItemsSet = new Set(Array.isArray(blocked_items) ? blocked_items : []);
        const itemIdsToFetch = Object.keys(marketData.latest)
            .map(id => parseInt(id))
            .filter(id => !isNaN(id) && !blockedItemsSet.has(id) && !activeOfferItemIds.has(id));

        console.log('[Suggestion Engine] Items to analyze:', itemIdsToFetch.length);

        if (itemIdsToFetch.length === 0) {
            return { type: "wait", message: "No items to analyze..." };
        }

        // Fetch bulk timeseries data
        let allTimeseries;
        try {
            console.log('[Suggestion Engine] Fetching bulk timeseries...');
            const timeframes = {
    5: '5m',
    30: '30m',
    120: '2h',
    480: '8h'
};
const apiTimeStep = timeframes[timeframe] || '5m';
allTimeseries = await wikiApi.fetchBulkTimeseries(itemIdsToFetch, apiTimeStep);
            console.log('[Suggestion Engine] Timeseries fetched:', allTimeseries?.size || 0);
        } catch (error) {
            console.error('[Suggestion Engine] Error fetching bulk timeseries:', error);
            return { type: "wait", message: "Loading price history..." };
        }

        if (!allTimeseries || allTimeseries.size === 0) {
            return { type: "wait", message: "Loading price history..." };
        }

        console.log(`[Ultimate Trader] Analyzing ${allTimeseries.size} items...`);

        let allCandidates = [];

        for (const [itemId, timeseries] of allTimeseries.entries()) {
            try {
                // Find mapping info for this item
                const mappingInfo = mapping.find(m => m.id === itemId);
                if (!mappingInfo || !mappingInfo.limit) continue;

                // Use our new, ultimate price calculation logic
                const { buyPrice, sellPrice } = calculateUltimatePrices(timeseries, timeframe);

                if (!buyPrice || !sellPrice || buyPrice > cashPerSlot) continue;

                const netProfitPerItem = Math.floor(sellPrice * (1 - TRADING_CONFIG.GE_TAX_RATE)) - buyPrice;

                // Use the non-restrictive filter from tradingConfig.js
                if (netProfitPerItem < TRADING_CONFIG.MIN_PROFIT_PER_ITEM) continue;

                const roi = buyPrice > 0 ? netProfitPerItem / buyPrice : 0;
                if (roi < TRADING_CONFIG.MIN_ROI) continue;

                const remainingLimit = mappingInfo.limit - (recentlyBought.get(itemId) || 0);
                const quantityToBuy = Math.min(Math.floor(cashPerSlot / buyPrice), remainingLimit);
                if (quantityToBuy <= 0) continue;

                const liquidityScore = calculateLiquidityScore(timeseries, mappingInfo.limit);
                if (liquidityScore < TRADING_CONFIG.MIN_LIQUIDITY_SCORE) continue;

                // Simple, non-AI score to rank the best opportunities
                const score = (roi * 1000) + (liquidityScore * 1.5) + (netProfitPerItem);

                allCandidates.push({
                    itemId,
                    itemName: mappingInfo.name,
                    score,
                    currentBuyPrice: buyPrice,
                    currentSellPrice: sellPrice,
                    quantityToBuy,
                    totalProfit: netProfitPerItem * quantityToBuy,
                    message: `Margin: ${netProfitPerItem} gp | ROI: ${roi.toFixed(2)}%`
                });
            } catch (error) {
                console.warn(`[Suggestion Engine] Error analyzing item ${itemId}:`, error);
                continue;
            }
        }

        console.log('[Suggestion Engine] Candidates found:', allCandidates.length);

        if (allCandidates.length === 0) {
            return { type: "wait", message: "Monitoring for opportunities..." };
        }

        allCandidates.sort((a, b) => b.score - a.score);
        const bestFlip = allCandidates[0];

        console.log(`[Ultimate Trader] Found ${allCandidates.length} candidates. Best: ${bestFlip.itemName} (${bestFlip.itemId})`);

        return {
            type: "buy",
            message: bestFlip.message,
            item_id: bestFlip.itemId,
            price: bestFlip.currentBuyPrice,
            quantity: bestFlip.quantityToBuy,
            name: bestFlip.itemName,
        };
    } catch (error) {
        console.error('[Suggestion Engine] Error in getSuggestions:', error);
        return { type: "wait", message: "Engine error, retrying..." };
    }
}

module.exports = { getSuggestions };