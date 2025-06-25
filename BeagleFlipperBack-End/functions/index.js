// index.js - FINAL VERSION WITH PROFIT TRACKING RESTORED
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// --- Imports ---
const config = require('./tradingConfig');
const auth = require('./auth');
const suggestionEngine = require('./suggestionEngine');
const eightHourStrategy = require('./eightHourStrategy');
const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');

admin.initializeApp();
const db = admin.firestore();

// --- Dependencies Object ---
const dependencies = {
    TRADING_CONFIG: config.TRADING_CONFIG,
    TARGET_COMMODITIES: config.TARGET_COMMODITIES,
    db,
    wikiApi,
    getRecentlyBoughtQuantities,
};

setGlobalOptions({ region: "europe-west2", timeoutSeconds: 300, memory: "1GiB" });

exports.api = onRequest({ cors: true }, async (req, res) => {
    // Standard CORS headers
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }
    res.set('Access-Control-Allow-Origin', '*');

    // Public Routes
    if (req.path === "/login") return auth.handleLogin(req, res, db);
    if (req.path === "/signup") return auth.handleSignup(req, res);
    if (req.path === "/refresh-token") return auth.handleRefreshToken(req, res);

    // Authenticated Routes
    return auth.authenticateRequest(req, res, async () => {
        const displayName = req.body.display_name || req.query.display_name || (req.user ? req.user.displayName : null);
        const userState = req.body || {};
        if (userState.inventory && typeof userState.inventory.totalGp !== 'undefined') {
            userState.gp = userState.inventory.totalGp;
        }

        switch (req.path) {
            case "/suggestion":
                if (!displayName) return res.status(400).json({ message: "Display name is required." });
                const timeframe = userState.timeframe || 30;
                const suggestion = timeframe === 480
                    ? await eightHourStrategy.getEightHourSuggestion(userState, db, displayName, timeframe, dependencies)
                    : await suggestionEngine.getSuggestions(userState, db, displayName, timeframe, dependencies);
                return res.status(200).json(suggestion);

            // --- RESTORED PROFIT TRACKING ENDPOINTS ---
            case "/profit-tracking/client-transactions":
                const transactions = req.body;
                if (!Array.isArray(transactions) || transactions.length === 0) {
                    return res.status(200).send({ message: "No transactions to save." });
                }
                try {
                    const batch = db.batch();
                    transactions.forEach(tx => {
                        const docRef = db.collection('flips').doc();
                        batch.set(docRef, { ...tx, uid: req.user.uid, serverTimestamp: admin.firestore.FieldValue.serverTimestamp() });
                    });
                    await batch.commit();
                    return res.status(200).send({ message: "Transactions saved successfully." });
                } catch (error) {
                    console.error("Error saving transactions:", error);
                    return res.status(500).send({ message: "Error saving transactions." });
                }

            case "/profit-tracking/client-flips":
                try {
                    const flipsSnapshot = await db.collection('flips').where('uid', '==', req.user.uid).get();
                    const flips = flipsSnapshot.docs.map(doc => doc.data());
                    return res.status(200).json(flips);
                } catch (error) {
                    console.error("Error loading flips:", error);
                    return res.status(500).send({ message: "Error loading flips." });
                }

            default:
                return res.status(404).json({ message: "Not Found" });
        }
    });
});
