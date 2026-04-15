// pages/watchlist/watchlist.js
const { get, post, del } = require('../../utils/request')
const { isLoggedIn, checkLogin } = require('../../utils/auth')
const { formatPercent, showLoading, hideLoading, showToast, showConfirm } = require('../../utils/util')
const { createFundSearchManager } = require('../../utils/fund-search')

const isDownChangeRate = (rate) => {
  return (rate && rate[0] === '-') || rate === '0' || rate === '0.00%' || rate === '--'
}

// 示例自选基金数据（未登录时展示）
const DEMO_WATCHLIST = [
  { id: 1, fund_code: '110011', fund_name: '易方达中小盘混合', change_rate: '1.23%', total_change_rate: 2.5, total_change_formatted: '+2.50%', is_holding: false, added_at: '2026/01/15' },
  { id: 2, fund_code: '003834', fund_name: '华夏能源革新股票', change_rate: '0.53%', total_change_rate: 1.8, total_change_formatted: '+1.80%', is_holding: true, added_at: '2026/02/20' },
  { id: 3, fund_code: '161725', fund_name: '招商中证白酒指数', change_rate: '-0.89%', total_change_rate: -3.2, total_change_formatted: '-3.20%', is_holding: false, added_at: '2026/03/10' }
]

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    watchlist: [],
    searching: false,
    loading: true,
    loggedIn: false
  },

  onLoad() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })

    this.searchManager = createFundSearchManager({
      page: this,
      limit: 10,
      onError(error) {
        console.error('搜索失败:', error)
      }
    })
  },

  onShow() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) {
      this.loadWatchlist()
    } else {
      this.setData({
        loading: false,
        watchlist: DEMO_WATCHLIST.map(item => ({
          ...item,
          added_at_formatted: this.formatDate(item.added_at),
          change_rate_class: isDownChangeRate(item.change_rate) ? 'down' : 'up'
        }))
      })
    }
  },

  onUnload() {
    this.searchManager?.invalidate()
  },

  // 加载自选列表
  async loadWatchlist() {
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      const watchlist = await get('/watchlist/')
      this.setData({
        watchlist: (watchlist || []).map(item => ({
          ...item,
          added_at_formatted: this.formatDate(item.added_at),
          total_change_formatted: formatPercent(item.total_change_rate),
          nav_updated: !!item.nav_updated,
          change_rate_class: isDownChangeRate(item.change_rate) ? 'down' : 'up'
        })),
        loading: false
      })
      hideLoading()
    } catch (error) {
      hideLoading()
      console.error('加载自选失败:', error)
      this.setData({ loading: false })
    }
  },

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  },

  // 搜索输入
  onSearchInput(e) {
    this.searchManager?.onInput(e)
  },

  // 搜索基金
  async searchFunds(keyword) {
    if (!this.searchManager) {
      return []
    }

    return this.searchManager.search(keyword)
  },

  // 跳转到基金详情
  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/fund-detail/fund-detail?code=${code}`
    })
  },

  // 跳转到登录页
  goToLogin() {
    const app = getApp()
    app.goToLogin()
  },

  // 添加到自选
  async addToWatchlist(e) {
    if (!checkLogin()) return
    const { code, name } = e.currentTarget.dataset

    showLoading('添加中...')

    try {
      await post('/watchlist/', {
        fund_code: code,
        fund_name: name
      })
      hideLoading()
      showToast('已添加到自选')

      this.searchManager?.invalidate()
      this.searchManager?.clearResults()
      this.setData({ searchKeyword: '' })
      this.loadWatchlist()
    } catch (error) {
      hideLoading()
      console.error('添加自选失败:', error)
    }
  },

  // 从自选移除
  async removeFromWatchlist(e) {
    if (!checkLogin()) return
    const { id, name } = e.currentTarget.dataset

    const confirmed = await showConfirm('确认移除', `确定要将 ${name} 从自选中移除吗？`)
    if (!confirmed) return

    showLoading('移除中...')

    try {
      await del(`/watchlist/${id}`)
      hideLoading()
      showToast('已从自选移除')

      this.loadWatchlist()
    } catch (error) {
      hideLoading()
      console.error('移除自选失败:', error)
    }
  },

  // 跳转到添加持仓
  goToAddFund(e) {
    if (!checkLogin()) return
    const { code, name } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/funds-add/funds-add?code=${code}&name=${encodeURIComponent(name)}`
    })
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '给你分享一只涨幅不错的基金~',
      path: '/pages/ranking/ranking',
      imageUrl: '/icons/logo.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: 'JJBond基金管家 - 发现好基金',
      imageUrl: '/icons/logo.png'
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadWatchlist().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
