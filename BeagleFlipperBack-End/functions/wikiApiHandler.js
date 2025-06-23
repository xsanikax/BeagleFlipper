// Enhanced wikiApiHandler.js for High-Velocity Trading
// Optimized for rapid data fetching and accurate pricing

const axios = require('axios');
const WIKI_API_BASE_URL = 'https://prices.runescape.wiki/api/v1/osrs';
const USER_AGENT = 'BeagleFlipper High-Velocity Client - Contact @DaBeagleBoss on Discord';

let marketDataCache = {};
const timeseriesCache = new Map();
const bulkTimeseriesCache = new Map(); // For bulk requests

// Reduced cache durations for high-velocity trading
const MARKET_DATA_CACHE_DURATION_MS = 15 * 1000; // 15 seconds for latest prices
const TIMESERIES_CACHE_DURATION_MS_5M = 2 * 60 * 1000; // 2 minutes for 5m data
const API_CALL_TIMEOUT_MS = 8000; // 8-second timeout for faster failures

// Rate limiting to avoid API abuse
const rateLimiter = {
    requests: [],
    maxRequestsPerMinute: 100,

    canMakeRequest() {
        const now = Date.now();
        // Remove requests older than 1 minute
        this.requests = this.requests.filter(time => now - time < 60000);
        return this.requests.length < this.maxRequestsPerMinute;
    },

    recordRequest() {
        this.requests.push(Date.now());
    }
};

/**
 * Enhanced fetch with retry logic and better error handling
 */
async function fetchFromWiki(endpoint, params = {}, retries = 2) {
    if (!rateLimiter.canMakeRequest()) {
        console.warn('[Wiki API] Rate limit reached, waiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!rateLimiter.canMakeRequest()) {
            throw new Error('Rate limit exceeded');
        }
    }

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
            const response = await axios.get(url, options);

            // Validate response
            if (!response.data) {
                throw new Error('Empty response data');
            }

            return response.data;
        } catch (error) {
            const isLastAttempt = attempt === retries;

            if (error.response) {
                console.error(`[Wiki API] HTTP ${error.response.status} from /${endpoint} (attempt ${attempt + 1})`);
                if (error.response.status === 429) {
                    // Rate limited, wait longer
                    if (!isLastAttempt) {
                        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                        continue;
                    }
                }
                if (error.response.status >= 500 && !isLastAttempt) {
                    // Server error, retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }
            } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                console.error(`[Wiki API] Timeout on /${endpoint} (attempt ${attempt + 1})`);
                if (!isLastAttempt) {
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                    continue;
                }
            } else {
                console.error(`[Wiki API] Network error on /${endpoint}:`, error.message);
            }

            if (isLastAttempt) {
                console.error(`[Wiki API] All attempts failed for /${endpoint}`);
                return null;
            }
        }
    }

    return null;
}

/**
 * Enhanced market data fetching with validation
 */
async function ensureMarketDataIsFresh() {
    const now = Date.now();
    if (marketDataCache.timestamp && (now - marketDataCache.timestamp < MARKET_DATA_CACHE_DURATION_MS)) {
        return; // Cache is fresh
    }

    console.log('[Wiki API] Refreshing market data for high-velocity trading...');

    try {
        const [latestData, mappingData] = await Promise.all([
            fetchFromWiki('latest'),
            fetchFromWiki('mapping')
        ]);

        if (latestData && mappingData) {
            // Validate data structure
            if (!latestData.data || typeof latestData.data !== 'object') {
                throw new Error('Invalid latest data structure');
            }

            if (!Array.isArray(mappingData)) {
                throw new Error('Invalid mapping data structure');
            }

            // Filter out invalid price data
            const validPriceData = {};
            Object.entries(latestData.data).forEach(([itemId, priceData]) => {
                if (priceData && priceData.high > 0 && priceData.low > 0 && priceData.high >= priceData.low) {
                    validPriceData[itemId] = priceData;
                }
            });

            // Filter out items without buy limits
            const validMapping = mappingData.filter(item =>
                item && item.id && item.name && item.limit && item.limit > 0
            );

            marketDataCache = {
                latest: validPriceData,
                mapping: validMapping,
                timestamp: now,
                itemCount: Object.keys(validPriceData).length
            };

            console.log(`[Wiki API] Market data updated: ${marketDataCache.itemCount} items with valid prices`);
        } else {
            throw new Error('Failed to fetch market data');
        }
    } catch (error) {
        console.error('[Wiki API] Error updating market data:', error.message);
        // Keep using old cache if available
        if (!marketDataCache.latest) {
            console.error('[Wiki API] No cached data available, suggestions may be limited');
        }
    }
}

/**
 * Enhanced timeseries fetching with better caching
 */
async function fetchTimeseriesForItem(itemId, timestep = '5m') {
    const cacheKey = `${itemId}-${timestep}`;
    const now = Date.now();

    const cachedEntry = timeseriesCache.get(cacheKey);
    if (cachedEntry && (now - cachedEntry.timestamp < TIMESERIES_CACHE_DURATION_MS_5M)) {
        return cachedEntry.data;
    }

    try {
        const response = await fetchFromWiki('timeseries', { id: itemId, timestep: timestep });

        if (response && Array.isArray(response.data)) {
            // Validate and clean timeseries data
            const validData = response.data.filter(point =>
                point &&
                point.timestamp &&
                (point.avgHighPrice > 0 || point.avgLowPrice > 0) &&
                point.avgHighPrice >= point.avgLowPrice
            );

            if (validData.length > 0) {
                timeseriesCache.set(cacheKey, { data: validData, timestamp: now });
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
 * Bulk timeseries fetching for multiple items (more efficient)
 */
async function fetchBulkTimeseries(itemIds, timestep = '5m') {
    const cacheKey = `bulk-${itemIds.sort().join(',')}-${timestep}`;
    const now = Date.now();

    const cachedEntry = bulkTimeseriesCache.get(cacheKey);
    if (cachedEntry && (now - cachedEntry.timestamp < TIMESERIES_CACHE_DURATION_MS_5M)) {
        return cachedEntry.data;
    }

    // Fetch individual timeseries for each item
    const results = {};
    const chunkSize = 10; // Process in smaller chunks to avoid overwhelming the API

    for (let i = 0; i < itemIds.length; i += chunkSize) {
        const chunk = itemIds.slice(i, i + chunkSize);
        const promises = chunk.map(itemId =>
            fetchTimeseriesForItem(itemId, timestep)
                .then(data => ({ itemId, data }))
                .catch(error => ({ itemId, error: error.message }))
        );

        const chunkResults = await Promise.allSettled(promises);

        chunkResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value.data) {
                results[result.value.itemId] = result.value.data;
            }
        });

        // Small delay between chunks to be respectful to the API
        if (i + chunkSize < itemIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    bulkTimeseriesCache.set(cacheKey, { data: results, timestamp: now });

    // Clean cache periodically
    if (bulkTimeseriesCache.size > 50) {
        const oldestKeys = Array.from(bulkTimeseriesCache.keys()).slice(0, 10);
        oldestKeys.forEach(key => bulkTimeseriesCache.delete(key));
    }

    return results;
}

/**
 * Get current market data with additional metadata
 */
function getMarketData() {
    return {
        ...marketDataCache,
        cacheAge: marketDataCache.timestamp ? Date.now() - marketDataCache.timestamp : null,
        isStale: marketDataCache.timestamp ? (Date.now() - marketDataCache.timestamp) > MARKET_DATA_CACHE_DURATION_MS : true
    };
}

/**
 * Get high-liquidity items for quick scanning
 */
function getHighLiquidityItems(minLimit = 1000) {
    if (!marketDataCache.mapping) return [];

    return marketDataCache.mapping
        .filter(item => item.limit >= minLimit)
        .sort((a, b) => b.limit - a.limit)
        .slice(0, 100); // Top 100 high-limit items
}

/**
 * Clear all caches (useful for testing or memory management)
 */
function clearCaches() {
    marketDataCache = {};
    timeseriesCache.clear();
    bulkTimeseriesCache.clear();
    console.log('[Wiki API] All caches cleared');
}

/**
 * Get cache statistics for monitoring
 */
function getCacheStats() {
    return {
        marketDataCached: !!marketDataCache.timestamp,
        marketDataAge: marketDataCache.timestamp ? Date.now() - marketDataCache.timestamp : null,
        timeseriesCacheSize: timeseriesCache.size,
        bulkTimeseriesCacheSize: bulkTimeseriesCache.size,
        rateLimiterRequests: rateLimiter.requests.length
    };
}

module.exports = {
    ensureMarketDataIsFresh,
    fetchTimeseriesForItem,
    fetchBulkTimeseries,
    getMarketData,
    getHighLiquidityItems,
    clearCaches,
    getCacheStats
};