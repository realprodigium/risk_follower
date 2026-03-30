let allRecords      = [];
let filteredRecords = [];
let sortCol         = 'timestamp';
let sortDir         = 'desc';
const PAGE_SIZE     = 25;
let currentPage     = 1;
let totalFromServer = 0;

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    setupControls();
});

function buildQueryParams(forExport = false) {
    const params = new URLSearchParams();

    const hardware  = document.getElementById('device-filter').value;
    const risk      = document.getElementById('status-filter').value;
    const dateFrom  = document.getElementById('date-from').value;
    const dateTo    = document.getElementById('date-to').value;

    if (hardware)  params.set('hardware',  hardware);
    if (risk)      params.set('risk',      risk);
    if (dateFrom)  params.set('date_from', new Date(dateFrom).toISOString());
    if (dateTo)    params.set('date_to',   new Date(dateTo).toISOString());

    if (!forExport) {
        params.set('limit',  PAGE_SIZE);
        params.set('offset', (currentPage - 1) * PAGE_SIZE);
    } else {
        params.set('limit',  5000);
        params.set('offset', 0);
    }

    return params.toString();
}

async function loadHistory(resetPage = true) {
    if (resetPage) currentPage = 1;

    setTableLoading(true);

    try {
        const token = localStorage.getItem('access_token');
        const qs    = buildQueryParams();
        const resp  = await fetch(`/records?${qs}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp.status === 401) { window.location.href = '/login'; return; }

        if (resp.status === 404) {
            allRecords      = [];
            filteredRecords = [];
            renderTable();
            renderPagination(0);
            updateStats([]);
            return;
        }

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        allRecords = data.map(r => ({
            id:          r.id,
            timestamp:   r.timestamp,
            hardware:    r.hardware,
            temperature: parseFloat(r.temperature),
            humidity:    parseFloat(r.humidity),
            co2:         parseFloat(r.co2),
            risk:        r.risk
        }));

        populateDeviceFilter(allRecords);
        applyClientSort();
        updateStats(allRecords);

    } catch (err) {
        console.error('Error loading history:', err);
        showTableError('Error al cargar los datos. Intenta recargar.');
    } finally {
        setTableLoading(false);
    }
}

function applyClientSort() {
    filteredRecords = [...allRecords];

    const search = document.getElementById('search-input').value.toLowerCase();
    if (search) {
        filteredRecords = filteredRecords.filter(r =>
            r.hardware.toLowerCase().includes(search) ||
            r.risk.toLowerCase().includes(search)
        );
    }

    filteredRecords.sort((a, b) => {
        let va = a[sortCol];
        let vb = b[sortCol];
        if (sortCol === 'timestamp') {
            va = new Date(va).getTime();
            vb = new Date(vb).getTime();
        }
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
    });

    renderTable();
    renderPagination(filteredRecords.length);
}

function renderTable() {
    const tbody = document.getElementById('history-table-body');

    const label = document.getElementById('records-count-label');

    if (!filteredRecords.length) {
        label.textContent = '0 registros';
        tbody.innerHTML = `<tr><td colspan="7">
            <div class="loading-state">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>No se encontraron registros con los filtros actuales.</span>
            </div>
        </td></tr>`;
        return;
    }

    label.textContent = `${filteredRecords.length} registros (página ${currentPage})`;

    tbody.innerHTML = filteredRecords.map(r => {
        const ts = formatTimestamp(r.timestamp);
        return `<tr>
            <td class="ts-cell" style="color:var(--text-muted)">${r.id}</td>
            <td class="ts-cell">${ts}</td>
            <td><span class="hw-badge">${r.hardware}</span></td>
            <td class="val-cell temp">${r.temperature.toFixed(1)}</td>
            <td class="val-cell humidity">${r.humidity.toFixed(1)}</td>
            <td class="val-cell co2">${r.co2.toFixed(0)}</td>
            <td><span class="sbadge status-${r.risk}">${riskLabel(r.risk)}</span></td>
        </tr>`;
    }).join('');
}

function renderPagination(total) {
    document.getElementById('current-page').textContent = currentPage;
    document.getElementById('total-pages').textContent  = '?';
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = allRecords.length < PAGE_SIZE;
}

function updateStats(records) {
    const alarms  = records.filter(r => r.risk !== 'normal').length;
    const devices = new Set(records.map(r => r.hardware)).size;
    document.getElementById('total-records').textContent = records.length;
    document.getElementById('alarm-records').textContent  = alarms;
    document.getElementById('devices-count').textContent  = devices;
}

function populateDeviceFilter(records) {
    const sel     = document.getElementById('device-filter');
    const current = sel.value;
    const known   = new Set([...sel.options].map(o => o.value));
    const devices = [...new Set(records.map(r => r.hardware))].sort();
    devices.forEach(d => {
        if (!known.has(d)) {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d;
            sel.appendChild(opt);
        }
    });
    if (current) sel.value = current;
}

function setupControls() {
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortCol = col;
                sortDir = col === 'timestamp' ? 'desc' : 'asc';
            }
            document.querySelectorAll('.sortable').forEach(h =>
                h.classList.remove('sort-asc', 'sort-desc')
            );
            th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            applyClientSort();
        });
    });

    const defaultTh = document.querySelector('[data-col="timestamp"]');
    if (defaultTh) defaultTh.classList.add('sort-desc');

    document.getElementById('apply-filters').addEventListener('click', () => loadHistory(true));

    document.getElementById('clear-filters').addEventListener('click', () => {
        document.getElementById('search-input').value  = '';
        document.getElementById('status-filter').value = '';
        document.getElementById('device-filter').value = '';
        document.getElementById('date-from').value     = '';
        document.getElementById('date-to').value       = '';
        loadHistory(true);
    });

    document.getElementById('search-input').addEventListener('input', debounce(applyClientSort, 300));

    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; loadHistory(false); }
    });
    document.getElementById('next-page').addEventListener('click', () => {
        if (allRecords.length >= PAGE_SIZE) { currentPage++; loadHistory(false); }
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
        const btn = document.getElementById('refresh-btn');
        btn.classList.add('spinning');
        loadHistory(true).finally(() =>
            setTimeout(() => btn.classList.remove('spinning'), 600)
        );
    });

    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
        });
    }

    loadUserInfo();
}

function loadUserInfo() {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login'; return; }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const name = payload.sub || 'Usuario';
        document.getElementById('user-display').textContent = name;
        document.getElementById('user-avatar').textContent  = name[0].toUpperCase();
        document.getElementById('user-role').textContent    = payload.role || '';
    } catch (e) {}
}

async function exportCSV() {
    try {
        const token = localStorage.getItem('access_token');
        const qs    = buildQueryParams(true);
        const resp  = await fetch(`/records?${qs}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        let csv = 'ID,Timestamp,Hardware,Temperatura_C,Humedad_pct,CO2_PPM,Estado\n';
        data.forEach(r => {
            csv += `${r.id},"${r.timestamp}",${r.hardware},${r.temperature},${r.humidity},${r.co2},${r.risk}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `co2_historial_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Export error:', err);
    }
}

function setTableLoading(loading) {
    if (loading) {
        document.getElementById('history-table-body').innerHTML = `
            <tr><td colspan="7">
                <div class="loading-state"><div class="spinner"></div><span>Cargando registros...</span></div>
            </td></tr>`;
    }
}

function showTableError(msg) {
    document.getElementById('history-table-body').innerHTML = `
        <tr><td colspan="7">
            <div class="loading-state" style="color:var(--red)">${msg}</div>
        </td></tr>`;
}
function riskLabel(risk) {
    const map = { normal: 'Normal', alto: 'Alto', bajo: 'Bajo', high: 'Alto', low: 'Bajo' };
    return map[risk] || risk;
}

function formatTimestamp(ts) {
    const d   = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}