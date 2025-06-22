const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const config = require('./tradingConfig');
const { handleProfitTracking, handleLoadFlips } = require('./tradingLogic');
const { handleLogin, handleRefreshToken, authenticateRequest } = require('./auth');
const { getHybridSuggestionList, getPriceSuggestion } = require('./hybridAnalytics'); // Note: Changed to get list
const { getEightHourSuggestionList } = require('./eightHourStrategy'); // Note: Changed to get list
const { SuggestionEngine } = require('./suggestionEngine');

admin.initializeApp();
const db = admin.firestore();

// --- Initialize the single "brain" instance and have it learn from history ---
const suggestionEngine = new SuggestionEngine(db, config);
suggestionEngine.initialize().catch(err => console.error("FATAL: Could not initialize suggestion engine on startup.", err));
// ---

// --- State for Backend-Only Smart Skip ---
let suggestionQueue = [];
let lastServedSuggestion = null;
let lastRefreshTime = 0;
// ---

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
    if (error.code === 'auth/email-already-exists') { message = "This email address is already in use."; }
    else if (error.code === 'auth/weak-password') { message = "Password must be at least 6 characters long."; }
    return res.status(400).json({ message });
  }
}

function formatSuggestion(suggestion) {
    const defaultSuggestion = { type: "wait", message: "No suggestions available.", item_name: "None", item_id: 0 };
    if (!suggestion) return defaultSuggestion;
    const formatted = { ...defaultSuggestion, ...suggestion };
    if (!formatted.item_name && formatted.name) formatted.item_name = formatted.name;
    return formatted;
}

exports.api = onRequest({ cors: true }, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
    }
    res.set('Access-Control-Allow-Origin', '*');
    if (req.path === "/login") { return handleLogin(req, res, db); }
    if (req.path === "/signup") { return handleSignup(req, res); }
    if (req.path === "/refresh-token") { return handleRefreshToken(req, res); }

    return authenticateRequest(req, res, async () => {
        switch (req.path) {
            case "/suggestion":
                const body = req.body;
                const displayName = body.display_name;
                if (!displayName) {
                    return res.status(400).json({ message: "Display name is required in the request body for suggestions." });
                }

                const userState = { inventory: body.inventory || [], offers: body.offers || [] };
                const timeframe = body.timeframe || 5;
                const now = Date.now();
                const isStale = (now - lastRefreshTime) > 20000; // Queue is stale after 20 seconds

                let nextSuggestion = null;

                if (isStale || suggestionQueue.length === 0) {
                    console.log("--- Refreshing Suggestion Queue ---");
                    lastRefreshTime = now;
                    await suggestionEngine.run();

                    suggestionQueue = (timeframe === 480)
                        ? await getEightHourSuggestionList(userState, db, displayName, timeframe)
                        : await getHybridSuggestionList(userState, db, displayName, timeframe);

                    nextSuggestion = suggestionQueue.length > 0 ? suggestionQueue[0] : null;

                } else {
                    console.log("--- Queue is fresh. Interpreting as Skip request. ---");
                    let currentIndex = -1;
                    if (lastServedSuggestion && lastServedSuggestion.item_id) {
                        currentIndex = suggestionQueue.findIndex(s => s.item_id === lastServedSuggestion.item_id);
                    }

                    const nextIndex = (currentIndex === -1 || currentIndex + 1 >= suggestionQueue.length) ? 0 : nextIndex = currentIndex + 1;
                    nextSuggestion = suggestionQueue[nextIndex] || suggestionQueue[0] || null;
                }

                lastServedSuggestion = nextSuggestion; // Remember what we're about to serve
                return res.status(200).json(formatSuggestion(lastServedSuggestion));

            case "/price-suggestion":
                const { itemId, type } = req.query;
                if (!itemId || !type) { return res.status(400).json({ message: "itemId and type (buy/sell) are required." }); }
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