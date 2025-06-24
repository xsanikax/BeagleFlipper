// vertex_ai_trainer.js
// MODIFIED VERSION - Correctly queries Firestore and prepares data for AutoML training.
// This script gathers historical data, combines it with new feature-rich data from Firestore,
// and starts a Vertex AI training pipeline.

const { DatasetServiceClient, PipelineServiceClient } = require('@google-cloud/aiplatform');
const admin = require('firebase-admin');
const { parse } = require("csv-parse/sync");

// --- Configuration ---
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'our-vigil-461919-m0';
const BUCKET_NAME = 'our-vigil-461919-m0-data';
const LOCATION = 'us-central1';
const MODEL_NAME = 'flipper_live_model';

/**
 * Main function to orchestrate the entire training and deployment pipeline.
 * NOTE: This function INITIATES a long-running training job. It does not wait for completion.
 * You will need to monitor the Vertex AI console for the pipeline's completion status.
 * After the model is trained, you must manually (or via another script) deploy it to an endpoint
 * and update the 'model_metadata/current_model' document in Firestore with the new endpoint ID.
 */
async function trainAndDeployModel() {
    const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
    const datasetClient = new DatasetServiceClient(clientOptions);
    const pipelineClient = new PipelineServiceClient(clientOptions);
    const db = admin.firestore();
    const bucket = admin.storage().bucket(BUCKET_NAME);

    console.log("Step 1: Gathering and processing all training data...");
    const trainingDataArray = await gatherAndProcessTrainingData(db, bucket);

    if (trainingDataArray.length < 50) {
        const errorMessage = `Not enough training examples found (${trainingDataArray.length} rows). AutoML requires at least 50. Please continue trading to generate data.`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    console.log(`Step 2: Found ${trainingDataArray.length} valid training records. Uploading to Cloud Storage...`);
    const gcsUri = await uploadDataToGCS(trainingDataArray, bucket);

    console.log("Step 3: Creating Vertex AI Dataset...");
    const datasetResourceName = await createVertexDataset(gcsUri, datasetClient);

    console.log("Step 4: Starting AutoML training job...");
    await trainVertexModel(datasetResourceName, pipelineClient);

    console.log("SUCCESS: Vertex AI training pipeline has been successfully started. Please monitor the Google Cloud Console for completion.");
}


/**
 * Gathers data from historical CSV and new Firestore flips, then processes it.
 */
async function gatherAndProcessTrainingData(db, bucket) {
    let historicalFlips = [];

    // --- Step 1: Process historical data from DaBeagleBoss.csv ---
    try {
        const filePath = 'DaBeagleBoss.csv';
        const originalFile = bucket.file(filePath);
        const [exists] = await originalFile.exists();
        if (exists) {
            const [contents] = await originalFile.download();
            const records = parse(contents, {
                columns: true,
                skip_empty_lines: true,
                relax_column_count: true,
            });

            console.log(`Processing ${records.length} raw transactions from DaBeagleBoss.csv...`);
            historicalFlips = processRawTransactions(records);
            console.log(`Reconstructed ${historicalFlips.length} completed flips from historical data.`);
        } else {
            console.warn(`DaBeagleBoss.csv not found. Starting with only new data.`);
        }
    } catch (error) {
        console.error("Could not process DaBeagleBoss.csv.", error);
    }

    // --- Step 2: Fetch new, feature-rich data from Firestore ---
    // MODIFICATION: Query fields must match what's in Firestore (camelCase for isClosed, snake_case for ai_features).
    const snapshot = await db.collectionGroup('flips')
        .where('isClosed', '==', true)       // Use camelCase as saved in tradingLogic.js
        .where('ai_features', '!=', null)  // Use snake_case as saved in tradingLogic.js
        .get();

    let firestoreRecords = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.ai_features) {
            const features = data.ai_features;
            // The target column for the model to predict
            features.outcome = data.profit > 0 ? 1 : 0;
            firestoreRecords.push(features);
        }
    });

    console.log(`Loaded ${firestoreRecords.length} new records from Firestore.`);
    // Combine the processed historical data with the new live data
    return historicalFlips.concat(firestoreRecords);
}

/**
 * Processes a raw transaction log into completed flips with an 'outcome'.
 * This function intelligently reconstructs historical flips.
 * @param {Array<Object>} transactions The raw transaction records from the CSV.
 * @returns {Array<Object>} An array of processed training examples.
 */
function processRawTransactions(transactions) {
    const buys = new Map(); // K: item_id, V: array of buy { price, quantity }
    const sells = new Map(); // K: item_id, V: array of sell { price, quantity }

    // First, separate all valid buys and sells into maps
    transactions.forEach(t => {
        if (!t.item_id || !t.type || !t.price || !t.quantity) return; // Skip invalid lines

        const record = {
            price: parseFloat(t.price),
            quantity: parseInt(t.quantity, 10)
        };

        if (isNaN(record.price) || isNaN(record.quantity)) return; // Skip if parsing fails

        const type = t.type.toLowerCase();
        const map = type === 'buy' ? buys : sells;

        if (!map.has(t.item_id)) {
            map.set(t.item_id, []);
        }
        map.get(t.item_id).push(record);
    });

    const completedFlips = [];

    // Now, match buys to sells to create completed flips
    for (const [itemId, buyRecords] of buys.entries()) {
        if (sells.has(itemId)) {
            const sellRecords = sells.get(itemId);
            // Simple FIFO matching: match first buy with first sell
            const numMatches = Math.min(buyRecords.length, sellRecords.length);
            for (let i = 0; i < numMatches; i++) {
                const buy = buyRecords[i];
                const sell = sellRecords[i];

                const profit = (sell.price - buy.price) * Math.min(buy.quantity, sell.quantity);

                // Create a training example with placeholder features for historical data
                completedFlips.push({
                    buy_price: buy.price,
                    quantity: buy.quantity,
                    trade_duration_hours: 8, // Placeholder
                    buy_day_of_week: 3,      // Placeholder
                    buy_hour_of_day: 12,     // Placeholder
                    strategy_5m: 0,          // Placeholder
                    strategy_8h: 1,          // Placeholder for 8-hour strategy
                    volatility: 0.1,         // Placeholder
                    momentum: 0,             // Placeholder
                    ma_price_ratio: 1,       // Placeholder
                    outcome: profit > 0 ? 1 : 0,
                });
            }
        }
    }
    return completedFlips;
}

/**
 * Converts the data array to a CSV string and uploads to GCS.
 */
async function uploadDataToGCS(dataArray, bucket) {
    if (dataArray.length === 0) throw new Error("Cannot upload empty dataset.");
    const headers = Object.keys(dataArray[0]);
    let csvContent = headers.join(',') + '\n';
    dataArray.forEach(row => {
        const values = headers.map(header => {
            const val = row[header];
            if (typeof val === 'string' && val.includes(',')) { return `"${val}"`; }
            return val !== null && val !== undefined ? val : '';
        });
        csvContent += values.join(',') + '\n';
    });
    const fileName = `training-data/flipper-data-${new Date().toISOString()}.csv`;
    const file = bucket.file(fileName);
    await file.save(csvContent);
    return `gs://${BUCKET_NAME}/${fileName}`;
}

async function createVertexDataset(gcsUri, datasetClient) {
    const datasetId = `flipper_dataset_${new Date().getTime()}`;
    const dataset = {
        displayName: datasetId,
        metadataSchemaUri: 'gs://google-cloud-aiplatform/schema/dataset/metadata/tables_1.0.0.yaml',
        metadata: { inputConfig: { gcsSource: { uris: [gcsUri] } } }
    };
    const request = { parent: `projects/${PROJECT_ID}/locations/${LOCATION}`, dataset: dataset };
    const [operation] = await datasetClient.createDataset(request);
    const [response] = await operation.promise();
    return response.name;
}

async function trainVertexModel(datasetResourceName, pipelineClient) {
    const trainingPipeline = {
        displayName: `flipper_training_pipeline_${new Date().getTime()}`,
        inputDataConfig: { datasetId: datasetResourceName.split('/').pop() },
        trainingTaskDefinition: 'gs://google-cloud-aiplatform/schema/trainingjob/definition/automl_tables_1.0.0.yaml',
        trainingTaskInputs: {
            targetColumn: 'outcome',
            predictionType: 'classification',
            transformations: [
                { auto: { column_name: 'buy_price' } }, { auto: { column_name: 'quantity' } },
                { auto: { column_name: 'trade_duration_hours' } }, { categorical: { column_name: 'buy_day_of_week' } },
                { categorical: { column_name: 'buy_hour_of_day' } }, { categorical: { column_name: 'strategy_5m' } },
                { categorical: { column_name: 'strategy_8h' } }, { auto: { column_name: 'volatility' } },
                { auto: { column_name: 'momentum' } }, { auto: { column_name: 'ma_price_ratio' } },
            ],
            trainBudgetMilliNodeHours: 1000,
        },
        modelToUpload: { displayName: MODEL_NAME },
    };
    const request = { parent: `projects/${PROJECT_ID}/locations/${LOCATION}`, trainingPipeline: trainingPipeline };
    const [operation] = await pipelineClient.createTrainingPipeline(request);
    console.log("Started training pipeline. This may take 1-2 hours. Name:", operation.name);
}

module.exports = { trainAndDeployModel };