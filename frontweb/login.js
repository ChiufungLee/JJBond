class LoginManager {
    constructor() {
        this.baseURL = '/api';
        this.initialize();
    }
    
    initialize() {
        // 检查是否已登录，如果已登录则跳转到主页面
        this.checkAutoLogin();
        // 加载保存的登录信息
        this.loadSavedCredentials();
        // 绑定表单提交事件
        this.bindEvents();
    }

    checkAutoLogin() {
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('currentUser');
        const lastLogin = localStorage.getItem('last_login');
        
        if (token && user && lastLogin) {
            // 检查登录是否在7天内
            const lastLoginDate = new Date(lastLogin);
            const now = new Date();
            const daysDiff = (now - lastLoginDate) / (1000 * 60 * 60 * 24);
            
            if (daysDiff < 7) {
                console.log('自动登录，跳转到主页面');
                window.location.href = 'index.html';
            } else {
                console.log('登录已过期，需要重新登录');
                this.clearAuth();
            }
        }
    }
    
    loadSavedCredentials() {
        try {
            const savedCredentials = localStorage.getItem('saved_credentials');
            const rememberMe = localStorage.getItem('remember_me') === 'true';
            
            if (savedCredentials && rememberMe) {
                const credentials = JSON.parse(savedCredentials);
                const usernameInput = document.getElementById('username');
                const passwordInput = document.getElementById('password');
                const rememberMeCheckbox = document.getElementById('rememberMe');
                
                if (usernameInput) usernameInput.value = credentials.username || '';
                if (passwordInput) passwordInput.value = credentials.password || '';
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
            // 调用登录API
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            });

            // 检查认证状态
            if (response.status === 401) {
                this.setLoading(false);
                this.showError('用户名或密码错误');
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                this.setLoading(false);
                this.showError(data.detail || '登录失败');
                return;
            }

            // 保存token和用户信息
            localStorage.setItem('authToken', data.access_token);
            localStorage.setItem('currentUser', JSON.stringify({ username }));
            
            // 保存登录时间
            localStorage.setItem('last_login', new Date().toISOString());
            
            // 保存登录凭据（如果选择了记住密码）
            if (rememberMe) {
                localStorage.setItem('saved_credentials', JSON.stringify({
                    username: username,
                    password: password
                }));
                localStorage.setItem('remember_me', 'true');
            } else {
                // 清除保存的凭据
                localStorage.removeItem('saved_credentials');
                localStorage.setItem('remember_me', 'false');
            }
            
            this.showSuccess('登录成功，正在跳转...');
            
            // 延迟跳转到主页面
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
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            
            // 隐藏成功消息
            const successDiv = document.getElementById('successMessage');
            if (successDiv) successDiv.style.display = 'none';
            
            // 5秒后自动隐藏错误消息
            setTimeout(() => {
                errorDiv.style.display = 'none';
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
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});