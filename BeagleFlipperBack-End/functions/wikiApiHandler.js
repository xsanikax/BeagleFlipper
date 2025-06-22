// wikiApiHandler.js
// VERSION: Flexible & Debug-Ready. This version implements the necessary API
//          calls and adds detailed logging to diagnose connection issues.

const axios = require('axios');
const WIKI_API_BASE_URL = 'https://prices.runescape.wiki/api/v1/osrs';
const USER_AGENT = 'BeagleFlipper Client - Contact @DaBeagleBoss on Discord';

let marketDataCache = {}; // Stores latest prices and item mappings
const timeseriesCache = new Map(); // Stores timeseries data per item/timestep

// Configure cache durations
const MARKET_DATA_CACHE_DURATION_MS = 30 * 1000; // 30 seconds for main market data (latest & mapping)
const TIMESERIES_CACHE_DURATION_MS_5M = 5 * 60 * 1000; // 5 minutes for 5m timeseries data
const API_CALL_TIMEOUT_MS = 10000; // 10-second timeout for API calls

/**
 * Fetches data from a specified Wiki API endpoint.
 * Includes detailed logging for debugging.
 */
async function fetchFromWiki(endpoint, params = {}) {
    const url = `${WIKI_API_BASE_URL}/${endpoint}`;
    const options = {
        headers: { 'User-Agent': USER_AGENT },
        params: params,
        timeout: API_CALL_TIMEOUT_MS // Use centralized timeout
    };

    // Only log API fetch start if not timeseries, or specific items.
    // To avoid excessive logging for timeseries calls during full scan.
    if (endpoint !== 'timeseries' || params.id === 565 || params.id === 2355 || params.id === 440) {
        console.log(`[Wiki API] Fetching from: ${url} with params: ${JSON.stringify(params)}`);
    }

    try {
        const response = await axios.get(url, options);
        // Only log success if not timeseries, or specific items.
        if (endpoint !== 'timeseries' || params.id === 565 || params.id === 2355 || params.id === 440) {
            console.log(`[Wiki API] Successfully fetched data from /${endpoint}.`);
        }
        return response.data;
    } catch (error) {
        console.error(`[Wiki API] ERROR fetching from ${url}:`);
        if (error.response) {
            console.error(`- Status: ${error.response.status}`);
            console.error(`- Data: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            console.error('- Error: No response received. The request timed out or the network is down.');
        } else {
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
    if (marketDataCache.timestamp && (now - marketDataCache.timestamp < MARKET_DATA_CACHE_DURATION_MS)) {
        // Cache is still fresh, do nothing.
        return;
    }

    console.log('[Wiki API] Market data cache is stale. Fetching new data (latest & mapping).');
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
 * Fetches timeseries data for a specific item, with enhanced caching.
 * Caches by itemId and timestep.
 */
async function fetchTimeseriesForItem(itemId, timestep = '5m') { // Defaults to '5m'
    const cacheKey = `${itemId}-${timestep}`;
    const now = Date.now();
    
    // Determine cache duration based on timestep
    let durationMs;
    if (timestep === '5m') {
        durationMs = TIMESERIES_CACHE_DURATION_MS_5M;
    } else {
        durationMs = 60 * 60 * 1000; // Default to 1 hour for other timesteps
    }

    const cachedEntry = timeseriesCache.get(cacheKey);

    if (cachedEntry && (now - cachedEntry.timestamp < durationMs)) {
        // if (config.TRADING_CONFIG.ENABLE_DEBUG_LOGGING) { // Use config for debug logging
        //     console.log(`[Wiki API - Timeseries Cache] Serving cached data for ${itemId} (${timestep}).`);
        // }
        return cachedEntry.data;
    }
    
    // Fetch fresh data
    const response = await fetchFromWiki('timeseries', { id: itemId, timestep: timestep });
    
    if (response && Array.isArray(response.data)) {
        timeseriesCache.set(cacheKey, { data: response.data, timestamp: now });
        // if (config.TRADING_CONFIG.ENABLE_DEBUG_LOGGING) { // Use config for debug logging
        //     console.log(`[Wiki API - Timeseries Cache] Updated cache for ${itemId} (${timestep}).`);
        // }
        return response.data;
    }
    
    return null;
}

/**
 * Returns the current market data cache (latest prices and mapping).
 */
function getMarketData() {
    return marketDataCache;
}

module.exports = { ensureMarketDataIsFresh, getMarketData, fetchTimeseriesForItem };
