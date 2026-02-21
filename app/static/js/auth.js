document.addEventListener('DOMContentLoaded', async () => {
    if (!window.location.pathname.includes('/login')) {
        await checkAuth();
    }
});

async function checkAuth() {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
        redirectToLogin();
        return;
    }
    try {
        const response = await fetch('/auth/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Token inválido');
        }
        
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
    if (userDisplay) {
        userDisplay.textContent = user.username;
    }
    
    const userRole = document.getElementById('user-role');
    if (userRole) {
        userRole.textContent = `(${user.role})`;
    }
    
    if (user.role === 'viewer') {
        document.querySelectorAll('.admin-only, .operator-only').forEach(el => {
            el.style.display = 'none';
        });
    } else if (user.role === 'operator') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
}

async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
        redirectToLogin();
        throw new Error('No token available');
    }
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers 
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    if (response.status === 401) {
        logout();
        throw new Error('Token expired');
    }
    
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
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});

function redirectToLogin() {
    window.location.href = '/login';
}


function checkTokenExpiration() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        const expirationTime = payload.exp * 1000; 
        const now = Date.now();
        
        if (now >= expirationTime) {
            console.log('Token expired');
            logout();
        } else {
            const timeUntilExpiration = expirationTime - now;
            setTimeout(() => {
                alert('Tu sesión ha expirado');
                logout();
            }, timeUntilExpiration);
        }
    } catch (error) {
        console.error('Error checking token expiration:', error);
    }
}
document.addEventListener('DOMContentLoaded', checkTokenExpiration);