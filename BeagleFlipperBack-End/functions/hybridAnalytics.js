/**
 * hybridAnalytics.js - UPDATED TO USE CENTRALIZED CONFIG
 * This version now imports all configuration and utility functions from tradingConfig.js
 * to eliminate duplication and ensure consistency across the application.
 */

const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');

// Import everything from the centralized config
const {
    TRADING_CONFIG,
    STAPLE_ITEMS,
    TARGET_COMMODITIES,
    getPricesFromSnapshots,
    getHourlyVolume,
    isProfitableSell,
    calcMaxBuyQuantity,
    sortByPotentialProfitDesc,
    isValidItem,
    getActiveItemList
} = require('./tradingConfig');

/**
 * NEW: Fetches and analyzes a batch of items in parallel to significantly speed up the process.
 * @returns An array of profitable flip objects.
 */
async function analyzeItemBatch(ids, cashPerSlot, recentlyBoughtMap, marketData) {
    const promises = ids.map(async (id) => {
        try {
            const mapEntry = marketData.mapping.find(m => m.id === id);
            if (!isValidItem(mapEntry)) return null;

            const ts = await wikiApi.fetchTimeseriesForItem(id);
            if (!ts) return null;

            const priceData = getPricesFromSnapshots(ts, TRADING_CONFIG);
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
            if (!isProfitableSell(buyPrice, sellPrice, TRADING_CONFIG)) return null;

            const limitRemaining = mapEntry.limit - (recentlyBoughtMap.get(id) || 0);
            if (limitRemaining <= 0) {
                if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
                    console.log(`[DEBUG] Item ${id} (${mapEntry.name}) REJECTED: Buy limit of ${mapEntry.limit} reached (already bought ${recentlyBoughtMap.get(id) || 0}).`);
                }
                return null;
            }

            const quantity = calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining);
            if (quantity <= 0) return null;

            const profit = Math.floor(sellPrice * (1 - TRADING_CONFIG.TAX_RATE)) - buyPrice;
            const potentialHourlyProfit = profit * hourlyVolume;

            return { id, name: mapEntry.name, price: buyPrice, quantity, profit, hourlyVolume, potentialHourlyProfit };
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

// --- MAIN SCRIPT LOGIC ---
async function getHybridSuggestion(userState, db, displayName) {
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] Starting getHybridSuggestion');
    }

    if (!userState || !db) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('[DEBUG] No userState or db connection.');
        }
        return { type: 'wait' };
    }

    // Use simple in-memory cache to prevent re-fetching the main mapping on every quick tick.
    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData || !marketData.mapping) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('[DEBUG] Waiting for market data fetch to complete...');
        }
        return { type: 'wait' };
    }

    const { inventory = [], offers = [] } = userState;
    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));

    // --- STEP 1: Collect Completed Offers ---
    const completedIndex = offers.findIndex(o => ['completed','partial'].includes(o.status) && o.collected_amount > 0);
    if (completedIndex !== -1) {
        // Return a complete suggestion object with empty strings for unused fields.
        // This prevents the front-end from displaying "null".
        return {
            type: 'collect',
            name: '', // Provide an empty name
            message: '', // Provide an empty message
            price: 0,
            quantity: 0
        };
    }

    // --- STEP 2: Sell Inventory (Skip if in SELL_ONLY_MODE is false) ---
    if (!TRADING_CONFIG.SELL_ONLY_MODE) {
        for (const item of inventory) {
            if (item.id === 995 || activeOfferItemIds.has(item.id) || item.amount <= 0) continue;
            const mapEntry = marketData.mapping.find(m => m.id === item.id);
            if (!isValidItem(mapEntry)) continue;

            const ts = await wikiApi.fetchTimeseriesForItem(item.id);
            if (!ts) continue;

            const priceData = getPricesFromSnapshots(ts, TRADING_CONFIG);
            if (!priceData) continue;

            // Use opportunity pricing for sells if available, otherwise normal pricing
            const sellPrice = priceData.opportunitySellPrice
                ? Math.floor(priceData.opportunitySellPrice) - 1
                : Math.floor(priceData.avgHigh) - 1;
            return { type: 'sell', item_id: item.id, name: mapEntry.name, price: sellPrice, quantity: item.amount };
        }
    }

    // --- STEP 3: Check for GE Slots and Cash ---
    const emptySlots = offers.filter(o => o.status === 'empty');
    if (!emptySlots.length) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('[DEBUG] No empty slots available');
        }
        return { type: 'wait' };
    }

    const cashAmount = inventory.find(i => i.id === 995)?.amount || 0;
    if (cashAmount < TRADING_CONFIG.MIN_CASH_TOTAL) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log(`[DEBUG] Insufficient cash: ${cashAmount} (minimum required: ${TRADING_CONFIG.MIN_CASH_TOTAL})`);
        }
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

    // --- STEP 5: PRIORITY SCAN (STAPLES-FIRST) using Parallel Processing ---
    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] Starting Priority Scan on staple items.');
    }

    // Get the appropriate item list based on F2P mode
    const activeItemList = getActiveItemList(TRADING_CONFIG);
    const notActiveStaples = Array.from(activeItemList).filter(id => !activeOfferItemIds.has(id));

    if (notActiveStaples.length > 0) {
        const stapleFlips = await analyzeItemBatch(notActiveStaples, cashPerSlot, recentlyBoughtMap, marketData);
        if (stapleFlips.length > 0) {
            const highVolStaples = stapleFlips.filter(flip => flip.hourlyVolume >= TRADING_CONFIG.HIGH_VOLUME_THRESHOLD);
            if (highVolStaples.length > 0) {
                highVolStaples.sort(sortByPotentialProfitDesc);
                const best = highVolStaples[0];
                if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
                    console.log(`[DEBUG] PRIORITY SUCCESS: Found staple flip for ${best.name}.`);
                }
                return { type: 'buy', item_id: best.id, name: best.name, price: best.price, quantity: best.quantity };
            }
        }
    }

    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] Priority Scan Complete: No profitable staple items found. Proceeding to full scan.');
    }

    // --- STEP 6: FULL SCAN (FALLBACK) using Parallel Processing ---
    const notActiveGeneral = Array.from(TARGET_COMMODITIES).filter(id => !activeOfferItemIds.has(id) && !activeItemList.has(id));
    const flipsHighVol = [];
    const flipsLowVol = [];

    for (let i = 0; i < notActiveGeneral.length; i += TRADING_CONFIG.BATCH_SIZE) {
        const batch = notActiveGeneral.slice(i, i + TRADING_CONFIG.BATCH_SIZE);
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log(`[DEBUG] Processing full scan batch ${Math.floor(i/TRADING_CONFIG.BATCH_SIZE) + 1}/${Math.ceil(notActiveGeneral.length/TRADING_CONFIG.BATCH_SIZE)}`);
        }

        const batchResults = await analyzeItemBatch(batch, cashPerSlot, recentlyBoughtMap, marketData);
        for (const flip of batchResults) {
            if (flip.hourlyVolume >= TRADING_CONFIG.HIGH_VOLUME_THRESHOLD) {
                flipsHighVol.push(flip);
            } else if (flip.hourlyVolume >= TRADING_CONFIG.LOW_VOLUME_THRESHOLD) {
                flipsLowVol.push(flip);
            }
        }
    }

    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log(`[DEBUG] Full Scan Complete: Found ${flipsHighVol.length} high volume flips, ${flipsLowVol.length} low volume flips`);
    }

    flipsHighVol.sort(sortByPotentialProfitDesc);
    flipsLowVol.sort(sortByPotentialProfitDesc);

    if (flipsHighVol.length) {
        const best = flipsHighVol[0];
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log(`[DEBUG] Top high volume flip from full scan: ${best.name}`);
        }
        return { type: 'buy', item_id: best.id, name: best.name, price: best.price, quantity: best.quantity };
    }

    if (flipsLowVol.length && lowVolumeActiveCount < TRADING_CONFIG.MAX_LOW_VOLUME_ACTIVE) {
        const bestLow = flipsLowVol[0];
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log(`[DEBUG] Top low volume flip from full scan: ${bestLow.name}`);
        }
        return { type: 'buy', item_id: bestLow.id, name: bestLow.name, price: bestLow.price, quantity: bestLow.quantity };
    }

    if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('[DEBUG] No valid flips found in any category. Waiting.');
    }
    return { type: 'wait' };
}

module.exports = {
    getHybridSuggestion,
};