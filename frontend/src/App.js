import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:5001/api';

// --- Reusable Components ---
const KpiCard = ({ value, label }) => (
    <div className="grid-card kpi-card">
        <div className="value">{value}</div>
        <div className="label">{label}</div>
    </div>
);

const ControlsCard = ({ onRunCycle, onRestock, loading, message, messageType }) => (
    <div className="grid-card controls-card">
        <h2>System Controls</h2>
        <button className="button-primary" onClick={onRunCycle} disabled={loading}>
            {loading ? 'Processing...' : '▶️ Run Full Daily Cycle'}
        </button>
        <button className="button-primary" onClick={onRestock} disabled={loading}>
            📦 Receive Emergency Stock (PROD002)
        </button>
        {message && <p className={`message ${messageType}`}>{message}</p>}
    </div>
);


// <<< FIX IS HERE: A new helper function to safely render the alert text >>>
const getActionText = (alert) => {
    switch (alert.action) {
        case 'reorder':
            // Safely access recommended_qty
            return `Reorder ${alert.details.recommended_qty || 0} units`;
        case 'reduce-price':
            // Safely access new_price and use toFixed only if it exists
            const price = alert.details.new_price;
            return `Markdown to $${typeof price === 'number' ? price.toFixed(2) : 'N/A'}`;
        case 'hold':
            // Display a message for the 'hold' action
            return `Hold Stock (Not expiring soon)`;
        default:
            // Fallback for any unknown action type
            return 'No action specified';
    }
};

const AlertsCard = ({ alerts }) => (
    <div className="grid-card alerts-card">
        <h2>Actionable Alerts</h2>
        <table>
            <thead><tr><th>Product</th><th>Type</th><th>Recommended Action</th><th>Details</th></tr></thead>
            <tbody>
                {alerts.length > 0 ? alerts.map(alert => (
                    <tr key={alert._id}>
                        <td>{alert.product_id}</td>
                        <td style={{ color: alert.type === 'UNDERSTOCK' ? '#f57c00' : '#1e88e5', fontWeight: 'bold' }}>{alert.type}</td>
                        {/* Use the new safe helper function here */}
                        <td><strong>{getActionText(alert)}</strong></td>
                        <td>Forecast: {alert.details.forecasted_demand}, Stock: {alert.details.current_stock}</td>
                    </tr>
                )) : <tr><td colSpan="4">No alerts generated yet. Run a daily cycle.</td></tr>}
            </tbody>
        </table>
    </div>
);

// --- Main App Component ---
function App() {
    const [kpis, setKpis] = useState({ loss_avoided: 0, markdown_profit: 0, reorders_triggered: 0 });
    const [alerts, setAlerts] = useState([]);
    const [dashboardData, setDashboardData] = useState({ inventory: [], todays_sales: [], latest_weather: null });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('success');

    const fetchData = async () => {
        try {
            const [kpiRes, dataRes, alertsRes] = await Promise.all([
                axios.get(`${API_URL}/dashboard/kpis`),
                axios.get(`${API_URL}/dashboard/data`),
                axios.get(`${API_URL}/decision/alerts?status=pending`) // Fetch only pending alerts
            ]);
            setKpis(kpiRes.data);
            setDashboardData(dataRes.data);
            setAlerts(alertsRes.data);
        } catch (error) {
            console.error("Failed to fetch initial data", error);
            setMessage('Failed to load dashboard data. Is the server running?');
            setMessageType('error');
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRunCycle = async () => {
        setLoading(true);
        const todayISO = new Date().toISOString();
        try {
            setMessage('Step 1/3: Fetching today\'s weather...'); setMessageType('success');
            await axios.post(`${API_URL}/sim/weather`, { date: todayISO });

            setMessage('Step 2/3: Simulating today\'s sales...');
            await axios.post(`${API_URL}/sim/sales`, { date: todayISO });

            setMessage('Step 3/3: Running forecast & decision engine...');
            const response = await axios.post(`${API_URL}/decision/run-daily-process`);

            setMessage(`✅ Cycle Complete: ${response.data.message}`);
            await fetchData(); // Refresh all data on dashboard
        } catch (error) {
            const errorMsg = error.response ? error.response.data.message : "An unexpected error occurred.";
            setMessage(`❌ Error: ${errorMsg}`);
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };
    
    const handleRestock = async () => {
        setLoading(true);
        try {
            setMessage('Receiving large stock for PROD002 to demonstrate overstock...');
            setMessageType('success');
            await axios.post(`${API_URL}/sim/provider-supply`, { product_id: 'PROD002', quantity: 200 });
            await fetchData(); // Refresh inventory table
            setMessage('✅ Emergency stock received for PROD002. Run the daily cycle to see overstock alerts.');
        } catch (error) {
             setMessage('❌ Failed to receive stock.'); setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="App">
            <header className="App-header"><h1>Dynamic Inventory & Pricing Optimization</h1></header>
            <main>
                <div className="dashboard-grid">
                    <div className="kpi-container">
                        <KpiCard value={`$${kpis.loss_avoided.toFixed(2)}`} label="Spoilage Loss Avoided" />
                        <KpiCard value={`$${kpis.markdown_profit.toFixed(2)}`} label="Profit from Dynamic Pricing" />
                        <KpiCard value={kpis.reorders_triggered} label="Automated Reorders Triggered" />
                    </div>
                    <ControlsCard onRunCycle={handleRunCycle} onRestock={handleRestock} loading={loading} message={message} messageType={messageType} />
                    <div className="grid-card weather-card">
                        <h2>Today's Conditions</h2>
                        {dashboardData.latest_weather ? (
                            <div>
                                <p><strong>Condition:</strong> {dashboardData.latest_weather.weather_condition}</p>
                                <p><strong>Temperature:</strong> {dashboardData.latest_weather.temperature_c}°C</p>
                                <p><strong>Precipitation:</strong> {dashboardData.latest_weather.precipitation_mm}mm</p>
                            </div>
                        ) : <p>No weather data available.</p>}
                    </div>
                    <AlertsCard alerts={alerts} />
                    <div className="grid-card inventory-card">
                        <h2>Current Inventory</h2>
                        <table>
                             <thead><tr><th>Product</th><th>Quantity</th><th>Price</th></tr></thead>
                             <tbody>
                                {dashboardData.inventory.map(item => <tr key={item._id}><td>{item.product_id}</td><td>{item.quantity}</td><td>${item.current_price.toFixed(2)}</td></tr>)}
                             </tbody>
                        </table>
                    </div>
                     <div className="grid-card sales-card">
                        <h2>Today's Sales</h2>
                         <table>
                             <thead><tr><th>Product</th><th>Units Sold</th><th>Price</th></tr></thead>
                             <tbody>
                                {dashboardData.todays_sales.length > 0 ? dashboardData.todays_sales.map(item => <tr key={item._id}><td>{item.product_id}</td><td>{item.units_sold}</td><td>${item.price_at_sale.toFixed(2)}</td></tr>) : <tr><td colSpan="3">No sales recorded for today yet.</td></tr>}
                             </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;