Router.register('/distribution', (container) => {
  let destroyed = false;
  let portfolioData = null;
  let sectorData = null;

  container.innerHTML = `
    <div class="page-container">
      <div id="dist-content">
        <div class="loading-wrap"><div class="loading-spinner"></div><span>加载中...</span></div>
      </div>
    </div>`;

  loadData();

  async function loadData() {
    const el = document.getElementById('dist-content');
    try {
      const [portfolio, sector] = await Promise.all([
        Api.get('/funds/calculate-simple'),
        Api.get('/funds/sector-distribution'),
      ]);
      if (destroyed) return;
      portfolioData = portfolio;
      sectorData = sector;
      render(el);
    } catch (e) {
      if (e.message.includes('登录')) {
        el.innerHTML = `
          <div class="login-hint">
            <div class="login-hint-icon">📊</div>
            <h3>查看持仓分布</h3>
            <p>登录后即可查看持仓分布</p>
            <a href="#/login" class="btn btn-primary">去登录</a>
          </div>`;
      } else {
        el.innerHTML = `<div class="empty-state"><p>加载失败: ${Utils.escapeHtml(e.message)}</p></div>`;
      }
    }
  }

  function render(el) {
    el = el || document.getElementById('dist-content');
    if (!el) return;

    const totalValue = sectorData?.total_value || 0;
    const hide = App.isHideAmount();
    const funds = portfolioData?.fund_details || [];
    const sectors = sectorData?.sectors || [];

    const colors = [
      '#722ed1', '#1890ff', '#13c2c2', '#52c41a', '#faad14',
      '#f5222d', '#eb2f96', '#2f54eb', '#fa8c16', '#a0d911',
    ];

    // Build fund pie data from cost, sorted desc
    const sortedFunds = [...funds].sort((a, b) => (b.cost || 0) - (a.cost || 0));
    const totalCost = sortedFunds.reduce((sum, f) => sum + (f.cost || 0), 0);
    const fundItems = totalCost > 0 ? sortedFunds.map((f, i) => ({
      name: f.fund_name || f.fund_code,
      value: f.cost || 0,
      percentage: ((f.cost || 0) / totalCost) * 100,
      color: colors[i % colors.length],
    })) : [];

    // Build sector pie data
    const sectorItems = sectors.map((s, i) => ({
      name: s.sector_name,
      value: s.value,
      percentage: s.percentage,
      color: colors[i % colors.length],
    }));

    el.innerHTML = `
      <div class="dist-summary card">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div class="dist-summary-label">持仓总市值</div>
            <div class="dist-summary-value">${hide ? '****' : '¥' + Utils.formatMoney(totalValue)}</div>
          </div>
          <button class="eye-toggle" id="dist-eye" title="隐藏/显示金额">
            ${hide
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            }
          </button>
        </div>
      </div>

      <div class="card dist-chart-card">
        <div class="card-header">
          <span class="card-title">资金分布</span>
        </div>
        <div class="card-body">
          ${fundItems.length > 0 ? `
            <div class="dist-chart-wrap">
              <canvas id="dist-fund-pie" width="260" height="260"></canvas>
            </div>
            <div class="dist-legend" id="dist-fund-legend"></div>
          ` : '<div class="empty-guide" style="padding:30px 0;"><p>暂无持仓数据</p></div>'}
        </div>
      </div>

      <div class="card dist-chart-card">
        <div class="card-header">
          <span class="card-title">板块分布</span>
        </div>
        <div class="card-body">
          ${sectorItems.length > 0 ? `
            <div class="dist-chart-wrap">
              <canvas id="dist-sector-pie" width="260" height="260"></canvas>
            </div>
            <div class="dist-legend" id="dist-sector-legend"></div>
          ` : '<div class="empty-guide" style="padding:30px 0;"><p>暂无板块数据</p></div>'}
        </div>
      </div>`;

    // Eye toggle
    document.getElementById('dist-eye')?.addEventListener('click', () => {
      App.toggleHideAmount();
      render(el);
    });

    // Draw charts
    if (fundItems.length > 0) {
      drawPieChart('dist-fund-pie', fundItems, funds.length + '只基金', '资金分布');
      renderLegend('dist-fund-legend', fundItems, hide);
    }
    if (sectorItems.length > 0) {
      drawPieChart('dist-sector-pie', sectorItems, sectors.length + '个板块', '板块分布');
      renderLegend('dist-sector-legend', sectorItems, hide);
    }
  }

  function drawPieChart(canvasId, items, centerLine1, centerLine2) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 260;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 16;
    const innerRadius = radius * 0.55;

    const total = items.reduce((sum, it) => sum + it.value, 0);
    if (total <= 0) return;

    let startAngle = -Math.PI / 2;

    items.forEach(item => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();

      if (item.percentage >= 6) {
        const midAngle = startAngle + sliceAngle / 2;
        const labelR = (radius + innerRadius) / 2;
        const lx = cx + Math.cos(midAngle) * labelR;
        const ly = cy + Math.sin(midAngle) * labelR;

        ctx.fillStyle = '#fff';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.percentage.toFixed(1) + '%', lx, ly);
      }

      startAngle = endAngle;
    });

    // Inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Center text
    ctx.fillStyle = '#333';
    ctx.font = '600 13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(centerLine1, cx, cy - 8);
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#999';
    ctx.fillText(centerLine2, cx, cy + 10);
  }

  function renderLegend(elId, items, hide) {
    const el = document.getElementById(elId);
    if (!el) return;

    el.innerHTML = items.map(item => `
      <div class="dist-legend-item">
        <span class="dist-legend-dot" style="background:${item.color}"></span>
        <span class="dist-legend-name">${Utils.escapeHtml(item.name)}</span>
        <span class="dist-legend-pct">${item.percentage.toFixed(1)}%</span>
        <span class="dist-legend-val">${hide ? '****' : '¥' + Utils.formatMoney(item.value)}</span>
      </div>`).join('');
  }

  return {
    destroy: () => { destroyed = true; portfolioData = null; sectorData = null; }
  };
});
