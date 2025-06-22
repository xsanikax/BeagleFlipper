const { analyzeHistoricFlips } = require('./historicalAnalyzer');
const wikiApi = require('./wikiApiHandler');

class SuggestionEngine {
    constructor(db, config) {
        this.db = db;
        this.baseConfig = config;
        this.combinedCommodities = { ...this.baseConfig.TARGET_COMMODITIES };
        this.flipsRef = this.db.collection('flips');
    }

    /**
     * Initializes the engine by analyzing historical data from DaBeagleBoss.csv
     * and merging it with the hardcoded commodities list.
     */
    async initialize() {
        console.log("Initializing SuggestionEngine: Analyzing historical data...");
        const dynamicTargets = analyzeHistoricFlips();

        dynamicTargets.forEach(target => {
            if (!this.combinedCommodities[target.id]) {
                console.log(`Dynamically adding target from history: ${target.name}`);
                this.combinedCommodities[target.id] = target;
            }
        });
        console.log(`Engine initialized with ${Object.keys(this.combinedCommodities).length} total targets.`);
    }

    /**
     * Your original run method, now modified to use the expanded list of items.
     * All of your original logic is preserved.
     */
    async run() {
        console.log(`SuggestionEngine: Running flip analysis on ${Object.keys(this.combinedCommodities).length} items.`);

        await wikiApi.ensureMarketDataIsFresh();
        const marketData = wikiApi.getMarketData();
        if (!marketData || !marketData.latest) {
            console.error("Engine Run: Could not get market data.");
            return;
        }

        const batch = this.db.batch();

        // --- FIX: This now iterates over the COMBINED list of hardcoded and historical items ---
        for (const itemIdStr of Object.keys(this.combinedCommodities)) {
            const itemId = parseInt(itemIdStr, 10);
            const itemConfig = this.combinedCommodities[itemId];
            const latestItemData = marketData.latest[itemId];

            if (!latestItemData || !latestItemData.high || !latestItemData.low) {
                continue; // Skip if no fresh price data
            }

            const potentialBuyPrice = latestItemData.low;
            const potentialSellPrice = latestItemData.high;

            if (potentialSellPrice <= potentialBuyPrice) {
                continue;
            }

            const margin = potentialSellPrice - potentialBuyPrice;
            const profitPercentage = margin / potentialBuyPrice;

            if (profitPercentage > this.baseConfig.TRADING_CONFIG.MIN_MARGIN_PERCENTAGE) {
                const flipDocRef = this.flipsRef.doc(`${itemId}`);

                batch.set(flipDocRef, {
                    item_id: itemId,
                    item_name: itemConfig.name,
                    buy_price: potentialBuyPrice,
                    sell_price: potentialSellPrice,
                    margin: margin,
                    profit_percentage: profitPercentage,
                    timestamp: Math.floor(Date.now() / 1000)
                }, { merge: true });
            }
        }

        try {
            await batch.commit();
            console.log("SuggestionEngine run completed and potential flips have been updated in Firestore.");
        } catch (error) {
            console.error("Error committing flips batch to Firestore:", error);
        }
    }
}

module.exports = { SuggestionEngine };