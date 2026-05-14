/* ---- Search Sub-Page ---- */
(function() {
    const { Auth, apiGet, Router, showToast, escapeHtml, debounce } = window.app;

    const HISTORY_KEY = 'searchHistory';
    const MAX_HISTORY = 10;

    function getHistory() { return safeParse(localStorage.getItem(HISTORY_KEY), []); }
    function saveHistory(kw) {
        let hist = getHistory();
        hist = hist.filter(h => h !== kw);
        hist.unshift(kw);
        if (hist.length > MAX_HISTORY) hist = hist.slice(0, MAX_HISTORY);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    }
    function safeParse(v, fb) { try { return JSON.parse(v); } catch { return fb; } }

    Router.register('sub:search', function(container, params) {
        container.innerHTML = `
            <div class="search-bar">
                <div class="search-input-wrap">
                    <span class="search-icon">&#128269;</span>
                    <input type="text" id="searchPageInput" placeholder="搜索基金名称或代码..." autofocus>
                </div>
            </div>
            <div id="searchPageResults"></div>
            <div id="searchHistorySection"></div>
        `;

        renderHistory();

        const input = document.getElementById('searchPageInput');
        input.addEventListener('input', debounce(async (e) => {
            const kw = e.target.value.trim();
            if (kw.length < 2) {
                document.getElementById('searchPageResults').innerHTML = '';
                renderHistory();
                return;
            }
            try {
                const results = await apiGet('/funds/search', { q: kw, limit: 15 });
                renderResults(results, kw);
            } catch {}
        }, 500));

        input.focus();
    });

    function renderResults(funds, keyword) {
        const section = document.getElementById('searchPageResults');
        const histSection = document.getElementById('searchHistorySection');
        if (histSection) histSection.innerHTML = '';

        if (!funds || funds.length === 0) {
            section.innerHTML = '<div class="empty-wrap" style="padding:40px"><div class="empty-text">未找到相关基金</div></div>';
            return;
        }

        section.innerHTML = funds.map(f => `
            <div class="search-result-item" onclick="searchSelectFund('${escapeHtml(f.fund_code)}','${escapeHtml(f.fund_name)}')">
                <div class="sr-name">${escapeHtml(f.fund_name)}</div>
                <div class="sr-code">${escapeHtml(f.fund_code)}</div>
            </div>
        `).join('');
    }

    function renderHistory() {
        const section = document.getElementById('searchHistorySection');
        if (!section) return;
        const hist = getHistory();
        if (hist.length === 0) { section.innerHTML = ''; return; }

        section.innerHTML = `
            <div style="padding:12px 16px 8px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:13px;color:#999">搜索历史</span>
                <button class="btn btn-ghost btn-sm" onclick="clearSearchHistory()">清除</button>
            </div>
            <div style="padding:0 16px 16px;display:flex;flex-wrap:wrap;gap:8px">
                ${hist.map(kw => `<span style="padding:6px 14px;background:#f5f5f5;border-radius:20px;font-size:13px;cursor:pointer" onclick="searchFromHistory('${escapeHtml(kw)}')">${escapeHtml(kw)}</span>`).join('')}
            </div>
        `;
    }

    window.searchSelectFund = function(code, name) {
        saveHistory(name);
        Router.navigate('/sub/fund-detail?code=' + code);
    };

    window.searchFromHistory = function(kw) {
        const input = document.getElementById('searchPageInput');
        if (input) { input.value = kw; input.dispatchEvent(new Event('input')); }
    };

    window.clearSearchHistory = function() {
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
        showToast('已清除', 'info');
    };
})();
