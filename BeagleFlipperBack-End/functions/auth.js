const admin = require('firebase-admin');
const axios = require('axios');

// CRITICAL: You must replace this with your actual key from your Firebase project settings.
const FIREBASE_WEB_API_KEY = "AIzaSyDspCsPLP5hpVnRCE-qYSdUbM8w-eMCJcY";

async function handleLogin(req, res) {
    if (FIREBASE_WEB_API_KEY === "YOUR_WEB_API_KEY") {
        console.error("FATAL: Firebase Web API Key is not set in auth.js. Server is not configured.");
        return res.status(500).json({ message: "Server configuration error." });
    }
    const { email, password } = req.body;
    try {
        const response = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`, { email, password, returnSecureToken: true });
        return res.status(200).json(response.data);
    } catch (error) {
        return res.status(401).json({ message: "Invalid email or password." });
    }
}

async function handleRefreshToken(req, res) {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: "Refresh token is required." });
    try {
        const response = await axios.post(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`, { grant_type: 'refresh_token', refresh_token: refreshToken });
        return res.status(200).json({ idToken: response.data.id_token });
    } catch (error) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
    }
}

async function authenticateRequest(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
    const idToken = authHeader.split('Bearer ')[1];
    try {
        req.user = await admin.auth().verifyIdToken(idToken);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'token_expired', message: 'Token has expired.' });
    }
}

module.exports = { handleLogin, handleRefreshToken, authenticateRequest };
