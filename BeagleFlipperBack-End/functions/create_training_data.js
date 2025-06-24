// create_training_data.js - OPTIMIZED FOR MAXIMUM DATA EXTRACTION

const fs = require('fs');
const path = require('path');
const { parse, unparse } = require('papaparse');
const wikiApi = require('./wikiApiHandler');

// These helpers can be defined locally to keep this script self-contained
function calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    return Math.sqrt(variance);
}

function calculateMomentum(prices) {
    if (prices.length < 2) return 0;
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    if (startPrice === 0) return 0;
    return (endPrice - startPrice) / startPrice;
}

function calculateMAPriceRatio(currentPrice, prices) {
    if (prices.length === 0) return 1;
    const movingAverage = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (movingAverage === 0) return 1;
    return currentPrice / movingAverage;
}

function pairCompletedFlips(trades) {
    console.log(`Analyzing ${trades.length} raw trade entries...`);
    const buys = new Map();
    const completedFlips = [];
    trades.sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const trade of trades) {
        if (!trade.state || !trade.name || !trade.date) continue;

        if (trade.state === 'BOUGHT') {
            const openBuys = buys.get(trade.name) || [];
            openBuys.push(trade);
            buys.set(trade.name, openBuys);
        } else if (trade.state === 'SOLD') {
            const openBuys = buys.get(trade.name);
            if (openBuys && openBuys.length > 0) {
                const buy = openBuys.shift();
                const sellTime = new Date(trade.date);
                const buyTime = new Date(buy.date);
                const durationHours = (sellTime - buyTime) / (1000 * 60 * 60);

                completedFlips.push({
                    buy_trade: buy,
                    sell_trade: trade,
                    profit: (trade.price * trade.quantity * 0.98) - (buy.price * buy.quantity),
                    duration_hours: durationHours
                });

                if (openBuys.length === 0) buys.delete(trade.name);
            }
        }
    }
    console.log(`Identified ${completedFlips.length} completed flips.`);
    return completedFlips;
}

// Enhanced bulk fetcher with better rate limiting
async function fetchBulkTimeseriesOptimized(itemIds, timestep = '5m') {
    console.log(`Starting optimized bulk fetch for ${itemIds.length} unique items...`);
    const allTimeseriesData = new Map();
    const chunkSize = 5; // Even smaller chunks
    const delayBetweenChunks = 8000; // 8 second delay
    const maxRetries = 3;

    for (let i = 0; i < itemIds.length; i += chunkSize) {
        const chunk = itemIds.slice(i, i + chunkSize);
        console.log(`  Fetching batch ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(itemIds.length / chunkSize)} (items ${i + 1}-${Math.min(i + chunkSize, itemIds.length)})...`);

        // Process items sequentially within each chunk to avoid overwhelming the API
        for (const itemId of chunk) {
            let success = false;
            for (let retry = 0; retry < maxRetries && !success; retry++) {
                try {
                    const timeseries = await wikiApi.fetchTimeseriesForItem(itemId, timestep);
                    if (timeseries) {
                        allTimeseriesData.set(itemId, timeseries);
                        success = true;
                    }
                    // Small delay between individual requests
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.warn(`    Retry ${retry + 1} failed for item ${itemId}: ${error.message}`);
                    if (retry < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000 * (retry + 1)));
                    }
                }
            }
            if (!success) {
                console.warn(`    Failed to fetch data for item ${itemId} after ${maxRetries} retries`);
            }
        }

        if (i + chunkSize < itemIds.length) {
            console.log(`  ...batch complete, waiting ${delayBetweenChunks / 1000} seconds before next batch.`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
        }
    }

    console.log(`Bulk fetch complete. Retrieved data for ${allTimeseriesData.size} of ${itemIds.length} items.`);
    return allTimeseriesData;
}

async function main() {
    console.log("--- Starting 'Ground Truth' Training Data Generation ---");

    const csvPath = path.join(__dirname, 'DaBeagleBoss.csv');
    if (!fs.existsSync(csvPath)) {
        console.error(`ERROR: DaBeagleBoss.csv not found in /functions directory.`);
        return;
    }

    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const cleanedContent = fileContent.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
    const parseResult = parse(cleanedContent, { header: true, dynamicTyping: true });
    const flips = pairCompletedFlips(parseResult.data);

    await wikiApi.ensureMarketDataIsFresh();
    const marketData = wikiApi.getMarketData();

    const uniqueItemIds = [...new Set(flips.map(f => {
        const mappingInfo = marketData.mapping.find(m => m.name === f.buy_trade.name);
        return mappingInfo ? mappingInfo.id : null;
    }).filter(id => id !== null))];

    console.log(`Found ${uniqueItemIds.length} unique items to fetch timeseries data for...`);
    const allTimeseriesData = await fetchBulkTimeseriesOptimized(uniqueItemIds, '5m');

    console.log(`\nEnriching ${flips.length} flips with fetched market data...`);
    const trainingData = [];
    let processedCount = 0;
    let skippedNoMapping = 0;
    let skippedNoTimeseries = 0;
    let skippedInsufficientData = 0;

    for (const flip of flips) {
        const { buy_trade, sell_trade, profit, duration_hours } = flip;
        const { name: itemName, date: buyDate, price: buyPrice, quantity } = buy_trade;
        const buyTimestamp = Math.floor(new Date(buyDate).getTime() / 1000);

        // Find mapping info
        const mappingInfo = marketData.mapping.find(m => m.name === itemName);
        if (!mappingInfo) {
            skippedNoMapping++;
            continue;
        }

        // Get timeseries data
        const timeseries = allTimeseriesData.get(mappingInfo.id);
        if (!timeseries) {
            skippedNoTimeseries++;
            // Still create entry with basic features even without timeseries
            const basicFeatures = {
                item_name: itemName,
                item_id: mappingInfo.id,
                buy_price: buyPrice,
                sell_price: sell_trade.price,
                quantity: quantity,
                trade_duration_hours: duration_hours || 0.08,
                buy_day_of_week: new Date(buyDate).getUTCDay(),
                buy_hour_of_day: new Date(buyDate).getUTCHours(),
                buy_limit: mappingInfo.limit || 0,
                volatility: 0, // Default values when no timeseries
                momentum: 0,
                ma_price_ratio: 1,
                profit: profit,
                outcome: profit > 0 ? 1 : 0
            };
            trainingData.push(basicFeatures);
            processedCount++;
            continue;
        }

        // Filter for data before the buy timestamp
        const precedingData = timeseries.filter(p => p.timestamp < buyTimestamp);

        // Use whatever data we have - even 1 point is better than none
        let volatility = 0;
        let momentum = 0;
        let maPriceRatio = 1;

        if (precedingData.length > 0) {
            // Take up to last 10 data points for calculations
            const windowData = precedingData.slice(-Math.min(10, precedingData.length));
            const prices = windowData.map(p => (p.avgLowPrice + p.avgHighPrice) / 2).filter(p => p > 0);

            if (prices.length >= 2) {
                volatility = calculateVolatility(prices);
                momentum = calculateMomentum(prices);
                maPriceRatio = calculateMAPriceRatio(buyPrice, prices);
            } else if (prices.length === 1) {
                // If only 1 price point, use it for MA ratio
                maPriceRatio = prices[0] > 0 ? buyPrice / prices[0] : 1;
            }
        }

        const features = {
            item_name: itemName,
            item_id: mappingInfo.id,
            buy_price: buyPrice,
            sell_price: sell_trade.price,
            quantity: quantity,
            trade_duration_hours: duration_hours || 0.08,
            buy_day_of_week: new Date(buyDate).getUTCDay(),
            buy_hour_of_day: new Date(buyDate).getUTCHours(),
            buy_limit: mappingInfo.limit || 0,
            preceding_data_points: precedingData.length,
            volatility: volatility,
            momentum: momentum,
            ma_price_ratio: maPriceRatio,
            profit: profit,
            outcome: profit > 0 ? 1 : 0
        };

        trainingData.push(features);
        processedCount++;
    }

    if (trainingData.length === 0) {
        console.error("Could not generate any training data.");
        return;
    }

    const csvOutput = unparse(trainingData);
    const outputPath = path.join(__dirname, 'training_data_from_csv.csv');
    fs.writeFileSync(outputPath, csvOutput);

    console.log("\n--- GENERATION COMPLETE ---");
    console.log(`Successfully created training dataset with ${trainingData.length} entries.`);
    console.log(`Breakdown:`);
    console.log(`  - Processed successfully: ${processedCount}`);
    console.log(`  - Skipped (no item mapping): ${skippedNoMapping}`);
    console.log(`  - Skipped (no timeseries data): ${skippedNoTimeseries}`);
    console.log(`  - Total flips: ${flips.length}`);
    console.log(`File saved to: ${outputPath}`);

    // Show some sample data
    if (trainingData.length > 0) {
        console.log("\nSample training data (first 3 entries):");
        trainingData.slice(0, 3).forEach((entry, i) => {
            console.log(`Entry ${i + 1}:`, {
                item: entry.item_name,
                profit: entry.profit,
                outcome: entry.outcome,
                volatility: entry.volatility.toFixed(4),
                momentum: entry.momentum.toFixed(4)
            });
        });
    }
}

main().catch(console.error);