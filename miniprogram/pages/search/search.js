// pages/search/search.js
const { createFundSearchManager } = require('../../utils/fund-search')

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    searchHistory: [],
    searching: false,
    searched: false
  },

  onLoad() {
    this.searchManager = createFundSearchManager({
      page: this,
      limit: 20,
      searchedKey: 'searched',
      onSuccess: (_, keyword) => {
        this.saveSearchHistory(keyword)
      },
      onError(error) {
        console.error('搜索失败:', error)
      }
    })

    this.loadSearchHistory()
  },

  onUnload() {
    this.searchManager?.invalidate()
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
  onSearchInput(e) {
    this.searchManager?.onInput(e)
  },

  // 点击历史搜索
  onHistoryTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.searchManager?.search(keyword).catch(() => {})
  },

  // 搜索基金
  async searchFunds(keyword) {
    if (!this.searchManager) {
      return []
    }

    return this.searchManager.search(keyword)
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
