// pages/calendar/calendar.js
const { get } = require('../../utils/request')
const { formatMoney } = require('../../utils/util')

Page({
  data: {
    year: 0,
    month: 0,
    calendarData: null,
    loading: true,
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],        // 处理后的日历数据（含空白填充）
    selectedDate: null,      // 当前选中的日期字符串，如 "2026-03-15"
    selectedDayInfo: null,   // 选中日期的完整数据（含 fund_details）
    selectedFundDetails: [], // 格式化后的基金明细，直接绑定模板
    revenueChart: [],        // 收益树图色块数据
  },

  onLoad() {
    const now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: this._dateStr(now),
    })
    this.loadCalendarData()
  },

  onShow() {
    if (this.data.year && this.data.month) {
      this.loadCalendarData()
    }
  },

  // ── 数据加载 ──────────────────────────────────────────

  async loadCalendarData() {
    const { year, month } = this.data
    this.setData({ loading: true })

    try {
      const calendarData = await get(`/funds/revenue-calendar?year=${year}&month=${month}`)
      const calendarDays = this.processCalendarData(calendarData.calendar)

      // 选中日期若不在当月则重置为当月第一个有数据的交易日
      let { selectedDate } = this.data
      const inThisMonth = calendarData.calendar.some(d => d.date === selectedDate)
      if (!inThisMonth && calendarData.calendar.length > 0) {
        selectedDate = calendarData.calendar.find(d => d.is_trading_day && d.revenue !== null)?.date
          || calendarData.calendar.find(d => d.is_trading_day)?.date
          || calendarData.calendar[0].date
      }

      const selectedDayInfo = this._findDayInfo(calendarData.calendar, selectedDate)
      const selectedFundDetails = this._formatFundDetails(selectedDayInfo)

      this.setData({
        calendarData,
        calendarDays,
        selectedDate,
        selectedDayInfo,
        selectedFundDetails,
        loading: false,
      })
    } catch (error) {
      console.error('加载收益日历失败:', error)
      this.setData({ loading: false })
    }
  },

  // ── 日期点击 ──────────────────────────────────────────

  onDayTap(e) {
    const { date } = e.currentTarget.dataset
    if (!date) return  // 空白格忽略

    const dayInfo = this._findDayInfo(this.data.calendarData.calendar, date)
    const selectedFundDetails = this._formatFundDetails(dayInfo)

    this.setData({
      selectedDate: date,
      selectedDayInfo: dayInfo,
      selectedFundDetails,
    })
  },

  // ── 月份切换 ──────────────────────────────────────────

  prevMonth() {
    let { year, month } = this.data
    month === 1 ? (year -= 1, month = 12) : month -= 1
    this.setData({ year, month })
    this.loadCalendarData()
  },

  nextMonth() {
    let { year, month } = this.data
    month === 12 ? (year += 1, month = 1) : month += 1
    this.setData({ year, month })
    this.loadCalendarData()
  },

  goToToday() {
    const now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: this._dateStr(now),
    })
    this.loadCalendarData()
  },

  // ── 跳转 ─────────────────────────────────────────────

  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/fund-detail/fund-detail?code=${code}` })
  },

  onPullDownRefresh() {
    this.loadCalendarData().then(() => wx.stopPullDownRefresh())
  },

  // ── 私有辅助 ──────────────────────────────────────────

  _dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  _findDayInfo(calendar, dateStr) {
    if (!calendar || !dateStr) return null
    return calendar.find(d => d.date === dateStr) || null
  },

  // 格式化基金明细，补充显示用字段 + 生成图表色块数据
  _formatFundDetails(dayInfo) {
    if (!dayInfo || !dayInfo.fund_details || dayInfo.fund_details.length === 0) return []

    const details = dayInfo.fund_details.map(item => ({
      ...item,
      revenue_formatted: formatMoney(item.revenue),
      nav_change: item.today_nav && item.prev_nav
        ? `${item.prev_nav} → ${item.today_nav}`
        : '--',
      change_rate: item.prev_nav
        ? (((item.today_nav - item.prev_nav) / item.prev_nav) * 100).toFixed(2) + '%'
        : '--',
    }))

    // 生成 Treemap 色块并挂到 data 上
    this.setData({ revenueChart: this._buildChartBlocks(dayInfo.fund_details) })

    return details
  },

  /**
   * 构建 Squarified Treemap 色块数据
   *
   * 算法：递归二分切割（Binary Split Treemap）
   *   - 每一步取剩余面积中权重最大的基金，决定当前行/列的切割方向
   *   - 切割方向：当前区域宽>高时横切（按高度分），否则竖切（按宽度分）
   *   - 同一行/列内按权重比例分配剩余维度
   *   - 递归直到所有基金都被放置
   *
   * 最小面积保障：每只基金至少占 MIN_PCT，防止极小基金变成不可见细条
   *
   * 文字分级（优先显示名称）：
   *   - 面积 ≥ 12%：名称 + 收益额
   *   - 面积 ≥ 5%：仅名称
   *   - 面积 < 5%：不显示文字
   *
   * 最多展示 TOP_N 只基金，防止基金数量过多时色块过碎
   */
  _buildChartBlocks(fundDetails) {
    if (!fundDetails || fundDetails.length === 0) return []

    const MIN_PCT = 0.08   // 最小面积占比（保证每个色块至少有基本可读空间）
    const TOP_N   = 30     // 最多展示基金数量

    // 过滤零收益，按绝对值降序，最多取 TOP_N
    const funds = fundDetails
      .filter(f => f.revenue !== 0)
      .map(f => ({ ...f, abs: Math.abs(f.revenue) }))
      .sort((a, b) => b.abs - a.abs)
      .slice(0, TOP_N)

    if (funds.length === 0) return []

    const totalAbs = funds.reduce((s, f) => s + f.abs, 0)

    // 最小面积保障：将原始比例与最小比例取大，再归一化
    const boosted  = funds.map(f => Math.max(f.abs / totalAbs, MIN_PCT))
    const bSum     = boosted.reduce((s, v) => s + v, 0)
    const weights  = boosted.map(v => v / bSum)  // 归一化权重，总和=1

    // ── 工具 ──
    const p = v => (v * 100).toFixed(2) + '%'

    const revenueStr = f => (f.revenue >= 0 ? '+' : '') + formatMoney(f.revenue)
    // 颜色统一：正收益红，负收益绿，不随收益大小变化
    const blockColor = f => f.revenue > 0 ? 'rgb(250,212,215)' : 'rgb(206,235,229)'
    const textColor  = f => f.revenue > 0 ? 'rgb(207,64,80)'   : 'rgb(49,154,128)'

    // 色块间距（rpx），通过内缩实现真实空白间隔
    const GAP = 4  // rpx，两侧各缩 GAP/2

    // 判断色块能否放下文字：用宽和高的百分比值估算像素空间
    // 容器固定 460rpx 高、全屏宽约 700rpx（24rpx margin 两侧）
    const CONTAINER_H = 460   // rpx
    const CONTAINER_W = 700   // rpx（估算）

    const makeBlock = (top, left, w, h, f, wgt) => {
      const pxW = w * CONTAINER_W   // 色块估算宽度 rpx
      const pxH = h * CONTAINER_H   // 色块估算高度 rpx

      // 文字分级（基于面积占比 wgt）：
      //   - 面积 ≥ 12%：名称 + 收益额
      //   - 面积 ≥ 5%：仅名称
      //   - 面积 < 5%：不显示文字
      const areaPct = wgt * 100  // 转为百分比
      const canShowLabel   = areaPct >= 5
      const canShowRevenue = areaPct >= 12

      // 名称字号随色块大小自适应，最小 18rpx，最大 24rpx
      const labelSize = pxH < 70 ? 18 : pxH < 100 ? 20 : 24

      // 内缩：每个色块四边各缩 GAP/2，形成 GAP 的视觉间距
      // 用内联 style 的 inset margin 实现，不影响 % 布局
      const inset = GAP / 2
      const iTop  = `calc(${p(top)} + ${inset}rpx)`
      const iLeft = `calc(${p(left)} + ${inset}rpx)`
      const iW    = `calc(${p(w)} - ${GAP}rpx)`
      const iH    = `calc(${p(h)} - ${GAP}rpx)`

      return {
        top: iTop, left: iLeft, width: iW, height: iH,
        color: blockColor(f),
        textColor: textColor(f),
        label: canShowLabel ? f.fund_name : '',
        revenueStr: canShowRevenue ? revenueStr(f) : '',
        labelSize,
      }
    }

    const blocks = []

    /**
     * 递归切割
     * @param {number[]} idxs  当前待放置的基金下标数组
     * @param {number} top     当前区域左上角 top（0~1）
     * @param {number} left    当前区域左上角 left（0~1）
     * @param {number} w       当前区域宽度（0~1）
     * @param {number} h       当前区域高度（0~1）
     */
    const split = (idxs, top, left, w, h) => {
      if (idxs.length === 0) return
      if (idxs.length === 1) {
        const i = idxs[0]
        blocks.push(makeBlock(top, left, w, h, funds[i], weights[i]))
        return
      }

      // 当前批次权重之和
      const groupSum = idxs.reduce((s, i) => s + weights[i], 0)

      // 取第一只基金占当前区域的比例，决定切割方向和第一块尺寸
      const firstRatio = weights[idxs[0]] / groupSum

      if (w >= h) {
        // 宽>高：竖切（按宽度方向分割）
        // 第一只基金占左侧宽度 firstRatio * w，高度撑满 h
        const w0 = w * firstRatio
        blocks.push(makeBlock(top, left, w0, h, funds[idxs[0]], weights[idxs[0]]))
        split(idxs.slice(1), top, left + w0, w - w0, h)
      } else {
        // 高>宽：横切（按高度方向分割）
        const h0 = h * firstRatio
        blocks.push(makeBlock(top, left, w, h0, funds[idxs[0]], weights[idxs[0]]))
        split(idxs.slice(1), top + h0, left, w, h - h0)
      }
    }

    split(funds.map((_, i) => i), 0, 0, 1, 1)

    return blocks
  },

  processCalendarData(calendar) {
    if (!calendar || calendar.length === 0) return []

    const firstDay = calendar[0]
    // Python weekday: 0=周一 6=周日 → 转为日历列偏移（周日=0列）
    const offset = (firstDay.weekday + 1) % 7
    const todayStr = this._dateStr(new Date())

    const emptyDays = Array.from({ length: offset }, () => ({ isEmpty: true, day: null }))
    const processedCalendar = calendar.map(item => ({
      ...item,
      isToday: item.date === todayStr,
    }))

    return [...emptyDays, ...processedCalendar]
  },
})