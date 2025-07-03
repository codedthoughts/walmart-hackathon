const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    product_id: { type: String, required: true, index: true },
    quantity: { type: Number, required: true },
    received_date: { type: Date, default: Date.now },
    expiry_date: Date,
    current_price: Number,
    batch_id: { type: String, required: true, unique: true },
}, { timestamps: true });
module.exports = mongoose.model('Inventory', schema);