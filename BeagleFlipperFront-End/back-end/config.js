// functions/config.js
// UPDATED: Added TARGET_COMMODITIES and PROFIT_TARGETS for the new logic.

const GE_CONSTANTS = {
    TAX_RATE: 0.02,
    MAX_PRICE_FOR_GE_TAX: 250000000,
    GE_TAX_CAP: 5000000,
    GE_TAX_EXEMPT_ITEMS: new Set([13190, 1755, 5325, 1785, 2347, 1733, 233, 5341, 8794, 5329, 5343, 1735, 952, 5331]),
    GE_SLOTS: 8
};

const STRATEGY_CONFIG_5M = {
    MIN_PROFIT_GP: 2,                 // Using the more flexible minimum profit from the old system.
    MIN_ROI_PERCENT: 0.003,           // Keep the lower ROI for higher velocity.
    MIN_5MIN_VOLUME: 2500,            // Using the more accurate 5-minute volume check.
    MAX_ITEM_PRICE: 20000000,
    MIN_CASH_PER_SLOT: 25000,
};

const STRATEGY_CONFIG_8H = {
    MIN_VOLUME_PER_HOUR: 100,
    MIN_CASH_PER_SLOT: 50000,
    AI_CONFIDENCE_THRESHOLD: 0.65,
    MIN_PROFIT_GP: 150,
    MIN_PROFIT_PERCENT: 0.005,
    TIMESERIES_ANALYZE_HOURS: 8,
    MAX_PRICE_UPDATE_AGE_HOURS: 4
};

// List of items the new strategy will focus on (from your old AI system)
const TARGET_COMMODITIES = new Set([
    2, 231, 199, 201, 203, 205, 207, 209, 211, 213, 215, 217, 219, 2485,
    3049, 3051, 11230, 6685, 2434, 169, 3040, 383, 227, 453, 235, 1777,
    13439, 11934, 560, 565, 555, 554, 557, 556, 9075, 8839, 8840, 2353,
    2363, 2361, 2359, 2351, 2349, 11212, 11235, 4585, 12934, 13357,
    13441, 11936, 19912, 19948, 19960, 19972, 19984, 20002, 20014, 20026,
    20038, 20050, 20062, 20074, 20086, 20098, 20849, 20904, 21880, 22296,
    22826, 23583, 23595, 23607, 23619, 23631, 24538, 26233, 26245, 26257,
    26269, 26281, 26293, 26305, 27158, 562, 563, 561, 811, 221, 223,
    225, 237, 2481, 5316, 13437
]);

// Specific profit targets for certain items (from your old AI system)
const PROFIT_TARGETS = new Map([
    [561, 3], [2, 6], [231, 4], [199, 5], [201, 5], [203, 5], [205, 7],
    [207, 6], [209, 8], [211, 6], [213, 7], [215, 8], [217, 8], [219, 9],
    [2485, 50], [3049, 21], [3051, 16], [11230, 133], [6685, 86], [2434, 13],
    [169, 7], [3040, 48], [383, 10], [227, 4], [453, 2], [235, 3], [1777, 6],
    [13439, 5], [11934, 5], [560, 2], [565, 2], [555, 1], [554, 1], [557, 1],
    [556, 1], [9075, 2], [8839, 30], [8840, 20], [2353, 5], [2363, 15],
    [2361, 10], [2359, 8], [2351, 5], [2349, 4], [11212, 100], [11235, 150],
    [4585, 30], [12934, 500], [13357, 5], [13441, 10], [11936, 10]
]);

const GLOBAL_SETTINGS = {
    USER_AGENT: 'BeagleFlipper Client - Contact @DaBeagleBoss on Discord',
    WIKI_API_BASE_URL: 'https://prices.runescape.wiki/api/v1/osrs'
};

module.exports = {
    GE_CONSTANTS,
    STRATEGY_CONFIG_5M,
    STRATEGY_CONFIG_8H,
    GLOBAL_SETTINGS,
    TARGET_COMMODITIES,
    PROFIT_TARGETS
};
