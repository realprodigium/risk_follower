/* ============================================================
   CO2 Monitor — Dashboard JS (ECharts v5)
   ============================================================ */

// ---- State ----
let chart = null;
let websocket = null;
let ws_reconnect_attempts = 0;
const WS_MAX_RECONNECT = 5;
const WS_RECONNECT_DELAY = 3000;

const MAX_POINTS = 200; // total history kept in memory
let activeTimeMinutes = 1; // current time-range filter in minutes (0 = all)
let activeHardware = 'all';

const history = {
    timestamps:   [],  // ms (UTC)
    temperature:  [],
    humidity:     [],
    co2:          [],
    hardware:     [],
    risk:         []
};

// Sparkline mini-histories (last 20 points per metric)
const sparkHistory = { temp: [], humidity: [], co2: [] };
const SPARK_MAX = 20;

// Daily counters
let readingsToday = 0;
let alarmsToday   = 0;
let knownHardware = new Set();
let lastDataPoint = null; // for trend calculation

// Sparkline contexts
let sparkCtx = {};

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    connectWebSocket();
    setupControls();
    setupAlarmDismiss();
    setupExport();

    sparkCtx.temp     = document.getElementById('temp-sparkline').getContext('2d');
    sparkCtx.humidity = document.getElementById('humidity-sparkline').getContext('2d');
    sparkCtx.co2      = document.getElementById('co2-sparkline').getContext('2d');
});

// ---- ECharts Setup ----
function initChart() {
    const dom = document.getElementById('main-chart');
    chart = echarts.init(dom, 'dark', { renderer: 'canvas' });
    chart.setOption(buildChartOption([], [], [], []));
    window.addEventListener('resize', () => chart.resize());
}

function buildChartOption(times, temps, humids, co2s) {
    return {
        backgroundColor: 'transparent',
        animation: false,
        grid: {
            left: '60px', right: '100px', top: '20px', bottom: '50px', containLabel: false
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#181c27',
            borderColor: '#252a38',
            borderWidth: 1,
            textStyle: { color: '#e8ecf4', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
            axisPointer: { type: 'cross', lineStyle: { color: '#4a9eff', opacity: 0.4 } },
            formatter: (params) => {
                if (!params.length) return '';
                const ts = new Date(params[0].axisValue);
                const time = ts.toLocaleTimeString('es-CO', { hour12: false });
                let html = `<div style="margin-bottom:6px;color:#8892a4;font-size:11px">${time}</div>`;
                params.forEach(p => {
                    const color = p.color;
                    const val   = p.value !== undefined ? p.value.toFixed(p.seriesName.includes('CO2') ? 0 : 1) : '--';
                    const unit  = p.seriesName.includes('Temp') ? '°C' : p.seriesName.includes('Hum') ? '%' : ' PPM';
                    html += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0">
                        <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
                        <span style="color:#8892a4">${p.seriesName}:</span>
                        <span style="font-weight:700">${val}${unit}</span>
                    </div>`;
                });
                return html;
            }
        },
        legend: {
            top: 'bottom', bottom: 4,
            textStyle: { color: '#8892a4', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
            itemWidth: 14, itemHeight: 4,
            data: ['Temperatura', 'Humedad', 'CO2']
        },
        xAxis: {
            type: 'time',
            boundaryGap: false,
            splitLine: { show: true, lineStyle: { color: '#252a38', type: 'dashed' } },
            axisLine: { lineStyle: { color: '#252a38' } },
            axisTick: { lineStyle: { color: '#252a38' } },
            axisLabel: {
                color: '#545e6f', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                formatter: (value) => {
                    const d = new Date(value);
                    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
                }
            },
        },
        yAxis: [
            {
                name: '°C',
                nameTextStyle: { color: '#f04040', fontSize: 10 },
                min: 0, max: 50,
                splitLine: { lineStyle: { color: '#252a38', type: 'dashed' } },
                axisLine: { lineStyle: { color: '#252a38' } },
                axisTick: { lineStyle: { color: '#252a38' } },
                axisLabel: { color: '#545e6f', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }
            },
            {
                name: '%',
                nameTextStyle: { color: '#4a9eff', fontSize: 10 },
                min: 0, max: 100,
                position: 'right',
                offset: 0,
                splitLine: { show: false },
                axisLine: { lineStyle: { color: '#252a38' } },
                axisTick: { lineStyle: { color: '#252a38' } },
                axisLabel: { color: '#545e6f', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }
            },
            {
                name: 'PPM',
                nameTextStyle: { color: '#1dd38a', fontSize: 10 },
                min: 0, max: 1000,
                position: 'right',
                offset: 55,
                splitLine: { show: false },
                axisLine: { lineStyle: { color: '#252a38' } },
                axisTick: { lineStyle: { color: '#252a38' } },
                axisLabel: { color: '#545e6f', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }
            }
        ],
        series: [
            {
                name: 'Temperatura',
                type: 'line',
                yAxisIndex: 0,
                data: times.map((t, i) => [t, temps[i]]),
                lineStyle: { color: '#f04040', width: 2 },
                itemStyle: { color: '#f04040' },
                symbol: 'none',
                smooth: 0.3,
                areaStyle: {
                    color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(240,64,64,0.15)' }, { offset: 1, color: 'rgba(240,64,64,0)' }]
                    }
                }
            },
            {
                name: 'Humedad',
                type: 'line',
                yAxisIndex: 1,
                data: times.map((t, i) => [t, humids[i]]),
                lineStyle: { color: '#4a9eff', width: 2 },
                itemStyle: { color: '#4a9eff' },
                symbol: 'none',
                smooth: 0.3,
                areaStyle: {
                    color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(74,158,255,0.12)' }, { offset: 1, color: 'rgba(74,158,255,0)' }]
                    }
                }
            },
            {
                name: 'CO2',
                type: 'line',
                yAxisIndex: 2,
                data: times.map((t, i) => [t, co2s[i]]),
                lineStyle: { color: '#1dd38a', width: 2 },
                itemStyle: { color: '#1dd38a' },
                symbol: 'none',
                smooth: 0.3,
                areaStyle: {
                    color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(29,211,138,0.12)' }, { offset: 1, color: 'rgba(29,211,138,0)' }]
                    }
                }
            }
        ]
    };
}

// ---- Update chart with current filters ----
function refreshChart() {
    if (!chart) return;

    const now = Date.now();
    let indices;

    if (activeTimeMinutes === 0) {
        indices = history.timestamps
            .map((_, i) => i)
            .filter(i => activeHardware === 'all' || history.hardware[i] === activeHardware);
    } else {
        const latestTs = history.timestamps.length > 0 
        ? Math.max(...history.timestamps) 
        : Date.now();
        const cutoff = latestTs - activeTimeMinutes * 60 * 1000;
        indices = history.timestamps
            .map((_, i) => i)
            .filter(i => history.timestamps[i] >= cutoff &&
                (activeHardware === 'all' || history.hardware[i] === activeHardware));
    }

    const times  = indices.map(i => history.timestamps[i]);
    const temps  = indices.map(i => history.temperature[i]);
    const humids = indices.map(i => history.humidity[i]);
    const co2s   = indices.map(i => history.co2[i]);

    chart.setOption(buildChartOption(times, temps, humids, co2s));

    const countEl = document.getElementById('chart-point-count');
    if (countEl) countEl.textContent = `${indices.length} puntos`;
}

// ---- WebSocket ----
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/sensor-data`;

    websocket = new WebSocket(url);

    websocket.onopen = () => {
        ws_reconnect_attempts = 0;
        setConnectionStatus('connected');
    };

    websocket.onmessage = (e) => {
        try {
            const raw = JSON.parse(e.data);
            if (raw.type === 'historical' || raw.type === 'realtime') {
                const point = normalizePoint(raw);
                if (raw.type === 'realtime' || !isDuplicate(point)) {
                    ingestPoint(point, raw.type === 'realtime');
                }
            }
        } catch (err) {
            console.error('WS parse error:', err);
        }
    };

    websocket.onerror = () => setConnectionStatus('disconnected');

    websocket.onclose = () => {
        setConnectionStatus('disconnected');
        if (ws_reconnect_attempts < WS_MAX_RECONNECT) {
            ws_reconnect_attempts++;
            setTimeout(connectWebSocket, WS_RECONNECT_DELAY);
        }
    };
}

function normalizePoint(raw) {
    // Parse timestamp, always treat as UTC if offset not present
    let ts;
    const tsStr = raw.timestamp;
    if (tsStr.endsWith('Z') || tsStr.includes('+') || /T.*-\d{2}:\d{2}$/.test(tsStr)) {
        ts = new Date(tsStr).getTime();
    } else {
        // No tz info → assume UTC to match server behavior
        ts = new Date(tsStr + 'Z').getTime();
    }

    return {
        timestamp:   ts,
        hardware:    raw.hardware || 'Unknown',
        temperature: parseFloat(raw.temperature),
        humidity:    parseFloat(raw.humidity),
        co2:         parseFloat(raw.co2),
        risk:        raw.risk || 'normal'
    };
}

function isDuplicate(point) {
    if (history.timestamps.length === 0) return false;
    const last = history.timestamps.length - 1;
    return (
        Math.abs(history.timestamps[last] - point.timestamp) < 200 &&
        history.hardware[last] === point.hardware
    );
}

function ingestPoint(point, isRealtime) {
    // Push to history
    history.timestamps.push(point.timestamp);
    history.temperature.push(point.temperature);
    history.humidity.push(point.humidity);
    history.co2.push(point.co2);
    history.hardware.push(point.hardware);
    history.risk.push(point.risk);

    // Trim old data
    if (history.timestamps.length > MAX_POINTS) {
        history.timestamps.shift();
        history.temperature.shift();
        history.humidity.shift();
        history.co2.shift();
        history.hardware.shift();
        history.risk.shift();
    }

    // Track known hardware
    if (!knownHardware.has(point.hardware)) {
        knownHardware.add(point.hardware);
        addHardwareTab(point.hardware);
    }

    // Counters
    if (isRealtime) readingsToday++;
    if (point.risk !== 'normal') alarmsToday++;

    // Sparkline history
    sparkHistory.temp.push(point.temperature);
    sparkHistory.humidity.push(point.humidity);
    sparkHistory.co2.push(point.co2);
    if (sparkHistory.temp.length > SPARK_MAX)     sparkHistory.temp.shift();
    if (sparkHistory.humidity.length > SPARK_MAX) sparkHistory.humidity.shift();
    if (sparkHistory.co2.length > SPARK_MAX)      sparkHistory.co2.shift();

    // Update UI
    updateCards(point);
    updateAlertBanner(point);
    refreshChart();
    updateRecentTable(point, isRealtime);

    lastDataPoint = point;
}

// ---- Cards ----
function updateCards(point) {
    // Temperature
    setMetricValue('temp-value', point.temperature.toFixed(1));
    setBar('temp-bar', (point.temperature / 50) * 100);
    setTrend('temp-trend', sparkHistory.temp);
    drawSparkline(sparkCtx.temp, sparkHistory.temp, '#f04040');

    // Humidity
    setMetricValue('humidity-value', point.humidity.toFixed(1));
    setBar('humidity-bar', point.humidity);
    setTrend('humidity-trend', sparkHistory.humidity);
    drawSparkline(sparkCtx.humidity, sparkHistory.humidity, '#4a9eff');

    // CO2
    setMetricValue('co2-value', point.co2.toFixed(0));
    setBar('co2-bar', (point.co2 / 2000) * 100);
    setTrend('co2-trend', sparkHistory.co2);
    drawSparkline(sparkCtx.co2, sparkHistory.co2, '#1dd38a');

    // Status card
    const bigBadge = document.getElementById('big-status-badge');
    const bigText  = document.getElementById('big-status-text');
    bigBadge.className = `big-status-badge status-${point.risk}`;
    bigText.textContent = riskLabel(point.risk);

    document.getElementById('status-hardware').textContent = point.hardware;
    document.getElementById('status-count').textContent    = readingsToday;
    document.getElementById('status-alarms').textContent   = alarmsToday;

    // Status bar pill
    const pill = document.getElementById('current-status-pill');
    const label = document.getElementById('current-status-label');
    pill.className = `current-status-pill status-${point.risk}`;
    label.textContent = `${riskLabel(point.risk)} — ${point.hardware}`;

    // Last update
    document.getElementById('last-update-time').textContent =
        new Date(point.timestamp).toLocaleTimeString('es-CO', { hour12: false });
}

function setMetricValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function setBar(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

function setTrend(id, arr) {
    if (arr.length < 2) return;
    const el = document.getElementById(id);
    if (!el) return;
    const diff = arr[arr.length - 1] - arr[arr.length - 2];
    if (diff > 0.1) {
        el.className = 'metric-trend up';
    } else if (diff < -0.1) {
        el.className = 'metric-trend down';
    } else {
        el.className = 'metric-trend flat';
    }
}

// ---- Sparklines (mini canvas charts) ----
function drawSparkline(ctx, data, color) {
    if (!ctx || data.length < 2) return;
    const canvas = ctx.canvas;
    const w = canvas.offsetWidth || canvas.width;
    const h = 40;
    canvas.width  = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...data) * 0.98;
    const max = Math.max(...data) * 1.02 || min + 1;
    const scaleY = (v) => h - ((v - min) / (max - min)) * h;
    const scaleX = (i) => (i / (data.length - 1)) * w;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');

    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(data[0]));
    for (let i = 1; i < data.length; i++) {
        ctx.lineTo(scaleX(i), scaleY(data[i]));
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(data[0]));
    for (let i = 1; i < data.length; i++) {
        ctx.lineTo(scaleX(i), scaleY(data[i]));
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// ---- Alarm Banner ----
function updateAlertBanner(point) {
    const banner  = document.getElementById('alarm-banner');
    const msg     = document.getElementById('alarm-message');
    const sensors = document.getElementById('alarm-sensors');

    if (point.risk !== 'normal') {
        const riskText = riskLabel(point.risk);
        msg.textContent = `Nivel ${riskText.toLowerCase()} detectado en ${point.hardware}`;
        sensors.innerHTML = `
            <span class="alarm-sensor-tag">${point.hardware}</span>
            <span class="alarm-sensor-tag">CO2: ${point.co2.toFixed(0)} PPM</span>
            <span class="alarm-sensor-tag">Temp: ${point.temperature.toFixed(1)}°C</span>
        `;
        banner.classList.remove('hidden');
        document.body.classList.add('alarm-active');
    }
}

function setupAlarmDismiss() {
    document.getElementById('alarm-dismiss').addEventListener('click', () => {
        document.getElementById('alarm-banner').classList.add('hidden');
        document.body.classList.remove('alarm-active');
    });
}

// ---- Recent Table ----
const recentRecords = [];
const RECENT_MAX = 10;

function updateRecentTable(point, isRealtime) {
    recentRecords.unshift(point);
    if (recentRecords.length > RECENT_MAX) recentRecords.pop();

    const tbody = document.getElementById('recent-table-body');
    tbody.innerHTML = recentRecords.map((r, idx) => `
        <tr class="${idx === 0 && isRealtime ? 'new-row' : ''}">
            <td class="ts-cell">${formatTs(r.timestamp)}</td>
            <td><span class="hw-badge">${r.hardware}</span></td>
            <td class="val-cell temp">${r.temperature.toFixed(1)}°C</td>
            <td class="val-cell humidity">${r.humidity.toFixed(1)}%</td>
            <td class="val-cell co2">${r.co2.toFixed(0)}</td>
            <td><span class="sbadge status-${r.risk}">${riskLabel(r.risk)}</span></td>
        </tr>
    `).join('');
}

// ---- Hardware Filter Tabs ----
function addHardwareTab(hw) {
    const tabs = document.getElementById('sensor-tabs');
    if (!tabs) return;
    if (tabs.querySelector(`[data-hardware="${hw}"]`)) return;

    const btn = document.createElement('button');
    btn.className    = 'sensor-tab';
    btn.dataset.hardware = hw;
    btn.id = `tab-${hw}`;
    btn.textContent  = hw;
    btn.addEventListener('click', () => setActiveHardware(hw));
    tabs.appendChild(btn);
}

function setActiveHardware(hw) {
    activeHardware = hw;
    document.querySelectorAll('.sensor-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.hardware === hw);
    });
    refreshChart();
}

// ---- Controls ----
function setupControls() {
    // Hardware tab: All
    document.getElementById('tab-all').addEventListener('click', () => setActiveHardware('all'));

    // Time range buttons
    document.querySelectorAll('.trange-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.trange-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTimeMinutes = parseInt(btn.dataset.mins, 10);
            refreshChart();
        });
    });
}

// ---- Export ----
function setupExport() {
    document.getElementById('export-btn').addEventListener('click', exportCSV);
}

function exportCSV() {
    let csv = 'Timestamp,Hardware,Temperatura_C,Humedad_pct,CO2_PPM,Estado\n';
    history.timestamps.forEach((ts, i) => {
        csv += `"${new Date(ts).toISOString()}",`;
        csv += `${history.hardware[i]},`;
        csv += `${history.temperature[i]},`;
        csv += `${history.humidity[i]},`;
        csv += `${history.co2[i]},`;
        csv += `${history.risk[i]}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `co2_monitor_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---- Connection Status ----
function setConnectionStatus(state) {
    const pill = document.getElementById('ws-status');
    if (!pill) return;
    pill.className = `connection-pill ${state}`;
    const span = pill.querySelector('span');
    if (span) span.textContent = state === 'connected' ? 'En vivo' : 'Desconectado';
}

// ---- Helpers ----
function riskLabel(risk) {
    const map = { normal: 'Normal', alto: 'Alto', bajo: 'Bajo', high: 'Alto', low: 'Bajo' };
    return map[risk] || risk;
}

function formatTs(ms) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}