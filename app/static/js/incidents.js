// incidents.js — Gestión de incidentes SST

const token = () => localStorage.getItem('access_token');

function apiHeaders() {
    return { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' };
}

function formatDt(isoStr) {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function diffMinutes(a, b) {
    if (!a || !b) return null;
    const diff = (new Date(b) - new Date(a)) / 60000;
    if (diff < 60) return `${diff.toFixed(0)} min`;
    return `${(diff/60).toFixed(1)} h`;
}

function statusBadge(status) {
    const map = {
        open:         { label: 'Abierto',       cls: 'inc-status--open' },
        acknowledged: { label: 'En resolución', cls: 'inc-status--acknowledged' },
        resolved:     { label: 'Resuelto',      cls: 'inc-status--resolved' },
    };
    const { label, cls } = map[status] || { label: status, cls: '' };
    return `<span class="inc-status-badge ${cls}">${label}</span>`;
}

function riskBadge(risk) {
    const cls = risk === 'peligro' ? 'inc-risk--peligro' : 'inc-risk--advertencia';
    return `<span class="inc-risk-badge ${cls}">${risk}</span>`;
}

function actionButtons(incident) {
    if (incident.status === 'resolved') return '<span style="color:var(--text-muted);font-size:0.75rem;">—</span>';
    let btns = '';
    if (incident.status === 'open') {
        btns += `<button class="inc-btn-ack" data-id="${incident.id}" data-action="ack">Reconocer</button>`;
    }
    btns += `<button class="inc-btn-res" data-id="${incident.id}" data-action="resolve">Cerrar</button>`;
    return `<div class="inc-action-group">${btns}</div>`;
}

function renderRow(inc) {
    const responseTime = diffMinutes(inc.triggered_at, inc.acknowledged_at);
    const respondedBy = inc.acknowledged_by
        ? `<span class="mono">${inc.acknowledged_by}</span><br><span style="font-size:0.7rem;color:var(--text-muted)">${formatDt(inc.acknowledged_at)}</span>`
        : '--';

    return `<tr>
        <td><span class="mono">#${inc.id}</span></td>
        <td>${statusBadge(inc.status)}</td>
        <td>${riskBadge(inc.risk_level)}</td>
        <td><span class="mono">${inc.hardware}</span></td>
        <td><span class="mono" style="color:${inc.co2 > 1500 ? '#f04040' : inc.co2 > 1000 ? '#ffc107' : 'inherit'}">${inc.co2.toFixed(0)}</span></td>
        <td><span class="mono">${inc.temperature.toFixed(1)}°C</span></td>
        <td><span class="mono">${inc.humidity.toFixed(1)}%</span></td>
        <td><span class="mono" style="font-size:0.76rem">${formatDt(inc.triggered_at)}</span></td>
        <td>${respondedBy}</td>
        <td><span class="mono">${responseTime || '--'}</span></td>
        <td>${actionButtons(inc)}</td>
    </tr>`;
}

async function loadKPIs() {
    try {
        const res = await fetch('/incidents/kpis', { headers: apiHeaders() });
        if (!res.ok) return;
        const k = await res.json();

        document.getElementById('kpi-open').textContent = k.open_count;
        document.getElementById('kpi-ack').textContent = k.acknowledged_count;
        document.getElementById('kpi-resolved').textContent = k.resolved_count;
        document.getElementById('kpi-today').textContent = k.total_today;
        document.getElementById('kpi-response').textContent =
            k.avg_response_minutes != null ? `${k.avg_response_minutes} min` : '--';
        document.getElementById('kpi-resolution').textContent =
            k.avg_resolution_minutes != null ? `${k.avg_resolution_minutes} min` : '--';
    } catch (e) {
        console.error('KPIs error', e);
    }
}

let allIncidents = [];
let knownHardware = new Set();

async function loadIncidents(statusFilter = '', hwFilter = '') {
    const tbody = document.getElementById('inc-table-body');
    tbody.innerHTML = `<tr><td colspan="11"><div class="inc-loading"><div class="spinner"></div><span>Cargando…</span></div></td></tr>`;

    try {
        let url = '/incidents/?limit=200';
        if (statusFilter) url += `&status=${statusFilter}`;
        if (hwFilter) url += `&hardware=${hwFilter}`;

        const res = await fetch(url, { headers: apiHeaders() });
        if (!res.ok) throw new Error(res.statusText);
        allIncidents = await res.json();

        // Populate hw filter
        const hwSelect = document.getElementById('inc-hw-filter');
        const currentHw = hwSelect.value;
        allIncidents.forEach(i => knownHardware.add(i.hardware));
        const existingOpts = [...hwSelect.options].map(o => o.value);
        knownHardware.forEach(hw => {
            if (!existingOpts.includes(hw)) {
                const opt = document.createElement('option');
                opt.value = hw;
                opt.textContent = hw;
                hwSelect.appendChild(opt);
            }
        });
        hwSelect.value = currentHw;

        document.getElementById('inc-count-label').textContent =
            `${allIncidents.length} incidente${allIncidents.length !== 1 ? 's' : ''}`;

        if (allIncidents.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11">
                <div class="inc-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Sin incidentes con los filtros aplicados
                </div>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = allIncidents.map(renderRow).join('');
        attachRowActions();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:2rem;color:var(--text-muted)">Error cargando incidentes</td></tr>`;
        console.error(e);
    }
}

function attachRowActions() {
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const action = btn.getAttribute('data-action');
            if (action === 'ack') {
                await acknowledgeIncident(id);
            } else if (action === 'resolve') {
                openResolveModal(id);
            }
        });
    });
}

async function acknowledgeIncident(id) {
    try {
        const res = await fetch(`/incidents/${id}/acknowledge`, {
            method: 'PUT',
            headers: apiHeaders(),
        });
        if (!res.ok) throw new Error(await res.text());
        await refresh();
    } catch (e) {
        alert(`Error al reconocer: ${e.message}`);
    }
}

function openResolveModal(id) {
    document.getElementById('resolve-incident-id').value = id;
    document.getElementById('resolve-note').value = '';
    document.getElementById('resolve-modal').classList.remove('hidden');
    document.getElementById('resolve-note').focus();
}

function closeResolveModal() {
    document.getElementById('resolve-modal').classList.add('hidden');
}

async function submitResolve() {
    const id = document.getElementById('resolve-incident-id').value;
    const note = document.getElementById('resolve-note').value.trim();
    const btn = document.getElementById('resolve-submit');

    if (note.length < 10) {
        document.getElementById('resolve-note-hint').style.color = '#f04040';
        document.getElementById('resolve-note-hint').textContent = 'La nota debe tener al menos 10 caracteres';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
        const res = await fetch(`/incidents/${id}/resolve`, {
            method: 'PUT',
            headers: apiHeaders(),
            body: JSON.stringify({ resolution_note: note }),
        });
        if (!res.ok) throw new Error(await res.text());
        closeResolveModal();
        await refresh();
    } catch (e) {
        alert(`Error al cerrar: ${e.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Cerrar Incidente';
    }
}

async function refresh() {
    const status = document.getElementById('inc-status-filter').value;
    const hw = document.getElementById('inc-hw-filter').value;
    await Promise.all([loadKPIs(), loadIncidents(status, hw)]);
}

document.addEventListener('DOMContentLoaded', async () => {
    await refresh();

    document.getElementById('inc-refresh-btn').addEventListener('click', refresh);

    document.getElementById('inc-apply-filters').addEventListener('click', () => {
        const status = document.getElementById('inc-status-filter').value;
        const hw = document.getElementById('inc-hw-filter').value;
        loadIncidents(status, hw);
    });
    document.getElementById('inc-clear-filters').addEventListener('click', () => {
        document.getElementById('inc-status-filter').value = '';
        document.getElementById('inc-hw-filter').value = '';
        loadIncidents();
    });

    document.getElementById('resolve-modal-close').addEventListener('click', closeResolveModal);
    document.getElementById('resolve-cancel').addEventListener('click', closeResolveModal);
    document.getElementById('resolve-submit').addEventListener('click', submitResolve);

    // Close modal on backdrop click
    document.getElementById('resolve-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeResolveModal();
    });

    // Restore note hint on input
    document.getElementById('resolve-note').addEventListener('input', () => {
        const hint = document.getElementById('resolve-note-hint');
        hint.style.color = '';
        hint.textContent = 'Mínimo 10 caracteres';
    });

    // Auto-refresh every 60s
    setInterval(refresh, 60000);
});
