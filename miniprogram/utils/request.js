// utils/request.js - API请求封装
const app = getApp()

const isSuccessStatus = (statusCode) => {
  return statusCode >= 200 && statusCode < 300
}

const extractErrorMessage = (data, fallback = '请求失败') => {
  const detail = data?.detail

  if (Array.isArray(detail) && detail.length > 0) {
    return detail[0]?.msg || detail[0]?.message || fallback
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }

  if (typeof data === 'string' && data.trim()) {
    return data
  }

  return fallback
}

const createRequestError = (res, fallback) => {
  const error = new Error(extractErrorMessage(res.data, fallback))
  error.response = res
  error.statusCode = res.statusCode
  return error
}

/**
 * 封装请求方法
 * @param {string} url - 请求路径（不含baseUrl）
 * @param {object} options - 请求配置
 * @returns {Promise} - 返回Promise
 */
const request = (url, options = {}) => {
  const {
    skipAuth = false,
    skipUnauthorizedHandler = false,
    skipErrorToast = false,
    fallbackErrorMessage = '请求失败',
    ...requestOptions
  } = options

  return new Promise((resolve, reject) => {
    const token = app.getToken()

    const defaultOptions = {
      url: app.globalData.baseUrl + url,
      method: 'GET',
      data: {},
      header: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }

    const finalOptions = {
      ...defaultOptions,
      ...requestOptions,
      header: {
        ...defaultOptions.header,
        ...requestOptions.header
      }
    }

    if (!skipAuth && token) {
      finalOptions.header['Authorization'] = `Bearer ${token}`
    }

    wx.request({
      ...finalOptions,
      success(res) {
        if (isSuccessStatus(res.statusCode)) {
          resolve(res.data)
          return
        }

        const error = createRequestError(res, fallbackErrorMessage)

        if (res.statusCode === 401 && !skipUnauthorizedHandler) {
          app.handleUnauthorized(error.message || '登录已过期，请重新登录')
          reject(error)
          return
        }

        if (!skipErrorToast) {
          wx.showToast({
            title: error.message,
            icon: 'none'
          })
        }

        reject(error)
      },
      fail(err) {
        console.error('请求失败:', err)
        const error = new Error('网络请求失败')
        error.cause = err

        if (!skipErrorToast) {
          wx.showToast({
            title: error.message,
            icon: 'none'
          })
        }

        reject(error)
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
  return request('/auth/login', {
    method: 'POST',
    skipAuth: true,
    skipUnauthorizedHandler: true,
    fallbackErrorMessage: '登录失败',
    header: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    data: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  })
}

// 微信登录请求
const wechatLogin = (code, nickname = null, avatarUrl = null) => {
  return request('/auth/wechat-login', {
    method: 'POST',
    skipAuth: true,
    skipUnauthorizedHandler: true,
    fallbackErrorMessage: '微信登录失败',
    header: {
      'Content-Type': 'application/json'
    },
    data: {
      code,
      nickname,
      avatar_url: avatarUrl
    }
  })
}

// 修改用户名
const updateUsername = (username) => {
  return put('/users/me/username', { username })
}

// 更新用户信息（昵称、用户名）
const updateUserInfo = (data) => {
  return put('/users/me/info', data)
}

module.exports = {
  request,
  get,
  post,
  put,
  del,
  login,
  wechatLogin,
  updateUsername,
  updateUserInfo
}
