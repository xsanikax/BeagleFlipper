// vertex_ai_predictor.js
// MODIFIED VERSION - Uses lazy initialization for the AI Platform client to prevent startup crashes.

const admin = require('firebase-admin');
const { PredictionServiceClient } = require('@google-cloud/aiplatform');

const PROJECT_ID = 'our-vigil-461919-m0';
const LOCATION = 'europe-west2';

// MODIFICATION: Define the client variable but do not instantiate it here.
let predictionClient;

let currentModelCache = null;
let modelCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * Gets the current model from Firestore with caching
 */
async function getCurrentModel() {
    const now = Date.now();

    // Return cached model if still valid
    if (currentModelCache && modelCacheTime && (now - modelCacheTime) < CACHE_DURATION) {
        return currentModelCache;
    }

    console.log('[Vertex AI Predictor] Loading current model from Firestore...');

    const db = admin.firestore();
    const modelDoc = await db.collection('model_metadata').doc('current_model').get();

    if (!modelDoc.exists) {
        throw new Error('No trained model found. Please run model training first.');
    }

    const modelData = modelDoc.data();
    if (modelData.type !== 'vertex_ai_automl') {
        throw new Error('Model type mismatch. Expected Vertex AI AutoML model.');
    }

    currentModelCache = modelData;
    modelCacheTime = now;

    console.log(`[Vertex AI Predictor] Loaded model: ${modelData.modelName}`);
    return modelData;
}

/**
 * Predicts profitability using Vertex AI AutoML
 * Replaces the LightGBM prediction logic
 */
async function predictProfitability(features) {
    try {
        // MODIFICATION: LAZY INITIALIZATION
        // The client is only created the first time this function is called.
        if (!predictionClient) {
            console.log('[Vertex AI Predictor] Initializing PredictionServiceClient...');
            predictionClient = new PredictionServiceClient();
        }

        console.log('[Vertex AI Predictor] Making prediction request...');

        // Get current model
        const modelData = await getCurrentModel();

        // Prepare the prediction request
        const instance = {
            buy_price: features.buy_price || 0,
            quantity: features.quantity || 0,
            trade_duration_hours: features.trade_duration_hours || 0,
            buy_day_of_week: features.buy_day_of_week || 0,
            buy_hour_of_day: features.buy_hour_of_day || 0,
            strategy_5m: features.strategy_5m || 0,
            strategy_8h: features.strategy_8h || 0,
            volatility: features.volatility || 0,
            momentum: features.momentum || 0,
            ma_price_ratio: features.ma_price_ratio || 1
        };

        const request = {
            endpoint: modelData.modelName,
            instances: [{ structValue: { fields: {} } }]
        };

        // Convert instance to Google Cloud format
        for (const [key, value] of Object.entries(instance)) {
            request.instances[0].structValue.fields[key] = {
                numberValue: value
            };
        }

        console.log('[Vertex AI Predictor] Calling Vertex AI prediction service...');

        // Make prediction
        const [response] = await predictionClient.predict(request);

        if (!response.predictions || response.predictions.length === 0) {
            throw new Error('No predictions returned from Vertex AI');
        }

        const prediction = response.predictions[0];

        // Extract confidence score from AutoML Tables response
        let confidence = 0.5; // default neutral

        if (prediction.structValue && prediction.structValue.fields) {
            const fields = prediction.structValue.fields;

            if (fields.classes && fields.scores) {
                const classes = fields.classes.listValue.values;
                const scores = fields.scores.listValue.values;

                for (let i = 0; i < classes.length; i++) {
                    if (classes[i].stringValue === '1') {
                        confidence = scores[i].numberValue;
                        break;
                    }
                }
            }
        }

        console.log(`[Vertex AI Predictor] Prediction confidence: ${confidence}`);

        return {
            confidence: confidence,
            prediction: confidence > 0.5 ? 'profitable' : 'not_profitable',
            model_type: 'vertex_ai_automl',
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('[Vertex AI Predictor] Prediction failed:', error);

        return {
            confidence: 0.5,
            prediction: 'neutral',
            model_type: 'vertex_ai_automl_fallback',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Validates prediction features
 */
function validateFeatures(features) {
    const requiredFeatures = [
        'buy_price',
        'quantity',
        'trade_duration_hours',
        'buy_day_of_week',
        'buy_hour_of_day'
    ];

    for (const feature of requiredFeatures) {
        if (features[feature] === undefined || features[feature] === null) {
            throw new Error(`Missing required feature: ${feature}`);
        }
    }

    if (features.buy_price <= 0) throw new Error('buy_price must be positive');
    if (features.quantity <= 0) throw new Error('quantity must be positive');
    if (features.buy_day_of_week < 0 || features.buy_day_of_week > 6) throw new Error('buy_day_of_week must be 0-6');
    if (features.buy_hour_of_day < 0 || features.buy_hour_of_day > 23) throw new Error('buy_hour_of_day must be 0-23');
}

/**
 * Main prediction function with the same interface as the original model runner
 */
async function predict(features) {
    try {
        validateFeatures(features);
        const result = await predictProfitability(features);
        console.log('[Vertex AI Predictor] Prediction completed successfully');
        return result;

    } catch (error) {
        console.error('[Vertex AI Predictor] Prediction error:', error);
        throw error;
    }
}

/**
 * Clear the model cache (useful when model is retrained)
 */
function clearModelCache() {
    currentModelCache = null;
    modelCacheTime = null;
    console.log('[Vertex AI Predictor] Model cache cleared');
}

module.exports = {
    predict,
    predictProfitability,
    clearModelCache,
    validateFeatures
};