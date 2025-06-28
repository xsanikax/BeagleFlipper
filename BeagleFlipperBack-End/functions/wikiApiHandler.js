// wikiApiHandler.js
const axios = require('axios');

const WIKI_API_BASE_URL = 'https://prices.runescape.wiki/api/v1/osrs';
const USER_AGENT = 'BeagleFlipper Client - Contact @DaBeagleBoss on Discord';

let marketDataCache = {
  latest: null,
  mapping: null,
  timestamp: 0,
};
const timeseriesCache = new Map();

const MARKET_CACHE_TTL_MS = 30 * 1000; // 30 seconds for latest + mapping
const TIMESERIES_CACHE_TTL_MS = {
  '5m': 5 * 60 * 1000,   // 5 minutes
  '1h': 60 * 60 * 1000,  // 1 hour
  // add others if needed
};

async function fetchFromWiki(endpoint, params = {}) {
  const url = `${WIKI_API_BASE_URL}/${endpoint}`;
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      params,
      timeout: 10000,
    });
    console.log(`[Wiki API] Fetched /${endpoint} with params ${JSON.stringify(params)} (status ${response.status})`);
    return response.data;
  } catch (err) {
    console.error(`[Wiki API] Error fetching /${endpoint}: ${err.message}`);
    return null;
  }
}

async function ensureMarketDataIsFresh() {
  const now = Date.now();
  if (marketDataCache.latest && marketDataCache.mapping && (now - marketDataCache.timestamp < MARKET_CACHE_TTL_MS)) {
    // Cache still fresh
    return;
  }

  console.log('[Wiki API] Market data stale or missing, refreshing...');
  const [latestRes, mappingRes] = await Promise.all([
    fetchFromWiki('latest'),
    fetchFromWiki('mapping'),
  ]);

  if (latestRes && latestRes.data && mappingRes) {
    marketDataCache.latest = latestRes.data;
    marketDataCache.mapping = mappingRes;
    marketDataCache.timestamp = now;
    console.log('[Wiki API] Market data cache updated.');
  } else {
    console.error('[Wiki API] Failed to update market data cache.');
  }
}

/**
 * Fetch timeseries for a given itemId and timestep (e.g., '5m', '1h')
 * Caches per item+timestep with appropriate TTL.
 */
async function fetchTimeseriesForItem(itemId, timestep = '5m') {
  const cacheKey = `${itemId}-${timestep}`;
  const now = Date.now();
  const ttl = TIMESERIES_CACHE_TTL_MS[timestep] || 5 * 60 * 1000;

  const cached = timeseriesCache.get(cacheKey);
  if (cached && (now - cached.timestamp < ttl)) {
    // Return cached timeseries
    return cached.data;
  }

  // Fetch fresh timeseries
  const response = await fetchFromWiki('timeseries', { id: itemId, timestep });
  if (response && Array.isArray(response.data)) {
    timeseriesCache.set(cacheKey, { data: response.data, timestamp: now });
    console.log(`[Wiki API] Timeseries for item ${itemId} (${timestep}) fetched with ${response.data.length} points.`);
    return response.data;
  } else {
    console.warn(`[Wiki API] No timeseries data for item ${itemId} (${timestep}).`);
    return null;
  }
}

function getMarketData() {
  return marketDataCache;
}

module.exports = {
  ensureMarketDataIsFresh,
  getMarketData,
  fetchTimeseriesForItem,
};