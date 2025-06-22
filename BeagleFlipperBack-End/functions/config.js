// tradingConfig.js
// ENHANCED TRADING CONFIGURATION
// Centralized configuration for all trading strategies

const TRADING_CONFIG = {
    // Tax and profit settings (from your provided file and tradingLogic.js)
    GE_TAX_RATE: 0.02, // 2% GE tax rate
    MIN_PROFIT_PER_ITEM: 0, // Adjusted to 0 for debugging purposes (originally 1)
    MIN_MARGIN_PERCENTAGE: 0.01, // 1% minimum margin (from your file)
    MAX_PRICE_PER_ITEM: 50000, // Maximum price per item (from your file)
    GE_TAX_CAP: 5000000,           // From tradingLogic.js
    MAX_PRICE_FOR_GE_TAX: 250000000, // From tradingLogic.js
    
    // Volume and liquidity requirements (from your provided file)
    MIN_VOLUME_THRESHOLD: 2500, // Minimum 5-minute volume (from your file)
    TIER1_MIN_VOLUME: 2500, // Tier 1 volume requirement (from hybridAnalytics.js and your file)
    HIGH_VOLUME_THRESHOLD: 5000, // (from your file)
    MIN_VOLUME_PER_HOUR_8H: 50, // From eightHourStrategy.js CONFIG_8H
    
    // Price and quantity limits (from your provided file)
    MIN_CASH_PER_SLOT: 1000, // Adjusted to 1000 for debugging purposes (originally 10000)
    MIN_CASH_PER_SLOT_8H: 1000, // From eightHourStrategy.js CONFIG_8H
    
    // Risk management (from your provided file)
    MAX_BUY_LIMIT_USAGE: 0.9, // Use 90% of buy limit max (from your file)
    MAX_VOLUME_PERCENTAGE: 0.15, // Buy max 15% of recent volume (from your file)
    
    // AI/ML settings (from your provided file)
    MIN_AI_CONFIDENCE_THRESHOLD: 0.60, // 60% minimum AI confidence (from hybridAnalytics.js and your file)
    AI_CONFIDENCE_THRESHOLD_8H: 0.65, // From eightHourStrategy.js CONFIG_8H
    
    // Time settings (from your provided file)
    BUY_LIMIT_RESET_HOURS: 4, // Buy limit resets every 4 hours (from your file)
    MAX_PRICE_UPDATE_AGE_HOURS_8H: 2, // From eightHourStrategy.js CONFIG_8H
    
    // Scoring weights (from your provided file)
    PRIORITY_ITEM_MULTIPLIER: 2.0,
    VOLUME_SCORE_WEIGHT: 1.5,
    MARGIN_SCORE_WEIGHT: 2.0,
    STABILITY_BONUS_WEIGHT: 1.0,
    
    // Debug settings (UPDATED FOR DEBUGGING)
    ENABLE_DEBUG_LOGGING: true, // Set to true to see debug logs
    LOG_REJECTED_ITEMS: true,   // Set to true to log reasons for item rejection

    // NEW: Quant Algorithm Parameters (adjusted for even more opportunities for debugging)
    QUANT_MIN_PROFIT_PER_UNIT_GP: 0,          // Reduced to 0 to see if ANY profit is found
    QUANT_MAX_HOLD_TIME_SECONDS: 3600,       
    QUANT_MIN_VOLUME_REQUIRED: 100,         // Reduced to 100 for broader reach
    QUANT_TARGET_BUY_PRICE_PERCENT_BELOW_AVG: 0.005, 
    QUANT_TARGET_SELL_PRICE_PERCENT_ABOVE_AVG: 0.005, 
    QUANT_BLACKLISTED_ITEM_IDS: [],         
    
    // NEW: Suggestion Polling and Caching
    SUGGESTION_POLL_INTERVAL_SECONDS: 60, 

    // NEW: Flip Tracking and Display Limits
    MAX_TRANSACTION_HISTORY_PER_FLIP: 100, 
    FLIP_LOAD_LIMIT: 50,                     
};

// TARGET COMMODITIES - Items to focus on for trading (Existing from your file)
const TARGET_COMMODITIES = {
    // Runes - High volume, stable
    558: { name: 'Mind rune', limit: 25000, priority: 8, category: 'runes' },
    555: { name: 'Water rune', limit: 25000, priority: 8, category: 'runes' },
    554: { name: 'Fire rune', limit: 25000, priority: 8, category: 'runes' },
    556: { name: 'Air rune', limit: 25000, priority: 8, category: 'runes' },
    557: { name: 'Earth rune', limit: 25000, priority: 8, category: 'runes' },
    559: { name: 'Body rune', limit: 25000, priority: 8, category: 'runes' },
    560: { name: 'Death rune', limit: 10000, priority: 9, category: 'runes' },
    561: { name: 'Nature rune', limit: 10000, priority: 9, category: 'runes' },
    562: { name: 'Chaos rune', limit: 10000, priority: 9, category: 'runes' },
    563: { name: 'Law rune', limit: 10000, priority: 9, category: 'runes' },
    564: { name: 'Cosmic rune', limit: 10000, priority: 9, category: 'runes' },
    565: { name: 'Blood rune', limit: 10000, priority: 9, category: 'runes' }, // Key item from your CSV
    9075: { name: 'Astral rune', limit: 10000, priority: 9, category: 'runes' },
    20849: { name: 'Wrath rune', limit: 10000, priority: 9, category: 'runes' },

    // Bars - Consistent demand
    2355: { name: 'Mithril bar', limit: 5000, priority: 6, category: 'materials' }, // Key item from your CSV
    2359: { name: 'Adamantite bar', limit: 3000, priority: 7, category: 'materials' },
    2361: { name: 'Runite bar', limit: 1000, priority: 8, category: 'materials' },

    // Ores
    440: { name: 'Iron ore', limit: 25000, priority: 5, category: 'materials' },
    453: { name: 'Coal', limit: 25000, priority: 5, category: 'materials' },

    // Logs
    1511: { name: 'Logs', limit: 25000, priority: 4, category: 'logs' },
    1521: { name: 'Oak logs', limit: 25000, priority: 4, category: 'logs' },
    1519: { name: 'Willow logs', limit: 25000, priority: 5, category: 'logs' }, // Key item from your CSV
    1517: { name: 'Maple logs', limit: 25000, priority: 5, category: 'logs' },
    1515: { name: 'Yew logs', limit: 25000, priority: 6, category: 'logs' },

    // Gems
    1623: { name: 'Uncut sapphire', limit: 5000, priority: 5, category: 'gems' },
    1621: { name: 'Uncut emerald', limit: 5000, priority: 5, category: 'gems' },
    1619: { name: 'Uncut ruby', limit: 5000, priority: 6, category: 'gems' },
    1617: { name: 'Uncut diamond', limit: 5000, priority: 7, category: 'gems' },

    // Food
    385: { name: 'Shark', limit: 10000, priority: 6, category: 'food' },
    391: { name: 'Karambwan', limit: 10000, priority: 6, category: 'food' },
    7946: { name: 'Monkfish', limit: 15000, priority: 5, category: 'food' },

    // Herbs
    259: { name: 'Grimy ranarr weed', limit: 3000, priority: 7, category: 'herbs' },
    261: { name: 'Grimy avantoe', limit: 5000, priority: 6, category: 'herbs' },
    263: { name: 'Grimy kwuarm', limit: 3000, priority: 7, category: 'herbs' },
    265: { name: 'Grimy snapdragon', limit: 3000, priority: 8, category: 'herbs' },

    // Ammunition
    806: { name: 'Adamant dart', limit: 7000, priority: 7, category: 'ammunition' },
    810: { name: 'Rune dart', limit: 7000, priority: 8, category: 'ammunition' },
    892: { name: 'Rune arrow', limit: 11000, priority: 7, category: 'ammunition' },
    888: { name: 'Adamant arrow', limit: 13000, priority: 7, category: 'ammunition' },

    // PvM Supplies
    12934: { name: "Zulrah's scales", limit: 20000, priority: 8, category: 'pvm_supplies' },

    // Basic supplies
    314: { name: 'Feather', limit: 25000, priority: 7, category: 'supplies' },
    1777: { name: 'Bow string', limit: 25000, priority: 6, category: 'supplies' },

    // Original items from your TARGET_COMMODITIES set (retained)
    231: { name: 'Snape grass', limit: 13000, priority: 5, category: 'herbs' },
    199: { name: 'Desert goat horn', limit: 5000, priority: 4, category: 'materials' },
    201: { name: 'Unicorn horn dust', limit: 1500, priority: 6, category: 'materials' },
    203: { name: 'Eye of newt', limit: 10000, priority: 5, category: 'materials' },
    205: { name: 'Red spiders eggs', limit: 5000, priority: 6, category: 'materials' },
    207: { name: 'Limpwurt root', limit: 3000, priority: 7, category: 'materials' },
    209: { name: 'White berries', limit: 1000, priority: 8, category: 'materials' },
    211: { name: 'Jangerberries', limit: 5000, priority: 6, category: 'materials' },
    213: { name: 'Potato cactus', limit: 2000, priority: 7, category: 'materials' },
    215: { name: 'Mort myre fungus', limit: 2000, priority: 8, category: 'materials' },
    217: { name: 'Crushed birds nest', limit: 1500, priority: 8, category: 'materials' },
    219: { name: 'Ground mud rune', limit: 500, priority: 9, category: 'materials' },
};

// STABLE_ITEMS: Items identified as generally stable. Can be an empty Set if not used. (Existing from your file)
const STABLE_ITEMS = new Set([
    // Example: Runes are generally stable
    554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 9075, 20849,
    // Example: Cannonballs can be stable
    2,
    // Example: Some common materials
    440, 453, 1511, 1521, 1519, 1517, 1515, 1777,
]);

module.exports = {
    TRADING_CONFIG,
    TARGET_COMMODITIES,
    STABLE_ITEMS,
};
