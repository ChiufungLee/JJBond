// app.js
App({
  globalData: {
    userInfo: null,
    token: null,
    isLoggedIn: false,
    loginRedirecting: false,
    unauthorizedHandling: false,
    // 后端API地址，开发时使用本地地址，生产环境需要修改为正式域名
    // baseUrl: 'http://106.13.192.72:8888/api'
    // baseUrl: 'http://fund.awesomeme.cloud:8888/api'
    // baseUrl: 'https://jjbond-236500-8-1413585939.sh.run.tcloudbase.com/api',
    baseUrl: 'http://127.0.0.1:8888/api'
  },

  onLaunch() {
    this.checkLoginStatus()
  },

  // 检查并恢复登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token') || null
    const userInfo = wx.getStorageSync('userInfo') || null

    this.globalData.token = token
    this.globalData.userInfo = userInfo
    this.globalData.isLoggedIn = !!token

    return this.globalData.isLoggedIn
  },

  getToken() {
    return this.globalData.token || wx.getStorageSync('token') || null
  },

  getUserInfo() {
    return this.globalData.userInfo || wx.getStorageSync('userInfo') || null
  },

  // 设置登录信息
  setLoginInfo(token, userInfo = null) {
    this.globalData.token = token || null
    this.globalData.userInfo = userInfo || null
    this.globalData.isLoggedIn = !!token

    if (token) {
      wx.setStorageSync('token', token)
    } else {
      wx.removeStorageSync('token')
    }

    if (userInfo) {
      wx.setStorageSync('userInfo', userInfo)
    } else {
      wx.removeStorageSync('userInfo')
    }
  },

  // 清除登录信息
  clearLoginInfo() {
    this.globalData.token = null
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false

    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
  },

  // 检查是否登录
  isLoggedIn() {
    return !!this.getToken()
  },

  goToLogin({ delay = 0 } = {}) {
    const pages = getCurrentPages()
    const currentRoute = pages[pages.length - 1]?.route

    if (currentRoute === 'pages/login/login' || this.globalData.loginRedirecting) {
      return
    }

    this.globalData.loginRedirecting = true

    const navigate = () => {
      wx.reLaunch({
        url: '/pages/login/login',
        complete: () => {
          setTimeout(() => {
            this.globalData.loginRedirecting = false
          }, 300)
        }
      })
    }

    if (delay > 0) {
      setTimeout(navigate, delay)
    } else {
      navigate()
    }
  },

  requireLogin() {
    if (this.isLoggedIn()) {
      return true
    }

    this.goToLogin()
    return false
  },

  handleUnauthorized(message = '登录已过期，请重新登录') {
    if (this.globalData.unauthorizedHandling) {
      return
    }

    this.globalData.unauthorizedHandling = true
    this.clearLoginInfo()

    wx.showToast({
      title: message,
      icon: 'none'
    })

    this.goToLogin({ delay: 1500 })

    setTimeout(() => {
      this.globalData.unauthorizedHandling = false
    }, 1800)
  }
})
