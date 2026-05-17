Router.register('/home', (container) => {
  let sortKey = 'change_rate';
  let sortDesc = true;
  let portfolioData = null;

  container.innerHTML = `
    <div class="page-container">
      <div id="home-content">
        <div class="loading-wrap"><div class="loading-spinner"></div><span>加载中...</span></div>
      </div>
    </div>`;

  loadPortfolio();

  async function loadPortfolio() {
    const el = document.getElementById('home-content');
    try {
      portfolioData = await Api.get('/funds/calculate-simple');
      renderPortfolio(el, portfolioData);
    } catch (e) {
      if (e.message.includes('登录')) {
        renderLoginHint(el);
      } else {
        el.innerHTML = `<div class="empty-state"><p>加载失败: ${Utils.escapeHtml(e.message)}</p>
          <button onclick="location.reload()" class="btn btn-primary btn-sm">重试</button></div>`;
      }
    }
  }

  function renderLoginHint(el) {
    el.innerHTML = `
      <div class="login-hint">
        <div class="login-hint-icon">📊</div>
        <h3>查看您的持仓</h3>
        <p>登录后即可管理您的基金投资组合</p>
        <a href="#/login" class="btn btn-primary">去登录</a>
      </div>`;
  }

  function renderPortfolio(el, data) {
    if (!data || !data.fund_details || data.fund_details.length === 0) {
      el.innerHTML = `
        <div class="home-summary">
          <div class="summary-card">
            <div class="summary-main">
              <div class="summary-label">今日收益</div>
              <div class="summary-value">¥0.00</div>
            </div>
            <div class="summary-row">
              <div class="summary-item">
                <div class="summary-item-label">总成本</div>
                <div class="summary-item-value">¥0.00</div>
              </div>
              <div class="summary-item">
                <div class="summary-item-label">累计收益</div>
                <div class="summary-item-value">¥0.00</div>
              </div>
            </div>
          </div>
        </div>
        <div class="empty-guide">
          <div class="empty-guide-icon">📋</div>
          <p>暂无持仓，添加您的第一只基金吧</p>
        </div>`;
      return;
    }

    const todayRevenue = data.today_revenue || 0;
    const totalCost = data.total_cost || 0;
    const totalAmount = data.today_holding_amount || 0;
    const totalProfit = totalAmount - totalCost;
    const isUp = todayRevenue >= 0;
    const greeting = isUp ? '恭喜，今日收益为正！' : '加油，市场总有波动。';
    const hide = App.isHideAmount();

    // High/low funds (List[str] of fund names with change_rate > 3%)
    const highFunds = data.high_fund_list || [];
    const lowFunds = data.low_fund_list || [];

    let rankTagsHtml = '';
    if (highFunds.length > 0 || lowFunds.length > 0) {
      const totalCount = highFunds.length + lowFunds.length;
      const highTags = highFunds.map(name => `<span class="rank-tag up">${Utils.escapeHtml(name.replace(/\s*涨幅为[:：]?\s*/, ' '))}</span>`).join('');
      const lowTags = lowFunds.map(name => `<span class="rank-tag down">${Utils.escapeHtml(name.replace(/\s*跌幅为[:：]?\s*/, ' '))}</span>`).join('');
      rankTagsHtml = `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-body">
            <div class="section-header" style="margin-bottom:10px;">
              <span class="section-title">涨幅大于3%的基金（${totalCount}）</span>
            </div>
            ${highFunds.length > 0 ? `<div class="rank-tags" style="margin-bottom:8px;">${highTags}</div>` : ''}
            ${lowFunds.length > 0 ? `<div class="rank-tags">${lowTags}</div>` : ''}
          </div>
        </div>`;
    }

    const changeClass = Utils.getChangeClass(todayRevenue);
    const funds = sortFunds(data.fund_details);

    function sortIcon(key) {
      if (sortKey !== key) return '<span class="sort-arrows"><span>▲</span><span>▼</span></span>';
      return sortDesc
        ? '<span class="sort-arrows"><span>▲</span><span class="active">▼</span></span>'
        : '<span class="sort-arrows"><span class="active">▲</span><span>▼</span></span>';
    }

    const fundsHtml = funds.map(f => {
      const crNum = Utils.parseChangeStr(f.change_rate);
      const fChangeClass = Utils.getChangeClass(crNum);
      const crDisplay = f.change_rate != null ? f.change_rate : '--';
      const trClass = Utils.getChangeClass(f.total_revenue);
      const trvClass = Utils.getChangeClass(f.today_revenue);
      return `
        <div class="fund-row-home" data-code="${f.fund_code || ''}">
          <div class="frh-row1">
            <span class="frh-name">${Utils.escapeHtml(f.fund_name)}</span>
            <span class="frh-value ${trvClass}">${hide ? '****' : (f.today_revenue >= 0 ? '+' : '') + Utils.formatMoney(f.today_revenue)}</span>
            <span class="frh-rate ${fChangeClass}">${crDisplay}</span>
          </div>
          <div class="frh-row2">
            <span class="frh-cost">${hide ? '****' : '￥' + Utils.formatMoney(f.cost)}${f.nav_updated ? '<span class="badge badge-updated">已更新</span>' : ''}</span>
            <span class="frh-rate ${Utils.getChangeClass(f.profit_loss_ratio)}">${Utils.formatPercent(f.profit_loss_ratio)}</span>
            <span class="frh-rate ${trClass}">${hide ? '****' : (f.total_revenue >= 0 ? '+' : '') + Utils.formatMoney(f.total_revenue)}</span>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="home-summary">
        <div class="summary-card">
          <button class="eye-toggle" id="eye-toggle" title="隐藏/显示金额">
            ${hide
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            }
          </button>
          <div class="summary-main">
            <div class="summary-label">今日收益</div>
            <div class="summary-value ${changeClass}">${hide ? '****' : (isUp ? '+' : '') + Utils.formatMoney(todayRevenue)}<span class="unit">元</span></div>
          </div>
          <div class="summary-row">
            <div class="summary-item">
              <div class="summary-item-label">总成本</div>
              <div class="summary-item-value">${App.maskMoney(totalCost)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-item-label">累计收益</div>
              <div class="summary-item-value ${Utils.getChangeClass(totalProfit)}">${App.maskMoney(totalProfit)}</div>
            </div>
          </div>
          <div class="greeting" style="text-align:right;">${greeting}</div>
        </div>
      </div>
      ${rankTagsHtml}
      <div class="card">
        <div class="card-header">
          <span class="card-title">持仓基金 (${data.fund_count || 0})</span>
          <a href="#/funds-add" class="btn btn-outline btn-sm" id="add-fund-btn">+ 添加基金</a>
        </div>
        <div class="card-body no-pad">
          <div class="fund-list-header">
            <span class="flh-col flh-name">基金信息</span>
            <span class="flh-col flh-sort" data-sort="today_revenue">今日收益${sortIcon('today_revenue')}</span>
            <span class="flh-col flh-sort" data-sort="change_rate">涨幅${sortIcon('change_rate')}</span>
          </div>
          ${fundsHtml}
        </div>
      </div>`;

    // Event: eye toggle
    document.getElementById('eye-toggle')?.addEventListener('click', () => {
      App.toggleHideAmount();
      renderPortfolio(container.querySelector('#home-content'), portfolioData);
    });

    // Event: sort on column headers (event delegation)
    container.querySelector('.fund-list-header')?.addEventListener('click', (e) => {
      const col = e.target.closest('.flh-sort');
      if (!col) return;
      const key = col.dataset.sort;
      if (sortKey === key) {
        sortDesc = !sortDesc;
      } else {
        sortKey = key;
        sortDesc = true;
      }
      renderPortfolio(container.querySelector('#home-content'), portfolioData);
    });
  }

  function sortFunds(funds) {
    if (!funds) return [];
    const sorted = [...funds];
    sorted.sort((a, b) => {
      let va, vb;
      if (sortKey === 'change_rate') {
        va = Utils.parseChangeStr(a.change_rate) ?? -999;
        vb = Utils.parseChangeStr(b.change_rate) ?? -999;
      } else if (sortKey === 'today_revenue') {
        va = a.today_revenue || 0;
        vb = b.today_revenue || 0;
      } else if (sortKey === 'total_revenue') {
        va = a.total_revenue || 0;
        vb = b.total_revenue || 0;
      } else {
        return 0;
      }
      return sortDesc ? vb - va : va - vb;
    });
    return sorted;
  }

  return {
    destroy: () => {
      portfolioData = null;
    }
  };
});
