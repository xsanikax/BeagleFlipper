const { Firestore } = require('@google-cloud/firestore');

// Initialize the client using the lower-level Firestore library
const db = new Firestore({
    keyFilename: './serviceAccountKey.json',
    projectId: 'our-vigil-461919-m0'
});


// This function calculates tax exactly like in your tradingLogic.js
function calculateTax(itemId, price, quantity) {
    const totalAmount = price * quantity;
    const tax = Math.floor(totalAmount * 0.02); // Assumes 2% tax rate
    return Math.min(tax, 5000000); // Assumes 5m tax cap
}

async function fixCorruptedFlips() {
  console.log("Starting the process to fix corrupted flip data (using direct Firestore client)...");
  
  const usersSnapshot = await db.collection("users").get();
  let totalFlipsCorrected = 0;

  if (usersSnapshot.empty) {
    console.log("\nERROR: No users found in the database.");
    console.log("This is the final test. If this fails, the issue is with the project's core network/firewall settings or a deeper configuration problem.");
    return;
  }

  console.log(`\nSUCCESS: Connection successful. Found ${usersSnapshot.docs.length} user(s). Iterating through them now...`);

  for (const userDoc of usersSnapshot.docs) {
    const username = userDoc.id;
    // Looking in the 'flips' collection now.
    const flipsSnapshot = await db.collection("users").doc(username).collection("flips").get();

    if (flipsSnapshot.empty) {
      console.log(`- User '${username}' has no flips to process. Skipping.`);
      continue;
    }

    console.log(`-- Found ${flipsSnapshot.docs.length} flips for user '${username}'. Analyzing each one.`);
    let userFlipsCorrected = 0;
    const batch = db.batch();

    for (const flipDoc of flipsSnapshot.docs) {
      const flipData = flipDoc.data();
      const history = flipData.transactionsHistory;

      if (!history || history.length === 0) {
        continue; // Skip if there's no history to analyze
      }

      // Recalculation logic from your tradingLogic.js
      let totalSpent = 0;
      let totalReceived = 0;
      let totalBuyQuant = 0;
      let totalSellQuant = 0;
      let totalTax = 0;

      history.forEach(tx => {
        if (tx.type === 'buy') {
          totalBuyQuant += tx.quantity;
          totalSpent += tx.amountSpent;
        } else if (tx.type === 'sell') {
          const grossSaleAmount = tx.price * tx.quantity;
          const tax = calculateTax(flipData.itemId, tx.price, tx.quantity);
          totalSellQuant += tx.quantity;
          totalReceived += grossSaleAmount - tax;
          totalTax += tax;
        }
      });

      let newProfit = 0;
      const isClosed = totalBuyQuant > 0 && totalSellQuant >= totalBuyQuant;

      if (isClosed) {
        newProfit = Math.round(totalReceived - totalSpent);
      } else {
        if (totalBuyQuant > 0) {
          const avgBuyPrice = totalSpent / totalBuyQuant;
          const costOfGoodsSold = avgBuyPrice * totalSellQuant;
          newProfit = Math.round(totalReceived - costOfGoodsSold);
        }
      }
      
      if (flipData.profit !== newProfit || flipData.spent !== totalSpent || flipData.receivedPostTax !== totalReceived) {
         console.log(`--- Fixing flip for item: ${flipData.itemName || 'Unknown'}. Old profit: ${flipData.profit}, New profit: ${newProfit}`);
         batch.update(flipDoc.ref, {
             spent: totalSpent,
             receivedPostTax: totalReceived,
             taxPaid: totalTax,
             profit: newProfit,
             isClosed: isClosed,
             openedQuantity: totalBuyQuant,
             closedQuantity: totalSellQuant
         });
         userFlipsCorrected++;
      }
    }

    if (userFlipsCorrected > 0) {
        await batch.commit();
        console.log(`✔ Committed ${userFlipsCorrected} fixes for user '${username}'.`);
        totalFlipsCorrected += userFlipsCorrected;
    } else {
        console.log(`-- No profit discrepancies found for user '${username}'. Nothing to fix.`);
    }
  }

  console.log(`\n🎉 Process complete! Total flips corrected across all users: ${totalFlipsCorrected}`);
}

fixCorruptedFlips().catch(error => {
    console.error("An error occurred during the fix process:", error);
});