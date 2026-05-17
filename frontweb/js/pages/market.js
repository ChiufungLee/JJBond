Router.register('/market', (container) => {
  let destroyed = false;

  container.innerHTML = `
    <div class="page-container">
      <div id="market-indices">
        <div class="loading-wrap"><div class="loading-spinner"></div><span>加载行情数据...</span></div>
      </div>
      <div id="market-flow" class="market-section" style="margin-top:24px;"></div>
      <div id="market-ranking" class="market-section" style="margin-top:24px;"></div>
    </div>`;

  loadIndices();
  loadSectorFlow();
  loadTopRanking();

  async function loadIndices() {
    const el = document.getElementById('market-indices');
    try {
      const data = await Api.get('/market/indices');
      if (destroyed) return;
      const groups = data.groups || [];
      if (groups.length === 0) {
        el.innerHTML = '<p class="text-muted text-center">暂无行情数据</p>';
        return;
      }
      el.innerHTML = `<div class="card"><div class="card-body">` +
        groups.map(group => `
        <div class="indices-group-title">${Utils.escapeHtml(group.name)}</div>
        <div class="indices-scroll">
          ${(group.items || []).map(item => {
            const isUp = (item.change_pct || 0) >= 0;
            return `
              <div class="index-card ${isUp ? 'up' : 'down'}">
                <div class="index-card-name">${Utils.escapeHtml(item.name)}</div>
                <div class="index-card-price">${item.price || '--'}</div>
                <div class="index-card-detail">
                  <span class="index-card-amt">${Utils.formatChange(item.change, 2)}</span>
                  <span class="index-card-change">${Utils.formatChange(item.change_pct, 2)}%</span>
                </div>
              </div>`;
          }).join('')}
        </div>`).join('') +
        `</div></div>`;
    } catch (e) {
      el.innerHTML = `<p class="text-muted text-center">行情加载失败</p>`;
    }
  }

  async function loadSectorFlow() {
    const el = document.getElementById('market-flow');
    try {
      const data = await Api.get('/sector/?type=all&sort=flow&st=FLOW');
      if (destroyed) return;
      const items = data.data || [];
      if (items.length === 0) return;

      const inflow = items.filter(i => i.value > 0).slice(0, 10);
      const outflow = items.filter(i => i.value < 0).slice(0, 10);

      let activeTab = 'inflow';

      function renderFlow() {
        const list = activeTab === 'inflow' ? inflow : outflow;
        const cards = list.slice(0, 3);
        const rest = list.slice(3);

        el.innerHTML = `
          <div class="card"><div class="card-body">
          <div class="section-header">
            <span class="section-title">板块资金流向</span>
            <div class="flow-tabs">
              <div class="flow-tab ${activeTab === 'inflow' ? 'active' : ''}" data-tab="inflow">流入</div>
              <div class="flow-tab ${activeTab === 'outflow' ? 'active' : ''}" data-tab="outflow">流出</div>
            </div>
          </div>
          <div class="flow-cards">
            ${cards.map((item, i) => {
              const isUp = (item.change_rate || 0) >= 0;
              const flowUp = item.value > 0;
              return `
              <div class="flow-card ${isUp ? 'up' : 'down'}" data-code="${item.code}">
                <div class="flow-card-name">${Utils.escapeHtml(item.name)}</div>
                <div class="flow-card-flow ${flowUp ? 'text-up' : 'text-down'}">${Utils.formatFlowYi(item.value)}</div>
                <div class="flow-card-change">${Utils.formatPercent(item.change_rate)}</div>
              </div>`;
            }).join('')}
          </div>
          ${rest.length > 0 ? `
            <ul class="flow-list">
              ${rest.map((item, i) => `
                <li class="flow-list-item" data-code="${item.code}">
                  <span class="flow-list-rank">${i + 4}</span>
                  <div class="flow-list-info">
                    <span class="flow-list-name">${Utils.escapeHtml(item.name)}</span>
                    <span class="flow-list-sub">涨幅 ${Utils.formatPercent(item.change_rate)}</span>
                  </div>
                  <span class="flow-list-flow">${Utils.formatFlowYi(item.value)}</span>
                </li>`).join('')}
            </ul>` : ''}
          </div></div>`;

        el.querySelectorAll('.flow-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            activeTab = tab.dataset.tab;
            renderFlow();
          });
        });
      }

      renderFlow();
    } catch (e) {
      el.innerHTML = '';
    }
  }

  async function loadTopRanking() {
    const el = document.getElementById('market-ranking');
    try {
      const data = await Api.get('/ranking/?type=day&page=1&page_size=10&desc=true');
      if (destroyed) return;
      const items = data.data || [];
      if (items.length === 0) return;

      el.innerHTML = `
        <div class="section-header">
          <span class="section-title">日涨幅排行</span>
          <a href="#/ranking" class="section-link">更多排行 →</a>
        </div>
        <div class="ranking-list">
          ${items.map((item, i) => `
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
              </div>
            </div>`).join('')}
        </div>`;
    } catch (e) {
      el.innerHTML = '';
    }
  }

  return {
    destroy: () => { destroyed = true; }
  };
});
