// analytics.js — Industrial Analytics Dashboard

let chartPie = null;
let chartHourly = null;

function token() { return localStorage.getItem('access_token'); }
function apiHeaders() {
    return { 'Authorization': `Bearer ${token()}` };
}
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ─── Chart init ───────────────────────────────────────────────
function initCharts() {
    chartPie    = echarts.init(document.getElementById('chart-risk-pie'));
    chartHourly = echarts.init(document.getElementById('chart-co2-hourly'));
    window.addEventListener('resize', () => {
        chartPie.resize();
        chartHourly.resize();
    });
}

function renderPieChart(normal, warning, danger) {
    const t = {
        text:  cssVar('--text-secondary'),
        bg:    cssVar('--bg-card'),
    };
    chartPie.setOption({
        backgroundColor: 'transparent',
        animation: true,
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c}% ({d}%)',
        },
        series: [{
            type: 'pie',
            radius: ['52%', '78%'],
            center: ['50%', '48%'],
            avoidLabelOverlap: true,
            padAngle: 3,
            itemStyle: { borderRadius: 6, borderColor: t.bg, borderWidth: 2 },
            label: { show: false },
            emphasis: {
                label: {
                    show: true,
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: t.text,
                    formatter: '{b}\n{c}%',
                }
            },
            data: [
                { value: normal,  name: 'Normal',      itemStyle: { color: '#1dd38a' } },
                { value: warning, name: 'Advertencia', itemStyle: { color: '#ffc107' } },
                { value: danger,  name: 'Peligro',     itemStyle: { color: '#f04040' } },
            ],
        }],
    }, true);
}

function renderHourlyChart(data) {
    if (!data || data.length === 0) {
        chartHourly.setOption({ title: { text: 'Sin datos suficientes', left: 'center', top: 'middle', textStyle: { color: cssVar('--text-muted'), fontSize: 13 } } }, true);
        return;
    }
    const t = {
        text:  cssVar('--text-secondary'),
        grid:  cssVar('--border-subtle'),
        co2:   cssVar('--chart-co2'),
    };
    const times   = data.map(d => d.hour);
    const avgCo2  = data.map(d => d.avg_co2);
    const maxCo2  = data.map(d => d.max_co2);

    chartHourly.setOption({
        backgroundColor: 'transparent',
        animation: true,
        animationDuration: 500,
        grid: { left: 16, right: 16, top: 20, bottom: 32, containLabel: true },
        tooltip: {
            trigger: 'axis',
            formatter(params) {
                const h = params[0].axisValue.slice(11, 16);
                return params.map(p =>
                    `${p.marker} ${p.seriesName}: <b>${p.value} ppm</b>`
                ).join('<br>') + `<br><small>${params[0].axisValue.slice(0,10)} ${h}h</small>`;
            }
        },
        legend: {
            show: true,
            right: 8,
            top: 0,
            textStyle: { color: t.text, fontSize: 10 },
            data: ['Prom. CO₂', 'Máx. CO₂'],
        },
        xAxis: {
            type: 'category',
            data: times,
            axisLine:  { lineStyle: { color: t.grid } },
            axisTick:  { show: false },
            axisLabel: {
                color: t.text,
                fontSize: 9,
                fontFamily: 'JetBrains Mono, monospace',
                interval: Math.max(0, Math.floor(times.length / 10) - 1),
                formatter: v => v.slice(11, 16),
            },
            splitLine: { show: false },
        },
        yAxis: {
            name: 'PPM',
            nameTextStyle: { color: t.text, fontSize: 9 },
            splitLine: { lineStyle: { color: t.grid, type: 'dashed', opacity: 0.5 } },
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: t.text, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
        },
        series: [
            {
                name: 'Prom. CO₂',
                type: 'line',
                data: avgCo2,
                smooth: 0.3,
                showSymbol: false,
                lineStyle: { color: t.co2, width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: t.co2 + '30' },
                        { offset: 1, color: t.co2 + '04' },
                    ])
                },
            },
            {
                name: 'Máx. CO₂',
                type: 'line',
                data: maxCo2,
                smooth: 0.3,
                showSymbol: false,
                lineStyle: { color: '#f04040', width: 1.5, type: 'dashed' },
            },
        ],
        // Mark danger threshold
        graphic: [],
    }, true);
}

// ─── Load Analytics Summary ────────────────────────────────────
async function loadSummary(hours) {
    try {
        const res = await fetch(`/admin/analytics?hours=${hours}`, { headers: apiHeaders() });
        if (!res.ok) throw new Error(res.statusText);
        const d = await res.json();

        // CO2
        document.getElementById('an-co2-avg').textContent  = d.co2.avg.toFixed(1);
        document.getElementById('an-co2-min').textContent  = `Mín: ${d.co2.min_val.toFixed(0)}`;
        document.getElementById('an-co2-max').textContent  = `Máx: ${d.co2.max_val.toFixed(0)}`;
        document.getElementById('an-co2-p95').textContent  = `P95: ${d.co2.p95.toFixed(0)}`;
        // Temp
        document.getElementById('an-temp-avg').textContent = d.temperature.avg.toFixed(1);
        document.getElementById('an-temp-min').textContent = `Mín: ${d.temperature.min_val.toFixed(1)}`;
        document.getElementById('an-temp-max').textContent = `Máx: ${d.temperature.max_val.toFixed(1)}`;
        document.getElementById('an-temp-p95').textContent = `P95: ${d.temperature.p95.toFixed(1)}`;
        // Humidity
        document.getElementById('an-hum-avg').textContent  = d.humidity.avg.toFixed(1);
        document.getElementById('an-hum-min').textContent  = `Mín: ${d.humidity.min_val.toFixed(1)}`;
        document.getElementById('an-hum-max').textContent  = `Máx: ${d.humidity.max_val.toFixed(1)}`;
        document.getElementById('an-hum-p95').textContent  = `P95: ${d.humidity.p95.toFixed(1)}`;
        // Count
        document.getElementById('an-total').textContent = d.total_records.toLocaleString();

        // Pie chart
        renderPieChart(d.normal_pct, d.warning_pct, d.danger_pct);

        // Legend
        document.getElementById('an-normal-pct').textContent  = `${d.normal_pct}%`;
        document.getElementById('an-warning-pct').textContent = `${d.warning_pct}%`;
        document.getElementById('an-danger-pct').textContent  = `${d.danger_pct}%`;

        // Period label
        const hoursLabel = {
            '6': 'Últimas 6h', '24': 'Últimas 24h',
            '72': 'Últimos 3 días', '168': 'Última semana', '720': 'Último mes'
        };
        document.getElementById('an-risk-period').textContent =
            hoursLabel[String(hours)] || `Últimas ${hours}h`;

    } catch (e) {
        console.error('Analytics summary error:', e);
    }
}

async function loadHourly(days) {
    try {
        const res = await fetch(`/admin/analytics/hourly?days=${days}`, { headers: apiHeaders() });
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        renderHourlyChart(data);
    } catch (e) {
        console.error('Hourly analytics error:', e);
    }
}

// ─── Observability (parse Prometheus text) ─────────────────────
async function loadObservability() {
    try {
        const res = await fetch('/admin/metrics', { headers: apiHeaders() });
        if (!res.ok) throw new Error(res.statusText);
        const text = await res.text();

        const extract = (key) => {
            const m = text.match(new RegExp(`^${key}\\s+(\\S+)`, 'm'));
            return m ? m[1] : '--';
        };

        const uptime = parseInt(extract('co2monitor_uptime_seconds'));
        const uptimeStr = isNaN(uptime) ? '--'
            : uptime < 3600 ? `${Math.floor(uptime/60)} min`
            : uptime < 86400 ? `${(uptime/3600).toFixed(1)} h`
            : `${(uptime/86400).toFixed(1)} días`;

        const mqttVal = extract('co2monitor_mqtt_connected');
        const mqttEl  = document.getElementById('obs-mqtt');
        if (mqttEl) {
            mqttEl.textContent = mqttVal === '1' ? 'Conectado' : 'Desconectado';
            mqttEl.className = 'an-obs-value ' + (mqttVal === '1' ? 'ok' : 'error');
        }

        const setObs = (id, val, cls) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = val;
            if (cls) el.className = 'an-obs-value ' + cls;
        };

        setObs('obs-uptime',    uptimeStr);
        setObs('obs-total',     parseInt(extract('co2monitor_records_total')).toLocaleString());
        setObs('obs-today',     extract('co2monitor_records_today'));
        setObs('obs-alarms',    parseInt(extract('co2monitor_alarm_records_total')).toLocaleString());

        const openInc = parseInt(extract('co2monitor_incidents_open'));
        setObs('obs-open-inc', openInc, openInc > 0 ? 'warning' : 'ok');

        setObs('obs-res-inc',   extract('co2monitor_incidents_resolved_total'));

        const todayInc = parseInt(extract('co2monitor_incidents_today'));
        setObs('obs-inc-today', todayInc, todayInc > 0 ? 'warning' : '');

    } catch (e) {
        console.error('Observability error:', e);
    }
}

// ─── Refresh all ──────────────────────────────────────────────
async function refreshAll() {
    const hours = parseInt(document.getElementById('an-hours').value) || 24;
    const days  = Math.max(1, Math.ceil(hours / 24));
    await Promise.all([
        loadSummary(hours),
        loadHourly(days),
        loadObservability(),
    ]);
}

window.refreshCharts = function() {
    const hours = parseInt(document.getElementById('an-hours').value) || 24;
    const days  = Math.max(1, Math.ceil(hours / 24));
    loadHourly(days);
    loadSummary(hours);
};

// ─── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    await refreshAll();

    document.getElementById('an-refresh').addEventListener('click', refreshAll);
    document.getElementById('an-hours').addEventListener('change', refreshAll);

    // Auto-refresh every 2 minutes
    setInterval(refreshAll, 120000);
});
