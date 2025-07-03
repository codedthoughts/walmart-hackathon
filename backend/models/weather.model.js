const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    date: { type: Date, required: true, unique: true },
    temperature_c: Number,
    precipitation_mm: Number,
    weather_condition: String,
}, { timestamps: true });
module.exports = mongoose.model('Weather', schema);