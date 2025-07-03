import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


const API_URL = 'http://localhost:5001/api';

const Dashboard = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    // Add more state for metrics and charts
    
    const fetchAlerts = async () => {
        try {
            const res = await axios.get(`${API_URL}/decision/alerts`);
            setAlerts(res.data);
        } catch (error) {
            console.error("Failed to fetch alerts", error);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    // Replace the entire handleRunProcess function in Dashboard.js

const handleRunProcess = async () => {
    setLoading(true);
    const todayISO = new Date().toISOString();

    try {
        // --- STEP 1: FETCH TODAY'S WEATHER ---
        setMessage('Step 1/3: Fetching today\'s weather data...');
        await axios.post(`${API_URL}/sim/weather`, { date: todayISO });

        // --- STEP 2: SIMULATE TODAY'S SALES ---
        setMessage('Step 2/3: Simulating today\'s sales based on weather and patterns...');
        await axios.post(`${API_URL}/sim/sales`, { date: todayISO });
        
        // --- STEP 3: RUN FORECAST AND DECISION ENGINE ---
        setMessage('Step 3/3: Running forecast and decision engine...');
        const response = await axios.post(`${API_URL}/decision/run-daily-process`);
        
        // --- COMPLETE ---
        setMessage(`✅ Process Complete: ${response.data.message}`);
        fetchAlerts(); // Refresh the alerts table

    } catch (error) {
        const errorMsg = error.response ? error.response.data.message : error.message;
        setMessage(`❌ Error: ${errorMsg}`);
    } finally {
        setLoading(false);
    }
};
    
    const getAlertColor = (type) => type === 'understock' ? 'orange' : 'lightblue';
    const getActionText = (alert) => {
        switch (alert.action) {
            case 'reorder': return `Reorder ${alert.details.recommended_qty} units`;
            case 'reduce-price': return `Markdown to $${alert.details.new_price.toFixed(2)} (Expires in ${alert.details.days_to_expiry} days)`;
            case 'hold': return `Hold stock (Expires in ${alert.details.days_to_expiry} days)`;
            default: return '';
        }
    };

    return (
        <div className="dashboard">
            <div className="controls">
                <h2>System Controls</h2>
                <button onClick={handleRunProcess} disabled={loading}>
                    {loading ? 'Processing...' : '▶️ Run Full Daily Cycle'}
                </button>
                {message && <p className="message">{message}</p>}
            </div>

            <div className="alerts-container">
                <h2>Today's Generated Alerts</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Type</th>
                            <th>Recommended Action</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alerts.length > 0 ? alerts.map(alert => (
                            <tr key={alert._id} style={{ backgroundColor: getAlertColor(alert.type)}}>
                                <td>{alert.product_id}</td>
                                <td>{alert.type.toUpperCase()}</td>
                                <td><strong>{getActionText(alert)}</strong></td>
                                <td>Forecast: {alert.details.forecasted_demand}, Stock: {alert.details.current_stock}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="4">No pending alerts.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Metrics Cards and Charts here */}
        </div>
    );
};

export default Dashboard;