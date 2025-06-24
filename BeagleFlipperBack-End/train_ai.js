const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');

console.log("Beagle AI Training Program Initialized.");

// --- Configuration ---
const TRAINING_DATA_PATH = './training_data.json';
const MODEL_SAVE_PATH = 'file://./beagle_model'; // The model will be saved in a folder named 'beagle_model'
const EPOCHS = 50; // How many times the AI will review the training data.
const BATCH_SIZE = 32; // How many trades the AI looks at in one go.

/**
 * Main function to load data, build the model, train it, and save it.
 */
async function runTraining() {
    // 1. Load and Prepare the Data
    console.log('Loading and preparing training data...');
    const jsonData = JSON.parse(fs.readFileSync(TRAINING_DATA_PATH, 'utf8'));

    if (!jsonData || jsonData.length === 0) {
        console.error("Training data is empty. Please run the data_preprocessor.js script first.");
        return;
    }

    // Convert data to tensors, which is the format TensorFlow understands.
    const inputs = jsonData.map(d => [
        d.buy_price,
        d.sell_price,
        d.price_spread,
        d.average_profit_per_item,
        d.average_roi,
        d.average_hold_time_minutes,
        d.buy_limit,
        d.recent_trade_volume
    ]);

    // Create the "correct answers" (labels). We score a flip based on its ROI.
    // This teaches the AI what a "good" (1.0) vs "bad" (0.0) flip looks like.
    const labels = jsonData.map(d => {
        // Simple scoring logic: higher ROI is better. We can make this more complex later.
        if (d.roi > 10) return 1.0; // Excellent flip
        if (d.roi > 3) return 0.75; // Good flip
        if (d.roi > 0) return 0.5; // Okay flip
        return 0.1; // Bad flip
    });

    const inputTensor = tf.tensor2d(inputs);
    const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

    // Normalize the input data to help the AI learn better.
    const {
        mean,
        variance
    } = tf.moments(inputTensor, 0);
    const normalizedInput = inputTensor.sub(mean).div(variance.sqrt());

    console.log('Data prepared successfully.');

    // 2. Build the Neural Network Model
    console.log('Building the neural network model...');
    const model = tf.sequential();

    // Input Layer + First Hidden Layer
    model.add(tf.layers.dense({
        inputShape: [inputs[0].length],
        units: 32,
        activation: 'relu' // Rectified Linear Unit is a standard activation function
    }));

    // Second Hidden Layer
    model.add(tf.layers.dense({
        units: 16,
        activation: 'relu'
    }));

    // Output Layer - A single neuron that outputs the "Confidence Score"
    model.add(tf.layers.dense({
        units: 1,
        activation: 'sigmoid' // Sigmoid activation squashes the output to a value between 0 and 1
    }));

    console.log('Model built successfully.');
    model.summary();

    // 3. Train the Model
    console.log('Starting model training...');
    await model.compile({
        optimizer: tf.train.adam(),
        loss: 'meanSquaredError' // A common loss function for regression tasks
    });

    await model.fit(normalizedInput, labelTensor, {
        epochs: EPOCHS,
        batchSize: BATCH_SIZE,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch + 1} of ${EPOCHS} - Loss: ${logs.loss.toFixed(4)}`);
            }
        }
    });

    console.log('Model training complete.');

    // 4. Save the Trained Model
    console.log(`Saving model to ${MODEL_SAVE_PATH}...`);
    await model.save(MODEL_SAVE_PATH);
    console.log("AI Model saved successfully. The 'beagle_model' folder contains the AI's brain.");
    console.log("Next step is to integrate this model into the suggestionEngine.js.");
}

// Run the training process
runTraining().catch(console.error);

