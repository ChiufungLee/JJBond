// pages/fund-manage/fund-manage.js
const { get, del } = require('../../utils/request')
const { isLoggedIn, checkLogin } = require('../../utils/auth')
const { showLoading, hideLoading, showToast, showConfirm } = require('../../utils/util')
const { formatPortfolioSummary } = require('../../utils/portfolio-summary')

Page({
  data: {
    funds: [],
    loading: true,
    error: false,
    errorMessage: '',
    hideAmount: false,
    sortOrder: 'desc',
    loggedIn: false,
  },

  onLoad() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) {
      const hideAmount = wx.getStorageSync('hideAmount') || false
      this.setData({ hideAmount })
    }
  },

  onShow() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) {
      const app = getApp()
      const cached = app.getPortfolioCache()
      if (cached) {
        const summary = formatPortfolioSummary(cached)
        const funds = summary?.fund_details || []
        const sorted = this._sortFunds(funds, this.data.sortOrder)
        this.setData({
          funds: sorted,
          loading: false,
          error: false,
          errorMessage: ''
        })
      } else {
        this.loadFunds()
      }
    } else {
      this.setData({ loading: false, funds: [], error: false })
    }
  },

  async loadFunds() {
    this.setData({ loading: true, error: false, errorMessage: '' })

    try {
      const rawData = await get('/funds/calculate-simple')
      getApp().setPortfolioCache(rawData)
      const summary = formatPortfolioSummary(rawData)
      const funds = summary?.fund_details || []
      const sorted = this._sortFunds(funds, this.data.sortOrder)
      this.setData({
        loading: false,
        funds: sorted,
        error: false,
        errorMessage: ''
      })
    } catch (error) {
      console.error('加载基金列表失败:', error)
      this.setData({
        loading: false,
        funds: [],
        error: true,
        errorMessage: error.message || '加载持仓列表失败，请稍后重试'
      })
    }
  },

  onPullDownRefresh() {
    this.loadFunds().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  goToLogin() {
    getApp().goToLogin()
  },

  goToAddFund() {
    if (!checkLogin()) return
    wx.navigateTo({ url: '/pages/funds-add/funds-add' })
  },

  goToEditFund(e) {
    if (!checkLogin()) return
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/funds-edit/funds-edit?id=${id}` })
  },

  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/fund-detail/fund-detail?code=${code}` })
  },

  async deleteFund(e) {
    if (!checkLogin()) return
    const { id, name } = e.currentTarget.dataset

    const confirmed = await showConfirm('确认删除', `确定要删除 ${name} 吗？`)
    if (!confirmed) return

    showLoading('删除中...')

    try {
      await del(`/funds/${id}`)
      hideLoading()
      showToast('删除成功')
      getApp().markPortfolioDirty()
      this.loadFunds()
    } catch (error) {
      hideLoading()
      console.error('删除基金失败:', error)
    }
  },

  sortByTotal() {
    const sortOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc'
    const sorted = this._sortFunds(this.data.funds, sortOrder)
    this.setData({ funds: sorted, sortOrder })
  },

  _sortFunds(funds, order) {
    return [...funds].sort((a, b) => {
      const va = a.total_revenue ?? -Infinity
      const vb = b.total_revenue ?? -Infinity
      return order === 'desc' ? vb - va : va - vb
    })
  },

  toggleHideAmount() {
    const hideAmount = !this.data.hideAmount
    this.setData({ hideAmount })
    wx.setStorageSync('hideAmount', hideAmount)
  }
})
