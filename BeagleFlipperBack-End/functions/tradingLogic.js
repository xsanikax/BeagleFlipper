// tradingLogic.js - FINAL
// This version fixes the "Cannot read properties of undefined (reading 'push')" server crash.
// It restores the original per-item tax calculation method and maintains the 2% tax rate.

const admin = require('firebase-admin');

// --- Constants for GE Tax Calculation ---
const GE_TAX_RATE = 0.02; // Using the 2% rate as you specified.
const GE_TAX_CAP = 5000000;
const MINIMUM_TAXABLE_PRICE = 50;

const GE_TAX_EXEMPT_ITEMS = new Set([
    13190, 995, 13204, 1755, 5325, 1785, 2347, 1733, 233, 5341, 8794, 5329, 5343, 1735, 952, 5331,
]);

// The tax calculation function from your original file.
function calculateTax(itemId, price, quantity) {
    if (GE_TAX_EXEMPT_ITEMS.has(itemId)) return 0;
    if (price * quantity < MINIMUM_TAXABLE_PRICE) return 0;

    const taxPerItem = Math.floor(price * GE_TAX_RATE);
    const totalTax = taxPerItem * quantity;
    return Math.min(Math.max(totalTax, 1), GE_TAX_CAP);
}

function normalizeTransaction(transaction) {
    transaction.id = transaction.id || admin.firestore.Timestamp.now().toMillis().toString();
    transaction.item_id = transaction.item_id;
    transaction.type = transaction.type;
    transaction.quantity = transaction.quantity || 0;
    transaction.price = transaction.price || 0;
    transaction.amount_spent = transaction.amount_spent || 0;
    transaction.time = transaction.time || Math.floor(Date.now() / 1000);
    transaction.item_name = transaction.item_name || `Item ${transaction.item_id}`;
    return transaction;
}

async function handleProfitTracking(req, res, { db }) {
    const displayName = req.query.display_name;
    const incomingTransactions = req.body;

    if (!displayName) {
        return res.status(400).json({ message: "Display name is required." });
    }
    if (!Array.isArray(incomingTransactions)) {
        return res.status(400).json({ message: "Invalid request body: expected an array of transactions." });
    }

    const userFlipsCollectionRef = db.collection('users').doc(displayName).collection('flips');
    const tradeLogsCollectionRef = db.collection('trade_logs');
    const batch = db.batch();
    const activeFlipsMap = new Map();

    for (let transaction of incomingTransactions) {
        // Log every transaction for the Buy Limit Tracker
        const logDocRef = tradeLogsCollectionRef.doc();
        batch.set(logDocRef, {
            user: displayName, type: transaction.type, item_id: transaction.item_id,
            item_name: transaction.item_name, quantity: transaction.quantity, price: transaction.price,
            timestamp: admin.firestore.Timestamp.fromMillis(transaction.time * 1000)
        });

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
                    id: flipDocRef.id, account_id: transaction.account_id || 0, itemId: transaction.item_id,
                    itemName: transaction.item_name, opened_time: Math.floor(transaction.time),
                    opened_quantity: 0, spent: 0, closed_time: 0, closed_quantity: 0,
                    received_post_tax: 0, profit: 0, tax_paid: 0, is_closed: false,
                    accountDisplayName: displayName, transactions_history: []
                };
            }
            activeFlipsMap.set(transaction.item_id, currentFlipData);
        }

        // ======================== CORE FIX START ========================
        // Ensure the transactions_history array exists before trying to push to it.
        if (!currentFlipData.transactions_history) {
            currentFlipData.transactions_history = [];
        }
        // ======================== CORE FIX END ==========================

        const historyIds = new Set(currentFlipData.transactions_history.map(tx => tx.id));
        if (historyIds.has(transaction.id)) {
            console.log(`[DUPLICATE_PREVENTION] Transaction ${transaction.id} for item ${transaction.item_id} already processed. Skipping.`);
            continue;
        }

        currentFlipData.transactions_history.push({
            id: transaction.id, type: transaction.type, quantity: transaction.quantity,
            price: transaction.price, amountSpent: transaction.amount_spent,
            time: admin.firestore.Timestamp.fromMillis(transaction.time * 1000)
        });

        if (transaction.type === 'buy') {
            currentFlipData.opened_quantity += transaction.quantity;
            currentFlipData.spent += transaction.amount_spent;
            currentFlipData.is_closed = false;
        } else if (transaction.type === 'sell') {
            const tax = calculateTax(transaction.item_id, transaction.price, transaction.quantity);
            const revenueAfterTax = transaction.amount_spent - tax;

            currentFlipData.closed_quantity += transaction.quantity;
            currentFlipData.received_post_tax += revenueAfterTax;
            currentFlipData.tax_paid += tax;
            currentFlipData.closed_time = Math.floor(transaction.time);

            if (currentFlipData.closed_quantity >= currentFlipData.opened_quantity) {
                currentFlipData.is_closed = true;
            }
        }

        // === FIFO Profit Calculation (Your Original Logic) ===
        const history = [...currentFlipData.transactions_history];
        history.sort((a, b) => a.time.toMillis() - b.time.toMillis());

        const buyQueue = [];
        let totalRevenueAfterTax = 0;
        let totalMatchedCost = 0;

        for (const tx of history) {
            if (tx.type === 'buy') {
                buyQueue.push({ quantity: tx.quantity, cost: tx.amountSpent });
            } else if (tx.type === 'sell') {
                let qtyToMatch = tx.quantity;
                let matchedCost = 0;

                while (qtyToMatch > 0 && buyQueue.length > 0) {
                    const buy = buyQueue[0];
                    if (buy.quantity <= qtyToMatch) {
                        matchedCost += buy.cost;
                        qtyToMatch -= buy.quantity;
                        buyQueue.shift();
                    } else {
                        const unitCost = Math.floor(buy.cost / buy.quantity);
                        matchedCost += unitCost * qtyToMatch;
                        buy.quantity -= qtyToMatch;
                        buy.cost -= unitCost * qtyToMatch;
                        qtyToMatch = 0;
                    }
                }

                const tax = calculateTax(currentFlipData.itemId, tx.price, tx.quantity);
                const revenue = tx.price * tx.quantity;
                const revenueAfterTax = revenue - tax;

                totalRevenueAfterTax += revenueAfterTax;
                totalMatchedCost += matchedCost;
            }
        }
        currentFlipData.profit = totalRevenueAfterTax - totalMatchedCost;
        // === End of FIFO Calculation ===

        batch.set(flipDocRef, currentFlipData, { merge: true });
    }

    await batch.commit();

    const updatedFlipsForClient = Array.from(activeFlipsMap.values()).map(flipData => ({
        id: flipData.id, account_id: flipData.account_id, item_id: flipData.itemId,
        item_name: flipData.itemName, opened_time: flipData.opened_time,
        opened_quantity: flipData.opened_quantity, spent: flipData.spent,
        closed_time: flipData.closed_time, closed_quantity: flipData.closed_quantity,
        received_post_tax: flipData.received_post_tax, profit: flipData.profit,
        tax_paid: flipData.tax_paid, is_closed: flipData.is_closed,
        accountDisplayName: flipData.accountDisplayName
    }));

    return res.status(200).json(updatedFlipsForClient);
}

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
            allFlips.push({
                id: flipData.id || doc.id,
                account_id: flipData.account_id || 0,
                item_id: flipData.itemId,
                item_name: flipData.itemName,
                opened_time: flipData.opened_time,
                opened_quantity: flipData.opened_quantity || 0,
                spent: flipData.spent || 0,
                closed_time: flipData.closed_time || 0,
                closed_quantity: flipData.closed_quantity || 0,
                received_post_tax: flipData.received_post_tax || 0,
                profit: flipData.profit || 0,
                tax_paid: flipData.tax_paid || 0,
                is_closed: flipData.is_closed,
                accountDisplayName: flipData.accountDisplayName
            });
        });

        allFlips.sort((a, b) => (b.closed_time || 0) - (a.closed_time || 0));
        return res.status(200).json(allFlips);
    } catch (error) {
        console.error("handleLoadFlips: Error loading flips:", error);
        return res.status(500).json({ message: "Failed to load flips." });
    }
}

module.exports = {
    handleProfitTracking,
    handleLoadFlips,
};