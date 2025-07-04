/**
 * =================================================================================
 * WALMART SPARKATHON - V4.0 FINAL CORRECTED SEEDER
 * =================================================================================
 *
 * This version definitively corrects the repeated error where the sales data
 * generation loop was missing. It is complete and tested.
 * It will correctly populate both the weather and sales collections with 180 days
 * of rich, historical data and set up the three required demo scenarios.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('./models/product.model');
const Sale = require('./models/sale.model');
const Weather = require('./models/weather.model');
const Inventory = require('./models/inventory.model');
const Alert = require('./models/alert.model');
const Forecast = require('./models/forecast.model');

dotenv.config();

const productsData = [
    { product_id: "PROD001", name: "Fresh Milk 1L", category: "Dairy", selling_price: 50.0, cost_price: 30.0, is_perishable: true, shelf_life_days: 7, base_daily_sales: 30, weight_kg: 1.0, co2_factor: 1.5 },
    { product_id: "PROD002", name: "Whole Wheat Bread", category: "Bakery", selling_price: 40.0, cost_price: 25.0, is_perishable: true, shelf_life_days: 4, base_daily_sales: 25, weight_kg: 0.5, co2_factor: 0.8 },
    { product_id: "PROD003", name: "Cheddar Cheese 200g", category: "Dairy", selling_price: 150.0, cost_price: 100.0, is_perishable: true, shelf_life_days: 30, base_daily_sales: 10, weight_kg: 0.2, co2_factor: 5.4 },
    { product_id: "PROD004", name: "Cola 2L", category: "Beverages", selling_price: 90.0, cost_price: 60.0, is_perishable: false, shelf_life_days: 365, base_daily_sales: 40, weight_kg: 2.0, co2_factor: 0.5 },
    { product_id: "PROD005", name: "Lays Chips Classic", category: "Snacks", selling_price: 20.0, cost_price: 12.0, is_perishable: false, shelf_life_days: 180, base_daily_sales: 50, weight_kg: 0.1, co2_factor: 0.7 },
    { product_id: "PROD006", name: "Fresh Apples 1kg", category: "Produce", selling_price: 120.0, cost_price: 80.0, is_perishable: true, shelf_life_days: 10, base_daily_sales: 15, weight_kg: 1.0, co2_factor: 0.4 },
    { product_id: "PROD007", name: "Detergent 1kg", category: "Household", selling_price: 250.0, cost_price: 180.0, is_perishable: false, shelf_life_days: 730, base_daily_sales: 8, weight_kg: 1.0, co2_factor: 3.0 },
];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected for V4.0 FINAL seeding.");

        console.log("Wiping all existing data...");
        await Promise.all([ Product.deleteMany({}), Sale.deleteMany({}), Weather.deleteMany({}), Inventory.deleteMany({}), Alert.deleteMany({}), Forecast.deleteMany({}) ]);
        console.log("Data wiped successfully.");

        console.log("Seeding master product list...");
        await Product.insertMany(productsData);
        console.log("Products seeded.");

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        console.log(`Using today's date as anchor: ${today.toISOString().split('T')[0]}`);

        console.log("Generating 180 days of historical data relative to today...");
        const salesToInsert = [];
        const weatherToInsert = [];

        for (let i = 180; i >= 1; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dayOfWeek = date.getDay();
            const temperature_c = 22 + Math.random() * 13;
            const precipitation_mm = Math.random() > 0.7 ? Math.random() * 25 : 0;
            const weather_condition = precipitation_mm > 10 ? 'Storm' : (precipitation_mm > 0 ? 'Rainy' : 'Sunny');
            weatherToInsert.push({ date, temperature_c, precipitation_mm, weather_condition });

            for (const p of productsData) {
                let units_sold = p.base_daily_sales;
                if (dayOfWeek === 0 || dayOfWeek === 6) { units_sold *= (p.category === 'Snacks' || p.category === 'Beverages') ? 1.8 : 1.3; }
                if (temperature_c > 30 && p.category === 'Beverages') { units_sold *= 1.5; }
                if (weather_condition !== 'Sunny') { units_sold *= 0.75; }
                units_sold *= (0.8 + Math.random() * 0.4);
                salesToInsert.push({ product_id: p.product_id, date, units_sold: Math.max(0, Math.floor(units_sold)), price_at_sale: p.selling_price });
            }
        }
        await Weather.insertMany(weatherToInsert);
        await Sale.insertMany(salesToInsert);
        console.log(`✅ Generated ${weatherToInsert.length} weather records and ${salesToInsert.length} sales records.`);

        console.log("Engineering inventory for a perfect live demo...");
        const inventoryToInsert = [];
        for (const p of productsData) {
            let initialQuantity;
            let expiry_date;
            if (p.product_id === 'PROD002') {
                console.log('  -> Scenario 1: OVERSTOCK + NEAR EXPIRY (will trigger MARKDOWN)');
                initialQuantity = Math.floor(p.base_daily_sales * 10);
                expiry_date = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
            } else if (p.product_id === 'PROD003') {
                console.log('  -> Scenario 2: OVERSTOCK + NOT NEAR EXPIRY (will trigger HOLD)');
                initialQuantity = Math.floor(p.base_daily_sales * 15);
                expiry_date = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000);
            } else if (p.product_id === 'PROD006') {
                console.log('  -> Scenario 3: UNDERSTOCK (will trigger REORDER)');
                initialQuantity = Math.floor(p.base_daily_sales * 0.5);
                expiry_date = new Date(today.getTime() + p.shelf_life_days * 24 * 60 * 60 * 1000);
            } else {
                initialQuantity = Math.floor(p.base_daily_sales * (2 + Math.random() * 2));
                expiry_date = p.is_perishable ? new Date(today.getTime() + p.shelf_life_days * 24 * 60 * 60 * 1000) : null;
            }
            if (initialQuantity > 0) {
              inventoryToInsert.push({ product_id: p.product_id, quantity: initialQuantity, current_price: p.selling_price, batch_id: `BATCH-${p.product_id}-INITIAL-${Math.random()}`, received_date: new Date(), expiry_date });
            }
        }
        await Inventory.insertMany(inventoryToInsert);
        console.log(`✅ Created initial stock for ${inventoryToInsert.length} products.`);
        console.log("\n✅ V4.0 Database seeding complete! You are ready for a perfect demo.");
    } catch (err) {
        console.error("❌ Seeding error:", err);
    } finally {
        mongoose.connection.close();
    }
};

seedDB();

module.exports = seedDB;
