// train-with-unique-bucket.js - Fixed with advanced logging and Discord webhook alert

const { DatasetServiceClient, PipelineServiceClient } = require('@google-cloud/aiplatform');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const https = require('https');
const PROJECT_ID = 'our-vigil-461919-m0';
const BUCKET_NAME = 'our-vigil-461919-m0-data';
const LOCATION = 'europe-west2';
const MODEL_NAME = 'flipper_live_model';
const CSV_FILE_PATH = path.join(__dirname, 'training_data_from_csv.csv');
const KEY_FILE_PATH = path.join(__dirname, 'serviceAccountKey.json');
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1266073615904804917/ch-EqXPtzYjA2sgVrNtAVhickO7dTiUl8WafZ_5btXRD4aMM_6z0EU3ARQbEnuqSu4Bi'; // replace with actual webhook

function log(msg) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
}

async function sendDiscordAlert(message) {
    const payload = JSON.stringify({ content: message });
    const url = new URL(DISCORD_WEBHOOK_URL);

    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length,
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            res.on('data', () => {});
            res.on('end', resolve);
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function setupAuthentication() {
    log("=== ENHANCED AUTHENTICATION SETUP ===");
    if (!fs.existsSync(KEY_FILE_PATH)) throw new Error(`Service Account Key file not found at ${KEY_FILE_PATH}`);
    const keyData = JSON.parse(fs.readFileSync(KEY_FILE_PATH, 'utf8'));
    log(`✓ Service account key loaded for: ${keyData.client_email}`);
    const clientOptions = {
        apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
        projectId: keyData.project_id,
        credentials: keyData
    };
    return {
        storage: new Storage({ projectId: keyData.project_id, credentials: keyData }),
        datasetClient: new DatasetServiceClient(clientOptions),
        pipelineClient: new PipelineServiceClient(clientOptions),
        bucket: new Storage({ projectId: keyData.project_id, credentials: keyData }).bucket(BUCKET_NAME),
        projectId: keyData.project_id
    };
}

async function createUniqueBucket(storage) {
    log("=== CREATING UNIQUE BUCKET ===");
    try {
        await storage.bucket(BUCKET_NAME).create({ location: LOCATION, storageClass: 'STANDARD' });
        log(`✓ Successfully created bucket: ${BUCKET_NAME}`);
    } catch (error) {
        if (error.code === 409) {
            log(`✓ Bucket already exists`);
        } else {
            throw error;
        }
    }
}

async function validateTrainingData() {
    log("=== TRAINING DATA VALIDATION ===");
    if (!fs.existsSync(CSV_FILE_PATH)) throw new Error('Missing CSV');
    const lines = fs.readFileSync(CSV_FILE_PATH, 'utf8').trim().split('\n');
    const header = lines[0];
    const headerColumns = header.split(',').map(h => h.trim().toLowerCase());
    if (!headerColumns.includes('outcome')) throw new Error('Missing outcome column');
    log(`✓ Training data validation passed`);
    return { headerColumns };
}

async function uploadFileToGCS(filePath, bucket) {
    const fileName = `training-data/training_data_from_csv_${Date.now()}.csv`;
    await bucket.upload(filePath, {
        destination: fileName,
        metadata: { contentType: 'text/csv' }
    });
    const gcsUri = `gs://${BUCKET_NAME}/${fileName}`;
    log(`✓ Uploaded training data to ${gcsUri}`);
    return gcsUri;
}

async function createVertexDataset(gcsUri, datasetClient, projectId) {
    const dataset = {
        displayName: `flipper_dataset_${Date.now()}`,
        metadataSchemaUri: 'gs://google-cloud-aiplatform/schema/dataset/metadata/tables_1.0.0.yaml',
        metadata: { inputConfig: { gcsSource: { uris: [gcsUri] } } }
    };
    const request = { parent: `projects/${projectId}/locations/${LOCATION}`, dataset };
    const [operation] = await datasetClient.createDataset(request);
    const [response] = await operation.promise();
    log(`✓ Created dataset: ${response.name}`);
    return response.name;
}

async function waitForDatasetReady(datasetClient, datasetResourceName, timeoutMs = 600000) {
    log("⏳ Waiting for dataset schema processing...");
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const [dataset] = await datasetClient.getDataset({ name: datasetResourceName });
        if (dataset.metadata && dataset.metadata.schema) {
            log("✓ Dataset schema is ready.");
            return;
        }
        await new Promise(res => setTimeout(res, 10000));
    }
    throw new Error("Dataset schema not ready in time");
}

async function trainVertexModel(datasetResourceName, pipelineClient, projectId, headerColumns) {
    log("=== STARTING TRAINING PIPELINE ===");
    const transformations = [];
    const columnsToTransform = [
        { column: 'buy_price', type: 'auto' },
        { column: 'sell_price', type: 'auto' },
        { column: 'quantity', type: 'auto' },
        { column: 'trade_duration_hours', type: 'auto' },
        { column: 'buy_day_of_week', type: 'categorical' },
        { column: 'buy_hour_of_day', type: 'categorical' },
        { column: 'buy_limit', type: 'auto' },
        { column: 'volatility', type: 'auto' },
        { column: 'momentum', type: 'auto' },
        { column: 'ma_price_ratio', type: 'auto' },
        { column: 'preceding_data_points', type: 'auto' }
    ];
    for (const col of columnsToTransform) {
        if (headerColumns.includes(col.column.toLowerCase())) {
            transformations.push({ [col.type]: { column_name: col.column } });
        }
    }
    const trainingPipeline = {
        displayName: `flipper_training_${Date.now()}`,
        inputDataConfig: { datasetId: datasetResourceName.split('/').pop() },
        trainingTaskDefinition: 'gs://google-cloud-aiplatform/schema/trainingjob/definition/automl_tables_1.0.0.yaml',
        trainingTaskInputs: {
            targetColumn: 'outcome',
            predictionType: 'classification',
            transformations,
            trainBudgetMilliNodeHours: 1000,
            optimizationObjective: 'maximize-au-prc'
        },
        modelToUpload: { displayName: `${MODEL_NAME}_${Date.now()}` }
    };
    const request = {
        parent: `projects/${projectId}/locations/${LOCATION}`,
        trainingPipeline
    };
    const [operation] = await pipelineClient.createTrainingPipeline(request);
    log(`✓ Training pipeline started: ${operation.name}`);
    await sendDiscordAlert(`✅ Vertex AI Training Pipeline started successfully!\nName: ${trainingPipeline.displayName}`);
}

(async function main() {
    log("=== BEAGLEFLIPPER AI TRAINING ORCHESTRATOR (UNIQUE BUCKET) ===");
    try {
        const { storage, datasetClient, pipelineClient, bucket, projectId } = await setupAuthentication();
        await createUniqueBucket(storage);
        const { headerColumns } = await validateTrainingData();
        const gcsUri = await uploadFileToGCS(CSV_FILE_PATH, bucket);
        const datasetResourceName = await createVertexDataset(gcsUri, datasetClient, projectId);
        await waitForDatasetReady(datasetClient, datasetResourceName);
        await trainVertexModel(datasetResourceName, pipelineClient, projectId, headerColumns);
    } catch (err) {
        log(`❌ ERROR: ${err.message}`);
        await sendDiscordAlert(`🚨 Vertex AI training failed: ${err.message}`);
        process.exit(1);
    }
})();
