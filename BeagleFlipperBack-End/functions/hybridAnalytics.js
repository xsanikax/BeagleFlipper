/**
 * hybridAnalytics.js - DEFINITIVE PARALLEL PROCESSING VERSION
 * This version preserves the full-length original code structure. It solves the timeout errors
 * by fetching item data in parallel batches, which is significantly faster. It prioritizes
 * a small list of "staple" items first before proceeding to a full scan.
 *
 * Updated to use centralized trading configuration.
 */

const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const {
    TRADING_CONFIG,
    TRADING_HELPERS,
    TARGET_COMMODITIES,
    STABLE_ITEMS,
    STAPLE_ITEMS
} = require('./tradingConfig');

// --- UTILITY FUNCTIONS ---

// Get prices from timeseries snapshots with separate windows for buy and sell
function getPricesFromSnapshots(timeseries) {
    if (!timeseries) {
        return null;
    }

    // Check if we have enough data for both windows
    const maxWindow = Math.max(TRADING_CONFIG.BUY_SNAPSHOT_WINDOW, TRADING_CONFIG.SELL_SNAPSHOT_WINDOW);
    if (timeseries.length < maxWindow) {
        return null;
    }

    // Get buy pricing window (configured window for buy decisions)
    const buyPricingWindow = timeseries.slice(-TRADING_CONFIG.BUY_SNAPSHOT_WINDOW);
    const buyLows = buyPricingWindow.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));

    // Get sell pricing window (configured window for sell price analysis)
    const sellPricingWindow = timeseries.slice(-TRADING_CONFIG.SELL_SNAPSHOT_WINDOW);
    const sellHighs = sellPricingWindow.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

    if (!buyLows.length || !sellHighs.length) {
        return null;
    }

    const floorPrice = Math.min(...buyLows);
    const ceilingPrice = Math.max(...sellHighs);

    // VOLATILITY DETECTION: Check for dramatic price drops/spikes for opportunity trading
    let opportunityBuyPrice = null;
    let opportunitySellPrice = null;

    if (timeseries.length >= TRADING_CONFIG.SELL_SNAPSHOT_WINDOW + TRADING_CONFIG.OPPORTUNITY_WINDOW) {
        // Get recent snapshots for current conditions
        const recentSnapshots = timeseries.slice(-TRADING_CONFIG.OPPORTUNITY_WINDOW);
        const recentLows = recentSnapshots.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));
        const recentHighs = recentSnapshots.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

        if (recentLows.length && recentHighs.length) {
            const currentLow = Math.min(...recentLows);
            const currentHigh = Math.max(...recentHighs);

            // Check for dramatic price drop (buy opportunity)
            const dropPercentage = (floorPrice - currentLow) / floorPrice;
            if (dropPercentage >= TRADING_CONFIG.VOLATILITY_THRESHOLD) {
                opportunityBuyPrice = currentLow;
                console.log(`[VOLATILITY] Detected ${(dropPercentage * 100).toFixed(1)}% price drop! Using opportunity buy price: ${currentLow} vs average: ${floorPrice} (${TRADING_HELPERS.getOpportunityWindowDescription()} window)`);
            }

            // Check for dramatic price spike (sell opportunity)
            const spikePercentage = (currentHigh - ceilingPrice) / ceilingPrice;
            if (spikePercentage >= TRADING_CONFIG.VOLATILITY_THRESHOLD) {
                opportunitySellPrice = currentHigh;
                console.log(`[VOLATILITY] Detected ${(spikePercentage * 100).toFixed(1)}% price spike! Using opportunity sell price: ${currentHigh} vs average: ${ceilingPrice} (${TRADING_HELPERS.getOpportunityWindowDescription()} window)`);
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

// Get volume from timeseries data
function getHourlyVolume(timeseries) {
    if (!timeseries || timeseries.length === 0) return null;
    const latestPoint = timeseries[timeseries.length - 1];
    if (latestPoint && typeof latestPoint.highPriceVolume === 'number' && typeof latestPoint.lowPriceVolume === 'number') {
        const fiveMinTotal = latestPoint.highPriceVolume + latestPoint.lowPriceVolume;
        return fiveMinTotal * 12; // Total items traded in 5 mins * 12 = hourly
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
    // Base score is the hourly profit potential
    let score = flip.potentialHourlyProfit;

    // Boost score for high-volume items (they trade faster)
    if (flip.hourlyVolume >= TRADING_CONFIG.HIGH_VOLUME_THRESHOLD) {
        score *= TRADING_CONFIG.HIGH_VOLUME_SCORE_MULTIPLIER;
    }

    // Extra boost for very high volume (ultra-fast trades)
    if (flip.hourlyVolume >= TRADING_CONFIG.HIGH_VOLUME_THRESHOLD * 3) {
        score *= TRADING_CONFIG.VERY_HIGH_VOLUME_SCORE_MULTIPLIER;
    }

    // Boost score for higher profit margins (more attractive to other traders)
    const profitMargin = flip.profit / flip.price;
    if (profitMargin > 0.1) { // 10%+ margin
        score *= TRADING_CONFIG.HIGH_MARGIN_SCORE_MULTIPLIER;
    } else if (profitMargin > 0.05) { // 5-10% margin
        score *= TRADING_CONFIG.MID_MARGIN_SCORE_MULTIPLIER;
    }

    // Slight penalty for very expensive items (harder to fill large quantities quickly)
    if (flip.price > TRADING_CONFIG.MAX_PRICE_PER_ITEM) {
        score *= TRADING_CONFIG.EXPENSIVE_ITEM_PENALTY;
    }

    return score;
}

function sortByQuickFlipScore(a, b) {
    return calculateQuickFlipScore(b) - calculateQuickFlipScore(a);
}

function sortByPotentialProfitDesc(a, b) {
    return b.potentialHourlyProfit - a.potentialHourlyProfit;
}

function isValidItem(item) {
    return item &&
           item.tradeable_on_ge !== false &&
           item.name &&
           item.limit > 0;
}

/**
 * Gets the appropriate limit for an item, preferring TARGET_COMMODITIES config over API data
 */
function getItemLimit(id, mapEntry) {
    const targetItem = TARGET_COMMODITIES[id];
    if (targetItem && targetItem.limit) {
        return targetItem.limit;
    }
    return mapEntry.limit;
}

/**
 * Gets the priority for an item from TARGET_COMMODITIES config
 */
function getItemPriority(id) {
    const targetItem = TARGET_COMMODITIES[id];
    return targetItem ? targetItem.priority : 1;
}

/**
 * NEW: Fetches and analyzes a batch of items in parallel to significantly speed up the process.
 * @returns An array of profitable flip objects.
 */
async function analyzeItemBatch(ids, cashPerSlot, recentlyBoughtMap, marketData, activeOfferItemIds) {
    const promises = ids.map(async (id) => {
        try {
            // --- FIX: Check if there's already an active offer for this item ---
            if (activeOfferItemIds && activeOfferItemIds.has(id)) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] Item ${id} REJECTED: Already has an active offer.`);
                }
                return null;
            }
            // --- END FIX ---

            const mapEntry = marketData.mapping.find(m => m.id === id);
            if (!isValidItem(mapEntry)) return null;

            const ts = await wikiApi.fetchTimeseriesForItem(id);
            if (!ts) return null;

            const priceData = getPricesFromSnapshots(ts);
            if (!priceData) return null;

            const hourlyVolume = getHourlyVolume(ts);
            if (!hourlyVolume) return null;

            // Use opportunity pricing if volatility detected, otherwise use normal pricing
            const buyPrice = priceData.opportunityBuyPrice
                ? Math.floor(priceData.opportunityBuyPrice) + 1
                : Math.floor(priceData.avgLow) + 1;

            const sellPrice = priceData.opportunitySellPrice
                ? Math.floor(priceData.opportunitySellPrice) - 1
                : Math.floor(priceData.avgHigh);

            if (buyPrice > cashPerSlot) return null;
            if (buyPrice < TRADING_CONFIG.MIN_ITEM_VALUE) return null;
            if (!isProfitableSell(buyPrice, sellPrice)) return null;

            // Use configured limit if available, otherwise use API limit
            const itemLimit = getItemLimit(id, mapEntry);
            const limitRemaining = itemLimit - (recentlyBoughtMap.get(id) || 0);

            if (limitRemaining <= 0) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] Item ${id} (${mapEntry.name}) REJECTED: Buy limit of ${itemLimit} reached (already bought ${recentlyBoughtMap.get(id) || 0}).`);
                }
                return null;
            }

            const quantity = calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining);
            if (quantity <= 0) return null;

            const profit = Math.floor(sellPrice * (1 - TRADING_CONFIG.GE_TAX_RATE)) - buyPrice;
            const potentialHourlyProfit = profit * hourlyVolume;
            const priority = getItemPriority(id);

            return {
                id,
                name: mapEntry.name,
                price: buyPrice,
                quantity,
                profit,
                hourlyVolume,
                potentialHourlyProfit,
                priority
            };
        } catch (error) {
            if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
                console.log(`[DEBUG] CRITICAL ERROR processing item ${id}:`, error.stack);
            }
            return null;
        }
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean); // Filter out any null results
}

/**
 * Fetches a manual price suggestion for a given item ID and type (buy/sell).
 * @param {number} itemId The ID of the item.
 * @param {string} type The type of suggestion ('buy' or 'sell').
 * @returns {object} A suggestion object with the price.
 */
async function getPriceSuggestion(itemId, type) {
    if (!itemId || !['buy', 'sell'].includes(type)) {
        return { error: 'Invalid itemId or type provided.' };
    }

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    const mapEntry = marketData.mapping.find(m => m.id === itemId);
    if (!isValidItem(mapEntry)) {
        return { error: 'Item not found or is not tradeable.' };
    }

    const ts = await wikiApi.fetchTimeseriesForItem(itemId);
    if (!ts) {
        return { error: 'Could not fetch price data for this item.' };
    }

    const priceData = getPricesFromSnapshots(ts);
    if (!priceData) {
        return { error: 'Not enough price data to form a suggestion.' };
    }

    let price;
    if (type === 'buy') {
        price = priceData.opportunityBuyPrice
            ? Math.floor(priceData.opportunityBuyPrice) + 1
            : Math.floor(priceData.avgLow) + 1;
    } else { // type === 'sell'
        price = priceData.opportunitySellPrice
            ? Math.floor(priceData.opportunitySellPrice) - 1
            : Math.floor(priceData.avgHigh) - 1;
    }

    return {
        itemId,
        name: mapEntry.name,
        type,
        suggestedPrice: price
    };
}


// --- MAIN SCRIPT LOGIC ---
async function getHybridSuggestion(userState, db, displayName) {
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] Starting getHybridSuggestion');
        console.log(`[DEBUG] Using pricing windows: Buy=${TRADING_HELPERS.getBuyWindowDescription()}, Sell=${TRADING_HELPERS.getSellWindowDescription()}`);
    }

    if (!userState || !db) {
        console.log('[DEBUG] No userState or db connection.');
        return { type: 'wait' };
    }

    // Use simple in-memory cache to prevent re-fetching the main mapping on every quick tick.
    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData || !marketData.mapping) {
        console.log('[DEBUG] Waiting for market data fetch to complete...');
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

        // Use opportunity pricing for sells if available, otherwise normal pricing
        const sellPrice = priceData.opportunitySellPrice
            ? Math.floor(priceData.opportunitySellPrice) - 1
            : Math.floor(priceData.avgHigh) - 1;
        return { type: 'sell', item_id: item.id, name: mapEntry.name, price: sellPrice, quantity: item.amount };
    }

    // --- STEP 3: Check for GE Slots and Cash ---
    const emptySlots = offers.filter(o => o.status === 'empty');
    if (!emptySlots.length) {
        console.log('[DEBUG] No empty slots available');
        return { type: 'wait' };
    }

    const cashAmount = inventory.find(i => i.id === 995)?.amount || 0;
    if (cashAmount < TRADING_CONFIG.MIN_CASH_PER_SLOT) {
        console.log(`[DEBUG] Insufficient cash: ${cashAmount} (need at least ${TRADING_CONFIG.MIN_CASH_PER_SLOT})`);
        return { type: 'wait' };
    }
    const cashPerSlot = Math.floor(cashAmount / emptySlots.length);

    // --- STEP 4: Get Buy Limits & Active Slot Counts ---
    const recentlyBoughtMap = await getRecentlyBoughtQuantities(db, displayName);

    let lowVolumeActiveCount = 0;
    // This loop is slow but necessary for accurate slot management.
    for (const offer of offers.filter(o => o.status !== 'empty' && o.buy_sell === 'buy')) {
        const ts = await wikiApi.fetchTimeseriesForItem(offer.item_id);
        const hourlyVolume = getHourlyVolume(ts);
        if (hourlyVolume && hourlyVolume < TRADING_CONFIG.HIGH_VOLUME_THRESHOLD) {
            lowVolumeActiveCount++;
        }
    }

    // --- STEP 5: Check Low Volume Slot Limit ---
    if (lowVolumeActiveCount >= TRADING_CONFIG.MAX_LOW_VOLUME_ACTIVE) {
        console.log(`[DEBUG] Too many low-volume items active (${lowVolumeActiveCount}). Waiting.`);
        return { type: 'wait' };
    }

    // --- STEP 6: Find a Profitable Flip ---
    // Prioritize staple items for a quick check
    let profitableFlips = await analyzeItemBatch(Array.from(STAPLE_ITEMS), cashPerSlot, recentlyBoughtMap, marketData, activeOfferItemIds);

    // If no staple items are profitable, expand the search
    if (profitableFlips.length === 0) {
        console.log('[DEBUG] No staple items found, expanding search to target commodities...');
        const allItemIds = Object.keys(TARGET_COMMODITIES).map(Number);
        // Batch processing to avoid timeouts
        for (let i = 0; i < allItemIds.length; i += TRADING_CONFIG.PARALLEL_BATCH_SIZE) {
            const batchIds = allItemIds.slice(i, i + TRADING_CONFIG.PARALLEL_BATCH_SIZE);
            const batchResults = await analyzeItemBatch(batchIds, cashPerSlot, recentlyBoughtMap, marketData, activeOfferItemIds);
            profitableFlips.push(...batchResults);
            // If we find a good flip, we can stop early to be faster
            if (profitableFlips.length > 0) break;
        }
    }

    if (profitableFlips.length === 0) {
        console.log('[DEBUG] No profitable flips found after full scan.');
        return { type: 'wait' };
    }

    // Sort by the most promising flip◙
    profitableFlips.sort(sortByQuickFlipScore);
    const bestFlip = profitableFlips[0];

    // --- STEP 7: Return the Best Suggestion ---
    return {
        type: 'buy',
        item_id: bestFlip.id,
        name: bestFlip.name,
        price: bestFlip.price,
        quantity: bestFlip.quantity,
        reason: `Potential hourly profit: ${bestFlip.potentialHourlyProfit.toLocaleString()}gp. Volume: ${bestFlip.hourlyVolume.toLocaleString()}/hr.`
    };
}

// --- FIX: EXPORT THE FUNCTIONS ---
module.exports = {
    getHybridSuggestion,
    getPriceSuggestion,
};