const App = (() => {
  let hideAmount = localStorage.getItem('hideAmount') === 'true';

  function isHideAmount() {
    return hideAmount;
  }

  function toggleHideAmount() {
    hideAmount = !hideAmount;
    localStorage.setItem('hideAmount', String(hideAmount));
    return hideAmount;
  }

  function maskMoney(value) {
    if (hideAmount) return '****';
    return Utils.formatMoney(value);
  }

  function maskPercent(value) {
    if (hideAmount) return '****';
    return Utils.formatPercent(value);
  }

  function onUnauthorized() {
    Utils.showToast('登录已过期，请重新登录', 'warning');
    Router.navigate('/login');
  }

  function updateNavUser() {
    const user = Api.getUser();
    const token = Api.getToken();
    const isLoggedIn = !!token;

    // Desktop navbar user area
    const userArea = document.getElementById('nav-user');
    if (userArea) {
      if (isLoggedIn && user) {
        const initial = (user.nickname || user.username || 'U')[0].toUpperCase();
        userArea.innerHTML = `
          <a href="#/mine" class="navbar-user">
            <div class="navbar-avatar">${initial}</div>
            <span class="navbar-username">${Utils.escapeHtml(user.nickname || user.username)}</span>
          </a>`;
      } else {
        userArea.innerHTML = `<a href="#/login" class="btn btn-primary btn-sm">登录</a>`;
      }
    }

    // Mobile header user
    const mobileUser = document.getElementById('mobile-user');
    if (mobileUser) {
      if (isLoggedIn && user) {
        const initial = (user.nickname || user.username || 'U')[0].toUpperCase();
        mobileUser.innerHTML = `
          <a href="#/mine" class="mobile-header-user">
            <div class="mobile-header-avatar">${initial}</div>
          </a>`;
      } else {
        mobileUser.innerHTML = `<a href="#/login" class="btn btn-primary btn-sm" style="padding:6px 14px;font-size:12px;">登录</a>`;
      }
    }
  }

  async function loadUserInfo() {
    if (!Api.getToken()) return;
    try {
      const user = await Api.get('/users/me');
      Api.setUser(user);
      updateNavUser();
    } catch (e) {
      // Token invalid or network error
    }
  }

  function init() {
    updateNavUser();
    loadUserInfo();
    Router.init();
  }

  return {
    init,
    isHideAmount,
    toggleHideAmount,
    maskMoney,
    maskPercent,
    onUnauthorized,
    updateNavUser,
    loadUserInfo,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
