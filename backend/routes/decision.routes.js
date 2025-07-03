const express = require('express');
const router = express.Router();
const controller = require('../controllers/decision.controller');

router.post('/run-daily-process', controller.runDailyProcess);
router.get('/alerts', controller.getAlerts);

module.exports = router;