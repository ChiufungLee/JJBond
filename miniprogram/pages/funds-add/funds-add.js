// pages/funds-add/funds-add.js
const { get, post } = require('../../utils/request')
const { showLoading, hideLoading, showToast } = require('../../utils/util')
const { createFundSearchManager } = require('../../utils/fund-search')
const app = getApp()

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    selectedFund: null,
    cost_price: '',
    shares: '',
    searching: false,
    submitting: false,
    hotFunds: [],
    hotSearchEnabled: true,
  },

  onLoad() {
    this.searchManager = createFundSearchManager({
      page: this,
      limit: 10,
      onError(error) {
        console.error('搜索失败:', error)
      }
    })
    this.loadHotFunds()
  },

  onUnload() {
    this.searchManager?.invalidate()
  },

  // 加载热搜基金
  async loadHotFunds() {
    try {
      const res = await get('/hot-search/funds', {}, { cacheTTL: 3600 })
      if (res && res.feature_enabled === false) {
        this.setData({ hotSearchEnabled: false, hotFunds: [] })
        return
      }
      if (res && res.data) {
        this.setData({ hotFunds: res.data })
      }
    } catch (error) {
      console.error('获取热搜基金失败:', error)
    }
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

  // 选择基金
  selectFund(e) {
    const { code, name } = e.currentTarget.dataset
    this.searchManager?.invalidate()
    this.searchManager?.clearResults()

    this.setData({
      selectedFund: { fund_code: code, fund_name: name },
      searchKeyword: ''
    })
  },

  // 清除选中
  clearSelected() {
    this.searchManager?.invalidate()
    this.searchManager?.clearResults()

    this.setData({
      selectedFund: null,
      searchKeyword: '',
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
      app.markFundDirty(selectedFund.fund_code)
      app.markPortfolioDirty()
      showToast('添加成功')

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
