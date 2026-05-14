/* ---- Market Page (行情) ---- */
(function() {
    const { apiGet, Router, showToast, escapeHtml, parseNum, formatFixed, formatPercent } = window.app;

    let flowTab = 'inflow'; // inflow | outflow

    Router.register('market', async function(params) {
        const container = document.getElementById('page-market');
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';

        try {
            const [indices, flowData, ranking] = await Promise.all([
                apiGet('/market/indices', {}, 60000),
                apiGet('/sector/', { type: 'all', sort: 'flow', st: 'FLOW' }, 30000),
                apiGet('/ranking/', { type: 'day', page: 1, page_size: 10 }, 30000)
            ]);
            renderMarket(container, indices, flowData, ranking);
        } catch (e) {
            if (e.message === '认证失败') return;
            container.innerHTML = '<div class="empty-wrap"><div class="empty-icon">&#128202;</div><div class="empty-text">加载失败</div></div>';
        }
    });

    function renderMarket(container, indices, flowData, ranking) {
        // Index cards - API returns { "groups": [{ "name": "...", "items": [...] }] }
        let indexHtml = '';
        const groups = Array.isArray(indices?.groups) ? indices.groups : [];
        const allIndices = groups.flatMap(g => (g.items || []).map(item => ({ ...item, group: g.name })));
        if (allIndices.length > 0) {
            indexHtml = '<div class="index-cards">' + allIndices.map(idx => {
                const isUp = !hasNeg(String(idx.change_rate || '0'));
                const cls = isUp ? 'up' : 'down';
                const price = typeof idx.price === 'number' ? idx.price.toFixed(2) : (idx.price || '-');
                return `
                    <div class="index-card ${cls}">
                        <div class="idx-name">${escapeHtml(idx.name || '-')}</div>
                        <div class="idx-price">${escapeHtml(String(price))}</div>
                        <div class="idx-change">${escapeHtml(String(idx.change_rate || '-'))}</div>
                    </div>`;
            }).join('') + '</div>';
        }

        // Flow section - API returns { "data": [...] }
        const flowList = Array.isArray(flowData?.data) ? flowData.data : (Array.isArray(flowData) ? flowData : []);
        const inflows = flowList.filter(f => parseNum(f.value) > 0).slice(0, 8);
        const outflows = flowList.filter(f => parseNum(f.value) < 0).slice(0, 8);
        const currentFlows = flowTab === 'inflow' ? inflows : outflows;

        let flowHtml = '';
        if (currentFlows.length > 0) {
            flowHtml = currentFlows.map((f, i) => {
                const rank = i + 1;
                const rankCls = rank <= 3 ? 'top' + rank : 'other';
                const flow = parseNum(f.value);
                const flowDisplay = flow !== null ? (Math.abs(flow) / 1e8).toFixed(2) + '亿' : '-';
                const rate = formatPercent(f.change_rate);

                return `
                <div class="flow-item" onclick="Router.navigate('/sub/sector-funds?code=${escapeHtml(f.code)}&name=${escapeHtml(f.name)}')">
                    <div class="flow-rank ${rankCls}">${rank}</div>
                    <div class="flow-info">
                        <div class="flow-name">${escapeHtml(f.name || '-')}</div>
                        <div class="flow-sub">${escapeHtml(rate)}</div>
                    </div>
                    <div class="flow-value ${flowTab === 'inflow' ? 'text-up' : 'text-down'}">${flowDisplay}</div>
                </div>`;
            }).join('');
        } else {
            flowHtml = '<div style="padding:20px;text-align:center;color:#999">暂无数据</div>';
        }

        // Ranking section
        let rankHtml = '';
        const rankList = Array.isArray(ranking?.data) ? ranking.data : (Array.isArray(ranking) ? ranking : []);
        if (rankList.length > 0) {
            rankHtml = rankList.slice(0, 10).map((f, i) => {
                const rank = f.rank || (i + 1);
                const badgeCls = rank <= 3 ? 'top' + rank : 'other';
                const code = f.fundCode || f.fund_code || '-';
                const name = f.fundName || f.fund_name || '-';
                const change = f.change != null ? f.change + '%' : (f.change_rate || '--');
                return `
                <div class="rank-item" onclick="Router.navigate('/sub/fund-detail?code=${escapeHtml(code)}')">
                    <div class="rank-badge ${badgeCls}">${rank}</div>
                    <div class="rank-info">
                        <div class="rank-name">${escapeHtml(name)}</div>
                        <div class="rank-code">${escapeHtml(code)}</div>
                    </div>
                    <div class="rank-rate ${hasNeg(change) ? 'text-down' : 'text-up'}">${escapeHtml(change)}</div>
                    <div class="rank-nav">${formatFixed(f.perNav || f.nav, 4)}</div>
                </div>`;
            }).join('');
        }

        container.innerHTML = `
            ${indexHtml}
            <div class="flow-section">
                <div class="section-header">
                    <h3>板块资金流向</h3>
                    <span class="more-link" onclick="Router.navigate('/sub/sector')">查看全部 &gt;</span>
                </div>
                <div class="pill-tabs">
                    <div class="pill-tab ${flowTab==='inflow'?'active':''}" onclick="setFlowTab('inflow')">资金流入</div>
                    <div class="pill-tab ${flowTab==='outflow'?'active':''}" onclick="setFlowTab('outflow')">资金流出</div>
                </div>
                <div class="flow-list">${flowHtml}</div>
            </div>
            <div class="flow-section">
                <div class="section-header">
                    <h3>日涨幅榜</h3>
                    <span class="more-link" onclick="Router.navigate('/sub/ranking')">查看全部 &gt;</span>
                </div>
                ${rankHtml || '<div style="padding:20px;text-align:center;color:#999">暂无数据</div>'}
            </div>
        `;
    }

    function hasNeg(v) { return String(v ?? '').trim().startsWith('-'); }

    window.setFlowTab = function(tab) {
        flowTab = tab;
        Router.navigate('/market');
    };
})();
