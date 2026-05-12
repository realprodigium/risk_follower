let chartCO2 = null;
let chartTH = null;
let websocket = null;
let wsAttempts = 0;
let dbThresholds = null;

const MAX_POINTS = 5;

let THRESHOLDS = {
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
let lastDataTime = {}; // Para monitorear latencia de hardware
const HEARTBEAT_THRESHOLD = 15000; // 15 seg sin datos = stale
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
            updateBarGradients();
        }
    } catch (e) {
        console.error("Failed to load thresholds", e);
    }
}

function updateBarGradients() {
    //mantener gradientes para usar en otros backgrounds
}

function updateGauge(id, percent, risk) {
    const el = document.getElementById(id);
    if (!el) return;
    const totalLength = 126; // Pi * radius (40) roughly
    const offset = totalLength - (percent * totalLength / 100);
    el.style.strokeDashoffset = offset;
    
    // Cambiar color del gauge según el riesgo del sensor
    const colors = {
        normal:      'var(--status-normal-fg)',
        advertencia: 'var(--status-advertencia-fg)',
        peligro:     'var(--status-peligro-fg)'
    };
    el.style.stroke = colors[risk] || colors.normal;
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
    const grid = { left: 15, right: 15, top: 14, bottom: 28, containLabel: true };
    const anim = {
        animation: true,
        animationDuration: 400,
        animationDurationUpdate: 300
    };

    chartCO2.setOption({
        ...anim,
        grid,
        xAxis: makeXAxis(t),
        yAxis: makeYAxis(t, 400, 1500, ' ppm'),
        series: [lineSeries([], t.co2, 0, 'CO2')],
        tooltip: { 
            trigger: 'axis',
            formatter: params => {
                if (!params.length) return '';
                const p = params[0];
                const date = new Date(p.value[0]);
                const h = String(date.getHours()).padStart(2, '0');
                const m = String(date.getMinutes()).padStart(2, '0');
                return `${h}:${m}<br/>CO2: ${p.value[1].toFixed(0)} ppm`;
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
                const h = String(date.getHours()).padStart(2, '0');
                const m = String(date.getMinutes()).padStart(2, '0');
                let content = `${h}:${m}<br/>`;
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

    let co2Min, co2Max;
    if (co2Data.length > 0) {
        const co2Values = co2Data.map(d => d[1]);
        const minVal = Math.min(...co2Values);
        const maxVal = Math.max(...co2Values);
        
        // Rango adaptativo con margen del 10%
        const range = maxVal - minVal;
        const margin = Math.max(range * 0.1, 100);
        
        co2Min = Math.floor((minVal - margin) / 100) * 100;
        co2Max = Math.ceil((maxVal + margin) / 100) * 100;
        
        if (co2Min < 0) co2Min = 0;
    }

    chartCO2.setOption({
        yAxis: { min: CHART_RANGES.co2.min, max: CHART_RANGES.co2.max },
        series: [{ 
            data: co2Data,
            markArea: {
                silent: true,
                data: [
                    [
                        { yAxis: 0, itemStyle: { color: 'rgba(29,211,138,0.03)' } },
                        { yAxis: THRESHOLDS.co2.high }
                    ],
                    [
                        { yAxis: THRESHOLDS.co2.high, itemStyle: { color: 'rgba(255,193,7,0.06)' } },
                        { yAxis: THRESHOLDS.co2.warning }
                    ],
                    [
                        { yAxis: THRESHOLDS.co2.warning, itemStyle: { color: 'rgba(240,64,64,0.06)' } },
                        { yAxis: CHART_RANGES.co2.max }
                    ]
                ]
            },
            markLine: {
                symbol: ['none', 'none'],
                data: [
                    { yAxis: THRESHOLDS.co2.high, lineStyle: { color: '#ffc107', opacity: 0.4, type: 'dashed' }, label: { formatter: 'Límite Advertencia', position: 'end', fontSize: 9 } },
                    { yAxis: THRESHOLDS.co2.warning, lineStyle: { color: '#f04040', opacity: 0.4, type: 'dashed' }, label: { formatter: 'Límite Peligro', position: 'end', fontSize: 9 } }
                ]
            }
        }]
    });

    chartTH.setOption({
        series: [
            { 
                name: 'Temp', 
                data: tempData,
                markArea: {
                    silent: true,
                    data: [
                        [
                            { yAxis: THRESHOLDS.temp.low, itemStyle: { color: 'rgba(29,211,138,0.03)' } },
                            { yAxis: THRESHOLDS.temp.high }
                        ]
                    ]
                },
                markLine: {
                    symbol: ['none', 'none'],
                    data: [
                        { yAxis: THRESHOLDS.temp.low, lineStyle: { color: '#f04040', opacity: 0.2 }, label: { show: false } },
                        { yAxis: THRESHOLDS.temp.high, lineStyle: { color: '#ffc107', opacity: 0.2 }, label: { show: false } },
                        { yAxis: THRESHOLDS.temp.warning, lineStyle: { color: '#f04040', opacity: 0.2 }, label: { show: false } }
                    ]
                }
            },
            { 
                name: 'Hum',  
                data: humData,
                markLine: {
                    symbol: ['none', 'none'],
                    data: [
                        { yAxis: THRESHOLDS.hum.low, yAxisIndex: 1, lineStyle: { color: '#f04040', opacity: 0.2 }, label: { show: false } },
                        { yAxis: THRESHOLDS.hum.high, yAxisIndex: 1, lineStyle: { color: '#ffc107', opacity: 0.2 }, label: { show: false } }
                    ]
                }
            }
        ]
    });
}

function calculateRisk(temp, hum, co2) {
    if (co2 > THRESHOLDS.co2.warning || temp > THRESHOLDS.temp.warning || temp < THRESHOLDS.temp.low || hum > THRESHOLDS.hum.warning || hum < THRESHOLDS.hum.low) {
        return 'peligro';
    }
    
    if (co2 > THRESHOLDS.co2.high || (temp > THRESHOLDS.temp.high && temp <= THRESHOLDS.temp.warning) || hum > THRESHOLDS.hum.high) {
        return 'advertencia';
    }
    
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

    // Update Gauges
    const tRange = CHART_RANGES.temp.max - CHART_RANGES.temp.min;
    const tPercent = ((p.temp - CHART_RANGES.temp.min) / tRange) * 100;
    let tRisk = 'normal';
    if (p.temp > THRESHOLDS.temp.warning || p.temp < THRESHOLDS.temp.low) tRisk = 'peligro';
    else if (p.temp > THRESHOLDS.temp.high) tRisk = 'advertencia';
    updateGauge('temp-gauge-fill', Math.min(100, Math.max(0, tPercent)), tRisk);
    document.getElementById('temp-value').style.color = `var(--status-${tRisk}-fg)`;

    const hRange = CHART_RANGES.hum.max - CHART_RANGES.hum.min;
    const hPercent = ((p.hum - CHART_RANGES.hum.min) / hRange) * 100;
    let hRisk = 'normal';
    if (p.hum > THRESHOLDS.hum.warning || p.hum < THRESHOLDS.hum.low) hRisk = 'peligro';
    else if (p.hum > THRESHOLDS.hum.high) hRisk = 'advertencia';
    updateGauge('humidity-gauge-fill', Math.min(100, Math.max(0, hPercent)), hRisk);
    document.getElementById('humidity-value').style.color = `var(--status-${hRisk}-fg)`;

    const cRange = CHART_RANGES.co2.max - CHART_RANGES.co2.min;
    const cPercent = ((p.co2 - CHART_RANGES.co2.min) / cRange) * 100;
    let cRisk = 'normal';
    if (p.co2 > THRESHOLDS.co2.warning) cRisk = 'peligro';
    else if (p.co2 > THRESHOLDS.co2.high) cRisk = 'advertencia';
    updateGauge('co2-gauge-fill', Math.min(100, Math.max(0, cPercent)), cRisk);
    document.getElementById('co2-value').style.color = `var(--status-${cRisk}-fg)`;

    set('status-hardware', p.hw);
    set('status-count', readingsToday);
    set('status-alarms', alarmsToday);
    const lastDate = new Date(p.ts);
    const lh = String(lastDate.getHours()).padStart(2, '0');
    const lm = String(lastDate.getMinutes()).padStart(2, '0');
    const ls = String(lastDate.getSeconds()).padStart(2, '0');
    set('last-update-time', `${lh}:${lm}:${ls}`);

    const label = document.getElementById('current-status-label');
    if (label) label.textContent = p.risk.toUpperCase() + (selectedHardware === 'all' ? ` — ${p.hw}` : '');
    const pill = document.getElementById('current-status-pill');
    if (pill) pill.className = `current-status-pill status-${p.risk}`;
    const bigBadge = document.getElementById('big-status-badge');
    if (bigBadge) bigBadge.className = `big-status-badge status-${p.risk}`;
    set('big-status-text', p.risk.toUpperCase());
    updateAlarmBanner(p);
}

function updateAlarmBanner(p) {
    const banner = document.getElementById('alarm-banner');
    const modal = document.getElementById('risk-modal');
    const overlay = document.getElementById('alarm-overlay');
    const modalTitle = document.getElementById('modal-risk-title');
    const modalMetrics = document.getElementById('modal-metrics');
    const modalInstr = document.getElementById('modal-instructions-list');

    if (!modal) return;

    if (p.risk !== 'normal') {
        // Mostrar Modal y Overlay
        modal.classList.remove('hidden');
        modal.className = `modal-backdrop status-${p.risk}`;
        if (overlay) {
            if (p.risk === 'peligro') overlay.classList.add('active');
            else overlay.classList.remove('active');
        }

        // Título del Modal
        modalTitle.textContent = p.risk === 'peligro' ? 'ALERTA: PELIGRO CRÍTICO' : 'AVISO: RIESGO DETECTADO';

        // Métricas en el Modal
        let failing = [];
        if (p.co2 > THRESHOLDS.co2.high) failing.push({ label: 'CO2', val: p.co2.toFixed(0), unit: 'PPM' });
        if (p.temp > THRESHOLDS.temp.high || p.temp < THRESHOLDS.temp.low) failing.push({ label: 'TEMP', val: p.temp.toFixed(1), unit: '°C' });
        if (p.hum > THRESHOLDS.hum.high || p.hum < THRESHOLDS.hum.low) failing.push({ label: 'HUM', val: p.hum.toFixed(1), unit: '%' });

        modalMetrics.innerHTML = failing.map(s => `
            <div class="modal-metric-badge">
                <div class="modal-metric-label">${s.label}</div>
                <div class="modal-metric-value">${s.val} <small>${s.unit}</small></div>
            </div>
        `).join('');

        // Protocolos según Riesgo
        const protocols = {
            peligro: [
                'Evacuar el área de fermentación inmediatamente.',
                'Ventilar el espacio abriendo todas las salidas de aire.',
                'Notificar al responsable de SST y brigada de emergencia.',
                'No reingresar hasta que los niveles vuelvan a rango normal.'
            ],
            advertencia: [
                'Aumentar la ventilación mecánica en el área.',
                'Monitorear visualmente el comportamiento de los sensores.',
                'Verificar posibles fugas en las válvulas de alivio.',
                'Prepararse para una posible evacuación si los niveles suben.'
            ]
        };

        const currentProtocol = protocols[p.risk] || protocols.advertencia;
        modalInstr.innerHTML = currentProtocol.map(step => `<li>${step}</li>`).join('');

        // Mantener banner oculto si usamos el modal
        if (banner) banner.classList.add('hidden');
        document.body.classList.add('alarm-active');
    } else {
        modal.classList.add('hidden');
        if (overlay) overlay.classList.remove('active');
        if (banner) banner.classList.add('hidden');
        document.body.classList.remove('alarm-active');
    }
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
    if (!tabs || tabs.querySelector(`[data-hw="${hw}"]`)) return;
    const btn = document.createElement('button');
    btn.className = 'sensor-tab';
    btn.setAttribute('data-hw', hw);
    btn.innerHTML = `<span class="heartbeat-dot"></span> ${hw}`;
    btn.onclick = () => {
        document.querySelectorAll('.sensor-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedHardware = hw;
        updateCharts();
    };
    tabs.appendChild(btn);
}

function setConnectionStatus(state) {
    const el = document.getElementById('ws-status');
    const overlay = document.getElementById('connection-overlay');
    if (!el) return;
    
    el.className = `connection-pill ${state}`;
    el.querySelector('span').textContent = state === 'connected' ? 'En vivo' : 'Desconectado';
    
    if (overlay) {
        if (state === 'connected') overlay.classList.remove('active');
        else overlay.classList.add('active');
    }
}

function checkHeartbeats() {
    const now = Date.now();
    const pills = document.querySelectorAll('.sensor-tab');
    pills.forEach(pill => {
        const hw = pill.getAttribute('data-hw');
        if (hw === 'all') return;
        
        const last = lastDataTime[hw] || 0;
        const diff = now - last;
        
        const dot = pill.querySelector('.heartbeat-dot');
        if (!dot) return;

        if (last === 0) dot.className = 'heartbeat-dot';
        else if (diff > 45000) dot.className = 'heartbeat-dot dead';
        else if (diff > HEARTBEAT_THRESHOLD) dot.className = 'heartbeat-dot stale';
        else dot.className = 'heartbeat-dot active';
    });
}

function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    websocket = new WebSocket(`${protocol}//${location.host}/ws/sensor-data`);
    websocket.onopen = () => { 
        wsAttempts = 0; 
        setConnectionStatus('connected');
        console.log('WS Connected');
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
            if (raw.timestamp) {
                lastDataTime[raw.hardware] = Date.now();
                ingest(normalize(raw));
            }
        } catch (err) {}
    };
}

function formatTs(ms) {
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSystemThresholds();
    initCharts();
    connectWS();
    
    // Iniciar monitoreo de latencia
    setInterval(checkHeartbeats, 5000);
    document.getElementById('tab-all')?.addEventListener('click', () => {
        document.querySelectorAll('.sensor-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-all').classList.add('active');
        selectedHardware = 'all';
        if (historyData.length > 0) updateCards(historyData[historyData.length - 1]);
        updateCharts();
    });

    document.getElementById('alarm-dismiss')?.addEventListener('click', () => {
        document.getElementById('alarm-banner').classList.add('hidden');
        document.body.classList.remove('alarm-active');
    });
});