const Product = require('../models/product.model');
const Sale = require('../models/sale.model');
const Inventory = require('../models/inventory.model');
const Weather = require('../models/weather.model');
const Alert = require('../models/alert.model');
const mongoose = require('mongoose');

// GET /api/dashboard/kpis
exports.getKpis = async (req, res) => {
    try {
        // 1. Spoilage Loss Avoided & Profit from Dynamic Pricing
        const markdownSales = await Sale.aggregate([
            { $lookup: { from: 'products', localField: 'product_id', foreignField: 'product_id', as: 'product_info' } },
            { $unwind: '$product_info' },
            { $match: { $expr: { $lt: ['$price_at_sale', '$product_info.selling_price'] } } },
            { $group: {
                _id: null,
                total_loss_avoided: { $sum: { $multiply: ['$units_sold', '$product_info.cost_price'] } },
                total_markdown_profit: { $sum: { $multiply: ['$units_sold', { $subtract: ['$price_at_sale', '$product_info.cost_price'] }] } }
            }}
        ]);

        // 2. Total Reorders Triggered
        const reordersTriggered = await Alert.countDocuments({ action: 'reorder' });

        const kpis = {
            loss_avoided: markdownSales.length > 0 ? markdownSales[0].total_loss_avoided : 0,
            markdown_profit: markdownSales.length > 0 ? markdownSales[0].total_markdown_profit : 0,
            reorders_triggered: reordersTriggered
        };

        res.status(200).json(kpis);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching KPIs', error: error.message });
    }
};

// GET /api/dashboard/data
exports.getDashboardData = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0,0,0,0);

        const inventory = await Inventory.find({ quantity: { $gt: 0 } }).sort({ product_id: 1 }).lean();
        const todays_sales = await Sale.find({ date: today }).sort({ product_id: 1 }).lean();
        const latest_weather = await Weather.findOne().sort({ date: -1 });

        res.status(200).json({ inventory, todays_sales, latest_weather });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
    }
};