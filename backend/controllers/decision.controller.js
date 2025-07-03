const axios = require('axios');
const Sale = require('../models/sale.model');
const Inventory = require('../models/inventory.model');
const Weather = require('../models/weather.model');
const Forecast = require('../models/forecast.model');
const Alert = require('../models/alert.model');
const Product = require('../models/product.model');

// Endpoint: POST /api/decision/run-daily-process
exports.runDailyProcess = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        console.log("--- Starting Daily Process ---");

        // --- 1. Data Ingestion for ML Model ---
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(today.getDate() - 3);

        const salesData = await Sale.find({ date: { $gte: threeDaysAgo, $lt: today } }).lean();
        const inventoryData = await Inventory.find({ quantity: { $gt: 0 } }).lean();
        
        // <<< FIX: Query weather using the 'today' Date object, not a string.
        const weatherData = await Weather.findOne({ date: today }).lean(); 
        const products = await Product.find().lean();
        
        if (!weatherData) {
            // This error message is now correctly triggered only if the weather record truly doesn't exist.
            return res.status(400).json({ message: `Weather data for today (${today.toISOString().split('T')[0]}) not found. Please fetch it first.` });
        }

        // --- 2. Call Forecasting Model ---
        console.log("Calling ML service for forecasting...");
        const forecastResponse = await axios.post(process.env.ML_SERVICE_URL, {
            sales_history: salesData,
            weather_forecast: weatherData,
            products: products 
        });
        const predictions = forecastResponse.data;

        // Save forecast to DB
        const forecastDocs = predictions.map(p => ({
            product_id: p.product_id,
            predicted_units: Math.round(p.predicted_units),
            date: tomorrow, 
        }));
        await Forecast.deleteMany({ date: tomorrow });
        await Forecast.insertMany(forecastDocs);
        console.log(`Saved ${forecastDocs.length} forecasts for ${tomorrow.toISOString().split('T')[0]}`);

        // --- 3. Decision Logic ---
        console.log("Running decision logic...");
        let alertsGenerated = 0;
        for (const prediction of predictions) {
            const { product_id, predicted_units } = prediction;
            const productInfo = products.find(p => p.product_id === product_id);

            const productInventory = await Inventory.find({ product_id, quantity: { $gt: 0 } });
            const current_stock = productInventory.reduce((sum, item) => sum + item.quantity, 0);

            // UNDERSTOCK
            if (current_stock < predicted_units) {
                const safety_buffer = Math.ceil(predicted_units * 0.10); 
                const reorder_qty = Math.round(predicted_units) - current_stock + safety_buffer;
                
                await Alert.create({
                    product_id, date: tomorrow, type: 'understock', action: 'reorder',
                    details: { current_stock, forecasted_demand: Math.round(predicted_units), recommended_qty: reorder_qty },
                });
                alertsGenerated++;
            }
            // OVERSTOCK
            else if (current_stock > predicted_units * 1.2) { 
                if (!productInfo.is_perishable) continue; 

                const oldestBatch = productInventory.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0];
                if (!oldestBatch || !oldestBatch.expiry_date) continue;

                const days_to_expiry = Math.ceil((new Date(oldestBatch.expiry_date) - today) / (1000 * 60 * 60 * 24));
                
                // --- V2.0 Advanced Price Optimization ---
                // Trigger markdown if shelf life is less than halfway through.
                const markdown_trigger_days = Math.floor(productInfo.shelf_life_days / 2);

                if (days_to_expiry <= markdown_trigger_days) {
                    const basePrice = productInfo.selling_price;
                    const costPrice = productInfo.cost_price;
                    
                    // Factor 1: How close is it to expiring? (0.0 to 1.0)
                    // 1.0 means it expires today, 0.0 means it just entered the markdown window.
                    const urgency_factor = 1.0 - ((days_to_expiry - 1) / markdown_trigger_days);

                    // Factor 2: How severe is the overstock?
                    const overstock_ratio = current_stock / (predicted_units + 1); // +1 to avoid division by zero
                    
                    // Dynamic Discount Calculation:
                    // Base discount of 15% just for entering the window.
                    // Add up to 50% more based on urgency.
                    // Add up to 25% more based on overstock severity.
                    let discountPercentage = 0.15 + (0.50 * urgency_factor) + (0.25 * Math.log1p(overstock_ratio - 1));
                    
                    let new_price = basePrice * (1 - discountPercentage);

                    // Loss prevention: Never sell below cost unless it expires tomorrow.
                    if (new_price < costPrice && days_to_expiry > 1) {
                        new_price = costPrice * 1.05; // Sell at 5% above cost as a floor
                    }
                    if (days_to_expiry <= 1) {
                        new_price = costPrice * 0.90; // If it expires today/tomorrow, sell at 10% below cost to minimize loss.
                    }

                    await Alert.create({
                        product_id, date: tomorrow, type: 'overstock', action: 'reduce-price',
                        details: { current_stock, forecasted_demand: Math.round(predicted_units), days_to_expiry, new_price: parseFloat(new_price.toFixed(2)), original_price: basePrice }
                    });
                    
                    await Inventory.updateMany({ product_id, expiry_date: { $lte: oldestBatch.expiry_date } }, { current_price: parseFloat(new_price.toFixed(2)) });
                    alertsGenerated++;
                } else {
                     await Alert.create({
                        product_id, date: tomorrow, type: 'overstock', action: 'hold',
                        details: { current_stock, forecasted_demand: Math.round(predicted_units), days_to_expiry }
                    });
                    alertsGenerated++;
                }
            }
        }
        res.status(200).json({ message: `Daily process completed. ${alertsGenerated} alerts generated for ${tomorrow.toISOString().split('T')[0]}.` });
    } catch (error) {
        console.error("Error in daily process:", error.response ? error.response.data : error.message);
        res.status(500).json({ message: "An error occurred during the daily process." });
    }
};

// Endpoint: GET /api/decision/alerts
exports.getAlerts = async (req, res) => {
    try {
        const { date } = req.query; 
        const query = date ? { date: new Date(date) } : { status: 'pending' };
        const alerts = await Alert.find(query).sort({ createdAt: -1 });
        res.status(200).json(alerts);
    } catch (error) {
        res.status(500).json({ message: "Error fetching alerts", error: error.message });
    }
}