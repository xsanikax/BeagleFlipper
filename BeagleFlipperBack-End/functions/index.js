// index.js - FIXED VERSION WITH CENTRALIZED STATE HANDLING
// This version properly prepares the userState for the analytics functions,
// ensuring that skip, block, and toggle states are respected.

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const { handleProfitTracking, handleLoadFlips } = require('./tradingLogic');
const { handleLogin, handleRefreshToken, authenticateRequest } = require('./auth');
const { getHybridSuggestion, getPriceSuggestion } = require('./hybridAnalytics');
const { getF2pSuggestion } = require('./f2pAnalytics');
const { getEightHourSuggestion } = require('./eightHourStrategy');

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({ region: "europe-west2" });

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

exports.api = onRequest({ timeoutSeconds: 30 }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    if (req.path === "/login") return handleLogin(req, res);
    if (req.path === "/signup") return handleSignup(req, res);
    if (req.path === "/refresh-token") return handleRefreshToken(req, res);

    // All endpoints below this require authentication
    return authenticateRequest(req, res, async () => {
        const displayName = req.body.display_name || req.query.display_name;

        switch (req.path) {
            case "/suggestion":
                console.log("=== SUGGESTION REQUEST START ===");
                console.log("Request body:", JSON.stringify(req.body, null, 2));

                if (!displayName) {
                    return res.status(400).json({ message: "Display name is required for suggestions." });
                }

                // Extract all relevant state from the client request.
                const {
                    preferences = {},
                    timeframe,
                    inventory = [],
                    offers = [],
                    sell_only_mode = false,
                    skip_suggestion = false,
                    blocked_items = [], // The user's permanent block list
                    item_to_skip,      // The item ID from a "skip" button press
                } = req.body;

                // Create the exclusion list for this request.
                // Start with the permanent block list.
                const itemsToExclude = new Set(blocked_items.map(Number).filter(id => !isNaN(id)));

                // If this is a skip request, add the specific item to the exclusion list for this one time.
                if (skip_suggestion && item_to_skip) {
                    itemsToExclude.add(Number(item_to_skip));
                    console.log(`Temporarily skipping item ID: ${item_to_skip}`);
                }

                // Create a clean userState object. This is the single source of truth
                // for the analytics functions. They should not manage their own state.
                const userState = {
                    blocked_items: Array.from(itemsToExclude), // Pass the combined exclusion list
                    inventory: inventory || [],
                    offers: offers || [],
                    sell_only_mode: sell_only_mode === true, // Ensure boolean
                    preferences: {
                        ...preferences,
                        f2pOnlyMode: preferences.f2pOnlyMode === true // Ensure boolean
                    }
                };

                console.log("Final userState for analytics:", JSON.stringify(userState, null, 2));

                let suggestion;
                try {
                    // Route to the correct analytics engine based on user preferences.
                    if (userState.preferences.f2pOnlyMode) {
                        console.log("Routing to F2P analytics...");
                        suggestion = await getF2pSuggestion(userState, db, displayName);
                    } else {
                        console.log("Routing to Hybrid/P2P analytics...");
                        const effectiveTimeframe = timeframe || 5;

                        if (effectiveTimeframe === 480) {
                            console.log("Using 8-hour strategy");
                            suggestion = await getEightHourSuggestion(userState, db, displayName, effectiveTimeframe);
                        } else {
                            console.log("Using hybrid strategy");
                            suggestion = await getHybridSuggestion(userState, db, displayName);
                        }
                    }
                } catch (error) {
                    console.error("Critical error during suggestion generation:", error);
                    suggestion = {
                        type: 'wait',
                        message: 'Error getting suggestion. Please try again.',
                        error: error.message
                    };
                }

                console.log("Final suggestion:", JSON.stringify(suggestion, null, 2));
                console.log("=== SUGGESTION REQUEST END ===");

                return res.status(200).json(suggestion);

            case "/prices":
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
                return res.status(404).json({ message: "Not Found" });
        }
    });
});