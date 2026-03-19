// pages/register/register.js
const { post } = require('../../utils/request')
const { showLoading, hideLoading, showToast } = require('../../utils/util')

Page({
  data: {
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    loading: false
  },

  // 输入用户名
  onUsernameInput(e) {
    this.setData({
      username: e.detail.value
    })
  },

  // 输入邮箱
  onEmailInput(e) {
    this.setData({
      email: e.detail.value
    })
  },

  // 输入密码
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    })
  },

  // 输入确认密码
  onConfirmPasswordInput(e) {
    this.setData({
      confirmPassword: e.detail.value
    })
  },

  // 注册
  async handleRegister() {
    const { username, email, password, confirmPassword } = this.data

    // 表单验证
    if (!username.trim()) {
      showToast('请输入用户名')
      return
    }
    if (username.length < 3) {
      showToast('用户名至少3个字符')
      return
    }
    if (!email.trim()) {
      showToast('请输入邮箱')
      return
    }
    if (!this.validateEmail(email)) {
      showToast('请输入正确的邮箱格式')
      return
    }
    if (!password) {
      showToast('请输入密码')
      return
    }
    if (password.length < 6) {
      showToast('密码至少6个字符')
      return
    }
    if (password !== confirmPassword) {
      showToast('两次密码输入不一致')
      return
    }

    this.setData({ loading: true })
    showLoading('注册中...')

    try {
      await post('/auth/register', {
        username: username.trim(),
        email: email.trim(),
        password
      })

      hideLoading()
      showToast('注册成功，请登录')

      // 返回登录页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      hideLoading()
      console.error('注册失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  // 验证邮箱格式
  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  },

  // 返回登录页
  goToLogin() {
    wx.navigateBack()
  }
})
