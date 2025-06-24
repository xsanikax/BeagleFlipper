// tradingConfig.js - FINAL UNRESTRICTIVE VERSION
// This configuration has been modified to be non-restrictive, allowing all profitable
// flips found by the suggestion engine to be considered.

const TRADING_CONFIG = {
    // --- CORE PROFITABILITY FILTERS ---
    // These have been made non-restrictive to match the successful trading style.

    // We now only require a flip to make at least 1gp profit per item after tax.
    // This allows the engine to find all the "gems", even small-margin ones.
    MIN_PROFIT_PER_ITEM: 1,

    // We set the minimum Return on Investment to a very low number.
    // This effectively removes the ROI filter, trusting the engine's ranking score instead.
    MIN_ROI: 0.0001, // Equivalent to 0.01%

    // --- LIQUIDITY AND SAFETY FILTERS ---
    // These settings remain, as they are important for avoiding bad items.

    // Minimum 5-minute trade volume for an item to be considered.
    MIN_5M_TOTAL_VOLUME: 50,

    // Minimum liquidity score (0-100) for an item to be considered flippable.
    // This helps avoid items that are too slow to buy or sell.
    MIN_LIQUIDITY_SCORE: 10,

    // --- GRAND EXCHANGE TAX SETTINGS ---
    // Correctly set to 2% as per our analysis.
    GE_TAX_RATE: 0.02,
    GE_TAX_CAP: 5000000, // Max tax per transaction
};

const TARGET_COMMODITIES = {
    // This list can be populated with specific items you always want to track,
    // but the engine will scan all items regardless.
    // Example:
    // 13441: { id: 13441, name: "Saradomin brew(4)"},
    // 24229: { id: 24229, name: "Stamina potion(4)"}
};

module.exports = {
    TRADING_CONFIG,
    TARGET_COMMODITIES
};
