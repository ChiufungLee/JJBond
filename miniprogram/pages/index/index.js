// pages/index/index.js
const { get } = require('../../utils/request')
const { checkLogin, isLoggedIn } = require('../../utils/auth')
const { formatPortfolioSummary } = require('../../utils/portfolio-summary')
const { formatMoney, formatPercent } = require('../../utils/util')

// 示例基金数据（未登录时展示）
const DEMO_SUMMARY = (() => {
  const summary = {
    fund_count: 3,
    total_cost: 50000,
    yesterday_holding_amount: 49800,
    today_holding_amount: 50350,
    today_holding_income: 0,
    yesterday_holding_income: 0,
    today_revenue: 350,
    fund_details: [
      { fund_code: '110011', fund_name: '易方达中小盘混合', cost: 20000, amount: 20100, today_revenue: 120, total_revenue: 100, profit_loss_ratio: 0.5, change_rate: '1.23%' },
      { fund_code: '003834', fund_name: '华夏能源革新股票', cost: 15000, amount: 15150, today_revenue: 80, total_revenue: 150, profit_loss_ratio: 1.0, change_rate: '0.53%' },
      { fund_code: '161725', fund_name: '招商中证白酒指数', cost: 15000, amount: 15100, today_revenue: 150, total_revenue: 100, profit_loss_ratio: 0.67, change_rate: '-0.89%' }
    ],
    high_fund_list: ['华夏能源革新 +0.53%', '易方达中小盘 +1.23%'],
    low_fund_list: ['招商白酒 -0.89%']
  }
  return formatPortfolioSummary(summary)
})()

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
      this.loadData()
    } else {
      const now = new Date()
      const updateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      this.setData({
        loading: false,
        summary: DEMO_SUMMARY,
        updateTime,
        error: false
      })
    }
  },

  // 加载数据
  async loadData() {
    this.setData({
      loading: true,
      error: false,
      errorMessage: ''
    })
    try {
      const summary = await get('/funds/calculate-simple')
      const now = new Date()
      const updateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      this.setData({
        summary: this.formatSummary(summary),
        updateTime,
        error: false,
        errorMessage: ''
      })
    } catch (error) {
      console.error('加载数据失败:', error)
      this.setData({
        summary: null,
        error: true,
        errorMessage: error.message || '加载持仓概览失败，请稍后重试'
      })
    } finally {
      this.setData({ loading: false, refreshing: false })
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
  sortFunds(fundDetails) {
    if (!fundDetails || fundDetails.length === 0) return fundDetails

    const { sortBy, sortOrder } = this.data
    const sorted = [...fundDetails].sort((a, b) => {
      let aVal, bVal

      if (sortBy === 'change_rate') {
        // change_rate 是字符串如 "-1.23%" 或 "2.45%"，需要解析
        aVal = this.parseChangeRate(a.change_rate)
        bVal = this.parseChangeRate(b.change_rate)
      } else {
        aVal = a[sortBy] || 0
        bVal = b[sortBy] || 0
      }

      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
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

    this.setData({ sortBy, sortOrder })

    // 重新排序
    const { summary } = this.data
    if (summary && summary.fund_details) {
      this.setData({
        'summary.fund_details': this.sortFunds(summary.fund_details)
      })
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
