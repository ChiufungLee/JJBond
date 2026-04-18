// pages/mine/mine.js
const { checkLogin, logout, getUserInfo, isLoggedIn } = require('../../utils/auth')
const { get } = require('../../utils/request')
const { formatMoney } = require('../../utils/util')

const app = getApp()

// 获取完整的头像 URL
function getFullAvatarUrl(avatarUrl) {
  if (!avatarUrl) return ''
  if (avatarUrl.startsWith('http')) return avatarUrl
  // baseUrl 是 http://127.0.0.1:8888/api，静态文件在 http://127.0.0.1:8888/static
  const baseUrl = app.globalData.baseUrl.replace('/api', '')
  return baseUrl + avatarUrl
}

Page({
  data: {
    userInfo: null,
    avatarUrl: '',
    daysTogether: 0,
    stats: null,
    statsLoading: false,
    statsError: false,
    statsErrorMessage: '',
    loggedIn: false,
    menuList: [
      { icon: 'chart', title: '我的持仓', path: '/pages/funds/funds' },
      { icon: 'calendar', title: '收益日历', path: '/pages/calendar/calendar' },
      { icon: 'sector', title: '板块详情', path: '/pages/sector/sector', noAuth: true },
      { icon: 'mail', title: '建议反馈', openType: 'contact' }
    ]
  },

  onLoad() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
  },

  onShow() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (!loggedIn) {
      return
    }
    this.loadUserInfo()
    this.loadStats()
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = getUserInfo()
    let daysTogether = 1  // 默认至少 1 天
    if (userInfo?.created_at) {
      const createdAt = new Date(userInfo.created_at)
      const now = new Date()
      const diffTime = Math.abs(now - createdAt)
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      if (days > 0) {
        daysTogether = days
      }
    }
    this.setData({
      userInfo,
      avatarUrl: getFullAvatarUrl(userInfo?.avatar_url),
      daysTogether
    })
  },

  // 加载统计数据
  async loadStats() {
    this.setData({
      statsLoading: true,
      statsError: false,
      statsErrorMessage: ''
    })

    try {
      // 优先使用全局缓存
      let summary = app.getPortfolioCache()
      if (!summary) {
        summary = await get('/funds/calculate-simple')
        app.setPortfolioCache(summary)
      }
      const totalRevenue = (summary?.today_holding_amount || 0) - (summary?.total_cost || 0)
      const formattedRevenue = formatMoney(Math.abs(totalRevenue))
      this.setData({
        stats: {
          fundCount: summary?.fund_count || 0,
          totalCost: formatMoney(summary?.total_cost || 0),
          totalRevenue: totalRevenue >= 0 ? `+${formattedRevenue}` : `-${formattedRevenue}`,
          totalRevenueIsUp: totalRevenue >= 0
        },
        statsLoading: false,
        statsError: false,
        statsErrorMessage: ''
      })
    } catch (error) {
      console.error('加载统计失败:', error)
      this.setData({
        stats: null,
        statsLoading: false,
        statsError: true,
        statsErrorMessage: error.message || '加载统计失败，请稍后重试'
      })
    }
  },

  // 跳转菜单
  goToMenu(e) {
    const { path, noauth } = e.currentTarget.dataset
    if (!noauth && !checkLogin()) return
    wx.navigateTo({ url: path })
  },

  // 跳转到登录页
  goToLogin() {
    app.goToLogin()
  },

  // 编辑用户名
  goToEditProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
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
