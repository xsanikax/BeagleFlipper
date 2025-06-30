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
//      CONFIGURATION v27.0 - UPGRADED WITH ADVANCED VOLATILITY LOGIC              //
//                                                                                 //
// ================================================================================= //
// ================================================================================= //

const TRADING_CONFIG = {

    // ================================================================================= //
    // SECTION 1: MASTER STRATEGY & CORE SETTINGS
    // ================================================================================= //

    ENABLE_BEAGLE_FLIPPER: true,
    ENABLE_MODIFY_SUGGESTIONS: true,
    FIREBASE_WEB_API_KEY: "AIzaSyDspCsPLP5hpVnRCE-qYSdUbM8w-eMCJcY",
    GE_TAX_RATE: 0.01,
    MIN_PROFIT_PER_ITEM: 1,
    BUY_PRICE_OFFSET_GP: 1,

    // ================================================================================= //
    // SECTION 2: ADVANCED ANALYSIS PARAMETERS (TO ENABLE SUCCESSFUL OLD LOGIC)
    // ================================================================================= //

    MINIMUM_MARKET_SPREAD_GP: 3,
    MINIMUM_5MIN_VOLUME: 75000,

    BUY_SNAPSHOT_WINDOW: 3,
    /* ================================================================================
       BUY PRICE ANALYSIS WINDOW (from successful script)
       --------------------------------------------------------------------------------
       The number of 5-minute snapshots (3 * 5 = 15 minutes) to analyze for the
       average BUY price. A shorter window reacts faster to price changes.
       ================================================================================ */

    SELL_SNAPSHOT_WINDOW: 4,
    /* ================================================================================
       SELL PRICE ANALYSIS WINDOW (from successful script)
       --------------------------------------------------------------------------------
       The number of 5-minute snapshots (4 * 5 = 20 minutes) to analyze for the
       average SELL price. A longer window gives a more stable, less volatile sell price.
       ================================================================================ */

    VOLATILITY_THRESHOLD: 0.15,
    /* ================================================================================
       VOLATILITY THRESHOLD (from successful script)
       --------------------------------------------------------------------------------
       The percentage (0.15 = 15%) a price must drop or spike to be considered an
       "opportunity," triggering more aggressive pricing.
       ================================================================================ */

    OPPORTUNITY_WINDOW: 3,
    /* ================================================================================
       OPPORTUNITY ANALYSIS WINDOW (from successful script)
       --------------------------------------------------------------------------------
       The number of recent 5-minute snapshots (3 * 5 = 15 minutes) to check for current
       market volatility against the longer-term average.
       ================================================================================ */

    // ================================================================================= //
    // SECTION 3: MODIFY & ABORT STRATEGY PARAMETERS
    // ================================================================================= //

    MODIFY_AFTER_MINUTES: 4,
    REPRICE_UNDERCUT_THRESHOLD_GP: 2,
    ABORT_IF_SPREAD_DROPS_BELOW_GP: 2,
    ABORT_IF_VOLUME_DROPS_BELOW: 30000,
    MAX_OFFER_LIFETIME_MINUTES: 10,

    // ================================================================================= //
    // SECTION 4: GENERAL & RISK MANAGEMENT PARAMETERS
    // ================================================================================= //

    MIN_CASH_PER_SLOT: 10000,
    MAX_PRICE_PER_ITEM: 25000000,
    MIN_ITEM_VALUE: 200,
    BUY_LIMIT_RESET_HOURS: 4,
    ENABLE_DEBUG_LOGGING: true,
};


// ================================================================================= //
// SECTION 5: STRATEGIC ITEM LISTS
// ================================================================================= //

const STAPLE_ITEMS_P2P = new Set([
    // --- High-Profit, High-Value Targets ---
    11235, 4151, 6571, 11834, 11840,
    // --- High-Volume Staples ---
    2, 12934, 888, 892, 560, 565, 9075, 2359, 2361,
    // --- Proven Herbs ---
    2353, 225, 223, 237, 2351, 221,
    // --- High-Demand Consumables ---
    11936, 385, 391, 2434,
    // --- Reliable Skilling & Misc ---
    2970, 1777, 9436, 453, 1515,
]);

const STAPLE_ITEMS_F2P = new Set([
    // --- Ores & Bars ---
    438, 440, 444, 447, 449, 451, 2351, 2353, 2359, 2361, 2363,
    // --- Ammunition ---
    882, 884, 886, 892,
    // --- Core Elemental Runes ---
    554, 555, 556, 557, 558,
    // --- Catalytic & High-Value Runes ---
    562, 560, 565,
    // --- F2P Weapons & Armor ---
    1333, 1127, 1163, 1079,
]);


// ================================================================================= //
// SECTION 6: MODULE EXPORTS
// ================================================================================= //

module.exports = {
    TRADING_CONFIG,
    STAPLE_ITEMS_P2P,
    STAPLE_ITEMS_F2P,
};