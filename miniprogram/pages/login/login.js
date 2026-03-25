// pages/login/login.js
const { wechatLogin } = require('../../utils/request')
const { saveLoginInfo, isLoggedIn } = require('../../utils/auth')
const { showLoading, hideLoading, showToast } = require('../../utils/util')

Page({
  data: {
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

  // 微信一键登录
  async handleWechatLogin() {
    if (this.data.loading) return

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

      // 2. 调用后端微信登录接口
      const res = await wechatLogin(loginRes.code)

      // 3. 保存token和用户信息
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
      showToast(error.message || '登录失败，请重试')
    } finally {
      this.setData({ loading: false })
    }
  }
})
