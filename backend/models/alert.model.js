const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    product_id: { type: String, required: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ['understock', 'overstock'] },
    action: { type: String, enum: ['reorder', 'reduce-price', 'hold'] },
    details: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ['pending', 'executed', 'ignored'], default: 'pending' },
    reason: { type: [String], default: [] }, // An array of strings explaining the decision
}, { timestamps: true });
module.exports = mongoose.model('Alert', schema);