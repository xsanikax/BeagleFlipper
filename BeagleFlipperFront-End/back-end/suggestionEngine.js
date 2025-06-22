// suggestionEngine.js
// FINAL, SIMPLIFIED, & CORRECTED LOGIC

const wikiApi = require('./wikiApiHandler');
const admin = require("firebase-admin");

const TAX_RATE = 0.01; // OSRS GE tax is 1%

// --- Main Suggestion Logic ---
async function getSuggestion(reqBody) {
    const { inventory = [], offers = [] } = reqBody;
    const gp = inventory.find(i => i.id === 995)?.amount || 0;

    await wikiApi.ensureMarketDataIsFresh();
    const { mapping, latest } = wikiApi.getMarketData();
    if (!mapping || !latest) {
        return { type: "wait", message: "Market data not available." };
    }

    const activeFlipItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.itemId));
    const emptySlots = 8 - activeFlipItemIds.size;

    // --- PRIORITY 1: SELL ITEMS IN INVENTORY ---
    const itemToSell = inventory.find(item => item.id !== 995 && item.amount > 0 && !activeFlipItemIds.has(item.id));
    if (itemToSell) {
        const itemData = latest[itemToSell.id];
        if (itemData && itemData.high > 0) {
            const itemName = mapping.find(m => m.id === itemToSell.id)?.name || "item";
            return {
                type: "sell", message: `Sell your ${itemName}`,
                item_id: itemToSell.id, name: itemName,
                quantity: itemToSell.amount, price: itemData.high,
            };
        }
    }

    // --- PRIORITY 2: BUY NEW ITEMS ---
    if (emptySlots === 0) {
        return { type: "wait", message: "All GE slots are full." };
    }

    const cashPerSlot = Math.floor(gp / emptySlots);
    if (cashPerSlot < 50000) { // Require at least 50k per slot to find decent flips
        return { type: "wait", message: "Not enough cash to flip effectively." };
    }

    let potentialFlips = [];

    for (const itemIdStr of Object.keys(latest)) {
        const itemId = parseInt(itemIdStr, 10);
        if (activeFlipItemIds.has(itemId)) continue;

        const itemData = latest[itemId];
        const mappingInfo = mapping.find(m => m.id === itemId);

        if (!itemData || !mappingInfo || !mappingInfo.tradeable || !mappingInfo.members || itemData.low <= 0 || itemData.high <= 0) {
            continue;
        }

        const margin = itemData.high - itemData.low;
        const tax = Math.floor(itemData.high * TAX_RATE);
        const profitPerItem = margin - tax;

        // Skip items with no profit or very low volume
        if (profitPerItem < 1 || itemData.highPriceVolume < 100) {
            continue;
        }
        
        // A simple score to prioritize high-volume, high-profit items
        const score = profitPerItem * Math.log10(itemData.highPriceVolume);
        
        const quantityToBuy = Math.floor(cashPerSlot / itemData.low);
        if (quantityToBuy > 0) {
             potentialFlips.push({
                itemId, score, quantityToBuy,
                name: mappingInfo.name,
                buyPrice: itemData.low,
            });
        }
    }

    if (potentialFlips.length === 0) {
        return { type: "wait", message: "No profitable opportunities found right now." };
    }

    // Find the item with the best score
    potentialFlips.sort((a, b) => b.score - a.score);
    const bestFlip = potentialFlips[0];

    return {
        type: "buy",
        message: `(Score: ${bestFlip.score.toFixed(2)})`,
        item_id: bestFlip.itemId,
        price: bestFlip.buyPrice,
        quantity: bestFlip.quantityToBuy,
        name: bestFlip.name,
    };
}

module.exports = { getSuggestion };
