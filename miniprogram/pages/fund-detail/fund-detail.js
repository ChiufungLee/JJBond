// pages/fund-detail/fund-detail.js
const { get } = require('../../utils/request')
const { formatMoney, formatPercent, getTrend, throttle } = require('../../utils/util')
let wxCharts = null
const app = getApp()

const NAV_RANGES = [
  { key: '1m', label: '近1月', days: 30 },
  { key: '3m', label: '近3月', days: 90 },
  { key: '1y', label: '近1年', days: 365 },
  { key: 'ytd', label: '今年来' }
]

const getYearToDateDays = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)) + 1)
}

Page({
  data: {
    fundCode: '',
    fundInfo: null,
    loading: true,
    error: false,
    errorType: '',
    errorMessage: '',
    hideAmount: false,
    isHeld: false,  // 是否持有该基金
    navRanges: NAV_RANGES,
    currentNavRange: '1m',
    navHistoryAll: [],
    navList: [],
    navPage: 0,
    navPageSize: 20,
    navHasMore: false,
    navLoading: false,
    navLoadingMore: false,
    navError: false,
    navErrorMessage: '',
    transactions: [],
    chartMarkers: [],
    tooltip: {
      show: false,
      date: '今日',
      value: '',
      x: 0,
      y: 0
    }
  },

  // 存储图表数据用于点击检测
  chartData: null,
  chartPoints: null,
  navRequestId: 0,
  transactionsLoadedFundCode: '',
  initialized: false,
  // 节流版 tooltip 更新（避免 touchMove 每帧触发 setData）
  _throttledUpdateTooltip: null,

  onLoad(options) {
    const { code } = options
    const hideAmount = wx.getStorageSync('hideAmount') || false

    if (!code) {
      this.setData({
        hideAmount,
        loading: false,
        error: true,
        errorType: 'invalid',
        errorMessage: '缺少基金代码，无法加载详情'
      })
      return
    }

    this.setData({ fundCode: code, hideAmount })
  },

  onShow() {
    const { fundCode } = this.data
    if (!fundCode) {
      return
    }

    if (!this.initialized) {
      this.initialized = true
      this.loadFundDetail({ forceRefresh: true })
      return
    }

    if (app.consumeFundDirty(fundCode)) {
      this.loadFundDetail({ forceRefresh: true })
    }
  },

  onReady() {
    // 动态加载wx-charts
    try {
      wxCharts = require('../../libs/wx-charts.js')
    } catch (e) {
      console.warn('wx-charts加载失败:', e)
    }
    // 初始化节流版 tooltip（80ms 间隔，避免每帧触发 setData）
    this._throttledUpdateTooltip = throttle((e) => {
      this.updateTooltipPosition(e)
    }, 80)
  },

  getRangeDays(rangeKey = this.data.currentNavRange) {
    if (rangeKey === 'ytd') {
      return getYearToDateDays()
    }

    const range = NAV_RANGES.find(item => item.key === rangeKey)
    return range?.days || 30
  },

  getChartCostPrice() {
    return this.data.isHeld ? this.data.fundInfo?.cost_price : null
  },

  formatUnitNav(value) {
    const num = parseFloat(value)
    return Number.isFinite(num) ? num.toFixed(4) : ''
  },

  buildNavListState(history) {
    const navList = history.slice(0, this.data.navPageSize)
    return {
      navHistoryAll: history,
      navList,
      navPage: navList.length > 0 ? 1 : 0,
      navHasMore: history.length > navList.length,
      navLoadingMore: false
    }
  },

  async fetchBaseFundInfo(fundCode, { forceRefresh = false } = {}) {
    const result = await get(`/funds/check/${fundCode}`, {}, { forceRefresh })

    if (result.is_held && result.fund_code) {
      return {
        formattedInfo: this.formatFundInfo(result),
        isHeld: true
      }
    }

    if (!result.fund_info) {
      return {
        formattedInfo: null,
        isHeld: false
      }
    }

    return {
      formattedInfo: this.formatFundInfoBasic(result.fund_info),
      isHeld: false
    }
  },

  async ensureTransactionsLoaded(fundCode = this.data.fundCode) {
    if (!fundCode) {
      return []
    }

    if (this.transactionsLoadedFundCode === fundCode) {
      return this.data.transactions
    }

    try {
      const transactions = await get(`/funds/${fundCode}/transactions`, {}, { forceRefresh: true, cacheTTL: 0, dedupe: false })
      const normalizedTransactions = Array.isArray(transactions) ? transactions : []
      this.transactionsLoadedFundCode = fundCode
      this.setData({ transactions: normalizedTransactions })
      // 图表已绘制时，补充计算交易标记
      if (this.chartPoints && this.chartData) {
        const markers = this._computeTransactionMarkers(this.chartData.categories, this.chartPoints)
        this.setData({ chartMarkers: markers })
      }
      return normalizedTransactions
    } catch (error) {
      console.error('加载基金交易记录失败:', error)
      this.setData({ transactions: [] })
      return []
    }
  },

  // 加载基金详情
  async loadFundDetail({ forceRefresh = false } = {}) {
    const { fundCode } = this.data
    const shouldResetRelatedData = forceRefresh || !this.data.fundInfo

    if (shouldResetRelatedData) {
      this.chartData = null
      this.chartPoints = null
      this.navRequestId += 1
      this.transactionsLoadedFundCode = ''
    }

    this.setData({
      loading: true,
      ...(shouldResetRelatedData
        ? {
            fundInfo: null,
            isHeld: false,
            navHistoryAll: [],
            navList: [],
            navPage: 0,
            navHasMore: false,
            navLoading: false,
            navLoadingMore: false,
            navError: false,
            navErrorMessage: '',
            transactions: [],
            chartMarkers: [],
            'tooltip.show': false,
            'tooltip.date': '今日',
            'tooltip.value': ''
          }
        : {}),
      error: false,
      errorType: '',
      errorMessage: ''
    })

    try {
      const { formattedInfo, isHeld } = await this.fetchBaseFundInfo(fundCode, { forceRefresh })

      if (!formattedInfo) {
        this.setData({
          loading: false,
          error: true,
          errorType: 'not_found',
          errorMessage: '未找到该基金信息'
        })
        return
      }

      this.setData({
        fundInfo: formattedInfo,
        isHeld,
        loading: false,
        error: false,
        errorType: '',
        errorMessage: ''
      })

      // 并行加载交易记录和净值历史（两者互相独立）
      if (shouldResetRelatedData) {
        await Promise.all([
          this.ensureTransactionsLoaded(fundCode),
          this.loadNavHistory({
            resetList: true,
            rangeKey: this.data.currentNavRange,
            costPrice: isHeld ? formattedInfo.cost_price : null,
            forceRefresh
          })
        ])
      } else {
        await this.ensureTransactionsLoaded(fundCode)
        if (this.chartData && this.data.navHistoryAll.length > 0) {
          this.drawChart(this.data.navHistoryAll, isHeld ? formattedInfo.cost_price : null)
        } else {
          await this.loadNavHistory({
            resetList: true,
            rangeKey: this.data.currentNavRange,
            costPrice: isHeld ? formattedInfo.cost_price : null,
            forceRefresh
          })
        }
      }
    } catch (error) {
      console.error('加载基金详情失败:', error)
      this.setData({
        loading: false,
        error: true,
        errorType: error.statusCode === 404 ? 'not_found' : 'request_failed',
        errorMessage: error.statusCode === 404
          ? '未找到该基金信息'
          : (error.message || '加载基金详情失败，请稍后重试')
      })
    }
  },

  async loadNavHistory({ resetList = true, rangeKey = this.data.currentNavRange, costPrice = this.getChartCostPrice(), forceRefresh = false } = {}) {
    const { fundCode } = this.data
    if (!fundCode) {
      return false
    }

    const requestId = this.navRequestId + 1
    this.navRequestId = requestId
    this.chartData = null
    this.chartPoints = null

    this.setData({
      navLoading: true,
      navLoadingMore: false,
      navError: false,
      navErrorMessage: '',
      ...(resetList
        ? {
            navHistoryAll: [],
            navList: [],
            navPage: 0,
            navHasMore: false
          }
        : {}),
      'tooltip.show': false,
      'tooltip.date': '今日',
      'tooltip.value': '',
      chartMarkers: []
    })

    try {
      const history = await get(`/funds/fund_nav_history/${fundCode}`, {
        days: this.getRangeDays(rangeKey)
      }, {
        forceRefresh,
        cacheTTL: forceRefresh ? 0 : undefined,
        dedupe: !forceRefresh
      })

      if (requestId !== this.navRequestId) {
        return false
      }

      const navHistory = Array.isArray(history) ? history : []
      const todayData = navHistory.length > 0 ? navHistory[0] : null

      this.setData({
        ...this.buildNavListState(navHistory),
        navLoading: false,
        navError: false,
        navErrorMessage: '',
        'tooltip.date': todayData ? todayData.date : '今日',
        'tooltip.value': todayData ? this.formatUnitNav(todayData.unit_nav) : ''
      })

      if (navHistory.length > 0) {
        setTimeout(() => {
          if (requestId === this.navRequestId) {
            this.drawChart(navHistory, costPrice)
          }
        }, 100)
      }

      return true
    } catch (error) {
      if (requestId !== this.navRequestId) {
        return false
      }

      console.error('加载净值历史失败:', error)
      this.setData({
        navLoading: false,
        navError: true,
        navErrorMessage: error.message || '加载净值历史失败，请稍后重试'
      })
      return false
    }
  },

  handleRangeChange(e) {
    const { range } = e.currentTarget.dataset
    if (!range || range === this.data.currentNavRange || this.data.navLoading) {
      return
    }

    this.setData({ currentNavRange: range })
    this.loadNavHistory({
      resetList: true,
      rangeKey: range,
      costPrice: this.getChartCostPrice(),
      forceRefresh: true
    })
  },

  reloadNavHistory() {
    this.loadNavHistory({
      resetList: true,
      rangeKey: this.data.currentNavRange,
      costPrice: this.getChartCostPrice(),
      forceRefresh: true
    })
  },

  appendNavList() {
    const { navLoading, navLoadingMore, navHasMore, navHistoryAll, navList, navPage, navPageSize } = this.data
    if (navLoading || navLoadingMore || !navHasMore) {
      return
    }

    this.setData({ navLoadingMore: true })

    const start = navPage * navPageSize
    const end = start + navPageSize
    const nextItems = navHistoryAll.slice(start, end)

    this.setData({
      navList: [...navList, ...nextItems],
      navPage: nextItems.length > 0 ? navPage + 1 : navPage,
      navHasMore: end < navHistoryAll.length,
      navLoadingMore: false
    })
  },

  // 格式化基金信息（持有基金，包含持仓数据）
  formatFundInfo(info) {
    if (!info) return null

    const todayRevenueTrend = getTrend(info.today_revenue)

    return {
      ...info,
      recent_changes: [],
      cost_formatted: formatMoney(info.cost),
      amount_formatted: formatMoney(info.amount),
      today_revenue_formatted: formatMoney(info.today_revenue),
      total_revenue_formatted: formatMoney(info.total_revenue),
      profit_loss_ratio_formatted: formatPercent(info.profit_loss_ratio),
      shangrijingzhi_formatted: formatMoney(info.shangrijingzhi, 4),
      today_revenue_trend: todayRevenueTrend,
      today_value_trend_class: todayRevenueTrend === 'flat' ? '' : todayRevenueTrend
    }
  },

  // 格式化基金基本信息（未持有基金，只有基本数据）
  formatFundInfoBasic(info) {
    if (!info) return null

    const navUpdated = !!info.nav_updated
    const gszzlNum = parseFloat(info.gszzl)

    // 已更新实际净值时，dwjz 已被后端替换为实际净值
    const todayValue = navUpdated ? info.dwjz : (info.gsz || '--')
    const changeRate = info.gszzl ? `${info.gszzl}%` : '--'

    return {
      fund_code: info.fundcode || info.fund_code,
      fund_name: info.name || info.fund_name,
      change_rate: changeRate,
      nav_updated: navUpdated,
      recent_changes: [],
      // 未持有基金没有以下数据
      cost: null,
      cost_formatted: '--',
      shares: '--',
      cost_price: null,
      today_value: todayValue,
      today_revenue: Number.isFinite(gszzlNum) ? gszzlNum : null,
      today_revenue_formatted: '--',
      total_revenue: null,
      total_revenue_formatted: '--',
      profit_loss_ratio: null,
      profit_loss_ratio_formatted: '--'
    }
  },

  // 绘制图表
  drawChart(data, costPrice) {
    if (!wxCharts || !data || data.length === 0) return

    try {
      const categories = data.map(item => item.date || '').reverse()
      const seriesData = data.map(item => parseFloat(item.unit_nav) || 0).reverse()

      this.chartData = {
        categories,
        seriesData
      }

      const series = [{
        name: '净值',
        data: seriesData,
        format: (val) => val.toFixed(4)
      }]

      let allValues = [...seriesData]
      let minY
      let maxY

      if (costPrice) {
        const costPriceData = new Array(categories.length).fill(costPrice)
        series.push({
          name: '成本价',
          data: costPriceData,
          format: (val) => val.toFixed(4),
          dashed: true,
          showPoints: false,
          color: '#ff7a45'
        })
        allValues = [...allValues, costPrice]
      }

      minY = Math.min(...allValues) * 0.995
      maxY = Math.max(...allValues) * 1.005

      new wxCharts({
        canvasId: 'fundChart',
        context: this,
        type: 'line',
        categories,
        series,
        yAxis: {
          title: '净值',
          format: (val) => val.toFixed(2),
          min: minY,
          max: maxY
        },
        dataPointShape: false,
        onSuccess: (points) => {
          this.chartPoints = points
          const markers = this._computeTransactionMarkers(categories, points)
          this.setData({ chartMarkers: markers })
        }
      })
    } catch (e) {
      console.error('绘制图表失败:', e)
    }
  },

  // 处理图表触摸开始
  handleChartTouchStart(e) {
    this.updateTooltipPosition(e)
  },

  // 处理图表触摸移动（节流，避免每帧触发 setData）
  handleChartTouchMove(e) {
    if (this._throttledUpdateTooltip) {
      this._throttledUpdateTooltip(e)
    }
  },

  // 处理图表触摸结束
  handleChartTouchEnd() {
    setTimeout(() => {
      this.setData({
        'tooltip.show': false,
      })
    }, 3000)
  },

  // 更新 tooltip 位置
  updateTooltipPosition(e) {
    if (!this.chartData || !this.chartPoints) {
      return
    }

    const touch = e.touches[0] || e.changedTouches[0]
    if (!touch) return

    const query = wx.createSelectorQuery().in(this)
    query.select('.chart-container').boundingClientRect((rect) => {
      if (!rect || !this.chartPoints || this.chartPoints.length === 0) return

      const x = touch.clientX - rect.left
      const points = this.chartPoints
      const { categories, seriesData } = this.chartData

      let nearestIndex = 0
      let minDist = Math.abs(x - points[0].x)

      points.forEach((point, index) => {
        const dist = Math.abs(x - point.x)
        if (dist < minDist) {
          minDist = dist
          nearestIndex = index
        }
      })

      if (nearestIndex >= 0) {
        const pointX = points[nearestIndex].x
        const pointY = points[nearestIndex].y

        this.setData({
          tooltip: {
            show: true,
            date: categories[nearestIndex],
            value: seriesData[nearestIndex].toFixed(4),
            x: pointX,
            y: pointY,
            tooltipX: pointX - 60,
            tooltipY: pointY > 50 ? pointY - 50 : 10
          }
        })
      }
    }).exec()
  },

  // 计算买入卖出标记点
  _computeTransactionMarkers(categories, chartPoints) {
    const transactions = this.data.transactions
    if (!transactions || transactions.length === 0 || !chartPoints || !categories || categories.length === 0) return []

    const minDate = categories[0]
    const maxDate = categories[categories.length - 1]
    const markers = []
    const seenPositions = new Set()

    for (const tx of transactions) {
      const txDate = tx.transaction_date ? tx.transaction_date.split('T')[0] : ''
      if (!txDate || txDate < minDate || txDate > maxDate) continue

      // 精确匹配日期
      let bestIndex = categories.indexOf(txDate)
      // 未匹配则回退到最近的前一个交易日
      if (bestIndex < 0) {
        for (let i = categories.length - 1; i >= 0; i--) {
          if (categories[i] <= txDate) {
            bestIndex = i
            break
          }
        }
      }

      if (bestIndex < 0 || !chartPoints[bestIndex]) continue

      // 同一日期去重
      const posKey = `${bestIndex}`
      if (seenPositions.has(posKey)) continue
      seenPositions.add(posKey)

      markers.push({
        x: chartPoints[bestIndex].x,
        y: chartPoints[bestIndex].y,
        type: tx.transaction_type
      })
    }

    return markers
  },

  handleErrorAction() {
    if (this.data.errorType === 'invalid') {
      wx.navigateBack()
      return
    }
    this.loadFundDetail({ forceRefresh: true })
  },

  // 分享给好友
  onShareAppMessage() {
    const { fundInfo, fundCode } = this.data
    const name = fundInfo?.fund_name || fundCode
    const change = fundInfo?.change_rate || ''
    return {
      title: `这基金今天起飞了呀！`,
      path: `/pages/fund-detail/fund-detail?code=${fundCode}`,
      imageUrl: '/icons/logo.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { fundInfo, fundCode } = this.data
    const name = fundInfo?.fund_name || fundCode
    return {
      title: `${name} - JJBond基金管家`,
      imageUrl: '/icons/logo.png',
      query: `code=${fundCode}`
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    if (!this.data.fundCode) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadFundDetail({ forceRefresh: true }).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom() {
    this.appendNavList()
  },

  // 切换隐藏金额
  toggleHideAmount() {
    const hideAmount = !this.data.hideAmount
    this.setData({ hideAmount })
    wx.setStorageSync('hideAmount', hideAmount)
  }
})
