// back-end/eightHourStrategy.js - Corrected
const wikiApi = require('./wikiApiHandler');
const modelRunner = require('./model_runner_8h');
const { getRecentlyBoughtQuantities } = require('./buyLimitTracker');

const TAX_RATE = 0.01;

const CONFIG_8H = {
    MIN_VOLUME_PER_HOUR: 50,
    MIN_CASH_PER_SLOT: 1000,
    AI_CONFIDENCE_THRESHOLD: 0.65,
    MIN_PROFIT_GP: 10,
    MIN_PROFIT_PERCENT: 0.05,
    MAX_PRICE_UPDATE_AGE_HOURS: 2
};

async function prepareAIMarketData(itemId, latestData) {
    try {
        const timeseries = await wikiApi.fetchTimeseriesForItem(itemId, '5m');
        if (!timeseries || timeseries.length === 0) {
            return null;
        }

        const recent = timeseries.slice(-24);
        const latest = recent[recent.length - 1];

        const prices = recent.map(t => (t.avgHighPrice + t.avgLowPrice) / 2).filter(p => p > 0);
        if (prices.length < 12) return null; // Need at least an hour of data

        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const volatility = Math.sqrt(prices.map(x => Math.pow(x - avgPrice, 2)).reduce((a, b) => a + b, 0) / prices.length) / avgPrice;

        const momentum = (latest.avgHighPrice - prices[0]) / prices[0];

        return {
            instant_buy_price: latestData.high,
            instant_sell_price: latestData.low,
            daily_volume: latestData.highPriceVolume + latestData.lowPriceVolume,
            current_spread: latestData.high - latestData.low,
            volatility: volatility,
            momentum: momentum,
        };
    } catch (error) {
        console.error(`[AI PREP] Error for item ${itemId}:`, error);
        return null;
    }
}

async function getEightHourSuggestion(userState, db, displayName) {
    console.log(`\n=== STARTING 8-HOUR AI STRATEGY ===`);

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();
    if (!marketData || !marketData.latest) {
      return { type: "wait" };
    }

    const { inventory = [], offers = [] } = userState;
    const activeOfferItemIds = new Set(offers.filter(o => o.status !== 'empty').map(o => o.item_id));
    const cashAmount = inventory.find(i => i.id === 995)?.amount || 0;

    if (cashAmount < CONFIG_8H.MIN_CASH_PER_SLOT) {
      console.log(`[AI] Insufficient cash: ${cashAmount}`);
      return { type: "wait" };
    }

    const recentlyBoughtMap = await getRecentlyBoughtQuantities(db, displayName);
    const candidates = [];

    for (const itemIdStr in marketData.latest) {
        const itemId = parseInt(itemIdStr, 10);
        if (activeOfferItemIds.has(itemId)) continue;

        const latestData = marketData.latest[itemId];
        const mappingInfo = marketData.mapping.find(m => m.id === itemId);

        if (!mappingInfo || !latestData || !mappingInfo.tradeable_on_ge) continue;

        const aiMarketData = await prepareAIMarketData(itemId, latestData);
        if (!aiMarketData) continue;

        const aiPrediction = await modelRunner.run(aiMarketData);
        if (!aiPrediction || aiPrediction.confidence < CONFIG_8H.AI_CONFIDENCE_THRESHOLD) continue;

        const buyPrice = Math.round(aiPrediction.buy_price);
        const sellPrice = Math.round(aiPrediction.sell_price);

        const profitGP = (sellPrice * (1 - TAX_RATE)) - buyPrice;
        const profitPercent = profitGP / buyPrice;

        if (profitGP < CONFIG_8H.MIN_PROFIT_GP || profitPercent < CONFIG_8H.MIN_PROFIT_PERCENT) continue;

        const limitRemaining = (mappingInfo.limit || 0) - (recentlyBoughtMap.get(itemId) || 0);
        if (limitRemaining <= 0) continue;

        const quantity = Math.min(Math.floor(cashAmount / buyPrice), limitRemaining);
        if (quantity <= 0) continue;

        candidates.push({
            id: itemId, name: mappingInfo.name,
            buyPrice, sellPrice, quantity,
            profitGP, profitPercent,
            confidence: aiPrediction.confidence,
            marketData: aiMarketData,
            score: aiPrediction.confidence * profitGP * quantity
        });
    }

    if (candidates.length === 0) {
        console.log('[AI] No confident opportunities found.');
        return { type: "wait" };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    console.log(`\n🏆 AI SELECTED: ${best.name}`);
    console.log(`   🤖 AI Decision: Buy@${best.buyPrice} → Target@${best.sellPrice}`);
    console.log(`   💰 Trade: ${best.quantity}x @ ${best.buyPrice}gp = ${(best.buyPrice * best.quantity).toLocaleString()}gp`);
    console.log(`   📈 Expected: ${best.profitGP.toLocaleString()}gp profit (${(best.profitPercent*100).toFixed(1)}%)`);

    // --- THE FIX: Return object no longer contains 'message' or 'name' ---
    return {
        type: "buy",
        item_id: best.id,
        price: best.buyPrice,
        quantity: best.quantity
    };
}

module.exports = { getEightHourSuggestion };