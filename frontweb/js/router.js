const Router = (() => {
  const routes = {};
  let currentPage = null;
  let currentCleanup = null;

  function register(path, handler) {
    routes[path] = handler;
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function getPath() {
    return window.location.hash.slice(1) || '/home';
  }

  function getParams() {
    const path = getPath();
    const parts = path.split('/');
    return parts.slice(2);
  }

  async function handleRoute() {
    const path = getPath();
    const base = '/' + path.split('/')[1];

    // Cleanup previous page
    if (currentCleanup) {
      try { currentCleanup(); } catch (e) { console.error('Cleanup error:', e); }
      currentCleanup = null;
    }

    // Auth guard
    const publicRoutes = ['/login', '/register'];
    if (!publicRoutes.includes(base) && !Api.getToken()) {
      navigate('/login');
      return;
    }

    // If logged in, redirect away from auth pages
    if (publicRoutes.includes(base) && Api.getToken()) {
      navigate('/home');
      return;
    }

    const handler = routes[base];
    const container = document.getElementById('page-content');

    if (!handler) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-guide-icon">🔍</div>
          <p>页面不存在</p>
          <a href="#/home" class="btn btn-primary btn-sm">返回首页</a>
        </div>`;
      return;
    }

    // Update nav active state
    document.querySelectorAll('.navbar-nav a, .tab-item').forEach(el => {
      const href = el.getAttribute('href') || el.dataset.path;
      el.classList.toggle('active', href === '#' + base || el.dataset.path === base);
    });

    try {
      const result = await handler(container, getParams());
      if (result && typeof result.destroy === 'function') {
        currentCleanup = result.destroy;
      }
    } catch (e) {
      console.error('Route error:', e);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-guide-icon">⚠️</div>
          <p>${Utils.escapeHtml(e.message)}</p>
          <button onclick="location.reload()" class="btn btn-primary btn-sm">刷新页面</button>
        </div>`;
    }

    currentPage = base;
  }

  function init() {
    window.addEventListener('hashchange', handleRoute);
    if (!window.location.hash) {
      window.location.hash = '#/home';
    } else {
      handleRoute();
    }
  }

  return { register, navigate, getPath, getParams, init };
})();
