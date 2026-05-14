const API_BASE_URL = '/api';

function safeParseJSON(value, fallback = null) {
    if (!value) return fallback;

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

class LoginManager {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.messageTimer = null;
        this.refreshPromise = null;
        this.initialize();
    }
    
    async initialize() {
        const autoLoggedIn = await this.checkAutoLogin();
        if (autoLoggedIn) {
            return;
        }

        this.loadSavedCredentials();
        this.bindEvents();
    }

    async checkAutoLogin() {
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('currentUser');
        const expiresAt = localStorage.getItem('token_expires_at');

        const parsedUser = safeParseJSON(user, null);
        const expiresAtMs = Date.parse(expiresAt || '');

        if (token && parsedUser && Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs) {
            window.location.href = 'index.html';
            return true;
        }

        if (parsedUser) {
            const refreshed = await this.refreshAccessToken(parsedUser, { silent: true });
            if (refreshed) {
                window.location.href = 'index.html';
                return true;
            }
        }

        if (token || user || expiresAt) {
            this.clearAuth();
        }

        return false;
    }
    
    loadSavedCredentials() {
        try {
            const savedCredentials = safeParseJSON(localStorage.getItem('saved_credentials'), null);
            const rememberMe = localStorage.getItem('remember_me') === 'true';

            if (savedCredentials && rememberMe) {
                const usernameInput = document.getElementById('username');
                const rememberMeCheckbox = document.getElementById('rememberMe');

                if (usernameInput) usernameInput.value = savedCredentials.username || '';
                if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
            }
        } catch (e) {
            console.error('加载保存的凭据失败:', e);
        }
    }
    
    bindEvents() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin();
            });
        }
    }
    
    async parseResponse(response) {
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch {
                return null;
            }
        }

        try {
            const text = await response.text();
            return text ? { detail: text } : null;
        } catch {
            return null;
        }
    }

    storeAuthSession(accessToken, user) {
        localStorage.setItem('authToken', accessToken);
        localStorage.setItem('currentUser', JSON.stringify(user));

        const now = new Date();
        localStorage.setItem('last_login', now.toISOString());
        localStorage.setItem('token_expires_at', new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    }

    async refreshAccessToken(user, { silent = false } = {}) {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = (async () => {
            try {
                const response = await fetch(`${this.baseURL}/auth/refresh`, {
                    method: 'POST',
                    credentials: 'same-origin'
                });

                if (!response.ok) {
                    return false;
                }

                const data = await this.parseResponse(response);
                if (!data?.access_token) {
                    return false;
                }

                this.storeAuthSession(data.access_token, user);
                return true;
            } catch (error) {
                if (!silent) {
                    console.error('刷新登录状态失败:', error);
                }
                return false;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    async handleLogin() {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const rememberMeCheckbox = document.getElementById('rememberMe');

        if (!usernameInput || !passwordInput) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

        // 验证输入
        if (!username || !password) {
            this.showError('请输入用户名和密码');
            return;
        }

        // 显示加载状态
        this.setLoading(true);

        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Remember-Me': rememberMe ? 'true' : 'false'
                },
                credentials: 'same-origin',
                body: formData
            });

            if (response.status === 401) {
                this.setLoading(false);
                this.showError('用户名或密码错误');
                return;
            }

            const data = await this.parseResponse(response);

            if (!response.ok) {
                this.setLoading(false);
                this.showError(data?.detail || '登录失败');
                return;
            }

            this.storeAuthSession(data.access_token, {
                username: data.username || username,
                created_at: data.created_at,
                last_login_at: data.last_login_at
            });

            if (rememberMe) {
                localStorage.setItem('saved_credentials', JSON.stringify({ username }));
                localStorage.setItem('remember_me', 'true');
            } else {
                localStorage.removeItem('saved_credentials');
                localStorage.setItem('remember_me', 'false');
            }

            this.showSuccess('登录成功，正在跳转...');

            setTimeout(() => {
                window.location.href = 'index.html';
            }, 500);

        } catch (error) {
            console.error('登录请求失败:', error);
            this.setLoading(false);
            this.showError('登录请求失败，请检查网络连接');
        }
    }
    
    setLoading(isLoading) {
        const button = document.getElementById('loginButton');
        if (button) {
            if (isLoading) {
                button.disabled = true;
                button.textContent = '登录中...';
            } else {
                button.disabled = false;
                button.textContent = '登录';
            }
        }
    }
    
    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            if (this.messageTimer) {
                clearTimeout(this.messageTimer);
            }

            errorDiv.textContent = message;
            errorDiv.style.display = 'block';

            const successDiv = document.getElementById('successMessage');
            if (successDiv) successDiv.style.display = 'none';

            this.messageTimer = setTimeout(() => {
                errorDiv.style.display = 'none';
                this.messageTimer = null;
            }, 5000);
        }
    }
    
    showSuccess(message) {
        const successDiv = document.getElementById('successMessage');
        if (successDiv) {
            successDiv.textContent = message;
            successDiv.style.display = 'block';
            
            // 隐藏错误消息
            const errorDiv = document.getElementById('errorMessage');
            if (errorDiv) errorDiv.style.display = 'none';
        }
    }
    
    clearAuth() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('last_login');
        localStorage.removeItem('token_expires_at');
        this.refreshPromise = null;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});