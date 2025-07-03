const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    product_id: { type: String, required: true },
    date: { type: Date, required: true }, // The date for which the forecast is made
    predicted_units: Number,
    model_version: { type: String, default: 'v1.0' },
}, { timestamps: true, index: { fields: { product_id: 1, date: 1 }, unique: true } });
module.exports = mongoose.model('Forecast', schema);