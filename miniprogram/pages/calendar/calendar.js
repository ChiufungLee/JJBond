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
    calendarDays: [],
    selectedDate: null,
    selectedDayInfo: null,
    selectedFundDetails: [],
    revenueChart: []
  },

  onLoad() {
    const now = new Date()
    this.calendarRequestId = 0
    this.skipNextOnShow = true

    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: this._dateStr(now)
    })

    this.loadCalendarData()
  },

  onShow() {
    if (this.skipNextOnShow) {
      this.skipNextOnShow = false
      return
    }

    if (this.data.year && this.data.month) {
      this.loadCalendarData()
    }
  },

  onUnload() {
    this.calendarRequestId += 1
  },

  // ── 数据加载 ──────────────────────────────────────────
  async loadCalendarData() {
    const { year, month } = this.data
    const currentRequestId = ++this.calendarRequestId

    this.setData({
      loading: true,
      selectedDayInfo: null,
      selectedFundDetails: [],
      revenueChart: []
    })

    try {
      const calendarData = await get(`/funds/revenue-calendar?year=${year}&month=${month}`)
      if (currentRequestId !== this.calendarRequestId) {
        return
      }

      const calendar = calendarData?.calendar || []
      const calendarDays = this.processCalendarData(calendar)

      let { selectedDate } = this.data
      const inThisMonth = calendar.some(day => day.date === selectedDate)
      if (!inThisMonth && calendar.length > 0) {
        selectedDate = calendar.find(day => day.is_trading_day && day.revenue !== null)?.date
          || calendar.find(day => day.is_trading_day)?.date
          || calendar[0].date
      }

      const selectedDayInfo = this._findDayInfo(calendar, selectedDate)
      const selectedFundDetails = this._formatFundDetails(selectedDayInfo)
      const revenueChart = this._buildChartBlocks(selectedDayInfo?.fund_details || [])

      this.setData({
        calendarData,
        calendarDays,
        selectedDate,
        selectedDayInfo,
        selectedFundDetails,
        revenueChart,
        loading: false
      })
    } catch (error) {
      if (currentRequestId !== this.calendarRequestId) {
        return
      }

      console.error('加载收益日历失败:', error)
      wx.showToast({
        title: error.message || '加载收益日历失败',
        icon: 'none'
      })
      this.setData({
        loading: false,
        selectedDayInfo: null,
        selectedFundDetails: [],
        revenueChart: []
      })
    }
  },

  // ── 日期点击 ──────────────────────────────────────────
  onDayTap(e) {
    const { date } = e.currentTarget.dataset
    if (!date || !this.data.calendarData?.calendar) return

    const selectedDayInfo = this._findDayInfo(this.data.calendarData.calendar, date)
    const selectedFundDetails = this._formatFundDetails(selectedDayInfo)
    const revenueChart = this._buildChartBlocks(selectedDayInfo?.fund_details || [])

    this.setData({
      selectedDate: date,
      selectedDayInfo,
      selectedFundDetails,
      revenueChart
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
      selectedDate: this._dateStr(now)
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

  _formatFundDetails(dayInfo) {
    if (!dayInfo || !dayInfo.fund_details || dayInfo.fund_details.length === 0) return []

    return dayInfo.fund_details.map(item => ({
      ...item,
      revenue_formatted: formatMoney(item.revenue),
      nav_change: item.today_nav && item.prev_nav
        ? `${item.prev_nav} → ${item.today_nav}`
        : '--',
      change_rate: item.prev_nav
        ? (((item.today_nav - item.prev_nav) / item.prev_nav) * 100).toFixed(2) + '%'
        : '--'
    }))
  },

  _buildChartBlocks(fundDetails) {
    if (!fundDetails || fundDetails.length === 0) return []

    const MIN_PCT = 0.08
    const TOP_N = 30

    const funds = fundDetails
      .filter(f => f.revenue !== 0)
      .map(f => ({ ...f, abs: Math.abs(f.revenue) }))
      .sort((a, b) => b.abs - a.abs)
      .slice(0, TOP_N)

    if (funds.length === 0) return []

    const totalAbs = funds.reduce((s, f) => s + f.abs, 0)
    const boosted = funds.map(f => Math.max(f.abs / totalAbs, MIN_PCT))
    const boostedSum = boosted.reduce((s, v) => s + v, 0)
    const weights = boosted.map(v => v / boostedSum)

    const p = v => (v * 100).toFixed(2) + '%'
    const revenueStr = f => (f.revenue >= 0 ? '+' : '') + formatMoney(f.revenue)
    const blockColor = f => f.revenue > 0 ? 'rgb(250,212,215)' : 'rgb(206,235,229)'
    const textColor = f => f.revenue > 0 ? 'rgb(207,64,80)' : 'rgb(49,154,128)'

    const GAP = 4
    const CONTAINER_H = 460
    const CONTAINER_W = 700

    const makeBlock = (top, left, w, h, f, weight) => {
      const pxH = h * CONTAINER_H
      const areaPct = weight * 100
      const canShowLabel = areaPct >= 5
      const canShowRevenue = areaPct >= 12
      const labelSize = pxH < 70 ? 18 : pxH < 100 ? 20 : 24
      const inset = GAP / 2

      return {
        top: `calc(${p(top)} + ${inset}rpx)`,
        left: `calc(${p(left)} + ${inset}rpx)`,
        width: `calc(${p(w)} - ${GAP}rpx)`,
        height: `calc(${p(h)} - ${GAP}rpx)`,
        color: blockColor(f),
        textColor: textColor(f),
        label: canShowLabel ? f.fund_name : '',
        revenueStr: canShowRevenue ? revenueStr(f) : '',
        labelSize,
        estimatedWidth: w * CONTAINER_W
      }
    }

    const blocks = []

    const split = (indexes, top, left, w, h) => {
      if (indexes.length === 0) return
      if (indexes.length === 1) {
        const i = indexes[0]
        blocks.push(makeBlock(top, left, w, h, funds[i], weights[i]))
        return
      }

      const groupSum = indexes.reduce((s, i) => s + weights[i], 0)
      const firstRatio = weights[indexes[0]] / groupSum

      if (w >= h) {
        const w0 = w * firstRatio
        blocks.push(makeBlock(top, left, w0, h, funds[indexes[0]], weights[indexes[0]]))
        split(indexes.slice(1), top, left + w0, w - w0, h)
      } else {
        const h0 = h * firstRatio
        blocks.push(makeBlock(top, left, w, h0, funds[indexes[0]], weights[indexes[0]]))
        split(indexes.slice(1), top + h0, left, w, h - h0)
      }
    }

    split(funds.map((_, i) => i), 0, 0, 1, 1)

    return blocks.map(({ estimatedWidth, ...rest }) => rest)
  },

  processCalendarData(calendar) {
    if (!calendar || calendar.length === 0) return []

    const firstDay = calendar[0]
    const offset = (firstDay.weekday + 1) % 7
    const todayStr = this._dateStr(new Date())

    const emptyDays = Array.from({ length: offset }, () => ({ isEmpty: true, day: null }))
    const processedCalendar = calendar.map(item => ({
      ...item,
      isToday: item.date === todayStr
    }))

    return [...emptyDays, ...processedCalendar]
  }
})
