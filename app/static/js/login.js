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
            showError(error.detail || 'Error de autenticación');
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
    let errorDiv = document.querySelector('.error-message');
    
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            margin-top: 1rem;
            padding: 0.75rem;
            background: rgba(220, 38, 38, 0.1);
            border: 1px solid rgba(220, 38, 38, 0.3);
            border-radius: 8px;
            color: #dc2626;
            font-size: 0.875rem;
        `;
        document.querySelector('.form').appendChild(errorDiv);
    }
    
    errorDiv.textContent = message;
    
    setTimeout(() => errorDiv.remove(), 5000);
}