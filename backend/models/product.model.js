const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    product_id: { type: String, required: true, unique: true, index: true },
    name: String,
    category: String,
    selling_price: Number,
    cost_price: Number,
    is_perishable: Boolean,
    shelf_life_days: Number,
    weight_kg: { type: Number, default: 0.5 },
    co2_factor: { type: Number, default: 2.5 },
    unit: String,
    image_url: String,
}, { timestamps: true });
module.exports = mongoose.model('Product', schema);