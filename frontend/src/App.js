import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:5001/api';

// --- Reusable Components ---
const KpiCard = ({ value, label, icon }) => (
    <div className="grid-card kpi-card">
        <div className="value">{icon} {value}</div>
        <div className="label">{label}</div>
    </div>
);

const NotificationBanner = ({ message, type }) => {
    if (!message) return null;
    return <div className={`notification-banner ${type}`}>{message}</div>;
};

const ControlsCard = ({ onRunCycle, loading, dayCounter }) => (
    <div className="grid-card controls-card">
        <button className="button-primary" onClick={onRunCycle} disabled={loading}>
            {loading ? `Simulating Day ${dayCounter}...` : `▶️ Run Cycle for Day ${dayCounter}`}
        </button>
    </div>
);

// --- Helper Functions for Alert Rendering ---
const getAlertClassName = (alert) => `alert-row-${alert.type.toLowerCase()}-${alert.action.toLowerCase()}`;

const getActionText = (alert) => {
    switch (alert.action) {
        case 'reorder':
            return `Reorder ${alert.details.recommended_qty || 0} units`;
        case 'reduce-price':
            const price = alert.details.new_price;
            return `Markdown to $${typeof price === 'number' ? price.toFixed(2) : 'N/A'}`;
        case 'hold':
            return 'Hold Stock';
        default:
            return 'No action specified';
    }
};

// --- Data Table Components ---
const AlertsCard = ({ alerts, pulsate }) => {
    const groupedAlerts = alerts.reduce((acc, alert) => {
        const date = new Date(alert.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (!acc[date]) acc[date] = [];
        acc[date].push(alert);
        return acc;
    }, {});
    const sortedDates = Object.keys(groupedAlerts).sort((a, b) => new Date(b) - new Date(a));

    return (
        <div className={`grid-card alerts-card ${pulsate === 'alerts' ? 'pulsate' : ''}`}>
            <h2>Actionable Alerts (Manager's Co-Pilot)</h2>
            {sortedDates.length > 0 ? sortedDates.map(date => (
                <div key={date}>
                    <h3 style={{ padding: '10px 0', backgroundColor: '#f0f2f5', textAlign: 'center', borderRadius: '4px', margin: '1rem 0' }}>
                        Alerts Generated for {date}
                    </h3>
                    <table>
                        {/* <<< CHANGE: ADDED "REASON (WHY?)" HEADER >>> */}
                        <thead><tr><th>Product</th><th>Type</th><th>Recommended Action</th><th>Reason (Why?)</th><th>Details</th></tr></thead>
                        <tbody>
                            {groupedAlerts[date].map(alert => (
                                <tr key={alert._id} className={getAlertClassName(alert)}>
                                    <td>{alert.product_id}</td>
                                    <td style={{ fontWeight: 'bold' }}>{alert.type.toUpperCase()}</td>
                                    <td><strong>{getActionText(alert)}</strong></td>
                                    {/* <<< CHANGE: RENDER THE LIST OF REASONS >>> */}
                                    <td className="reason-cell">
                                        <ul>
                                            {(alert.reason || []).map((r, i) => <li key={i}>{r}</li>)}
                                        </ul>
                                    </td>
                                    <td>Forecast: {alert.details.forecasted_demand}, Stock: {alert.details.current_stock}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )) : <p>No alerts generated yet. Run a daily cycle.</p>}
        </div>
    );
};

const InventoryCard = ({ inventory, pulsate }) => (
     <div className={`grid-card inventory-card ${pulsate === 'inventory' ? 'pulsate' : ''}`}>
        <h2>Current Store Inventory</h2>
        <table>
            <thead><tr><th>Product ID</th><th>Quantity</th><th>Current Price</th></tr></thead>
            <tbody>
                {inventory.map(item => <tr key={item._id}><td>{item.product_id}</td><td>{item.quantity}</td><td>${(item.current_price || 0).toFixed(2)}</td></tr>)}
            </tbody>
        </table>
    </div>
);

const SalesCard = ({ sales, pulsate }) => (
    <div className={`grid-card sales-card ${pulsate === 'sales' ? 'pulsate' : ''}`}>
        <h2>Today's Simulated Sales</h2>
        <table>
            <thead><tr><th>Product ID</th><th>Units Sold</th><th>Price at Sale</th></tr></thead>
            <tbody>
                {sales.length > 0 ? sales.map(item => <tr key={item._id}><td>{item.product_id}</td><td>{item.units_sold}</td><td>${(item.price_at_sale || 0).toFixed(2)}</td></tr>) : <tr><td colSpan="3">No sales recorded for today yet.</td></tr>}
            </tbody>
        </table>
    </div>
);


// --- Main App Component ---
function App() {
    const [kpis, setKpis] = useState({ loss_avoided: 0, markdown_profit: 0, reorders_triggered: 0, waste_avoided_kg: 0, co2_saved_kg: 0 });
    const [alerts, setAlerts] = useState([]);
    const [dashboardData, setDashboardData] = useState({ inventory: [], todays_sales: [], latest_weather: null });
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: 'info', key: 0 });
    const [pulsate, setPulsate] = useState('');
    const [dayCounter, setDayCounter] = useState(1);

    const [simulationStartDate] = useState(new Date());

    const showNotification = (message, type = 'info', duration = 3000) => {
        setNotification(prev => ({ message, type, key: prev.key + 1 }));
    };
    
    const triggerPulse = (cardName) => {
        setPulsate(cardName);
        setTimeout(() => setPulsate(''), 1000);
    };

    const fetchData = async () => {
        try {
            const [kpiRes, dataRes, alertsRes] = await Promise.all([
                axios.get(`${API_URL}/dashboard/kpis`),
                axios.get(`${API_URL}/dashboard/data`),
                axios.get(`${API_URL}/decision/alerts`)
            ]);
            setKpis(kpiRes.data);
            triggerPulse('kpis');
            setDashboardData(dataRes.data);
            setAlerts(alertsRes.data);
        } catch (error) { 
            console.error("Failed to fetch data", error);
            showNotification('Error: Could not fetch data from server.', 'error', 5000);
        }
    };
    // eslint-disable-next-line
    useEffect(() => { fetchData(); }, []);

    const handleRunCycle = async () => {
        setLoading(true);
        const cycleDate = new Date(simulationStartDate);
        cycleDate.setDate(simulationStartDate.getDate() + dayCounter - 1);
        const cycleDateISO = cycleDate.toISOString();

        try {
            showNotification(`Simulating Day ${dayCounter}: Ingesting Weather Data...`, 'info');
            await axios.post(`${API_URL}/sim/weather`, { date: cycleDateISO });
            await new Promise(res => setTimeout(res, 1500)); 

            showNotification(`Simulating Day ${dayCounter}: Processing Customer Sales...`, 'info');
            await axios.post(`${API_URL}/sim/sales`, { date: cycleDateISO });
            triggerPulse('sales');
            triggerPulse('inventory');
            await new Promise(res => setTimeout(res, 1500));

            showNotification('🧠 Running Forecast & Price Optimization Engine...', 'info');
            // eslint-disable-next-line
            const response = await axios.post(`${API_URL}/decision/run-daily-process`, { date: cycleDateISO });
            
            showNotification(`✅ Cycle for Day ${dayCounter} Complete!`, 'success');
            await fetchData(); 
            triggerPulse('alerts');
            setDayCounter(prevDay => prevDay + 1);

        } catch (error) {
            const errorMsg = error.response ? error.response.data.message : "An unexpected error occurred.";
            showNotification(`❌ Error: ${errorMsg}`, 'error', 5000);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="App">
            <NotificationBanner key={notification.key} message={notification.message} type={notification.type} />
            <header className="App-header">
                <h1>Store-Level Optimization Dashboard</h1>
                <span>A lightweight, plug-and-play engine for profit & sustainability</span>
            </header>
            <main>
                <div className="dashboard-grid">
                    <div className={`grid-card kpi-section ${pulsate === 'kpis' ? 'pulsate' : ''}`}>
                        <h2>Key Performance Indicators (Cumulative)</h2>
                        <div className="kpi-container">
                            <KpiCard value={`$${kpis.loss_avoided.toFixed(2)}`} label="Spoilage Loss Avoided" icon="🛡️" />
                            <KpiCard value={`$${kpis.markdown_profit.toFixed(2)}`} label="Dynamic Pricing Profit" icon="📈" />
                            <KpiCard value={kpis.reorders_triggered} label="Pending Reorders" icon="🔄" />
                        </div>
                    </div>
                    <div className={`grid-card kpi-section ${pulsate === 'kpis' ? 'pulsate' : ''}`}>
                         <h2>Sustainability Impact (Cumulative)</h2>
                        <div className="kpi-container">
                             <KpiCard value={`${kpis.waste_avoided_kg.toFixed(2)} kg`} label="Food Waste Avoided" icon="♻️" />
                             <KpiCard value={`${kpis.co2_saved_kg.toFixed(2)} kg`} label="CO₂ Equivalent Saved" icon="🌍" />
                        </div>
                    </div>
                    
                    <ControlsCard onRunCycle={handleRunCycle} loading={loading} dayCounter={dayCounter} />
                    
                    <AlertsCard alerts={alerts} pulsate={pulsate} />
                    <InventoryCard inventory={dashboardData.inventory} pulsate={pulsate} />
                    <SalesCard sales={dashboardData.todays_sales} pulsate={pulsate} />
                </div>
            </main>
        </div>
    );
}

export default App;