// pages/index/index.js
const { get } = require('../../utils/request')
const { isLoggedIn } = require('../../utils/auth')
const { formatMoney, formatPercent, showLoading, hideLoading } = require('../../utils/util')

Page({
  data: {
    summary: null,
    loading: true,
    refreshing: false,
    // 排序状态
    sortBy: 'today_revenue',  // 当前排序字段: today_revenue | total_revenue
    sortOrder: 'desc',        // 排序方向: desc降序 | asc升序
    // 隐藏金额
    hideAmount: false
  },

  onLoad() {
    // 检查登录状态
    if (!isLoggedIn()) {
      wx.redirectTo({
        url: '/pages/login/login'
      })
      return
    }
    // 读取隐藏金额状态
    const hideAmount = wx.getStorageSync('hideAmount') || false
    this.setData({ hideAmount })
  },

  onShow() {
    if (isLoggedIn()) {
      this.loadData()
    }
  },

  // 加载数据
  async loadData() {
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      // 使用轻量级接口，加载更快
      const summary = await get('/funds/calculate-simple')
      this.setData({
        summary: this.formatSummary(summary)
      })
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      hideLoading()
      this.setData({ loading: false, refreshing: false })
    }
  },

  // 格式化汇总数据
  formatSummary(summary) {
    if (!summary) return null

    const formatted = {
      ...summary,
      total_cost_formatted: formatMoney(summary.total_cost),
      yesterday_holding_amount_formatted: formatMoney(summary.yesterday_holding_amount),
      yesterday_holding_income_formatted: formatMoney(summary.yesterday_holding_income),
      today_revenue_formatted: formatMoney(summary.today_revenue),
      today_holding_amount_formatted: formatMoney(summary.today_holding_amount),
      today_revenue_percent: summary.yesterday_holding_amount > 0
        ? ((summary.today_revenue / summary.yesterday_holding_amount) * 100).toFixed(2)
        : '0.00',
      total_revenue_percent: summary.total_cost > 0
        ? (((summary.today_holding_amount - summary.total_cost) / summary.total_cost) * 100).toFixed(2)
        : '0.00',
      total_revenue: summary.today_holding_amount - summary.total_cost,
      total_revenue_formatted: formatMoney(summary.today_holding_amount - summary.total_cost),
      fund_details: (summary.fund_details || []).map(item => ({
        ...item,
        cost_formatted: formatMoney(item.cost),
        amount_formatted: formatMoney(item.amount),
        today_revenue_formatted: item.today_revenue !== null ? formatMoney(item.today_revenue) : '--',
        total_revenue_formatted: item.total_revenue !== null ? formatMoney(item.total_revenue) : '--',
        profit_loss_ratio_formatted: item.profit_loss_ratio !== null ? formatPercent(item.profit_loss_ratio) : '--',
        change_rate: item.change_rate || '--',
        // 涨幅颜色：负数或0或无数据显示绿色，正数显示红色
        change_rate_class: (item.change_rate && item.change_rate[0] === '-') || item.change_rate === '0' || item.change_rate === '0.00%' || item.change_rate === '--' ? 'down' : 'up'
      }))
    }

    // 应用排序
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
      const aVal = a[sortBy] || 0
      const bVal = b[sortBy] || 0
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
    })

    return sorted
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

  // 添加基金
  goToAddFund() {
    wx.navigateTo({
      url: '/pages/funds-add/funds-add'
    })
  },

  // 切换隐藏金额
  toggleHideAmount() {
    const hideAmount = !this.data.hideAmount
    this.setData({ hideAmount })
    wx.setStorageSync('hideAmount', hideAmount)
  }
})
