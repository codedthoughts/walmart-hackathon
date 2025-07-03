import pandas as pd
import xgboost as xgb
from pymongo import MongoClient
import os
from dotenv import load_dotenv
from sklearn.model_selection import train_test_split # Moved import to the top

load_dotenv()

def train_and_save_model():
    print("Connecting to MongoDB to fetch training data...")
    client = MongoClient(os.getenv('MONGO_URI'))
    db = client.get_database('walmart_sparkathon')

    sales_projection = {'_id': 0, 'product_id': 1, 'date': 1, 'units_sold': 1, 'price_at_sale': 1}
    sales_df = pd.DataFrame(list(db.sales.find({}, sales_projection)))

    weather_projection = {'_id': 0, 'date': 1, 'temperature_c': 1, 'precipitation_mm': 1, 'weather_condition': 1}
    weather_df = pd.DataFrame(list(db.weathers.find({}, weather_projection)))

    if sales_df.empty or weather_df.empty:
        print("❌ Error: No data found in sales or weather collections. Please seed the database first.")
        return

    print(f"Fetched {len(sales_df)} sales records and {len(weather_df)} weather records.")

    sales_df['date'] = pd.to_datetime(sales_df['date'])
    weather_df['date'] = pd.to_datetime(weather_df['date'])
    df = pd.merge(sales_df, weather_df, on='date', how='left')
    df.sort_values(by=['product_id', 'date'], inplace=True)
    
    # Feature Engineering...
    df['day_of_week'] = df['date'].dt.dayofweek
    df['day_of_month'] = df['date'].dt.day
    df['month'] = df['date'].dt.month
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    for lag in [1, 2, 3, 7]:
        df[f'sales_lag_{lag}'] = df.groupby('product_id')['units_sold'].shift(lag)
    df['sales_rolling_mean_7'] = df.groupby('product_id')['units_sold'].shift(1).rolling(window=7, min_periods=1).mean()
    df = pd.get_dummies(df, columns=['weather_condition'], prefix='weather')

    df.dropna(inplace=True)
    print(f"Feature engineering complete. Training model on {len(df)} samples.")

    # --- V2.3 ROBUSTNESS CHECK ---
    if len(df) < 10: # Need at least a few samples to train
        print(f"❌ Error: Insufficient data ({len(df)} samples) to train the model after feature engineering. Please ensure the database has enough historical data.")
        return

    target = 'units_sold'
    features = [col for col in df.columns if col not in ['product_id', 'date', 'price_at_sale', target]]
    X = df[features]
    y = df[target]

    model = xgb.XGBRegressor(
        objective='reg:squarederror', n_estimators=1000, learning_rate=0.05,
        max_depth=5, subsample=0.8, colsample_bytree=0.8,
        early_stopping_rounds=50, random_state=42
    )

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    model.save_model('demand_forecast.json')
    with open('model_features.json', 'w') as f:
        import json
        json.dump(features, f)

    print("\n✅ Model trained and saved as 'demand_forecast.json'")
    print("✅ Feature list saved as 'model_features.json'")

if __name__ == '__main__':
    train_and_save_model()