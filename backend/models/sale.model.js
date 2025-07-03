const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    product_id: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    units_sold: Number,
    price_at_sale: Number,
}, { timestamps: true });
module.exports = mongoose.model('Sale', schema);