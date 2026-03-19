// pages/mine/mine.js
const { isLoggedIn, logout, getUserInfo } = require('../../utils/auth')
const { get } = require('../../utils/request')
const { formatMoney, showLoading, hideLoading, showToast } = require('../../utils/util')

Page({
  data: {
    userInfo: null,
    stats: null,
    menuList: [
      { icon: '📊', title: '我的持仓', path: '/pages/funds/funds' },
      { icon: '🔍', title: '搜索基金', path: '/pages/search/search' },
      { icon: '➕', title: '添加基金', path: '/pages/funds-add/funds-add' }
    ]
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({
        url: '/pages/login/login'
      })
      return
    }
  },

  onShow() {
    this.loadUserInfo()
    this.loadStats()
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = getUserInfo()
    this.setData({ userInfo })
  },

  // 加载统计数据
  async loadStats() {
    try {
      const summary = await get('/funds/calculate')
      this.setData({
        stats: {
          fundCount: summary?.fund_count || 0,
          totalCost: formatMoney(summary?.total_cost || 0),
          todayRevenue: formatMoney(summary?.today_revenue || 0),
          todayRevenueIsUp: (summary?.today_revenue || 0) >= 0
        }
      })
    } catch (error) {
      console.error('加载统计失败:', error)
    }
  },

  // 跳转菜单
  goToMenu(e) {
    const { path } = e.currentTarget.dataset
    wx.navigateTo({ url: path })
  },

  // 退出登录
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout()
        }
      }
    })
  }
})
