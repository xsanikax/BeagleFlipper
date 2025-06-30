// ================================================================================= //
// ================================================================================= //
//                                                                                 //
//    ██████╗ ███████╗  █████╗  ██████╗ ██╗     ███████╗                           //
//    ██╔══██╗██╔════╝ ██╔══██╗██╔════╝ ██║     ██╔════╝                           //
//    ██████╔╝█████╗   ███████║██║  ███╗██║     █████╗                             //
//    ██╔══██╗██╔══╝   ██╔══██║██║   ██║██║     ██╔══╝                             //
//    ██████╔╝███████╗ ██║  ██║╚██████╔╝███████╗███████╗                           //
//    ╚═════╝ ╚══════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝                           //
//                                                                                 //
//    ███████╗██╗     ██╗██████╗ ██████╗ ███████╗██████╗                           //
//    ██╔════╝██║     ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗                          //
//    █████╗  ██║     ██║██████╔╝██████╔╝█████╗  ██████╔╝                          //
//    ██╔══╝  ██║     ██║██╔═══╝ ██╔═══╝ ██╔══╝  ██╔══██╗                          //
//    ██║     ███████╗██║██║     ██║     ███████╗██║  ██║                          //
//    ╚═╝     ╚══════╝╚═╝╚═╝     ╚═╝     ╚══════╝╚═╝  ╚═╝                          //
//                                                                                 //
//      CONFIGURATION v27.0 - HYBRID ANALYTICS EDITION                             //
//                                                                                 //
// ================================================================================= //
// ================================================================================= //

const TRADING_CONFIG = {

    // ================================================================================= //
    // SECTION 1: MASTER STRATEGY & CORE SETTINGS
    // ================================================================================= //

    ENABLE_BEAGLE_FLIPPER: true,
    /* ================================================================================
       MASTER HYBRID ANALYTICS STRATEGY SWITCH
       --------------------------------------------------------------------------------
       This controls the advanced hybrid analytics engine with parallel processing,
       volatility detection, and intelligent item prioritization.
       ================================================================================ */

    ENABLE_MODIFY_SUGGESTIONS: true,
    /* ================================================================================
       MASTER MODIFY SWITCH - Currently handled by abort logic in hybrid system
       ================================================================================ */

    FIREBASE_WEB_API_KEY: "AIzaSyDspCsPLP5hpVnRCE-qYSdUbM8w-eMCJcY",
    /* ================================================================================
       CRITICAL FOR AUTHENTICATION
       ================================================================================ */

    // ================================================================================= //
    // SECTION 2: HYBRID ANALYTICS CORE PARAMETERS
    // ================================================================================= //

    TAX_RATE: 0.02,
    /* ================================================================================
       GE TAX RATE - Used for all profit calculations
       ================================================================================ */

    MIN_PROFIT_PER_ITEM: 1,
    /* ================================================================================
       MINIMUM PROFIT THRESHOLD - Must be profitable after tax
       ================================================================================ */

    MIN_ITEM_VALUE: 100,
    /* ================================================================================
       MINIMUM ITEM VALUE - Ignores items worth less than this
       ================================================================================ */

    // ================================================================================= //
    // SECTION 3: VOLUME & PRIORITY THRESHOLDS
    // ================================================================================= //

    HIGH_VOLUME_THRESHOLD: 500000,
    /* ================================================================================
       HIGH VOLUME THRESHOLD
       --------------------------------------------------------------------------------
       Items with hourly volume above this are prioritized for immediate trading.
       These fill quickly and generate consistent cash flow.
       ================================================================================ */

    LOW_VOLUME_THRESHOLD: 1000,
    /* ================================================================================
       LOW VOLUME THRESHOLD
       --------------------------------------------------------------------------------
       Minimum acceptable volume for any item to be considered.
       ================================================================================ */

    MAX_LOW_VOLUME_ACTIVE: 2,
    /* ================================================================================
       MAXIMUM LOW VOLUME SLOTS
       --------------------------------------------------------------------------------
       Maximum number of active offers allowed for low-volume items to prevent
       getting stuck with slow-moving inventory.
       ================================================================================ */

    // ================================================================================= //
    // SECTION 4: PRICING WINDOW CONFIGURATION
    // ================================================================================= //

    BUY_SNAPSHOT_WINDOW: 3,
    /* ================================================================================
       BUY PRICING WINDOW
       --------------------------------------------------------------------------------
       Number of 5-minute snapshots to analyze for buy pricing (3 = 15 minutes).
       Shorter window for faster buy decisions.
       ================================================================================ */

    SELL_SNAPSHOT_WINDOW: 4,
    /* ================================================================================
       SELL PRICING WINDOW
       --------------------------------------------------------------------------------
       Number of 5-minute snapshots to analyze for sell pricing (4 = 20 minutes).
       Longer window for more stable sell price analysis.
       ================================================================================ */

    // ================================================================================= //
    // SECTION 5: VOLATILITY DETECTION & OPPORTUNITY TRADING
    // ================================================================================= //

    VOLATILITY_THRESHOLD: 0.15,
    /* ================================================================================
       VOLATILITY THRESHOLD
       --------------------------------------------------------------------------------
       Percentage change (15%) from average to trigger opportunity pricing.
       Detects dramatic price drops for buy opportunities and spikes for sell opportunities.
       ================================================================================ */

    OPPORTUNITY_WINDOW: 3,
    /* ================================================================================
       OPPORTUNITY DETECTION WINDOW
       --------------------------------------------------------------------------------
       Number of recent snapshots to analyze for current market conditions.
       ================================================================================ */

    // ================================================================================= //
    // SECTION 6: PARALLEL PROCESSING CONFIGURATION
    // ================================================================================= //

    BATCH_SIZE: 25,
    /* ================================================================================
       PARALLEL PROCESSING BATCH SIZE
       --------------------------------------------------------------------------------
       Number of items to analyze simultaneously for faster processing.
       Reduces timeout errors by fetching data in parallel.
       ================================================================================ */

    // ================================================================================= //
    // SECTION 7: CASH & RISK MANAGEMENT
    // ================================================================================= //

    MIN_CASH_TOTAL: 1000,
    /* ================================================================================
       MINIMUM TOTAL CASH - Must have at least this much to start trading
       ================================================================================ */

    BUY_LIMIT_RESET_HOURS: 4,
    /* How often the 4-hour buy limits reset in-game. */

    ENABLE_DEBUG_LOGGING: true,
    /* Set to true to see detailed logs in your console. */

    // ================================================================================= //
    // SECTION 8: MODE TOGGLES
    // ================================================================================= //

    F2P_MODE: false,
    /* ================================================================================
       F2P MODE TOGGLE
       --------------------------------------------------------------------------------
       Set to true to trade only F2P items, false for P2P (members) items.
       ================================================================================ */

    SELL_ONLY_MODE: false,
    /* ================================================================================
       SELL ONLY MODE TOGGLE
       --------------------------------------------------------------------------------
       Set to true to only sell inventory items, false for normal buy/sell operation.
       ================================================================================ */
};

// ================================================================================= //
// SECTION 9: STRATEGIC ITEM LISTS (FROM HYBRID ANALYTICS)
// ================================================================================= //

/**
 * High-priority staple items - analyzed first for fastest execution
 * These are the most reliable, high-volume items from hybrid analytics
 */
const STAPLE_ITEMS = new Set([
    2,       // Cannonball
    560,     // Death rune
    565,     // Blood rune
    561,     // Nature rune
    9075,    // Astral rune
    12934,   // Zulrah's scales
    554,     // Fire rune
]);

/**
 * Complete target commodities list from hybrid analytics
 * This is the full list of profitable items identified through analysis
 */
const TARGET_COMMODITIES = new Set([
    13271, 4151, 27662, 9143, 809, 823, 449, 30843, 12851, 4708, 4712, 29993, 21352, 21350, 21361, 22557, 1712, 10368, 10370, 4675, 13441, 5952, 2452, 21034, 8009, 10378, 28991, 10386, 10388, 10390, 20065, 22443, 2503, 1747, 8921, 24605, 24609, 24607, 26390, 28315, 28321, 28318, 565, 25849, 28286, 28280, 28283, 22951, 22997, 1777, 8992, 22975, 11037, 20718, 6016, 26970, 19615, 562, 1452, 19619, 10033, 453, 11118, 30819, 30822, 30810, 30834, 10145, 564, 27018, 6693, 989, 23901, 6729, 24266, 24269, 11235, 29990, 23034, 12875, 9243, 21969, 24635, 24623, 23685, 21143, 536, 11732, 28257, 11260, 19484, 11920, 12800, 20002, 20849, 1615, 9244, 21971, 21320, 28435, 12859, 215, 30451, 28942, 30443, 28303, 28309, 28306, 20520, 20523, 20517, 1605, 22209, 8008, 776, 27045, 12526, 9470, 2357, 444, 21643, 21637, 21634, 1987, 209, 215, 217, 199, 205, 209, 213, 2485, 201, 207, 203, 91, 2495, 10372, 10374, 205, 97, 10828, 19921, 19933, 28351, 28348, 28357, 28354, 11260, 6922, 6920, 6918, 2351, 440, 12881, 4738, 4736, 10907, 12002, 2481, 11943, 4699, 563, 11959, 19478, 377, 11942, 1515, 859, 70, 5373, 6332, 12806, 389, 5314, 93, 6914, 822, 299, 10059, 7418, 1775, 7944, 28878, 4698, 10432, 4099, 12000, 19613, 561, 8778, 12902, 6524, 6522, 6525, 12002, 21282, 21961, 2110, 21015, 5972, 9044, 11095, 2293, 2434, 9676, 99, 5295, 2297, 2299, 2295, 2444, 391, 383, 10034, 2501, 21820, 2552, 2550, 28013, 12601, 2572, 9290, 21944, 892, 28260, 830, 9144, 19617, 10925, 1607, 6685, 10380, 10382, 12804, 11730, 6731, 12931, 26485, 26479, 4697, 231, 22879, 10127, 27039, 566, 12829, 12629, 12625, 2353, 29084, 28336, 28339, 28872, 29192, 3024, 95, 6333, 8780, 3002, 6523, 20716, 27289, 4749, 20062, 20059, 12924, 11905, 23079, 359, 6528, 12900, 11908, 1619, 235, 567, 12877, 4753, 22446, 28413, 21622, 6735, 239, 22883, 19621, 23535, 5998, 1515, 10376, 2497, 10378, 10380, 11889, 28263, 30321, 12934
]);

/**
 * The primary list of items for P2P (Members) worlds.
 * Enhanced with hybrid analytics insights while maintaining original structure.
 */
const STAPLE_ITEMS_P2P = new Set([
    // --- High-Priority Staples (From Hybrid Analytics) ---
    2,      // Cannonball
    560,    // Death rune
    565,    // Blood rune
    561,    // Nature rune
    9075,   // Astral rune
    12934,  // Zulrah's scales
    554,    // Fire rune

    // --- High-Profit, High-Value Targets ---
    11235,  // Dark bow
    4151,   // Abyssal whip
    6571,   // Uncut onyx
    11834,  // Armadyl crossbow
    11840,  // Dragon boots

    // --- High-Volume Staples (The "Bread and Butter") ---
    888,    // Adamant arrow
    892,    // Rune arrow
    2359,   // Mithril bar
    2361,   // Adamantite bar

    // --- Proven Herbs (From Analysis) ---
    2353,  // Grimy snapdragon
    225,    // Grimy kwuarm
    223,    // Grimy avantoe
    237,    // Grimy dwarf weed
    2351,   // Grimy toadflax
    221,    // Grimy irit leaf

    // --- High-Demand Consumables ---
    11936,  // Dark crab
    385,    // Shark
    391,    // Karambwan
    2434,   // Prayer potion(4)

    // --- Reliable Skilling & Misc ---
    2970,   // Mort myre fungus
    1777,   // Bow string
    9436,   // Grimy lantadyme
    453,    // Coal
    1515,   // Yew logs
]);

/**
 * F2P items list - maintained for F2P mode compatibility
 */
const STAPLE_ITEMS_F2P = new Set([
    // --- Ores & Bars ---
    438,    // Copper ore
    440,    // Iron ore
    444,    // Gold ore
    447,    // Mithril ore
    449,    // Adamantite ore
    451,    // Runite ore
    2351,   // Iron bar
    2353,   // Steel bar
    2359,   // Mithril bar
    2361,   // Adamantite bar
    2363,   // Runite bar

    // --- Ammunition ---
    882,    // Bronze arrow
    884,    // Iron arrow
    886,    // Adamant arrow
    892,    // Rune arrow

    // --- Core Elemental Runes ---
    554,    // Fire rune
    555,    // Water rune
    556,    // Air rune
    557,    // Earth rune
    558,    // Mind rune

    // --- Catalytic & High-Value Runes ---
    562,    // Chaos rune
    560,    // Death rune
    565,    // Blood rune

    // --- F2P Weapons & Armor ---
    1333,   // Rune scimitar
    1127,   // Rune platebody
    1163,   // Rune full helm
    1079,   // Rune platelegs
]);

// ================================================================================= //
// SECTION 10: HYBRID ANALYTICS UTILITY FUNCTIONS
// ================================================================================= //

/**
 * Get prices from timeseries snapshots with separate windows for buy and sell
 * Incorporates volatility detection for opportunity trading
 */
function getPricesFromSnapshots(timeseries, config = TRADING_CONFIG) {
    if (!timeseries) {
        return null;
    }

    const maxWindow = Math.max(config.BUY_SNAPSHOT_WINDOW, config.SELL_SNAPSHOT_WINDOW);
    if (timeseries.length < maxWindow) {
        return null;
    }

    // Get buy pricing window (shorter, more recent data for faster buy decisions)
    const buyPricingWindow = timeseries.slice(-config.BUY_SNAPSHOT_WINDOW);
    const buyLows = buyPricingWindow.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));

    // Get sell pricing window (longer window for more stable sell price analysis)
    const sellPricingWindow = timeseries.slice(-config.SELL_SNAPSHOT_WINDOW);
    const sellHighs = sellPricingWindow.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

    if (!buyLows.length || !sellHighs.length) {
        return null;
    }

    const floorPrice = Math.min(...buyLows);
    const ceilingPrice = Math.max(...sellHighs);

    // VOLATILITY DETECTION: Check for dramatic price drops/spikes for opportunity trading
    let opportunityBuyPrice = null;
    let opportunitySellPrice = null;

    if (timeseries.length >= config.SELL_SNAPSHOT_WINDOW + config.OPPORTUNITY_WINDOW) {
        // Get recent snapshots for current conditions
        const recentSnapshots = timeseries.slice(-config.OPPORTUNITY_WINDOW);
        const recentLows = recentSnapshots.map(p => p.avgLowPrice).filter(n => typeof n === 'number' && !isNaN(n));
        const recentHighs = recentSnapshots.map(p => p.avgHighPrice).filter(n => typeof n === 'number' && !isNaN(n));

        if (recentLows.length && recentHighs.length) {
            const currentLow = Math.min(...recentLows);
            const currentHigh = Math.max(...recentHighs);

            // Check for dramatic price drop (buy opportunity)
            const dropPercentage = (floorPrice - currentLow) / floorPrice;
            if (dropPercentage >= config.VOLATILITY_THRESHOLD) {
                opportunityBuyPrice = currentLow;
                if (config.ENABLE_DEBUG_LOGGING) {
                    console.log(`[VOLATILITY] Detected ${(dropPercentage * 100).toFixed(1)}% price drop! Using opportunity buy price: ${currentLow} vs average: ${floorPrice}`);
                }
            }

            // Check for dramatic price spike (sell opportunity)
            const spikePercentage = (currentHigh - ceilingPrice) / ceilingPrice;
            if (spikePercentage >= config.VOLATILITY_THRESHOLD) {
                opportunitySellPrice = currentHigh;
                if (config.ENABLE_DEBUG_LOGGING) {
                    console.log(`[VOLATILITY] Detected ${(spikePercentage * 100).toFixed(1)}% price spike! Using opportunity sell price: ${currentHigh} vs average: ${ceilingPrice}`);
                }
            }
        }
    }

    return {
        avgLow: floorPrice,
        avgHigh: ceilingPrice,
        opportunityBuyPrice,
        opportunitySellPrice
    };
}

/**
 * Get volume from timeseries data
 */
function getHourlyVolume(timeseries) {
    if (!timeseries || timeseries.length === 0) return null;
    const latestPoint = timeseries[timeseries.length - 1];
    if (latestPoint && typeof latestPoint.highPriceVolume === 'number' && typeof latestPoint.lowPriceVolume === 'number') {
        const fiveMinTotal = latestPoint.highPriceVolume + latestPoint.lowPriceVolume;
        return fiveMinTotal * 12; // Total items traded in 5 mins * 12 = hourly
    }
    return null;
}

/**
 * Check if a sell is profitable after tax
 */
function isProfitableSell(buyPrice, sellPrice, config = TRADING_CONFIG) {
    const netSell = Math.floor(sellPrice * (1 - config.TAX_RATE));
    const profit = netSell - buyPrice;
    return profit >= config.MIN_PROFIT_PER_ITEM;
}

/**
 * Calculate maximum buy quantity based on cash and limits
 */
function calcMaxBuyQuantity(cashPerSlot, buyPrice, limitRemaining) {
    const maxByCash = Math.floor(cashPerSlot / buyPrice);
    return Math.min(maxByCash, limitRemaining);
}

/**
 * Sort items by potential hourly profit (descending)
 */
function sortByPotentialProfitDesc(a, b) {
    return b.potentialHourlyProfit - a.potentialHourlyProfit;
}

/**
 * Validate if item is tradeable
 */
function isValidItem(item) {
    return item &&
           item.tradeable_on_ge !== false &&
           item.name &&
           item.limit > 0;
}

/**
 * Get active item list based on F2P mode setting
 */
function getActiveItemList(config = TRADING_CONFIG) {
    if (config.F2P_MODE) {
        return STAPLE_ITEMS_F2P;
    }
    return STAPLE_ITEMS_P2P;
}

// ================================================================================= //
// SECTION 11: MODULE EXPORTS
// ================================================================================= //

module.exports = {
    TRADING_CONFIG,
    STAPLE_ITEMS,
    TARGET_COMMODITIES,
    STAPLE_ITEMS_P2P,
    STAPLE_ITEMS_F2P,

    // Export utility functions for use in main trading logic
    getPricesFromSnapshots,
    getHourlyVolume,
    isProfitableSell,
    calcMaxBuyQuantity,
    sortByPotentialProfitDesc,
    isValidItem,
    getActiveItemList
};