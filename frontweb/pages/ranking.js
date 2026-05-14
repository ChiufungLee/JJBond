/* ---- Ranking Sub-Page ---- */
(function() {
    const { Auth, apiGet, apiPost, Router, showToast, escapeHtml, parseNum, formatFixed,
        hasNeg } = window.app;

    const TYPES = [
        { key: 'day', label: '日涨幅' },
        { key: 'week', label: '周涨幅' },
        { key: 'month', label: '月涨幅' },
        { key: 'year', label: '近1年' },
        { key: 'ytd', label: '今年来' }
    ];

    let currentType = 'day';
    let desc = true;
    let page = 1;
    let rankList = [];
    let loading = false;
    let hasMore = true;
    let watchlistCodes = new Set();
    let holdingCodes = new Set();

    Router.register('sub:ranking', async function(container, params) {
        currentType = 'day';
        desc = true;
        page = 1;
        rankList = [];
        hasMore = true;

        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';

        // Load user's watchlist and holdings for tags
        try {
            const [wl, holdings] = await Promise.all([
                apiGet('/watchlist/').catch(() => []),
                apiGet('/funds/').catch(() => [])
            ]);
            watchlistCodes = new Set((Array.isArray(wl) ? wl : []).map(w => w.fund_code));
            holdingCodes = new Set((Array.isArray(holdings) ? holdings : []).map(h => h.fund_code));
        } catch {}

        await loadRanking(container, true);
    });

    async function loadRanking(container, reset = false) {
        if (loading) return;
        loading = true;
        if (reset) { page = 1; rankList = []; hasMore = true; }

        try {
            const data = await apiGet('/ranking/', { type: currentType, page, page_size: 20, desc });
            const newItems = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
            rankList = rankList.concat(newItems);
            hasMore = newItems.length >= 20;
            page++;
            renderRanking(container);
        } catch (e) {
            if (page === 1) {
                container.innerHTML = `<div class="empty-wrap"><div class="empty-text">加载失败</div></div>`;
            }
        }
        loading = false;
    }

    function renderRanking(container) {
        const tabsHtml = TYPES.map(t =>
            `<div class="ranking-tab ${t.key === currentType ? 'active' : ''}" onclick="rankChangeType('${t.key}')">${t.label}</div>`
        ).join('');

        const sortBtn = `<button class="sort-btn" onclick="rankToggleSort()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%)">${desc ? '降序' : '升序'} ${desc ? '&#9660;' : '&#9650;'}</button>`;

        let listHtml = '';
        if (rankList.length > 0) {
            listHtml = rankList.map((f, i) => {
                const rank = f.rank || (i + 1);
                const badgeCls = rank <= 3 ? 'top' + rank : 'other';
                const code = f.fundCode || f.fund_code || '';
                const name = f.fundName || f.fund_name || '-';
                const isHeld = holdingCodes.has(code);
                const isWatched = watchlistCodes.has(code);
                const change = f.change != null ? f.change + '%' : (f.change_rate || '--');
                const ftype = f.ftype || f.fund_type || '';

                let tags = '';
                if (ftype) tags += `<span class="rank-tag type">${escapeHtml(ftype)}</span>`;
                if (isHeld) tags += '<span class="rank-tag held">已持</span>';
                if (isWatched) tags += '<span class="rank-tag watched">自选</span>';

                return `
                <div class="rank-item" onclick="Router.navigate('/sub/fund-detail?code=${escapeHtml(code)}')">
                    <div class="rank-badge ${badgeCls}">${rank}</div>
                    <div class="rank-info">
                        <div class="rank-name">${escapeHtml(name)}</div>
                        <div class="rank-code">${escapeHtml(code)}</div>
                        ${tags ? '<div class="rank-tags">' + tags + '</div>' : ''}
                    </div>
                    <div class="rank-rate ${hasNeg(change) ? 'text-down' : 'text-up'}">${escapeHtml(change)}</div>
                    <div class="rank-nav">${formatFixed(f.perNav || f.nav, 4)}</div>
                    ${!isWatched ? `<button class="rank-add-btn" onclick="event.stopPropagation();rankAddWatch('${escapeHtml(code)}','${escapeHtml(name)}')">+</button>` : ''}
                </div>`;
            }).join('');
        } else if (!loading) {
            listHtml = '<div class="empty-wrap"><div class="empty-text">暂无数据</div></div>';
        }

        container.innerHTML = `
            <div style="position:relative">
                <div class="ranking-tabs">${tabsHtml}</div>
                ${sortBtn}
            </div>
            ${listHtml}
            ${hasMore ? '<div style="padding:16px;text-align:center"><button class="btn btn-outline" onclick="rankLoadMore()">加载更多</button></div>' : ''}
        `;
    }

    window.rankChangeType = async function(type) {
        currentType = type;
        await loadRanking(document.getElementById('subPageContent'), true);
    };

    window.rankToggleSort = async function() {
        desc = !desc;
        await loadRanking(document.getElementById('subPageContent'), true);
    };

    window.rankLoadMore = async function() {
        await loadRanking(document.getElementById('subPageContent'));
    };

    window.rankAddWatch = async function(code, name) {
        try {
            await apiPost('/watchlist/', { fund_code: code, fund_name: name });
            watchlistCodes.add(code);
            showToast('已添加到自选', 'success');
            renderRanking(document.getElementById('subPageContent'));
        } catch (e) { showToast(e.message, 'error'); }
    };
})();
