/* ---- Sector Sub-Page ---- */
(function() {
    const { apiGet, Router, showToast, escapeHtml, parseNum, formatPercent, hasNeg } = window.app;

    let sectorType = 'industry'; // industry | concept
    let timeRange = 'realtime';  // realtime | week | month
    let sortFlow = true;
    let lastMerged = [];

    // st 参数映射：涨跌幅用 D/W/M，资金流用 FLOW/FLOW_W/FLOW_M
    function getChangeSt(range) {
        if (range === 'week') return 'W';
        if (range === 'month') return 'M';
        return 'D';
    }
    function getFlowSt(range) {
        if (range === 'week') return 'FLOW_W';
        if (range === 'month') return 'FLOW_M';
        return 'FLOW';
    }

    Router.register('sub:sector', async function(container, params) {
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';
        await loadSectors(container);
    });

    async function loadSectors(container) {
        try {
            const changeSt = getChangeSt(timeRange);
            const flowSt = getFlowSt(timeRange);
            const [changeResp, flowResp] = await Promise.all([
                apiGet('/sector/', { type: sectorType, sort: 'change', st: changeSt }, 30000),
                apiGet('/sector/', { type: sectorType, sort: 'flow', st: flowSt }, 30000)
            ]);

            const changeList = Array.isArray(changeResp?.data) ? changeResp.data : (Array.isArray(changeResp) ? changeResp : []);
            const flowList = Array.isArray(flowResp?.data) ? flowResp.data : (Array.isArray(flowResp) ? flowResp : []);
            const flowMap = {};
            flowList.forEach(f => { flowMap[f.code] = f; });

            const merged = changeList.map(c => ({
                ...c,
                net_flow: flowMap[c.code]?.value ?? flowMap[c.code]?.net_flow
            }));

            lastMerged = merged;
            renderSectors(container, merged);
        } catch (e) {
            container.innerHTML = `<div class="empty-wrap"><div class="empty-text">加载失败: ${escapeHtml(e.message)}</div></div>`;
        }
    }

    function renderSectors(container, sectors) {
        const sorted = [...sectors].sort((a, b) => {
            if (sortFlow) {
                const fa = Math.abs(parseNum(a.net_flow) ?? 0);
                const fb = Math.abs(parseNum(b.net_flow) ?? 0);
                return fb - fa;
            }
            const ra = parseNum(a.change_rate) ?? 0;
            const rb = parseNum(b.change_rate) ?? 0;
            return rb - ra;
        });

        const gridHtml = sorted.map(s => {
            const rate = parseNum(s.change_rate) ?? 0;
            const isUp = rate >= 0;
            const flow = parseNum(s.net_flow);
            const flowDisplay = flow !== null ? (Math.abs(flow) / 1e8).toFixed(2) + '亿' : '';

            return `
            <div class="sector-card ${isUp ? 'up' : 'down'}" onclick="Router.navigate('/sub/sector-funds?code=${escapeHtml(s.code)}&name=${escapeHtml(s.name)}')">
                <div class="sc-name">${escapeHtml(s.name || '-')}</div>
                <div class="sc-rate">${formatPercent(rate)}</div>
                <div class="sc-flow">${flowDisplay}</div>
            </div>`;
        }).join('');

        container.innerHTML = `
            <div class="filter-bar">
                <button class="filter-tab ${sectorType==='industry'?'active':''}" onclick="sectorSetType('industry')">行业板块</button>
                <button class="filter-tab ${sectorType==='concept'?'active':''}" onclick="sectorSetType('concept')">概念板块</button>
            </div>
            <div class="filter-bar">
                <button class="filter-tab ${timeRange==='realtime'?'active':''}" onclick="sectorSetTime('realtime')">实时</button>
                <button class="filter-tab ${timeRange==='week'?'active':''}" onclick="sectorSetTime('week')">近一周</button>
                <button class="filter-tab ${timeRange==='month'?'active':''}" onclick="sectorSetTime('month')">近一月</button>
                <button class="sort-btn" onclick="sectorToggleSort()">
                    ${sortFlow ? '按资金流' : '按涨跌幅'} ${sortFlow ? '&#9660;' : '&#9650;'}
                </button>
            </div>
            <div class="sector-grid">${gridHtml || '<div style="padding:40px;text-align:center;color:#999;width:100%">暂无数据</div>'}</div>
        `;
    }

    window.sectorSetType = async function(type) {
        sectorType = type;
        await loadSectors(document.getElementById('subPageContent'));
    };

    window.sectorSetTime = async function(range) {
        timeRange = range;
        await loadSectors(document.getElementById('subPageContent'));
    };

    window.sectorToggleSort = function() {
        sortFlow = !sortFlow;
        renderSectors(document.getElementById('subPageContent'), lastMerged);
    };
})();
