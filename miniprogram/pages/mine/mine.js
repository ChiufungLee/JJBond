// pages/mine/mine.js
const { checkLogin, getUserInfo, isLoggedIn, saveLoginInfo, getToken } = require('../../utils/auth')
const { updateUserInfo } = require('../../utils/request')

const app = getApp()

// 获取完整的头像 URL
function getFullAvatarUrl(avatarUrl) {
  if (!avatarUrl) return ''
  if (avatarUrl.startsWith('http')) return avatarUrl
  const baseUrl = app.globalData.baseUrl.replace('/api', '')
  return baseUrl + avatarUrl
}

Page({
  data: {
    userInfo: null,
    avatarUrl: '',
    avatarLetter: '?',
    daysTogether: 0,
    loggedIn: false,
    editingNickname: false,
    _savingNickname: false,
    nickname: '',
    menuList: [
      { icon: 'sector', title: '持仓分布', path: '/pages/funds/funds' },
      { icon: 'chart', title: '基金管理', path: '/pages/fund-manage/fund-manage' },
      { icon: 'calendar', title: '收益日历', path: '/pages/calendar/calendar' }
    ],
    moreList: [
      { icon: 'chat', title: '功能建议', path: '/pages/suggest/suggest' },
      { icon: 'IM', title: '联系客服', openType: 'contact' }
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
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = getUserInfo()
    let daysTogether = 1
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
      avatarLetter: (userInfo?.nickname || userInfo?.username || '?').charAt(0),
      daysTogether
    })
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

  // 点击昵称，进入编辑模式
  startEditNickname() {
    const userInfo = this.data.userInfo
    this.setData({
      editingNickname: true,
      nickname: userInfo?.nickname || userInfo?.username || ''
    })
  },

  // 输入昵称
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  // 失去焦点时保存昵称
  async onNicknameBlur() {
    const { nickname, userInfo, _savingNickname } = this.data
    if (_savingNickname) return

    const trimmed = (nickname || '').trim()

    this.setData({ editingNickname: false })

    if (!trimmed || trimmed === (userInfo?.nickname || userInfo?.username)) {
      return
    }

    this.setData({ _savingNickname: true })
    try {
      const res = await updateUserInfo({ nickname: trimmed })
      const token = getToken()
      saveLoginInfo(token, {
        ...userInfo,
        nickname: res.nickname
      })
      this.setData({
        userInfo: { ...userInfo, nickname: res.nickname },
        avatarLetter: (res.nickname || userInfo?.username || '?').charAt(0)
      })
      wx.showToast({ title: '昵称已更新', icon: 'success' })
    } catch (error) {
      console.error('修改昵称失败:', error)
      wx.showToast({ title: error.message || '修改失败', icon: 'none' })
    } finally {
      this.setData({ _savingNickname: false })
    }
  }
})
