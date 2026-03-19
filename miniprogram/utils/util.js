// utils/util.js - 通用工具函数

/**
 * 格式化数字，保留指定小数位
 * @param {number} num - 数字
 * @param {number} decimals - 小数位数，默认2
 */
const formatNumber = (num, decimals = 2) => {
  if (num === null || num === undefined || isNaN(num)) {
    return '0.00'
  }
  return Number(num).toFixed(decimals)
}

/**
 * 格式化金额，添加千分位
 * @param {number} num - 金额
 * @param {number} decimals - 小数位数，默认2
 */
const formatMoney = (num, decimals = 2) => {
  if (num === null || num === undefined || isNaN(num)) {
    return '0.00'
  }
  const fixed = Number(num).toFixed(decimals)
  const parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

/**
 * 格式化百分比
 * @param {number} num - 数值
 * @param {number} decimals - 小数位数，默认2
 */
const formatPercent = (num, decimals = 2) => {
  if (num === null || num === undefined || isNaN(num)) {
    return '0.00%'
  }
  return (Number(num) >= 0 ? '+' : '') + Number(num).toFixed(decimals) + '%'
}

/**
 * 格式化日期
 * @param {Date|string|number} date - 日期
 * @param {string} format - 格式，默认 'YYYY-MM-DD'
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
  if (!date) return ''

  const d = new Date(date)
  if (isNaN(d.getTime())) return ''

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * 获取涨跌状态
 * @param {number|string} value - 涨跌幅
 * @returns {string} 'up' | 'down' | 'flat'
 */
const getTrend = (value) => {
  const num = parseFloat(value)
  if (isNaN(num) || num === 0) return 'flat'
  return num > 0 ? 'up' : 'down'
}

/**
 * 获取涨跌颜色类名
 * @param {number|string} value - 涨跌幅
 * @returns {string} CSS类名
 */
const getTrendClass = (value) => {
  const trend = getTrend(value)
  if (trend === 'up') return 'text-error'
  if (trend === 'down') return 'text-success'
  return ''
}

/**
 * 防抖函数
 * @param {function} fn - 要执行的函数
 * @param {number} delay - 延迟时间，默认500ms
 */
const debounce = (fn, delay = 500) => {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {function} fn - 要执行的函数
 * @param {number} interval - 间隔时间，默认500ms
 */
const throttle = (fn, interval = 500) => {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= interval) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

/**
 * 显示加载中
 * @param {string} title - 提示文字
 */
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title,
    mask: true
  })
}

/**
 * 隐藏加载中
 */
const hideLoading = () => {
  wx.hideLoading()
}

/**
 * 显示提示
 * @param {string} title - 提示文字
 * @param {string} icon - 图标类型
 */
const showToast = (title, icon = 'none') => {
  wx.showToast({
    title,
    icon,
    duration: 2000
  })
}

/**
 * 显示确认弹窗
 * @param {string} title - 标题
 * @param {string} content - 内容
 */
const showConfirm = (title, content) => {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success(res) {
        resolve(res.confirm)
      }
    })
  })
}

module.exports = {
  formatNumber,
  formatMoney,
  formatPercent,
  formatDate,
  getTrend,
  getTrendClass,
  debounce,
  throttle,
  showLoading,
  hideLoading,
  showToast,
  showConfirm
}
