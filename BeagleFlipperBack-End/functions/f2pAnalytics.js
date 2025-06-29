/**
 * f2pAnalytics.js - F2P STRATEGIC PARALLEL PROCESSING VERSION WITH TOGGLE LOGIC
 * This version now properly handles the F2P toggle state and can route back to hybrid mode
 * when F2P mode is toggled off. It includes all the same user state handling as hybridAnalytics.
 * FIXED: Now properly handles blocked items exclusion, F2P mode toggle, and skip_suggestion logic
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
    F2P_STAPLE_ITEMS
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
                console.log(`[F2P VOLATILITY] Detected ${(dropPercentage * 100).toFixed(1)}% price drop! Using opportunity buy price: ${currentLow} vs average: ${floorPrice}`);
            }
            const spikePercentage = (currentHigh - ceilingPrice) / ceilingPrice;
            if (spikePercentage >= TRADING_CONFIG.VOLATILITY_THRESHOLD) {
                opportunitySellPrice = currentHigh;
                console.log(`[F2P VOLATILITY] Detected ${(spikePercentage * 100).toFixed(1)}% price spike! Using opportunity sell price: ${currentHigh} vs average: ${ceilingPrice}`);
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

// Updated to handle both F2P-only and hybrid modes based on isF2pMode flag
async function analyzeItemBatch(ids, cashPerSlot, recentlyBoughtMap, marketData, excludedIds, isF2pMode = true) {
    const promises = ids.map(async (id) => {
        try {
            // Check if item is excluded
            if (excludedIds && excludedIds.has(id)) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] ${isF2pMode ? 'F2P' : 'HYBRID'}: Item ${id} REJECTED: Item is blocked/excluded.`);
                }
                return null;
            }

            // F2P mode filter - only allow F2P items when in F2P mode
            if (isF2pMode && !F2P_ITEM_IDS.has(id)) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] F2P: Item ${id} REJECTED: Not F2P item.`);
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

            const buyPrice = priceData.opportunityBuyPrice ? Math.floor(priceData.opportunityBuyPrice) + 1 : Math.floor(priceData.avgLow) + 1;
            const sellPrice = priceData.opportunitySellPrice ? Math.floor(priceData.opportunitySellPrice) - 1 : Math.floor(priceData.avgHigh);

            if (buyPrice > cashPerSlot) return null;
            if (buyPrice < TRADING_CONFIG.MIN_ITEM_VALUE) return null;
            if (!isProfitableSell(buyPrice, sellPrice)) return null;

            const itemLimit = getItemLimit(id, mapEntry);
            const limitRemaining = itemLimit - (recentlyBoughtMap.get(id) || 0);

            if (limitRemaining <= 0) {
                if (TRADING_CONFIG.LOG_REJECTED_ITEMS) {
                    console.log(`[DEBUG] ${isF2pMode ? 'F2P' : 'HYBRID'}: Item ${id} (${mapEntry.name}) REJECTED: Buy limit of ${itemLimit} reached.`);
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
                console.log(`[DEBUG] ${isF2pMode ? 'F2P' : 'HYBRID'}: CRITICAL ERROR processing item ${id}:`, error.stack);
            }
            return null;
        }
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean);
}

// --- MAIN F2P SCRIPT LOGIC WITH TOGGLE SUPPORT ---
async function getF2pSuggestion(userState, db, displayName) {
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log(`[DEBUG] F2P: preferences.f2pOnlyMode = ${userState.preferences.f2pOnlyMode}`);
        console.log(`[DEBUG] F2P: sell_only_mode = ${userState.sell_only_mode}`);
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

    // Extract user state parameters with proper defaults
    const {
        blocked_items = [],
        skip_suggestion = false,
        inventory = [],
        offers = [],
        sell_only_mode = false,
        preferences = {}
    } = userState;

    // CHECK F2P MODE TOGGLE - This is the key addition!
    const isF2pMode = preferences.f2pOnlyMode || false;

    console.log(`[DEBUG] F2P Analytics - Mode: ${isF2pMode ? 'F2P' : 'Hybrid'}, Sell-only: ${sell_only_mode}, Skip: ${skip_suggestion}`);

    // If F2P mode is toggled OFF, we should route back to hybrid mode
    // This requires importing and calling hybridAnalytics instead
    if (!isF2pMode) {
        console.log('[DEBUG] F2P: F2P mode toggled OFF, routing to hybrid analytics');
        // Import hybridAnalytics here to avoid circular dependency
        const { getHybridSuggestion } = require('./hybridAnalytics');
        return await getHybridSuggestion(userState, db, displayName);
    }
        // ======================== STATE HANDLING FIX ========================
        // The logic is now stateless and relies entirely on the `userState` from `index.js`.
        // The `blocked_items` array passed in `userState` now correctly contains both
        // permanent blocks and the temporary item_to_skip for this single request.

        const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
        const excludedIds = new Set([...activeOfferItemIds, ...blocked_items.map(Number)]);

        console.log(`[DEBUG] F2P: Excluded ${excludedIds.size} items: ${Array.from(excludedIds).join(', ')}`);
        // ====================== END OF STATE HANDLING FIX =======================


    // --- STEP 1: Collect Completed Offers ---
    const completedIndex = offers.findIndex(o => ['completed','partial'].includes(o.status) && o.collected_amount > 0);
    if (completedIndex !== -1) {
        const offer = offers[completedIndex];
        console.log(`[DEBUG] F2P: Found completed offer at slot ${completedIndex}`);
        return { type: 'collect', slot: completedIndex, offer_slot: offer.slot, item_id: offer.item_id };
    }

    // --- STEP 2: Sell Inventory Items (F2P Only) ---
    const sellableItems = [];
    for (const item of inventory) {
        if (item.id === 995 || excludedIds.has(item.id) || item.amount <= 0) continue;

        // Skip if item is not F2P
        if (!F2P_ITEM_IDS.has(item.id)) {
            console.log(`[DEBUG] F2P: Skipping inventory item ${item.id}: Not F2P item`);
            continue;
        }

        const mapEntry = marketData.mapping.find(m => m.id === item.id);
        if (!isValidItem(mapEntry)) continue;

        const ts = await wikiApi.fetchTimeseriesForItem(item.id);
        if (!ts) continue;

        const priceData = getPricesFromSnapshots(ts);
        if (!priceData) continue;

        const sellPrice = priceData.opportunitySellPrice
            ? Math.floor(priceData.opportunitySellPrice) - 1
            : Math.floor(priceData.avgHigh) - 1;

        sellableItems.push({
            id: item.id,
            name: mapEntry.name,
            price: sellPrice,
            quantity: item.amount,
            volume: getHourlyVolume(ts) || 0
        });
    }

    // If we have sellable items, return the one with highest volume (fastest to sell)
    if (sellableItems.length > 0) {
        sellableItems.sort((a, b) => b.volume - a.volume);
        const bestSell = sellableItems[0];
        console.log(`[DEBUG] F2P: Suggesting sell for ${bestSell.name} at ${bestSell.price}gp (volume: ${bestSell.volume})`);
        return {
            type: 'sell',
            item_id: bestSell.id,
            name: bestSell.name,
            price: bestSell.price,
            quantity: bestSell.quantity
        };
    }

    // Handle sell-only mode
    if (sell_only_mode) {
        console.log('[DEBUG] F2P: Sell-only mode: No F2P items to sell, waiting.');
        return { type: 'wait', message: 'Sell-only mode: No F2P items available to sell. Complete current trades or add items to inventory.' };
    }

    // --- STEP 3: Check for GE Slots and Cash (with F2P Slot Limiter) ---
    // In F2P mode, we only want to consider the first 3 GE slots.
    const offersToConsider = isF2pMode ? offers.slice(0, 3) : offers;

    console.log(`[DEBUG] F2P: Now considering ${offersToConsider.length} GE slots.`);

    const emptySlots = offersToConsider.filter(o => o.status === 'empty');
    if (!emptySlots.length) {
        console.log('[DEBUG] F2P: No empty slots available within the considered range.');
        return { type: 'wait', message: 'No empty GE slots available' };
    }

    const cashAmount = inventory.find(i => i.id === 995)?.amount || 0;
    if (cashAmount < TRADING_CONFIG.MIN_CASH_PER_SLOT) {
        console.log(`[DEBUG] F2P: Insufficient cash: ${cashAmount} (need at least ${TRADING_CONFIG.MIN_CASH_PER_SLOT})`);
        return { type: 'wait', message: `Insufficient cash: ${cashAmount.toLocaleString()}gp` };
    }

    // The cash will now be correctly divided among the available empty slots (max 3 in F2P).
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
        return { type: 'wait', message: 'Too many slow-trading F2P items active' };
    }

    // --- STEP 6: Find a Profitable F2P Flip (Two-Phase Scan) ---
    console.log('[DEBUG] F2P: Searching for profitable F2P flips...');

    // Start with F2P staple items
    let profitableFlips = await analyzeItemBatch(Array.from(F2P_STAPLE_ITEMS), cashPerSlot, recentlyBoughtMap, marketData, excludedIds, true);

    if (profitableFlips.length === 0) {
        console.log('[DEBUG] F2P: No staple items found, expanding search to all F2P items...');

        const allF2pItemIds = Array.from(F2P_ITEM_IDS);
        for (let i = 0; i < allF2pItemIds.length; i += TRADING_CONFIG.PARALLEL_BATCH_SIZE) {
            const batchIds = allF2pItemIds.slice(i, i + TRADING_CONFIG.PARALLEL_BATCH_SIZE);
            const batchResults = await analyzeItemBatch(batchIds, cashPerSlot, recentlyBoughtMap, marketData, excludedIds, true);
            profitableFlips.push(...batchResults);
            if (profitableFlips.length > 0) break;
        }
    }

        if (profitableFlips.length === 0) {
            console.log('[DEBUG] F2P: No profitable flips found after full scan.');
            // Use the correct `blocked_items` variable from userState for the count.
            const blockedCount = blocked_items.length;
            let message = 'No profitable F2P items found';
            if (blockedCount > 0) {
                message += ` (${blockedCount} excluded)`;
            }
            return { type: 'wait', message };
        }


    profitableFlips.sort(sortByQuickFlipScore);
    const bestFlip = profitableFlips[0];

    console.log(`[DEBUG] F2P: Best flip found: ${bestFlip.name} - Buy: ${bestFlip.price}gp, Potential profit: ${bestFlip.potentialHourlyProfit}gp/hr`);

    // --- STEP 7: Return the Best F2P Suggestion ---
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