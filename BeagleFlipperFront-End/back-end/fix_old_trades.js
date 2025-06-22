
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Replace with your Firebase admin key

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixOldTrades() {
  console.log("Loading all user trades...");
  const usersSnapshot = await db.collection("users").get();
  let totalMatched = 0;

  for (const userDoc of usersSnapshot.docs) {
    const username = userDoc.id;
    const tradesSnapshot = await db.collection("users").doc(username).collection("trades").get();
    const trades = tradesSnapshot.docs.map(doc => ({ ...doc.data(), ref: doc.ref }));

    // Group by itemId for rough matching
    const buckets = {};
    for (const trade of trades) {
      const key = trade.itemId;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(trade);
    }

    let userMatched = 0;
    for (const [itemId, trades] of Object.entries(buckets)) {
      const buys = trades.filter(t => t.state === "BOUGHT").sort((a, b) => a.time - b.time);
      const sells = trades.filter(t => t.state === "SOLD").sort((a, b) => a.time - b.time);

      while (buys.length > 0 && sells.length > 0) {
        const buy = buys.shift();
        const sell = sells.shift();

        const qty = Math.min(buy.quantity, sell.quantity);
        const spent = buy.price * qty;
        const received = sell.price * qty;
        const tax = Math.floor(received * 0.01);
        const pnl = received - spent - tax;
        const boxId = 0;

        // Update both trades
        await buy.ref.update({ boxId });
        await sell.ref.update({ boxId, pnl, tax });
        userMatched++;
      }
    }

    totalMatched += userMatched;
    console.log(`✔ Fixed ${userMatched} flips for user ${username}`);
  }

  console.log(`🎉 Total trades fixed: ${totalMatched}`);
}

fixOldTrades().catch(console.error);
