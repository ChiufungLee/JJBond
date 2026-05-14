/* ---- Fund Manage Sub-Page (CRUD) ---- */
(function() {
    const { Auth, apiGet, apiPost, apiPut, apiDel, Router, showToast, showConfirm,
        showModal, closeModal, escapeHtml, parseNum, formatFixed, formatMoney,
        hasNeg, debounce } = window.app;

    let manageList = [];
    let sortDesc = true;
    let hideAmount = localStorage.getItem('hideAmount') === 'true';

    Router.register('sub:fund-manage', async function(container, params) {
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';
        try {
            const [holdings, summary] = await Promise.all([
                apiGet('/funds/'),
                apiGet('/funds/calculate-simple').catch(() => null)
            ]);
            manageList = Array.isArray(holdings) ? holdings : [];
            renderManage(container, summary);
        } catch (e) {
            container.innerHTML = `<div class="empty-wrap"><div class="empty-text">加载失败</div></div>`;
        }
    });

    function renderManage(container, summary) {
        const fundDetails = Array.isArray(summary?.fund_details) ? summary.fund_details : [];
        const detailMap = {};
        fundDetails.forEach(f => { detailMap[f.fund_code] = f; });

        // Merge
        const merged = manageList.map(f => {
            const detail = detailMap[f.fund_code] || {};
            return { ...f, ...detail, _id: f.id };
        });

        // Sort by total revenue
        const sorted = [...merged].sort((a, b) => {
            const av = parseNum(a.total_revenue ?? a.profit_loss_ratio) ?? 0;
            const bv = parseNum(b.total_revenue ?? b.profit_loss_ratio) ?? 0;
            return sortDesc ? bv - av : av - bv;
        });

        let listHtml = '';
        if (sorted.length > 0) {
            listHtml = sorted.map(f => {
                const name = escapeHtml(f.fund_name || f.fund_code || '-');
                const code = escapeHtml(f.fund_code || '-');
                const cost = parseNum(f.cost_price) ?? 0;
                const shares = parseNum(f.shares) ?? 0;
                const totalCost = cost * shares;
                const totalRev = parseNum(f.total_revenue);
                const ratio = parseNum(f.profit_loss_ratio);
                const rate = f.change_rate || '--';
                const rateClass = hasNeg(rate) ? 'text-down' : 'text-up';
                const mask = hideAmount ? '***' : '';

                return `
                <div class="fund-row" style="flex-wrap:wrap">
                    <div class="col-info" style="flex:2" onclick="Router.navigate('/sub/fund-detail?code=${code}')">
                        <div class="fund-name">${name}</div>
                        <div class="fund-code">${code}</div>
                    </div>
                    <div class="col-rate ${rateClass}" style="flex:0.8">${escapeHtml(rate)}</div>
                    <div class="col-amount" style="flex:1">
                        <div class="label">总收益</div>
                        <div class="${totalRev !== null ? (totalRev >= 0 ? 'text-up' : 'text-down') : ''}">${totalRev !== null ? mask || ('¥' + formatMoney(totalRev)) : '-'}</div>
                    </div>
                    <div class="col-amount" style="flex:0.8">
                        <div class="label">收益率</div>
                        <div class="${ratio !== null ? (ratio >= 0 ? 'text-up' : 'text-down') : ''}">${ratio !== null ? (mask || formatFixed(ratio, 2) + '%') : '-'}</div>
                    </div>
                    <div style="display:flex;gap:6px;margin-left:8px">
                        <button class="btn btn-sm btn-outline" onclick="showEditModal(${f._id},'${code}',${cost},'${name}')">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteFund(${f._id},'${name}')">删除</button>
                    </div>
                </div>`;
            }).join('');
        } else {
            listHtml = '<div class="empty-wrap"><div class="empty-icon">&#128200;</div><div class="empty-text">暂无持仓</div></div>';
        }

        container.innerHTML = `
            <div class="flex-between px-16 py-12">
                <span style="font-size:15px;font-weight:600">持仓列表 (${sorted.length})</span>
                <div class="flex gap-8">
                    <button class="sort-btn" onclick="fmSort()">收益率 ${sortDesc ? '&#9660;' : '&#9650;'}</button>
                    <button class="btn btn-primary btn-sm" onclick="showAddModal()">添加</button>
                </div>
            </div>
            ${listHtml}
        `;
    }

    window.showAddModal = function() {
        showModal(`
            <div class="modal-head">
                <h3>添加基金</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>选择基金 *</label>
                    <input type="text" class="form-input" id="fmSearchInput" placeholder="输入基金名称或代码搜索..." autocomplete="off">
                    <div id="fmSearchResults" class="search-results-dropdown hidden"></div>
                    <input type="hidden" id="fmFundCode">
                    <input type="hidden" id="fmFundName">
                </div>
                <div class="form-group">
                    <label>持仓成本 *</label>
                    <input type="number" class="form-input" id="fmCostPrice" step="0.0001" min="0.0001" placeholder="如：1.2345">
                </div>
                <div class="form-group">
                    <label>持有份额 *</label>
                    <input type="number" class="form-input" id="fmShares" step="0.01" min="0.01" placeholder="如：1000.00">
                </div>
            </div>
            <div class="modal-foot">
                <button class="btn btn-outline" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="submitAddFund()">添加</button>
            </div>
        `);

        const searchInput = document.getElementById('fmSearchInput');
        const results = document.getElementById('fmSearchResults');
        searchInput.addEventListener('input', debounce(async (e) => {
            const kw = e.target.value.trim();
            if (kw.length < 2) { results.classList.add('hidden'); return; }
            try {
                const data = await apiGet('/funds/search', { q: kw, limit: 8 });
                results.innerHTML = (data || []).map(f => `
                    <div class="search-result-item" onclick="fmSelectFund('${escapeHtml(f.fund_code)}','${escapeHtml(f.fund_name)}')">
                        <div class="sr-name">${escapeHtml(f.fund_name)}</div>
                        <div class="sr-code">${escapeHtml(f.fund_code)}</div>
                    </div>
                `).join('');
                results.classList.remove('hidden');
            } catch {}
        }, 500));
    };

    window.fmSelectFund = function(code, name) {
        document.getElementById('fmFundCode').value = code;
        document.getElementById('fmFundName').value = name;
        document.getElementById('fmSearchInput').value = name;
        document.getElementById('fmSearchResults').classList.add('hidden');
    };

    window.submitAddFund = async function() {
        const code = document.getElementById('fmFundCode').value;
        const name = document.getElementById('fmFundName').value;
        const cost = parseFloat(document.getElementById('fmCostPrice').value);
        const shares = parseFloat(document.getElementById('fmShares').value);

        if (!code) { showToast('请先选择基金', 'error'); return; }
        if (!cost || cost <= 0) { showToast('请输入有效的持仓成本', 'error'); return; }
        if (!shares || shares <= 0) { showToast('请输入有效的持有份额', 'error'); return; }

        try {
            await apiPost('/funds/', { fund_code: code, fund_name: name, cost_price: cost, shares });
            showToast('添加成功', 'success');
            closeModal();
            Router.navigate('/sub/fund-manage');
        } catch (e) { showToast(e.message, 'error'); }
    };

    window.showEditModal = function(id, code, cost, name) {
        // Find current shares from manageList
        const fund = manageList.find(f => f.id === id);
        const shares = fund ? (parseNum(fund.shares) ?? 0) : 0;

        showModal(`
            <div class="modal-head">
                <h3>编辑基金</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>基金信息</label>
                    <div style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#f9f9f9">${escapeHtml(name)} (${escapeHtml(code)})</div>
                </div>
                <div class="form-group">
                    <label>持仓成本 *</label>
                    <input type="number" class="form-input" id="fmEditCost" value="${cost}" step="0.0001" min="0.0001">
                </div>
                <div class="form-group">
                    <label>持有份额 *</label>
                    <input type="number" class="form-input" id="fmEditShares" value="${shares}" step="0.01" min="0.01">
                </div>
            </div>
            <div class="modal-foot">
                <button class="btn btn-outline" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="submitEditFund(${id})">保存</button>
            </div>
        `);
    };

    window.submitEditFund = async function(id) {
        const cost = parseFloat(document.getElementById('fmEditCost').value);
        const shares = parseFloat(document.getElementById('fmEditShares').value);

        if (!cost || cost <= 0) { showToast('请输入有效的持仓成本', 'error'); return; }
        if (!shares || shares <= 0) { showToast('请输入有效的持有份额', 'error'); return; }

        try {
            const fund = manageList.find(f => f.id === id);
            await apiPut('/funds/' + id, { fund_code: fund?.fund_code, cost_price: cost, shares });
            showToast('保存成功', 'success');
            closeModal();
            Router.navigate('/sub/fund-manage');
        } catch (e) { showToast(e.message, 'error'); }
    };

    window.deleteFund = function(id, name) {
        showConfirm(`确定删除 ${name} 吗？`, async () => {
            try {
                await apiDel('/funds/' + id);
                showToast('已删除', 'success');
                Router.navigate('/sub/fund-manage');
            } catch (e) { showToast(e.message, 'error'); }
        });
    };

    window.fmSort = function() {
        sortDesc = !sortDesc;
        Router.navigate('/sub/fund-manage');
    };
})();
