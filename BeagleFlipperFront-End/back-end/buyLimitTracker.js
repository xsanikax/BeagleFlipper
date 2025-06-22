// functions/buyLimitTracker.js
// This version fixes a critical bug where the code was incorrectly handling
// the 'opened_time' field, causing a deployment crash.

const admin = require('firebase-admin');

/**
 * Calculates the quantity of each item bought by a user in the last 4 hours.
 * @param {admin.firestore.Firestore} db - The Firestore database instance.
 * @param {string} displayName - The user's display name.
 * @returns {Promise<Map<number, number>>} A Promise that resolves to a Map where keys are
 * item IDs and values are the total quantities purchased in the last 4 hours.
 */
async function getRecentlyBoughtQuantities(db, displayName) {
    const fourHoursInMillis = 4 * 60 * 60 * 1000;
    const fourHoursAgoTimestamp = admin.firestore.Timestamp.fromMillis(Date.now() - fourHoursInMillis);

    const recentBuys = new Map();

    try {
        const flipsSnapshot = await db.collection('users').doc(displayName).collection('flips').get();

        flipsSnapshot.forEach(doc => {
            const flip = doc.data();
            const itemId = flip.itemId; 
            if (!itemId) {
                return;
            }

            const flipOpenedTime = flip.opened_time; // This is a number (seconds since epoch)

            // BUG FIX: Correctly handle 'flipOpenedTime' as a number.
            // Convert it to milliseconds for a valid comparison.
            if (flipOpenedTime && (flipOpenedTime * 1000) >= fourHoursAgoTimestamp.toMillis()) {
                if (flip.transactions_history && Array.isArray(flip.transactions_history)) {
                    for (const transaction of flip.transactions_history) {
                        // The 'transaction.time' is a proper Timestamp object, so .toMillis() is correct here.
                        if (transaction.type === 'buy' && transaction.time && transaction.time.toMillis() >= fourHoursAgoTimestamp.toMillis()) {
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
