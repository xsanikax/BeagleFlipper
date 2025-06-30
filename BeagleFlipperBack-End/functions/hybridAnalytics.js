// ================================================================================= //
// ================================================================================= //
//                                                                                 //
//    ██████╗ ███████╗  █████╗  ██████╗ ██╗     ███████╗                           //
//    ██╔══██╗██╔════╝ ██╔══██╗██╔════╝ ██║     ██╔════╝                           //
//    ██████╔╝█████╗   ███████║██║  ███╗██║     █████╗                             //
//    ██╔══██╗██╔══╝   ██╔══██║██║   ██║██║     ██╔══╝                             //
//    ██████╔╝███████╗ ██║  ██║╚██████╔╝███████╗███████╗                           //
//    ╚═════╝ ╚══════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝                           //
//                                                                                 //
//    ███████╗██╗     ██╗██████╗ ██████╗ ███████╗██████╗                           //
//    ██╔════╝██║     ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗                          //
//    █████╗  ██║     ██║██████╔╝██████╔╝█████╗  ██████╔╝                          //
//    ██╔══╝  ██║     ██║██╔═══╝ ██╔═══╝ ██╔══╝  ██╔══██╗                          //
//    ██║     ███████╗██║██║     ██║     ███████╗██║  ██║                          //
//    ╚═╝     ╚══════╝╚═╝╚═╝     ╚═╝     ╚══════╝╚═╝  ╚═╝                          //
//                                                                                 //
//      TRADING ENGINE v27.0 - UPGRADED WITH ADVANCED VOLATILITY LOGIC             //
//                                                                                 //
// ================================================================================= //
// ================================================================================= //


// ================================================================================= //
// SECTION 1: IMPORTS & SETUP
// ================================================================================= //
const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const {
    TRADING_CONFIG,
    STAPLE_ITEMS_P2P,
    STAPLE_ITEMS_F2P,
} = require('./tradingConfig');


// ================================================================================= //
// SECTION 2: CORE UTILITY & ADVANCED ANALYSIS FUNCTIONS
// ================================================================================= //
// This section now includes the more advanced analysis functions from your successful old script.

/**
 * A simple check to ensure an item object from the API is valid and tradeable.
 */
function isValidItem(item) {
    return item && item.tradeable_on_ge !== false && item.name && item.limit > 0;
}

/**
 * Calculates the maximum number of an item we can buy based on our available cash
 * per slot and the item's 4-hour buy limit.
 */
function calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining) {
    if (buyPrice <= 0) {
        return 0;
    }
    const maxByCash = Math.floor(cashPerSlot / buyPrice);
    return Math.min(maxByCash, limitRemaining);
}

/**
 * UPGRADED: Gets prices from timeseries snapshots with separate windows for buy and sell,
 * and includes volatility detection, just like your successful old script.
 */
function getPricesFromSnapshots(timeseries) {
    if (!timeseries) {
        return null;
    }

    const { BUY_SNAPSHOT_WINDOW, SELL_SNAPSHOT_WINDOW, OPPORTUNITY_WINDOW, VOLATILITY_THRESHOLD } = TRADING_CONFIG;

    const maxWindow = Math.max(BUY_SNAPSHOT_WINDOW, SELL_SNAPSHOT_WINDOW);
    if (timeseries.length < maxWindow) {
        return null; // Not enough data
    }

    const buyPricingWindow = timeseries.slice(-BUY_SNAPSHOT_WINDOW);
    const buyLows = buyPricingWindow.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));

    const sellPricingWindow = timeseries.slice(-SELL_SNAPSHOT_WINDOW);
    const sellHighs = sellPricingWindow.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

    if (!buyLows.length || !sellHighs.length) {
        return null;
    }

    const floorPrice = Math.min(...buyLows);
    const ceilingPrice = Math.max(...sellHighs);

    let opportunityBuyPrice = null;
    let opportunitySellPrice = null;

    if (timeseries.length >= SELL_SNAPSHOT_WINDOW + OPPORTUNITY_WINDOW) {
        const recentSnapshots = timeseries.slice(-OPPORTUNITY_WINDOW);
        const recentLows = recentSnapshots.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));
        const recentHighs = recentSnapshots.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

        if (recentLows.length && recentHighs.length) {
            const currentLow = Math.min(...recentLows);
            const currentHigh = Math.max(...recentHighs);

            const dropPercentage = (floorPrice - currentLow) / floorPrice;
            if (dropPercentage >= VOLATILITY_THRESHOLD) {
                opportunityBuyPrice = currentLow;
                if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
                    console.log(`[VOLATILITY] Detected ${(dropPercentage * 100).toFixed(1)}% price drop on item!`);
                }
            }

            const spikePercentage = (currentHigh - ceilingPrice) / ceilingPrice;
            if (spikePercentage >= VOLATILITY_THRESHOLD) {
                opportunitySellPrice = currentHigh;
                if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
                    console.log(`[VOLATILITY] Detected ${(spikePercentage * 100).toFixed(1)}% price spike on item!`);
                }
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

/**
 * Gets the hourly volume from a timeseries dataset.
 */
function getHourlyVolume(timeseries) {
    if (!timeseries || timeseries.length === 0) return null;
    const latestPoint = timeseries[timeseries.length - 1];
    if (latestPoint && typeof latestPoint.highPriceVolume === 'number' && typeof latestPoint.lowPriceVolume === 'number') {
        const fiveMinTotal = latestPoint.highPriceVolume + latestPoint.lowPriceVolume;
        return fiveMinTotal * 12; // Estimate hourly volume
    }
    return null;
}

/**
 * Sorts by the more effective Potential Hourly Profit metric.
 */
function sortByPotentialProfitDesc(a,b) {
  return b.potentialHourlyProfit - a.potentialHourlyProfit;
}


// ================================================================================= //
// SECTION 3: THE BEAGLE FLIPPER ANALYSIS ENGINE (UPGRADED P2P)
// ================================================================================= //

function analyzeItemWithBeagleModel(id, cashPerSlot, recentlyBoughtMap, marketData, apiCache) {
    try {
        const mapEntry = marketData.mapping.find(m => m.id === id);
        if (!isValidItem(mapEntry)) return null;

        const timeseries = apiCache.get(id); // Using pre-fetched timeseries data
        if (!timeseries) return null;

        const priceData = getPricesFromSnapshots(timeseries);
        if (!priceData) return null;

        const hourlyVolume = getHourlyVolume(timeseries);
        if (!hourlyVolume || hourlyVolume < (TRADING_CONFIG.MINIMUM_5MIN_VOLUME * 12 / 5)) return null;

        // Use opportunity pricing if volatility detected, otherwise use normal pricing
        const buyPrice = priceData.opportunityBuyPrice
            ? Math.floor(priceData.opportunityBuyPrice) + 1
            : Math.floor(priceData.avgLow) + TRADING_CONFIG.BUY_PRICE_OFFSET_GP;

        const sellPrice = priceData.opportunitySellPrice
            ? Math.floor(priceData.opportunitySellPrice) - 1
            : Math.floor(priceData.avgHigh) -1;

        const marketSpread = sellPrice - buyPrice;
        if (marketSpread < TRADING_CONFIG.MINIMUM_MARKET_SPREAD_GP) return null;
        if (buyPrice > cashPerSlot) return null;

        const profitAfterTaxes = Math.floor(sellPrice * (1 - TRADING_CONFIG.GE_TAX_RATE)) - buyPrice;
        if (profitAfterTaxes < TRADING_CONFIG.MIN_PROFIT_PER_ITEM) return null;

        const limitRemaining = mapEntry.limit - (recentlyBoughtMap.get(id) || 0);
        if (limitRemaining <= 0) return null;

        const quantity = calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining);
        if (quantity <= 0) return null;

        // The key metric from your successful script
        const potentialHourlyProfit = profitAfterTaxes * hourlyVolume;

        return {
            id,
            name: mapEntry.name,
            price: buyPrice,
            quantity,
            profit: profitAfterTaxes,
            potentialHourlyProfit,
            reason: `Vol: ${hourlyVolume.toLocaleString()}/hr`
        };
    } catch (error) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.error(`[BEAGLE ENGINE] Error analyzing item ${id}:`, error);
        }
        return null;
    }
}


// ================================================================================= //
// SECTION 4: THE F2P LOGIC ENGINE (UPGRADED)
// ================================================================================= //

function analyzeItemForF2P(id, cashPerSlot, recentlyBoughtMap, marketData, apiCache) {
    try {
        const mapEntry = marketData.mapping.find(m => m.id === id);
        if (!isValidItem(mapEntry)) return null;

        const timeseries = apiCache.get(id);
        if (!timeseries) return null;

        const priceData = getPricesFromSnapshots(timeseries);
        if (!priceData) return null;

        const buyPrice = priceData.avgLow + 1;
        const sellPrice = priceData.avgHigh - 1;

        if (buyPrice > cashPerSlot || buyPrice >= sellPrice) return null;

        const profitAfterTaxes = Math.floor(sellPrice * (1 - TRADING_CONFIG.GE_TAX_RATE)) - profitAfterTaxes;
        if (profitAfterTaxes < TRADING_CONFIG.MIN_PROFIT_PER_ITEM) return null;

        const limitRemaining = mapEntry.limit - (recentlyBoughtMap.get(id) || 0);
        if (limitRemaining <= 0) return null;

        const quantity = calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining);
        if (quantity <= 0) return null;

        const hourlyVolume = getHourlyVolume(timeseries) || 0;
        const potentialHourlyProfit = profitAfterTaxes * hourlyVolume;

        return { id, name: mapEntry.name, price: buyPrice, quantity, profit: profitAfterTaxes, potentialHourlyProfit, reason: "F2P Simple Flip" };
    } catch (error) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.error(`[F2P ENGINE] Error analyzing F2P item ${id}:`, error);
        }
        return null;
    }
}


// ================================================================================= //
// SECTION 5: THE MASTER SUGGESTION FUNCTION (UPGRADED)
// ================================================================================= //

async function getHybridSuggestion(userState, db, displayName) {
    try {
        if (!userState || !db) return { type: 'wait', message: "Initializing..." };

        await wikiApi.ensureMarketDataIsFresh();
        const marketData = wikiApi.getMarketData();
        if (!marketData || !marketData.mapping) return { type: 'wait', message: "Fetching market data..." };

        const { blocked_items = [], inventory = [], offers = [], preferences = {} } = userState;
        const isF2pMode = preferences.f2pOnlyMode || false;

        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log(`[MODE] Upgraded Engine running in ${isF2pMode ? 'F2P Mode' : 'P2P Mode'}.`);
        }

        const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
        const excludedIds = new Set([...activeOfferItemIds, ...blocked_items.map(Number)]);

        const itemPool = isF2pMode ? STAPLE_ITEMS_F2P : STAPLE_ITEMS_P2P;
        const analysisFunction = isF2pMode ? analyzeItemForF2P : analyzeItemWithBeagleModel;

        const allIdsToFetch = new Set([...activeOfferItemIds, ...inventory.map(i => i.id), ...Array.from(itemPool)]);

        const apiCache = new Map();
        const fetchPromises = Array.from(allIdsToFetch).map(async (id) => {
            if (id === 995) return;
            const ts = await wikiApi.fetchTimeseriesForItem(id);
            if (ts) apiCache.set(id, ts); // Cache the full timeseries for advanced analysis
        });
        await Promise.all(fetchPromises);

        const completedOffer = offers.find(o => ['completed', 'partial'].includes(o.status) && o.collected_amount > 0);
        if (completedOffer) {
            return { type: 'collect', slot: completedOffer.slot, item_id: completedOffer.item_id, name: completedOffer.item_name, price: completedOffer.price, quantity: completedOffer.quantity };
        }

        if (!isF2pMode && TRADING_CONFIG.ENABLE_BEAGLE_FLIPPER) {
            for (const offer of offers) {
                if (offer.status === 'buying') {
                    const offerAgeMinutes = (Date.now() - new Date(offer.timestamp * 1000).getTime()) / 60000;
                    if (offerAgeMinutes > TRADING_CONFIG.MAX_OFFER_LIFETIME_MINUTES) {
                        return { type: 'abort', slot: offer.slot, item_id: offer.item_id, name: offer.item_name, price: offer.price, quantity: offer.quantity, reason: `Offer expired (> ${TRADING_CONFIG.MAX_OFFER_LIFETIME_MINUTES} mins).` };
                    }
                }
            }
        }

        for (const item of inventory) {
            if (item.id === 995 || excludedIds.has(item.id)) continue;
            const timeseries = apiCache.get(item.id);
            if (!timeseries) continue;
            const priceData = getPricesFromSnapshots(timeseries);
            if (priceData && priceData.avgHigh) {
                const sellPrice = priceData.opportunitySellPrice ? priceData.opportunitySellPrice -1 : priceData.avgHigh - 1;
                return { type: 'sell', item_id: item.id, name: item.name, price: sellPrice, quantity: item.amount };
            }
        }

        const emptySlots = offers.filter(o => o.status === 'empty');
        if (emptySlots.length === 0) return { type: 'wait', message: 'No empty GE slots.' };

        const cashAmount = inventory.find(i => i.id === 995)?.amount || 0;
        if (cashAmount < TRADING_CONFIG.MIN_CASH_PER_SLOT) return { type: 'wait', message: 'Insufficient cash.' };
        const cashPerSlot = Math.floor(cashAmount / emptySlots.length);

        const recentlyBoughtMap = await getRecentlyBoughtQuantities(db, displayName);

        const profitableFlips = Array.from(itemPool)
            .map(id => {
                if(excludedIds.has(id)) return null;
                return analysisFunction(id, cashPerSlot, recentlyBoughtMap, marketData, apiCache);
            })
            .filter(Boolean);

        if (profitableFlips.length === 0) return { type: 'wait', message: 'Scanning for opportunities...' };

        // UPGRADED: Sorting by the superior metric
        profitableFlips.sort(sortByPotentialProfitDesc);
        const bestFlip = profitableFlips[0];

        return { type: 'buy', item_id: bestFlip.id, name: bestFlip.name, price: bestFlip.price, quantity: bestFlip.quantity, reason: bestFlip.reason };

    } catch (error) {
        if (TRADING_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.error("[MASTER_ENGINE] A top-level critical error occurred:", error);
        }
        return { type: 'wait', message: 'An unexpected error occurred.' };
    }
}


// ================================================================================= //
// SECTION 6: MODULE EXPORTS
// ================================================================================= //

module.exports = {
    getHybridSuggestion
};