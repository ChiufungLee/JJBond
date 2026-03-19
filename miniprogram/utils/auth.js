// utils/auth.js - 认证工具

const app = getApp()

/**
 * 检查是否已登录
 */
const isLoggedIn = () => {
  return app.isLoggedIn()
}

/**
 * 获取存储的token
 */
const getToken = () => {
  return app.globalData.token || wx.getStorageSync('token')
}

/**
 * 获取用户信息
 */
const getUserInfo = () => {
  return app.globalData.userInfo || wx.getStorageSync('userInfo')
}

/**
 * 保存登录信息
 * @param {string} token - 访问令牌
 * @param {object} userInfo - 用户信息
 */
const saveLoginInfo = (token, userInfo) => {
  app.setLoginInfo(token, userInfo)
}

/**
 * 清除登录信息
 */
const clearLoginInfo = () => {
  app.clearLoginInfo()
}

/**
 * 检查登录状态，未登录则跳转登录页
 * @param {function} callback - 已登录时的回调
 */
const checkLogin = (callback) => {
  if (isLoggedIn()) {
    callback && callback()
  } else {
    wx.redirectTo({
      url: '/pages/login/login'
    })
  }
}

/**
 * 登出
 */
const logout = () => {
  clearLoginInfo()
  wx.redirectTo({
    url: '/pages/login/login'
  })
}

module.exports = {
  isLoggedIn,
  getToken,
  getUserInfo,
  saveLoginInfo,
  clearLoginInfo,
  checkLogin,
  logout
}
