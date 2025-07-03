from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import xgboost as xgb
import json
from datetime import timedelta

app = Flask(__name__)
CORS(app)

# --- Load Model and Features on Startup ---
try:
    model = xgb.XGBRegressor()
    model.load_model('demand_forecast.json')
    with open('model_features.json', 'r') as f:
        model_features = json.load(f)
    print("✅ ML Model and features loaded successfully.")
except Exception as e:
    print(f"❌ ERROR: Could not load model files. Make sure 'demand_forecast.json' and 'model_features.json' exist. Run train.py first. Details: {e}")
    model = None
    model_features = None


def create_features_for_tomorrow(sales_history_df, weather_forecast, product_id):
    """Creates a feature vector for a single product for tomorrow."""
    
    # --- FIX: Use robust pd.to_datetime for parsing the incoming date string ---
    # This correctly handles formats like "2025-07-02T00:00:00.000Z" from JavaScript.
    try:
        tomorrow = pd.to_datetime(weather_forecast['date']) + timedelta(days=1)
    except Exception as e:
        # Add error handling for visibility
        raise ValueError(f"Could not parse date from weather_forecast: {weather_forecast.get('date')}. Error: {e}")

    product_sales = sales_history_df[sales_history_df['product_id'] == product_id].copy()
    product_sales.sort_values('date', inplace=True)
    
    features = {}
    features['day_of_week'] = tomorrow.weekday()
    features['day_of_month'] = tomorrow.day
    features['month'] = tomorrow.month
    features['is_weekend'] = 1 if tomorrow.weekday() >= 5 else 0

    # Lag features
    for lag in [1, 2, 3, 7]:
        if len(product_sales) >= lag:
            features[f'sales_lag_{lag}'] = product_sales['units_sold'].iloc[-lag]
        else:
            features[f'sales_lag_{lag}'] = 0 

    # Rolling mean
    if not product_sales.empty:
        features['sales_rolling_mean_7'] = product_sales['units_sold'].tail(7).mean()
    else:
        features['sales_rolling_mean_7'] = 0

    # Weather features
    features['temperature_c'] = weather_forecast.get('temperature_c', 28)
    features['precipitation_mm'] = weather_forecast.get('precipitation_mm', 0)
    
    # Ensure all possible weather conditions from training are present
    for cond in ['Sunny', 'Rainy', 'Cloudy', 'Storm']:
        features[f'weather_{cond}'] = 1 if weather_forecast.get('weather_condition') == cond else 0
        
    return features


@app.route('/forecast', methods=['POST'])
def forecast():
    if not model or not model_features:
        return jsonify({"error": "Model is not loaded on the server. Please check server logs."}), 500
        
    try:
        data = request.json
        sales_history = data.get('sales_history')
        weather_forecast = data.get('weather_forecast')
        products = data.get('products')

        if not all([sales_history is not None, weather_forecast, products]):
            return jsonify({"error": "Missing data: 'sales_history', 'weather_forecast', or 'products' not provided"}), 400

        sales_history_df = pd.DataFrame(sales_history)
        # Handle empty sales history gracefully
        if not sales_history_df.empty:
            sales_history_df['date'] = pd.to_datetime(sales_history_df['date'])

        predictions = []
        for product in products:
            product_id = product['product_id']
            feature_dict = create_features_for_tomorrow(sales_history_df, weather_forecast, product_id)
            
            feature_df = pd.DataFrame([feature_dict])
            
            for col in model_features:
                if col not in feature_df.columns:
                    feature_df[col] = 0
            feature_df = feature_df[model_features]

            prediction = model.predict(feature_df)[0]
            predicted_units = max(0, float(prediction))
            
            predictions.append({
                'product_id': product_id,
                'predicted_units': predicted_units
            })

        return jsonify(predictions)

    except Exception as e:
        # Return a meaningful JSON error instead of crashing
        print(f"❌ An error occurred in /forecast: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "An internal error occurred in the ML service.", "details": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5000, debug=True)