const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboard.controller');

router.get('/kpis', controller.getKpis);
router.get('/data', controller.getDashboardData);

module.exports = router;