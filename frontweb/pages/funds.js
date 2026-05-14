/* ---- Funds Distribution Sub-Page (持仓分布饼图) ---- */
(function() {
    const { Auth, apiGet, Router, showToast, escapeHtml, parseNum, formatMoney } = window.app;

    const COLORS = ['#722ed1','#1890ff','#52c41a','#faad14','#ff4d4f','#13c2c2','#eb2f96','#fa541c','#2f54eb','#a0d911'];

    Router.register('sub:funds', async function(container, params) {
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';

        try {
            const [portfolio, sectorDist] = await Promise.all([
                apiGet('/funds/calculate-simple'),
                apiGet('/funds/sector-distribution').catch(() => null)
            ]);
            renderDistribution(container, portfolio, sectorDist);
        } catch (e) {
            container.innerHTML = `<div class="empty-wrap"><div class="empty-text">加载失败</div></div>`;
        }
    });

    function renderDistribution(container, portfolio, sectorDist) {
        const fundDetails = Array.isArray(portfolio?.fund_details) ? portfolio.fund_details : [];

        // Fund distribution pie
        let fundPieHtml = '';
        if (fundDetails.length > 0) {
            const items = fundDetails.map(f => ({
                name: f.fund_name || f.fund_code || '-',
                value: parseNum(f.today_holding_amount ?? f.amount ?? f.cost) ?? 0
            })).filter(i => i.value > 0);

            if (items.length > 0) {
                fundPieHtml = buildPieCard('资金分布', items, items.length);
            }
        }

        // Sector distribution pie
        let sectorPieHtml = '';
        const sectorList = Array.isArray(sectorDist?.sectors) ? sectorDist.sectors : (Array.isArray(sectorDist) ? sectorDist : []);
        if (sectorList.length > 0) {
            const items = sectorList.map(s => ({
                name: s.sector_name || s.name || '-',
                value: parseNum(s.amount ?? s.value ?? s.total) ?? 0
            })).filter(i => i.value > 0);

            if (items.length > 0) {
                sectorPieHtml = buildPieCard('板块分布', items, items.length);
            }
        }

        if (!fundPieHtml && !sectorPieHtml) {
            container.innerHTML = '<div class="empty-wrap"><div class="empty-icon">&#128202;</div><div class="empty-text">暂无持仓数据</div></div>';
            return;
        }

        container.innerHTML = fundPieHtml + sectorPieHtml;
    }

    function buildPieCard(title, items, count) {
        const total = items.reduce((s, i) => s + i.value, 0);
        if (total <= 0) return '';

        // Build conic-gradient
        let gradient = '';
        let cumPct = 0;
        items.forEach((item, i) => {
            const pct = (item.value / total) * 100;
            const color = COLORS[i % COLORS.length];
            gradient += `${color} ${cumPct}% ${cumPct + pct}%`;
            cumPct += pct;
            if (i < items.length - 1) gradient += ', ';
        });

        // Legend
        const legendHtml = items.slice(0, 10).map((item, i) => {
            const color = COLORS[i % COLORS.length];
            const pct = ((item.value / total) * 100).toFixed(1);
            return `
            <div class="pie-legend-item">
                <span class="pl-dot" style="background:${color}"></span>
                <span class="pl-name">${escapeHtml(item.name)}</span>
                <span class="pl-val">${pct}%</span>
            </div>`;
        }).join('');

        return `
        <div class="pie-card">
            <div class="pie-title">${title} (${count}只)</div>
            <div class="pie-wrap">
                <div class="pie-chart">
                    <div class="donut" style="background:conic-gradient(${gradient})"></div>
                    <div class="pie-center">
                        <div class="pc-num">${count}</div>
                        <div class="pc-label">只</div>
                    </div>
                </div>
                <div class="pie-legend">${legendHtml}</div>
            </div>
        </div>`;
    }
})();
