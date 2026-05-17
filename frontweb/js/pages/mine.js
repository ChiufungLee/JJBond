Router.register('/mine', (container) => {
  let userData = null;
  let destroyed = false;

  container.innerHTML = `
    <div class="page-container">
      <div id="mine-content">
        <div class="loading-wrap"><div class="loading-spinner"></div><span>加载中...</span></div>
      </div>
    </div>`;

  loadUser();

  async function loadUser() {
    const el = document.getElementById('mine-content');
    try {
      userData = await Api.get('/users/me');
      if (destroyed) return;
      Api.setUser(userData);
      renderMine(el);
    } catch (e) {
      if (e.message.includes('登录')) {
        el.innerHTML = `
          <div class="login-hint">
            <div class="login-hint-icon">👤</div>
            <h3>个人中心</h3>
            <p>登录后查看个人信息</p>
            <a href="#/login" class="btn btn-primary">去登录</a>
          </div>`;
      } else {
        el.innerHTML = `<div class="empty-state"><p>加载失败: ${Utils.escapeHtml(e.message)}</p></div>`;
      }
    }
  }

  function renderMine(el) {
    if (!userData) return;
    const initial = (userData.nickname || userData.username || 'U')[0].toUpperCase();
    const days = Utils.daysSince(userData.created_at);

    el.innerHTML = `
      <div class="user-card">
        <div class="user-avatar">${initial}</div>
        <div class="user-info">
          <h3 id="mine-nickname" style="cursor:pointer;" title="点击编辑昵称">${Utils.escapeHtml(userData.nickname || userData.username)}</h3>
          <p>已相伴 ${days} 天</p>
        </div>
      </div>

      <div class="mine-section">
        <div class="mine-section-title">功能</div>
        <div class="menu-list">
          <div class="menu-item" onclick="location.hash='#/calendar'">
            <div class="menu-item-left">
              <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span class="menu-item-text">收益日历</span>
            </div>
            <span class="menu-item-arrow">›</span>
          </div>
          <div class="menu-item" onclick="location.hash='#/distribution'">
            <div class="menu-item-left">
              <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>
              </svg>
              <span class="menu-item-text">持仓分布</span>
            </div>
            <span class="menu-item-arrow">›</span>
          </div>
          <div class="menu-item" onclick="location.hash='#/home'">
            <div class="menu-item-left">
              <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              <span class="menu-item-text">基金管理</span>
            </div>
            <span class="menu-item-arrow">›</span>
          </div>
        </div>
      </div>

      <div class="mine-section">
        <div class="mine-section-title">更多</div>
        <div class="menu-list">
          <div class="menu-item" id="feedback-btn">
            <div class="menu-item-left">
              <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              <span class="menu-item-text">意见反馈</span>
            </div>
            <span class="menu-item-arrow">›</span>
          </div>
        </div>
      </div>

      <div id="feedback-area" class="hidden" style="margin-bottom:20px;">
        <div class="card">
          <div class="card-body">
            <textarea class="feedback-area" id="feedback-input" placeholder="请输入您的建议或反馈（1-300字）" maxlength="300"></textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
              <span class="text-muted" id="feedback-count">0/300</span>
              <button class="btn btn-primary btn-sm" id="feedback-submit">提交</button>
            </div>
          </div>
        </div>
      </div>

      <button class="logout-btn" id="logout-btn">退出登录</button>
      <div class="version">JJBond v2.3.6</div>`;

    // Edit nickname
    document.getElementById('mine-nickname')?.addEventListener('click', () => {
      const current = userData.nickname || userData.username;
      const newNick = prompt('修改昵称', current);
      if (newNick && newNick.trim() && newNick.trim() !== current) {
        Api.put('/users/me/info', { nickname: newNick.trim() })
          .then(data => {
            userData = { ...userData, ...data };
            Api.setUser(userData);
            renderMine(el);
            App.updateNavUser();
            Utils.showToast('昵称已更新');
          })
          .catch(err => Utils.showToast(err.message, 'error'));
      }
    });

    // Feedback
    const feedbackBtn = document.getElementById('feedback-btn');
    const feedbackArea = document.getElementById('feedback-area');
    const feedbackInput = document.getElementById('feedback-input');
    const feedbackCount = document.getElementById('feedback-count');
    const feedbackSubmit = document.getElementById('feedback-submit');

    feedbackBtn?.addEventListener('click', () => {
      feedbackArea.classList.toggle('hidden');
    });

    feedbackInput?.addEventListener('input', () => {
      feedbackCount.textContent = `${feedbackInput.value.length}/300`;
    });

    feedbackSubmit?.addEventListener('click', async () => {
      const content = feedbackInput.value.trim();
      if (!content) {
        Utils.showToast('请输入反馈内容', 'warning');
        return;
      }
      try {
        await Api.post('/feedback/', { content });
        Utils.showToast('感谢您的反馈！');
        feedbackInput.value = '';
        feedbackCount.textContent = '0/300';
        feedbackArea.classList.add('hidden');
      } catch (err) {
        Utils.showToast(err.message, 'error');
      }
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      try {
        await Api.post('/auth/logout');
      } catch (e) {
        // ignore
      }
      Api.clearToken();
      App.updateNavUser();
      Api.clearCache();
      Utils.showToast('已退出登录');
      Router.navigate('/login');
    });
  }

  return {
    destroy: () => { destroyed = true; }
  };
});
