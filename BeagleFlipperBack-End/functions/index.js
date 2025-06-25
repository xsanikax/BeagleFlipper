const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Import centralized configuration
const config = require('./tradingConfig'); 

// Import functions from tradingLogic.js, auth.js, etc.
const { handleProfitTracking, handleLoadFlips } = require('./tradingLogic');
const { handleLogin, handleRefreshToken, authenticateRequest } = require('./auth');
const { getHybridSuggestion, getPriceSuggestion } = require('./hybridAnalytics'); // Will be replaced by suggestionEngine
const { getEightHourSuggestion } = require('./eightHourStrategy'); // Will be replaced by suggestionEngine


// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Set global options for all functions (e.g., region and default timeout from config)
setGlobalOptions({ 
    region: "europe-west2",
    timeoutSeconds: config.TRADING_CONFIG.SUGGESTION_POLL_INTERVAL_SECONDS * 2 || 300 // Use config for timeout, or default to 5 min
});

// This function handles user signup (keeping it as it was in previous versions)
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

// Main API endpoint - all requests are routed through this single function
exports.api = onRequest({ cors: true }, async (req, res) => { // Timeout is set globally by setGlobalOptions
    // Handle CORS preflight requests (OPTIONS method)
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '3600'); // Cache preflight for 1 hour
        return res.status(204).send('');
    }
    // Allow all origins for the actual requests
    res.set('Access-Control-Allow-Origin', '*');

    // Public routes (no authentication required for these specific paths)
    if (req.path === "/login") {
        console.log("Handling /login request.");
        return handleLogin(req, res, db); // Pass db as handleLogin might need it
    }
    if (req.path === "/signup") {
        console.log("Handling /signup request.");
        return handleSignup(req, res);
    }
    if (req.path === "/refresh-token") {
        console.log("Handling /refresh-token request.");
        return handleRefreshToken(req, res);
    }

    // All routes below this point require authentication via authenticateRequest middleware
    return authenticateRequest(req, res, async () => {
        // displayName is retrieved from the authenticated user's token (req.user) or query/body
        const displayName = req.body.display_name || req.query.display_name || (req.user ? req.user.displayName : null);
        console.log(`Authenticated request for user: ${displayName || 'Unknown'}`);

        // Route to specific handlers based on the request path
        switch (req.path) {
            case "/suggestion":
                console.log("Handling /suggestion request.");
                if (!displayName) {
                    return res.status(400).json({ message: "Display name is required for suggestions." });
                }
                const timeframe = req.body.timeframe || 5; 
                let suggestion;
                // Currently using existing suggestion logic - will be replaced by new quant algorithm
                if (timeframe === 480) { // 8 hours (480 minutes)
                    suggestion = await getEightHourSuggestion(req.body, db, displayName, timeframe);
                } else { // Default to 5 minutes or other timeframes
                    suggestion = await getHybridSuggestion(req.body, db, displayName, timeframe);
                }
                return res.status(200).json(suggestion);
            
            case "/price-suggestion":
                console.log("Handling /price-suggestion request.");
                const { itemId, type } = req.query; // Assuming itemId and type come from query for this
                if (!itemId || !type) {
                    return res.status(400).json({ message: "itemId and type (buy/sell) are required." });
                }
                const priceSuggestion = await getPriceSuggestion(parseInt(itemId), type);
                return res.status(200).json(priceSuggestion);

            case "/profit-tracking/client-transactions":
                console.log("Handling /profit-tracking/client-transactions request.");
                return await handleProfitTracking(req, res, { db });
            
            case "/profit-tracking/client-flips":
                console.log("Handling /profit-tracking/client-flips request.");
                return await handleLoadFlips(req, res, { db });

            // Placeholder for /rs-account-names endpoint if needed (as seen in previous logs)
            case "/profit-tracking/rs-account-names":
                console.log("Handling /profit-tracking/rs-account-names request.");
                return res.status(200).json({});

            default:
                // Handle unknown routes
                console.log(`Unknown path requested: ${req.path}`);
                return res.status(404).json({ message: "Not Found" });
        }
    });
});
