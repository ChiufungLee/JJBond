// pages/mine/mine.js
const { isLoggedIn, logout, getUserInfo } = require('../../utils/auth')
const { get } = require('../../utils/request')
const { formatMoney, showLoading, hideLoading, showToast } = require('../../utils/util')

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
    menuList: [
      { icon: 'chart', title: '我的持仓', path: '/pages/funds/funds' },
      { icon: 'calendar', title: '收益日历', path: '/pages/calendar/calendar' },
      { icon: 'mail', title: '建议反馈', openType: 'contact' }
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
    try {
      // 使用轻量级接口，加载更快
      const summary = await get('/funds/calculate-simple')
      const totalRevenue = (summary?.today_holding_amount || 0) - (summary?.total_cost || 0)
      const formattedRevenue = formatMoney(Math.abs(totalRevenue))
      this.setData({
        stats: {
          fundCount: summary?.fund_count || 0,
          totalCost: formatMoney(summary?.total_cost || 0),
          totalRevenue: totalRevenue >= 0 ? `+${formattedRevenue}` : `-${formattedRevenue}`,
          totalRevenueIsUp: totalRevenue >= 0
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
