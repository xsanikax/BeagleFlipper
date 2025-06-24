// tradingLogic.js - CORRECTED VERSION WITH ACCURATE PROFIT CALCULATIONS
// This file contains functions related to user-specific profit tracking and flip loading.
// FIXES: Precise profit calculation, proper tax handling, eliminates rounding errors

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const config = require('./tradingConfig');

/**
 * Calculates the Grand Exchange tax for a given item, price, and quantity.
 * Exempts specific items from tax.
 * @param {number} itemId - The ID of the item.
 * @param {number} price - The price per item.
 * @param {number} quantity - The quantity of items.
 * @returns {number} The calculated tax amount.
 */
function calculateTax(itemId, price, quantity) {
    if (config.TRADING_CONFIG.GE_TAX_EXEMPT_ITEMS && config.TRADING_CONFIG.GE_TAX_EXEMPT_ITEMS.has(itemId)) {
        return 0;
    }
    const totalAmount = price * quantity;
    const tax = Math.floor(totalAmount * config.TRADING_CONFIG.GE_TAX_RATE);
    return Math.min(tax, config.TRADING_CONFIG.GE_TAX_CAP);
}

/**
 * FIXED: Calculates tax on the total sell amount, not per transaction
 * @param {number} itemId - The ID of the item.
 * @param {number} totalSellAmount - Total amount from all sell transactions.
 * @returns {number} The calculated total tax amount.
 */
function calculateTotalTax(itemId, totalSellAmount) {
    if (config.TRADING_CONFIG.GE_TAX_EXEMPT_ITEMS && config.TRADING_CONFIG.GE_TAX_EXEMPT_ITEMS.has(itemId)) {
        return 0;
    }
    const tax = Math.floor(totalSellAmount * config.TRADING_CONFIG.GE_TAX_RATE);
    return Math.min(tax, config.TRADING_CONFIG.GE_TAX_CAP);
}

/**
 * Robustly converts a Firestore Timestamp, a number (milliseconds or seconds), null/undefined,
 * or a plain object representation of a Timestamp into a Unix timestamp in seconds.
 * @param {*} timestampValue - The value to convert.
 * @returns {number} Unix timestamp in seconds, or 0 if conversion fails or value is null/undefined.
 */
const convertToUnixSeconds = (timestampValue) => {
    if (timestampValue === null || timestampValue === undefined) {
        return 0;
    }

    // Case 1: Firestore Timestamp object
    if (timestampValue instanceof admin.firestore.Timestamp) {
        return Math.floor(timestampValue.toMillis() / 1000);
    }

    // Case 2: Plain JavaScript object from Firestore timestamp serialization
    if (typeof timestampValue === 'object' && timestampValue.hasOwnProperty('_seconds') && typeof timestampValue._seconds === 'number') {
        return timestampValue._seconds;
    }

    // Case 3: Number (could be seconds or milliseconds)
    if (typeof timestampValue === 'number') {
        if (timestampValue > 100000000000) { // Heuristic: if very large, assume milliseconds
            return Math.floor(timestampValue / 1000);
        }
        return timestampValue;
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
 * FIXED: Consistent handling of transaction amounts.
 * @param {object} transaction - The raw transaction object from the client.
 * @returns {object} The normalized transaction object.
 */
function normalizeTransaction(transaction) {
    // Generate a simple unique string ID if not provided
    transaction.id = transaction.id || (admin.firestore.Timestamp.now().toMillis().toString() + '-' + Math.random().toString(36).substring(2, 9));

    // Ensure numbers are parsed
    transaction.quantity = parseInt(transaction.quantity, 10) || 0;
    transaction.price = parseInt(transaction.price, 10) || 0;

    // FIXED: Always calculate total amount from price × quantity for consistency
    transaction.totalAmount = transaction.price * transaction.quantity;

    // Handle legacy amountSpent field but prioritize calculated total
    if (transaction.amountSpent || transaction.amount_spent) {
        const providedAmount = parseInt(transaction.amountSpent || transaction.amount_spent, 10) || 0;
        if (Math.abs(providedAmount - transaction.totalAmount) > 1) {
            console.warn(`Amount mismatch: provided ${providedAmount}, calculated ${transaction.totalAmount}. Using calculated value.`);
        }
    }

    transaction.time = convertToUnixSeconds(transaction.time);

    // Robustly get itemId and itemName from different possible field names
    transaction.itemId = transaction.itemId !== undefined ? transaction.itemId : transaction.item_id;
    transaction.itemName = transaction.itemName !== undefined ? transaction.itemName : (transaction.item_name || `Item ${transaction.itemId}`);
    transaction.itemId = parseInt(transaction.itemId, 10) || 0;

    return transaction;
}

/**
 * Creates a unique transaction identifier to prevent duplicates
 * @param {object} transaction - The transaction object
 * @returns {string} Unique transaction identifier
 */
function createTransactionHash(transaction) {
    return `${transaction.type}-${transaction.itemId}-${transaction.quantity}-${transaction.price}-${transaction.time}`;
}

/**
 * FIXED: Calculates profit with precise math and proper tax handling
 * @param {Array} transactionHistory - Array of all transactions for this flip
 * @param {number} itemId - The item ID for tax calculation
 * @returns {object} Calculated profit data
 */
function calculateFlipProfit(transactionHistory, itemId) {
    let totalBuyQuantity = 0;
    let totalBuyAmount = 0;
    let totalSellQuantity = 0;
    let totalSellAmount = 0;

    // Sum up all transactions precisely
    transactionHistory.forEach(tx => {
        const amount = tx.price * tx.quantity;
        if (tx.type === 'buy') {
            totalBuyQuantity += tx.quantity;
            totalBuyAmount += amount;
        } else if (tx.type === 'sell') {
            totalSellQuantity += tx.quantity;
            totalSellAmount += amount;
        }
    });

    // Calculate tax on total sell amount (not per transaction)
    const totalTaxPaid = calculateTotalTax(itemId, totalSellAmount);
    const netSellAmount = totalSellAmount - totalTaxPaid;

    let profit = 0;
    let costOfGoodsSold = 0;

    if (totalBuyQuantity > 0 && totalSellQuantity > 0) {
        // Calculate cost of goods sold based on quantity actually sold
        const avgBuyPrice = totalBuyAmount / totalBuyQuantity;
        costOfGoodsSold = Math.round(avgBuyPrice * totalSellQuantity);
        profit = netSellAmount - costOfGoodsSold;
    } else if (totalSellQuantity > 0 && totalBuyQuantity === 0) {
        // Edge case: selling without recorded buys
        profit = netSellAmount;
    }

    return {
        totalBuyQuantity,
        totalBuyAmount,
        totalSellQuantity,
        totalSellAmount,
        totalTaxPaid,
        netSellAmount,
        costOfGoodsSold,
        profit: Math.round(profit)
    };
}

/**
 * FIXED: Processes transactions for profit tracking with accurate calculations.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @param {object} context - Context object containing the Firestore database instance.
 * @returns {Promise<void>} A promise that resolves when the processing is complete.
 */
async function handleProfitTracking(req, res, { db }) {
    const displayName = req.query.display_name || req.body.display_name;
    const incomingTransactions = req.body;

    console.log("handleProfitTracking: Function invoked.");
    console.log(`handleProfitTracking: Incoming transactions length: ${incomingTransactions ? incomingTransactions.length : 'undefined'}`);

    if (!displayName) {
        console.error("handleProfitTracking: Display name missing");
        return res.status(400).json({ message: "Display name is required." });
    }
    if (!Array.isArray(incomingTransactions)) {
        console.error("handleProfitTracking: Invalid request body, expected an array of transactions");
        return res.status(400).json({ message: "Invalid request body: expected an array of transactions." });
    }

    console.log(`handleProfitTracking: Processing ${incomingTransactions.length} transactions for user: ${displayName}`);

    const userFlipsCollectionRef = db.collection('users').doc(displayName).collection('flips');
    const batch = db.batch();
    const currentFlipsState = new Map(); // Track current state of flips being processed
    const processedTransactionHashes = new Set(); // Prevent duplicate transaction processing

    for (let transaction of incomingTransactions) {
        try {
            // Normalize transaction data first
            transaction = normalizeTransaction(transaction);

            // Check for duplicate transactions
            const transactionHash = createTransactionHash(transaction);
            if (processedTransactionHashes.has(transactionHash)) {
                console.log(`Skipping duplicate transaction: ${transactionHash}`);
                continue;
            }
            processedTransactionHashes.add(transactionHash);

            console.log(`Processing ${transaction.type} transaction: ${transaction.quantity} x ${transaction.itemName} at ${transaction.price} gp each (Total: ${transaction.totalAmount} gp)`);

            let flipData;
            let flipDocRef;

            // Look for existing flip - only one open flip per item per user
            const itemKey = transaction.itemId.toString();

            if (currentFlipsState.has(itemKey)) {
                // Use flip from current processing state
                flipData = currentFlipsState.get(itemKey);
                flipDocRef = flipData.docRef;
                console.log(`Using existing flip from current state for ${flipData.itemName}`);
            } else {
                // Try to find an existing open flip in Firestore
                const openFlipSnapshot = await userFlipsCollectionRef
                    .where('itemId', '==', transaction.itemId)
                    .where('isClosed', '==', false)
                    .limit(1)
                    .get();

                if (!openFlipSnapshot.empty) {
                    // Found existing open flip
                    flipDocRef = openFlipSnapshot.docs[0].ref;
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
                        isClosed: fetchedData.isClosed === undefined ? false : fetchedData.isClosed,
                        accountDisplayName: fetchedData.accountDisplayName,
                        transactionsHistory: fetchedData.transactionsHistory || [],
                        docRef: flipDocRef
                    };
                    console.log(`Found existing open flip for ${flipData.itemName} with ${flipData.transactionsHistory.length} existing transactions`);
                } else {
                    // Create new flip
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
                        transactionsHistory: [],
                        docRef: flipDocRef
                    };
                    console.log(`Creating new flip for ${transaction.itemName}`);
                }
            }

            // Store in current state map
            currentFlipsState.set(itemKey, flipData);

            // Check if this exact transaction already exists in the flip's history
            const existingTransaction = flipData.transactionsHistory.find(tx =>
                tx.type === transaction.type &&
                tx.quantity === transaction.quantity &&
                tx.price === transaction.price &&
                Math.abs(tx.time - transaction.time) < 5 // Within 5 seconds
            );

            if (existingTransaction) {
                console.log(`Transaction already exists in flip history, skipping: ${transaction.type} ${transaction.quantity} x ${transaction.itemName}`);
                continue;
            }

            // Add transaction to flip's history
            if (!Array.isArray(flipData.transactionsHistory)) {
                flipData.transactionsHistory = [];
            }

            flipData.transactionsHistory.push({
                id: transaction.id,
                type: transaction.type,
                quantity: transaction.quantity,
                price: transaction.price,
                totalAmount: transaction.totalAmount,
                time: convertToUnixSeconds(transaction.time)
            });

            // Trim transaction history if too long
            if (flipData.transactionsHistory.length > config.TRADING_CONFIG.MAX_TRANSACTION_HISTORY_PER_FLIP) {
                flipData.transactionsHistory = flipData.transactionsHistory.slice(-config.TRADING_CONFIG.MAX_TRANSACTION_HISTORY_PER_FLIP);
            }

            // FIXED: Use precise profit calculation
            const profitData = calculateFlipProfit(flipData.transactionsHistory, flipData.itemId);

            // Update flip data with calculated values
            flipData.openedQuantity = profitData.totalBuyQuantity;
            flipData.spent = profitData.totalBuyAmount;
            flipData.closedQuantity = profitData.totalSellQuantity;
            flipData.taxPaid = profitData.totalTaxPaid;
            flipData.receivedPostTax = profitData.netSellAmount;
            flipData.profit = profitData.profit;

            // Set closed time if we have sells
            if (profitData.totalSellQuantity > 0) {
                const sellTransactions = flipData.transactionsHistory.filter(tx => tx.type === 'sell');
                flipData.closedTime = Math.max(...sellTransactions.map(tx => tx.time));
            }

            // Determine if flip is closed
            if (profitData.totalBuyQuantity > 0 && profitData.totalSellQuantity >= profitData.totalBuyQuantity) {
                flipData.isClosed = true;
                console.log(`Flip completed: All ${profitData.totalBuyQuantity} items sold`);
            } else {
                flipData.isClosed = false;
                console.log(`Flip ongoing: ${profitData.totalSellQuantity}/${profitData.totalBuyQuantity} items sold`);
            }

            // Log detailed profit calculation
            console.log(`PROFIT CALCULATION for ${flipData.itemName}:`);
            console.log(`  Buy: ${profitData.totalBuyQuantity} items for ${profitData.totalBuyAmount} gp total`);
            console.log(`  Sell: ${profitData.totalSellQuantity} items for ${profitData.totalSellAmount} gp gross`);
            console.log(`  Tax: ${profitData.totalTaxPaid} gp (${((profitData.totalTaxPaid / profitData.totalSellAmount) * 100).toFixed(2)}%)`);
            console.log(`  Net Revenue: ${profitData.netSellAmount} gp`);
            console.log(`  Cost of Goods Sold: ${profitData.costOfGoodsSold} gp`);
            console.log(`  PROFIT: ${profitData.profit} gp`);

            // Add to batch for saving
            if (flipData.docRef) {
                const { docRef, ...dataToSave } = flipData;
                batch.set(docRef, dataToSave, { merge: true });
            }

        } catch (error) {
            console.error(`Error processing transaction for ${displayName}:`, transaction, error);
        }
    }

    // Commit batch
    try {
        await batch.commit();
        console.log(`Batch commit successful for ${displayName}.`);
    } catch (error) {
        console.error(`Error committing batch for ${displayName}:`, error);
        return res.status(500).json({ message: "Failed to save profit data due to database error." });
    }

    // Prepare response with snake_case keys for client compatibility
    const updatedFlipsToReturn = Array.from(currentFlipsState.values()).map(flipDataEntry => {
        const { docRef, ...cleanedFlipData } = flipDataEntry;

        const transactionsHistoryForClient = (cleanedFlipData.transactionsHistory || []).map(t => ({
            id: t.id,
            type: t.type,
            quantity: t.quantity,
            price: t.price,
            amount_spent: t.totalAmount || t.amountSpent,
            time: convertToUnixSeconds(t.time)
        }));

        return {
            id: cleanedFlipData.id,
            account_id: cleanedFlipData.accountId || 0,
            item_id: cleanedFlipData.itemId,
            item_name: cleanedFlipData.itemName,
            opened_time: convertToUnixSeconds(cleanedFlipData.openedTime),
            opened_quantity: cleanedFlipData.openedQuantity || 0,
            spent: cleanedFlipData.spent || 0,
            closed_time: convertToUnixSeconds(cleanedFlipData.closedTime),
            closed_quantity: cleanedFlipData.closedQuantity || 0,
            received_post_tax: cleanedFlipData.receivedPostTax || 0,
            profit: cleanedFlipData.profit || 0,
            tax_paid: cleanedFlipData.taxPaid || 0,
            is_closed: cleanedFlipData.isClosed === undefined ? true : cleanedFlipData.isClosed,
            account_display_name: cleanedFlipData.accountDisplayName,
            transactions_history: transactionsHistoryForClient
        };
    });

    console.log(`Successfully processed transactions. Responding with ${updatedFlipsToReturn.length} updated flips.`);
    return res.status(200).json(updatedFlipsToReturn);
}

/**
 * Fetches historical flip data from Firestore for the logged-in user.
 * This function fetches only fully closed flips.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @param {object} context - Context object containing the Firestore database instance.
 * @returns {Promise<void>} A promise that resolves when the fetching is complete.
 */
async function handleLoadFlips(req, res, { db }) {
    const displayNameFromClient = req.query.display_name;

    console.log("handleLoadFlips: Function invoked.");

    if (!displayNameFromClient) {
        return res.status(400).json({ message: "Display name is required in query." });
    }

    try {
        const userFlipsCollectionRef = db.collection('users').doc(displayNameFromClient).collection('flips');

        // Fetch only fully closed flips
        const flipsSnapshot = await userFlipsCollectionRef
            .where('isClosed', '==', true)
            .orderBy('closedTime', 'desc')
            .limit(config.TRADING_CONFIG.FLIP_LOAD_LIMIT)
            .get();

        const allFlips = [];
        flipsSnapshot.forEach(doc => {
            const flipData = doc.data();

            const transactionsHistoryForClient = (flipData.transactionsHistory || []).map(t => ({
                id: t.id,
                type: t.type,
                quantity: t.quantity,
                price: t.price,
                amount_spent: t.totalAmount || t.amountSpent,
                time: convertToUnixSeconds(t.time)
            }));

            allFlips.push({
                id: flipData.id || doc.id,
                account_id: flipData.accountId || 0,
                item_id: flipData.itemId,
                item_name: flipData.itemName || `Item ${flipData.itemId}`,
                opened_time: convertToUnixSeconds(flipData.openedTime),
                opened_quantity: flipData.openedQuantity || 0,
                spent: flipData.spent || 0,
                closed_time: convertToUnixSeconds(flipData.closedTime),
                closed_quantity: flipData.closedQuantity || 0,
                received_post_tax: flipData.receivedPostTax || 0,
                profit: flipData.profit || 0,
                tax_paid: flipData.taxPaid || 0,
                is_closed: flipData.isClosed === undefined ? true : flipData.isClosed,
                account_display_name: flipData.accountDisplayName || displayNameFromClient,
                transactions_history: transactionsHistoryForClient
            });
        });

        console.log(`handleLoadFlips: Responding with ${allFlips.length} closed flips.`);
        return res.status(200).json(allFlips);
    } catch (error) {
        console.error("handleLoadFlips: Error loading flips for user", displayNameFromClient, ":", error);
        return res.status(500).json({ message: "Failed to load flips." });
    }
}

// Export the functions
module.exports = {
    handleProfitTracking,
    handleLoadFlips,
};