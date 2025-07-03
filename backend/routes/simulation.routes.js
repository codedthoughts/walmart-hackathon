const express = require('express');
const router = express.Router();
const controller = require('../controllers/simulation.controller');

router.post('/provider-supply', controller.supplyFromProvider);
router.post('/sales', controller.simulateDailySales);
router.post('/weather', controller.fetchDailyWeather);

module.exports = router;