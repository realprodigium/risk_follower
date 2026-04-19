let chartCO2 = null;
let chartTH = null;
let websocket = null;
let wsAttempts = 0;
let dbThresholds = null;

const MAX_POINTS = 100;

let THRESHOLDS = {
    co2:  { normal: 1000, warning: 2000, danger: 5000 },
    temp: { min: 17, max: 27 },
    hum:  { min: 30, max: 60 }
};

const CHART_RANGES = {
    co2:  { min: 200,  max: 6000 },
    temp: { min: 5,    max: 45   },
    hum:  { min: 0,    max: 100  }
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
        text:     cssVar('--text-secondary'),
        grid:     cssVar('--border-subtle'),
        temp:     cssVar('--chart-temp'),
        hum:      cssVar('--chart-humidity'),
        co2:      cssVar('--chart-co2')
    };
}

async function loadSystemThresholds() {
    try {
        const token = localStorage.getItem('access_token');
        const res = await fetch('/admin/thresholds', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const t = await res.json();
            dbThresholds = t;
            THRESHOLDS = {
                co2:  { normal: t.co2_low, warning: t.co2_high, danger: t.co2_high * 1.5 },
                temp: { min: t.temp_low, max: t.temp_high },
                hum:  { min: t.humidity_low, max: t.humidity_high }
            };
        }
    } catch (e) {
        console.error("Failed to load thresholds", e);
    }
}

function initCharts() {
    chartCO2 = echarts.init(document.getElementById('chart-co2'));
    chartTH  = echarts.init(document.getElementById('chart-th'));
    applyBaseOptions();
    window.addEventListener('resize', () => {
        chartCO2.resize();
        chartTH.resize();
    });
}

function makeXAxis(t) {
    return {
        type: 'time',
        splitLine: { show: false },
        axisLine:  { lineStyle: { color: t.grid } },
        axisTick:  { show: false },
        axisLabel: {
            color: t.text,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            hideOverlap: true,
            formatter: val => {
                const d = new Date(val);
                return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            }
        }
    };
}

function makeYAxis(t, min, max, unit) {
    return {
        min, max,
        splitNumber: 4,
        axisLabel: {
            color: t.text,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: v => `${v}${unit}`
        },
        splitLine: {
            lineStyle: { color: t.grid, type: 'dashed', opacity: 0.5 }
        },
        axisLine: { show: false },
        axisTick: { show: false }
    };
}

function lineSeries(data, color, yAxisIndex = 0, name = '') {
    return {
        name,
        type: 'line',
        smooth: 0.4,
        showSymbol: false,
        data,
        yAxisIndex,
        lineStyle: { color, width: 2 },
        areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: color + '28' },
                { offset: 1, color: color + '04' }
            ])
        }
    };
}

function applyBaseOptions() {
    const t = theme();
    const grid = { left: 44, right: 16, top: 14, bottom: 28 };
    const anim = {
        animation: true,
        animationDuration: 400,
        animationDurationUpdate: 300
    };

    chartCO2.setOption({
        ...anim,
        grid,
        xAxis: makeXAxis(t),
        yAxis: makeYAxis(t, 'dataMin', 'dataMax', ''),
        series: [lineSeries([], t.co2, 0, 'CO2')],
        tooltip: { trigger: 'axis' }
    });

    chartTH.setOption({
        ...anim,
        grid: { ...grid, right: 44 },
        xAxis: makeXAxis(t),
        yAxis: [
            makeYAxis(t, 'dataMin', 'dataMax', '°'),
            { ...makeYAxis(t, 'dataMin', 'dataMax', '%'), position: 'right' }
        ],
        legend: {
            show: true,
            right: 10, top: 0,
            textStyle: { color: t.text, fontSize: 10 },
            data: ['Temp', 'Hum']
        },
        series: [
            lineSeries([], t.temp, 0, 'Temp'),
            lineSeries([], t.hum,  1, 'Hum')
        ],
        tooltip: { trigger: 'axis' }
    });
}

function updateCharts() {
    const filtered = historyData.filter(d => selectedHardware === 'all' || d.hw === selectedHardware);
    const win = filtered.slice(-MAX_POINTS);
    const co2Data  = win.map(d => [d.ts, d.co2]);
    const tempData = win.map(d => [d.ts, d.temp]);
    const humData  = win.map(d => [d.ts, d.hum]);

    chartCO2.setOption({
        series: [{ data: co2Data }]
    });

    chartTH.setOption({
        series: [
            { name: 'Temp', data: tempData },
            { name: 'Hum',  data: humData  }
        ]
    });
}

function calculateRisk(temp, hum, co2) {
    if (co2 > THRESHOLDS.co2.danger) return 'peligro';
    if (temp > THRESHOLDS.temp.max + 5 || temp < THRESHOLDS.temp.min - 5) return 'peligro';
    if (hum > THRESHOLDS.hum.max + 15 || hum < THRESHOLDS.hum.min - 15) return 'peligro';
    if (co2 > THRESHOLDS.co2.warning) return 'advertencia';
    if (temp > THRESHOLDS.temp.max || temp < THRESHOLDS.temp.min) return 'advertencia';
    if (hum  > THRESHOLDS.hum.max  || hum  < THRESHOLDS.hum.min)  return 'advertencia';
    return 'normal';
}

function normalize(raw) {
    const ts = typeof raw.timestamp === 'number' ? raw.timestamp : new Date(raw.timestamp).getTime();
    const temp = isNaN(+raw.temperature) ? 0 : +raw.temperature;
    const hum  = isNaN(+raw.humidity)    ? 0 : +raw.humidity;
    const co2  = isNaN(+raw.co2)         ? 0 : +raw.co2;
    return { ts, temp, hum, co2, hw: raw.hardware || 'default', risk: calculateRisk(temp, hum, co2) };
}

function ingest(p) {
    historyData.push(p);
    latestByHardware[p.hw] = p;
    if (historyData.length > 2000) historyData.shift();
    if (!knownHardware.has(p.hw)) {
        knownHardware.add(p.hw);
        addHardwareTab(p.hw);
    }
    readingsToday++;
    if (p.risk !== 'normal') alarmsToday++;
    if (selectedHardware === 'all' || selectedHardware === p.hw) {
        updateCards(p);
        updateCharts();
    }
    updateTable(p);
}

function updateCards(p) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('temp-value',     p.temp.toFixed(1));
    set('humidity-value', p.hum.toFixed(1));
    set('co2-value',      p.co2.toFixed(0));

    const pct = (v, min, max) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
    const tBar = document.getElementById('temp-bar');
    const hBar = document.getElementById('humidity-bar');
    const cBar = document.getElementById('co2-bar');
    if (tBar) tBar.style.width = pct(p.temp, 0, 50) + '%';
    if (hBar) hBar.style.width = Math.min(100, p.hum) + '%';
    if (cBar) cBar.style.width = pct(p.co2, 0, 6000) + '%';

    set('status-hardware', p.hw);
    set('status-count', readingsToday);
    set('status-alarms', alarmsToday);
    set('last-update-time', new Date(p.ts).toLocaleTimeString('es-CO', { hour12: false }));

    const label = document.getElementById('current-status-label');
    if (label) label.textContent = p.risk.toUpperCase() + (selectedHardware === 'all' ? ` — ${p.hw}` : '');
    const pill = document.getElementById('current-status-pill');
    if (pill) pill.className = `current-status-pill status-${p.risk}`;
    const bigBadge = document.getElementById('big-status-badge');
    if (bigBadge) bigBadge.className = `big-status-badge status-${p.risk}`;
    set('big-status-text', p.risk.toUpperCase());
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
        if (latestByHardware[hw]) updateCards(latestByHardware[hw]);
        updateCharts();
    };
    tabs.appendChild(btn);
}

function setConnectionStatus(state) {
    const el = document.getElementById('ws-status');
    if (!el) return;
    el.className = `connection-pill ${state}`;
    el.querySelector('span').textContent = state === 'connected' ? 'En vivo' : 'Desconectado';
}

function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    websocket = new WebSocket(`${protocol}//${location.host}/ws/sensor-data`);
    websocket.onopen = () => { wsAttempts = 0; setConnectionStatus('connected'); };
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
            if (raw.timestamp) ingest(normalize(raw));
        } catch (err) {}
    };
}

function formatTs(ms) {
    return new Date(ms).toLocaleTimeString('es-CO', { hour12: false });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSystemThresholds();
    initCharts();
    connectWS();
    document.getElementById('tab-all')?.addEventListener('click', () => {
        document.querySelectorAll('.sensor-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-all').classList.add('active');
        selectedHardware = 'all';
        if (historyData.length > 0) updateCards(historyData[historyData.length - 1]);
        updateCharts();
    });
});