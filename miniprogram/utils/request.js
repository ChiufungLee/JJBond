// utils/request.js - API请求封装
const app = getApp()

const DEFAULT_GET_CACHE_TTL = 10000
const inflightGetRequests = new Map()
const getResponseCache = new Map()
let lastCacheToken = null

const clearGetRequestState = () => {
  inflightGetRequests.clear()
  getResponseCache.clear()
}

const syncGetCacheScope = (token) => {
  const cacheToken = token || null
  if (cacheToken === lastCacheToken) {
    return
  }
  lastCacheToken = cacheToken
  clearGetRequestState()
}

const buildRequestKey = ({ method, url, data, token, skipAuth }) => {
  return JSON.stringify({
    method,
    url,
    data: data || {},
    token: skipAuth ? null : (token || null)
  })
}

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
    forceRefresh = false,
    cacheTTL = DEFAULT_GET_CACHE_TTL,
    dedupe = true,
    ...requestOptions
  } = options

  const token = app.getToken()
  syncGetCacheScope(token)

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

  const method = (finalOptions.method || 'GET').toUpperCase()
  const isGetRequest = method === 'GET'

  if (!skipAuth && token) {
    finalOptions.header['Authorization'] = `Bearer ${token}`
  }

  const requestKey = buildRequestKey({
    method,
    url,
    data: finalOptions.data,
    token,
    skipAuth
  })

  if (isGetRequest && !forceRefresh && cacheTTL > 0) {
    const cachedEntry = getResponseCache.get(requestKey)
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return Promise.resolve(cachedEntry.data)
    }
    if (cachedEntry) {
      getResponseCache.delete(requestKey)
    }
  }

  if (isGetRequest && !forceRefresh && dedupe) {
    const inflightRequest = inflightGetRequests.get(requestKey)
    if (inflightRequest) {
      return inflightRequest
    }
  }

  const promise = new Promise((resolve, reject) => {
    wx.request({
      ...finalOptions,
      success(res) {
        if (isSuccessStatus(res.statusCode)) {
          if (isGetRequest && cacheTTL > 0) {
            getResponseCache.set(requestKey, {
              data: res.data,
              expiresAt: Date.now() + cacheTTL
            })
          } else if (!isGetRequest) {
            clearGetRequestState()
          }
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

  if (isGetRequest && !forceRefresh && dedupe) {
    inflightGetRequests.set(requestKey, promise)
    promise.finally(() => {
      if (inflightGetRequests.get(requestKey) === promise) {
        inflightGetRequests.delete(requestKey)
      }
    })
  }

  return promise
}

// GET请求
const get = (url, data = {}, options = {}) => {
  return request(url, {
    method: 'GET',
    data,
    ...options
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
