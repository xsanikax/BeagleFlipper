// wikiApiHandler.js
// VERSION: Flexible & Debug-Ready. This version implements the necessary API
//          calls and adds detailed logging to diagnose connection issues.

const axios = require('axios');
const WIKI_API_BASE_URL = 'https://prices.runescape.wiki/api/v1/osrs';
const USER_AGENT = 'BeagleFlipper Client - Contact @DaBeagleBoss on Discord';

let marketDataCache = {};
const timeseriesCache = new Map();
const CACHE_DURATION_MS = 30 * 1000; // 30 seconds for main market data

/**
 * Fetches data from a specified Wiki API endpoint.
 * Includes detailed logging for debugging.
 */
async function fetchFromWiki(endpoint, params = {}) {
    const url = `${WIKI_API_BASE_URL}/${endpoint}`;
    const options = {
        headers: { 'User-Agent': USER_AGENT },
        params: params,
        timeout: 10000 // 10-second timeout
    };

    console.log(`[Wiki API] Fetching from: ${url} with params: ${JSON.stringify(params)}`);

    try {
        const response = await axios.get(url, options);
        console.log(`[Wiki API] Successfully fetched data from /${endpoint}.`);
        return response.data;
    } catch (error) {
        console.error(`[Wiki API] ERROR fetching from ${url}:`);
        // Log detailed error information
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error(`- Status: ${error.response.status}`);
            console.error(`- Headers: ${JSON.stringify(error.response.headers)}`);
            console.error(`- Data: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('- Error: No response received. The request timed out or the network is down.');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('- Error in request setup:', error.message);
        }
        return null; // Return null on failure
    }
}

/**
 * Ensures the main market data (latest prices and item mappings) is fresh.
 * Fetches new data if the cache is older than CACHE_DURATION_MS.
 */
async function ensureMarketDataIsFresh() {
    const now = Date.now();
    if (marketDataCache.timestamp && (now - marketDataCache.timestamp < CACHE_DURATION_MS)) {
        // Cache is still fresh, do nothing.
        return;
    }

    console.log('[Wiki API] Market data cache is stale. Fetching new data.');
    const [latestData, mappingData] = await Promise.all([
        fetchFromWiki('latest'),
        fetchFromWiki('mapping')
    ]);

    // Only update the cache if both API calls were successful
    if (latestData && mappingData) {
        marketDataCache = {
            latest: latestData.data,
            mapping: mappingData,
            timestamp: now
        };
        console.log('[Wiki API] Market data cache updated successfully.');
    } else {
        console.error('[Wiki API] Failed to update market data cache because one or more API calls failed.');
    }
}


/**
 * Fetches timeseries data for a specific item, with caching.
 * Can now fetch any timestep ('5m', '1h', etc.).
 */
async function fetchTimeseriesForItem(itemId, timestep = '5m') { // Defaults to '5m'
    const cacheKey = `${itemId}-${timestep}`;
    const now = Date.now();
    
    // Use a dynamic cache duration based on the timestep
    const DURATION = timestep === '5m' ? 5 * 60 * 1000 : 60 * 60 * 1000;
    const cachedEntry = timeseriesCache.get(cacheKey);

    if (cachedEntry && (now - cachedEntry.timestamp < DURATION)) {
        return cachedEntry.data;
    }
    
    const response = await fetchFromWiki('timeseries', { id: itemId, timestep: timestep });
    
    if (response && Array.isArray(response.data)) {
        timeseriesCache.set(cacheKey, { data: response.data, timestamp: now });
        return response.data;
    }
    
    return null;
}

/**
 * Returns the current market data cache.
 */
function getMarketData() {
    return marketDataCache;
}

module.exports = { ensureMarketDataIsFresh, getMarketData, fetchTimeseriesForItem };
