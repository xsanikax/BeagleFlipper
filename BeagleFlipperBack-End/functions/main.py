import pandas as pd
import lightgbm as lgb
import json
from firebase_functions import https_fn
from firebase_admin import initialize_app

# Initialize Firebase
initialize_app()

# Load your trained LightGBM model from the file on startup
try:
    booster = lgb.Booster(model_file='lgbm_model.txt')
    # Get the expected feature names from the model
    feature_names = booster.feature_name()
    print("LightGBM model 'lgbm_model.txt' loaded successfully.")
except lgb.basic.LightGBMError as e:
    print(f"CRITICAL ERROR: Could not load 'lgbm_model.txt'. Make sure it is deployed with your function. Error: {e}")
    booster = None

@https_fn.on_request()
def suggestion(req: https_fn.Request) -> https_fn.Response:
    """
    An HTTP-triggered function that makes a prediction using your loaded LightGBM model.
    """
    if booster is None:
        return https_fn.Response("Model not loaded, check function logs.", status=500)

    try:
        features = req.get_json(silent=True)
        if features is None:
            return https_fn.Response("Invalid request: No JSON body found.", status=400)

        # Create the feature vector in the exact order the model expects
        feature_vector = [features.get(name, 0) for name in feature_names]

        # Make prediction
        prediction_score = booster.predict([feature_vector])[0]

        response_data = {
            "type": "buy" if prediction_score > 0.6 else "wait", # Use your confidence threshold
            "confidence": prediction_score,
            "model": "lightgbm_python_v1"
        }
        
        return https_fn.Response(json.dumps(response_data), status=200, headers={"Content-Type": "application/json"})

    except Exception as e:
        print(f"Error during prediction: {e}")
        return https_fn.Response("An error occurred during prediction.", status=500)
