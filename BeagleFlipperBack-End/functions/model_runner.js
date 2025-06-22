// model_runner.js
// This utility is responsible for loading your flipper_model.json and making predictions.
// It effectively acts as a JavaScript-based inference engine for your trained model.

const model = require('./flipper_model.json');

/**
 * Traverses a single decision tree within the model to find a leaf value.
 * @param {object} tree - The tree structure from the model's tree_info array.
 * @param {Array<number>} features - The array of numerical features for the item being predicted.
 * @returns {number} The raw value from the leaf node of the tree.
 */
function getPredictionFromTree(tree, features) {
  let node = tree.tree_structure;

  // Loop until a leaf node (which has a 'leaf_value') is reached.
  while (true) {
    if (node.hasOwnProperty('leaf_value')) {
      return node.leaf_value;
    }

    const featureIndex = node.split_feature;
    const threshold = node.threshold;
    const featureValue = features[featureIndex];

    // Decide whether to go down the left or right child path based on the feature value.
    if (featureValue <= threshold) {
      node = node.left_child;
    } else {
      node = node.right_child;
    }
  }
}

/**
 * The sigmoid function. Your model uses this to convert its raw output
 * into a probability score (a number between 0 and 1).
 * @param {number} x - The raw output score from the model.
 * @returns {number} A probability (e.g., 0.92 for 92%).
 */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Makes a prediction using the full LightGBM model.
 * @param {object} input - An object containing the feature values required by the model.
 * Example: { buy_price: 100, quantity: 50, trade_duration_hours: 2, ... }
 * @returns {number} The final probability of the flip being profitable.
 */
function predict(input) {
  // The features must be ordered exactly as they were during training.
  // This line maps your input object to an array in that specific order. [cite: flipper_model.json]
  const features = model.feature_names.map(name => input[name]);

  let rawScore = 0;
  // An XGBoost/LightGBM model is an ensemble of many trees.
  // We sum the predictions from every tree to get a final raw score.
  for (const tree of model.tree_info) {
    rawScore += getPredictionFromTree(tree, features);
  }

  // The model's objective is "binary sigmoid", so we must apply the sigmoid
  // function to the raw score to get the final confidence probability. [cite: flipper_model.json]
  return sigmoid(rawScore);
}

module.exports = { predict };

