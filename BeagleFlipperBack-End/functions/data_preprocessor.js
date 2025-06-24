const fs = require('fs');
const Papa = require('papaparse');

console.log("Starting Data Preprocessing for the Beagle AI...");

// Path to your successful trade history file
const csvFilePath = './functions/DaBeagleBoss.csv';

// Read the CSV file
fs.readFile(csvFilePath, 'utf8', (err, fileContent) => {
    if (err) {
        console.error("Error reading the CSV file:", err);
        return;
    }

    // Parse the CSV data using papaparse
    Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            console.log(`Successfully parsed ${results.data.length} rows.`);
            processTrades(results.data);
        },
        error: (error) => {
            console.error("Error parsing CSV:", error);
        }
    });
});

/**
 * Processes the parsed trade data to pair buys and sells into completed flips.
 * @param {Array<object>} trades - An array of trade objects from the CSV.
 */
function processTrades(trades) {
    const buyOffers = {}; // To temporarily hold buy transactions
    const completedFlips = [];

    // Filter out any rows that are not 'BUY' or 'SELL' from the main log
    const filteredTrades = trades.filter(t => t.type === 'BUY' || t.type === 'SELL');

    for (const trade of filteredTrades) {
        const itemId = trade.item_id;
        const type = trade.type;
        const price = parseInt(trade.price, 10);
        const quantity = parseInt(trade.quantity, 10);
        const time = parseInt(trade.time, 10);

        if (type === 'BUY') {
            // If this is a buy, store it, waiting for its matching sell
            if (!buyOffers[itemId]) {
                buyOffers[itemId] = [];
            }
            buyOffers[itemId].push({ price, quantity, time });
        } else if (type === 'SELL') {
            // If this is a sell, find the matching buy
            if (buyOffers[itemId] && buyOffers[itemId].length > 0) {
                // Find the first corresponding buy offer
                const buyOffer = buyOffers[itemId].shift(); // FIFO queue

                // Calculate the metrics for this completed flip
                const investment = buyOffer.price * quantity;
                const revenue = price * quantity;
                const profit = revenue - investment;
                const roi = (profit / investment) * 100;
                const holdTimeMinutes = (time - buyOffer.time) / 60;

                completedFlips.push({
                    item_id: itemId,
                    item_name: trade.item_name,
                    buy_price: buyOffer.price,
                    sell_price: price,
                    quantity: quantity,
                    profit: profit,
                    roi: parseFloat(roi.toFixed(2)),
                    hold_time_minutes: parseFloat(holdTimeMinutes.toFixed(2)),
                });
            }
        }
    }

    console.log(`Found ${completedFlips.length} completed flips.`);

    // Save the processed data to a new JSON file
    const outputFilePath = './functions/training_data.json';
    fs.writeFile(outputFilePath, JSON.stringify(completedFlips, null, 2), (err) => {
        if (err) {
            console.error("Error writing the training_data.json file:", err);
        } else {
            console.log(`Successfully created training_data.json with ${completedFlips.length} entries.`);
            console.log("Data preprocessing complete. We are ready to design and train the neural network.");
        }
    });
}
