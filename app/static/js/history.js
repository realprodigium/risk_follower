/* ============================================================
   CO2 Monitor — History Page JS
   ============================================================ */

let allRecords    = [];
let filteredRecords = [];
let sortCol       = 'timestamp';
let sortDir       = 'desc';
const PAGE_SIZE   = 25;
let currentPage   = 1;

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    setupControls();
});

// ---- Load data from API ----
async function loadHistory() {
    try {
        const token = localStorage.getItem('access_token');
        const resp  = await fetch('/records', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (resp.status === 404) {
            // No records yet
            allRecords = [];
            renderAll();
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

        populateDeviceFilter();
        renderAll();

    } catch (err) {
        console.error('Error loading history:', err);
        showTableError('Error al cargar los datos. Intenta recargar.');
    }
}

function renderAll() {
    applyFilters();
    updateStats();
}

// ---- Filters ----
function applyFilters() {
    const search     = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    const deviceFilter = document.getElementById('device-filter').value;
    const dateFrom   = document.getElementById('date-from').value;
    const dateTo     = document.getElementById('date-to').value;

    filteredRecords = allRecords.filter(r => {
        if (search && !r.hardware.toLowerCase().includes(search) && !r.risk.toLowerCase().includes(search)) return false;
        if (statusFilter && r.risk !== statusFilter) return false;
        if (deviceFilter && r.hardware !== deviceFilter) return false;
        if (dateFrom) {
            const from = new Date(dateFrom).getTime();
            const rts  = new Date(r.timestamp).getTime();
            if (rts < from) return false;
        }
        if (dateTo) {
            const to  = new Date(dateTo).getTime();
            const rts = new Date(r.timestamp).getTime();
            if (rts > to) return false;
        }
        return true;
    });

    // Sort
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

    currentPage = 1;
    renderTable();
    renderPagination();
}

function renderTable() {
    const tbody = document.getElementById('history-table-body');
    const start = (currentPage - 1) * PAGE_SIZE;
    const page  = filteredRecords.slice(start, start + PAGE_SIZE);

    const label = document.getElementById('records-count-label');
    label.textContent = `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, filteredRecords.length)} de ${filteredRecords.length} registros`;

    if (page.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">
            <div class="loading-state">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>No se encontraron registros con los filtros actuales.</span>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = page.map(r => {
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

function renderPagination() {
    const total = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
    document.getElementById('current-page').textContent = currentPage;
    document.getElementById('total-pages').textContent  = total;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= total;
}

function updateStats() {
    document.getElementById('total-records').textContent = allRecords.length;

    const alarms  = allRecords.filter(r => r.risk !== 'normal').length;
    document.getElementById('alarm-records').textContent = alarms;

    const devices = new Set(allRecords.map(r => r.hardware)).size;
    document.getElementById('devices-count').textContent = devices;
}

function populateDeviceFilter() {
    const devices = [...new Set(allRecords.map(r => r.hardware))].sort();
    const sel = document.getElementById('device-filter');
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        sel.appendChild(opt);
    });
}

// ---- Sorting ----
function setupControls() {
    // Sort headers
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortCol = col;
                sortDir = col === 'timestamp' ? 'desc' : 'asc';
            }

            document.querySelectorAll('.sortable').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            applyFilters();
        });
    });

    // Initial sort indicator
    const defaultTh = document.querySelector('[data-col="timestamp"]');
    if (defaultTh) defaultTh.classList.add('sort-desc');

    // Filter buttons
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        document.getElementById('status-filter').value = '';
        document.getElementById('device-filter').value = '';
        document.getElementById('date-from').value = '';
        document.getElementById('date-to').value = '';
        applyFilters();
    });

    // Search on type
    document.getElementById('search-input').addEventListener('input', debounce(applyFilters, 300));

    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderTable(); renderPagination(); }
    });
    document.getElementById('next-page').addEventListener('click', () => {
        const total = Math.ceil(filteredRecords.length / PAGE_SIZE);
        if (currentPage < total) { currentPage++; renderTable(); renderPagination(); }
    });

    // Refresh
    document.getElementById('refresh-btn').addEventListener('click', () => {
        const btn = document.getElementById('refresh-btn');
        btn.classList.add('spinning');
        loadHistory().finally(() => {
            setTimeout(() => btn.classList.remove('spinning'), 600);
        });
    });

    // Export CSV
    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
        });
    }

    // User display (from token)
    loadUserInfo();
}

function loadUserInfo() {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login'; return; }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const name = payload.sub || 'Usuario';
        document.getElementById('user-display').textContent = name;
        document.getElementById('user-avatar').textContent = name[0].toUpperCase();
        const role = payload.role || '';
        document.getElementById('user-role').textContent = role;
    } catch(e) {}
}

// ---- Export ----
function exportCSV() {
    const data = filteredRecords.length > 0 ? filteredRecords : allRecords;
    let csv = 'ID,Timestamp,Hardware,Temperatura_C,Humedad_pct,CO2_PPM,Estado\n';
    data.forEach(r => {
        csv += `${r.id},"${r.timestamp}",${r.hardware},${r.temperature},${r.humidity},${r.co2},${r.risk}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `co2_historial_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---- Error state ----
function showTableError(msg) {
    document.getElementById('history-table-body').innerHTML = `
        <tr><td colspan="7">
            <div class="loading-state" style="color:var(--red)">${msg}</div>
        </td></tr>`;
}

// ---- Helpers ----
function riskLabel(risk) {
    const map = { normal: 'Normal', alto: 'Alto', bajo: 'Bajo', high: 'Alto', low: 'Bajo' };
    return map[risk] || risk;
}

function formatTimestamp(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
