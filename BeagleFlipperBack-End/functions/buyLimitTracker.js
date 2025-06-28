// buyLimitTracker.js - REPAIRED

/**
 * Fetches recent purchase quantities from Firestore to enforce GE limits.
 * This version correctly queries the 'trade_logs' collection that is now being
 * populated by the updated tradingLogic.js.
 *
 * @param {Firestore} db - The initialized Firestore database instance.
 * @param {string} displayName - The player's display name to query logs.
 * @returns {Map} A map of { itemId: totalQuantityBoughtInLast4Hours }.
 */
async function getRecentlyBoughtQuantities(db, displayName) {
    // Set the timestamp for 4 hours ago
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const recentlyBought = new Map();

    try {
        const tradeLogsRef = db.collection('trade_logs');
        // Query for 'buy' transactions from the specified user within the last 4 hours
        const snapshot = await tradeLogsRef
            .where('user', '==', displayName)
            .where('type', '==', 'buy')
            .where('timestamp', '>=', fourHoursAgo)
            .get();

        if (snapshot.empty) {
            // No recent buy transactions found
            return recentlyBought;
        }

        // Aggregate the quantities for each item
        snapshot.forEach(doc => {
            const trade = doc.data();
            const currentQty = recentlyBought.get(trade.item_id) || 0;
            recentlyBought.set(trade.item_id, currentQty + trade.quantity);
        });

    } catch (error) {
        console.error("Error fetching recent buy quantities:", error.message);
    }

    // Return the map of recently bought item quantities
    return recentlyBought;
}

module.exports = { getRecentlyBoughtQuantities };