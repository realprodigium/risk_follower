let chartCO2 = null;
let chartTH = null;
let websocket = null;
let wsAttempts = 0;
let pendingUpdate = false;

const MAX_POINTS = 100;

const THRESHOLDS = {
    co2: { normal: 1000, warning: 2000, danger: 5000 },
    temp: { min: 17, max: 27 },
    hum: { min: 30, max: 60 }
};

let historyData = [];
let selectedHardware = 'all';
let latestByHardware = {};

let readingsToday = 0;
let alarmsToday = 0;
let knownHardware = new Set();
let recent = [];

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function theme() {
    return {
        text: cssVar('--text-secondary'),
        grid: cssVar('--border-subtle'),
        temp: cssVar('--chart-temp'),
        hum: cssVar('--chart-humidity'),
        co2: cssVar('--chart-co2')
    };
}

function initCharts() {
    chartCO2 = echarts.init(document.getElementById('chart-co2'));
    chartTH = echarts.init(document.getElementById('chart-th'));
    applyOptions();
    window.addEventListener('resize', () => {
        chartCO2.resize();
        chartTH.resize();
    });
}

function applyOptions() {
    const t = theme();

    chartCO2.setOption({
        animation: true,
        animationDurationUpdate: 50,
        animationEasing: 'linear',
        grid: { left: 40, right: 20, top: 10, bottom: 30 },
        xAxis: { type: 'time', axisLabel: { color: t.text }, splitLine: { lineStyle: { color: t.grid } } },
        yAxis: { min: 300, max: 3000, axisLabel: { color: t.text } },
        series: [{
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: [],
            lineStyle: { color: t.co2, width: 2.5 },
            areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: t.co2 + '33'}, {offset: 1, color: t.co2 + '08'}]) },
            markArea: {
                silent: true,
                itemStyle: { color: t.co2 + '22' },
                data: [[{ yAxis: 400 }, { yAxis: THRESHOLDS.co2.normal }]]
            }
        }]
    });

    chartTH.setOption({
        animation: true,
        animationDurationUpdate: 50,
        animationEasing: 'linear',
        grid: { left: 40, right: 40, top: 10, bottom: 30 },
        xAxis: { type: 'time', axisLabel: { color: t.text }, splitLine: { lineStyle: { color: t.grid } } },
        yAxis: [
            { min: 10, max: 40, axisLabel: { color: t.text } },
            { min: 20, max: 80, axisLabel: { color: t.text } }
        ],
        series: [
            {
                type: 'line',
                smooth: true,
                showSymbol: false,
                data: [],
                yAxisIndex: 0,
                lineStyle: { color: t.temp, width: 2.5 },
                areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: t.temp + '33'}, {offset: 1, color: t.temp + '08'}]) },
                markArea: {
                    silent: true,
                    itemStyle: { color: t.temp + '22' },
                    data: [[{ yAxis: THRESHOLDS.temp.min }, { yAxis: THRESHOLDS.temp.max }]]
                }
            },
            {
                type: 'line',
                smooth: true,
                showSymbol: false,
                data: [],
                yAxisIndex: 1,
                lineStyle: { color: t.hum, width: 2.5 },
                areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: t.hum + '33'}, {offset: 1, color: t.hum + '08'}]) },
                markArea: {
                    silent: true,
                    itemStyle: { color: t.hum + '22' },
                    data: [[{ yAxis: THRESHOLDS.hum.min }, { yAxis: THRESHOLDS.hum.max }]]
                }
            }
        ]
    });
}

function updateCharts() {
    const filtered = historyData.filter(d => selectedHardware === 'all' || d.hw === selectedHardware);
    
    // Si hay demasiados puntos, truncamos para rendimiento
    const window = filtered.slice(-MAX_POINTS);

    const co2 = window.map(d => [d.ts, d.co2]);
    const temp = window.map(d => [d.ts, d.temp]);
    const hum = window.map(d => [d.ts, d.hum]);

    chartCO2.setOption({ series: [{ data: co2 }] });
    chartTH.setOption({ series: [{ data: temp }, { data: hum }] });
}

function calculateRisk(temp, hum, co2) {
    // Detectar peligro crítico
    if (co2 > THRESHOLDS.co2.danger) return 'peligro';
    if (temp < THRESHOLDS.temp.min - 2 || temp > THRESHOLDS.temp.max + 2) return 'peligro';
    if (hum < THRESHOLDS.hum.min - 10 || hum > THRESHOLDS.hum.max + 10) return 'peligro';
    
    // Detectar advertencia
    if (co2 > THRESHOLDS.co2.warning) return 'advertencia';
    if (temp < THRESHOLDS.temp.min || temp > THRESHOLDS.temp.max) return 'advertencia';
    if (hum < THRESHOLDS.hum.min || hum > THRESHOLDS.hum.max) return 'advertencia';
    
    return 'normal';
}

function normalize(raw) {
    const ts = typeof raw.timestamp === 'number'
        ? raw.timestamp
        : new Date(raw.timestamp).getTime();

    // Asegurar que sean números válidos
    const temp = isNaN(+raw.temperature) ? 0 : +raw.temperature;
    const hum = isNaN(+raw.humidity) ? 0 : +raw.humidity;
    const co2 = isNaN(+raw.co2) ? 0 : +raw.co2;
    const risk = calculateRisk(temp, hum, co2);

    return {
        ts,
        temp,
        hum,
        co2,
        hw: raw.hardware || 'default',
        risk
    };
}

function ingest(p) {
    // Agregar datos a historial global
    historyData.push(p);
    
    // Almacenar último por hardware
    latestByHardware[p.hw] = p;

    // Mantener límite de historial preventivo
    if (historyData.length > 2000) {
        historyData.shift();
    }

    // Agregar hardware tab si es nuevo
    if (!knownHardware.has(p.hw)) {
        knownHardware.add(p.hw);
        addHardwareTab(p.hw);
    }

    // Actualizar contadores
    readingsToday++;
    if (p.risk !== 'normal') alarmsToday++;

    // Actualizar UI
    const currentlyViewing = (selectedHardware === 'all' || selectedHardware === p.hw);
    if (currentlyViewing) {
        updateCards(p);
        updateCharts();
    }
    
    // Siempre actualizar tabla
    updateTable(p);
}

function updateCards(p) {
    // Actualizar valores numéricos
    const tempVal = document.getElementById('temp-value');
    const humVal = document.getElementById('humidity-value');
    const co2Val = document.getElementById('co2-value');
    
    if (tempVal) tempVal.textContent = p.temp.toFixed(1);
    if (humVal) humVal.textContent = p.hum.toFixed(1);
    if (co2Val) co2Val.textContent = p.co2.toFixed(0);

    // Actualizar barras de progreso (visual)
    const tempBar = document.getElementById('temp-bar');
    const humBar = document.getElementById('humidity-bar');
    const co2Bar = document.getElementById('co2-bar');

    if (tempBar) tempBar.style.width = Math.min(100, (p.temp / 60) * 100) + '%';
    if (humBar) humBar.style.width = Math.min(100, p.hum) + '%';
    if (co2Bar) co2Bar.style.width = Math.min(100, (p.co2 / 6000) * 100) + '%';

    // Actualizar estado
    const statusHw = document.getElementById('status-hardware');
    const statusCnt = document.getElementById('status-count');
    const statusAlm = document.getElementById('status-alarms');
    
    if (statusHw) statusHw.textContent = p.hw;
    if (statusCnt) statusCnt.textContent = readingsToday;
    if (statusAlm) statusAlm.textContent = alarmsToday;

    // Actualizar timestamp
    const lastUpdate = document.getElementById('last-update-time');
    if (lastUpdate) lastUpdate.textContent = new Date(p.ts).toLocaleTimeString('es-CO', { hour12: false });

    // Actualizar status pill
    const label = document.getElementById('current-status-label');
    const pill = document.getElementById('current-status-pill');
    const bigBadge = document.getElementById('big-status-badge');
    const bigText = document.getElementById('big-status-text');
    
    const displayRisk = p.risk.toUpperCase() + (selectedHardware === 'all' ? ` — ${p.hw}` : '');
    if (label) label.textContent = displayRisk;
    if (pill) pill.className = `current-status-pill status-${p.risk}`;
    if (bigBadge) bigBadge.className = `big-status-badge status-${p.risk}`;
    if (bigText) bigText.textContent = p.risk.toUpperCase();
}

function updateTable(p) {
    recent.unshift(p);
    if (recent.length > 20) recent.pop();

    document.getElementById('recent-table-body').innerHTML = recent.map((r, idx) => `
        <tr class="${idx === 0 ? 'new-row' : ''}">
            <td class="ts-cell">${formatTs(r.ts)}</td>
            <td><span class="hw-badge">${r.hw}</span></td>
            <td class="val-cell temp">${r.temp.toFixed(1)}</td>
            <td class="val-cell humidity">${r.hum.toFixed(1)}</td>
            <td class="val-cell co2">${r.co2.toFixed(0)}</td>
            <td><span class="sbadge status-${r.risk}">${r.risk}</span></td>
        </tr>
    `).join('');
}

function addHardwareTab(hw) {
    const tabs = document.getElementById('sensor-tabs');
    if (!tabs || tabs.querySelector(`[data-hardware="${hw}"]`)) return;

    const btn = document.createElement('button');
    btn.className = 'sensor-tab';
    btn.dataset.hardware = hw;
    btn.textContent = hw;

    btn.onclick = () => {
        document.querySelectorAll('.sensor-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedHardware = hw;
        
        // Al cambiar sensor, actualizar cards con la última lectura de ese sensor
        if (latestByHardware[hw]) {
            updateCards(latestByHardware[hw]);
        }
        updateCharts();
    };

    tabs.appendChild(btn);
}

function setConnectionStatus(state) {
    const el = document.getElementById('ws-status');
    if (!el) return;

    el.className = `connection-pill ${state}`;
    el.querySelector('span').textContent =
        state === 'connected' ? 'En vivo' : 'Desconectado';
}

function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    websocket = new WebSocket(`${protocol}//${location.host}/ws/sensor-data`);

    websocket.onopen = () => {
        wsAttempts = 0;
        setConnectionStatus('connected');
    };

    websocket.onclose = () => {
        setConnectionStatus('disconnected');
        const delay = Math.min(3000 * 2 ** wsAttempts, 30000);
        wsAttempts++;
        setTimeout(connectWS, delay);
    };

    websocket.onerror = () => setConnectionStatus('disconnected');

    websocket.onmessage = e => {
        try {
            const raw = JSON.parse(e.data);
            if (!raw.timestamp) return;
            
            ingest(normalize(raw));
        } catch (err) {
            console.error('WebSocket parse error:', err);
        }
    };
}

function observeTheme() {
    const observer = new MutationObserver(() => applyOptions());
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
}

function formatTs(ms) {
    return new Date(ms).toLocaleTimeString('es-CO', { hour12: false });
}

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    connectWS();
    observeTheme();

    document.getElementById('tab-all')?.addEventListener('click', () => {
        document.querySelectorAll('.sensor-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-all').classList.add('active');
        selectedHardware = 'all';
        
        // Mostrar último dato global disponible
        if (historyData.length > 0) {
            updateCards(historyData[historyData.length - 1]);
        }
        updateCharts();
    });
});