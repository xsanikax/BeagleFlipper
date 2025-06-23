const { analyzeHistoricFlips } = require('./historicalAnalyzer');
const wikiApi = require('./wikiApiHandler');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');
const config = require('./tradingConfig');
const modelRunner = require('./model_runner');

// Enhanced helper functions for high-velocity trading
function calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    return Math.sqrt(variance);
}

function calculateMomentum(prices) {
    if (prices.length < 2) return 0;
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    if (startPrice === 0) return 0;
    return (endPrice - startPrice) / startPrice;
}

function calculateMAPriceRatio(currentPrice, prices) {
    if (prices.length === 0) return 1;
    const movingAverage = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (movingAverage === 0) return 1;
    return currentPrice / movingAverage;
}

// Enhanced liquidity scoring for high-velocity flips
function calculateLiquidityScore(timeseries, limit) {
    if (!timeseries || timeseries.length < 3) return 0;

    // Recent volume average (last 3 data points)
    const recentVolume = timeseries.slice(-3).reduce((sum, point) => {
        return sum + (point.lowPriceVolume || 0) + (point.highPriceVolume || 0);
    }, 0) / 3;

    // Volume consistency (lower std dev = more consistent = better for quick flips)
    const volumes = timeseries.slice(-6).map(point =>
        (point.lowPriceVolume || 0) + (point.highPriceVolume || 0)
    );
    const volumeMean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeStdDev = Math.sqrt(volumes.reduce((sum, vol) => sum + Math.pow(vol - volumeMean, 2), 0) / volumes.length);

    const consistencyRatio = volumeMean > 0 ? (volumeMean - volumeStdDev) / volumeMean : 0;

    // Score based on volume vs buy limit ratio and consistency
    const volumeToLimitRatio = Math.min(recentVolume / (limit || 1000), 10); // Cap at 10x

    return Math.max(0, volumeToLimitRatio * Math.max(0.3, consistencyRatio) * 100);
}

// Enhanced spread analysis for optimal pricing
function analyzeSpreadOpportunity(latest, timeseries) {
    if (!latest || !timeseries || timeseries.length < 2) return null;

    const currentSpread = latest.high - latest.low;
    const currentSpreadPercent = (currentSpread / latest.low) * 100;

    // Calculate recent average spread
    const recentSpreads = timeseries.slice(-6).map(point => point.avgHighPrice - point.avgLowPrice);
    const avgSpread = recentSpreads.reduce((a, b) => a + b, 0) / recentSpreads.length;

    // Price stability check - we want items with tight, consistent spreads
    const spreadStability = 1 - (Math.sqrt(recentSpreads.reduce((sum, spread) =>
        sum + Math.pow(spread - avgSpread, 2), 0) / recentSpreads.length) / avgSpread);

    return {
        currentSpread,
        currentSpreadPercent,
        avgSpread,
        spreadStability: Math.max(0, spreadStability),
        isWideSpread: currentSpreadPercent > 2, // Flag wide spreads
        isTightSpread: currentSpreadPercent < 0.5 // Flag tight spreads (good for volume)
    };
}

// Optimized pricing strategy for high-velocity flips
function calculateOptimalPrices(latest, timeseries, spreadAnalysis) {
    const { low, high } = latest;

    // For high-velocity trading, we use tighter margins but higher precision
    let buyPriceBuffer, sellPriceBuffer;

    if (spreadAnalysis && spreadAnalysis.isTightSpread) {
        // Tight spread items - minimal buffer, focus on speed
        buyPriceBuffer = Math.max(1, Math.ceil(low * 0.003)); // 0.3%
        sellPriceBuffer = Math.max(1, Math.ceil(high * 0.003));
    } else if (spreadAnalysis && spreadAnalysis.isWideSpread) {
        // Wide spread items - can afford slightly larger buffer
        buyPriceBuffer = Math.max(1, Math.ceil(low * 0.008)); // 0.8%
        sellPriceBuffer = Math.max(1, Math.ceil(high * 0.008));
    } else {
        // Standard items - balanced approach
        buyPriceBuffer = Math.max(1, Math.ceil(low * 0.005)); // 0.5%
        sellPriceBuffer = Math.max(1, Math.ceil(high * 0.005));
    }

    // If we have timeseries, use recent average prices for more accuracy
    if (timeseries && timeseries.length >= 2) {
        const recentLows = timeseries.slice(-3).map(p => p.avgLowPrice).filter(p => p > 0);
        const recentHighs = timeseries.slice(-3).map(p => p.avgHighPrice).filter(p => p > 0);

        if (recentLows.length > 0 && recentHighs.length > 0) {
            const avgRecentLow = recentLows.reduce((a, b) => a + b, 0) / recentLows.length;
            const avgRecentHigh = recentHighs.reduce((a, b) => a + b, 0) / recentHighs.length;

            // Blend current prices with recent averages for better accuracy
            const blendedLow = Math.round((low * 0.7) + (avgRecentLow * 0.3));
            const blendedHigh = Math.round((high * 0.7) + (avgRecentHigh * 0.3));

            const buyPrice = Math.ceil(blendedLow + buyPriceBuffer);
            const sellPrice = Math.floor(blendedHigh - sellPriceBuffer);

            return { buyPrice, sellPrice, blended: true };
        }
    }

    // Fallback to simple buffer method
    const buyPrice = Math.ceil(low + buyPriceBuffer);
    const sellPrice = Math.floor(high - sellPriceBuffer);

    return { buyPrice, sellPrice, blended: false };
}

class SuggestionEngine {
    constructor(db, config) {
        this.db = db;
        this.config = config;
        this.targetItems = { ...this.config.TARGET_COMMODITIES };
        this.liquidityCache = new Map(); // Cache liquidity scores
    }

    async initialize() {
        console.log("Initializing DaBeagleBoss High-Velocity Engine: Scanning for quick flip opportunities...");
        try {
            const dynamicTargets = analyzeHistoricFlips();
            dynamicTargets.forEach(target => {
                if (!this.targetItems[target.id]) {
                    this.targetItems[target.id] = target;
                }
            });
            console.log(`Engine initialized with ${Object.keys(this.targetItems).length} total targets.`);
        } catch (e) {
            console.error("Failed to analyze historical flips during initialization.", e);
        }
    }

    async getRankedSuggestions(userState) {
        const {
            gp = 0,
            offers = [],
            display_name: displayName,
            blocked_items = [],
            timeframe = 5,
            recently_suggested = []
        } = userState || {};

        const blockedItemsSet = new Set(blocked_items);
        const recentlySuggestedSet = new Set(recently_suggested || []);

        await wikiApi.ensureMarketDataIsFresh();
        const marketData = wikiApi.getMarketData();
        if (!marketData || !marketData.latest) return [];

        const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
        const emptySlots = 8 - activeOfferItemIds.size;
        if (emptySlots <= 0) return [];

        const cashPerSlot = Math.floor(gp / emptySlots);
        console.log(`[High-Velocity Engine] Analyzing with ${cashPerSlot} GP per slot across ${emptySlots} empty slots`);

        const recentlyBought = await getRecentlyBoughtQuantities(this.db, displayName);
        const allItemIds = Object.keys(marketData.latest).map(id => parseInt(id));

        console.log(`[High-Velocity Engine] Scanning ${allItemIds.length} items for high-velocity opportunities...`);

        // Process items in smaller chunks for better performance
        const chunkSize = 100;
        const chunks = [];
        for (let i = 0; i < allItemIds.length; i += chunkSize) {
            chunks.push(allItemIds.slice(i, i + chunkSize));
        }

        let allCandidates = [];
        let processedCount = 0;

        for (const chunk of chunks) {
            const chunkPromises = chunk.map(async (itemId) => {
                try {
                    // Quick filters first
                    if (blockedItemsSet.has(itemId) || activeOfferItemIds.has(itemId) || recentlySuggestedSet.has(itemId)) {
                        return null;
                    }

                    const mappingInfo = marketData.mapping.find(m => m.id === itemId);
                    const latest = marketData.latest[itemId];

                    if (!mappingInfo || !latest || latest.low <= 0 || latest.high <= 0) return null;
                    if (!mappingInfo.limit || mappingInfo.limit < 50) return null; // Minimum viable limit

                    // Get timeseries for liquidity analysis
                    const timeseries = await wikiApi.fetchTimeseriesForItem(itemId, '5m');

                    // Calculate liquidity score
                    const liquidityScore = this.calculateLiquidityScore(timeseries, mappingInfo.limit);

                    // For high-velocity trading, we need good liquidity
                    if (liquidityScore < 10) return null; // Minimum liquidity threshold

                    // Analyze spread opportunity
                    const spreadAnalysis = analyzeSpreadOpportunity(latest, timeseries);

                    // Calculate optimal prices
                    const { buyPrice, sellPrice, blended } = calculateOptimalPrices(latest, timeseries, spreadAnalysis);

                    // Profitability check
                    if (sellPrice <= buyPrice || buyPrice > cashPerSlot) return null;

                    const taxAmount = Math.min(Math.floor(sellPrice * this.config.TRADING_CONFIG.GE_TAX_RATE), this.config.TRADING_CONFIG.GE_TAX_CAP);
                    const netProfitPerItem = sellPrice - taxAmount - buyPrice;

                    // For high-velocity, even 1gp profit is good if volume is high
                    if (netProfitPerItem < 1) return null;

                    const remainingLimit = (mappingInfo.limit || 0) - (recentlyBought.get(itemId) || 0);
                    const quantityToBuy = Math.min(Math.floor(cashPerSlot / buyPrice), remainingLimit);
                    if (quantityToBuy <= 0) return null;

                    const totalProfit = netProfitPerItem * quantityToBuy;
                    const profitMargin = (netProfitPerItem / buyPrice) * 100;
                    const volumeScore = liquidityScore * quantityToBuy;

                    // Enhanced AI model validation with quick-flip specific features
                    let confidence = 0.6; // Default confidence
                    let aiFeatures = {};

                    if (timeseries && timeseries.length >= 2) {
                        try {
                            const recentPrices = timeseries.slice(-Math.min(6, timeseries.length))
                                .map(p => (p.avgLowPrice + p.avgHighPrice) / 2);

                            aiFeatures = {
                                buy_price: buyPrice,
                                quantity: quantityToBuy,
                                trade_duration_hours: timeframe === 5 ? 0.15 : (timeframe / 60),
                                buy_day_of_week: new Date().getUTCDay(),
                                buy_hour_of_day: new Date().getUTCHours(),
                                strategy_5m: timeframe === 5 ? 1 : 0,
                                strategy_8h: timeframe === 480 ? 1 : 0,
                                volatility: calculateVolatility(recentPrices),
                                momentum: calculateMomentum(recentPrices),
                                ma_price_ratio: calculateMAPriceRatio(buyPrice, recentPrices),
                                liquidity_score: liquidityScore,
                                spread_stability: spreadAnalysis ? spreadAnalysis.spreadStability : 0.5,
                                volume_to_limit_ratio: Math.min(quantityToBuy / mappingInfo.limit, 1)
                            };

                            confidence = modelRunner.predict(aiFeatures);
                        } catch (error) {
                            // If AI fails, use heuristic confidence based on liquidity and margin
                            confidence = Math.min(0.95, 0.4 + (liquidityScore / 100) + (profitMargin / 100));
                        }
                    }

                    // For high-velocity trading, prioritize liquidity over pure profit
                    const velocityScore = (liquidityScore * 0.4) + (volumeScore * 0.3) + (confidence * 100 * 0.3);

                    return {
                        itemId,
                        itemName: mappingInfo.name,
                        confidence,
                        currentBuyPrice: buyPrice,
                        currentSellPrice: sellPrice,
                        quantityToBuy,
                        totalProfit,
                        profitMargin,
                        netProfitPerItem,
                        liquidityScore,
                        velocityScore,
                        volumeScore,
                        remainingLimit,
                        spreadAnalysis,
                        blendedPricing: blended,
                        aiFeatures,
                        isHighVelocity: liquidityScore > 50 && quantityToBuy > 1000,
                        estimatedFillTime: this.estimateFillTime(liquidityScore, quantityToBuy, mappingInfo.limit)
                    };
                } catch (error) {
                    console.error(`Error analyzing item ${itemId}:`, error.message);
                    return null;
                }
            });

            const settledResults = await Promise.allSettled(chunkPromises);
            const chunkCandidates = settledResults
                .filter(res => res.status === 'fulfilled' && res.value)
                .map(res => res.value);

            allCandidates = allCandidates.concat(chunkCandidates);
            processedCount += chunk.length;

            if (processedCount % 500 === 0) {
                console.log(`[High-Velocity Engine] Processed ${processedCount}/${allItemIds.length} items...`);
            }
        }

        // Enhanced sorting for high-velocity trading
        allCandidates.sort((a, b) => {
            // Primary: Velocity score (combination of liquidity, volume, and confidence)
            if (Math.abs(a.velocityScore - b.velocityScore) > 10) {
                return b.velocityScore - a.velocityScore;
            }

            // Secondary: Total profit (still important)
            if (Math.abs(a.totalProfit - b.totalProfit) > 5000) {
                return b.totalProfit - a.totalProfit;
            }

            // Tertiary: Estimated fill time (faster is better)
            return a.estimatedFillTime - b.estimatedFillTime;
        });

        // Filter for high-quality suggestions
        const qualitySuggestions = allCandidates.filter(candidate => {
            // Must have reasonable liquidity
            if (candidate.liquidityScore < 15) return false;

            // Must have positive profit (even 1gp is fine for high volume)
            if (candidate.totalProfit <= 0) return false;

            // Must have reasonable confidence
            if (candidate.confidence < 0.3) return false;

            // Must be able to complete within reasonable time
            if (candidate.estimatedFillTime > 600) return false; // 10 minutes max

            return true;
        });

        console.log(`[High-Velocity Engine] Found ${qualitySuggestions.length} high-velocity opportunities from ${allCandidates.length} total candidates`);

        // Log top 5 suggestions for debugging
        const topSuggestions = qualitySuggestions.slice(0, 5);
        topSuggestions.forEach((suggestion, index) => {
            console.log(`[Top ${index + 1}] ${suggestion.itemName}: ${suggestion.netProfitPerItem}gp/item × ${suggestion.quantityToBuy} = ${suggestion.totalProfit}gp profit, liquidity: ${suggestion.liquidityScore.toFixed(1)}, fill time: ${suggestion.estimatedFillTime}s`);
        });

        return qualitySuggestions.slice(0, 75); // Return more suggestions for better queue
    }

    calculateLiquidityScore(timeseries, limit) {
        // Use cached score if available
        const cacheKey = `${JSON.stringify(timeseries?.slice(-3)?.map(t => t.timestamp))}-${limit}`;
        if (this.liquidityCache.has(cacheKey)) {
            return this.liquidityCache.get(cacheKey);
        }

        const score = calculateLiquidityScore(timeseries, limit);
        this.liquidityCache.set(cacheKey, score);

        // Clean cache periodically
        if (this.liquidityCache.size > 1000) {
            const keysToDelete = Array.from(this.liquidityCache.keys()).slice(0, 200);
            keysToDelete.forEach(key => this.liquidityCache.delete(key));
        }

        return score;
    }

    estimateFillTime(liquidityScore, quantity, limit) {
        // Estimate time to fill based on liquidity and quantity
        const liquidityFactor = Math.max(0.1, liquidityScore / 100);
        const quantityFactor = Math.min(1, quantity / (limit * 0.1)); // Assume 10% of limit is reasonable volume

        // Base time of 60 seconds, adjusted by factors
        const baseTime = 60;
        const estimatedTime = baseTime / (liquidityFactor * quantityFactor);

        return Math.min(600, Math.max(30, estimatedTime)); // Between 30 seconds and 10 minutes
    }
}

module.exports = { SuggestionEngine };