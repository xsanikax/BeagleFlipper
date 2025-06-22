// model_runner_8h.js
// This is a direct copy of your working model_runner.js,
// modified only to load the 8-hour model file.

const model = require('./flipper_model_8h.json');

function getPredictionFromTree(tree, features) {
  let node = tree.tree_structure;
  while (true) {
    if (node.hasOwnProperty('leaf_value')) {
      return node.leaf_value;
    }
    const featureIndex = node.split_feature;
    const threshold = node.threshold;
    const featureValue = features[featureIndex];
    if (featureValue <= threshold) {
      node = node.left_child;
    } else {
      node = node.right_child;
    }
  }
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function predict(input) {
  const features = model.feature_names.map(name => input[name]);
  let rawScore = 0;
  for (const tree of model.tree_info) {
    rawScore += getPredictionFromTree(tree, features);
  }
  return sigmoid(rawScore);
}

module.exports = { predict };
