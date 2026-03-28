const API_BASE_URL = '/api';

class RegisterManager {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.messageTimer = null;
        this.initialize();
    }
    
    initialize() {
        this.bindEvents();
        this.setupValidation();
    }
    
    bindEvents() {
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleRegister();
            });
        }
    }
    
    setupValidation() {
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (confirmPassword) {
            confirmPassword.addEventListener('input', () => {
                this.validatePasswordMatch();
            });
        }
        
        if (password) {
            password.addEventListener('input', () => {
                this.validatePasswordStrength();
                this.validatePasswordMatch();
            });
        }
    }
    
    validatePasswordStrength() {
        const password = document.getElementById('password');
        if (!password) return true;
        
        if (password.value.length < 8) {
            return false;
        }
        return true;
    }
    
    validatePasswordMatch() {
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (!password || !confirmPassword) return true;
        
        if (confirmPassword.value && password.value !== confirmPassword.value) {
            this.showError('两次输入的密码不一致');
            return false;
        }
        return true;
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

    async handleRegister() {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const emailInput = document.getElementById('email');

        if (!usernameInput || !passwordInput || !confirmPasswordInput) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const email = emailInput ? emailInput.value.trim() : '';

        if (!username || !password || !confirmPassword) {
            this.showError('请填写所有必填字段');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('两次输入的密码不一致');
            return;
        }

        if (password.length < 8) {
            this.showError('密码至少需要8位字符');
            return;
        }

        this.setLoading(true);

        try {
            const userData = { username, password };
            if (email) {
                userData.email = email;
            }

            const response = await fetch(`${this.baseURL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await this.parseResponse(response);

            if (response.ok) {
                this.showSuccess('注册成功，正在跳转到登录页面...');

                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);

            } else {
                this.showError(data?.detail || '注册失败');
                this.setLoading(false);
            }
        } catch (error) {
            console.error('注册请求失败:', error);
            this.showError('注册请求失败，请检查网络连接');
            this.setLoading(false);
        }
    }
    
    setLoading(isLoading) {
        const button = document.getElementById('registerButton');
        if (button) {
            if (isLoading) {
                button.disabled = true;
                button.textContent = '注册中...';
            } else {
                button.disabled = false;
                button.textContent = '注册';
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
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new RegisterManager();
});