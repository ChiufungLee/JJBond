// utils/request.js - API请求封装
const app = getApp()

/**
 * 封装请求方法
 * @param {string} url - 请求路径（不含baseUrl）
 * @param {object} options - 请求配置
 * @returns {Promise} - 返回Promise
 */
const request = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const token = app.globalData.token || wx.getStorageSync('token')

    // 默认配置
    const defaultOptions = {
      url: app.globalData.baseUrl + url,
      method: 'GET',
      data: {},
      header: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }

    // 合并配置
    const finalOptions = {
      ...defaultOptions,
      ...options,
      header: {
        ...defaultOptions.header,
        ...options.header
      }
    }

    // 添加认证token
    if (token) {
      finalOptions.header['Authorization'] = `Bearer ${token}`
    }

    // 发起请求
    wx.request({
      ...finalOptions,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // token过期，清除登录状态
          app.clearLoginInfo()
          wx.showToast({
            title: '登录已过期，请重新登录',
            icon: 'none'
          })
          // 跳转到登录页
          setTimeout(() => {
            wx.redirectTo({
              url: '/pages/login/login'
            })
          }, 1500)
          reject(res)
        } else if (res.statusCode === 422) {
          // 验证错误
          const detail = res.data?.detail
          if (Array.isArray(detail)) {
            wx.showToast({
              title: detail[0]?.msg || '请求参数错误',
              icon: 'none'
            })
          } else {
            wx.showToast({
              title: detail || '请求参数错误',
              icon: 'none'
            })
          }
          reject(res)
        } else {
          // 其他错误
          const errorMsg = res.data?.detail || res.data?.message || '请求失败'
          wx.showToast({
            title: errorMsg,
            icon: 'none'
          })
          reject(res)
        }
      },
      fail(err) {
        console.error('请求失败:', err)
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
        reject(err)
      }
    })
  })
}

// GET请求
const get = (url, data = {}) => {
  return request(url, {
    method: 'GET',
    data
  })
}

// POST请求
const post = (url, data = {}) => {
  return request(url, {
    method: 'POST',
    data
  })
}

// PUT请求
const put = (url, data = {}) => {
  return request(url, {
    method: 'PUT',
    data
  })
}

// DELETE请求
const del = (url, data = {}) => {
  return request(url, {
    method: 'DELETE',
    data
  })
}

// 登录请求（特殊处理，使用form-data格式）
const login = (username, password) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + '/auth/login',
      method: 'POST',
      header: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          const errorMsg = res.data?.detail || '登录失败'
          wx.showToast({
            title: errorMsg,
            icon: 'none'
          })
          reject(res)
        }
      },
      fail(err) {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
        reject(err)
      }
    })
  })
}

module.exports = {
  request,
  get,
  post,
  put,
  del,
  login
}
