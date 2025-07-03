const Product = require('../models/product.model');
const Inventory = require('../models/inventory.model');
const Sale = require('../models/sale.model');
const Weather = require('../models/weather.model');

// Endpoint: POST /api/sim/provider-supply (Inventory Provider)
exports.supplyFromProvider = async (req, res) => {
    const { product_id, quantity } = req.body;
    try {
        const product = await Product.findOne({ product_id });
        if (!product) return res.status(404).json({ message: "Product not found" });

        const newBatch = {
            product_id,
            quantity,
            current_price: product.selling_price,
            batch_id: `BATCH-${product_id}-${Date.now()}`,
            received_date: new Date(),
            expiry_date: product.is_perishable ? new Date(new Date().getTime() + product.shelf_life_days * 24 * 60 * 60 * 1000) : null,
        };

        const savedBatch = await Inventory.create(newBatch);
        res.status(201).json(savedBatch);
    } catch (error) {
        res.status(500).json({ message: "Error supplying inventory", error: error.message });
    }
};

// Endpoint: POST /api/sim/sales (Sales Generation)
exports.simulateDailySales = async (req, res) => {
    const { date } = req.body; // Expects a date string like "2025-07-05"
    const targetDate = new Date(date);
    targetDate.setHours(0,0,0,0);
    
    try {
        const products = await Product.find();
        // <<< FIX: Query weather using the 'targetDate' Date object, not a string.
        const weatherToday = await Weather.findOne({ date: targetDate });
        let salesDocs = [];
        let totalSalesValue = 0;

        for (const p of products) {
            let base_sales = p.category === 'Dairy' ? 20 : 15;
            if (targetDate.getDay() === 0 || targetDate.getDay() === 6) base_sales *= 1.5; 
            if (weatherToday && weatherToday.precipitation_mm > 5) base_sales *= 0.7; 
            
            const units_to_sell = Math.floor(base_sales * (0.8 + Math.random() * 0.4));
            
            let remaining_to_sell = units_to_sell;
            const inventory_batches = await Inventory.find({ product_id: p.product_id, quantity: { $gt: 0 } }).sort({ expiry_date: 1 });

            let price_at_sale = p.selling_price;
            for (const batch of inventory_batches) {
                if (remaining_to_sell <= 0) break;
                price_at_sale = batch.current_price;
                const sell_from_batch = Math.min(remaining_to_sell, batch.quantity);
                batch.quantity -= sell_from_batch;
                await batch.save();
                remaining_to_sell -= sell_from_batch;
            }
            const actual_units_sold = units_to_sell - remaining_to_sell;
            
            if(actual_units_sold > 0) {
                salesDocs.push({
                    product_id: p.product_id,
                    date: targetDate,
                    units_sold: actual_units_sold,
                    price_at_sale
                });
                totalSalesValue += actual_units_sold * price_at_sale;
            }
        }
        if (salesDocs.length > 0) {
            await Sale.insertMany(salesDocs);
        }
        res.status(201).json({ message: `Simulated ${salesDocs.length} sales records for ${date.split('T')[0]}. Total value: ${totalSalesValue.toFixed(2)}`});
    } catch (error) {
        res.status(500).json({ message: "Error simulating sales", error: error.message });
    }
};

exports.fetchDailyWeather = async (req, res) => {
    // Expects a date string like "2025-07-02T10:00:00.000Z" from the frontend
    const { date } = req.body;
    const targetDate = new Date(date);
    // Normalize date to the very beginning of the day to ensure consistency
    targetDate.setHours(0, 0, 0, 0);

    try {
        // Generate random weather for the day
        const temperature_c = 22 + Math.random() * 13; // Range: 22-35°C
        const precipitation_mm = Math.random() > 0.7 ? Math.random() * 25 : 0; // 30% chance of rain
        const weather_condition = precipitation_mm > 10 ? 'Storm' : (precipitation_mm > 0 ? 'Rainy' : 'Sunny');

        // Use findOneAndUpdate with upsert to create if not exists.
        // This is an atomic operation that prevents race conditions and duplicates.
        const weather = await Weather.findOneAndUpdate(
            { date: targetDate }, // The filter: find a document with this exact date.
            {
                // The `$setOnInsert` operator sets these values ONLY when a new document is created.
                // If a document for the day already exists, this part is ignored.
                $setOnInsert: {
                    date: targetDate,
                    temperature_c: parseFloat(temperature_c.toFixed(2)),
                    precipitation_mm: parseFloat(precipitation_mm.toFixed(2)),
                    weather_condition
                }
            },
            {
                upsert: true, // Key option: if no document is found, create one.
                new: true     // Key option: return the newly created (or found) document.
            }
        );

        res.status(201).json({ message: `Weather for ${targetDate.toISOString().split('T')[0]} fetched/verified.`, data: weather });

    } catch (error) {
        console.error("Error in fetchDailyWeather:", error);
        res.status(500).json({ message: "Error fetching weather", error: error.message });
    }
};