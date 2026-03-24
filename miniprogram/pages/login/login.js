// pages/login/login.js
const { login, wechatLogin } = require('../../utils/request')
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

  // 微信一键登录
  async handleWechatLogin() {
    this.setData({ loading: true })
    showLoading('登录中...')

    try {
      // 1. 获取微信登录 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })

      if (!loginRes.code) {
        hideLoading()
        showToast('微信登录失败，请重试')
        this.setData({ loading: false })
        return
      }

      // 2. 尝试获取用户信息（可选）
      let nickname = null
      let avatarUrl = null

      // 3. 调用后端微信登录接口
      const res = await wechatLogin(loginRes.code, nickname, avatarUrl)

      // 4. 保存token和用户信息
      saveLoginInfo(res.access_token, {
        username: res.username || res.nickname,
        nickname: res.nickname,
        avatar_url: res.avatar_url,
        created_at: res.created_at
      })

      hideLoading()

      if (res.is_new_user) {
        showToast('注册成功，欢迎加入！')
      } else {
        showToast('登录成功')
      }

      // 跳转到首页
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        })
      }, 1000)
    } catch (error) {
      hideLoading()
      console.error('微信登录失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  // 账号密码登录
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
      // 保存token和用户信息
      saveLoginInfo(res.access_token, {
        username: res.username,
        created_at: res.created_at
      })

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
