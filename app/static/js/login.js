document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('.form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();  
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        await login(username, password);
    });
});
async function login(username, password) {
    try {
        
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        const response = await fetch('/auth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            let msg = error.detail || 'Error de autenticación';
            if (msg === 'Incorrect username or password') msg = 'Credenciales Incorrectas';
            showError(msg);
            return;
        }
        
        const data = await response.json();
        
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('token_type', data.token_type);
        
        window.location.href = '/';
        
    } catch (error) {
        console.error('Error:', error);
        showError('Error de conexión');
    }
}

function showError(message) {
    let container = document.querySelector('.notifications-wrapper');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notifications-wrapper';
        document.querySelector('.card').appendChild(container);
    }

    container.innerHTML = '';

    const badge = document.createElement('div');
    badge.className = 'notification-badge';
    badge.innerHTML = `<span>${message}</span>`;

    container.appendChild(badge);

    setTimeout(() => badge.classList.add('show'), 10);
    
    badge.onclick = () => dismissBadge(badge);
    setTimeout(() => dismissBadge(badge), 5000);
}

function dismissBadge(badge) {
    if (badge && badge.parentNode) {
        badge.classList.remove('show');
        setTimeout(() => {
            if (badge.parentNode) badge.remove();
        }, 300);
    }
}