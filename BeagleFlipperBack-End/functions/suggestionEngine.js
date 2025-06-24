// The Ultimate Trader - FINAL VERSION
// Implements the complete meta-strategy and removes restrictive config filters.

const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const config = require('./tradingConfig'); // Still used for GE_TAX_RATE

// Helper functions for calculating market metrics
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
    if(recentSpreads.length < 2) return { spreadStability: 0.5, currentSpreadPercent };
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
 */
function calculateUltimatePrices(timeseries, timeframe = 30) {
    const windowSize = Math.ceil(timeframe / 5);
    if (!timeseries || timeseries.length < windowSize) return { buyPrice: null, sellPrice: null };

    const windowData = timeseries.slice(-windowSize);

    const lowPrice = windowData.reduce((min, p) => Math.min(min, p.avgLowPrice), Infinity);
    const highPrice = windowData.reduce((max, p) => Math.max(max, p.avgHighPrice), 0);
    const prices = windowData.map(p => (p.avgLowPrice + p.avgHighPrice) / 2).filter(p => p > 0);
    if (prices.length === 0) return { buyPrice: null, sellPrice: null };
    const smaPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    let buyPrice, sellPrice;
    const spreadAnalysis = analyzeSpreadOpportunity({low: lowPrice, high: highPrice}, timeseries);

    buyPrice = lowPrice + 1;

    if (spreadAnalysis && spreadAnalysis.currentSpreadPercent < 1.5 && spreadAnalysis.spreadStability > 0.85) {
        sellPrice = highPrice - 1;
    } else {
        sellPrice = smaPrice;
    }

    if (!buyPrice || !sellPrice || isNaN(buyPrice) || isNaN(sellPrice) || sellPrice <= buyPrice) {
        return { buyPrice: null, sellPrice: null };
    }
    return { buyPrice, sellPrice };
}

class SuggestionEngine {
    constructor(db, config) {
        this.db = db;
        this.config = config;
    }

    async getRankedSuggestions(userState) {
        const { gp = 0, offers = [], display_name: displayName, blocked_items = [], timeframe = 30 } = userState || {};

        await wikiApi.ensureMarketDataIsFresh();
        const marketData = wikiApi.getMarketData();
        if (!marketData || !marketData.latest) return [];

        const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
        const emptySlots = 8 - activeOfferItemIds.size;
        if (emptySlots <= 0) return [];

        const cashPerSlot = Math.floor(gp / emptySlots);
        const recentlyBought = await getRecentlyBoughtQuantities(this.db, displayName);

        const itemIdsToFetch = Object.keys(marketData.latest).map(id => parseInt(id)).filter(id => !new Set(blocked_items).has(id) && !activeOfferItemIds.has(id));
        const allTimeseries = await wikiApi.fetchBulkTimeseries(itemIdsToFetch, '5m');

        console.log(`[Ultimate Trader] Analyzing ${allTimeseries.size} items...`);

        let allCandidates = [];

        for (const [itemId, timeseries] of allTimeseries.entries()) {
            try {
                const mappingInfo = marketData.mapping.find(m => m.id === itemId);
                if (!mappingInfo || !mappingInfo.limit) continue;

                const { buyPrice, sellPrice } = calculateUltimatePrices(timeseries, timeframe);
                if (!buyPrice || !sellPrice || buyPrice > cashPerSlot) continue;

                const netProfitPerItem = Math.floor(sellPrice * (1 - this.config.TRADING_CONFIG.GE_TAX_RATE)) - buyPrice;

                // --- THE FIX: REMOVED RESTRICTIVE FILTERS ---
                // We no longer check against MIN_PROFIT_PER_ITEM or MIN_ROI from the config.
                // We only care if there is *any* profit after tax.
                if (netProfitPerItem <= 0) continue;

                const remainingLimit = mappingInfo.limit - (recentlyBought.get(itemId) || 0);
                const quantityToBuy = Math.min(Math.floor(cashPerSlot / buyPrice), remainingLimit);
                if (quantityToBuy <= 0) continue;

                const liquidityScore = calculateLiquidityScore(timeseries, mappingInfo.limit);
                // We still check for a minimum liquidity to avoid untradeable items.
                if (liquidityScore < this.config.TRADING_CONFIG.MIN_LIQUIDITY_SCORE) continue;

                // A new score that heavily favors profitability and liquidity.
                const roi = netProfitPerItem / buyPrice;
                const score = (roi * 1000) + (liquidityScore * 1.5) + (netProfitPerItem);

                allCandidates.push({
                    itemId, itemName: mappingInfo.name, score,
                    currentBuyPrice: buyPrice, currentSellPrice: sellPrice,
                    quantityToBuy, totalProfit: netProfitPerItem * quantityToBuy, netProfitPerItem,
                });
            } catch (error) {
                // Continue to the next item if one fails
            }
        }

        allCandidates.sort((a, b) => b.score - a.score);

        console.log(`[Ultimate Trader] Found ${allCandidates.length} potential flips. Ranking now.`);
        return allCandidates.slice(0, 20); // Return the top 20 suggestions
    }
}

module.exports = { SuggestionEngine };
