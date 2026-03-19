// pages/login/login.js
const { login } = require('../../utils/request')
const { saveLoginInfo, isLoggedIn } = require('../../utils/auth')
const { showLoading, hideLoading, showToast } = require('../../utils/util')

Page({
  data: {
    username: '',
    password: '',
    loading: false
  },

  onLoad() {
    // 如果已登录，直接跳转首页
    if (isLoggedIn()) {
      wx.switchTab({
        url: '/pages/index/index'
      })
    }
  },

  // 输入用户名
  onUsernameInput(e) {
    this.setData({
      username: e.detail.value
    })
  },

  // 输入密码
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    })
  },

  // 登录
  async handleLogin() {
    const { username, password } = this.data

    // 表单验证
    if (!username.trim()) {
      showToast('请输入用户名')
      return
    }
    if (!password) {
      showToast('请输入密码')
      return
    }

    this.setData({ loading: true })
    showLoading('登录中...')

    try {
      const res = await login(username, password)
      // 保存token
      saveLoginInfo(res.access_token, { username })

      hideLoading()
      showToast('登录成功')

      // 跳转到首页
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        })
      }, 1000)
    } catch (error) {
      hideLoading()
      console.error('登录失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  // 跳转注册页
  goToRegister() {
    wx.navigateTo({
      url: '/pages/register/register'
    })
  }
})
