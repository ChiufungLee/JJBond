/* ---- Calendar Sub-Page (收益日历 + Treemap) ---- */
(function() {
    const { Auth, apiGet, Router, showToast, escapeHtml, parseNum, formatFixed,
        formatMoney, formatSignedMoney, trendClass } = window.app;

    let calYear, calMonth;
    let calendarData = null;
    let selectedDay = null;

    Router.register('sub:calendar', async function(container, params) {
        const now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth() + 1;
        container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div>加载中...</div></div>';
        await loadCalendar(container);
    });

    async function loadCalendar(container) {
        try {
            calendarData = await apiGet('/funds/revenue-calendar', { year: calYear, month: calMonth });
            renderCalendar(container);
        } catch (e) {
            container.innerHTML = `<div class="empty-wrap"><div class="empty-text">加载失败: ${escapeHtml(e.message)}</div></div>`;
        }
    }

    function renderCalendar(container) {
        const days = Array.isArray(calendarData?.calendar) ? calendarData.calendar : (Array.isArray(calendarData) ? calendarData : []);
        const totalProfit = parseNum(calendarData?.total_profit) ?? 0;
        const positiveDays = parseNum(calendarData?.positive_days) ?? 0;
        const negativeDays = parseNum(calendarData?.negative_days) ?? 0;

        // Build day map
        const dayMap = {};
        days.forEach(d => { dayMap[d.date] = d; });

        // Build calendar grid
        const firstDay = new Date(calYear, calMonth - 1, 1);
        const lastDay = new Date(calYear, calMonth, 0);
        const startWeekday = firstDay.getDay(); // 0=Sun
        const totalDays = lastDay.getDate();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

        let gridHtml = '';
        // Empty cells for offset
        for (let i = 0; i < startWeekday; i++) {
            gridHtml += '<div class="calendar-day empty"></div>';
        }
        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const dayData = dayMap[dateStr];
            const revenue = dayData ? parseNum(dayData.total_revenue ?? dayData.revenue) : null;
            const isSelected = selectedDay === dateStr;
            const isToday = dateStr === todayStr;

            let cls = 'calendar-day';
            if (revenue !== null) cls += revenue >= 0 ? ' profit' : ' loss';
            if (isToday) cls += ' today';
            if (isSelected) cls += ' selected';

            const amountText = revenue !== null ? (revenue >= 0 ? '+' : '') + revenue.toFixed(0) : '';

            gridHtml += `
                <div class="${cls}" onclick="selectCalDay('${dateStr}')">
                    <span class="day-num">${d}</span>
                    <span class="day-amount">${amountText}</span>
                </div>`;
        }

        // Selected day detail
        let detailHtml = '';
        if (selectedDay && dayMap[selectedDay]) {
            const dayData = dayMap[selectedDay];
            const fundDetails = Array.isArray(dayData.fund_details) ? dayData.fund_details : [];
            const totalRev = parseNum(dayData.total_revenue ?? dayData.revenue) ?? 0;

            // Treemap
            let treemapHtml = '';
            if (fundDetails.length > 0) {
                treemapHtml = buildTreemap(fundDetails);
            }

            // Fund detail table
            let tableHtml = '';
            if (fundDetails.length > 0) {
                tableHtml = fundDetails.map(f => {
                    const rev = parseNum(f.revenue ?? f.today_revenue) ?? 0;
                    const rate = f.change_rate || f.rate || '--';
                    return `
                    <div class="day-detail-row">
                        <div class="dd-name">${escapeHtml(f.fund_name || f.name || '-')}</div>
                        <div class="dd-rate ${hasNeg(rate) ? 'text-down' : 'text-up'}">${escapeHtml(rate)}</div>
                        <div class="dd-amount ${trendClass(rev)}">${formatSignedMoney(rev)}</div>
                    </div>`;
                }).join('');
            }

            detailHtml = `
                <div class="day-detail">
                    <div class="day-detail-header">${selectedDay} 收益明细 (${fundDetails.length}只)</div>
                    ${treemapHtml}
                    ${tableHtml}
                </div>`;
        }

        container.innerHTML = `
            <div class="calendar-header">
                <div class="calendar-nav">
                    <button class="nav-arrow" onclick="calNav(-1)">&lt;</button>
                    <span class="month-title">${calYear}年${calMonth}月</span>
                    <button class="nav-arrow" onclick="calNav(1)">&gt;</button>
                </div>
                <div class="calendar-stats">
                    <div><div>正收益天数</div><div class="stat-val">${positiveDays}</div></div>
                    <div><div>负收益天数</div><div class="stat-val">${negativeDays}</div></div>
                    <div><div>月累计收益</div><div class="stat-val ${trendClass(totalProfit)}">${formatSignedMoney(totalProfit)}</div></div>
                </div>
            </div>
            <div class="calendar-weekdays">
                <div class="calendar-weekday">日</div>
                <div class="calendar-weekday">一</div>
                <div class="calendar-weekday">二</div>
                <div class="calendar-weekday">三</div>
                <div class="calendar-weekday">四</div>
                <div class="calendar-weekday">五</div>
                <div class="calendar-weekday">六</div>
            </div>
            <div class="calendar-grid">${gridHtml}</div>
            ${detailHtml}
        `;
    }

    function buildTreemap(fundDetails) {
        const GAP = 4;
        const items = fundDetails.map(f => ({
            name: f.fund_name || f.name || '-',
            revenue: parseNum(f.revenue ?? f.today_revenue) ?? 0
        })).filter(i => i.revenue !== 0);

        if (items.length === 0) return '';

        const totalAbs = items.reduce((s, i) => s + Math.abs(i.revenue), 0);
        if (totalAbs === 0) return '';

        const blocks = treemapSplit(items, totalAbs, 0, 0, 100, 100);

        const blockHtml = blocks.map(b => {
            const cls = b.item.revenue >= 0 ? 'profit' : 'loss';
            return `<div class="treemap-block ${cls}" style="left:calc(${b.x}% + ${GAP/2}px);top:calc(${b.y}% + ${GAP/2}px);width:calc(${b.w}% - ${GAP}px);height:calc(${b.h}% - ${GAP}px)">
                <span class="tb-name">${escapeHtml(b.item.name)}</span>
                <span class="tb-amount">${b.item.revenue >= 0 ? '+' : ''}${b.item.revenue.toFixed(0)}</span>
            </div>`;
        }).join('');

        return `<div class="treemap-container">${blockHtml}</div>`;
    }

    function treemapSplit(items, totalAbs, x, y, w, h) {
        if (items.length === 0) return [];
        if (items.length === 1) {
            return [{ item: items[0], x, y, w, h }];
        }

        // Find best split
        const totalRev = items.reduce((s, i) => s + Math.abs(i.revenue), 0);
        let cumSum = 0;
        let bestIdx = 0;
        let bestDiff = Infinity;

        for (let i = 0; i < items.length - 1; i++) {
            cumSum += Math.abs(items[i].revenue);
            const diff = Math.abs(cumSum / totalRev - 0.5);
            if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        }

        const leftItems = items.slice(0, bestIdx + 1);
        const rightItems = items.slice(bestIdx + 1);
        const leftSum = leftItems.reduce((s, i) => s + Math.abs(i.revenue), 0);
        const ratio = leftSum / totalRev;

        const result = [];
        if (w >= h) {
            const splitW = w * ratio;
            result.push(...treemapSplit(leftItems, totalAbs, x, y, splitW, h));
            result.push(...treemapSplit(rightItems, totalAbs, x + splitW, y, w - splitW, h));
        } else {
            const splitH = h * ratio;
            result.push(...treemapSplit(leftItems, totalAbs, x, y, w, splitH));
            result.push(...treemapSplit(rightItems, totalAbs, x, y + splitH, w, h - splitH));
        }
        return result;
    }

    function hasNeg(v) { return String(v ?? '').trim().startsWith('-'); }

    window.calNav = async function(delta) {
        calMonth += delta;
        if (calMonth > 12) { calMonth = 1; calYear++; }
        if (calMonth < 1) { calMonth = 12; calYear--; }
        selectedDay = null;
        await loadCalendar(document.getElementById('subPageContent'));
    };

    window.selectCalDay = function(dateStr) {
        selectedDay = dateStr;
        renderCalendar(document.getElementById('subPageContent'));
    };
})();
