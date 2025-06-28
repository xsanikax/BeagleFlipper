// index.js
// This version is based on the user's original file, restoring the correct
// v2 function syntax and EU server region. It adds a single, working endpoint
// for price suggestions.
// FIXED: Now properly routes timeframe to correct strategy functions
// it is fucking changed yes it fucking is
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const { handleProfitTracking, handleLoadFlips } = require('./tradingLogic');
const { handleLogin, handleRefreshToken, authenticateRequest } = require('./auth');
// Import both suggestion functions from the repaired analytics files
const { getHybridSuggestion, getPriceSuggestion } = require('./hybridAnalytics');
const { getF2pSuggestion } = require('./f2pAnalytics');
const { getEightHourSuggestion } = require('./eightHourStrategy');

admin.initializeApp();
const db = admin.firestore();
// REPAIRED: Server region is correctly set to europe-west2
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
        // This correctly handles getting the display name from either the body or query
        const displayName = req.body.display_name || req.query.display_name;

        // The request path is used to route to the correct logic
        switch (req.path) {
           case "/suggestion":
                           // --- START OF DIAGNOSTIC LOG ---
                           console.log("Received /suggestion request with body:", JSON.stringify(req.body, null, 2));
                           // --- END OF DIAGNOSTIC LOG ---

                           if (!displayName) {
                               return res.status(400).json({ message: "Display name is required for suggestions." });
                           }

                           const { preferences, timeframe } = req.body;
                           let suggestion;

                           // This is the corrected logic, built from your file.
                           // It now checks for the correct property: "f2pOnlyMode"
                           if (preferences && preferences.f2pOnlyMode) {
                               console.log("Routing to F2P analytics engine.");
                               suggestion = await getF2pSuggestion(req.body, db, displayName, timeframe);
                           } else {
                               // If not F2P, use the original timeframe-based logic
                               console.log("Routing to standard analytics engine based on timeframe.");
                               const effectiveTimeframe = timeframe || 5;

                               if (effectiveTimeframe === 5) {
                                   suggestion = await getHybridSuggestion(req.body, db, displayName, effectiveTimeframe);
                               } else if (effectiveTimeframe === 480) {
                                   suggestion = await getEightHourSuggestion(req.body, db, displayName, effectiveTimeframe);
                               } else {
                                   suggestion = await getHybridSuggestion(req.body, db, displayName, 5);
                               }
                           }

                           return res.status(200).json(suggestion);

            // NEW & REPAIRED: A single endpoint for getting manual price suggestions
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
                // This can be expanded later if needed
                return res.status(200).json({});

            default:
                return res.status(404).json({ message: "Not Found" });
        }
    });
});