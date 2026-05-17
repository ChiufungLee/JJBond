Router.register('/login', (container) => {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <h1>JJBond</h1>
          <p>基金投资组合管理</p>
        </div>
        <form id="login-form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" class="form-input" id="login-username" placeholder="请输入用户名" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" class="form-input" id="login-password" placeholder="请输入密码" autocomplete="current-password" required>
          </div>
          <div class="form-group">
            <label class="form-checkbox">
              <input type="checkbox" id="login-remember"> 记住我
            </label>
          </div>
          <div id="login-error" class="form-error" style="margin-bottom:12px;display:none;"></div>
          <button type="submit" class="btn btn-primary btn-block" id="login-btn">登录</button>
        </form>
        <p style="text-align:center;margin-top:16px;font-size:13px;color:#999;">
          没有账号？<a href="#/register">去注册</a>
        </p>
      </div>
    </div>`;

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;

    if (!username || !password) {
      errorEl.textContent = '请输入用户名和密码';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = '登录中...';

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (remember) {
        headers['x-remember-me'] = 'true';
      }

      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.detail || data.message || '登录失败');
      }

      Api.setToken(data.access_token);
      Api.setUser({
        username: data.username,
        nickname: data.nickname || data.username,
        created_at: data.created_at,
        last_login_at: data.last_login_at,
      });
      App.updateNavUser();
      Api.clearCache();

      Utils.showToast('登录成功');
      Router.navigate('/home');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  });

  return {
    destroy: () => {
      form.removeEventListener('submit', () => {});
    }
  };
});
