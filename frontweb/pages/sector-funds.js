/* ---- Sector Funds Sub-Page ---- */
(function() {
    const { apiGet, Router, showToast, escapeHtml, parseNum, formatFixed,
        formatPercent, hasNeg } = window.app;

    let sectorCode = '';
    let sectorName = '';
    let fundsList = [];
    let page = 1;
    let hasMore = true;
    let loading = false;
    let sortMonth = true;
    let sortDesc = true;
    let cachedDetail = null;

    Router.register('sub:sector-funds', async function(container, params) {
        sectorCode = params.code || '';
        sectorName = params.name || '';
        fundsList = [];
        page = 1;
        hasMore = true;
        cachedDetail = null;

        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';

        // Load sector detail and first page of funds
        try {
            const [detail, funds] = await Promise.all([
                apiGet('/sector/' + sectorCode + '/detail').catch(() => null),
                apiGet('/sector/' + sectorCode + '/funds', { page: 1, page_size: 20 })
            ]);
            cachedDetail = detail;
            fundsList = Array.isArray(funds?.data) ? funds.data : (Array.isArray(funds) ? funds : []);
            hasMore = fundsList.length >= 20;
            page = 2;
            renderSectorFunds(container, detail);
        } catch (e) {
            container.innerHTML = `<div class="empty-wrap"><div class="empty-text">加载失败</div></div>`;
        }
    });

    function renderSectorFunds(container, detail) {
        // Sector info card
        let infoHtml = '';
        if (detail) {
            const metrics = [
                { label: '日涨幅', val: detail.day_change_rate },
                { label: '周涨幅', val: detail.week_change_rate },
                { label: '月涨幅', val: detail.month_change_rate },
                { label: '季涨幅', val: detail.quarter_change_rate },
                { label: '年涨幅', val: detail.year_change_rate },
                { label: '今年来', val: detail.ytd_change_rate }
            ];
            infoHtml = `
                <div class="detail-card" style="margin:0">
                    <div class="fund-title">${escapeHtml(sectorName || detail.sector_name || sectorCode)}</div>
                    <div class="detail-metrics" style="flex-wrap:wrap;gap:8px">
                        ${metrics.map(m => `
                            <div class="dm-item" style="min-width:60px">
                                <div class="dm-label">${m.label}</div>
                                <div class="dm-value ${hasNeg(m.val || '') ? 'text-down' : 'text-up'}">${m.val != null ? escapeHtml(m.val) : '-'}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        // Sort funds
        const sorted = [...fundsList].sort((a, b) => {
            const av = parseNum(a.changeMonth ?? a.change ?? a.month_change_rate) ?? 0;
            const bv = parseNum(b.changeMonth ?? b.change ?? b.month_change_rate) ?? 0;
            return sortDesc ? bv - av : av - bv;
        });

        let listHtml = '';
        if (sorted.length > 0) {
            listHtml = sorted.map((f, i) => {
                const rank = (page - 2) * 20 + i + 1;
                const code = f.fundCode || f.fund_code || '-';
                const name = f.fundName || f.fund_name || '-';
                const rate = f.changeMonth || f.change || f.change_rate || '--';
                return `
                <div class="rank-item" onclick="Router.navigate('/sub/fund-detail?code=${escapeHtml(code)}')">
                    <div class="rank-badge other">${rank}</div>
                    <div class="rank-info">
                        <div class="rank-name">${escapeHtml(name)}</div>
                        <div class="rank-code">${escapeHtml(code)}</div>
                    </div>
                    <div class="rank-rate ${hasNeg(String(rate)) ? 'text-down' : 'text-up'}">${escapeHtml(String(rate))}</div>
                    <div class="rank-nav">${formatFixed(f.nav || f.perNav, 4)}</div>
                </div>`;
            }).join('');
        } else {
            listHtml = '<div class="empty-wrap"><div class="empty-text">暂无基金</div></div>';
        }

        container.innerHTML = `
            ${infoHtml}
            <div class="filter-bar">
                <span style="font-size:14px;font-weight:600">基金列表</span>
                <button class="sort-btn" onclick="sfToggleSort()">月涨幅 ${sortDesc ? '&#9660;' : '&#9650;'}</button>
            </div>
            ${listHtml}
            ${hasMore ? '<div style="padding:16px;text-align:center"><button class="btn btn-outline" onclick="sfLoadMore()">加载更多</button></div>' : ''}
        `;
    }

    window.sfToggleSort = function() {
        sortDesc = !sortDesc;
        renderSectorFunds(document.getElementById('subPageContent'), cachedDetail);
    };

    window.sfLoadMore = async function() {
        if (loading || !hasMore) return;
        loading = true;
        try {
            const funds = await apiGet('/sector/' + sectorCode + '/funds', { page, page_size: 20 });
            const newItems = Array.isArray(funds?.data) ? funds.data : (Array.isArray(funds) ? funds : []);
            fundsList = fundsList.concat(newItems);
            hasMore = newItems.length >= 20;
            page++;
            renderSectorFunds(document.getElementById('subPageContent'), cachedDetail);
        } catch (e) { showToast('加载失败', 'error'); }
        loading = false;
    };
})();
