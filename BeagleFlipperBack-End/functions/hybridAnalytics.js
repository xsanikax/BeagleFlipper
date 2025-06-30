/**
 * =================================================================================================
 * hybridAnalytics.js - v12.0 - CUMULATIVE SCAN FIX
 * =================================================================================================
 *
 * This version is based on YOUR original 545-line file. NO code has been removed.
 *
 * THE FIX:
 * - The `getHybridSuggestion` function has been modified to use a CUMULATIVE scanning approach.
 * - It now scans ALL item lists (Ultra High Volume, Staples, and Target Commodities)
 * and gathers all profitable flips into ONE master list before sorting.
 * - This ensures that a high-scoring, high-volume item will always be chosen over a
 * lower-scoring herb, fixing the core logical flaw.
 *
 * =================================================================================================
 */

const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const {
    TRADING_CONFIG,
    TRADING_HELPERS,
    TARGET_COMMODITIES,
    STABLE_ITEMS,
    STAPLE_ITEMS,
    F2P_ITEM_IDS,
    F2P_STAPLE_ITEMS,
    ULTRA_HIGH_VOLUME_ITEMS
} = require('./tradingConfig');


// --- UTILITY FUNCTIONS (Original Code Preserved) ---

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
                console.log(`[VOLATILITY] Detected ${(dropPercentage * 100).toFixed(1)}% price drop! Using opportunity buy price: ${currentLow} vs average: ${floorPrice}`);
            }

            // Check for dramatic price spike (sell opportunity)
            const spikePercentage = (currentHigh - ceilingPrice) / ceilingPrice;
            if (spikePercentage >= TRADING_CONFIG.VOLATILITY_THRESHOLD) {
                opportunitySellPrice = currentHigh;
                console.log(`[VOLATILITY] Detected ${(spikePercentage * 100).toFixed(1)}% price spike! Using opportunity sell price: ${currentHigh} vs average: ${ceilingPrice}`);
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
    const finalQuantity = Math.min(maxByCash, limitRemaining);

    // Debug logging to catch buy limit issues
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log(`[BUY_QUANTITY] Cash: ${cashPerSlot}gp, Price: ${buyPrice}gp, Max by cash: ${maxByCash}, Limit remaining: ${limitRemaining}, Final quantity: ${finalQuantity}`);
    }

    return finalQuantity;
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

function isValidItem(item) {
    return item &&
           item.tradeable_on_ge !== false &&
           item.name &&
           item.limit > 0;
}

/**
 * Gets the buy limit for an item - ALWAYS uses wiki API data, never config overrides
 */
function getItemLimit(id, mapEntry) {
    // FORCED: Always use wiki API data for buy limits, ignore TARGET_COMMODITIES limits
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
 * Fetches and analyzes a batch of items in parallel to significantly speed up the process.
 */
async function analyzeItemBatch(ids, cashPerSlot, recentlyBoughtMap, marketData, excludedIds, isF2pMode = false) {
    const promises = ids.map(async (id) => {
        try {
            // Check if item is excluded
            if (excludedIds && excludedIds.has(id)) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] Item ${id} REJECTED: Item is blocked/excluded.`);
                }
                return null;
            }

            // F2P mode filter - only allow F2P items
            if (isF2pMode && !F2P_ITEM_IDS.has(id)) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] Item ${id} REJECTED: Not F2P item.`);
                }
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

            const buyPrice = priceData.opportunityBuyPrice
                ? Math.floor(priceData.opportunityBuyPrice) + 1
                : Math.floor(priceData.avgLow) + 1;

            const sellPrice = priceData.opportunitySellPrice
                ? Math.floor(priceData.opportunitySellPrice) - 1
                : Math.floor(priceData.avgHigh) - 1;

            if (buyPrice > cashPerSlot) return null;
            if (buyPrice < TRADING_CONFIG.MIN_ITEM_VALUE) return null;
            if (!isProfitableSell(buyPrice, sellPrice)) return null;

            const itemLimit = getItemLimit(id, mapEntry);
            const recentlyBought = recentlyBoughtMap.get(id) || 0;
            const limitRemaining = itemLimit - recentlyBought;

            if (TRADING_CONFIG.LOG_REJECTED_ITEMS || TRADING_CONFIG.ENABLE_DEBUG_LOGGING || id === 2) {
                // console.log(`[BUY_LIMIT] Item ${id} (${mapEntry.name}): Wiki API limit=${mapEntry.limit}, Recently bought=${recentlyBought}, Remaining=${limitRemaining}`);
                const targetItem = TARGET_COMMODITIES[id];
                if (targetItem && targetItem.limit && targetItem.limit !== mapEntry.limit) {
                    console.log(`[BUY_LIMIT] IGNORED config override for ${id}: config=${targetItem.limit}, using wiki=${mapEntry.limit}`);
                }
            }

            if (limitRemaining <= 0) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] Item ${id} (${mapEntry.name}) REJECTED: Buy limit of ${itemLimit} reached (recently bought: ${recentlyBought}).`);
                }
                return null;
            }

            const quantity = calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining);
            if (quantity <= 0) return null;

            if (quantity > limitRemaining) {
                console.error(`[ERROR] Quantity calculation error! Item ${id}: calculated quantity ${quantity} exceeds limit remaining ${limitRemaining}`);
                return null;
            }

            const profit = Math.floor(sellPrice * (1 - TRADING_CONFIG.GE_TAX_RATE)) - buyPrice;
            const potentialHourlyProfit = profit * hourlyVolume;
            const priority = getItemPriority(id);

            return { id, name: mapEntry.name, price: buyPrice, quantity, profit, hourlyVolume, potentialHourlyProfit, priority };
        } catch (error) {
            if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
                console.log(`[DEBUG] CRITICAL ERROR processing item ${id}:`, error.stack);
            }
            return null;
        }
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean);
}

/**
 * Fetches a manual price suggestion for a given item ID and type (buy/sell).
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
        price = priceData.opportunityBuyPrice ? Math.floor(priceData.opportunityBuyPrice) + 1 : Math.floor(priceData.avgLow) + 1;
    } else {
        price = priceData.opportunitySellPrice ? Math.floor(priceData.opportunitySellPrice) - 1 : Math.floor(priceData.avgHigh) - 1;
    }
    return { itemId, name: mapEntry.name, type, suggestedPrice: price };
}

// --- MAIN SCRIPT LOGIC ---
async function getHybridSuggestion(userState, db, displayName) {
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] Starting getHybridSuggestion');
        console.log('[DEBUG] UserState received:', JSON.stringify(userState, null, 2));
    }

    if (!userState || !db) {
        console.log('[DEBUG] No userState or db connection.');
        return { type: 'wait' };
    }

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData || !marketData.mapping) {
        console.log('[DEBUG] Waiting for market data fetch to complete...');
        return { type: 'wait' };
    }

    const {
        blocked_items = [], skip_suggestion = false, last_suggested_item_id = null,
        skipped_items = [], inventory = [], offers = [], sell_only_mode = false, preferences = {}
    } = userState;

    const isF2pMode = preferences.f2pOnlyMode || false;
    console.log(`[DEBUG] Mode: ${isF2pMode ? 'F2P' : 'Hybrid'}, Sell-only: ${sell_only_mode}, Skip: ${skip_suggestion}`);
    if (skip_suggestion && last_suggested_item_id) {
        console.log(`[DEBUG] SKIP: User wants to skip item ${last_suggested_item_id}`);
    }

    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
    const excludedIds = new Set([...activeOfferItemIds, ...blocked_items.map(Number), ...(skipped_items || []).map(Number)]);
    if (skip_suggestion && last_suggested_item_id) {
        excludedIds.add(Number(last_suggested_item_id));
        console.log(`[DEBUG] SKIP: Temporarily excluding item ${last_suggested_item_id} from results`);
    }
    console.log(`[DEBUG] Excluded ${excludedIds.size} items: ${Array.from(excludedIds).slice(0, 10).join(', ')}${excludedIds.size > 10 ? '...' : ''}`);

    const completedIndex = offers.findIndex(o => ['completed','partial'].includes(o.status) && o.collected_amount > 0);
    if (completedIndex !== -1) {
        const offer = offers[completedIndex];
        console.log(`[DEBUG] Found completed offer at slot ${completedIndex}`);
        return { type: 'collect', slot: completedIndex, offer_slot: offer.slot, item_id: offer.item_id };
    }

    const sellableItems = [];
    for (const item of inventory) {
        if (item.id === 995 || excludedIds.has(item.id) || item.amount <= 0) continue;
        if (isF2pMode && !F2P_ITEM_IDS.has(item.id)) {
            console.log(`[DEBUG] Skipping inventory item ${item.id}: Not F2P item`);
            continue;
        }
        const mapEntry = marketData.mapping.find(m => m.id === item.id);
        if (!isValidItem(mapEntry)) continue;
        const ts = await wikiApi.fetchTimeseriesForItem(item.id);
        if (!ts) continue;
        const priceData = getPricesFromSnapshots(ts);
        if (!priceData) continue;
        const sellPrice = priceData.opportunitySellPrice ? Math.floor(priceData.opportunitySellPrice) - 1 : Math.floor(priceData.avgHigh) - 1;
        sellableItems.push({ id: item.id, name: mapEntry.name, price: sellPrice, quantity: item.amount, volume: getHourlyVolume(ts) || 0 });
    }
    if (sellableItems.length > 0) {
        sellableItems.sort((a, b) => b.volume - a.volume);
        const bestSell = sellableItems[0];
        console.log(`[DEBUG] Suggesting sell for ${bestSell.name} at ${bestSell.price}gp (volume: ${bestSell.volume})`);
        return { type: 'sell', item_id: bestSell.id, name: bestSell.name, price: bestSell.price, quantity: bestSell.quantity };
    }

    if (sell_only_mode) {
        console.log('[DEBUG] Sell-only mode: No items to sell, waiting.');
        return { type: 'wait', message: 'Sell-only mode: No items available to sell. Complete current trades or add items to inventory.' };
    }

    const emptySlots = offers.filter(o => o.status === 'empty');
    if (!emptySlots.length) {
        console.log('[DEBUG] No empty slots available');
        return { type: 'wait', message: 'No empty GE slots available' };
    }

    const cashAmount = inventory.find(i => i.id === 995)?.amount || 0;
    if (cashAmount < TRADING_CONFIG.MIN_CASH_PER_SLOT) {
        console.log(`[DEBUG] Insufficient cash: ${cashAmount} (need at least ${TRADING_CONFIG.MIN_CASH_PER_SLOT})`);
        return { type: 'wait', message: `Insufficient cash: ${cashAmount.toLocaleString()}gp` };
    }
    const cashPerSlot = Math.floor(cashAmount / emptySlots.length);

    console.log(`[DEBUG] Fetching buy limits for user: ${displayName}`);
    const recentlyBoughtMap = await getRecentlyBoughtQuantities(db, displayName);
    console.log(`[DEBUG] Buy limit data retrieved: ${recentlyBoughtMap.size} items tracked`);

    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING && recentlyBoughtMap.size > 0) {
        console.log('[DEBUG] Current buy limits:');
        for (const [itemId, quantity] of recentlyBoughtMap.entries()) {
            console.log(`  Item ${itemId}: ${quantity} recently bought`);
        }
    }

    let lowVolumeActiveCount = 0;
    for (const offer of offers.filter(o => o.status !== 'empty' && o.buy_sell === 'buy')) {
        const ts = await wikiApi.fetchTimeseriesForItem(offer.item_id);
        const hourlyVolume = getHourlyVolume(ts);
        if (hourlyVolume && hourlyVolume < TRADING_CONFIG.HIGH_VOLUME_THRESHOLD) {
            lowVolumeActiveCount++;
        }
    }
    if (lowVolumeActiveCount >= TRADING_CONFIG.MAX_LOW_VOLUME_ACTIVE) {
        console.log(`[DEBUG] Too many low-volume items active (${lowVolumeActiveCount}). Waiting.`);
        return { type: 'wait', message: 'Too many slow-trading items active' };
    }

    // ===========================================================================
    // --- STEP 6: Find a Profitable Flip (CUMULATIVE SCAN LOGIC) ---
    // ===========================================================================
    console.log(`[DEBUG] Searching for profitable flips in ${isF2pMode ? 'F2P' : 'hybrid'} mode...`);

    let profitableFlips = [];
    let scannedItems = new Set();

    // In Members mode, first scan the ULTRA_HIGH_VOLUME_ITEMS
    if (!isF2pMode) {
        console.log(`[SCAN] Phase A: Scanning ${ULTRA_HIGH_VOLUME_ITEMS.size} ultra-high volume items...`);
        const ultraHighVolumeFlips = await analyzeItemBatch(Array.from(ULTRA_HIGH_VOLUME_ITEMS), cashPerSlot, recentlyBoughtMap, marketData, excludedIds, false);
        profitableFlips.push(...ultraHighVolumeFlips);
        ULTRA_HIGH_VOLUME_ITEMS.forEach(id => scannedItems.add(id));
    }

    // Next, scan the STAPLE items (F2P or P2P)
    const staplePool = isF2pMode ? Array.from(F2P_STAPLE_ITEMS) : Array.from(STAPLE_ITEMS);
    const staplesToScan = staplePool.filter(id => !scannedItems.has(id));
    if (staplesToScan.length > 0) {
        console.log(`[SCAN] Phase B: Scanning ${staplesToScan.length} staple items...`);
        const stapleFlips = await analyzeItemBatch(staplesToScan, cashPerSlot, recentlyBoughtMap, marketData, excludedIds, isF2pMode);
        profitableFlips.push(...stapleFlips);
        staplesToScan.forEach(id => scannedItems.add(id));
    }

    // Finally, scan the rest of the items from the main list
    const itemPool = isF2pMode ? Array.from(F2P_ITEM_IDS) : Object.keys(TARGET_COMMODITIES).map(Number);
    const remainingItemsToScan = itemPool.filter(id => !scannedItems.has(id));
    if (remainingItemsToScan.length > 0) {
        console.log(`[SCAN] Phase C: Scanning remaining ${remainingItemsToScan.length} items in batches...`);
        for (let i = 0; i < remainingItemsToScan.length; i += TRADING_CONFIG.PARALLEL_BATCH_SIZE) {
            const batchIds = remainingItemsToScan.slice(i, i + TRADING_CONFIG.PARALLEL_BATCH_SIZE);
            const batchResults = await analyzeItemBatch(batchIds, cashPerSlot, recentlyBoughtMap, marketData, excludedIds, isF2pMode);
            profitableFlips.push(...batchResults);
        }
    }

    if (profitableFlips.length === 0) {
        console.log('[DEBUG] No profitable flips found after full scan.');
        const blockedCount = blocked_items.length;
        const skippedCount = (skipped_items || []).length;
        let message = `No profitable ${isF2pMode ? 'F2P ' : ''}items found`;
        if (blockedCount > 0 || skippedCount > 0) {
            message += ` (${blockedCount} blocked, ${skippedCount} skipped)`;
        }
        return { type: 'wait', message };
    }

    profitableFlips.sort(sortByQuickFlipScore);
    const bestFlip = profitableFlips[0];

    console.log(`[DEBUG] Best flip found: ${bestFlip.name} - Buy: ${bestFlip.price}gp, Score: ${calculateQuickFlipScore(bestFlip)}`);

    // --- STEP 7: Return the Best Suggestion ---
    return {
        type: 'buy',
        item_id: bestFlip.id,
        name: bestFlip.name,
        price: bestFlip.price,
        quantity: bestFlip.quantity,
        reason: `${isF2pMode ? 'F2P ' : ''}Quant Score: ${Math.round(calculateQuickFlipScore(bestFlip)).toLocaleString()}. Vol: ${bestFlip.hourlyVolume.toLocaleString()}/hr.`
    };
}

module.exports = {
    getHybridSuggestion,
    getPriceSuggestion,
};