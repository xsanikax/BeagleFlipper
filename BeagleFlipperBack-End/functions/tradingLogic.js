// tradingLogic.js
// This file contains functions related to user-specific profit tracking and flip loading.
// FIXED VERSION - Only processes SELL transactions for profit tracking while maintaining all database saves

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore'); // Import FieldValue for serverTimestamp
const config = require('./tradingConfig'); // Import centralized configuration

/**
 * Calculates the Grand Exchange tax for a given item, price, and quantity.
 * Exempts specific items from tax.
 * @param {number} itemId - The ID of the item.
 * @param {number} price - The price per item.
 * @param {number} quantity - The quantity of items.
 * @returns {number} The calculated tax amount.
 */
function calculateTax(itemId, price, quantity) {
    if (config.TRADING_CONFIG.GE_TAX_EXEMPT_ITEMS && config.TRADING_CONFIG.GE_TAX_EXEMPT_ITEMS.has(itemId)) { // Use config.TRADING_CONFIG
        return 0;
    }
    const totalAmount = price * quantity;
    const tax = Math.floor(totalAmount * config.TRADING_CONFIG.GE_TAX_RATE); // Use config.TRADING_CONFIG
    // Cap the tax as per OSRS GE mechanics
    return Math.min(tax, config.TRADING_CONFIG.GE_TAX_CAP); // Use config.TRADING_CONFIG
}

/**
 * Robustly converts a Firestore Timestamp, a number (milliseconds or seconds), null/undefined,
 * or a plain object representation of a Timestamp (e.g., {_seconds: X, _nanoseconds: Y})
 * into a Unix timestamp in seconds. This is crucial for matching Java 'int' type expectations.
 * @param {*} timestampValue - The value to convert.
 * @returns {number} Unix timestamp in seconds, or 0 if conversion fails or value is null/undefined.
 */
const convertToUnixSeconds = (timestampValue) => {
    if (timestampValue === null || timestampValue === undefined) {
        return 0; // Explicitly return 0 for null or undefined timestamps
    }

    // Case 1: Firestore Timestamp object
    if (timestampValue instanceof admin.firestore.Timestamp) {
        return Math.floor(timestampValue.toMillis() / 1000);
    }

    // Case 2: Plain JavaScript object from Firestore timestamp serialization (e.g., {_seconds: X, _nanoseconds: Y})
    if (typeof timestampValue === 'object' && timestampValue.hasOwnProperty('_seconds') && typeof timestampValue._seconds === 'number') {
        return timestampValue._seconds; // Firestore Timestamps stored as objects directly expose seconds
    }

    // Case 3: Number (could be seconds or milliseconds)
    if (typeof timestampValue === 'number') {
        if (timestampValue > 100000000000) { // Heuristic: if very large, assume milliseconds
            return Math.floor(timestampValue / 1000);
        }
        return timestampValue; // Assume it's already in seconds
    }

    // Case 4: String date (for robustness)
    if (typeof timestampValue === 'string') {
        const parsedDate = new Date(timestampValue);
        if (!isNaN(parsedDate.getTime())) {
            return Math.floor(parsedDate.getTime() / 1000);
        }
    }

    console.warn("convertToUnixSeconds: Unexpected timestamp format detected, returning 0:", timestampValue);
    return 0;
};

/**
 * Normalizes an incoming transaction into a standard format.
 * Ensures numeric fields are parsed as integers and 'time' is always a Unix timestamp (seconds).
 * Generates a simple string ID if not provided.
 * IMPORTANT: Made more robust to handle mixed camelCase/snake_case input from client for item IDs/names.
 * @param {object} transaction - The raw transaction object from the client.
 * @returns {object} The normalized transaction object.
 */
function normalizeTransaction(transaction) {
    // Generate a simple unique string ID. This is NOT a UUID.
    transaction.id = transaction.id || (admin.firestore.Timestamp.now().toMillis().toString() + '-' + Math.random().toString(36).substring(2, 9));

    // Ensure numbers are parsed. Client sends camelCase fields in transaction body.
    transaction.quantity = parseInt(transaction.quantity, 10) || 0;
    transaction.price = parseInt(transaction.price, 10) || 0;
    // Robustly get amountSpent, checking both camelCase and snake_case from client payload
    transaction.amountSpent = parseInt(transaction.amountSpent || transaction.amount_spent, 10) || 0;

    transaction.time = convertToUnixSeconds(transaction.time);

    // CRITICAL FIX: Robustly get itemId and itemName from incoming transaction.
    // Client sends `item_id` and `item_name` (snake_case) but also `itemId` (camelCase) which might be undefined.
    // Prioritize the correct existing value, fall back to the other naming convention.
    transaction.itemId = transaction.itemId !== undefined ? transaction.itemId : transaction.item_id;
    transaction.itemName = transaction.itemName !== undefined ? transaction.itemName : (transaction.item_name || `Item ${transaction.itemId}`);

    // Ensure final itemId is a number, not undefined, for Firestore queries.
    transaction.itemId = parseInt(transaction.itemId, 10) || 0;

    return transaction;
}

/**
 * FIXED VERSION: Only processes SELL transactions for profit tracking.
 * Buy orders are completely ignored to prevent pollution of the profit tracker.
 * Processes an array of incoming client transactions and saves/updates aggregated flip data in Firestore.
 * This function handles both creating new flips and updating existing ones, ensuring data consistency
 * and correct profit calculation. IDs are handled as simple strings.
 * This version strictly uses the 'flips' collection and does NOT create a separate 'transactions' collection.
 * All saved keys and returned keys are camelCase.
 * IMPORTANT: Removed session data persistence logic.
 * @param {object} req - The Express request object. Expected to contain display_name in query and an array of transactions in body.
 * @param {object} res - The Express response object.
 * @param {object} context - Context object containing the Firestore database instance.
 * @returns {Promise<void>} A promise that resolves when the processing is complete.
 */
async function handleProfitTracking(req, res, { db }) {
    // Get display_name from query parameters (primary) or body
    const displayName = req.query.display_name || req.body.display_name;
    const incomingTransactions = req.body; // Expecting an array of transaction objects

    console.log("handleProfitTracking: Function invoked.");
    console.log("handleProfitTracking: req.query:", req.query);
    console.log(`handleProfitTracking: Incoming transactions length: ${incomingTransactions ? incomingTransactions.length : 'undefined'}`);
    if (Array.isArray(incomingTransactions) && incomingTransactions.length > 0) {
        console.log(`handleProfitTracking: Incoming transactions (first 5 items): ${JSON.stringify(incomingTransactions.slice(0, 5), null, 2)}`);
    } else {
        console.log("handleProfitTracking: Incoming transactions array is empty or not an array.");
    }

    if (!displayName) {
        console.error("handleProfitTracking: Display name missing for user:", req.user ? req.user.uid : "unknown");
        return res.status(400).json({ message: "Display name is required." });
    }
    if (!Array.isArray(incomingTransactions)) {
        console.error("handleProfitTracking: Invalid request body, expected an array of transactions for user:", displayName);
        return res.status(400).json({ message: "Invalid request body: expected an array of transactions." });
    }

    // FILTER OUT BUY TRANSACTIONS - Only process sells for profit tracking
    const sellTransactions = incomingTransactions.filter(transaction => {
        const normalizedTx = normalizeTransaction({ ...transaction });
        return normalizedTx.type === 'sell';
    });

    console.log(`handleProfitTracking: Filtered to ${sellTransactions.length} sell transactions out of ${incomingTransactions.length} total transactions for user: ${displayName}. Buy orders are ignored to prevent profit tracker pollution.`);

    if (sellTransactions.length === 0) {
        console.log("handleProfitTracking: No sell transactions to process. Buy orders are ignored.");
        return res.status(200).json({
            message: "No sell transactions to process. Profit tracker only records completed sales to avoid pollution from buy orders.",
            flips: []
        });
    }

    const userFlipsCollectionRef = db.collection('users').doc(displayName).collection('flips');
    const batch = db.batch();
    const currentFlipsState = new Map(); // Map to track current state of flips being processed

    for (let transaction of sellTransactions) {
        try {
            // Normalize transaction data first, ensuring string IDs and Unix timestamps, and camelCase fields
            transaction = normalizeTransaction(transaction);

            // --- Logic to find/create/update the aggregated flip document (all-time history) ---
            let flipData; // Will be populated from Firestore or new
            let flipDocRef; // Document reference for the flip

            // Try to find an existing open flip, querying with camelCase itemId
            const openFlipSnapshot = await userFlipsCollectionRef
                .where('itemId', '==', transaction.itemId) // Use camelCase
                .where('isClosed', '==', false)           // Use camelCase
                .orderBy('openedTime')                    // Use camelCase
                .limit(1)
                .get();

            if (!openFlipSnapshot.empty) {
                flipDocRef = openFlipSnapshot.docs[0].ref;
                // Read existing data, already in camelCase from Firestore
                const fetchedData = openFlipSnapshot.docs[0].data();
                flipData = {
                    id: fetchedData.id,
                    accountId: fetchedData.accountId || 0,
                    itemId: fetchedData.itemId,
                    itemName: fetchedData.itemName,
                    openedTime: convertToUnixSeconds(fetchedData.openedTime),
                    openedQuantity: fetchedData.openedQuantity || 0,
                    spent: fetchedData.spent || 0,
                    closedTime: convertToUnixSeconds(fetchedData.closedTime),
                    closedQuantity: fetchedData.closedQuantity || 0,
                    receivedPostTax: fetchedData.receivedPostTax || 0,
                    profit: fetchedData.profit || 0,
                    taxPaid: fetchedData.taxPaid || 0,
                    isClosed: fetchedData.isClosed === undefined ? false : fetchedData.isClosed, // Ensure boolean, default to false (open)
                    accountDisplayName: fetchedData.accountDisplayName,
                    transactionsHistory: fetchedData.transactionsHistory || [], // Use transactionsHistory
                    docRef: flipDocRef
                };
                console.log(`handleProfitTracking: Found existing open flip for ${flipData.itemName || transaction.itemName}.`);
            } else {
                // No open flip found, create a new one
                const newFlipId = userFlipsCollectionRef.doc().id;
                flipDocRef = userFlipsCollectionRef.doc(newFlipId);
                flipData = {
                    id: newFlipId,
                    accountId: transaction.accountId || 0,
                    itemId: transaction.itemId,
                    itemName: transaction.itemName,
                    openedTime: convertToUnixSeconds(transaction.time),
                    openedQuantity: 0,
                    spent: 0,
                    closedTime: 0,
                    closedQuantity: 0,
                    receivedPostTax: 0,
                    profit: 0,
                    taxPaid: 0,
                    isClosed: false,
                    accountDisplayName: displayName,
                    transactionsHistory: [], // Use transactionsHistory
                    docRef: flipDocRef
                };
                console.log(`handleProfitTracking: Creating new flip with string ID ${newFlipId} for ${transaction.itemName}.`);
            }
            currentFlipsState.set(transaction.itemId, flipData); // Map by camelCase itemId

            // Add transaction to flip's history (transaction data already camelCase from normalizeTransaction)
            if (!Array.isArray(flipData.transactionsHistory)) {
                flipData.transactionsHistory = [];
            }
            flipData.transactionsHistory.push({
                id: transaction.id,
                type: transaction.type,
                quantity: transaction.quantity,
                price: transaction.price,
                amountSpent: transaction.amountSpent, // Use camelCase
                time: convertToUnixSeconds(transaction.time)
            });

            // Trim transactionsHistory to prevent overly large documents
            if (flipData.transactionsHistory.length > config.TRADING_CONFIG.MAX_TRANSACTION_HISTORY_PER_FLIP) { // Use config
                flipData.transactionsHistory = flipData.transactionsHistory.slice(-config.TRADING_CONFIG.MAX_TRANSACTION_HISTORY_PER_FLIP); // Use config
                console.warn(`handleProfitTracking: Trimmed transactionsHistory for flip ${flipData.id} to ${config.TRADING_CONFIG.MAX_TRANSACTION_HISTORY_PER_FLIP} entries.`); // Use config
            }
            console.log(`handleProfitTracking: Flip ${flipData.id} transactionsHistory length: ${flipData.transactionsHistory.length}`);

            // --- ACCURATE PROFIT CALCULATION FIX ---
            // Recalculate all totals from the transaction history every time to ensure accuracy.
            let totalSpent = 0;
            let totalReceived = 0;
            let totalBuyQuant = 0;
            let totalSellQuant = 0;
            let totalTax = 0;

            flipData.transactionsHistory.forEach(tx => {
                if (tx.type === 'buy') {
                    totalBuyQuant += tx.quantity;
                    totalSpent += tx.amountSpent;
                } else if (tx.type === 'sell') {
                    const tax = calculateTax(flipData.itemId, tx.price, tx.quantity);
                    totalSellQuant += tx.quantity;
                    totalReceived += tx.amountSpent - tax;
                    totalTax += tax;
                }
            });

            // Update the flipData object with the fresh, accurate totals.
            flipData.openedQuantity = totalBuyQuant;
            flipData.spent = totalSpent;
            flipData.closedQuantity = totalSellQuant;
            flipData.receivedPostTax = totalReceived;
            flipData.taxPaid = totalTax;
            flipData.closedTime = (totalSellQuant > 0) ? convertToUnixSeconds(transaction.time) : 0;

            // Determine if the flip is closed and calculate final profit
            if (flipData.openedQuantity > 0 && flipData.closedQuantity >= flipData.openedQuantity) {
                flipData.isClosed = true;
                // Final profit is guaranteed to be accurate
                flipData.profit = Math.round(flipData.receivedPostTax - flipData.spent);
            } else {
                flipData.isClosed = false;
                // Calculate profit for a partially completed flip
                if(totalBuyQuant > 0) {
                    const avgBuyPrice = totalSpent / totalBuyQuant;
                    const costOfGoodsSold = avgBuyPrice * totalSellQuant;
                    flipData.profit = Math.round(totalReceived - costOfGoodsSold);
                } else {
                    flipData.profit = 0;
                }
            }

            // Add or update the aggregated flip document in the batch (saving camelCase)
            if (flipData.docRef) {
                 const { docRef, ...dataToSave } = flipData;
                 batch.set(docRef, dataToSave, { merge: true }); // dataToSave already has camelCase keys
            } else {
                console.error(`handleProfitTracking: Invalid docRef for flipData during batch.set for item ${transaction.itemId}. Skipping this transaction for batch commit.`);
            }

        } catch (error) {
            console.error(`handleProfitTracking: Error processing transaction for ${displayName}:`, transaction, error);
        }
    }

    try {
        await batch.commit();
        console.log(`handleProfitTracking: Batch commit successful for ${displayName}.`);
    } catch (error) {
        console.error(`handleProfitTracking: Error committing batch for ${displayName}:`, error);
        return res.status(500).json({ message: "Failed to save profit data due to database error." });
    }

    // Prepare response: Construct response with snake_case keys for client (as per your previous setup)
    const updatedFlipsToReturn = Array.from(currentFlipsState.values()).map(flipDataEntry => {
        const { docRef, ...cleanedFlipData } = flipDataEntry;

        const transactionsHistoryForClient = (cleanedFlipData.transactionsHistory || []).map(t => ({
            id: t.id,
            type: t.type,
            quantity: t.quantity,
            price: t.price,
            amount_spent: t.amountSpent, // Convert to snake_case
            time: convertToUnixSeconds(t.time)
        }));

        return {
            id: cleanedFlipData.id || (flipDataEntry.docRef ? flipDataEntry.docRef.id : ''),
            account_id: cleanedFlipData.accountId || 0,        // Convert to snake_case
            item_id: cleanedFlipData.itemId,                    // Convert to snake_case
            item_name: cleanedFlipData.itemName,                // Convert to snake_case
            opened_time: convertToUnixSeconds(cleanedFlipData.openedTime), // Convert to snake_case
            opened_quantity: cleanedFlipData.openedQuantity || 0, // Convert to snake_case
            spent: cleanedFlipData.spent || 0,
            closed_time: convertToUnixSeconds(cleanedFlipData.closedTime), // Convert to snake_case
            closed_quantity: cleanedFlipData.closedQuantity || 0, // Convert to snake_case
            received_post_tax: cleanedFlipData.receivedPostTax || 0, // Convert to snake_case
            profit: cleanedFlipData.profit || 0,
            tax_paid: cleanedFlipData.taxPaid || 0,             // Convert to snake_case
            is_closed: cleanedFlipData.isClosed === undefined ? true : cleanedFlipData.isClosed, // Convert to snake_case
            account_display_name: cleanedFlipData.accountDisplayName || displayName, // Convert to snake_case
            transactions_history: transactionsHistoryForClient // Convert to snake_case
        };
    });

    console.log(`handleProfitTracking: Successfully processed ${sellTransactions.length} sell transactions. Responding with ${updatedFlipsToReturn.length} updated flips. Buy orders were ignored to prevent profit tracker pollution.`);
    return res.status(200).json(updatedFlipsToReturn);
}

/**
 * Fetches historical flip data from Firestore for the logged-in user.
 * This function will now ONLY fetch fully closed flips.
 * All fetched keys are camelCase, but converted to snake_case for the response.
 * IMPORTANT: Removed session data fetching.
 * @param {object} req - The Express request object. Expected to contain display_name in query.
 * @param {object} res - The Express response object.
 * @param {object} context - Context object containing the Firestore database instance.
 * @returns {Promise<void>} A promise that resolves when the fetching is complete.
 */
async function handleLoadFlips(req, res, { db }) {
    const displayNameFromClient = req.query.display_name;

    console.log("handleLoadFlips: Function invoked.");
    console.log("handleLoadFlips: req.query:", req.query);

    if (!displayNameFromClient) {
        return res.status(400).json({ message: "Display name is required in query." });
    }

    try {
        const userFlipsCollectionRef = db.collection('users').doc(displayNameFromClient).collection('flips');

        // Fetch ONLY fully closed flips (isClosed == true).
        // Order by closedTime descending to get the most recent completed flips.
        const flipsSnapshot = await userFlipsCollectionRef
            .where('isClosed', '==', true)   // Query with camelCase
            .orderBy('closedTime', 'desc')     // Order by camelCase
            .limit(config.TRADING_CONFIG.FLIP_LOAD_LIMIT) // Use config
            .get();

        const allFlips = [];
        flipsSnapshot.forEach(doc => {
            const flipData = doc.data(); // Data from Firestore is in camelCase

            const transactionsHistoryForClient = (flipData.transactionsHistory || []).map(t => ({
                id: t.id,
                type: t.type,
                quantity: t.quantity,
                price: t.price,
                amount_spent: t.amountSpent, // Convert to snake_case
                time: convertToUnixSeconds(t.time)
            }));

            allFlips.push({
                id: flipData.id || doc.id,
                account_id: flipData.accountId || 0,        // Convert to snake_case
                item_id: flipData.itemId,                     // Convert to snake_case
                item_name: flipData.itemName || `Item ${flipData.itemId}`, // Convert to snake_case
                opened_time: convertToUnixSeconds(flipData.openedTime), // Convert to snake_case
                opened_quantity: flipData.openedQuantity || 0, // Convert to snake_case
                spent: flipData.spent || 0,
                closed_time: convertToUnixSeconds(flipData.closedTime), // Convert to snake_case
                closed_quantity: flipData.closedQuantity || 0, // Convert to snake_case
                received_post_tax: flipData.receivedPostTax || 0, // Convert to snake_case
                profit: flipData.profit || 0,
                tax_paid: flipData.taxPaid || 0,              // Convert to snake_case
                is_closed: flipData.isClosed === undefined ? true : flipData.isClosed, // Convert to snake_case
                account_display_name: flipData.accountDisplayName || displayNameFromClient, // Convert to snake_case
                transactions_history: transactionsHistoryForClient // Convert to snake_case
            });
        });

        // Results are already sorted and limited by Firestore query.

        console.log(`handleLoadFlips: Responding with ${allFlips.length} closed flips (limited to ${config.TRADING_CONFIG.FLIP_LOAD_LIMIT}).`); // Use config

        console.log("handleLoadFlips: First 5 flips returned to client:", JSON.stringify(allFlips.slice(0, 5), null, 2));

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