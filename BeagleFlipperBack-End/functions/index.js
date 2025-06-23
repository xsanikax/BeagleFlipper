const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Import centralized configuration
const config = require('./tradingConfig');

// Import functions from your working files
const { handleProfitTracking, handleLoadFlips } = require('./tradingLogic');
const { handleLogin, handleRefreshToken, authenticateRequest } = require('./auth');
const { getHybridSuggestion, getPriceSuggestion } = require('./hybridAnalytics');
const { getEightHourSuggestion } = require('./eightHourStrategy');


// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// --- NEW: Short-term memory for the Skip button ---
// This list will hold item IDs that have been suggested recently.
let recentlySuggested = new Set();
// Clear the list every 5 minutes to prevent it from getting stuck if the user leaves.
setInterval(() => {
    if (recentlySuggested.size > 0) {
        console.log("[Memory] Clearing recently suggested list due to timeout.");
        recentlySuggested.clear();
    }
}, 300000);
// ---

// Set global options for all functions
setGlobalOptions({
    region: "europe-west2",
    timeoutSeconds: config.TRADING_CONFIG.SUGGESTION_POLL_INTERVAL_SECONDS * 2 || 300
});

async function handleSignup(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }
  try {
    const userRecord = await admin.auth().createUser({ email, password });
    return res.status(201).json({ message: "User created successfully", uid: userRecord.uid });
  } catch (error) {
    let message = "Failed to create user.";
    if (error.code === 'auth/email-already-exists') {
      message = "This email address is already in use.";
    } else if (error.code === 'auth/weak-password') {
      message = "Password must be at least 6 characters long.";
    }
    return res.status(400).json({ message });
  }
}

// Main API endpoint
exports.api = onRequest({ cors: true }, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
    }
    res.set('Access-Control-Allow-Origin', '*');

    if (req.path === "/login") {
        return handleLogin(req, res, db);
    }
    if (req.path === "/signup") {
        return handleSignup(req, res);
    }
    if (req.path === "/refresh-token") {
        return handleRefreshToken(req, res);
    }

    return authenticateRequest(req, res, async () => {
        const displayName = req.body.display_name || req.query.display_name || (req.user ? req.user.displayName : null);

        switch (req.path) {
            case "/suggestion":
                // Add the list of recently suggested items to the request body
                // so the suggestion functions can filter them out.
                req.body.recently_suggested = Array.from(recentlySuggested);

                if (!displayName) {
                    return res.status(400).json({ message: "Display name is required for suggestions." });
                }
                const timeframe = req.body.timeframe || 5;
                let suggestion;

                if (timeframe === 480) {
                    suggestion = await getEightHourSuggestion(req.body, db, displayName, timeframe);
                } else {
                    suggestion = await getHybridSuggestion(req.body, db, displayName, timeframe);
                }

                // If a good flip was found, add its ID to our short-term memory.
                if (suggestion && suggestion.type === 'buy' && suggestion.item_id) {
                    recentlySuggested.add(suggestion.item_id);
                } else if (!suggestion || suggestion.type !== 'buy') {
                    // If no buy suggestion is found, we should clear the skip memory
                    // so the user isn't stuck if they skipped the only available items.
                    recentlySuggested.clear();
                }

                return res.status(200).json(suggestion);

            case "/price-suggestion":
                const { itemId, type } = req.query;
                if (!itemId || !type) {
                    return res.status(400).json({ message: "itemId and type (buy/sell) are required." });
                }
                const priceSuggestion = await getPriceSuggestion(parseInt(itemId), type);
                return res.status(200).json(priceSuggestion);

            case "/profit-tracking/client-transactions":
                return await handleProfitTracking(req, res, { db });

            case "/profit-tracking/client-flips":
                return await handleLoadFlips(req, res, { db });

            case "/profit-tracking/rs-account-names":
                return res.status(200).json({});

            default:
                console.log(`Unknown path requested: ${req.path}`);
                return res.status(404).json({ message: "Not Found" });
        }
    });
});
