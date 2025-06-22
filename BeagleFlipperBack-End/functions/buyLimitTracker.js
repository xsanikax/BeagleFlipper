// functions/buyLimitTracker.js
// This version fixes a critical bug where the code was incorrectly handling
// the 'opened_time' field, causing a deployment crash.

const admin = require('firebase-admin');
const config = require('./tradingConfig'); // NEW: Import centralized configuration

/**
 * Calculates the quantity of each item bought by a user in the last 4 hours.
 * @param {admin.firestore.Firestore} db - The Firestore database instance.
 * @param {string} displayName - The user's display name.
 * @returns {Promise<Map<number, number>>} A Promise that resolves to a Map where keys are
 * item IDs and values are the total quantities purchased in the last 4 hours.
 */
async function getRecentlyBoughtQuantities(db, displayName) {
    // Use config.TRADING_CONFIG.BUY_LIMIT_RESET_HOURS for the duration
    const buyLimitResetInMillis = config.TRADING_CONFIG.BUY_LIMIT_RESET_HOURS * 60 * 60 * 1000;
    const fourHoursAgoTimestamp = admin.firestore.Timestamp.fromMillis(Date.now() - buyLimitResetInMillis);

    const recentBuys = new Map();

    try {
        const flipsSnapshot = await db.collection('users').doc(displayName).collection('flips').get();

        flipsSnapshot.forEach(doc => {
            const flip = doc.data();
            // Use camelCase itemId as it's saved in the database
            const itemId = flip.itemId; 
            if (!itemId) {
                return;
            }

            // Use camelCase openedTime as it's saved in the database, and convert to Unix milliseconds for comparison
            const flipOpenedTime = flip.openedTime; 

            // Correctly handle 'flipOpenedTime' as a number (Unix seconds)
            // Convert it to milliseconds for a valid comparison.
            if (flipOpenedTime && (flipOpenedTime * 1000) >= fourHoursAgoTimestamp.toMillis()) {
                // Use transactionsHistory as it's saved in the database
                if (flip.transactionsHistory && Array.isArray(flip.transactionsHistory)) {
                    for (const transaction of flip.transactionsHistory) {
                        // The 'transaction.time' is a Unix timestamp in seconds, convert to milliseconds for comparison.
                        if (transaction.type === 'buy' && transaction.time && (transaction.time * 1000) >= fourHoursAgoTimestamp.toMillis()) {
                            const currentQuantity = recentBuys.get(itemId) || 0;
                            recentBuys.set(itemId, currentQuantity + transaction.quantity);
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error(`Error fetching recent buy quantities for ${displayName}:`, error);
    }
    
    console.log(`Buy Limit Tracker: Found recent buys for ${recentBuys.size} unique items.`);
    return recentBuys;
}

module.exports = { getRecentlyBoughtQuantities };
