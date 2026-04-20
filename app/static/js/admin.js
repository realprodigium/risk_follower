document.addEventListener('DOMContentLoaded', () => {
    loadAll(); setupCreateUser(); setupThresholds();
    setupModal(); setupRefreshAll();

    document.getElementById('refresh-audit').addEventListener('click', loadAudit);
});

async function api(url, options = {}) {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login'; return null; }

    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    if (res.status === 401) { window.location.href = '/login'; return null; }
    if (res.status === 403) { window.location.href = '/'; return null; }
    return res;
}

function loadAll() {loadStats();loadUsers();loadThresholds();loadAudit();}

async function loadStats() {
    const res = await api('/admin/stats');
    if (!res || !res.ok) return;
    const d = await res.json();
    document.getElementById('stat-records').textContent = d.total_records.toLocaleString();
    document.getElementById('stat-users').textContent = d.total_users;
    document.getElementById('stat-devices').textContent = d.active_devices;
    document.getElementById('stat-alarms').textContent = d.alarms_count.toLocaleString();
    document.getElementById('stat-today').textContent = d.records_today.toLocaleString();
}

async function loadUsers() {
    const res = await api('/admin/users');
    if (!res || !res.ok) return;
    const users = await res.json();
    renderUsers(users);
}

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">Sin usuarios</td></tr>';
        return;
    }

    const currentUser = (() => {
        try { return JSON.parse(sessionStorage.getItem('current_user')); } catch { return null; }
    })();

    tbody.innerHTML = users.map(u => `
        <tr>
            <td class="ts-cell" style="color:var(--text-muted)">${u.id}</td>
            <td style="font-weight:600;color:var(--text-primary)">${escHtml(u.username)}
                ${currentUser && u.id === currentUser.id ? '<span style="font-size:0.65rem;color:var(--text-muted);margin-left:4px">(tú)</span>' : ''}
            </td>
            <td><span class="role-badge role-${u.role}">${u.role}</span></td>
            <td class="ts-cell">${formatDate(u.created_at)}</td>
            <td>
                <div class="action-cell">
                    <button class="btn-edit"   onclick="openEditModal(${u.id},'${escHtml(u.username)}','${u.role}')">Editar</button>
                    ${currentUser && u.id !== currentUser.id
                        ? `<button class="btn-danger" onclick="deleteUser(${u.id},'${escHtml(u.username)}')">Eliminar</button>`
                        : ''}
                </div>
            </td>
        </tr>`).join('');
}

function setupCreateUser() {
    document.getElementById('toggle-create-user').addEventListener('click', () => {
        document.getElementById('create-user-form').classList.toggle('hidden');
    });
    document.getElementById('cancel-create-user').addEventListener('click', () => {
        document.getElementById('create-user-form').classList.add('hidden');
        clearCreateForm();
    });
    document.getElementById('submit-create-user').addEventListener('click', createUser);
}

async function createUser() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;
    const errEl = document.getElementById('create-user-error');

    errEl.classList.add('hidden');

    if (!username || !password) {
        showError(errEl, 'Usuario y contraseña son requeridos.');
        return;
    }
    if (password.length < 8) {
        showError(errEl, 'La contraseña debe tener al menos 8 caracteres.');
        return;
    }

    const res = await api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role })
    });
    if (!res) return;

    if (res.ok) {
        clearCreateForm();
        document.getElementById('create-user-form').classList.add('hidden');
        loadUsers();
        loadStats();
        loadAudit();
    } else {
        const err = await res.json();
        showError(errEl, err.detail || 'Error al crear usuario.');
    }
}

function clearCreateForm() {
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('new-role').value     = 'viewer';
    document.getElementById('create-user-error').classList.add('hidden');
}

async function deleteUser(id, username) {
    if (!confirm(`¿Eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)) return;

    const res = await api(`/admin/users/${id}`, { method: 'DELETE' });
    if (!res) return;

    if (res.ok) {loadUsers();loadStats();loadAudit();} else {
        const err = await res.json();
        alert(err.detail || 'Error al eliminar usuario.');
    }
}

function setupModal() {
    document.getElementById('modal-close').addEventListener('click',  closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-save').addEventListener('click',   saveUserEdit);
    document.getElementById('edit-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });
}

function openEditModal(id, username, role) {
    document.getElementById('edit-user-id').value = id;
    document.getElementById('edit-username').value = username;
    document.getElementById('edit-role').value = role;
    document.getElementById('edit-password').value = '';
    document.getElementById('edit-error').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function saveUserEdit() {
    const id = document.getElementById('edit-user-id').value;
    const role = document.getElementById('edit-role').value;
    const password = document.getElementById('edit-password').value;
    const errEl = document.getElementById('edit-error');

    errEl.classList.add('hidden');

    if (password && password.length < 8) {
        showError(errEl, 'La contraseña debe tener al menos 8 caracteres.');
        return;
    }

    const body = { role };
    if (password) body.password = password;

    const res = await api(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });
    if (!res) return;

    if (res.ok) {closeModal();loadUsers();loadAudit();} 
    else {
        const err = await res.json();
        showError(errEl, err.detail || 'Error al actualizar usuario.');
    }
}

async function loadThresholds() {
    const res = await api('/admin/thresholds');
    if (!res || !res.ok) return;
    const t = await res.json();

    // Rango normal
    document.getElementById('th-co2-low').value = t.co2_low;
    document.getElementById('th-co2-high').value = t.co2_high;
    document.getElementById('th-temp-low').value = t.temp_low;
    document.getElementById('th-temp-high').value = t.temp_high;
    document.getElementById('th-hum-low').value = t.humidity_low;
    document.getElementById('th-hum-high').value = t.humidity_high;
    
    // Límites de advertencia (con fallback por compatibilidad)
    if (t.co2_warning) document.getElementById('th-co2-warning').value = t.co2_warning;
    if (t.temp_warning) document.getElementById('th-temp-warning').value = t.temp_warning;
    if (t.humidity_warning) document.getElementById('th-hum-warning').value = t.humidity_warning;

    if (t.updated_by) {
        document.getElementById('thresholds-updated').textContent =`Actualizado por ${t.updated_by} · ${formatDate(t.updated_at)}`;
    }
}

function setupThresholds() {
    document.getElementById('save-thresholds').addEventListener('click', saveThresholds);
}

async function saveThresholds() {
    const errEl = document.getElementById('thresholds-error');
    errEl.classList.add('hidden');

    const body = {
        co2_low: parseFloat(document.getElementById('th-co2-low').value),
        co2_high: parseFloat(document.getElementById('th-co2-high').value),
        temp_low: parseFloat(document.getElementById('th-temp-low').value),
        temp_high: parseFloat(document.getElementById('th-temp-high').value),
        humidity_low: parseFloat(document.getElementById('th-hum-low').value),
        humidity_high: parseFloat(document.getElementById('th-hum-high').value),
        co2_warning: parseFloat(document.getElementById('th-co2-warning').value),
        temp_warning: parseFloat(document.getElementById('th-temp-warning').value),
        humidity_warning: parseFloat(document.getElementById('th-hum-warning').value),
    };

    if (Object.values(body).some(isNaN)) {
        showError(errEl, 'Todos los campos deben ser numeros validos.');
        return;
    }

    const res = await api('/admin/thresholds', { method: 'PUT', body: JSON.stringify(body) });
    if (!res) return;

    if (res.ok) {
        const fb = document.getElementById('save-feedback');
        fb.classList.remove('hidden');
        setTimeout(() => fb.classList.add('hidden'), 2500);
        loadThresholds();
        loadAudit();
    } else {
        const err = await res.json();
        showError(errEl, err.detail || 'Error al guardar umbrales.');
    }
}

async function loadAudit() {
    const res = await api('/admin/audit?limit=150');
    if (!res || !res.ok) return;
    const entries = await res.json();
    renderAudit(entries);
}

function renderAudit(entries) {
    const tbody = document.getElementById('audit-tbody');
    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">Sin registros de auditoría</td></tr>';
        return;
    }
    tbody.innerHTML = entries.map(e => `
        <tr>
            <td class="ts-cell">${formatDate(e.timestamp)}</td>
            <td style="font-weight:600;color:var(--text-primary)">${escHtml(e.username)}</td>
            <td><span class="audit-action-badge audit-${e.action}">${e.action}</span></td>
            <td><div class="audit-detail" title="${escHtml(e.detail || '')}">${escHtml(e.detail || '—')}</div></td>
        </tr>`).join('');
}

function setupRefreshAll() {
    const btn = document.getElementById('refresh-all');
    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.querySelector('svg').style.animation = 'spin 0.8s linear infinite';
        Promise.all([loadStats(), loadUsers(), loadThresholds(), loadAudit()])
            .finally(() => {
                btn.disabled = false;
                btn.querySelector('svg').style.animation = '';
            });
    });
}

function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} `
         + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}