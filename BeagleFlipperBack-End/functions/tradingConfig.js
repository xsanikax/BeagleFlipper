// tradingConfig.js
// ENHANCED TRADING CONFIGURATION
// Centralized configuration for all trading strategies

const TRADING_CONFIG = {
    // Tax and profit settings
    GE_TAX_RATE: 0.01,
    MIN_PROFIT_PER_ITEM: 50,
    MIN_MARGIN_PERCENTAGE: 0.005,
    MAX_PRICE_PER_ITEM: 50000000,
    GE_TAX_CAP: 5000000,
    MAX_PRICE_FOR_GE_TAX: 250000000,
    
    // Volume and liquidity requirements
    MIN_VOLUME_THRESHOLD: 100, // Lowered for more opportunities
    TIER1_MIN_VOLUME: 2500,
    HIGH_VOLUME_THRESHOLD: 5000,
    MIN_VOLUME_PER_HOUR_8H: 20,
    
    // Price and quantity limits
    MIN_CASH_PER_SLOT: 10000,
    MIN_CASH_PER_SLOT_8H: 10000,
    
    // Risk management
    MAX_BUY_LIMIT_USAGE: 0.9,
    MAX_VOLUME_PERCENTAGE: 0.15,
    
    // AI/ML settings
    MIN_AI_CONFIDENCE_THRESHOLD: 0.55, // Lowered slightly
    AI_CONFIDENCE_THRESHOLD_8H: 0.60,
    
    // Time settings
    BUY_LIMIT_RESET_HOURS: 4,
    MAX_PRICE_UPDATE_AGE_HOURS_8H: 4,
    
    // Scoring weights
    PRIORITY_ITEM_MULTIPLIER: 2.0,
    VOLUME_SCORE_WEIGHT: 1.5,
    MARGIN_SCORE_WEIGHT: 2.0,
    STABILITY_BONUS_WEIGHT: 1.0,
    
    // Debug settings
    ENABLE_DEBUG_LOGGING: true,
    LOG_REJECTED_ITEMS: true,

    // Quant Algorithm Parameters
    QUANT_MIN_PROFIT_PER_UNIT_GP: 0,
    QUANT_MAX_HOLD_TIME_SECONDS: 3600,
    QUANT_MIN_VOLUME_REQUIRED: 100,
    QUANT_TARGET_BUY_PRICE_PERCENT_BELOW_AVG: 0.005,
    QUANT_TARGET_SELL_PRICE_PERCENT_ABOVE_AVG: 0.005,
    QUANT_BLACKLISTED_ITEM_IDS: [],
    
    // Suggestion Polling and Caching
    SUGGESTION_POLL_INTERVAL_SECONDS: 10,

    // Flip Tracking and Display Limits
    MAX_TRANSACTION_HISTORY_PER_FLIP: 50,
    FLIP_LOAD_LIMIT: 500,
};

// TARGET COMMODITIES - Items to focus on for trading
const TARGET_COMMODITIES = {
    // Runes
    565: { name: 'Blood rune', limit: 30000, priority: 9, category: 'runes' },
    9075: { name: 'Astral rune', limit: 10000, priority: 9, category: 'runes' },
    20849: { name: 'Wrath rune', limit: 25000, priority: 9, category: 'runes' },
    560: { name: 'Death rune', limit: 25000, priority: 9, category: 'runes' },
    
    // Key PvM Supplies from your history
    12934: { name: "Zulrah's scales", limit: 30000, priority: 8, category: 'pvm_supplies' },
    21905: { name: 'Revenant ether', limit: 100000, priority: 10, category: 'pvm_supplies' }, // As requested
    
    // Other top performers from history
    2: { name: 'Cannonball', limit: 7000, priority: 7, category: 'ammunition' },
    2353: { name: 'Grimy snapdragon', limit: 13000, priority: 8, category: 'herbs' },
    2349: { name: 'Grimy ranarr weed', limit: 13000, priority: 8, category: 'herbs' },
    6685: { name: 'Saradomin brew(4)', limit: 2000, priority: 7, category: 'potions' },
    20050: { name: 'Bandos chestplate', limit: 10, priority: 8, category: 'equipment' },
    20062: { name: 'Bandos tassets', limit: 10, priority: 8, category: 'equipment' },
    11235: { name: 'Dark bow', limit: 100, priority: 7, category: 'equipment' }
};

const STABLE_ITEMS = new Set([
    554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 9075, 20849,
    2,
    440, 453, 1511, 1521, 1519, 1517, 1515, 1777,
]);

module.exports = {
    TRADING_CONFIG,
    TARGET_COMMODITIES,
    STABLE_ITEMS,
};