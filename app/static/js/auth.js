document.addEventListener('DOMContentLoaded', async () => {
    if (!window.location.pathname.includes('/login')) {
        await checkAuth();
    }
});

async function checkAuth() {
    const token = localStorage.getItem('access_token');
    if (!token) { redirectToLogin(); return; }

    try {
        const response = await fetch('/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Token inválido');

        const user = await response.json();
        sessionStorage.setItem('current_user', JSON.stringify(user));
        updateUserInterface(user);

    } catch (error) {
        console.error('Auth verification failed:', error);
        logout();
    }
}

function updateUserInterface(user) {
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) userDisplay.textContent = user.username;

    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar && user.username)
        userAvatar.textContent = user.username[0].toUpperCase();

    const userRole = document.getElementById('user-role');
    if (userRole) userRole.textContent = user.role || '';

    if (user.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = '';
        });
    }
    if (user.role === 'viewer') {
        document.querySelectorAll('.operator-only').forEach(el => {
            el.style.display = 'none';
        });
    }
    if (window.location.pathname === '/admin' && user.role !== 'admin') {
        window.location.href = '/';
    }
}

async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('access_token');
    if (!token) { redirectToLogin(); throw new Error('No token'); }

    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    if (response.status === 401) { logout(); throw new Error('Token expired'); }
    return response;
}

function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    sessionStorage.removeItem('current_user');
    redirectToLogin();
}

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    }
});

function redirectToLogin() { window.location.href = '/login'; }

function checkTokenExpiration() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const timeLeft = payload.exp * 1000 - Date.now();
        if (timeLeft <= 0) { logout(); return; }
        setTimeout(() => { alert('Tu sesión ha expirado, vuelve a iniciar sesión'); logout(); }, timeLeft);
    } catch (e) {
        console.error('Token expiration check error:', e);
    }
}
document.addEventListener('DOMContentLoaded', checkTokenExpiration);

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.getElementById('menu-toggle');
    const navContainer = document.getElementById('nav-container');
    if (menuToggle && navContainer) {
        menuToggle.addEventListener('click', () => {
            navContainer.classList.toggle('open');
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => navContainer.classList.remove('open'));
        });
    }
});