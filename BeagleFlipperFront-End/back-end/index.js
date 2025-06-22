// index.js
// This version is based on the user's original file, restoring the correct
// v2 function syntax and EU server region. It adds a single, working endpoint
// for price suggestions.
// FIXED: Now properly routes timeframe to correct strategy functions

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const { handleProfitTracking, handleLoadFlips } = require('./tradingLogic');
const { handleLogin, handleRefreshToken, authenticateRequest } = require('./auth');
// Import both suggestion functions from the repaired analytics files
const { getHybridSuggestion, getPriceSuggestion } = require('./hybridAnalytics');
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
                if (!displayName) {
                    return res.status(400).json({ message: "Display name is required for suggestions." });
                }
                
                // FIXED: Extract timeframe from request and route to correct strategy
                const timeframe = req.body.timeframe || 5; // Default to 5 minutes if not specified
                
                let suggestion;
                if (timeframe === 5) {
                    // Use 5-minute strategy
                    suggestion = await getHybridSuggestion(req.body, db, displayName, timeframe);
                } else if (timeframe === 480) {
                    // Use 8-hour strategy (480 minutes = 8 hours)  
                    suggestion = await getEightHourSuggestion(req.body, db, displayName, timeframe);
                } else {
                    // Default to 5-minute strategy for unknown timeframes
                    suggestion = await getHybridSuggestion(req.body, db, displayName, 5);
                }
                
                return res.status(200).json(suggestion);
            
            // NEW & REPAIRED: A single endpoint for getting manual price suggestions
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
                // This can be expanded later if needed
                return res.status(200).json({});

            default:
                return res.status(404).json({ message: "Not Found" });
        }
    });
});
