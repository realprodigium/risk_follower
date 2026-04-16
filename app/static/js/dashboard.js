let chart = null;
let websocket = null;
let ws_reconnect_attempts = 0;
const WS_MAX_RECONNECT   = 10;
const WS_RECONNECT_DELAY = 3000;
let absoluteFirstTs = null;

const MAX_POINTS  = 3600;

let activeTimeMs  = 60_000;
let activeHardware = 'all';
const CO2_THRESHOLD_WARN   = 1000;
const CO2_THRESHOLD_DANGER = 5000;
const CO2_AXIS_MAX         = 6000;

const history = {
    timestamps:  [],
    temperature: [],
    humidity:    [],
    co2:         [],
    hardware:    [],
    risk:        []
};

const sparkHistory = { temp: [], humidity: [], co2: [] };
const SPARK_MAX = 20;

let readingsToday = 0;
let alarmsToday   = 0;
let knownHardware = new Set();
let lastDataPoint = null;
let sparkCtx      = {};

let _chartRafPending = false;

function scheduleChartRefresh() {
    if (_chartRafPending) return;
    _chartRafPending = true;
    requestAnimationFrame(() => {
        _chartRafPending = false;
        _doChartRender();
    });
}

function _doChartRender() {
    if (!chart) return;

    const indices = activeHardware === 'all'
        ? history.timestamps.map((_, i) => i)
        : history.timestamps.map((_, i) => i).filter(i => history.hardware[i] === activeHardware);

    const tempData = indices.map(i => [history.timestamps[i], history.temperature[i]]);
    const humData  = indices.map(i => [history.timestamps[i], history.humidity[i]]);
    const co2Data  = indices.map(i => [history.timestamps[i], history.co2[i]]);

    let xMin, xMax;
    if (activeTimeMs > 0 && tempData.length) {
        const latestTs = history.timestamps[history.timestamps.length - 1];
        xMin = latestTs - activeTimeMs;
        xMax = latestTs + activeTimeMs * 0.05;
    } else {
        // "Todo" mode: Use the absolute first point of the session if available
        xMin = absoluteFirstTs || 'dataMin';
        xMax = 'dataMax';
    }

    chart.setOption({
        xAxis: [{ min: xMin, max: xMax }],
        series: [
            { name: 'Temperatura', data: tempData },
            { name: 'Humedad',     data: humData  },
            { name: 'CO2',         data: co2Data  }
        ]
    });

    const countEl = document.getElementById('chart-point-count');
    if (countEl) countEl.textContent = `${indices.length} puntos`;
}

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

function initChart() {
    const dom = document.getElementById('main-chart');
    chart = echarts.init(dom, 'dark', { renderer: 'canvas' });
    chart.setOption(buildBaseChartOption());
    window.addEventListener('resize', () => chart.resize());
}

function buildBaseChartOption() {
    // Detect light mode
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const grid      = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
    const axisLine  = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    const axisLabel = isLight ? '#9E9C96'           : '#3C3A36';
    const tooltipBg = isLight ? '#FAFAF8'           : '#131313';
    const tooltipBd = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)';
    const tooltipTx = isLight ? '#111110'           : '#EDEBE6';
    const legendTx  = isLight ? '#9E9C96'           : '#3C3A36';
 
    return {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: '56px', right: '96px', top: '16px', bottom: '48px', containLabel: false },
        tooltip: {
            trigger: 'axis',
            backgroundColor: tooltipBg,
            borderColor: tooltipBd,
            borderWidth: 1,
            textStyle: { color: tooltipTx, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
            axisPointer: { type: 'line', lineStyle: { color: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)', width: 1 } },
            formatter: (params) => {
                if (!params.length) return '';
                const ts   = new Date(params[0].axisValue);
                const time = ts.toLocaleTimeString('es-CO', { hour12: false });
                let html   = `<div style="margin-bottom:5px;color:${legendTx};font-size:10px;letter-spacing:0.04em">${time}</div>`;
                params.forEach(p => {
                    const val  = p.value !== undefined
                        ? p.value[1].toFixed(p.seriesName.includes('CO2') ? 0 : 1)
                        : '--';
                    const unit = p.seriesName.includes('Temp') ? '°C'
                        : p.seriesName.includes('Hum') ? '%' : ' PPM';
                    html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
                        <span style="width:6px;height:6px;border-radius:50%;background:${p.color};display:inline-block;flex-shrink:0"></span>
                        <span style="color:${legendTx}">${p.seriesName}</span>
                        <span style="font-weight:600;margin-left:auto;padding-left:12px">${val}${unit}</span>
                    </div>`;
                });
                return html;
            }
        },
        legend: {
            bottom: 2,
            textStyle: { color: legendTx, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
            itemWidth: 12, itemHeight: 3,
            data: ['Temperatura', 'Humedad', 'CO2']
        },
        dataZoom: [{ type: 'inside', filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseMove: true }],
        xAxis: {
            type: 'time', boundaryGap: false, min: 'dataMin', max: 'dataMax',
            splitLine:  { show: true, lineStyle: { color: grid, type: 'dashed', width: 1 } },
            axisLine:   { lineStyle: { color: axisLine } },
            axisTick:   { show: false },
            axisLabel:  {
                color: axisLabel, fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
                formatter: (value) => {
                    const d = new Date(value);
                    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
                }
            }
        },
        yAxis: [
            {
                name: '°C', nameTextStyle: { color: '#f04040', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
                min: 0, max: 60,
                splitLine: { lineStyle: { color: grid, type: 'dashed', width: 1 } },
                axisLine:  { show: false }, axisTick: { show: false },
                axisLabel: { color: axisLabel, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }
            },
            {
                name: '%', nameTextStyle: { color: '#4a9eff', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
                min: 0, max: 100, position: 'right', offset: 0,
                splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false },
                axisLabel: { color: axisLabel, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }
            },
            {
                name: 'PPM', nameTextStyle: { color: '#1dd38a', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
                min: 200, max: CO2_AXIS_MAX, position: 'right', offset: 48,
                splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false },
                axisLabel: { color: axisLabel, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }
            }
        ],
        series: [
            {
                name: 'Temperatura', type: 'line', yAxisIndex: 0, data: [],
                lineStyle: { color: '#f04040', width: 1.5 }, itemStyle: { color: '#f04040' },
                symbol: 'none', smooth: false,
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: 'rgba(240,64,64,0.1)' }, { offset: 1, color: 'rgba(240,64,64,0)' }] } },
                markLine: {
                    silent: true,
                    data: [{ yAxis: 60, label: { formatter: 'Max 60°C' } }]
                }
            },
            {
                name: 'Humedad', type: 'line', yAxisIndex: 1, data: [],
                lineStyle: { color: '#4a9eff', width: 1.5 }, itemStyle: { color: '#4a9eff' },
                symbol: 'none', smooth: false,
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: 'rgba(74,158,255,0.08)' }, { offset: 1, color: 'rgba(74,158,255,0)' }] } },
                markLine: {
                    silent: true,
                    data: [{ yAxis: 100, label: { formatter: 'Max 100%' } }]
                }
            },
            {
                name: 'CO2', type: 'line', yAxisIndex: 2, data: [],
                lineStyle: { color: '#1dd38a', width: 1.5 }, itemStyle: { color: '#1dd38a' },
                symbol: 'none', smooth: false,
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: 'rgba(29,211,138,0.08)' }, { offset: 1, color: 'rgba(29,211,138,0)' }] } },
                markLine: {
                    silent: true,
                    symbol: ['none', 'none'],
                    label: { position: 'end', fontSize: 8, fontFamily: 'JetBrains Mono, monospace' },
                    lineStyle: { type: 'dashed', width: 1 },
                    data: [
                        { yAxis: CO2_THRESHOLD_WARN,   label: { formatter: 'Warn 1k' }, lineStyle: { color: '#ffc107', opacity: 0.6 } },
                        { yAxis: CO2_THRESHOLD_DANGER, label: { formatter: 'Danger 5k' }, lineStyle: { color: '#f04040', opacity: 0.8 } }
                    ]
                }
            }
        ]
    };
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/sensor-data`;
    websocket = new WebSocket(url);

    websocket.onopen = () => {
        ws_reconnect_attempts = 0;
        setConnectionStatus('connected');
    };
    websocket.onerror = () => setConnectionStatus('disconnected');
    websocket.onclose = () => {
        setConnectionStatus('disconnected');
        // Exponential backoff, infinite retries.
        const delay = Math.min(WS_RECONNECT_DELAY * 2 ** ws_reconnect_attempts, 30_000);
        ws_reconnect_attempts++;
        setTimeout(connectWebSocket, delay);
    };
    websocket.onmessage = (e) => {
        try {
            const raw = JSON.parse(e.data);
            if (raw.type === 'historical' || raw.type === 'realtime') {
                const point = normalizePoint(raw);
                if (raw.type === 'realtime' || !isDuplicate(point))
                    ingestPoint(point, raw.type === 'realtime');
            }
        } catch (err) { console.error('WS parse error:', err); }
    };
}

function normalizePoint(raw) {
    const tsStr = raw.timestamp;
    let ts;
    if (tsStr.endsWith('Z') || tsStr.includes('+') || /T.*-\d{2}:\d{2}$/.test(tsStr)) {
        ts = new Date(tsStr).getTime();
    } else {
        ts = new Date(tsStr + 'Z').getTime();
    }
    const co2Val = parseFloat(raw.co2);
    let risk = raw.risk || 'normal';

    // Brewery specific CO2 thresholds
    if (co2Val > CO2_THRESHOLD_DANGER) risk = 'peligro';
    else if (co2Val > CO2_THRESHOLD_WARN) risk = 'advertencia';

    return {
        timestamp:   ts,
        hardware:    raw.hardware || 'Unknown',
        temperature: parseFloat(raw.temperature),
        humidity:    parseFloat(raw.humidity),
        co2:         co2Val,
        risk:        risk
    };
}

function isDuplicate(point) {
    if (!history.timestamps.length) return false;
    const last = history.timestamps.length - 1;
    return (
        Math.abs(history.timestamps[last] - point.timestamp) < 200 &&
        history.hardware[last] === point.hardware
    );
}

function ingestPoint(point, isRealtime) {
    if (absoluteFirstTs === null) absoluteFirstTs = point.timestamp;
    history.timestamps.push(point.timestamp);
    history.temperature.push(point.temperature);
    history.humidity.push(point.humidity);
    history.co2.push(point.co2);
    history.hardware.push(point.hardware);
    history.risk.push(point.risk);

    if (history.timestamps.length > MAX_POINTS) {
        history.timestamps.shift();  history.temperature.shift();
        history.humidity.shift();    history.co2.shift();
        history.hardware.shift();    history.risk.shift();
    }

    if (!knownHardware.has(point.hardware)) {
        knownHardware.add(point.hardware);
        addHardwareTab(point.hardware);
    }
    if (isRealtime) readingsToday++;
    if (point.risk !== 'normal') alarmsToday++;

    sparkHistory.temp.push(point.temperature);
    sparkHistory.humidity.push(point.humidity);
    sparkHistory.co2.push(point.co2);
    if (sparkHistory.temp.length     > SPARK_MAX) sparkHistory.temp.shift();
    if (sparkHistory.humidity.length > SPARK_MAX) sparkHistory.humidity.shift();
    if (sparkHistory.co2.length      > SPARK_MAX) sparkHistory.co2.shift();

    updateCards(point);
    updateAlertBanner(point);
    scheduleChartRefresh();
    updateRecentTable(point, isRealtime);
    lastDataPoint = point;
}

function updateCards(point) {
    setMetricValue('temp-value',     point.temperature.toFixed(1));
    setBar('temp-bar', (point.temperature / 60) * 100);
    setTrend('temp-trend', sparkHistory.temp);
    drawSparkline(sparkCtx.temp, sparkHistory.temp, '#f04040');

    setMetricValue('humidity-value', point.humidity.toFixed(1));
    setBar('humidity-bar', point.humidity);
    setTrend('humidity-trend', sparkHistory.humidity);
    drawSparkline(sparkCtx.humidity, sparkHistory.humidity, '#4a9eff');

    setMetricValue('co2-value', point.co2.toFixed(0));
    setBar('co2-bar', (point.co2 / CO2_AXIS_MAX) * 100);
    setTrend('co2-trend', sparkHistory.co2);
    drawSparkline(sparkCtx.co2, sparkHistory.co2, '#1dd38a');

    const bigBadge = document.getElementById('big-status-badge');
    const bigText  = document.getElementById('big-status-text');
    bigBadge.className = `big-status-badge status-${point.risk}`;
    bigText.textContent = riskLabel(point.risk);

    document.getElementById('status-hardware').textContent = point.hardware;
    document.getElementById('status-count').textContent    = readingsToday;
    document.getElementById('status-alarms').textContent   = alarmsToday;

    const pill  = document.getElementById('current-status-pill');
    const label = document.getElementById('current-status-label');
    pill.className = `current-status-pill status-${point.risk}`;
    label.textContent = `${riskLabel(point.risk)} — ${point.hardware}`;

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
    el.className = diff > 0.1 ? 'metric-trend up' : diff < -0.1 ? 'metric-trend down' : 'metric-trend flat';
}

function drawSparkline(ctx, data, color) {
    if (!ctx || data.length < 2) return;
    const canvas = ctx.canvas;
    const w = canvas.offsetWidth || canvas.width;
    const h = 40;
    canvas.width = w; canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    const min  = Math.min(...data) * 0.98;
    const max  = Math.max(...data) * 1.02 || min + 1;
    const scaleY = v => h - ((v - min) / (max - min)) * h;
    const scaleX = i => (i / (data.length - 1)) * w;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');

    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(data[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(scaleX(i), scaleY(data[i]));
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(data[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(scaleX(i), scaleY(data[i]));
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
}

function updateAlertBanner(point) {
    if (point.risk === 'normal') return;
    const banner = document.getElementById('alarm-banner');
    banner.className = `alarm-banner status-${point.risk}`;
    
    document.getElementById('alarm-message').textContent =
        `${riskLabel(point.risk)} detected in ${point.hardware}`;
    document.getElementById('alarm-sensors').innerHTML = `
        <span class="sbadge status-${point.risk}">${point.hardware}</span>
        <span class="sbadge status-${point.risk}">CO2: ${point.co2.toFixed(0)} PPM</span>
        <span class="sbadge status-${point.risk}">Temp: ${point.temperature.toFixed(1)}°C</span>`;
    banner.classList.remove('hidden');
    document.body.classList.add('alarm-active');
}

function setupAlarmDismiss() {
    document.getElementById('alarm-dismiss').addEventListener('click', () => {
        document.getElementById('alarm-banner').classList.add('hidden');
        document.body.classList.remove('alarm-active');
    });
}

const recentRecords = [];
const RECENT_MAX    = 10;

function updateRecentTable(point, isRealtime) {
    recentRecords.unshift(point);
    if (recentRecords.length > RECENT_MAX) recentRecords.pop();
    document.getElementById('recent-table-body').innerHTML = recentRecords.map((r, idx) => `
        <tr class="${idx === 0 && isRealtime ? 'new-row' : ''}">
            <td class="ts-cell">${formatTs(r.timestamp)}</td>
            <td><span class="hw-badge">${r.hardware}</span></td>
            <td class="val-cell temp">${r.temperature.toFixed(1)}°C</td>
            <td class="val-cell humidity">${r.humidity.toFixed(1)}%</td>
            <td class="val-cell co2">${r.co2.toFixed(0)}</td>
            <td><span class="sbadge status-${r.risk}">${riskLabel(r.risk)}</span></td>
        </tr>`).join('');
}

function addHardwareTab(hw) {
    const tabs = document.getElementById('sensor-tabs');
    if (!tabs || tabs.querySelector(`[data-hardware="${hw}"]`)) return;
    const btn = document.createElement('button');
    btn.className = 'sensor-tab';
    btn.dataset.hardware = hw;
    btn.textContent = hw;
    btn.addEventListener('click', () => setActiveHardware(hw));
    tabs.appendChild(btn);
}

function setActiveHardware(hw) {
    activeHardware = hw;
    document.querySelectorAll('.sensor-tab').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.hardware === hw));
    scheduleChartRefresh();
}

function setupControls() {
    document.getElementById('tab-all').addEventListener('click', () => setActiveHardware('all'));

    document.querySelectorAll('.trange-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.trange-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTimeMs = parseInt(btn.dataset.ms, 10);
            _doChartRender();
        });
    });
}

function setupExport() {
    document.getElementById('export-btn').addEventListener('click', exportCSV);
}

function exportCSV() {
    let csv = 'Timestamp,Hardware,Temperatura_C,Humedad_pct,CO2_PPM,Estado\n';
    history.timestamps.forEach((ts, i) => {
        csv += `"${new Date(ts).toISOString()}",${history.hardware[i]},${history.temperature[i]},${history.humidity[i]},${history.co2[i]},${history.risk[i]}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `co2_monitor_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

function setConnectionStatus(state) {
    const pill = document.getElementById('ws-status');
    if (!pill) return;
    pill.className = `connection-pill ${state}`;
    const span = pill.querySelector('span');
    if (span) span.textContent = state === 'connected' ? 'En vivo' : 'Desconectado';
}

function riskLabel(risk) {
    const labels = {
        normal:      'Normal',
        alto:        'Alto',
        bajo:        'Bajo',
        high:        'Alto',
        low:         'Bajo',
        advertencia: 'Advertencia',
        peligro:     'Peligro'
    };
    return labels[risk] || risk;
}

function formatTs(ms) {
    const d   = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}