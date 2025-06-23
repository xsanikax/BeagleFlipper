const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

/**
 * Reads and analyzes the DaBeagleBoss.csv file to find historically profitable items.
 * @returns {Array<object>} A list of profitable items to be added to the target list.
 */
const analyzeHistoricFlips = () => {
    try {
        const csvFilePath = path.join(__dirname, 'DaBeagleBoss.csv');
        if (!fs.existsSync(csvFilePath)) {
            console.warn("historicalAnalyzer: DaBeagleBoss.csv not found. Skipping dynamic analysis.");
            return [];
        }

        let fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

        const summaryIndex = fileContent.indexOf('# Displaying trades for selected time interval');
        if (summaryIndex !== -1) {
            fileContent = fileContent.substring(0, summaryIndex);
        }

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        const flips = {};

        records.forEach(record => {
            const itemId = record.item_id;
            const type = record.type ? record.type.toUpperCase() : '';
            if (!itemId || !type) return;

            if (!flips[itemId]) {
                flips[itemId] = {
                    name: record.item_name,
                    buys: [],
                    totalProfit: 0,
                    flipCount: 0
                };
            }

            if (type === 'BUY') {
                flips[itemId].buys.push({
                    price: parseInt(record.price, 10),
                    quantity: parseInt(record.quantity, 10)
                });
            } else if (type === 'SELL' && flips[itemId].buys.length > 0) {
                const buy = flips[itemId].buys.shift();
                const sellPrice = parseInt(record.price, 10);
                const quantity = parseInt(record.quantity, 10);

                if (buy && buy.quantity === quantity) {
                    const profit = (sellPrice - buy.price) * quantity;
                    flips[itemId].totalProfit += profit;
                    flips[itemId].flipCount++;
                }
            }
        });

        const profitableItems = Object.entries(flips)
            .filter(([id, data]) => data.totalProfit > 50000 && data.flipCount > 5)
            .sort(([, a], [, b]) => b.totalProfit - a.totalProfit)
            .slice(0, 30);

        console.log("Historical Analyzer: Found top dynamically targeted items from DaBeagleBoss.csv");

        return profitableItems.map(([id, data]) => ({
            id: parseInt(id, 10),
            name: data.name,
            limit: 10000,
            priority: 8,
            category: 'dynamic_historical'
        }));

    } catch (error) {
        console.error("Error analyzing historical flips:", error);
        return [];
    }
};

module.exports = { analyzeHistoricFlips };
