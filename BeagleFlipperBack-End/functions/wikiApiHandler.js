// Enhanced wikiApiHandler.js - ULTRA CONSERVATIVE RATE LIMITING
// Optimized for maximum data retrieval without hitting rate limits

const axios = require('axios');
const WIKI_API_BASE_URL = 'https://prices.runescape.wiki/api/v1/osrs';
const USER_AGENT = 'BeagleFlipper High-Velocity Client - Contact @DaBeagleBoss on Discord';

let marketDataCache = {};
const timeseriesCache = new Map();
const bulkTimeseriesCache = new Map();

// Ultra conservative cache durations and timeouts
const MARKET_DATA_CACHE_DURATION_MS = 15 * 1000; // 15 seconds for latest prices
const TIMESERIES_CACHE_DURATION_MS_5M = 5 * 60 * 1000; // 5 minutes for 5m data (longer cache)
const API_CALL_TIMEOUT_MS = 12000; // 12-second timeout

// Ultra conservative rate limiting
const rateLimiter = {
    requests: [],
    maxRequestsPerMinute: 50, // Reduced from 100 to 50
    lastRequestTime: 0,
    minDelayBetweenRequests: 1500, // 1.5 seconds minimum between requests

    canMakeRequest() {
        const now = Date.now();

        // Check if enough time has passed since last request
        if (now - this.lastRequestTime < this.minDelayBetweenRequests) {
            return false;
        }

        // Clean old requests
        this.requests = this.requests.filter(time => now - time < 60000);
        return this.requests.length < this.maxRequestsPerMinute;
    },

    async waitForNextSlot() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minDelayBetweenRequests) {
            const waitTime = this.minDelayBetweenRequests - timeSinceLastRequest;
            console.log(`[Rate Limiter] Waiting ${waitTime}ms before next request...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Double check rate limit
        while (!this.canMakeRequest()) {
            console.log('[Rate Limiter] Rate limit reached, waiting 30 seconds...');
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    },

    recordRequest() {
        this.lastRequestTime = Date.now();
        this.requests.push(this.lastRequestTime);
    }
};

/**
 * Enhanced fetch with ultra-conservative rate limiting
 */
async function fetchFromWiki(endpoint, params = {}, retries = 3) {
    await rateLimiter.waitForNextSlot();
    rateLimiter.recordRequest();

    const url = `${WIKI_API_BASE_URL}/${endpoint}`;
    const options = {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate'
        },
        params: params,
        timeout: API_CALL_TIMEOUT_MS,
        maxRedirects: 3
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            console.log(`[Wiki API] Requesting /${endpoint}${params.id ? ` (item ${params.id})` : ''} (attempt ${attempt + 1})`);
            const response = await axios.get(url, options);

            if (!response.data) {
                throw new Error('Empty response data');
            }

            console.log(`[Wiki API] Success: /${endpoint}${params.id ? ` (item ${params.id})` : ''}`);
            return response.data;

        } catch (error) {
            const isLastAttempt = attempt === retries;

            if (error.response) {
                console.error(`[Wiki API] HTTP ${error.response.status} from /${endpoint}${params.id ? ` (item ${params.id})` : ''} (attempt ${attempt + 1})`);

                if (error.response.status === 429) {
                    // Rate limited - wait longer
                    const waitTime = isLastAttempt ? 0 : 60000 * (attempt + 1); // 1, 2, 3 minutes
                    if (!isLastAttempt) {
                        console.log(`[Wiki API] Rate limited, waiting ${waitTime/1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                } else if (error.response.status >= 500 && !isLastAttempt) {
                    // Server error - retry with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)));
                    continue;
                }
            } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                console.error(`[Wiki API] Timeout on /${endpoint}${params.id ? ` (item ${params.id})` : ''} (attempt ${attempt + 1})`);
                if (!isLastAttempt) {
                    await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                    continue;
                }
            } else {
                console.error(`[Wiki API] Network error on /${endpoint}${params.id ? ` (item ${params.id})` : ''}:`, error.message);
            }

            if (isLastAttempt) {
                console.error(`[Wiki API] All attempts failed for /${endpoint}${params.id ? ` (item ${params.id})` : ''}`);
                return null;
            }
        }
    }
    return null;
}

async function ensureMarketDataIsFresh() {
    const now = Date.now();
    if (marketDataCache.timestamp && (now - marketDataCache.timestamp < MARKET_DATA_CACHE_DURATION_MS)) {
        return;
    }

    console.log('[Wiki API] Refreshing market data for high-velocity trading...');
    try {
        const [latestData, mappingData] = await Promise.all([
            fetchFromWiki('latest'),
            fetchFromWiki('mapping')
        ]);

        if (latestData && mappingData) {
            const validPriceData = {};
            if (latestData.data && typeof latestData.data === 'object') {
                Object.entries(latestData.data).forEach(([itemId, priceData]) => {
                    if (priceData && priceData.high > 0 && priceData.low > 0 && priceData.high >= priceData.low) {
                        validPriceData[itemId] = priceData;
                    }
                });
            }

            const validMapping = Array.isArray(mappingData) ?
                mappingData.filter(item => item && item.id && item.name && item.limit && item.limit > 0) : [];

            marketDataCache = {
                latest: validPriceData,
                mapping: validMapping,
                timestamp: now,
                itemCount: Object.keys(validPriceData).length
            };

            console.log(`[Wiki API] Market data updated: ${marketDataCache.itemCount} items with valid prices`);
        } else {
            throw new Error('Failed to fetch initial market data');
        }
    } catch (error) {
        console.error('[Wiki API] Error updating market data:', error.message);
    }
}

async function fetchTimeseriesForItem(itemId, timestep = '5m') {
    const cacheKey = `${itemId}-${timestep}`;
    const now = Date.now();
    const cachedEntry = timeseriesCache.get(cacheKey);

    if (cachedEntry && (now - cachedEntry.timestamp < TIMESERIES_CACHE_DURATION_MS_5M)) {
        console.log(`[Wiki API] Cache hit for item ${itemId}`);
        return cachedEntry.data;
    }

    try {
        const response = await fetchFromWiki('timeseries', { id: itemId, timestep: timestep });
        if (response && Array.isArray(response.data)) {
            const validData = response.data.filter(p =>
                p && p.timestamp &&
                (p.avgHighPrice > 0 || p.avgLowPrice > 0) &&
                p.avgHighPrice >= p.avgLowPrice
            );

            if (validData.length > 0) {
                timeseriesCache.set(cacheKey, { data: validData, timestamp: now });
                console.log(`[Wiki API] Cached ${validData.length} data points for item ${itemId}`);
                return validData;
            }
        }
        return null;
    } catch (error) {
        console.error(`[Wiki API] Error fetching timeseries for item ${itemId}:`, error.message);
        return null;
    }
}

/**
 * Bulk fetch timeseries for multiple items with proper rate limiting
 */
async function fetchBulkTimeseries(itemIds, timestep = '5m') {
    const results = new Map();

    console.log(`[Wiki API] Starting bulk timeseries fetch for ${itemIds.length} items...`);

    for (const itemId of itemIds) {
        try {
            const timeseries = await fetchTimeseriesForItem(itemId, timestep);
            if (timeseries && timeseries.length > 0) {
                results.set(itemId, timeseries);
            }
        } catch (error) {
            console.warn(`[Wiki API] Failed to fetch timeseries for item ${itemId}:`, error.message);
            continue;
        }
    }

    console.log(`[Wiki API] Bulk timeseries fetch complete: ${results.size}/${itemIds.length} items`);
    return results;
}

function getMarketData() {
    return {
        ...marketDataCache,
        cacheAge: marketDataCache.timestamp ? Date.now() - marketDataCache.timestamp : null,
        isStale: marketDataCache.timestamp ? (Date.now() - marketDataCache.timestamp) > MARKET_DATA_CACHE_DURATION_MS : true
    };
}

// ADD THE MISSING METHOD
function getMapping() {
    if (!marketDataCache.mapping) {
        throw new Error('Mapping data not available');
    }
    return marketDataCache.mapping;
}

function getHighLiquidityItems(minLimit = 1000) {
    if (!marketDataCache.mapping) return [];
    return marketDataCache.mapping
        .filter(item => item.limit >= minLimit)
        .sort((a, b) => b.limit - a.limit)
        .slice(0, 100);
}

function clearCaches() {
    marketDataCache = {};
    timeseriesCache.clear();
    bulkTimeseriesCache.clear();
    console.log('[Wiki API] All caches cleared');
}

function getCacheStats() {
    return {
        marketDataCached: !!marketDataCache.timestamp,
        marketDataAge: marketDataCache.timestamp ? Date.now() - marketDataCache.timestamp : null,
        timeseriesCacheSize: timeseriesCache.size,
        bulkTimeseriesCacheSize: bulkTimeseriesCache.size,
        rateLimiterRequests: rateLimiter.requests.length,
        lastRequestTime: rateLimiter.lastRequestTime
    };
}

module.exports = {
    ensureMarketDataIsFresh,
    fetchTimeseriesForItem,
    fetchBulkTimeseries, // Re-added this method
    getMarketData,
    getMapping, // ADDED THE MISSING METHOD
    getHighLiquidityItems,
    clearCaches,
    getCacheStats
};