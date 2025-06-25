const { BollingerBands, RSI, MACD } = require('technicalindicators');
const wikiApi = require('./wikiApiHandler');
const config = require('./tradingConfig');

// --- SMART CACHE ---
// Caches a list of top-ranked candidates to provide instant subsequent suggestions.
let cachedTopCandidates = [];
let lastCacheTime = 0;
// Short-term memory for suggestions made within the current cache's lifetime.
let recentlySuggested = new Set();

/**
 * Calculates a "DaBeagleBoss" score based on multiple technical indicators.
 * @param {Array<object>} prices - Price history for an item.
 * @returns {number} A score indicating the strength of the buy signal.
 */
function getDaBeagleBossScore(prices) {
    let score = 0;
    const priceValues = prices.map(p => (p.avgHighPrice + p.avgLowPrice) / 2);
    const latestPrice = priceValues[priceValues.length - 1];
    try {
        const bbResult = BollingerBands.calculate({ period: 20, values: priceValues, stdDev: 2 });
        const latestBB = bbResult[bbResult.length - 1];
        if (latestPrice <= latestBB.lower) score += 2; // Strong "buy" signal
        else if (latestPrice <= latestBB.middle) score += 1;
    } catch (e) { /* ignore */ }
    try {
        const rsiResult = RSI.calculate({ values: priceValues, period: 14 });
        if (rsiResult[rsiResult.length - 1] < 45) score += 1; // "Oversold" signal
    } catch (e) { /* ignore */ }
    try {
        const macdResult = MACD.calculate({ values: priceValues, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        if (macdResult[macdResult.length - 1].MACD > macdResult[macdResult.length - 1].signal) score += 1; // "Bullish momentum" signal
    } catch (e) { /* ignore */ }
    return score;
}

/**
 * Performs the deep analysis to generate a ranked list of the best trading candidates.
 */
async function generateRankedCandidateList(userState, db) {
    const { gp = 0, offers = [], displayName } = userState || {};

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData || !marketData.latest || !marketData.mapping) return [];

    // Corrected "Don't Re-buy" logic, checking only active GE offers.
    const inProgressItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.itemId));
    
    const emptySlots = 8 - inProgressItemIds.size;
    if (emptySlots <= 0) return [];
    
    const cashPerSlot = Math.floor(gp / emptySlots);
    if (cashPerSlot < config.TRADING_CONFIG.MIN_CASH_PER_SLOT) return [];

    let profitableCandidates = [];
    for (const item of marketData.mapping) {
        if (inProgressItemIds.has(item.id)) continue;
        const latestData = marketData.latest[item.id];
        if (!latestData || !latestData.high || !latestData.low || latestData.low > cashPerSlot) continue;
        const netProfitPerItem = Math.floor(latestData.high * (1 - config.TRADING_CONFIG.GE_TAX_RATE)) - latestData.low;
        if (netProfitPerItem >= config.TRADING_CONFIG.QUANT_MIN_PROFIT_PER_UNIT_GP) {
            profitableCandidates.push({ ...item, latestData, netProfitPerItem });
        }
    }
    
    const recentlyBought = await require('./buyLimitTracker').getRecentlyBoughtQuantities(db, displayName);
    let finalCandidates = [];
    
    const BATCH_SIZE = 50;
    for (let i = 0; i < profitableCandidates.length; i += BATCH_SIZE) {
        const batch = profitableCandidates.slice(i, i + BATCH_SIZE);
        const analysisPromises = batch.map(async (candidate) => {
            const timeseriesResponse = await wikiApi.fetchTimeseriesForItem(candidate.id, '5m');
            if (!timeseriesResponse || timeseriesResponse.length < 26) return null;
            const score = getDaBeagleBossScore(timeseriesResponse);
            if (score < (config.TRADING_CONFIG.SCORE_THRESHOLD || 2)) return null;
            let quantityToBuy = Math.floor(cashPerSlot / candidate.latestData.low);
            const remainingLimit = candidate.limit - (recentlyBought.get(candidate.id) || 0);
            quantityToBuy = Math.min(quantityToBuy, remainingLimit);
            if (quantityToBuy <= 0) return null;
            return {
                itemId: candidate.id, itemName: candidate.name, score,
                currentBuyPrice: candidate.latestData.low, quantityToBuy
            };
        });
        const settledResults = await Promise.allSettled(analysisPromises);
        finalCandidates.push(...settledResults.filter(res => res.status === 'fulfilled' && res.value).map(res => res.value));
    }
    
    finalCandidates.sort((a, b) => b.score - a.score);
    return finalCandidates;
}


/**
 * Main exported function that serves suggestions instantly from the cache.
 */
async function getSuggestionWithCaching(userState, db, displayName) {
    const now = Date.now();
    const activeOfferItemIds = new Set(userState.offers?.filter(o => o.status !== 'empty').map(o => o.itemId));
    
    // Check if the cache is stale. If so, perform the heavy analysis to refresh it.
    if (now >= lastCacheTime + config.TRADING_CONFIG.SUGGESTION_POLL_INTERVAL_SECONDS * 1000) {
        console.log("[Cache] Smart Cache is stale. Performing deep analysis...");
        cachedTopCandidates = await generateRankedCandidateList(userState, db, displayName);
        lastCacheTime = now;
        recentlySuggested.clear(); // Reset short-term memory with the cache
        console.log(`[Cache] Refresh complete. Found ${cachedTopCandidates.length} high-quality candidates.`);
    }

    // Now, serve an instant suggestion from the fresh cache.
    if (cachedTopCandidates.length > 0) {
        for (const candidate of cachedTopCandidates) {
            // Check against active offers AND recently suggested items
            if (!activeOfferItemIds.has(candidate.itemId) && !recentlySuggested.has(candidate.itemId)) {
                recentlySuggested.add(candidate.itemId); // Remember we suggested this one
                return {
                    type: "buy", message: `DaBeagleBoss Score: ${candidate.score}`,
                    item_id: candidate.itemId, price: candidate.currentBuyPrice,
                    quantity: candidate.quantityToBuy, name: candidate.itemName,
                };
            }
        }
    }

    // If all cached items are in use or recently suggested, wait.
    return { type: "wait", message: "Monitoring for new opportunities..." };
}

module.exports = { getSuggestionWithCaching };