Router.register('/register', (container) => {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <h1>JJBond</h1>
          <p>创建新账号</p>
        </div>
        <form id="register-form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" class="form-input" id="reg-username" placeholder="3-20个字符" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input type="email" class="form-input" id="reg-email" placeholder="请输入邮箱" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" class="form-input" id="reg-password" placeholder="至少6个字符" autocomplete="new-password" required>
          </div>
          <div class="form-group">
            <label class="form-label">确认密码</label>
            <input type="password" class="form-input" id="reg-password2" placeholder="再次输入密码" autocomplete="new-password" required>
          </div>
          <div id="reg-error" class="form-error" style="margin-bottom:12px;display:none;"></div>
          <button type="submit" class="btn btn-primary btn-block" id="reg-btn">注册</button>
        </form>
        <p style="text-align:center;margin-top:16px;font-size:13px;color:#999;">
          已有账号？<a href="#/login">去登录</a>
        </p>
      </div>
    </div>`;

  const form = document.getElementById('register-form');
  const errorEl = document.getElementById('reg-error');
  const btn = document.getElementById('reg-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    if (!username || !email || !password) {
      errorEl.textContent = '请填写所有字段';
      errorEl.style.display = 'block';
      return;
    }
    if (username.length < 3 || username.length > 20) {
      errorEl.textContent = '用户名需要3-20个字符';
      errorEl.style.display = 'block';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = '密码至少需要6个字符';
      errorEl.style.display = 'block';
      return;
    }
    if (password !== password2) {
      errorEl.textContent = '两次输入的密码不一致';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = '注册中...';

    try {
      const data = await Api.post('/auth/register', {
        username,
        email,
        password,
      });

      Utils.showToast('注册成功，请登录');
      Router.navigate('/login');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '注册';
    }
  });
});
