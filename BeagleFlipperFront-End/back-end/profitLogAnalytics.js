// functions/profitLogAnalytics.js

const { getLatestItemData } = require('./wikiApiHandler');
// CORRECTED PATH
const { TRADING_CONFIG, STABLE_ITEMS } = require('./tradingConfig');
const Papa = require('papaparse');

// This function will be the main entry point for the new strategy
async function getProfitLogSuggestion(csvData, cashInSlot, geSlots) {
    console.log(`[PROFIT LOG ANALYTICS] - Analyzing trade history...`);

    if (!csvData) {
        return { status: 'error', message: 'CSV data not provided.' };
    }

    // 1. Parse the CSV data
    const tradeHistory = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
    }).data;

    // 2. Analyze trades to find profitable items
    const itemProfits = calculateItemProfits(tradeHistory);

    // 3. Sort items by total profit
    const sortedItems = Object.entries(itemProfits).sort(([, a], [, b]) => b.totalProfit - a.totalProfit);

    // 4. Fetch real-time prices for the top items
    const latestData = await getLatestItemData();
    if (!latestData) {
        return { status: 'error', message: 'Failed to fetch latest item data.' };
    }

    // 5. Generate suggestions based on profitable items and current prices
    const suggestions = [];
    for (const [itemName, profitData] of sortedItems) {
        const itemInfo = Object.values(STABLE_ITEMS).find(item => item.name === itemName);
        if (!itemInfo) continue;

        const itemId = Object.keys(STABLE_ITEMS).find(key => STABLE_ITEMS[key] === itemInfo);
        const currentMarketData = latestData[itemId];
        if (!currentMarketData) continue;

        const buyPrice = currentMarketData.low;
        const sellPrice = currentMarketData.high;
        const potentialProfit = sellPrice - buyPrice - (sellPrice * TRADING_CONFIG.GE_TAX_RATE);

        // Check if the item is still profitable according to our config
        if (potentialProfit > TRADING_CONFIG.MIN_PROFIT_PER_ITEM) {
            suggestions.push({
                itemId,
                name: itemName,
                buyPrice: buyPrice,
                sellPrice: sellPrice,
                profit: Math.floor(potentialProfit),
                reason: `Historically profitable with ${profitData.flipCount} successful flips.`,
                historicalProfit: profitData.totalProfit,
            });
        }
    }

    return {
        status: 'success',
        suggestions: suggestions.slice(0, geSlots),
    };
}

function calculateItemProfits(trades) {
    const itemProfits = {};
    const buys = {};

    // Separate buys and sells
    for (const trade of trades) {
        if (trade.state === 'BOUGHT') {
            if (!buys[trade.item_name]) {
                buys[trade.item_name] = [];
            }
            buys[trade.item_name].push({
                quantity: parseInt(trade.quantity, 10),
                price: parseInt(trade.price, 10),
                used: 0, // Keep track of how much of this buy has been sold
            });
        }
    }

    // Process sells and calculate profit
    for (const trade of trades) {
        if (trade.state === 'SOLD') {
            const itemName = trade.item_name;
            let sellQuantity = parseInt(trade.quantity, 10);
            const sellPrice = parseInt(trade.price, 10);

            if (buys[itemName]) {
                for (const buy of buys[itemName]) {
                    if (sellQuantity === 0) break;

                    const availableToSell = buy.quantity - buy.used;
                    if (availableToSell > 0) {
                        const quantityToProcess = Math.min(sellQuantity, availableToSell);
                        const profit = (sellPrice - buy.price) * quantityToProcess;

                        if (!itemProfits[itemName]) {
                            itemProfits[itemName] = { totalProfit: 0, flipCount: 0 };
                        }
                        itemProfits[itemName].totalProfit += profit;
                        itemProfits[itemName].flipCount++;


                        buy.used += quantityToProcess;
                        sellQuantity -= quantityToProcess;
                    }
                }
            }
        }
    }

    return itemProfits;
}

module.exports = { getProfitLogSuggestion };
