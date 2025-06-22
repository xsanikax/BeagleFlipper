// train.js
// FINAL VERSION: Replicates the successful Python/LightGBM workflow.
// This script uses the correct pre-processed CSV file and feature set.

const { DatasetServiceClient, PipelineServiceClient } = require('@google-cloud/aiplatform');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const PROJECT_ID = 'our-vigil-461919-m0';
const BUCKET_NAME = 'our-vigil-461919-m0-data'; 
const LOCATION = 'europe-west2';
const MODEL_NAME = 'flipper_live_model';
// CORRECTED: Use the same pre-processed data file as your Python script
const CSV_FILE_PATH = path.join(__dirname, 'master_synthetic_trades_max_volume.csv');
const KEY_FILE_PATH = path.join(__dirname, 'serviceAccountKey.json');

// --- Main Execution ---
async function main() {
    console.log("--- Starting Local Training Orchestrator (Python Workflow) ---");

    if (!fs.existsSync(KEY_FILE_PATH)) {
        throw new Error(`Service Account Key file not found at ${KEY_FILE_PATH}.`);
    }

    // Initialize clients
    const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`, keyFilename: KEY_FILE_PATH };
    const storage = new Storage({ projectId: PROJECT_ID, keyFilename: KEY_FILE_PATH });
    const datasetClient = new DatasetServiceClient(clientOptions);
    const pipelineClient = new PipelineServiceClient(clientOptions);
    const bucket = storage.bucket(BUCKET_NAME);

    // Step 1: Upload the pre-processed CSV to GCS
    console.log(`Step 1: Uploading pre-processed data from ${path.basename(CSV_FILE_PATH)} to Cloud Storage...`);
    const gcsUri = await uploadFileToGCS(CSV_FILE_PATH, bucket);

    // Step 2: Create Vertex AI Dataset
    console.log("Step 2: Creating Vertex AI Dataset...");
    const datasetResourceName = await createVertexDataset(gcsUri, datasetClient);

    // Step 3: Add delay to ensure dataset schema is processed
    console.log("  > Pausing for 60 seconds to allow Vertex AI to process the dataset schema...");
    await new Promise(resolve => setTimeout(resolve, 60000));

    // Step 4: Launch Training Pipeline with the correct feature set
    console.log("Step 4: Starting AutoML training job...");
    await trainVertexModel(datasetResourceName, pipelineClient);

    console.log("\n--- SUCCESS ---");
    console.log("Vertex AI training pipeline has been successfully started.");
    console.log("You can monitor its progress in the Google Cloud Console -> Vertex AI -> Pipelines.");
}

// --- Helper Functions ---

async function uploadFileToGCS(filePath, bucket) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`CSV file not found at ${filePath}`);
    }
    const fileName = `training-data/${path.basename(filePath)}`;
    await bucket.upload(filePath, {
        destination: fileName,
    });
    const gcsUri = `gs://${BUCKET_NAME}/${fileName}`;
    console.log(`  > Uploaded data to ${gcsUri}`);
    return gcsUri;
}

async function createVertexDataset(gcsUri, datasetClient) {
    const dataset = {
        displayName: `flipper_dataset_local_${Date.now()}`,
        metadataSchemaUri: 'gs://google-cloud-aiplatform/schema/dataset/metadata/tables_1.0.0.yaml',
        metadata: { inputConfig: { gcsSource: { uris: [gcsUri] } } }
    };
    const request = { parent: `projects/${PROJECT_ID}/locations/${LOCATION}`, dataset: dataset };
    const [operation] = await datasetClient.createDataset(request);
    const [response] = await operation.promise();
    console.log(`  > Created dataset: ${response.name}`);
    return response.name;
}

async function trainVertexModel(datasetResourceName, pipelineClient) {
    // CORRECTED: This transformations list now matches the features from your train_model.py
    const trainingPipeline = {
        displayName: `flipper_training_pipeline_local_${Date.now()}`,
        inputDataConfig: { datasetId: datasetResourceName.split('/').pop() },
        trainingTaskDefinition: 'gs://google-cloud-aiplatform/schema/trainingjob/definition/automl_tables_1.0.0.yaml',
        trainingTaskInputs: {
            targetColumn: 'outcome',
            predictionType: 'classification',
            transformations: [
                { auto: { column_name: 'buy_price' } },
                { auto: { column_name: 'quantity' } },
                { auto: { column_name: 'trade_duration_hours' } },
                { categorical: { column_name: 'buy_day_of_week' } },
                { categorical: { column_name: 'buy_hour_of_day' } },
                { auto: { column_name: 'volatility' } },
                { auto: { column_name: 'momentum' } },
                { auto: { column_name: 'ma_price_ratio' } },
                { categorical: { column_name: 'outcome' } }
            ],
            trainBudgetMilliNodeHours: 1000,
        },
        modelToUpload: { displayName: MODEL_NAME },
    };
    const request = { parent: `projects/${PROJECT_ID}/locations/${LOCATION}`, trainingPipeline: trainingPipeline };
    await pipelineClient.createTrainingPipeline(request);
}

main().catch(err => {
    console.error("\n--- SCRIPT FAILED ---");
    console.error(err);
    process.exit(1);
});
