/**
 * Generates a trading suggestion based on a simple, logic-only 8-hour strategy.
 * This file is now 100% AI-FREE and uses the correct dependency pattern.
 */
async function getEightHourSuggestion(userState, db, displayName, timeframe, dependencies) {
    const { TRADING_CONFIG, TARGET_COMMODITIES, wikiApi, getRecentlyBoughtQuantities } = dependencies;

    const { inventory = [], offers = [], blocked_items = [], recently_suggested = [] } = userState || {};
    const blockedItemsSet = new Set(blocked_items);
    const recentlySuggestedSet = new Set(recently_suggested);
    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData.latest || !marketData.mapping) {
        return { type: "wait", message: "Waiting for 8h market data..." };
    }

    const emptySlots = offers.filter(offer => offer.status === 'empty').length;
    if (emptySlots === 0) return { type: "wait", message: "All slots active." };

    const availableCash = inventory.find(item => item.id === 995)?.amount || 0;
    const cashPerSlot = Math.floor(availableCash / emptySlots);
    const minCash = TRADING_CONFIG.minCashPerSlot_8H || 10000;

    if (cashPerSlot < minCash) {
        return { type: "wait", message: "Not enough cash for 8h strategy." };
    }

    const recentlyBought = await getRecentlyBoughtQuantities(db, displayName);
    const commodityIds = Object.keys(TARGET_COMMODITIES);
    let candidates = [];

    for (const itemIdStr of commodityIds) {
        const itemId = parseInt(itemIdStr);
        if (blockedItemsSet.has(itemId) || recentlySuggestedSet.has(itemId) || activeOfferItemIds.has(itemId)) continue;

        const itemData = marketData.latest[itemId];
        if (!itemData || !itemData.high || !itemData.low || itemData.high <= itemData.low) continue;

        const profit = Math.floor(itemData.high * (1 - TRADING_CONFIG.geTaxRate)) - itemData.low;
        if (profit < TRADING_CONFIG.minProfit) continue;

        const roi = (profit / itemData.low) * 100;
        if (roi < TRADING_CONFIG.minROI) continue;

        if (itemData.low > cashPerSlot || itemData.low > TRADING_CONFIG.maxBuyPrice) continue;

        const itemConfig = TARGET_COMMODITIES[itemId];
        const remainingLimit = itemConfig.limit - (recentlyBought.get(itemId) || 0);
        if (remainingLimit <= 0) continue;

        const quantityToBuy = Math.min(Math.floor(cashPerSlot / itemData.low), remainingLimit);
        if (quantityToBuy > 0) {
            candidates.push({ itemId, name: itemConfig.name, buyPrice: itemData.low, profit, roi, quantityToBuy });
        }
    }

    if (candidates.length === 0) {
        return { type: "wait", message: "No profitable 8h opportunities found." };
    }

    candidates.sort((a, b) => b.profit - a.profit);
    const bestFlip = candidates[0];

    return {
        type: "buy",
        message: `Best 8h Flip by Profit: ${bestFlip.name}`,
        item_id: bestFlip.itemId,
        price: bestFlip.buyPrice,
        quantity: bestFlip.quantityToBuy,
        name: bestFlip.name,
    };
}

module.exports = { getEightHourSuggestion };