let chartCO2 = null;
let chartTH = null;
let websocket = null;
let wsAttempts = 0;
let dbThresholds = null;

const MAX_POINTS = 5;  // Mostrar últimos 5 valores en el eje X

let THRESHOLDS = {
    // Rango normal
    co2:  { low: 400, high: 1000, warning: 1500 },
    temp: { low: 15, high: 30, warning: 35 },
    hum:  { low: 30, high: 60, warning: 70 }
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
            // Cargar umbrales dinámicamente del backend con defaults por compatibilidad
            THRESHOLDS = {
                co2:  { 
                    low: t.co2_low ?? 400, 
                    high: t.co2_high ?? 1000, 
                    warning: t.co2_warning ?? 1500 
                },
                temp: { 
                    low: t.temp_low ?? 15, 
                    high: t.temp_high ?? 30, 
                    warning: t.temp_warning ?? 35 
                },
                hum:  { 
                    low: t.humidity_low ?? 30, 
                    high: t.humidity_high ?? 60, 
                    warning: t.humidity_warning ?? 70 
                }
            };
            console.log('Thresholds loaded:', THRESHOLDS);
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
        // Eje Y dinámico para CO2: usa dataMin/dataMax pero con rango mínimo de 400-1500
        yAxis: makeYAxis(t, 400, 1500, ' ppm'),
        series: [lineSeries([], t.co2, 0, 'CO2')],
        tooltip: { 
            trigger: 'axis',
            formatter: params => {
                if (!params.length) return '';
                const p = params[0];
                const date = new Date(p.value[0]);
                const time = date.toLocaleTimeString('es-CO', { hour12: false });
                return `${time}<br/>CO2: ${p.value[1].toFixed(0)} ppm`;
            }
        }
    });

    chartTH.setOption({
        ...anim,
        grid: { ...grid, right: 44 },
        xAxis: makeXAxis(t),
        yAxis: [
            makeYAxis(t, 0, 50, '°'),
            { ...makeYAxis(t, 0, 100, '%'), position: 'right' }
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
        tooltip: { 
            trigger: 'axis',
            formatter: params => {
                if (!params.length) return '';
                const date = new Date(params[0].value[0]);
                const time = date.toLocaleTimeString('es-CO', { hour12: false });
                let content = `${time}<br/>`;
                params.forEach(p => {
                    const val = p.value[1].toFixed(1);
                    const unit = p.axisIndex === 1 ? '%' : '°';
                    content += `${p.name}: ${val}${unit}<br/>`;
                });
                return content;
            }
        }
    });
}

function updateCharts() {
    const filtered = historyData.filter(d => selectedHardware === 'all' || d.hw === selectedHardware);
    const win = filtered.slice(-MAX_POINTS);
    const co2Data  = win.map(d => [d.ts, d.co2]);
    const tempData = win.map(d => [d.ts, d.temp]);
    const humData  = win.map(d => [d.ts, d.hum]);

    // Calcular rango dinámico para CO2
    let co2Min = 400, co2Max = 1500;
    if (co2Data.length > 0) {
        const co2Values = co2Data.map(d => d[1]);
        const minVal = Math.min(...co2Values);
        const maxVal = Math.max(...co2Values);
        
        // Expandir el rango dinámicamente
        co2Min = Math.floor(Math.min(minVal, 400) / 100) * 100;
        co2Max = Math.ceil(Math.max(maxVal, 1000) / 100) * 100;
        
        // Asegurar un margen mínimo
        const margin = (co2Max - co2Min) * 0.1 || 100;
        co2Min -= margin;
        co2Max += margin;
    }

    chartCO2.setOption({
        yAxis: { min: Math.max(0, co2Min), max: co2Max },
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
    // PELIGRO: Valores críticos
    // CO2 > 1500 ppm, Temp >35°C o <15°C, Humedad >70% o <30%
    if (co2 > THRESHOLDS.co2.warning || temp > THRESHOLDS.temp.warning || temp < THRESHOLDS.temp.low || hum > THRESHOLDS.hum.warning || hum < THRESHOLDS.hum.low) {
        return 'peligro';
    }
    
    // ADVERTENCIA: Valores en zonas de precaución
    // CO2 1000-1500, Temp 30-35°C, Humedad 60-70%
    if (co2 > THRESHOLDS.co2.high || (temp > THRESHOLDS.temp.high && temp <= THRESHOLDS.temp.warning) || hum > THRESHOLDS.hum.high) {
        return 'advertencia';
    }
    
    // NORMAL: Valores dentro de rangos recomendados
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

    // Calcular porcentaje para las barras usando rangos dinámicos
    const tBar = document.getElementById('temp-bar');
    const hBar = document.getElementById('humidity-bar');
    const cBar = document.getElementById('co2-bar');
    
    // Barra de temperatura: 5 a 45°C (rango visual)
    if (tBar) tBar.style.width = Math.min(100, Math.max(0, ((p.temp - 5) / 40) * 100)) + '%';
    
    // Barra de humedad: 0 a 100%
    if (hBar) hBar.style.width = Math.min(100, p.hum) + '%';
    
    // Barra de CO2: dinámico basado en valor máximo reciente + margen
    // Usar rango de 0 a 2000 ppm para visualización
    if (cBar) cBar.style.width = Math.min(100, Math.max(0, (p.co2 / 2000) * 100)) + '%';

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