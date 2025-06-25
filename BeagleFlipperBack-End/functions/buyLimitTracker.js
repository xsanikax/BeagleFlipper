// buyLimitTracker.js
// VERSION: Data Type Fix
// This version safely handles different data types for the 'time' field,
// resolving the 'transaction.time.toMillis is not a function' error.

const admin = require('firebase-admin');

async function getRecentlyBoughtQuantities(db, displayName) {
    const recentlyBought = new Map();
    if (!db || !displayName) {
        console.error("getRecentlyBoughtQuantities: Missing db or displayName");
        return recentlyBought;
    }

    // 4 hours in milliseconds
    const fourHoursAgoMs = Date.now() - (4 * 60 * 60 * 1000);

    const flipsRef = db.collection('users').doc(displayName).collection('flips');

    // This query gets all flips and filters in memory.
    const snapshot = await flipsRef.get();

    snapshot.forEach(doc => {
        const flip = doc.data();
        if (flip.transactions_history && Array.isArray(flip.transactions_history)) {
            flip.transactions_history.forEach(transaction => {
                if (transaction.type === 'buy') {
                    // --- THE FIX ---
                    // This block now correctly handles both Timestamp objects and raw numbers.
                    let transactionTimeMs = 0;
                    if (transaction.time && typeof transaction.time.toMillis === 'function') {
                        // It's a modern Firestore Timestamp object
                        transactionTimeMs = transaction.time.toMillis();
                    } else if (typeof transaction.time === 'number') {
                        // It's an old Unix timestamp, likely in seconds. Convert to milliseconds.
                        transactionTimeMs = transaction.time * 1000;
                    } else {
                        // Cannot determine the time, so we skip this transaction
                        // to prevent a crash.
                        return;
                    }

                    if (transactionTimeMs > fourHoursAgoMs) {
                        const currentQuantity = recentlyBought.get(transaction.item_id) || 0;
                        recentlyBought.set(transaction.item_id, currentQuantity + transaction.quantity);
                    }
                }
            });
        }
    });

    return recentlyBought;
}

module.exports = { getRecentlyBoughtQuantities };
