const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const { GE_CONSTANTS, DA_BEAGLE_BOSS_CONFIG } = require('./config');

async function getActiveSuggestion(reqBody, db, displayName) {
    const { offers = [] } = reqBody;
    const managedOffer = manageOpenOffers(offers);
    if (managedOffer) return managedOffer;
    const emptySlots = GE_CONSTANTS.GE_SLOTS - offers.filter(o => o.status !== 'empty').length;
    if (emptySlots <= 0) return { type: "wait", message: "All GE slots are currently in use." };
    const newFlip = await findNewProfitableFlip(reqBody, db, displayName);
    if (newFlip) return newFlip;
    return { type: "wait", message: "No active spread found. Waiting..." };
}

function manageOpenOffers(offers) {
    const now = Date.now();
    const stallTimeMs = DA_BEAGLE_BOSS_CONFIG.STALL_TIME_MINUTES * 60 * 1000;
    for (const offer of offers) {
        if (offer.status === 'empty' || offer.status === 'completed') continue;
        const offerAgeMs = now - (offer.time_placed || 0);
        if (offerAgeMs > stallTimeMs) {
            if (offer.type === 'SELL') return { type: 'adjust', message: `Stalled Sell: Lower price for ${offer.itemName}.`, slot: offer.slot, newPrice: offer.price - 1 };
            if (offer.type === 'BUY') return { type: 'adjust', message: `Stalled Buy: Increase price for ${offer.itemName}.`, slot: offer.slot, newPrice: offer.price + 1 };
        }
    }
    return null;
}

async function findNewProfitableFlip(reqBody, db, displayName) {
    const { inventory = [], offers = [] } = reqBody;
    const gp = inventory.find(i => i.id === 995)?.amount || 0;
    await wikiApi.ensureMarketDataIsFresh();
    const { mapping, latest } = wikiApi.getMarketData();
    if (!mapping || !latest) return null;
    const activeFlipItemIds = new Set(offers.map(o => o.itemId));
    const recentBuys = await getRecentlyBoughtQuantities(db, displayName);
    for (const itemId of DA_BEAGLE_BOSS_CONFIG.HVLM_ITEM_LIST) {
        if (activeFlipItemIds.has(itemId)) continue;
        const mappingInfo = mapping[itemId];
        const priceInfo = latest[itemId];
        if (!mappingInfo || !priceInfo) continue;
        const instaSellPrice = priceInfo.low;
        const instaBuyPrice = priceInfo.high;
        const margin = instaBuyPrice - instaSellPrice;
        if (margin <= 0) continue;
        const taxPerItem = Math.floor(instaBuyPrice * GE_CONSTANTS.TAX_RATE);
        const profitPerItem = margin - taxPerItem;
        const roi = profitPerItem / instaSellPrice;
        if (profitPerItem < DA_BEAGLE_BOSS_CONFIG.MIN_PROFIT_GP || roi < DA_BEAGLE_BOSS_CONFIG.MIN_ROI_PERCENT) continue;
        const itemLimit = mappingInfo.limit || 0;
        const alreadyBought = recentBuys.get(itemId) || 0;
        let quantityToBuy = Math.floor(gp / instaSellPrice);
        quantityToBuy = Math.min(quantityToBuy, itemLimit - alreadyBought);
        if (quantityToBuy > 0) return { type: "buy", message: `Active Spread: ${mappingInfo.name}`, item_id: itemId, price: instaSellPrice + 1, quantity: quantityToBuy, name: mappingInfo.name };
    }
    return null;
}

module.exports = { getActiveSuggestion };
