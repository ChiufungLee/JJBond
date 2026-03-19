// pages/funds-add/funds-add.js
const { get, post } = require('../../utils/request')
const { showLoading, hideLoading, showToast, debounce } = require('../../utils/util')

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    selectedFund: null,
    cost_price: '',
    shares: '',
    searching: false,
    submitting: false
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

  // 选择基金
  selectFund(e) {
    const { code, name } = e.currentTarget.dataset
    this.setData({
      selectedFund: { fund_code: code, fund_name: name },
      searchKeyword: '',
      searchResults: []
    })
  },

  // 清除选中
  clearSelected() {
    this.setData({
      selectedFund: null,
      searchKeyword: '',
      searchResults: [],
      cost_price: '',
      shares: ''
    })
  },

  // 输入成本价
  onCostPriceInput(e) {
    this.setData({ cost_price: e.detail.value })
  },

  // 输入份额
  onSharesInput(e) {
    this.setData({ shares: e.detail.value })
  },

  // 提交添加
  async handleSubmit() {
    const { selectedFund, cost_price, shares } = this.data

    // 验证
    if (!selectedFund) {
      showToast('请先搜索并选择基金')
      return
    }
    if (!cost_price || isNaN(cost_price) || parseFloat(cost_price) <= 0) {
      showToast('请输入正确的成本价')
      return
    }
    if (!shares || isNaN(shares) || parseFloat(shares) <= 0) {
      showToast('请输入正确的份额')
      return
    }

    this.setData({ submitting: true })
    showLoading('添加中...')

    try {
      await post('/funds/', {
        fund_code: selectedFund.fund_code,
        fund_name: selectedFund.fund_name,
        cost_price: parseFloat(cost_price),
        shares: parseFloat(shares)
      })

      hideLoading()
      showToast('添加成功')

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      hideLoading()
      console.error('添加失败:', error)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
