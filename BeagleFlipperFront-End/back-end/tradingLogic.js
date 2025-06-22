// tradingLogic.js
// This file contains functions related to user-specific profit tracking and flip loading.

const admin = require('firebase-admin');

// Constants for GE Tax Calculation (mirroring client-side GeTax.java)
const MAX_PRICE_FOR_GE_TAX = 250000000;
const GE_TAX_CAP = 5000000;
const GE_TAX_RATE = 0.02;
const GE_TAX_EXEMPT_ITEMS = new Set([13190, 1755, 5325, 1785, 2347, 1733, 233, 5341, 8794, 5329, 5343, 1735, 952, 5331]);

function calculateTax(itemId, price, quantity) {
    if (GE_TAX_EXEMPT_ITEMS.has(itemId)) {
        return 0;
    }
    const totalAmount = price * quantity;
    if (totalAmount >= MAX_PRICE_FOR_GE_TAX) {
        return GE_TAX_CAP;
    }
    const tax = Math.floor(totalAmount * GE_TAX_RATE);
    return tax;
}

/**
 * Normalizes an incoming transaction into a standard format.
 */
function normalizeTransaction(transaction) {
    transaction.id = transaction.id || admin.firestore.Timestamp.now().toMillis().toString();
    transaction.item_id = transaction.item_id;
    transaction.type = transaction.type;
    transaction.quantity = transaction.quantity || 0;
    transaction.price = transaction.price || 0;
    transaction.amount_spent = transaction.amount_spent || 0;
    transaction.time = transaction.time || Math.floor(admin.firestore.Timestamp.now().toMillis() / 1000);
    transaction.item_name = transaction.item_name || `Item ${transaction.item_id}`;
    return transaction;
}


/**
 * Processes incoming client transactions and saves/updates aggregated flip data in Firestore.
 */
async function handleProfitTracking(req, res, { db }) {
    const displayName = req.query.display_name;
    const incomingTransactions = req.body;

    if (!displayName) {
        console.error("handleProfitTracking: Display name missing for user:", req.user ? req.user.uid : "unknown");
        return res.status(400).json({ message: "Display name is required." });
    }
    if (!Array.isArray(incomingTransactions)) {
        console.error("handleProfitTracking: Invalid request body, expected array for user:", displayName);
        return res.status(400).json({ message: "Invalid request body: expected an array of transactions." });
    }

    console.log(`handleProfitTracking: Processing ${incomingTransactions.length} transactions for user: ${displayName}`);

    const userFlipsCollectionRef = db.collection('users').doc(displayName).collection('flips');
    const batch = db.batch();
    const activeFlipsMap = new Map();

    for (let transaction of incomingTransactions) {
        transaction = normalizeTransaction(transaction);
        
        let currentFlipData;
        let flipDocRef;
        
        if (activeFlipsMap.has(transaction.item_id)) {
            currentFlipData = activeFlipsMap.get(transaction.item_id);
            flipDocRef = userFlipsCollectionRef.doc(currentFlipData.id);
        } else {
            const openFlipsSnapshot = await userFlipsCollectionRef
                .where('itemId', '==', transaction.item_id)
                .where('is_closed', '==', false)
                .orderBy('opened_time')
                .limit(1)
                .get();

            if (!openFlipsSnapshot.empty) {
                flipDocRef = openFlipsSnapshot.docs[0].ref;
                currentFlipData = openFlipsSnapshot.docs[0].data();
            } else {
                flipDocRef = userFlipsCollectionRef.doc();
                currentFlipData = {
                    id: flipDocRef.id,
                    account_id: transaction.account_id || 0,
                    itemId: transaction.item_id,
                    itemName: transaction.item_name,
                    opened_time: Math.floor(transaction.time),
                    opened_quantity: 0,
                    spent: 0,
                    closed_time: 0,
                    closed_quantity: 0,
                    received_post_tax: 0,
                    profit: 0,
                    tax_paid: 0,
                    is_closed: false,
                    accountDisplayName: displayName,
                    transactions_history: []
                };
            }
            activeFlipsMap.set(transaction.item_id, currentFlipData);
        }

        currentFlipData.transactions_history.push({
            id: transaction.id,
            type: transaction.type,
            quantity: transaction.quantity,
            price: transaction.price,
            amountSpent: transaction.amount_spent,
            time: admin.firestore.Timestamp.fromMillis(transaction.time * 1000)
        });

        if (transaction.type === 'buy') {
            currentFlipData.opened_quantity += transaction.quantity;
            currentFlipData.spent += transaction.amount_spent;
            currentFlipData.is_closed = false;
        } else if (transaction.type === 'sell') {
            const receivedAfterTax = transaction.amount_spent - calculateTax(transaction.item_id, transaction.price, transaction.quantity);
            currentFlipData.closed_quantity += transaction.quantity;
            currentFlipData.received_post_tax += receivedAfterTax;
            currentFlipData.tax_paid += calculateTax(transaction.item_id, transaction.price, transaction.quantity);
            currentFlipData.closed_time = Math.floor(transaction.time);
            if (currentFlipData.closed_quantity >= currentFlipData.opened_quantity) {
                currentFlipData.is_closed = true;
            }
        }
        
        if (currentFlipData.opened_quantity > 0) {
            const avgBuyPrice = currentFlipData.spent / currentFlipData.opened_quantity;
            currentFlipData.profit = Math.round(currentFlipData.received_post_tax - (avgBuyPrice * currentFlipData.closed_quantity));
        } else {
             currentFlipData.profit = currentFlipData.received_post_tax;
        }
        
        batch.set(flipDocRef, currentFlipData, { merge: true });
    }

    await batch.commit();

    // FIX: Convert the map of updated flips into an array and send it back to the client.
    const updatedFlipsForClient = Array.from(activeFlipsMap.values()).map(flipData => {
        return {
            id: flipData.id,
            account_id: flipData.account_id,
            item_id: flipData.itemId,
            item_name: flipData.itemName,
            opened_time: flipData.opened_time,
            opened_quantity: flipData.opened_quantity,
            spent: flipData.spent,
            closed_time: flipData.closed_time,
            closed_quantity: flipData.closed_quantity,
            received_post_tax: flipData.received_post_tax,
            profit: flipData.profit,
            tax_paid: flipData.tax_paid,
            is_closed: flipData.is_closed,
            accountDisplayName: flipData.accountDisplayName
        };
    });
    
    console.log(`handleProfitTracking: Responding with ${updatedFlipsForClient.length} updated flips.`);
    return res.status(200).json(updatedFlipsForClient);
}

/**
 * Fetches historical flip data from Firestore for the logged-in user.
 */
async function handleLoadFlips(req, res, { db }) {
    const displayNameFromClient = req.query.display_name;

    if (!displayNameFromClient) {
        return res.status(400).json({ message: "Display name is required in query." });
    }

    try {
        const userFlipsCollectionRef = db.collection('users').doc(displayNameFromClient).collection('flips');
        const flipsSnapshot = await userFlipsCollectionRef.get();

        const allFlips = [];
        flipsSnapshot.forEach(doc => {
            const flipData = doc.data();
            const openedTimeInSeconds = flipData.opened_time && flipData.opened_time.toMillis ? Math.floor(flipData.opened_time.toMillis() / 1000) : (flipData.opened_time || 0);
            const closedTimeInSeconds = flipData.closed_time && flipData.closed_time.toMillis ? Math.floor(flipData.closed_time.toMillis() / 1000) : (flipData.closed_time || 0);

            allFlips.push({
                id: flipData.id || doc.id,
                account_id: flipData.account_id || 0,
                item_id: flipData.itemId,
                item_name: flipData.itemName || `Item ${flipData.itemId}`,
                opened_time: openedTimeInSeconds,
                opened_quantity: flipData.opened_quantity || 0,
                spent: flipData.spent || 0,
                closed_time: closedTimeInSeconds,
                closed_quantity: flipData.closed_quantity || 0,
                received_post_tax: flipData.received_post_tax || 0,
                profit: flipData.profit || 0,
                tax_paid: flipData.tax_paid || 0,
                is_closed: flipData.is_closed === undefined ? true : flipData.is_closed,
                accountDisplayName: flipData.accountDisplayName || displayNameFromClient
            });
        });

        allFlips.sort((a, b) => b.closed_time - a.closed_time);
        return res.status(200).json(allFlips);
    } catch (error) {
        console.error("handleLoadFlips: Error loading flips for user", displayNameFromClient, ":", error);
        return res.status(500).json({ message: "Failed to load flips." });
    }
}

// Export the functions to be imported by index.js
module.exports = {
  handleProfitTracking,
  handleLoadFlips,
};
