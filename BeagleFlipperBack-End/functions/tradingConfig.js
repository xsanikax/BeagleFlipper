// tradingConfig.js - FIXED VERSION
// This configuration has been fixed to resolve the "buy 0" issue

const TRADING_CONFIG = {
    // --- CORE PROFITABILITY FILTERS ---
    MIN_PROFIT_PER_ITEM: 50, // At least 50gp profit per item
    MIN_ROI: 0.01, // At least 1% return on investment

    // --- CASH REQUIREMENTS ---
    MIN_CASH_PER_SLOT: 50000, // Minimum 50k per GE slot (was potentially too high)

    // --- LIQUIDITY AND SAFETY FILTERS ---
    MIN_LIQUIDITY_SCORE: 10,
    MIN_30M_VOLUME: 100,
    MAX_BUY_PRICE: 1000000, // Max 1M per item to avoid expensive items

    // --- GRAND EXCHANGE TAX SETTINGS ---
    GE_TAX_RATE: 0.01, // 1% tax rate (RuneScape standard)

    // --- QUANTITY LIMITS ---
    MIN_QUANTITY_TO_BUY: 1, // Must be able to buy at least 1 item
    MAX_QUANTITY_PER_FLIP: 1000, // Don't buy more than 1000 of any item
};

// TARGET COMMODITIES - The engine will prioritize scanning these items.
const TARGET_COMMODITIES = {
    // Common runes with good limits
    565: { name: 'Blood rune', limit: 25000 },
    9075: { name: 'Astral rune', limit: 25000 },
    560: { name: 'Death rune', limit: 25000 },
    555: { name: 'Water rune', limit: 25000 },

    // Consumables
    2: { name: 'Cannonball', limit: 10000 },
    385: { name: 'Shark', limit: 10000 },
    3144: { name: 'Karambwan', limit: 10000 },

    // Commonly traded items
    1515: { name: 'Yew logs', limit: 5000 },
    1517: { name: 'Magic logs', limit: 5000 },
    1623: { name: 'Uncut diamond', limit: 5000 },

    // Ores and bars
    440: { name: 'Iron ore', limit: 25000 },
    453: { name: 'Coal', limit: 25000 },
    2357: { name: 'Gold ore', limit: 25000 },
};

module.exports = {
    TRADING_CONFIG,
    TARGET_COMMODITIES
};