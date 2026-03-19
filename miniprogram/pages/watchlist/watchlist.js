// pages/watchlist/watchlist.js
const { get, post, del } = require('../../utils/request')
const { isLoggedIn } = require('../../utils/auth')
const { formatMoney, formatPercent, showLoading, hideLoading, showToast, showConfirm, debounce } = require('../../utils/util')

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    watchlist: [],
    searching: false,
    loading: true
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({
        url: '/pages/login/login'
      })
      return
    }
  },

  onShow() {
    this.loadWatchlist()
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
          total_change_formatted: formatPercent(item.total_change_rate)
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
  onSearchInput: debounce(function(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })

    if (keyword.length >= 2) {
      this.searchFunds(keyword)
    } else {
      this.setData({ searchResults: [] })
    }
  }, 500),

  // 搜索基金
  async searchFunds(keyword) {
    this.setData({ searching: true })

    try {
      const results = await get('/funds/search', { q: keyword, limit: 10 })
      this.setData({
        searchResults: results || [],
        searching: false
      })
    } catch (error) {
      console.error('搜索失败:', error)
      this.setData({ searching: false })
    }
  },

  // 跳转到基金详情
  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/fund-detail/fund-detail?code=${code}`
    })
  },

  // 添加到自选
  async addToWatchlist(e) {
    const { code, name } = e.currentTarget.dataset

    showLoading('添加中...')

    try {
      await post('/watchlist/', {
        fund_code: code,
        fund_name: name
      })
      hideLoading()
      showToast('已添加到自选')

      // 清空搜索，刷新列表
      this.setData({ searchKeyword: '', searchResults: [] })
      this.loadWatchlist()
    } catch (error) {
      hideLoading()
      console.error('添加自选失败:', error)
    }
  },

  // 从自选移除
  async removeFromWatchlist(e) {
    const { id, name } = e.currentTarget.dataset

    const confirmed = await showConfirm('确认移除', `确定要将 ${name} 从自选中移除吗？`)
    if (!confirmed) return

    showLoading('移除中...')

    try {
      await del(`/watchlist/${id}`)
      hideLoading()
      showToast('已从自选移除')

      // 刷新列表
      this.loadWatchlist()
    } catch (error) {
      hideLoading()
      console.error('移除自选失败:', error)
    }
  },

  // 跳转到添加持仓
  goToAddFund(e) {
    const { code, name } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/funds-add/funds-add?code=${code}&name=${encodeURIComponent(name)}`
    })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadWatchlist().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
