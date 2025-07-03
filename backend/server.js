const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const decisionController = require('./controllers/decision.controller');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// --- DB Connection ---
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected successfully"))
    .catch(err => console.error("MongoDB connection error:", err));

// --- API Routes ---
app.use('/api/sim', require('./routes/simulation.routes'));
app.use('/api/decision', require('./routes/decision.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));

// --- Automation with Cron Job ---
// This will run the process every day at 1 AM.
cron.schedule('0 1 * * *', () => {
    console.log('--- Running automated daily process via cron job ---');
    // We pass mock req/res objects to the controller function
    decisionController.runDailyProcess({}, { status: () => ({ json: (d) => console.log(d) }) });
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));