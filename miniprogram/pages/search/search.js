// pages/search/search.js
const { get } = require('../../utils/request')
const { debounce } = require('../../utils/util')

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    searchHistory: [],
    searching: false,
    searched: false
  },

  onLoad() {
    // 加载搜索历史
    this.loadSearchHistory()
  },

  // 加载搜索历史
  loadSearchHistory() {
    const history = wx.getStorageSync('searchHistory') || []
    this.setData({ searchHistory: history.slice(0, 10) })
  },

  // 保存搜索历史
  saveSearchHistory(keyword) {
    let history = this.data.searchHistory.filter(h => h !== keyword)
    history.unshift(keyword)
    history = history.slice(0, 10)
    this.setData({ searchHistory: history })
    wx.setStorageSync('searchHistory', history)
  },

  // 清除搜索历史
  clearHistory() {
    wx.showModal({
      title: '提示',
      content: '确定要清除搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ searchHistory: [] })
          wx.removeStorageSync('searchHistory')
        }
      }
    })
  },

  // 搜索输入
  onSearchInput: debounce(function(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })

    if (keyword.length >= 2) {
      this.searchFunds(keyword)
    } else {
      this.setData({ searchResults: [], searched: false })
    }
  }, 500),

  // 点击历史搜索
  onHistoryTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.setData({ searchKeyword: keyword })
    this.searchFunds(keyword)
  },

  // 搜索基金
  async searchFunds(keyword) {
    this.setData({ searching: true, searched: false })

    try {
      const results = await get('/funds/search', { q: keyword, limit: 20 })
      this.setData({
        searchResults: results || [],
        searching: false,
        searched: true
      })
      this.saveSearchHistory(keyword)
    } catch (error) {
      console.error('搜索失败:', error)
      this.setData({ searching: false, searched: true })
    }
  },

  // 查看基金详情
  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/fund-detail/fund-detail?code=${code}`
    })
  },

  // 添加基金
  goToAddFund(e) {
    const { code, name } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/funds-add/funds-add?code=${code}&name=${encodeURIComponent(name)}`
    })
  }
})
