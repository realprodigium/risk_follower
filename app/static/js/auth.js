// ============================================================
// VERIFICACIÓN DE AUTENTICACIÓN (Frontend)
// ============================================================
// Incluir este script en dashboard.html y otras páginas protegidas

// ------------------------------------------------------------
// 1. VERIFICAR SI HAY TOKEN AL CARGAR LA PÁGINA
// ------------------------------------------------------------
// ¿Por qué DOMContentLoaded? Para ejecutar cuando el HTML esté listo
// pero antes de que se muestren datos sensibles

document.addEventListener('DOMContentLoaded', async () => {
    // No verificar autenticación en la página de login
    if (!window.location.pathname.includes('/login')) {
        await checkAuth();
    }
});


// ------------------------------------------------------------
// 2. FUNCIÓN PRINCIPAL DE VERIFICACIÓN
// ------------------------------------------------------------
async function checkAuth() {
    // ----------------------------------------------------
    // 2.1 Obtener token del localStorage
    // ----------------------------------------------------
    const token = localStorage.getItem('access_token');
    
    if (!token) {
        // No hay token → No autenticado → Redirigir a login
        redirectToLogin();
        return;
    }
    
    // ----------------------------------------------------
    // 2.2 Verificar que el token es válido (backend)
    // ----------------------------------------------------
    // ¿Por qué verificar con el servidor y no solo confiar en localStorage?
    // - El token podría haber expirado
    // - El usuario podría haber sido deshabilitado
    // - El token podría haber sido manipulado
    
    try {
        const response = await fetch('/auth/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
                // ↑ Formato estándar OAuth2: "Bearer <token>"
                // El backend espera este header exacto
            }
        });
        
        if (!response.ok) {
            // Token inválido, expirado, o usuario no existe
            throw new Error('Token inválido');
        }
        
        const user = await response.json();
        // Estructura esperada: { id, username, role, created_at }
        
        // ----------------------------------------------------
        // 2.3 Guardar datos del usuario para uso en la UI
        // ----------------------------------------------------
        // ¿Por qué guardar en sessionStorage y no localStorage?
        // - Se borra al cerrar el navegador (más seguro)
        // - Fuerza revalidación en cada sesión nueva
        sessionStorage.setItem('current_user', JSON.stringify(user));
        
        // ----------------------------------------------------
        // 2.4 Actualizar UI con datos del usuario
        // ----------------------------------------------------
        updateUserInterface(user);
        
    } catch (error) {
        console.error('Auth verification failed:', error);
        // Token inválido → Limpiar y redirigir
        logout();
    }
}


// ------------------------------------------------------------
// 3. ACTUALIZAR UI CON DATOS DEL USUARIO
// ------------------------------------------------------------
function updateUserInterface(user) {
    // Mostrar nombre del usuario en el header
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) {
        userDisplay.textContent = user.username;
    }
    
    // Mostrar rol del usuario
    const userRole = document.getElementById('user-role');
    if (userRole) {
        userRole.textContent = `(${user.role})`;
    }
    
    // Mostrar/ocultar elementos según el rol
    // ¿Por qué? Control de acceso en el frontend (UX)
    // Nota: El backend SIEMPRE debe validar permisos también (seguridad)
    
    if (user.role === 'viewer') {
        // Ocultar botones de edición para viewers
        document.querySelectorAll('.admin-only, .operator-only').forEach(el => {
            el.style.display = 'none';
        });
    } else if (user.role === 'operator') {
        // Ocultar solo elementos de admin
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
    // role === 'admin' → mostrar todo (sin restricciones)
}


// ------------------------------------------------------------
// 4. FUNCIÓN HELPER PARA HACER REQUESTS AUTENTICADOS
// ------------------------------------------------------------
// ¿Por qué? Para no repetir el código del header Authorization
// en cada fetch() que hagamos

async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
        redirectToLogin();
        throw new Error('No token available');
    }
    
    // Merge headers (combinar headers personalizados con Authorization)
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers  // ← Permite sobrescribir Content-Type si es necesario
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    // Si el token expiró durante una request
    if (response.status === 401) {
        logout();
        throw new Error('Token expired');
    }
    
    return response;
}

// Ejemplo de uso:
// const response = await authenticatedFetch('/records');
// const records = await response.json();


// ------------------------------------------------------------
// 5. LOGOUT
// ------------------------------------------------------------
function logout() {
    // ¿Por qué limpiar ambos storages?
    // - localStorage: Token persistente
    // - sessionStorage: Datos de usuario temporales
    
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    sessionStorage.removeItem('current_user');
    
    redirectToLogin();
}

// Event listener para botón de logout (agregar en HTML)
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});


// ------------------------------------------------------------
// 6. HELPERS DE REDIRECCIÓN
// ------------------------------------------------------------
function redirectToLogin() {
    // ¿Por qué window.location.href y no window.location.replace()?
    // - href: Permite volver atrás con el botón del navegador
    // - replace(): Reemplaza la historia (no se puede volver)
    // Para login, queremos permitir volver atrás
    
    window.location.href = '/login';
}


// ------------------------------------------------------------
// 7. VERIFICAR EXPIRACIÓN DEL TOKEN (OPCIONAL)
// ------------------------------------------------------------
// ¿Por qué? Para hacer logout automático antes de que expire
// y evitar errores inesperados al usuario

function checkTokenExpiration() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    
    try {
        // Decodificar el payload del JWT (parte central)
        // Formato JWT: header.payload.signature
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        // 'exp' es el timestamp de expiración (Unix timestamp en segundos)
        const expirationTime = payload.exp * 1000; // Convertir a milisegundos
        const now = Date.now();
        
        if (now >= expirationTime) {
            console.log('Token expired');
            logout();
        } else {
            // Programar logout automático cuando expire
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

// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', checkTokenExpiration);