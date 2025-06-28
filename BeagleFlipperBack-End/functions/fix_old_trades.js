// cleanup_trades.js
// A one-time script to standardize all existing flip data in Firestore.

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// --- Configuration ---
const DISPLAY_NAME = "DaBeagleBoss"; // The user whose data we are cleaning.

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- Main Cleanup Function ---
async function cleanupUserTrades(displayName) {
  console.log(`Starting cleanup for user: ${displayName}...`);
  const userFlipsCollectionRef = db.collection('users').doc(displayName).collection('flips');
  const snapshot = await userFlipsCollectionRef.get();

  if (snapshot.empty) {
    console.log("No trades found to clean. Exiting.");
    return;
  }

  const batch = db.batch();
  let cleanCount = 0;

  console.log(`Found ${snapshot.docs.length} trades to process.`);

  snapshot.forEach(doc => {
    const oldData = doc.data();
    let needsUpdate = false;

    // Create a new, clean data object with a consistent camelCase format.
    const newData = {};

    // ID - This is the document ID, not in the data itself.
    newData.id = doc.id;

    // --- Clean up all known fields, checking for snake_case and camelCase variants ---

    // itemId
    const itemId = oldData.item_id || oldData.itemId;
    if (itemId !== oldData.itemId) needsUpdate = true;
    newData.itemId = typeof itemId === 'number' ? itemId : 0;

    // itemName
    const itemName = oldData.item_name || oldData.itemName;
    if (itemName !== oldData.itemName) needsUpdate = true;
    newData.itemName = typeof itemName === 'string' ? itemName : 'Unknown';

    // spent
    const spent = oldData.spent;
    newData.spent = typeof spent === 'number' ? spent : 0;
    
    // profit
    const profit = oldData.profit;
    newData.profit = typeof profit === 'number' ? profit : 0;

    // taxPaid
    const taxPaid = oldData.tax_paid || oldData.taxPaid;
    if(taxPaid !== oldData.taxPaid) needsUpdate = true;
    newData.taxPaid = typeof taxPaid === 'number' ? taxPaid : 0;

    // openedQuantity
    const openedQuantity = oldData.opened_quantity || oldData.openedQuantity;
    if(openedQuantity !== oldData.openedQuantity) needsUpdate = true;
    newData.openedQuantity = typeof openedQuantity === 'number' ? openedQuantity : 0;
    
    // closedQuantity
    const closedQuantity = oldData.closed_quantity || oldData.closedQuantity;
    if(closedQuantity !== oldData.closedQuantity) needsUpdate = true;
    newData.closedQuantity = typeof closedQuantity === 'number' ? closedQuantity : 0;

    // receivedPostTax
    const receivedPostTax = oldData.received_post_tax || oldData.receivedPostTax;
    if(receivedPostTax !== oldData.receivedPostTax) needsUpdate = true;
    newData.receivedPostTax = typeof receivedPostTax === 'number' ? receivedPostTax : 0;
    
    // accountId
    const accountId = oldData.account_id || oldData.accountId;
    if(accountId !== oldData.accountId) needsUpdate = true;
    newData.accountId = typeof accountId === 'number' ? accountId : 0;

    // accountDisplayName
    const accountDisplayName = oldData.accountDisplayName || displayName;
    newData.accountDisplayName = typeof accountDisplayName === 'string' ? accountDisplayName : displayName;

    // isClosed
    const isClosed = oldData.is_closed || oldData.isClosed;
    if(isClosed !== oldData.isClosed) needsUpdate = true;
    newData.isClosed = typeof isClosed === 'boolean' ? isClosed : false;


    // --- Special handling for Timestamps ---
    
    // openedTime
    const oldOpenedTime = oldData.opened_time || oldData.openedTime;
    if (oldOpenedTime instanceof admin.firestore.Timestamp) {
      newData.openedTime = oldOpenedTime; // It's already in the correct format
    } else if (typeof oldOpenedTime === 'number') {
      newData.openedTime = admin.firestore.Timestamp.fromMillis(oldOpenedTime * 1000);
      needsUpdate = true;
    } else {
      newData.openedTime = admin.firestore.Timestamp.fromMillis(0);
      needsUpdate = true;
    }

    // closedTime
    const oldClosedTime = oldData.closed_time || oldData.closedTime;
     if (oldClosedTime instanceof admin.firestore.Timestamp) {
      newData.closedTime = oldClosedTime; // Correct format
    } else if (typeof oldClosedTime === 'number' && oldClosedTime > 0) {
      newData.closedTime = admin.firestore.Timestamp.fromMillis(oldClosedTime * 1000);
      needsUpdate = true;
    } else {
      newData.closedTime = null; // Default to null if invalid or zero
      if (oldClosedTime !== null) needsUpdate = true;
    }

    if (needsUpdate) {
        cleanCount++;
        batch.set(userFlipsCollectionRef.doc(doc.id), newData);
    }
  });

  if (cleanCount > 0) {
    console.log(`Standardizing ${cleanCount} out of ${snapshot.docs.length} trades...`);
    await batch.commit();
    console.log("Cleanup successful! All trade data has been standardized.");
  } else {
    console.log("All trade data is already in the correct format. No changes needed.");
  }
}

// Run the cleanup
cleanupUserTrades(DISPLAY_NAME).catch(console.error);