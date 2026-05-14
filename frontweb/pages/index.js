/* ---- Index Page (持有) ---- */
(function() {
    const { Auth, apiGet, Router, showToast, showConfirm, escapeHtml, parseNum, formatFixed,
        formatMoney, formatSignedMoney, formatPercent, hasNeg, trendClass, profitClass,
        formatDate } = window.app;

    let portfolioData = null;
    let sortKey = 'change_rate';
    let sortDesc = true;
    let hideAmount = localStorage.getItem('hideAmount') === 'true';

    function formatSignedCurrency(v) {
        const n = parseNum(v);
        if (n === null) return '-';
        return (n >= 0 ? '+' : '-') + '¥' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function maskAmount(text) {
        return hideAmount ? '***' : text;
    }

    Router.register('index', async function(params) {
        const container = document.getElementById('page-index');
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';

        try {
            const data = await apiGet('/funds/calculate-simple');
            portfolioData = data;
            renderIndex(container, data);
        } catch (e) {
            if (e.message === '认证失败') return;
            container.innerHTML = `
                <div class="empty-wrap">
                    <div class="empty-icon">&#128203;</div>
                    <div class="empty-text">加载失败，请下拉刷新</div>
                    <button class="btn btn-primary" onclick="Router.navigate('/index')">重试</button>
                </div>`;
        }
    });

    function renderIndex(container, summary) {
        const todayRevenue = parseNum(summary.today_revenue) ?? 0;
        const yesterdayIncome = parseNum(summary.yesterday_holding_income) ?? 0;
        const totalRevenue = yesterdayIncome + todayRevenue;
        const totalCost = parseNum(summary.total_cost) ?? 0;
        const todayAmount = parseNum(summary.today_holding_amount) ?? 0;
        const fundDetails = Array.isArray(summary.fund_details) ? summary.fund_details : [];
        const lowFunds = Array.isArray(summary.low_fund_list) ? summary.low_fund_list : [];
        const highFunds = Array.isArray(summary.high_fund_list) ? summary.high_fund_list : [];
        const greeting = todayRevenue >= 0 ? '恭喜发财！' : '请开心起来!';
        const revenuePercent = todayAmount > 0 ? (todayRevenue / (todayAmount - todayRevenue) * 100) : 0;

        // Sort fund details
        const sorted = [...fundDetails].sort((a, b) => {
            let av, bv;
            if (sortKey === 'change_rate') {
                av = parseNum(a.change_rate) ?? 0;
                bv = parseNum(b.change_rate) ?? 0;
            } else {
                av = parseNum(a.total_revenue) ?? 0;
                bv = parseNum(b.total_revenue) ?? 0;
            }
            return sortDesc ? bv - av : av - bv;
        });

        let gainersSection = '';
        if (lowFunds.length > 0 || highFunds.length > 0) {
            const tags = [
                ...highFunds.map(c => `<span class="gainer-tag up" onclick="Router.navigate('/sub/fund-detail?code=${escapeHtml(c)}')">${escapeHtml(c)} &#128293;</span>`),
                ...lowFunds.map(c => `<span class="gainer-tag down" onclick="Router.navigate('/sub/fund-detail?code=${escapeHtml(c)}')">${escapeHtml(c)} &#128168;</span>`)
            ].join('');
            gainersSection = `
                <div class="gainers-section">
                    <h4>涨跌幅 &gt; 3%</h4>
                    <div class="gainers-tags">${tags}</div>
                </div>`;
        }

        let fundListHtml = '';
        if (sorted.length > 0) {
            const rows = sorted.map(f => {
                const name = escapeHtml(f.fund_name || '-');
                const code = escapeHtml(f.fund_code || '-');
                const rate = f.change_rate || '--';
                const rateClass = hasNeg(rate) ? 'text-down' : 'text-up';
                const todayRev = parseNum(f.today_revenue);
                const totalRev = parseNum(f.total_revenue);
                const totalRatio = parseNum(f.profit_loss_ratio);
                const cost = parseNum(f.cost);

                return `
                <div class="fund-item" onclick="Router.navigate('/sub/fund-detail?code=${escapeHtml(f.fund_code)}')">
                    <div class="fund-row">
                        <div class="col-info">
                            <div class="fund-name">${name}</div>
                        </div>
                        <div class="col-amount">
                            <div class="${trendClass(todayRev)}">${maskAmount(formatSignedCurrency(todayRev))}</div>
                        </div>
                        <div class="col-amount">
                            <div class="${trendClass(totalRev)}">${maskAmount(formatSignedCurrency(totalRev))}</div>
                        </div>
                    </div>
                    <div class="fund-row">
                        <div class="col-info">
                            <div class="fund-cost">${maskAmount(cost !== null ? '¥' + formatMoney(cost) : '-')}</div>
                        </div>
                        <div class="col-rate ${rateClass}">${escapeHtml(rate)}</div>
                        <div class="col-amount">
                            <div class="${trendClass(totalRatio)}">${totalRatio !== null ? formatPercent(totalRatio) : '-'}</div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            fundListHtml = `
                <div class="fund-list">
                    <div class="list-header">
                        <div class="header-col" style="flex:2">基金信息</div>
                        <div class="header-col sortable flex-1 text-right" onclick="toggleSort('change_rate')">
                            今日涨幅
                            <span class="sort-arrow ${sortKey==='change_rate'?'active':''}">${sortKey==='change_rate'?(sortDesc?'&#9660;':'&#9650;'):''}</span>
                        </div>
                        <div class="header-col sortable" style="flex:1.2;text-align:right" onclick="toggleSort('total_revenue')">
                            持有收益
                            <span class="sort-arrow ${sortKey==='total_revenue'?'active':''}">${sortKey==='total_revenue'?(sortDesc?'&#9660;':'&#9650;'):''}</span>
                        </div>
                    </div>
                    ${rows}
                </div>`;
        } else {
            fundListHtml = `
                <div class="empty-wrap">
                    <div class="empty-icon">&#128200;</div>
                    <div class="empty-text">暂无持仓数据</div>
                    <button class="btn btn-primary" onclick="openAddFund()">添加基金</button>
                </div>`;
        }

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-header">
                    <div class="greeting">${greeting}</div>
                    <div class="summary-title">今日收益</div>
                </div>
                <div class="summary-content">
                    <div class="revenue ${todayRevenue >= 0 ? 'up' : 'down'}">
                        <span>${maskAmount(formatSignedMoney(todayRevenue))}</span>
                        <button class="eye-btn" onclick="toggleHide()">
                            ${hideAmount ? '&#128064;' : '&#128065;'}
                        </button>
                    </div>
                    <div class="revenue-percent">${maskAmount(formatPercent(revenuePercent))}</div>
                </div>
                <div class="summary-footer">
                    <div><div>总成本</div><div class="val">${maskAmount('¥' + formatMoney(totalCost))}</div></div>
                    <div><div>总收益</div><div class="val ${trendClass(totalRevenue)}">${maskAmount(formatSignedMoney(totalRevenue))}</div></div>
                </div>
            </div>
            ${gainersSection}
            ${fundListHtml}
        `;
    }

    // Global functions for inline handlers
    window.toggleSort = function(key) {
        if (sortKey === key) { sortDesc = !sortDesc; }
        else { sortKey = key; sortDesc = true; }
        if (portfolioData) {
            renderIndex(document.getElementById('page-index'), portfolioData);
        }
    };

    window.toggleHide = function() {
        hideAmount = !hideAmount;
        localStorage.setItem('hideAmount', hideAmount);
        if (portfolioData) {
            renderIndex(document.getElementById('page-index'), portfolioData);
        }
    };

    window.openAddFund = function() {
        Router.navigate('/sub/fund-manage');
    };
})();
