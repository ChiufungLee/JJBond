/* ---- Watchlist Page (自选) ---- */
(function() {
    const { Auth, apiGet, apiPost, apiDel, Router, showToast, showConfirm, escapeHtml,
        parseNum, formatFixed, hasNeg, trendClass, debounce } = window.app;

    let watchlistData = [];
    let sortKey = 'change_rate';
    let sortDesc = true;
    let searchKeyword = '';
    let searchResults = [];
    let hotFunds = [];

    Router.register('watchlist', async function(params) {
        const container = document.getElementById('page-watchlist');
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';

        try {
            watchlistData = await apiGet('/watchlist/');
            renderWatchlist(container);
        } catch (e) {
            if (e.message === '认证失败') return;
            container.innerHTML = '<div class="empty-wrap"><div class="empty-icon">&#128310;</div><div class="empty-text">加载失败</div></div>';
        }
    });

    function renderWatchlist(container) {
        const sorted = [...watchlistData].sort((a, b) => {
            let av, bv;
            if (sortKey === 'change_rate') {
                av = parseNum(a.change_rate) ?? 0;
                bv = parseNum(b.change_rate) ?? 0;
            } else {
                av = parseNum(a.total_change_rate) ?? 0;
                bv = parseNum(b.total_change_rate) ?? 0;
            }
            return sortDesc ? bv - av : av - bv;
        });

        let listHtml = '';
        if (sorted.length > 0) {
            listHtml = sorted.map(item => {
                const name = escapeHtml(item.fund_name || '-');
                const code = escapeHtml(item.fund_code || '-');
                const changeRate = item.change_rate || '--';
                const rateClass = hasNeg(changeRate) ? 'text-down' : 'text-up';
                const totalRate = parseNum(item.total_change_rate);
                const totalClass = (totalRate ?? 0) >= 0 ? 'text-up' : 'text-down';
                const totalDisplay = totalRate === null ? '--' : formatFixed(totalRate, 2) + '%';
                const currentNav = formatFixed(item.current_nav, 4);
                const costNav = formatFixed(item.cost_nav, 4);
                const addedAt = item.added_at ? formatDate(item.added_at) : '-';

                return `
                <div class="fund-row" onclick="Router.navigate('/sub/fund-detail?code=${escapeHtml(item.fund_code)}')">
                    <div class="col-info">
                        <div class="fund-name">${name}</div>
                        <div class="fund-code">${code}</div>
                    </div>
                    <div class="col-rate ${rateClass}" style="flex:0.8">${escapeHtml(changeRate)}</div>
                    <div class="col-amount" style="flex:1">
                        <div class="label">自选涨幅</div>
                        <div class="${totalClass}">${totalDisplay}</div>
                    </div>
                    <button class="btn btn-sm btn-danger" style="margin-left:8px" onclick="event.stopPropagation();removeWatchlist(${item.id},'${name}')">移除</button>
                </div>`;
            }).join('');
        } else {
            listHtml = `
                <div class="empty-wrap">
                    <div class="empty-icon">&#11088;</div>
                    <div class="empty-text">暂无自选基金</div>
                </div>`;
        }

        container.innerHTML = `
            <div class="search-bar" style="position:relative">
                <div class="search-input-wrap">
                    <span class="search-icon">&#128269;</span>
                    <input type="text" id="watchlistSearch" placeholder="搜索基金名称或代码..." value="${escapeHtml(searchKeyword)}">
                </div>
                <div class="search-results-dropdown hidden" id="watchlistSearchResults"></div>
            </div>
            <div class="flex-between px-16 py-12">
                <div style="font-size:15px;font-weight:600">我的自选 (${watchlistData.length})</div>
                <div class="flex gap-8">
                    <button class="sort-btn" onclick="wlSort('change_rate')">
                        今日 ${sortKey==='change_rate'?(sortDesc?'&#9660;':'&#9650;'):''}
                    </button>
                    <button class="sort-btn" onclick="wlSort('total_change_rate')">
                        自选 ${sortKey==='total_change_rate'?(sortDesc?'&#9660;':'&#9650;'):''}
                    </button>
                </div>
            </div>
            ${listHtml}
        `;

        // Bind search
        const searchInput = document.getElementById('watchlistSearch');
        const dropdown = document.getElementById('watchlistSearchResults');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(async (e) => {
                const kw = e.target.value.trim();
                searchKeyword = kw;
                if (kw.length < 2) { dropdown.classList.add('hidden'); return; }
                try {
                    searchResults = await apiGet('/funds/search', { q: kw, limit: 8 });
                    renderSearchResults(dropdown, searchResults);
                } catch {}
            }, 500));
        }
    }

    function renderSearchResults(dropdown, results) {
        if (!results || results.length === 0) {
            dropdown.innerHTML = '<div style="padding:12px;text-align:center;color:#999">未找到相关基金</div>';
        } else {
            dropdown.innerHTML = results.map(f => `
                <div class="search-result-item" onclick="wlAddFund('${escapeHtml(f.fund_code)}','${escapeHtml(f.fund_name)}')">
                    <div class="sr-name">${escapeHtml(f.fund_name)}</div>
                    <div class="sr-code">${escapeHtml(f.fund_code)}</div>
                </div>
            `).join('');
        }
        dropdown.classList.remove('hidden');
    }

    window.wlAddFund = async function(code, name) {
        document.getElementById('watchlistSearchResults').classList.add('hidden');
        document.getElementById('watchlistSearch').value = '';
        try {
            await apiPost('/watchlist/', { fund_code: code, fund_name: name });
            showToast('已添加到自选', 'success');
            watchlistData = await apiGet('/watchlist/');
            renderWatchlist(document.getElementById('page-watchlist'));
        } catch (e) { showToast(e.message, 'error'); }
    };

    window.removeWatchlist = function(id, name) {
        showConfirm(`确定将 ${name} 从自选中移除？`, async () => {
            try {
                await apiDel('/watchlist/' + id);
                showToast('已移除', 'success');
                watchlistData = await apiGet('/watchlist/');
                renderWatchlist(document.getElementById('page-watchlist'));
            } catch (e) { showToast(e.message, 'error'); }
        });
    };

    window.wlSort = function(key) {
        if (sortKey === key) sortDesc = !sortDesc;
        else { sortKey = key; sortDesc = true; }
        renderWatchlist(document.getElementById('page-watchlist'));
    };
})();
