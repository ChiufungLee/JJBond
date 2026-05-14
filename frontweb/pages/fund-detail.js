/* ---- Fund Detail Sub-Page ---- */
(function() {
    const { Auth, apiGet, Router, showToast, escapeHtml, parseNum, formatFixed,
        formatMoney, formatSignedMoney, formatPercent, hasNeg, trendClass,
        profitClass, formatDate, throttle } = window.app;

    let chartInstance = null;
    let chartPoints = [];
    let currentRange = '30';
    let currentCode = '';

    Router.register('sub:fund-detail', async function(container, params) {
        const code = params.code;
        if (!code) { container.innerHTML = '<div class="empty-wrap"><div class="empty-text">缺少基金代码</div></div>'; return; }
        currentCode = code;
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';

        try {
            const [fundInfo, navHistory, sectorResp] = await Promise.all([
                apiGet('/funds/fund_info/' + code),
                apiGet('/funds/fund_nav_history/' + code, { days: currentRange }),
                apiGet('/sector/fund/' + code).catch(() => ({ sectors: [] }))
            ]);
            const sectors = sectorResp?.sectors || (Array.isArray(sectorResp) ? sectorResp : []);

            // Check if held
            let holdingInfo = null;
            try {
                const holdings = await apiGet('/funds/');
                holdingInfo = Array.isArray(holdings) ? holdings.find(h => h.fund_code === code) : null;
            } catch {}

            renderDetail(container, fundInfo, navHistory, sectors, holdingInfo);
        } catch (e) {
            container.innerHTML = `<div class="empty-wrap"><div class="empty-icon">&#128203;</div><div class="empty-text">加载失败: ${escapeHtml(e.message)}</div></div>`;
        }
    });

    function renderDetail(container, fund, navData, sectors, holding) {
        const name = escapeHtml(fund?.fund_name || fund?.name || currentCode);
        const code = escapeHtml(fund?.fund_code || currentCode);
        const changeRate = fund?.change_rate || fund?.gszzl || '--';
        const rateClass = hasNeg(changeRate) ? 'text-down' : 'text-up';
        const nav = formatFixed(fund?.nav || fund?.dwjz, 4);
        const navDate = fund?.nav_date || fund?.jzrq || '';

        // Holding info
        let holdingGrid = '';
        if (holding) {
            const cost = parseNum(holding.cost_price) ?? 0;
            const shares = parseNum(holding.shares) ?? 0;
            const totalCost = cost * shares;
            const currentNav = parseNum(fund?.nav || fund?.dwjz) ?? 0;
            const holdingAmount = currentNav * shares;
            const totalRevenue = holdingAmount - totalCost;
            const ratio = totalCost > 0 ? (totalRevenue / totalCost * 100) : 0;

            holdingGrid = `
                <div class="detail-section">
                    <div class="ds-title">持仓信息</div>
                    <div class="holding-grid">
                        <div class="hg-item"><div class="hg-label">持仓成本</div><div class="hg-value">¥${formatFixed(cost, 4)}</div></div>
                        <div class="hg-item"><div class="hg-label">持有份额</div><div class="hg-value">${formatFixed(shares, 2)}</div></div>
                        <div class="hg-item"><div class="hg-label">购买金额</div><div class="hg-value">¥${formatMoney(totalCost)}</div></div>
                        <div class="hg-item"><div class="hg-label">持有金额</div><div class="hg-value">¥${formatMoney(holdingAmount)}</div></div>
                        <div class="hg-item"><div class="hg-label">总收益</div><div class="hg-value ${trendClass(totalRevenue)}">${formatSignedMoney(totalRevenue)}</div></div>
                        <div class="hg-item"><div class="hg-label">收益率</div><div class="hg-value ${trendClass(ratio)}">${formatPercent(ratio)}</div></div>
                    </div>
                </div>`;
        }

        // Sector tags
        let sectorHtml = '';
        const sectorList = Array.isArray(sectors) ? sectors : [];
        if (sectorList.length > 0) {
            sectorHtml = `
                <div class="detail-section">
                    <div class="ds-title">相关板块</div>
                    <div class="sector-tags">
                        ${sectorList.map(s => `<span class="sector-tag" onclick="Router.navigate('/sub/sector-funds?code=${escapeHtml(s.sector_code)}&name=${escapeHtml(s.sector_name)}')">${escapeHtml(s.sector_name)}</span>`).join('')}
                    </div>
                </div>`;
        }

        // Nav history
        const navList = Array.isArray(navData) ? navData : (navData?.list || []);
        let navListHtml = '';
        if (navList.length > 0) {
            navListHtml = navList.slice(0, 30).map(n => {
                const growth = n.daily_growth || n.daily_growth_value || n.gszzl || '';
                const growthClass = hasNeg(String(growth)) ? 'text-down' : 'text-up';
                return `
                <div class="nav-row">
                    <div class="nr-date">${escapeHtml(n.date || n.fsrq || '-')}</div>
                    <div class="nr-nav">${formatFixed(n.unit_nav || n.dwjz, 4)}</div>
                    <div class="nr-growth ${growthClass}">${escapeHtml(String(growth))}%</div>
                </div>`;
            }).join('');
        }

        container.innerHTML = `
            <div class="detail-card">
                <div class="fund-title">${name}</div>
                <div class="fund-code">${code}</div>
                <div class="detail-rate ${rateClass}">${escapeHtml(changeRate)}%</div>
                <div class="detail-metrics">
                    <div class="dm-item"><div class="dm-label">单位净值</div><div class="dm-value">${nav}</div></div>
                    <div class="dm-item"><div class="dm-label">净值日期</div><div class="dm-value">${escapeHtml(navDate)}</div></div>
                </div>
            </div>
            ${holdingGrid}
            ${sectorHtml}
            <div class="detail-section">
                <div class="ds-title">净值走势</div>
                <div class="chart-tabs">
                    <button class="chart-tab ${currentRange==='30'?'active':''}" onclick="changeRange('30')">近1月</button>
                    <button class="chart-tab ${currentRange==='90'?'active':''}" onclick="changeRange('90')">近3月</button>
                    <button class="chart-tab ${currentRange==='365'?'active':''}" onclick="changeRange('365')">近1年</button>
                </div>
                <div class="chart-wrap"><canvas id="navChart"></canvas></div>
            </div>
            <div class="detail-section">
                <div class="ds-title">历史净值</div>
                <div class="nav-list">${navListHtml || '<div style="padding:20px;text-align:center;color:#999">暂无数据</div>'}</div>
            </div>
        `;

        // Render chart
        if (navList.length > 0) {
            setTimeout(() => renderChart(navList), 100);
        }
    }

    function renderChart(navList) {
        const ctx = document.getElementById('navChart');
        if (!ctx) return;
        if (chartInstance) chartInstance.destroy();

        const reversed = [...navList].reverse();
        const labels = reversed.map(n => n.date || n.fsrq || '');
        const navValues = reversed.map(n => parseNum(n.unit_nav || n.dwjz) ?? 0);
        const growthValues = reversed.map(n => parseNum(n.daily_growth || n.daily_growth_value || n.gszzl) ?? 0);

        chartPoints = labels.map((l, i) => ({ date: l, nav: navValues[i], growth: growthValues[i] }));

        const isMobile = window.innerWidth <= 768;

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '单位净值',
                    data: navValues,
                    borderColor: '#722ed1',
                    backgroundColor: 'rgba(114,46,209,0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: isMobile ? 0 : 3,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                }, {
                    label: '日增长率(%)',
                    data: growthValues,
                    borderColor: '#faad14',
                    borderWidth: 1.5,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                if (ctx.datasetIndex === 0) return '净值: ' + formatFixed(ctx.parsed.y, 4);
                                return '涨跌: ' + formatFixed(ctx.parsed.y, 2) + '%';
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { maxTicksLimit: isMobile ? 5 : 10, font: { size: 10 } } },
                    y: { position: 'left', ticks: { font: { size: 10 }, callback: v => v.toFixed(4) } },
                    y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, callback: v => v.toFixed(2) + '%' } }
                }
            }
        });
    }

    window.changeRange = async function(range) {
        currentRange = range;
        try {
            const navData = await apiGet('/funds/fund_nav_history/' + currentCode, { days: range });
            const navList = Array.isArray(navData) ? navData : (navData?.list || []);
            if (navList.length > 0) renderChart(navList);
            // Update tab active state
            document.querySelectorAll('.chart-tab').forEach(el => {
                el.classList.toggle('active', el.textContent.includes(range === '30' ? '1月' : range === '90' ? '3月' : '1年'));
            });
        } catch (e) { showToast('加载失败', 'error'); }
    };
})();
