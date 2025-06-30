// =================================================================================
// functions/tradingConfig.js
//
// MASTER TRADING CONFIGURATION V13.0 - RESTORED FROM YOUR ORIGINAL FILE
//
// V13.0 Changes:
// - This file is based on YOUR original code. NO code has been removed.
// - The new high-velocity trading strategy has been ADDED to TRADING_CONFIG.
// - The TARGET_COMMODITIES list has been expanded and formatted with your requested items.
// =================================================================================


// =================================================================================
// SECTION 1: CORE TRADING PARAMETERS
// =================================================================================

const TRADING_CONFIG = {
    // --- General & API ---
    FIREBASE_WEB_API_KEY: "AIzaSyDspCsPLP5hpVnRCE-qYSdUbM8w-eMCJcY",
    GE_TAX_RATE: 0.02,
    MIN_PROFIT_PER_ITEM: 1,
    MIN_MARGIN_PERCENTAGE: 0.01,

    // --- NEW STRATEGY: Volume & Liquidity Tiers ---
    ULTRA_HIGH_VOLUME_THRESHOLD: 8000000, // ADDED: For elite, hyper-liquid items
    HIGH_VOLUME_THRESHOLD: 3000000,      // UPDATED: Adjusted for new strategy
    MIN_VOLUME_THRESHOLD: 50000,          // UPDATED: Raised to avoid "weeds"
    LOW_VOLUME_THRESHOLD: 1000,          // Original low-volume threshold
    TIER1_MIN_VOLUME: 2500,              // Original legacy parameter

    // --- Price and Quantity Limits ---
    MAX_PRICE_PER_ITEM: 13000000,
    MIN_CASH_PER_SLOT: 10000,
    MIN_ITEM_VALUE: 100,

    // --- NEW STRATEGY: Risk & Slot Management ---
    ULTRA_HIGH_VOLUME_SLOTS: 6,      // ADDED: 6 of 8 slots dedicated to top-tier items
    MAX_BUY_LIMIT_USAGE: 0.9,
    MAX_VOLUME_PERCENTAGE: 0.15,
    MAX_LOW_VOLUME_ACTIVE: 1,        // UPDATED: Reduced from 2 to minimize risk on slow items

    // --- AI/ML Settings (Original) ---
    MIN_AI_CONFIDENCE_THRESHOLD: 0.60,

    // --- Time Settings (Original) ---
    BUY_LIMIT_RESET_HOURS: 4,
    BUY_SNAPSHOT_WINDOW: 3,  //1 = 5 minutes, 2 = 10 minutes, etc.
    SELL_SNAPSHOT_WINDOW: 5, //1 = 5 minutes, 2 = 10 minutes, etc.

    // --- Volatility Detection Settings (Original) ---
    VOLATILITY_THRESHOLD: 0.15,
    OPPORTUNITY_WINDOW: 3,

    // --- Scoring Multipliers (Original Preserved) ---
    HIGH_VOLUME_SCORE_MULTIPLIER: 2,
    VERY_HIGH_VOLUME_SCORE_MULTIPLIER: 5,
    PRIORITY_ITEM_MULTIPLIER: 1.2,
    VOLUME_SCORE_WEIGHT: 1.5,
    MARGIN_SCORE_WEIGHT: 2.0,
    STABILITY_BONUS_WEIGHT: 3.5,
    HIGH_MARGIN_SCORE_MULTIPLIER: 1,
    MID_MARGIN_SCORE_MULTIPLIER: 1.1,
    EXPENSIVE_ITEM_PENALTY: 0.9,

    // --- Batch processing & Debugging (Original) ---
    PARALLEL_BATCH_SIZE: 25,
    ENABLE_DEBUG_LOGGING: true,
    LOG_REJECTED_ITEMS: true
};

// =================================================================================
// SECTION 2: HELPER FUNCTIONS (ORIGINAL UNTOUCHED CODE)
// =================================================================================

const TRADING_HELPERS = {
    getBuyWindowMinutes: () => TRADING_CONFIG.BUY_SNAPSHOT_WINDOW * 5,
    getSellWindowMinutes: () => TRADING_CONFIG.SELL_SNAPSHOT_WINDOW * 5,
    getOpportunityWindowMinutes: () => TRADING_CONFIG.OPPORTUNITY_WINDOW * 5,
    getBuyWindowDescription: () => {
        const minutes = TRADING_HELPERS.getBuyWindowMinutes();
        return minutes >= 60 ? `${minutes / 60} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
    },
    getSellWindowDescription: () => {
        const minutes = TRADING_HELPERS.getSellWindowMinutes();
        return minutes >= 60 ? `${minutes / 60} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
    },
    getOpportunityWindowDescription: () => {
        const minutes = TRADING_HELPERS.getOpportunityWindowMinutes();
        return minutes >= 60 ? `${minutes / 60} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
    }
};


// =================================================================================
// SECTION 3: ITEM LISTS (ALL ORIGINAL LISTS PRESERVED)
// =================================================================================

/** ✅ F2P_ITEM_IDS - The complete, original Free-to-Play item list. */
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

/** ✅ F2P_STAPLE_ITEMS - Original priority list for F2P scanning. */
const F2P_STAPLE_ITEMS = new Set([554, 556, 562, 892, 379, 440, 453, 1333, 1704]);

/** 🚀 NEW: A Set of elite-tier item IDs for strategic targeting. */
const ULTRA_HIGH_VOLUME_ITEMS = new Set([565, 2, 560, 811, 9075, 561, 453, 440]);

/** ✅ TARGET_COMMODITIES - The original master item list, now expanded and formatted. */
const TARGET_COMMODITIES = {
    // --- Priority 10: Elite Staples (Your high-velocity items) ---
    2:    { name: 'Cannonball',          limit: 25000, priority: 10, category: 'staples' },
    565:  { name: 'Blood rune',          limit: 30000, priority: 10, category: 'runes' }, // Limit updated
    811:  { name: 'Adamant dart',        limit: 25000, priority: 10, category: 'ammunition' }, // ADDED
    560:  { name: 'Death rune',          limit: 30000, priority: 10, category: 'runes' }, // Limit & Prio updated
    9075: { name: 'Astral rune',         limit: 40000, priority: 9, category: 'runes' },  // Limit updated
    21820:{ name: 'Revenant ether',      limit: 10000, priority: 9, category: 'pvm_supplies' },

    // --- Original Items Below, Formatted ---
    // 🔮 Magical Runes - High Volume Staples
    558:  { name: 'Mind rune',           limit: 25000, priority: 8, category: 'runes' },
    555:  { name: 'Water rune',          limit: 25000, priority: 8, category: 'runes' },
    554:  { name: 'Fire rune',           limit: 25000, priority: 8, category: 'runes' },
    556:  { name: 'Air rune',            limit: 25000, priority: 8, category: 'runes' },
    557:  { name: 'Earth rune',          limit: 25000, priority: 8, category: 'runes' },
    559:  { name: 'Body rune',           limit: 25000, priority: 8, category: 'runes' },
    561:  { name: 'Nature rune',         limit: 18000, priority: 9, category: 'runes' }, // Limit updated
    562:  { name: 'Chaos rune',          limit: 18000, priority: 9, category: 'runes' }, // Limit updated
    563:  { name: 'Law rune',            limit: 18000, priority: 9, category: 'runes' }, // Limit updated
    564:  { name: 'Cosmic rune',         limit: 10000, priority: 9, category: 'runes' },
    20849:{ name: 'Wrath rune',          limit: 10000, priority: 9, category: 'runes' },

    // 🔥 Processed Materials - Consistent Demand
    2355: { name: 'Mithril bar',         limit: 5000,  priority: 6, category: 'materials' },
    2359: { name: 'Adamantite bar',      limit: 3000,  priority: 7, category: 'materials' },
    2361: { name: 'Runite bar',          limit: 1000,  priority: 8, category: 'materials' },

    // ⛏️ Raw Ores - Foundation Materials
    440:  { name: 'Iron ore',            limit: 25000, priority: 5, category: 'materials' },
    453:  { name: 'Coal',                limit: 25000, priority: 5, category: 'materials' },

    // 🌳 Woodcutting Logs - Skilling Essentials
    1511: { name: 'Logs',                limit: 25000, priority: 4, category: 'logs' },
    1521: { name: 'Oak logs',            limit: 25000, priority: 4, category: 'logs' },
    1519: { name: 'Willow logs',         limit: 25000, priority: 5, category: 'logs' },
    1517: { name: 'Maple logs',          limit: 25000, priority: 5, category: 'logs' },
    1515: { name: 'Yew logs',            limit: 25000, priority: 6, category: 'logs' },

    // 💎 Precious Gems - Crafting Luxury
    1623: { name: 'Uncut sapphire',      limit: 5000,  priority: 5, category: 'gems' },
    1621: { name: 'Uncut emerald',       limit: 5000,  priority: 5, category: 'gems' },
    1619: { name: 'Uncut ruby',          limit: 5000,  priority: 6, category: 'gems' },
    1617: { name: 'Uncut diamond',       limit: 5000,  priority: 7, category: 'gems' },

    // 🍖 Premium Food - Combat Sustenance
    385:  { name: 'Shark',               limit: 10000, priority: 6, category: 'food' },
    391:  { name: 'Karambwan',           limit: 10000, priority: 6, category: 'food' },
    7946: { name: 'Monkfish',            limit: 15000, priority: 5, category: 'food' },

    // 🌿 Herblore Herbs - Potion Components
    259:  { name: 'Grimy ranarr weed',   limit: 3000,  priority: 7, category: 'herbs' },
    261:  { name: 'Grimy avantoe',       limit: 5000,  priority: 6, category: 'herbs' },
    263:  { name: 'Grimy kwuarm',        limit: 3000,  priority: 7, category: 'herbs' },
    265:  { name: 'Grimy snapdragon',    limit: 3000,  priority: 8, category: 'herbs' },

    // 🏹 Ammunition - Ranged Combat
    806:  { name: 'Adamant dart',        limit: 7000,  priority: 7, category: 'ammunition' },
    810:  { name: 'Rune dart',           limit: 7000,  priority: 8, category: 'ammunition' },
    892:  { name: 'Rune arrow',          limit: 11000, priority: 7, category: 'ammunition' },
    888:  { name: 'Adamant arrow',       limit: 13000, priority: 7, category: 'ammunition' },

    // 🐉 PvM Supplies - Boss Combat
    12934:{ name: "Zulrah's scales",     limit: 20000, priority: 8, category: 'pvm_supplies' },

    // 🔧 Crafting Supplies - Skilling Materials
    314:  { name: 'Feather',             limit: 25000, priority: 7, category: 'supplies' },
    1777: { name: 'Bow string',          limit: 25000, priority: 6, category: 'supplies' },

    // 🧪 Herblore Secondaries - Potion Ingredients
    231:  { name: 'Snape grass',         limit: 13000, priority: 5, category: 'herbs' },
    199:  { name: 'Desert goat horn',    limit: 5000,  priority: 4, category: 'materials' },
    201:  { name: 'Unicorn horn dust',   limit: 1500,  priority: 6, category: 'materials' },
    203:  { name: 'Eye of newt',         limit: 10000, priority: 5, category: 'materials' },
    205:  { name: 'Red spiders eggs',    limit: 5000,  priority: 6, category: 'materials' },
    207:  { name: 'Limpwurt root',       limit: 3000,  priority: 7, category: 'materials' },
    209:  { name: 'White berries',       limit: 1000,  priority: 8, category: 'materials' },
    211:  { name: 'Jangerberries',       limit: 5000,  priority: 6, category: 'materials' },
    215:  { name: 'Mort myre fungus',    limit: 2000,  priority: 8, category: 'materials' },
    217:  { name: 'Crushed birds nest',  limit: 1500,  priority: 8, category: 'materials' },
    219:  { name: 'Ground mud rune',     limit: 500,   priority: 9, category: 'materials' },
};

/** ✅ STABLE_ITEMS - Original Set of reliable trading candidates. */
const STABLE_ITEMS = new Set([
    554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 9075, 20849,
    2, 440, 453, 1511, 1521, 1519, 1517, 1515, 1777,
]);

/** ✅ STAPLE_ITEMS - Original Set for priority scanning (Members). */
const STAPLE_ITEMS = new Set([2, 560, 565, 561, 9075, 12934, 554, 21820]);

// =================================================================================
// SECTION 4: MODULE EXPORTS (ORIGINAL STRUCTURE PRESERVED)
// =================================================================================

module.exports = {
    TRADING_CONFIG,
    TRADING_HELPERS,
    TARGET_COMMODITIES,
    STABLE_ITEMS,
    F2P_ITEM_IDS,
    STAPLE_ITEMS,
    F2P_STAPLE_ITEMS,
    // Also exporting new constant for hybridAnalytics
    ULTRA_HIGH_VOLUME_ITEMS,
};