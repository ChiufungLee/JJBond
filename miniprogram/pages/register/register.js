// pages/register/register.js
const app = getApp()
const { showToast } = require('../../utils/util')

Page({
  data: {
    loading: false
  },

  onLoad() {
    showToast('请使用微信登录')
    setTimeout(() => {
      app.goToLogin()
    }, 300)
  }
})
