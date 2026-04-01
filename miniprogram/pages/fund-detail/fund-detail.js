// pages/fund-detail/fund-detail.js
const { get } = require('../../utils/request')
const { formatMoney, formatPercent, getTrend } = require('../../utils/util')
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
    transactionMarkers: [],
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

  formatTransactionDate(value) {
    if (!value) {
      return ''
    }

    if (typeof value === 'string') {
      return value.slice(0, 10)
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  buildTransactionMarkers(transactions = this.data.transactions) {
    const { categories } = this.chartData || {}
    const points = this.chartPoints || []
    if (!categories || categories.length === 0 || points.length === 0 || !Array.isArray(transactions)) {
      return []
    }

    const dateIndexMap = new Map()
    categories.forEach((date, index) => {
      dateIndexMap.set(date, index)
    })

    const markerMap = new Map()
    const dateTypeMap = new Map()

    transactions.forEach(item => {
      const date = this.formatTransactionDate(item.transaction_date)
      const index = dateIndexMap.get(date)
      const point = index === undefined ? null : points[index]
      if (!point) {
        return
      }

      const type = item.transaction_type === 'buy' ? 'buy' : 'sell'
      const key = `${date}_${type}`
      const existing = markerMap.get(key)

      if (existing) {
        existing.count += 1
        return
      }

      markerMap.set(key, {
        key,
        date,
        type,
        x: point.x,
        y: point.y,
        count: 1
      })

      const existingTypes = dateTypeMap.get(date) || new Set()
      existingTypes.add(type)
      dateTypeMap.set(date, existingTypes)
    })

    return Array.from(markerMap.values()).map(marker => {
      const typeCount = dateTypeMap.get(marker.date)?.size || 1
      if (typeCount < 2) {
        return marker
      }

      return {
        ...marker,
        x: marker.x + (marker.type === 'buy' ? -7 : 7)
      }
    })
  },

  updateTransactionMarkers(transactions = this.data.transactions) {
    this.setData({
      transactionMarkers: this.buildTransactionMarkers(transactions)
    })
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
    const summary = await get('/funds/calculate', {}, { forceRefresh })
    const fundDetail = (summary?.fund_details || []).find(
      item => item.fund_code === fundCode
    )

    if (fundDetail) {
      return {
        formattedInfo: this.formatFundInfo(fundDetail),
        isHeld: true
      }
    }

    const fundInfo = await get(`/funds/fund_info/${fundCode}`, {}, { forceRefresh })
    if (!fundInfo) {
      return {
        formattedInfo: null,
        isHeld: false
      }
    }

    return {
      formattedInfo: this.formatFundInfoBasic(fundInfo),
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
            transactionMarkers: [],
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

      await this.ensureTransactionsLoaded(fundCode)
      if (shouldResetRelatedData) {
        await this.loadNavHistory({
          resetList: true,
          rangeKey: this.data.currentNavRange,
          costPrice: isHeld ? formattedInfo.cost_price : null,
          forceRefresh
        })
      } else if (this.chartData && this.data.navHistoryAll.length > 0) {
        this.drawChart(this.data.navHistoryAll, isHeld ? formattedInfo.cost_price : null)
      } else {
        await this.loadNavHistory({
          resetList: true,
          rangeKey: this.data.currentNavRange,
          costPrice: isHeld ? formattedInfo.cost_price : null,
          forceRefresh
        })
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
      transactionMarkers: [],
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
      'tooltip.value': ''
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
      } else {
        this.setData({ transactionMarkers: [] })
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

    return {
      fund_code: info.fundcode || info.fund_code,
      fund_name: info.name || info.fund_name,
      change_rate: info.gszzl ? `${info.gszzl}%` : '--',
      recent_changes: [],
      // 未持有基金没有以下数据
      cost: null,
      cost_formatted: '--',
      shares: '--',
      cost_price: null,
      today_value: info.gsz || '--',
      today_revenue: null,
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
          this.updateTransactionMarkers()
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

  // 处理图表触摸移动
  handleChartTouchMove(e) {
    this.updateTooltipPosition(e)
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

  handleErrorAction() {
    if (this.data.errorType === 'invalid') {
      wx.navigateBack()
      return
    }
    this.loadFundDetail({ forceRefresh: true })
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
