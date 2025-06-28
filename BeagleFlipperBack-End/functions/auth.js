// functions/auth.js
const admin = require('firebase-admin');
const axios = require('axios');
const { TRADING_CONFIG } = require('./tradingConfig'); // Import from central config

// Get the API key from the configuration file
const FIREBASE_WEB_API_KEY = TRADING_CONFIG.FIREBASE_WEB_API_KEY;

// Add a startup check to ensure the key is configured correctly
if (!FIREBASE_WEB_API_KEY || !FIREBASE_WEB_API_KEY.startsWith("AIza")) {
    console.error("FATAL: Firebase Web API Key is not set correctly in tradingConfig.js. Authentication will fail.");
}

/**
 * Handles user login by exchanging email/password for Firebase tokens.
 * This standardizes the response for the client.
 */
async function handleLogin(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    try {
        const response = await axios.post(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
            { email, password, returnSecureToken: true }
        );

        // Destructure and return a clean, consistent response object
        const { idToken, refreshToken, localId } = response.data;
        console.log(`User logged in successfully: ${localId}`);
        return res.status(200).json({
            message: "Login successful",
            uid: localId,
            idToken,
            refreshToken,
        });
    } catch (error) {
        console.error("Login Error:", error.response ? error.response.data.error.message : error.message);
        return res.status(401).json({ message: "Invalid email or password." });
    }
}

/**
 * Handles refreshing an expired ID token using a valid refresh token.
 * This is the key to staying logged in automatically.
 */
async function handleRefreshToken(req, res) {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token is required." });
    }

    try {
        const response = await axios.post(
            `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`,
            { grant_type: 'refresh_token', refresh_token: refreshToken }
        );

        // Destructure and return a clean response. Note the key name change from the API.
        const { id_token, user_id } = response.data;
        console.log(`Token refreshed successfully for user: ${user_id}`);
        return res.status(200).json({
            message: "Token refreshed successfully",
            idToken: id_token, // Standardize the response key to "idToken"
        });
    } catch (error) {
        console.error("Refresh Token Error:", error.response ? error.response.data.error.message : error.message);
        // If the refresh token is invalid, the client must re-authenticate completely.
        return res.status(401).json({ message: "Session expired. Please log in again." });
    }
}

/**
 * Middleware to authenticate requests using a Firebase ID token.
 * This protects all sensitive endpoints and provides clear error feedback.
 */
async function authenticateRequest(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        // Verify the token using the Firebase Admin SDK
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken; // Attach user info to the request object for use in other functions
        next(); // Proceed to the actual endpoint logic
    } catch (error) {
        console.error('Authentication Error:', error.code, error.message);
        // If the token is expired, send a specific error.
        // The client should interpret this as a signal to use its refresh token.
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({ error: 'token_expired', message: 'Token has expired. Please refresh.' });
        }
        // For any other auth error, treat the token as invalid.
        return res.status(401).json({ error: 'token_invalid', message: 'Token is invalid. Please log in again.' });
    }
}

module.exports = { handleLogin, handleRefreshToken, authenticateRequest };