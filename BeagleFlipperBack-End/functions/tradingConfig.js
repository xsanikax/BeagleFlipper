// functions/tradingConfig.js
// ENHANCED TRADING CONFIGURATION
// Centralized configuration for all trading strategies
const TRADING_CONFIG = {
    // --- ADD THIS LINE ---
    FIREBASE_WEB_API_KEY: "AIzaSyDspCsPLP5hpVnRCE-qYSdUbM8w-eMCJcY",

    // Tax and profit settings
    GE_TAX_RATE: 0.02,                    // 2% GE tax rate
    MIN_PROFIT_PER_ITEM: 1,                 // Minimum profit per item in GP
    MIN_MARGIN_PERCENTAGE: 0.01,         // 1% minimum margin

    // Volume and liquidity requirements
    MIN_VOLUME_THRESHOLD: 2500,          // Minimum 5-minute volume
    TIER1_MIN_VOLUME: 2500,              // Tier 1 volume requirement
    HIGH_VOLUME_THRESHOLD: 500000,       // High volume threshold for priority trading
    LOW_VOLUME_THRESHOLD: 1000,          // Low volume threshold

    // Price and quantity limits
    MAX_PRICE_PER_ITEM: 13000000,           // Maximum price per item
    MIN_CASH_PER_SLOT: 10000,            // Minimum cash required per slot
    MIN_ITEM_VALUE: 100,                 // Minimum item value to consider

    // Risk management
    MAX_BUY_LIMIT_USAGE: 0.9,            // Use 90% of buy limit max
    MAX_VOLUME_PERCENTAGE: 0.15,         // Buy max 15% of recent volume
    MAX_LOW_VOLUME_ACTIVE: 2,            // Maximum low volume active trades

    // AI/ML settings
    MIN_AI_CONFIDENCE_THRESHOLD: 0.60,   // 60% minimum AI confidence

    // Time settings
    BUY_LIMIT_RESET_HOURS: 4,            // Buy limit resets every 4 hours

    // --- Pricing window settings (in snapshots, each snapshot = 5 minutes) ---
    // NOTE: Use TRADING_HELPERS.getBuyWindowDescription() etc. to see the calculated time in your logs.
    BUY_SNAPSHOT_WINDOW: 3,              // The number of 5-minute snapshots for buy price analysis
    SELL_SNAPSHOT_WINDOW: 5,             // The number of 5-minute snapshots for sell price analysis

    // Volatility detection settings
    VOLATILITY_THRESHOLD: 0.25,          // 25% price change to trigger opportunity pricing
    OPPORTUNITY_WINDOW: 3,               // The number of 5-minute snapshots for current market conditions

    // Scoring weights
    PRIORITY_ITEM_MULTIPLIER: 2.0,
    VOLUME_SCORE_WEIGHT: 1.5,
    MARGIN_SCORE_WEIGHT: 2.0,
    STABILITY_BONUS_WEIGHT: 1.0,
    HIGH_VOLUME_SCORE_MULTIPLIER: 1.5,   // 50% bonus for high volume
    VERY_HIGH_VOLUME_SCORE_MULTIPLIER: 1.3, // Additional 30% bonus for very high volume
    HIGH_MARGIN_SCORE_MULTIPLIER: 1.2,   // 20% bonus for 10%+ margin
    MID_MARGIN_SCORE_MULTIPLIER: 1.1,    // 10% bonus for 5-10% margin
    EXPENSIVE_ITEM_PENALTY: 0.9,         // 10% penalty for items over MAX_PRICE_PER_ITEM

    // Batch processing settings
    PARALLEL_BATCH_SIZE: 25,             // Number of items to process in parallel

    // Debug settings
    ENABLE_DEBUG_LOGGING: false,
    LOG_REJECTED_ITEMS: false,
};

// Helper functions to calculate time windows dynamically
const TRADING_HELPERS = {
    // Get buy window time in minutes
    getBuyWindowMinutes: () => TRADING_CONFIG.BUY_SNAPSHOT_WINDOW * 5,

    // Get sell window time in minutes
    getSellWindowMinutes: () => TRADING_CONFIG.SELL_SNAPSHOT_WINDOW * 5,

    // Get opportunity window time in minutes
    getOpportunityWindowMinutes: () => TRADING_CONFIG.OPPORTUNITY_WINDOW * 5,

    // Get buy window description
    getBuyWindowDescription: () => {
        const minutes = TRADING_HELPERS.getBuyWindowMinutes();
        return minutes >= 60 ? `${minutes / 60} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
    },

    // Get sell window description
    getSellWindowDescription: () => {
        const minutes = TRADING_HELPERS.getSellWindowMinutes();
        return minutes >= 60 ? `${minutes / 60} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
    },

    // Get opportunity window description
    getOpportunityWindowDescription: () => {
        const minutes = TRADING_HELPERS.getOpportunityWindowMinutes();
        return minutes >= 60 ? `${minutes / 60} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════════
// 🎯 F2P ITEM COLLECTION - Curated Free-to-Play Trading Arsenal
// ═══════════════════════════════════════════════════════════════════════════════════
const F2P_ITEM_IDS = new Set([
    // 🔥 Elemental Runes (High Volume)
    554, 555, 556, 557, 558, 562,
    // 🏹 Ammunition (Consistent Demand)
    882, 884, 886, 888, 890, 892,
    // 🍖 Food & Potions (Consumables)
    379, 361, 339, 373, 113, 2428, 2430,
    // ⛏️ Ores & Bars (Skilling Materials)
    436, 438, 440, 442, 444, 447, 449, 451,
    2349, 2351, 2353, 2355, 2357, 2359, 2361, 2363,
    // 🌳 Logs (Skilling Materials)
    1511, 1521, 1519, 1517, 1515,
    // 🛡️ Armor & Weapons (Rune, Adamant, Green D'hide)
    1333, 1347, 1127, 1163, 1185, 1213,
    1123, 1161, 1181, 1209,
    1119, 1157, 1179, 1207,
    1079, 1093, 1128, 1165,
    // 💎 Jewelry (Amulets & Uncuts)
    1692, 1694, 1696, 1698, 1700, 1702, 1704,
    1617, 1619, 1621, 1623,
    // 🐄 Hides
    1747, 1749, 1751, 1753,
]);

// 🌟 F2P_STAPLE_ITEMS - Priority Scanning for F2P
const F2P_STAPLE_ITEMS = new Set([
    554,     // Fire rune
    556,     // Air rune
    562,     // Chaos rune
    892,     // Rune arrow
    379,     // Lobster
    440,     // Iron ore
    453,     // Coal
    1333,    // Rune scimitar
    1704,    // Amulet of power
]);


// ═══════════════════════════════════════════════════════════════════════════════════
// 🎯 TARGET COMMODITIES - Premium Trading Opportunities (Members Items)
// ═══════════════════════════════════════════════════════════════════════════════════
const TARGET_COMMODITIES = {
    // 🔮 Magical Runes - High Volume Staples
    558: { name: 'Mind rune',           limit: 25000, priority: 8, category: 'runes' },
    555: { name: 'Water rune',          limit: 25000, priority: 8, category: 'runes' },
    554: { name: 'Fire rune',           limit: 25000, priority: 8, category: 'runes' },
    556: { name: 'Air rune',            limit: 25000, priority: 8, category: 'runes' },
    557: { name: 'Earth rune',          limit: 25000, priority: 8, category: 'runes' },
    559: { name: 'Body rune',           limit: 25000, priority: 8, category: 'runes' },
    560: { name: 'Death rune',          limit: 10000, priority: 9, category: 'runes' },
    561: { name: 'Nature rune',         limit: 10000, priority: 9, category: 'runes' },
    562: { name: 'Chaos rune',          limit: 10000, priority: 9, category: 'runes' },
    563: { name: 'Law rune',            limit: 10000, priority: 9, category: 'runes' },
    564: { name: 'Cosmic rune',         limit: 10000, priority: 9, category: 'runes' },
    565: { name: 'Blood rune',          limit: 10000, priority: 9, category: 'runes' },
    9075: { name: 'Astral rune',        limit: 10000, priority: 9, category: 'runes' },
    20849: { name: 'Wrath rune',        limit: 10000, priority: 9, category: 'runes' },

    // 🔥 Processed Materials - Consistent Demand
    2355: { name: 'Mithril bar',        limit: 5000,  priority: 6, category: 'materials' },
    2359: { name: 'Adamantite bar',     limit: 3000,  priority: 7, category: 'materials' },
    2361: { name: 'Runite bar',         limit: 1000,  priority: 8, category: 'materials' },

    // ⛏️ Raw Ores - Foundation Materials
    440: { name: 'Iron ore',            limit: 25000, priority: 5, category: 'materials' },
    453: { name: 'Coal',                limit: 25000, priority: 5, category: 'materials' },

    // 🌳 Woodcutting Logs - Skilling Essentials
    1511: { name: 'Logs',               limit: 25000, priority: 4, category: 'logs' },
    1521: { name: 'Oak logs',           limit: 25000, priority: 4, category: 'logs' },
    1519: { name: 'Willow logs',        limit: 25000, priority: 5, category: 'logs' },
    1517: { name: 'Maple logs',         limit: 25000, priority: 5, category: 'logs' },
    1515: { name: 'Yew logs',           limit: 25000, priority: 6, category: 'logs' },

    // 💎 Precious Gems - Crafting Luxury
    1623: { name: 'Uncut sapphire',     limit: 5000,  priority: 5, category: 'gems' },
    1621: { name: 'Uncut emerald',      limit: 5000,  priority: 5, category: 'gems' },
    1619: { name: 'Uncut ruby',         limit: 5000,  priority: 6, category: 'gems' },
    1617: { name: 'Uncut diamond',      limit: 5000,  priority: 7, category: 'gems' },

    // 🍖 Premium Food - Combat Sustenance
    385: { name: 'Shark',               limit: 10000, priority: 6, category: 'food' },
    391: { name: 'Karambwan',           limit: 10000, priority: 6, category: 'food' },
    7946: { name: 'Monkfish',           limit: 15000, priority: 5, category: 'food' },

    // 🌿 Herblore Herbs - Potion Components
    259: { name: 'Grimy ranarr weed',   limit: 3000,  priority: 7, category: 'herbs' },
    261: { name: 'Grimy avantoe',       limit: 5000,  priority: 6, category: 'herbs' },
    263: { name: 'Grimy kwuarm',        limit: 3000,  priority: 7, category: 'herbs' },
    265: { name: 'Grimy snapdragon',    limit: 3000,  priority: 8, category: 'herbs' },

    // 🏹 Ammunition - Ranged Combat
    806: { name: 'Adamant dart',        limit: 7000,  priority: 7, category: 'ammunition' },
    810: { name: 'Rune dart',           limit: 7000,  priority: 8, category: 'ammunition' },
    892: { name: 'Rune arrow',          limit: 11000, priority: 7, category: 'ammunition' },
    888: { name: 'Adamant arrow',       limit: 13000, priority: 7, category: 'ammunition' },

    // 🐉 PvM Supplies - Boss Combat
    12934: { name: "Zulrah's scales",   limit: 20000, priority: 8, category: 'pvm_supplies' },
    21820: { name: 'Revenant ether',    limit: 10000, priority: 9, category: 'pvm_supplies' },

    // 🔧 Crafting Supplies - Skilling Materials
    314: { name: 'Feather',             limit: 25000, priority: 7, category: 'supplies' },
    1777: { name: 'Bow string',         limit: 25000, priority: 6, category: 'supplies' },

    // 🧪 Herblore Secondaries - Potion Ingredients
    231: { name: 'Snape grass',         limit: 13000, priority: 5, category: 'herbs' },
    199: { name: 'Desert goat horn',    limit: 5000,  priority: 4, category: 'materials' },
    201: { name: 'Unicorn horn dust',   limit: 1500,  priority: 6, category: 'materials' },
    203: { name: 'Eye of newt',         limit: 10000, priority: 5, category: 'materials' },
    205: { name: 'Red spiders eggs',    limit: 5000,  priority: 6, category: 'materials' },
    207: { name: 'Limpwurt root',       limit: 3000,  priority: 7, category: 'materials' },
    209: { name: 'White berries',       limit: 1000,  priority: 8, category: 'materials' },
    211: { name: 'Jangerberries',       limit: 5000,  priority: 6, category: 'materials' },
    213: { name: 'Potato cactus',       limit: 2000,  priority: 7, category: 'materials' },
    215: { name: 'Mort myre fungus',    limit: 2000,  priority: 8, category: 'materials' },
    217: { name: 'Crushed birds nest',  limit: 1500,  priority: 8, category: 'materials' },
    219: { name: 'Ground mud rune',     limit: 500,   priority: 9, category: 'materials' },

    // 💥 Top Tier Staples - Maximum Priority
    2: { name: 'Cannonball',            limit: 25000, priority: 10, category: 'staples' },
};

// ⚡ STABLE_ITEMS - Reliable Trading Candidates
const STABLE_ITEMS = new Set([
    // Runes - Consistent demand across all content
    554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 9075, 20849,
    // Ammunition - Steady PvM/PvP usage
    2,
    // Basic materials - Foundation of economy
    440, 453, 1511, 1521, 1519, 1517, 1515, 1777,
]);

// 🌟 STAPLE_ITEMS - Priority Scanning Items (Members)
const STAPLE_ITEMS = new Set([
    2,       // Cannonball      - Combat essential
    560,     // Death rune      - High-level magic
    565,     // Blood rune      - Barrage spells
    561,     // Nature rune     - Alchemy & teleports
    9075,    // Astral rune     - Lunar magic
    12934,   // Zulrah's scales - Blowpipe ammo
    554,     // Fire rune       - Strike spells
    21820,   // Revenant ether  - PvP supplies
]);

module.exports = {
    TRADING_CONFIG,
    TRADING_HELPERS,
    TARGET_COMMODITIES,
    STABLE_ITEMS,
    F2P_ITEM_IDS,
    STAPLE_ITEMS,
    F2P_STAPLE_ITEMS, // Export the new F2P staples list
};