/**
 * f2pAnalytics.js - F2P STRATEGIC PARALLEL PROCESSING VERSION
 * This is a high-fidelity replica of the hybridAnalytics logic, fully adapted for the F2P market.
 * It performs a two-phase scan: a priority check on F2P_STAPLE_ITEMS, followed by a
 * full scan of all F2P_ITEM_IDS if necessary, ensuring a robust and serious F2P strategy.
 */

const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const {
    TRADING_CONFIG,
    TRADING_HELPERS,
    F2P_ITEM_IDS,
    F2P_STAPLE_ITEMS // Use both F2P item lists
} = require('./tradingConfig');

// --- UTILITY FUNCTIONS (Mirrors hybridAnalytics) ---

function getPricesFromSnapshots(timeseries) {
    if (!timeseries) {
        return null;
    }
    const maxWindow = Math.max(TRADING_CONFIG.BUY_SNAPSHOT_WINDOW, TRADING_CONFIG.SELL_SNAPSHOT_WINDOW);
    if (timeseries.length < maxWindow) {
        return null;
    }
    const buyPricingWindow = timeseries.slice(-TRADING_CONFIG.BUY_SNAPSHOT_WINDOW);
    const buyLows = buyPricingWindow.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));
    const sellPricingWindow = timeseries.slice(-TRADING_CONFIG.SELL_SNAPSHOT_WINDOW);
    const sellHighs = sellPricingWindow.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));
    if (!buyLows.length || !sellHighs.length) {
        return null;
    }
    const floorPrice = Math.min(...buyLows);
    const ceilingPrice = Math.max(...sellHighs);
    let opportunityBuyPrice = null;
    let opportunitySellPrice = null;
    if (timeseries.length >= TRADING_CONFIG.SELL_SNAPSHOT_WINDOW + TRADING_CONFIG.OPPORTUNITY_WINDOW) {
        const recentSnapshots = timeseries.slice(-TRADING_CONFIG.OPPORTUNITY_WINDOW);
        const recentLows = recentSnapshots.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));
        const recentHighs = recentSnapshots.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));
        if (recentLows.length && recentHighs.length) {
            const currentLow = Math.min(...recentLows);
            const currentHigh = Math.max(...recentHighs);
            const dropPercentage = (floorPrice - currentLow) / floorPrice;
            if (dropPercentage >= TRADING_CONFIG.VOLATILITY_THRESHOLD) {
                opportunityBuyPrice = currentLow;
            }
            const spikePercentage = (currentHigh - ceilingPrice) / ceilingPrice;
            if (spikePercentage >= TRADING_CONFIG.VOLATILITY_THRESHOLD) {
                opportunitySellPrice = currentHigh;
            }
        }
    }
    return {
        avgLow: floorPrice,
        avgHigh: ceilingPrice,
        opportunityBuyPrice,
        opportunitySellPrice
    };
}

function getHourlyVolume(timeseries) {
    if (!timeseries || timeseries.length === 0) return null;
    const latestPoint = timeseries[timeseries.length - 1];
    if (latestPoint && typeof latestPoint.highPriceVolume === 'number' && typeof latestPoint.lowPriceVolume === 'number') {
        const fiveMinTotal = latestPoint.highPriceVolume + latestPoint.lowPriceVolume;
        return fiveMinTotal * 12;
    }
    return null;
}

function isProfitableSell(buyPrice, sellPrice) {
    const netSell = Math.floor(sellPrice * (1 - TRADING_CONFIG.GE_TAX_RATE));
    const profit = netSell - buyPrice;
    return profit >= TRADING_CONFIG.MIN_PROFIT_PER_ITEM;
}

function calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining) {
    const maxByCash = Math.floor(cashPerSlot / buyPrice);
    return Math.min(maxByCash, limitRemaining);
}

function calculateQuickFlipScore(flip) {
    let score = flip.potentialHourlyProfit;
    if (flip.hourlyVolume >= TRADING_CONFIG.HIGH_VOLUME_THRESHOLD) {
        score *= TRADING_CONFIG.HIGH_VOLUME_SCORE_MULTIPLIER;
    }
    if (flip.hourlyVolume >= TRADING_CONFIG.HIGH_VOLUME_THRESHOLD * 3) {
        score *= TRADING_CONFIG.VERY_HIGH_VOLUME_SCORE_MULTIPLIER;
    }
    const profitMargin = flip.profit / flip.price;
    if (profitMargin > 0.1) {
        score *= TRADING_CONFIG.HIGH_MARGIN_SCORE_MULTIPLIER;
    } else if (profitMargin > 0.05) {
        score *= TRADING_CONFIG.MID_MARGIN_SCORE_MULTIPLIER;
    }
    if (flip.price > TRADING_CONFIG.MAX_PRICE_PER_ITEM) {
        score *= TRADING_CONFIG.EXPENSIVE_ITEM_PENALTY;
    }
    return score;
}

function sortByQuickFlipScore(a, b) {
    return calculateQuickFlipScore(b) - calculateQuickFlipScore(a);
}

function isValidItem(item) {
    return item &&
           item.tradeable_on_ge !== false &&
           item.name &&
           item.limit > 0;
}

function getItemLimit(id, mapEntry) {
    return mapEntry.limit;
}

async function analyzeItemBatch(ids, cashPerSlot, recentlyBoughtMap, marketData, activeOfferItemIds) {
    const promises = ids.map(async (id) => {
        try {
            if (activeOfferItemIds && activeOfferItemIds.has(id)) {
                return null;
            }
            const mapEntry = marketData.mapping.find(m => m.id === id);
            if (!isValidItem(mapEntry)) return null;

            const ts = await wikiApi.fetchTimeseriesForItem(id);
            if (!ts) return null;

            const priceData = getPricesFromSnapshots(ts);
            if (!priceData) return null;

            const hourlyVolume = getHourlyVolume(ts);
            if (!hourlyVolume) return null;

            const buyPrice = priceData.opportunityBuyPrice ? Math.floor(priceData.opportunityBuyPrice) + 1 : Math.floor(priceData.avgLow) + 1;
            const sellPrice = priceData.opportunitySellPrice ? Math.floor(priceData.opportunitySellPrice) - 1 : Math.floor(priceData.avgHigh);

            if (buyPrice > cashPerSlot) return null;
            if (buyPrice < TRADING_CONFIG.MIN_ITEM_VALUE) return null;
            if (!isProfitableSell(buyPrice, sellPrice)) return null;

            const itemLimit = getItemLimit(id, mapEntry);
            const limitRemaining = itemLimit - (recentlyBoughtMap.get(id) || 0);

            if (limitRemaining <= 0) return null;

            const quantity = calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining);
            if (quantity <= 0) return null;

            const profit = Math.floor(sellPrice * (1 - TRADING_CONFIG.GE_TAX_RATE)) - buyPrice;
            const potentialHourlyProfit = profit * hourlyVolume;

            return {
                id,
                name: mapEntry.name,
                price: buyPrice,
                quantity,
                profit,
                hourlyVolume,
                potentialHourlyProfit,
            };
        } catch (error) {
            if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
                console.log(`[DEBUG] F2P: CRITICAL ERROR processing item ${id}:`, error.stack);
            }
            return null;
        }
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean);
}

// --- MAIN F2P SCRIPT LOGIC ---
async function getF2pSuggestion(userState, db, displayName) {
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] F2P: Starting getF2pSuggestion');
        console.log(`[DEBUG] F2P: Using pricing windows: Buy=${TRADING_HELPERS.getBuyWindowDescription()}, Sell=${TRADING_HELPERS.getSellWindowDescription()}`);
    }

    if (!userState || !db) {
        console.log('[DEBUG] F2P: No userState or db connection.');
        return { type: 'wait' };
    }

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData || !marketData.mapping) {
        console.log('[DEBUG] F2P: Waiting for market data fetch to complete...');
        return { type: 'wait' };
    }

    const { inventory = [], offers = [] } = userState;
    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));

    // --- STEP 1: Collect Completed Offers ---
    const completedIndex = offers.findIndex(o => ['completed','partial'].includes(o.status) && o.collected_amount > 0);
    if (completedIndex !== -1) {
        const offer = offers[completedIndex];
        return { type: 'collect', slot: completedIndex, offer_slot: offer.slot, item_id: offer.item_id };
    }

    // --- STEP 2: Sell Inventory ---
    for (const item of inventory) {
        if (item.id === 995 || activeOfferItemIds.has(item.id) || item.amount <= 0) continue;
        const mapEntry = marketData.mapping.find(m => m.id === item.id);
        if (!isValidItem(mapEntry)) continue;

        const ts = await wikiApi.fetchTimeseriesForItem(item.id);
        if (!ts) continue;

        const priceData = getPricesFromSnapshots(ts);
        if (!priceData) continue;

        const sellPrice = priceData.opportunitySellPrice ? Math.floor(priceData.opportunitySellPrice) - 1 : Math.floor(priceData.avgHigh) - 1;
        return { type: 'sell', item_id: item.id, name: mapEntry.name, price: sellPrice, quantity: item.amount };
    }

    // --- STEP 3: Check for GE Slots and Cash ---
    const emptySlots = offers.filter(o => o.status === 'empty');
    if (!emptySlots.length) {
        console.log('[DEBUG] F2P: No empty slots available');
        return { type: 'wait' };
    }

    const cashAmount = inventory.find(i => i.id === 995)?.amount || 0;
    if (cashAmount < TRADING_CONFIG.MIN_CASH_PER_SLOT) {
        console.log(`[DEBUG] F2P: Insufficient cash: ${cashAmount} (need at least ${TRADING_CONFIG.MIN_CASH_PER_SLOT})`);
        return { type: 'wait' };
    }
    const cashPerSlot = Math.floor(cashAmount / emptySlots.length);

    // --- STEP 4: Get Buy Limits & Active Slot Counts ---
    const recentlyBoughtMap = await getRecentlyBoughtQuantities(db, displayName);

    let lowVolumeActiveCount = 0;
    for (const offer of offers.filter(o => o.status !== 'empty' && o.buy_sell === 'buy')) {
        const ts = await wikiApi.fetchTimeseriesForItem(offer.item_id);
        const hourlyVolume = getHourlyVolume(ts);
        if (hourlyVolume && hourlyVolume < TRADING_CONFIG.HIGH_VOLUME_THRESHOLD) {
            lowVolumeActiveCount++;
        }
    }

    // --- STEP 5: Check Low Volume Slot Limit ---
    if (lowVolumeActiveCount >= TRADING_CONFIG.MAX_LOW_VOLUME_ACTIVE) {
        console.log(`[DEBUG] F2P: Too many low-volume items active (${lowVolumeActiveCount}). Waiting.`);
        return { type: 'wait' };
    }

    // --- STEP 6: Find a Profitable F2P Flip (Two-Phase Scan) ---
    // Prioritize staple F2P items for a quick check
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] F2P: Starting staple item scan...');
    }
    let profitableFlips = await analyzeItemBatch(Array.from(F2P_STAPLE_ITEMS), cashPerSlot, recentlyBoughtMap, marketData, activeOfferItemIds);

    // If no staple items are profitable, expand the search to all F2P items
    if (profitableFlips.length === 0) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('[DEBUG] F2P: No staple items found, expanding search to all F2P items...');
        }
        const allF2pItemIds = Array.from(F2P_ITEM_IDS);
        // Batch processing to avoid timeouts
        for (let i = 0; i < allF2pItemIds.length; i += TRADING_CONFIG.PARALLEL_BATCH_SIZE) {
            const batchIds = allF2pItemIds.slice(i, i + TRADING_CONFIG.PARALLEL_BATCH_SIZE);
            const batchResults = await analyzeItemBatch(batchIds, cashPerSlot, recentlyBoughtMap, marketData, activeOfferItemIds);
            profitableFlips.push(...batchResults);
            // If we find a good flip, we can stop early to be faster
            if (profitableFlips.length > 0) break;
        }
    }

    if (profitableFlips.length === 0) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('[DEBUG] F2P: No profitable flips found after full scan.');
        }
        return { type: 'wait' };
    }

    // Sort by the most promising flip
    profitableFlips.sort(sortByQuickFlipScore);
    const bestFlip = profitableFlips[0];

    // --- STEP 7: Return the Best Suggestion ---
    return {
        type: 'buy',
        item_id: bestFlip.id,
        name: bestFlip.name,
        price: bestFlip.price,
        quantity: bestFlip.quantity,
        reason: `F2P Flip. Potential hourly profit: ${bestFlip.potentialHourlyProfit.toLocaleString()}gp. Volume: ${bestFlip.hourlyVolume.toLocaleString()}/hr.`
    };
}

module.exports = {
    getF2pSuggestion,
};