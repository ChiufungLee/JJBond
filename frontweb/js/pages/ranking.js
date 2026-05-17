Router.register('/ranking', (container) => {
  const TYPES = [
    { key: 'day', label: '日涨' },
    { key: 'week', label: '周涨' },
    { key: 'month', label: '月涨' },
    { key: 'year', label: '年涨' },
    { key: 'ytd', label: '今年以来' },
  ];

  let currentType = 'day';
  let desc = true;
  let page = 1;
  let loading = false;
  let hasMore = true;
  let total = 0;
  let items = [];
  let destroyed = false;

  container.innerHTML = `
    <div class="page-container">
      <div class="card">
        <div class="card-header">
          <div class="tabs" id="rk-tabs">
            ${TYPES.map(t => `
              <div class="tab-item-page ${t.key === currentType ? 'active' : ''}" data-type="${t.key}">${t.label}</div>`).join('')}
          </div>
          <button class="desc-toggle" id="rk-desc" title="切换排序方向">
            ${desc ? '↓ 降序' : '↑ 升序'}
          </button>
        </div>
        <div class="card-body no-pad" id="rk-list">
          <div class="loading-wrap"><div class="loading-spinner"></div><span>加载中...</span></div>
        </div>
      </div>
    </div>`;

  // Tab events
  container.querySelectorAll('#rk-tabs .tab-item-page').forEach(tab => {
    tab.addEventListener('click', () => {
      currentType = tab.dataset.type;
      container.querySelectorAll('#rk-tabs .tab-item-page').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      resetAndLoad();
    });
  });

  // Desc toggle
  document.getElementById('rk-desc').addEventListener('click', () => {
    desc = !desc;
    document.getElementById('rk-desc').textContent = desc ? '↓ 降序' : '↑ 升序';
    resetAndLoad();
  });

  // Scroll to load more
  const scrollHandler = Utils.throttle(() => {
    if (destroyed || loading || !hasMore) return;
    const scrollH = document.documentElement.scrollHeight;
    const clientH = document.documentElement.clientHeight;
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    if (scrollTop + clientH >= scrollH - 200) {
      loadMore();
    }
  }, 200);
  window.addEventListener('scroll', scrollHandler);

  function resetAndLoad() {
    page = 1;
    items = [];
    hasMore = true;
    loadRanking();
  }

  async function loadRanking() {
    const el = document.getElementById('rk-list');
    loading = true;
    try {
      const data = await Api.get(`/ranking/?type=${currentType}&page=${page}&page_size=20&desc=${desc}`);
      if (destroyed) return;
      total = data.total || 0;
      items = page === 1 ? (data.data || []) : [...items, ...(data.data || [])];
      hasMore = items.length < total;
      renderList(el);
    } catch (e) {
      if (page === 1) {
        el.innerHTML = `<div class="empty-state"><p>加载失败: ${Utils.escapeHtml(e.message)}</p></div>`;
      }
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    page++;
    await loadRanking();
  }

  function renderList(el) {
    if (items.length === 0) {
      el.innerHTML = `<div class="empty-state"><p>暂无数据</p></div>`;
      return;
    }

    el.innerHTML = items.map((item, i) => `
      <div class="ranking-item">
        <div class="ranking-item-rank">
          <span class="badge-rank ${i < 3 ? 'top' : ''}">${item.rank || i + 1}</span>
        </div>
        <div class="ranking-item-info">
          <div class="ranking-item-name">${Utils.escapeHtml(item.fundName)}</div>
          <div class="ranking-item-meta">
            ${item.ftype ? `<span class="badge badge-type">${Utils.escapeHtml(item.ftype)}</span>` : ''}
            <span>${item.fundCode}</span>
          </div>
        </div>
        <div class="ranking-item-right">
          <span class="ranking-item-change ${Utils.getChangeClass(item.change)}">${Utils.formatPercent(item.change)}</span>
          <span class="ranking-item-nav">${item.perNav || '--'}</span>
          <button class="btn-add" data-code="${item.fundCode}" data-name="${Utils.escapeHtml(item.fundName)}" title="添加自选">+</button>
        </div>
      </div>`).join('') +
      (hasMore ? '<div class="load-more"><div class="loading-spinner"></div></div>' :
        '<div class="load-more text-muted">没有更多了</div>');

    // Add to watchlist
    el.querySelectorAll('.btn-add').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await Api.post('/watchlist/', {
            fund_code: btn.dataset.code,
            fund_name: btn.dataset.name,
          });
          Utils.showToast('已添加到自选');
          btn.disabled = true;
          btn.style.opacity = '0.5';
        } catch (err) {
          Utils.showToast(err.message, 'error');
        }
      });
    });
  }

  loadRanking();

  return {
    destroy: () => {
      destroyed = true;
      window.removeEventListener('scroll', scrollHandler);
    }
  };
});
