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
  return app.getToken()
}

/**
 * 获取用户信息
 */
const getUserInfo = () => {
  return app.getUserInfo()
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
  if (!app.requireLogin()) {
    return false
  }

  callback && callback()
  return true
}

/**
 * 登出
 */
const logout = () => {
  clearLoginInfo()
  app.goToLogin()
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
