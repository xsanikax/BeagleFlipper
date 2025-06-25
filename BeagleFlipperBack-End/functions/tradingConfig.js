// tradingConfig.js - FINAL UNRESTRICTIVE VERSION
// This configuration has been modified to be non-restrictive, allowing all profitable
// flips found by the suggestion engine to be considered.

const TRADING_CONFIG = {
    // --- CORE PROFITABILITY FILTERS (NOW NON-RESTRICTIVE) ---
    // We now only require a flip to make at least 1gp profit per item after tax.
    MIN_PROFIT_PER_ITEM: 1,

    // We set the minimum Return on Investment to a very low number,
    // effectively removing it as a harsh filter.
    MIN_ROI: 0.0001, // Equivalent to 0.01%

    // --- LIQUIDITY AND SAFETY FILTERS ---
    // These important settings remain.
    MIN_LIQUIDITY_SCORE: 10,
    MIN_30M_VOLUME: 100, // Kept from your original file
    MAX_BUY_PRICE: 1000000000, // Kept from your original file
    MIN_CASH_PER_SLOT: 10000, // From your original file

    // --- GRAND EXCHANGE TAX SETTINGS ---
    GE_TAX_RATE: 0.02,
};

// TARGET COMMODITIES - The engine will prioritize scanning these items.
const TARGET_COMMODITIES = {
    565: { name: 'Blood rune', limit: 30000 },
    9075: { name: 'Astral rune', limit: 30000 },
    2: { name: 'Cannonball', limit: 10000 },
};

module.exports = {
    TRADING_CONFIG,
    TARGET_COMMODITIES
};
