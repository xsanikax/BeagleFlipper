/**
 * hybridAnalytics.js - DEFINITIVE PARALLEL PROCESSING VERSION
 * This version preserves the full-length original code structure. It solves the timeout errors
 * by fetching item data in parallel batches, which is significantly faster. It prioritizes
 * a small list of "staple" items first before proceeding to a full scan.
 */

const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const { STAPLE_ITEMS, TARGET_COMMODITIES, F2P_ITEM_IDS } = require('./tradingConfig');

const TAX_RATE = 0.02;
const HIGH_VOLUME_THRESHOLD = 500000;
const LOW_VOLUME_THRESHOLD = 1000;
const MAX_LOW_VOLUME_ACTIVE = 2;
const MIN_ITEM_VALUE = 100;

// New constants to easily control the pricing windows.
const BUY_SNAPSHOT_WINDOW = 4;   // 3 snapshots * 5 minutes = 15 minutes for buy price analysis
const SELL_SNAPSHOT_WINDOW = 8;  // 4 snapshots * 5 minutes = 20 minutes for sell price analysis

// Volatility detection constants for catching dramatic price drops/spikes
const VOLATILITY_THRESHOLD = 0.25; // 25% price change from average to trigger opportunity pricing
const OPPORTUNITY_WINDOW = 3;       // Look at last 2 snapshots for current market conditions

// --- UTILITY FUNCTIONS ---

// Get prices from timeseries snapshots with separate windows for buy and sell
function getPricesFromSnapshots(timeseries) {
  if (!timeseries) {
    return null;
  }

  // Check if we have enough data for both windows
  const maxWindow = Math.max(BUY_SNAPSHOT_WINDOW, SELL_SNAPSHOT_WINDOW);
  if (timeseries.length < maxWindow) {
    return null;
  }

  // Get buy pricing window (shorter, more recent data for faster buy decisions)
  const buyPricingWindow = timeseries.slice(-BUY_SNAPSHOT_WINDOW);
  const buyLows = buyPricingWindow.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));

  // Get sell pricing window (longer window for more stable sell price analysis)
  const sellPricingWindow = timeseries.slice(-SELL_SNAPSHOT_WINDOW);
  const sellHighs = sellPricingWindow.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

  if (!buyLows.length || !sellHighs.length) {
    return null;
  }

  const floorPrice = Math.min(...buyLows);
  const ceilingPrice = Math.max(...sellHighs);

  // VOLATILITY DETECTION: Check for dramatic price drops/spikes for opportunity trading
  let opportunityBuyPrice = null;
  let opportunitySellPrice = null;

  if (timeseries.length >= SELL_SNAPSHOT_WINDOW + OPPORTUNITY_WINDOW) {
    // Get recent snapshots for current conditions
    const recentSnapshots = timeseries.slice(-OPPORTUNITY_WINDOW);
    const recentLows = recentSnapshots.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));
    const recentHighs = recentSnapshots.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

    if (recentLows.length && recentHighs.length) {
      const currentLow = Math.min(...recentLows);
      const currentHigh = Math.max(...recentHighs);

      // Check for dramatic price drop (buy opportunity)
      const dropPercentage = (floorPrice - currentLow) / floorPrice;
      if (dropPercentage >= VOLATILITY_THRESHOLD) {
        opportunityBuyPrice = currentLow;
        console.log(`[VOLATILITY] Detected ${(dropPercentage * 100).toFixed(1)}% price drop! Using opportunity buy price: ${currentLow} vs average: ${floorPrice}`);
      }

      // Check for dramatic price spike (sell opportunity)
      const spikePercentage = (currentHigh - ceilingPrice) / ceilingPrice;
      if (spikePercentage >= VOLATILITY_THRESHOLD) {
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
  const netSell = Math.floor(sellPrice * (1 - TAX_RATE));
  const profit = netSell - buyPrice;
  return profit >= 1;
}

function calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining) {
  const maxByCash = Math.floor(cashPerSlot / buyPrice);
  return Math.min(maxByCash, limitRemaining);
}

function calculateQuickFlipScore(flip) {
  // Base score is the hourly profit potential
  let score = flip.potentialHourlyProfit;

  // Boost score for high-volume items (they trade faster)
  if (flip.hourlyVolume >= HIGH_VOLUME_THRESHOLD) {
    score *= 1.5; // 50% bonus for high volume
  }

  // Extra boost for very high volume (ultra-fast trades)
  if (flip.hourlyVolume >= HIGH_VOLUME_THRESHOLD * 3) {
    score *= 1.3; // Additional 30% bonus for very high volume
  }

  // Boost score for higher profit margins (more attractive to other traders)
  const profitMargin = flip.profit / flip.price;
  if (profitMargin > 0.1) { // 10%+ margin
    score *= 1.2;
  } else if (profitMargin > 0.05) { // 5-10% margin
    score *= 1.1;
  }

  // Slight penalty for very expensive items (harder to fill large quantities quickly)
  if (flip.price > 50000) {
    score *= 0.9;
  }

  return score;
}

function sortByQuickFlipScore(a, b) {
  return calculateQuickFlipScore(b) - calculateQuickFlipScore(a);
}

function sortByPotentialProfitDesc(a,b) {
  return b.potentialHourlyProfit - a.potentialHourlyProfit;
}

function isValidItem(item) {
  return item &&
         item.tradeable_on_ge !== false &&
         item.name &&
         item.limit > 0;
}

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
            if (buyPrice < MIN_ITEM_VALUE) return null;
            if (!isProfitableSell(buyPrice, sellPrice)) return null;

            const limitRemaining = mapEntry.limit - (recentlyBoughtMap.get(id) || 0);
            if (limitRemaining <= 0) {
                console.log(`[DEBUG] Item ${id} (${mapEntry.name}) REJECTED: Buy limit of ${mapEntry.limit} reached (already bought ${recentlyBoughtMap.get(id) || 0}).`);
                return null;
            }

            const quantity = calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining);
            if (quantity <= 0) return null;

            const profit = Math.floor(sellPrice * (1 - TAX_RATE)) - buyPrice;
            const potentialHourlyProfit = profit * hourlyVolume;

            return { id, name: mapEntry.name, price: buyPrice, quantity, profit, hourlyVolume, potentialHourlyProfit };
        } catch (error) {
            console.log(`[DEBUG] CRITICAL ERROR processing item ${id}:`, error.stack);
            return null;
        }
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean); // Filter out any null results
}

// --- MAIN SCRIPT LOGIC ---
async function getF2pSuggestion(userState, db, displayName) {
  console.log('[F2P_ANALYTICS] ==> The getF2pSuggestion function has started successfully.');

  // --- START OF MODIFICATION ---
    // This is the new logic to handle F2P mode.
    // It destructures the 'preferences' object from the user state.
    const { inventory = [], offers = [], preferences } = userState;

    // The F2P filter will be applied first if the preference is set.
    const isF2pMode = preferences && preferences.f2pOnlyMode;
    if (isF2pMode) {
        console.log('[DEBUG] F2P mode is ON. Rerouting to F2P analytics...');
        // Note: This assumes you have f2pAnalytics.js ready to be called from index.js
        // For now, we are just adding the filtering logic here. In the final step,
        // index.js will handle calling the right file.
    }
    // --- END OF MODIFICATION ---

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

  // Reuse inventory and offers destructured earlier to avoid redeclaration
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
  if (cashAmount < 1000) {
    console.log(`[DEBUG] Insufficient cash: ${cashAmount}`);
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
    if (hourlyVolume && hourlyVolume < HIGH_VOLUME_THRESHOLD) {
      lowVolumeActiveCount++;
    }
  }

  // --- STEP 5: PRIORITY SCAN (STAPLES-FIRST) using Parallel Processing ---
  console.log('[DEBUG] Starting Priority Scan on staple items.');
  const notActiveStaples = Array.from(STAPLE_ITEMS).filter(id => !activeOfferItemIds.has(id));

  if (notActiveStaples.length > 0) {
    const stapleFlips = await analyzeItemBatch(notActiveStaples, cashPerSlot, recentlyBoughtMap, marketData);
    if (stapleFlips.length > 0) {
        const highVolStaples = stapleFlips.filter(flip => flip.hourlyVolume >= HIGH_VOLUME_THRESHOLD);
        if (highVolStaples.length > 0) {
          highVolStaples.sort(sortByQuickFlipScore);
          const best = highVolStaples[0];
          console.log(`[DEBUG] PRIORITY SUCCESS: Found staple flip for ${best.name}.`);
          return { type: 'buy', item_id: best.id, name: best.name, price: best.price, quantity: best.quantity };
        }
    }
  }
  console.log('[DEBUG] Priority Scan Complete: No profitable staple items found. Proceeding to full scan.');

  // --- STEP 6: FULL SCAN (FALLBACK) using Parallel Processing ---
  const notActiveGeneral = Array.from(F2P_ITEM_IDS).filter(id => !activeOfferItemIds.has(id) && !STAPLE_ITEMS.has(id));
  const flipsHighVol = [];
  const flipsLowVol = [];

  const BATCH_SIZE = 25; // Process the main list in smaller batches
  for (let i = 0; i < notActiveGeneral.length; i += BATCH_SIZE) {
    const batch = notActiveGeneral.slice(i, i + BATCH_SIZE);
    console.log(`[DEBUG] Processing full scan batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(notActiveGeneral.length/BATCH_SIZE)}`);

    const batchResults = await analyzeItemBatch(batch, cashPerSlot, recentlyBoughtMap, marketData);
    for (const flip of batchResults) {
        if (flip.hourlyVolume >= HIGH_VOLUME_THRESHOLD) {
            flipsHighVol.push(flip);
        } else if (flip.hourlyVolume >= LOW_VOLUME_THRESHOLD) {
            flipsLowVol.push(flip);
        }
    }
  }

  console.log(`[DEBUG] Full Scan Complete: Found ${flipsHighVol.length} high volume flips, ${flipsLowVol.length} low volume flips`);

  flipsHighVol.sort(sortByQuickFlipScore);
  flipsLowVol.sort(sortByQuickFlipScore);

  if (flipsHighVol.length) {
    const best = flipsHighVol[0];
    console.log(`[DEBUG] Top high volume flip from full scan: ${best.name}`);
    return { type: 'buy', item_id: best.id, name: best.name, price: best.price, quantity: best.quantity };
  }

  if (flipsLowVol.length && lowVolumeActiveCount < MAX_LOW_VOLUME_ACTIVE) {
    const bestLow = flipsLowVol[0];
    console.log(`[DEBUG] Top low volume flip from full scan: ${bestLow.name}`);
    return { type: 'buy', item_id: bestLow.id, name: bestLow.name, price: bestLow.price, quantity: bestLow.quantity };
  }

  console.log('[DEBUG] No valid flips found in any category. Waiting.');
  return { type: 'wait' };
}

module.exports = {
   getF2pSuggestion,
};