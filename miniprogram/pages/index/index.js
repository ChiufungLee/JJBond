// pages/index/index.js
const { get } = require('../../utils/request')
const { checkLogin, isLoggedIn } = require('../../utils/auth')
const { formatPortfolioSummary } = require('../../utils/portfolio-summary')
const { formatMoney, formatPercent } = require('../../utils/util')

Page({
  data: {
    summary: null,
    loading: true,
    refreshing: false,
    error: false,
    errorMessage: '',
    // 排序状态
    sortBy: 'change_rate',    // 当前排序字段: change_rate(涨幅) | total_revenue(持有收益)
    sortOrder: 'desc',        // 排序方向: desc降序 | asc升序
    // 隐藏金额
    hideAmount: false,
    // 统计时间
    updateTime: '',
    loggedIn: false
  },

  onLoad() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) {
      const hideAmount = wx.getStorageSync('hideAmount') || false
      this.setData({ hideAmount })
    }
  },

  onShow() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) {
      // 优先使用缓存，避免 tab 切换时重复请求
      const app = getApp()
      const cached = app.getPortfolioCache()
      if (cached) {
        this.setData({
          summary: this.formatSummary(cached),
          loading: false,
          error: false,
          errorMessage: ''
        })
      } else {
        this.loadData()
      }
    } else {
      this.setData({
        loading: false,
        summary: null,
        error: false
      })
    }
  },

  // 加载数据
  async loadData() {
    this.setData({ loading: true, error: false, errorMessage: '' })
    try {
      const summary = await get('/funds/calculate-simple')
      // 写入全局缓存，供 funds 页复用
      getApp().setPortfolioCache(summary)
      const now = new Date()
      const updateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      this.setData({
        loading: false,
        refreshing: false,
        summary: this.formatSummary(summary),
        updateTime,
        error: false,
        errorMessage: ''
      })
    } catch (error) {
      console.error('加载数据失败:', error)
      this.setData({
        loading: false,
        refreshing: false,
        summary: null,
        error: true,
        errorMessage: error.message || '加载持仓概览失败，请稍后重试'
      })
    }
  },

  // 格式化汇总数据
  formatSummary(summary) {
    const formatted = formatPortfolioSummary(summary)
    if (!formatted) {
      return null
    }

    return {
      ...formatted,
      fund_details: this.sortFunds(formatted.fund_details)
    }
  },

  // 排序基金列表
  sortFunds(fundDetails, sortBy, sortOrder) {
    if (!fundDetails || fundDetails.length === 0) return fundDetails

    const _sortBy = sortBy || this.data.sortBy
    const _sortOrder = sortOrder || this.data.sortOrder
    const sorted = [...fundDetails].sort((a, b) => {
      let aVal, bVal

      if (_sortBy === 'change_rate') {
        // 按当日收益金额排序，而非涨幅百分比
        aVal = a.today_revenue || 0
        bVal = b.today_revenue || 0
      } else {
        aVal = a[_sortBy] || 0
        bVal = b[_sortBy] || 0
      }

      return _sortOrder === 'desc' ? bVal - aVal : aVal - bVal
    })

    return sorted
  },

  // 解析涨幅字符串为数值
  parseChangeRate(rateStr) {
    if (!rateStr || rateStr === '--') return 0
    // 移除百分号并转换为数值
    const num = parseFloat(rateStr.replace('%', ''))
    return isNaN(num) ? 0 : num
  },

  // 切换排序
  handleSort(e) {
    const { field } = e.currentTarget.dataset
    let { sortBy, sortOrder } = this.data

    if (sortBy === field) {
      // 同一字段，切换方向
      sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'
    } else {
      // 不同字段，默认降序
      sortBy = field
      sortOrder = 'desc'
    }

    const { summary } = this.data
    if (summary && summary.fund_details) {
      this.setData({
        sortBy,
        sortOrder,
        'summary.fund_details': this.sortFunds(summary.fund_details, sortBy, sortOrder)
      })
    } else {
      this.setData({ sortBy, sortOrder })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 跳转到基金详情
  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/fund-detail/fund-detail?code=${code}`
    })
  },

  // 跳转到登录页
  goToLogin() {
    const app = getApp()
    app.goToLogin()
  },

  // 添加基金
  goToAddFund() {
    if (!checkLogin()) return
    wx.navigateTo({
      url: '/pages/funds-add/funds-add'
    })
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '泪水打湿猪脚饭，今年要赚100万！',
      path: '/pages/ranking/ranking',
      imageUrl: '/icons/logo.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '泪水打湿猪脚饭，今年要赚100万！',
      imageUrl: '/icons/logo.png'
    }
  },

  // 切换隐藏金额
  toggleHideAmount() {
    const hideAmount = !this.data.hideAmount
    this.setData({ hideAmount })
    wx.setStorageSync('hideAmount', hideAmount)
  }
})
