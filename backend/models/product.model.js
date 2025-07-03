const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    product_id: { type: String, required: true, unique: true, index: true },
    name: String,
    category: String,
    selling_price: Number,
    cost_price: Number,
    is_perishable: Boolean,
    shelf_life_days: Number,
    unit: String,
    image_url: String,
}, { timestamps: true });
module.exports = mongoose.model('Product', schema);