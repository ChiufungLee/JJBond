Router.register('/watchlist', (container) => {
  let watchlistData = [];
  let sortKey = 'change_rate';
  let sortDesc = true;
  let searchTimeout = null;
  let destroyed = false;

  container.innerHTML = `
    <div class="page-container">
      <div class="search-bar" id="wl-search-bar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="search-input" id="wl-search" placeholder="搜索基金代码或名称" autocomplete="off">
        </div>
        <div class="search-dropdown hidden" id="wl-dropdown"></div>
      </div>
      <div id="wl-content">
        <div class="loading-wrap"><div class="loading-spinner"></div><span>加载中...</span></div>
      </div>
    </div>`;

  const searchInput = document.getElementById('wl-search');
  const dropdown = document.getElementById('wl-dropdown');

  loadWatchlist();

  searchInput.addEventListener('input', Utils.debounce(async () => {
    const q = searchInput.value.trim();
    if (!q) {
      loadHotSearch();
      return;
    }
    try {
      const results = await Api.get(`/funds/search?q=${encodeURIComponent(q)}&limit=10`);
      if (destroyed) return;
      renderSearchResults(results);
    } catch (e) {
      // ignore
    }
  }, 300));

  searchInput.addEventListener('focus', () => {
    if (!searchInput.value.trim()) {
      loadHotSearch();
    }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('wl-search-bar')?.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  async function loadHotSearch() {
    try {
      const data = await Api.get('/hot-search/funds');
      if (destroyed) return;
      const funds = data.data || [];
      if (funds.length === 0) return;
      dropdown.classList.remove('hidden');
      dropdown.innerHTML = `
        <div class="search-dropdown-header">
          <span class="search-dropdown-title">🔥 热搜基金</span>
          <span class="search-dropdown-sub">添加自选</span>
        </div>
        ${funds.map(f => `
        <div class="search-dropdown-item" data-code="${f.fund_code}" data-name="${Utils.escapeHtml(f.fund_name)}">
          <div class="fund-info">
            <div class="fund-name">${Utils.escapeHtml(f.fund_name)}</div>
            <div class="fund-meta">${f.fund_code} · ${Utils.escapeHtml(f.fund_type || '')} ${f.change_rate_1y != null ? '· 年涨 ' + Utils.formatPercent(f.change_rate_1y) : ''}</div>
          </div>
          <button class="btn btn-add btn-sm" title="添加自选">+</button>
        </div>`).join('')}`;
      bindDropdownEvents();
    } catch (e) {
      // ignore
    }
  }

  function renderSearchResults(results) {
    if (!results || results.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }
    dropdown.classList.remove('hidden');
    dropdown.innerHTML = results.map(f => `
      <div class="search-dropdown-item" data-code="${f.fund_code}" data-name="${Utils.escapeHtml(f.fund_name)}">
        <div class="fund-info">
          <div class="fund-name">${Utils.escapeHtml(f.fund_name)}</div>
          <div class="fund-meta">${f.fund_code} · ${Utils.escapeHtml(f.fund_type || '')}</div>
        </div>
        <button class="btn btn-add btn-sm" title="添加自选">+</button>
      </div>`).join('');
    bindDropdownEvents();
  }

  function bindDropdownEvents() {
    dropdown.querySelectorAll('.btn-add').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.search-dropdown-item');
        const code = item.dataset.code;
        const name = item.dataset.name;
        try {
          await Api.post('/watchlist/', { fund_code: code, fund_name: name });
          Utils.showToast('已添加到自选');
          searchInput.value = '';
          dropdown.classList.add('hidden');
          loadWatchlist();
        } catch (err) {
          Utils.showToast(err.message, 'error');
        }
      });
    });
  }

  async function loadWatchlist() {
    const el = document.getElementById('wl-content');
    try {
      watchlistData = await Api.get('/watchlist/');
      if (destroyed) return;
      renderWatchlist(el);
    } catch (e) {
      if (e.message.includes('登录')) {
        el.innerHTML = `
          <div class="login-hint">
            <div class="login-hint-icon">⭐</div>
            <h3>管理您的自选</h3>
            <p>登录后即可添加自选基金</p>
            <a href="#/login" class="btn btn-primary">去登录</a>
          </div>`;
      } else {
        el.innerHTML = `<div class="empty-state"><p>加载失败: ${Utils.escapeHtml(e.message)}</p></div>`;
      }
    }
  }

  function renderWatchlist(el) {
    if (!watchlistData || watchlistData.length === 0) {
      el.innerHTML = `
        <div class="empty-guide">
          <div class="empty-guide-icon">⭐</div>
          <p>暂无自选基金，使用上方搜索添加</p>
        </div>`;
      return;
    }

    function sortIcon(key) {
      if (sortKey !== key) return '<span class="sort-arrows"><span>▲</span><span>▼</span></span>';
      return sortDesc
        ? '<span class="sort-arrows"><span>▲</span><span class="active">▼</span></span>'
        : '<span class="sort-arrows"><span class="active">▲</span><span>▼</span></span>';
    }

    const sorted = sortWatchlist(watchlistData);
    const rows = sorted.map(f => {
      const crNum = Utils.parseChangeStr(f.change_rate);
      const changeClass = Utils.getChangeClass(crNum);
      const crDisplay = f.change_rate != null ? f.change_rate : '--';
      const totalClass = Utils.getChangeClass(f.total_change_rate);
      const totalDisplay = f.total_change_rate != null ? (f.total_change_rate >= 0 ? '+' : '') + f.total_change_rate.toFixed(2) + '%' : '--';
      return `
        <div class="wl-row" data-id="${f.id}">
          <div class="wl-col-info">
            <div class="wl-name">${Utils.escapeHtml(f.fund_name)}</div>
            <div class="wl-meta">
              <span>${f.fund_code}</span>
              ${f.nav_updated ? '<span class="badge badge-updated">已更新</span>' : ''}
              ${f.is_holding ? '<span class="badge badge-holding">已持仓</span>' : ''}
            </div>
          </div>
          <span class="wl-col-rate ${changeClass}">${crDisplay}</span>
          <span class="wl-col-rate ${totalClass}">${totalDisplay}</span>
          <div class="wl-col-action"><button class="btn-delete" data-id="${f.id}" title="移除自选">−</button></div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="card">
        <div class="card-body no-pad">
          <div class="wl-header">
            <span class="wl-hcol wl-hcol-info">基金信息</span>
            <span class="wl-hcol wl-hcol-sort" data-sort="change_rate">今日涨幅${sortIcon('change_rate')}</span>
            <span class="wl-hcol wl-hcol-sort" data-sort="total_change_rate">自选以来${sortIcon('total_change_rate')}</span>
            <span class="wl-hcol wl-hcol-action">移除</span>
          </div>
          ${rows}
        </div>
      </div>`;

    // Sort on column headers
    el.querySelector('.wl-header')?.addEventListener('click', (e) => {
      const col = e.target.closest('.wl-hcol-sort');
      if (!col) return;
      const key = col.dataset.sort;
      if (sortKey === key) {
        sortDesc = !sortDesc;
      } else {
        sortKey = key;
        sortDesc = true;
      }
      renderWatchlist(el);
    });

    // Delete buttons
    el.querySelector('.card')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-delete');
      if (!btn) return;
      const id = btn.dataset.id;
      try {
        await Api.del(`/watchlist/${id}`);
        Utils.showToast('已移除');
        watchlistData = watchlistData.filter(f => String(f.id) !== String(id));
        renderWatchlist(el);
      } catch (err) {
        Utils.showToast(err.message, 'error');
      }
    });
  }

  function sortWatchlist(data) {
    const sorted = [...data];
    sorted.sort((a, b) => {
      let va, vb;
      if (sortKey === 'change_rate') {
        va = Utils.parseChangeStr(a.change_rate) ?? -999;
        vb = Utils.parseChangeStr(b.change_rate) ?? -999;
      } else {
        va = a[sortKey] || 0;
        vb = b[sortKey] || 0;
      }
      return sortDesc ? vb - va : va - vb;
    });
    return sorted;
  }

  return {
    destroy: () => {
      destroyed = true;
      clearTimeout(searchTimeout);
    }
  };
});
