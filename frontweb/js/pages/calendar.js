Router.register('/calendar', (container) => {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let selectedDay = null;
  let calendarData = null;
  let destroyed = false;

  container.innerHTML = `
    <div class="page-container calendar-page">
      <div id="cal-content">
        <div class="loading-wrap"><div class="loading-spinner"></div><span>加载中...</span></div>
      </div>
    </div>`;

  loadCalendar();

  async function loadCalendar() {
    const el = document.getElementById('cal-content');
    try {
      calendarData = await Api.get(`/funds/revenue-calendar?year=${year}&month=${month}`);
      if (destroyed) return;
      renderCalendar(el);
    } catch (e) {
      if (e.message.includes('登录')) {
        el.innerHTML = `
          <div class="login-hint">
            <div class="login-hint-icon">📅</div>
            <h3>查看收益日历</h3>
            <p>登录后即可查看每日收益详情</p>
            <a href="#/login" class="btn btn-primary">去登录</a>
          </div>`;
      } else {
        el.innerHTML = `<div class="empty-state"><p>加载失败: ${Utils.escapeHtml(e.message)}</p></div>`;
      }
    }
  }

  function renderCalendar(el) {
    if (!calendarData) return;

    const days = calendarData.calendar || [];
    const monthProfitDays = calendarData.positive_days || 0;
    const monthLossDays = calendarData.negative_days || 0;
    const monthTotalRevenue = calendarData.total_revenue || 0;

    // Auto-select latest trading day if no selection
    if (selectedDay === null) {
      const today = new Date().getDate();
      const todayData = days.find(d => d.day === today && d.is_trading_day);
      if (todayData) {
        selectedDay = today;
      } else {
        // Find latest trading day
        for (let i = days.length - 1; i >= 0; i--) {
          if (days[i].is_trading_day && days[i].revenue != null) {
            selectedDay = days[i].day;
            break;
          }
        }
      }
    }

    const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

    // Build calendar grid
    const firstDay = new Date(year, month - 1, 1);
    let startWeekday = firstDay.getDay();
    if (startWeekday === 0) startWeekday = 7; // Sunday = 7

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const todayDate = today.getDate();

    // Pad start
    const paddedDays = [];
    for (let i = 1; i < startWeekday; i++) {
      paddedDays.push(null);
    }
    paddedDays.push(...days);

    const dayCells = paddedDays.map(d => {
      if (!d) return '<div class="calendar-day" style="visibility:hidden;"></div>';
      const isToday = isCurrentMonth && d.day === todayDate;
      const isSelected = d.day === selectedDay;
      const isRest = !d.is_trading_day;
      const revenue = d.revenue;
      const hasRevenue = revenue != null && !isRest;
      const revClass = hasRevenue ? (revenue >= 0 ? 'text-up' : 'text-down') : '';

      return `
        <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isRest ? 'rest' : ''}"
             data-day="${d.day}" ${isRest ? '' : 'style="cursor:pointer;"'}>
          <div class="day-num">${d.day}</div>
          ${isRest
            ? '<div class="day-revenue text-muted">休</div>'
            : hasRevenue
              ? `<div class="day-revenue ${revClass}">${Utils.formatMoney(revenue)}</div>`
              : '<div class="day-revenue">-</div>'
          }
        </div>`;
    }).join('');

    // Selected day detail
    let detailHtml = '';
    if (selectedDay) {
      const dayData = days.find(d => d.day === selectedDay);
      if (dayData && dayData.fund_details && dayData.fund_details.length > 0) {
        const dayRevenue = dayData.revenue || 0;
        const detailItems = dayData.fund_details.map(f => `
          <li class="day-detail-item">
            <span>${Utils.escapeHtml(f.fund_name)}</span>
            <span class="${Utils.getChangeClass(f.revenue)}">${Utils.formatMoney(f.revenue)}元</span>
          </li>`).join('');

        detailHtml = `
          <div class="day-detail">
            <div class="day-detail-header">
              <span class="day-detail-title">${month}月${selectedDay}日收益明细</span>
              <span class="${Utils.getChangeClass(dayRevenue)}" style="font-weight:600;">${Utils.formatMoney(dayRevenue)}元</span>
            </div>
            <ul class="day-detail-list">${detailItems}</ul>
          </div>`;
      } else if (dayData && !dayData.is_trading_day) {
        detailHtml = `
          <div class="day-detail">
            <div class="day-detail-header">
              <span class="day-detail-title">${month}月${selectedDay}日</span>
              <span class="text-muted">休市</span>
            </div>
          </div>`;
      }
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="calendar-header">
            <div class="calendar-nav">
              <button class="calendar-nav-btn" id="cal-prev">‹</button>
              <span class="calendar-month">${year}年${month}月</span>
              <button class="calendar-nav-btn" id="cal-next">›</button>
            </div>
            <button class="calendar-back-today" id="cal-today">回到今天</button>
          </div>
          <div class="month-stats">
            <div class="month-stat">
              <div class="month-stat-label">盈利天数</div>
              <div class="month-stat-value text-up">${monthProfitDays}</div>
            </div>
            <div class="month-stat">
              <div class="month-stat-label">亏损天数</div>
              <div class="month-stat-value text-down">${monthLossDays}</div>
            </div>
            <div class="month-stat">
              <div class="month-stat-label">月度总收益</div>
              <div class="month-stat-value ${Utils.getChangeClass(monthTotalRevenue)}">${Utils.formatMoney(monthTotalRevenue)}</div>
            </div>
          </div>
          <div class="calendar-grid">
            ${weekdays.map(w => `<div class="calendar-weekday">${w}</div>`).join('')}
            ${dayCells}
          </div>
        </div>
      </div>
      ${detailHtml}`;

    // Events
    el.querySelectorAll('.calendar-day:not(.rest)').forEach(cell => {
      cell.addEventListener('click', () => {
        const day = parseInt(cell.dataset.day);
        if (!isNaN(day)) {
          selectedDay = day;
          renderCalendar(el);
        }
      });
    });

    document.getElementById('cal-prev')?.addEventListener('click', () => {
      month--;
      if (month < 1) { month = 12; year--; }
      selectedDay = null;
      loadCalendar();
    });

    document.getElementById('cal-next')?.addEventListener('click', () => {
      month++;
      if (month > 12) { month = 1; year++; }
      selectedDay = null;
      loadCalendar();
    });

    document.getElementById('cal-today')?.addEventListener('click', () => {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
      selectedDay = null;
      loadCalendar();
    });
  }

  return {
    destroy: () => { destroyed = true; }
  };
});
