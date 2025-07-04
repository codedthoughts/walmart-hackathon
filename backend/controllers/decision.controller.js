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
        const today = new Date(req.body.date || new Date());
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        console.log(`--- Starting Daily Process for Simulated Date: ${today.toISOString().split('T')[0]} ---`);

        // --- 1. Data Ingestion for ML Model ---
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(today.getDate() - 3);
        const salesData = await Sale.find({ date: { $gte: threeDaysAgo, $lt: today } }).lean();
        const weatherData = await Weather.findOne({ date: today }).lean(); 
        const products = await Product.find().lean();
        
        if (!weatherData) {
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

        // --- 3. "Why?" Engine & Decision Logic ---
        console.log("Running decision logic with 'Why?' Engine...");
        let alertsGenerated = 0;
        await Alert.updateMany({ status: 'pending' }, { status: 'ignored' }); // Mark old pending alerts as ignored

        for (const prediction of predictions) {
            const { product_id, predicted_units } = prediction;
            const productInfo = products.find(p => p.product_id === product_id);
            const productInventory = await Inventory.find({ product_id, quantity: { $gt: 0 } });
            const current_stock = productInventory.reduce((sum, item) => sum + item.quantity, 0);

            // UNDERSTOCK
            if (current_stock < predicted_units) {
                const safety_buffer = Math.ceil(predicted_units * 0.10); 
                const reorder_qty = Math.round(predicted_units) - current_stock + safety_buffer;
                // Build the "Why?" array
                const reason = [`Forecast Demand (${Math.round(predicted_units)}) > Current Stock (${current_stock})`];
                
                await Alert.create({
                    product_id, date: tomorrow, type: 'understock', action: 'reorder',
                    details: { current_stock, forecasted_demand: Math.round(predicted_units), recommended_qty: reorder_qty },
                    reason // Add the reason to the document
                });
                alertsGenerated++;
            }
            // OVERSTOCK
            else if (current_stock > predicted_units * 1.2) { 
                if (!productInfo.is_perishable) continue; 
                const oldestBatch = productInventory.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0];
                if (!oldestBatch || !oldestBatch.expiry_date) continue;
                const days_to_expiry = Math.ceil((new Date(oldestBatch.expiry_date) - today) / (1000 * 60 * 60 * 24));
                const markdown_trigger_days = Math.floor(productInfo.shelf_life_days / 2);

                if (days_to_expiry <= markdown_trigger_days) {
                    const basePrice = productInfo.selling_price;
                    const costPrice = productInfo.cost_price;
                    const urgency_factor = 1.0 - ((days_to_expiry - 1) / markdown_trigger_days);
                    const overstock_ratio = current_stock / (predicted_units + 1);
                    let discountPercentage = 0.15 + (0.50 * urgency_factor) + (0.25 * Math.log1p(overstock_ratio - 1));
                    let new_price = basePrice * (1 - discountPercentage);
                    if (new_price < costPrice && days_to_expiry > 1) { new_price = costPrice * 1.05; }
                    if (days_to_expiry <= 1) { new_price = costPrice * 0.90; }

                    // Build the "Why?" array
                    const reason = [
                        `High Stock Level (${current_stock} vs. Forecast ${Math.round(predicted_units)})`,
                        `Urgent: Nearing Expiry (${days_to_expiry} days left)`
                    ];
                    if (weatherData.precipitation_mm > 5) {
                        reason.push(`Low Demand Expected (Rainy Weather)`);
                    }

                    await Alert.create({
                        product_id, date: tomorrow, type: 'overstock', action: 'reduce-price',
                        details: { current_stock, forecasted_demand: Math.round(predicted_units), days_to_expiry, new_price: parseFloat(new_price.toFixed(2)), original_price: basePrice },
                        reason // Add the reason to the document
                    });
                    
                    await Inventory.updateMany({ product_id, batch_id: oldestBatch.batch_id }, { current_price: parseFloat(new_price.toFixed(2)) });
                    alertsGenerated++;
                } else {
                    // Build the "Why?" array
                    const reason = [`High Stock Level (${current_stock} vs. Forecast ${Math.round(predicted_units)})`, `Not Near Expiry (${days_to_expiry} days)`];
                    await Alert.create({
                        product_id, date: tomorrow, type: 'overstock', action: 'hold',
                        details: { current_stock, forecasted_demand: Math.round(predicted_units), days_to_expiry },
                        reason // Add the reason to the document
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

// Endpoint: GET /api/decision/alerts (No changes needed, but included for completeness)
exports.getAlerts = async (req, res) => {
    try {
        // Fetch all alerts to build history, sort by date descending
        const alerts = await Alert.find({}).sort({ date: -1 });
        res.status(200).json(alerts);
    } catch (error) {
        res.status(500).json({ message: "Error fetching alerts", error: error.message });
    }
}