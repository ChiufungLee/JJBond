// pages/funds/funds.js
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
    sortOrder: 'desc',  // 持有收益率排序：desc=从高到低，asc=从低到高
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
      this.loadFunds()
    } else {
      this.setData({ loading: false, funds: [], error: false })
    }
  },

  // 加载基金列表（使用计算接口获取实时数据）
  async loadFunds() {
    this.setData({
      loading: true,
      error: false,
      errorMessage: ''
    })

    try {
      const summary = formatPortfolioSummary(await get('/funds/calculate-simple'))
      const funds = summary?.fund_details || []
      const sorted = this._sortFunds(funds, this.data.sortOrder)
      this.setData({
        funds: sorted,
        error: false,
        errorMessage: ''
      })
    } catch (error) {
      console.error('加载基金列表失败:', error)
      this.setData({
        funds: [],
        error: true,
        errorMessage: error.message || '加载持仓列表失败，请稍后重试'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '泪水打湿猪脚饭，今年要赚100万！',
      path: '/pages/ranking/ranking',
      imageUrl: '/icons/logo.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '泪水打湿猪脚饭，今年要赚100万！',
      imageUrl: '/icons/logo.png'
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadFunds().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 跳转到登录页
  goToLogin() {
    const app = getApp()
    app.goToLogin()
  },

  // 跳转到添加基金页
  goToAddFund() {
    if (!checkLogin()) return
    wx.navigateTo({
      url: '/pages/funds-add/funds-add'
    })
  },

  // 跳转到编辑基金页
  goToEditFund(e) {
    if (!checkLogin()) return
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/funds-edit/funds-edit?id=${id}`
    })
  },

  // 跳转到基金详情
  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/fund-detail/fund-detail?code=${code}`
    })
  },

  // 删除基金
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

      // 刷新列表
      this.loadFunds()
    } catch (error) {
      hideLoading()
      console.error('删除基金失败:', error)
    }
  },

  // 点击"持有收益"表头，切换排序方向
  sortByTotal() {
    const sortOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc'
    const sorted = this._sortFunds(this.data.funds, sortOrder)
    this.setData({ funds: sorted, sortOrder })
  },

  // 按持有收益率排序
  _sortFunds(funds, order) {
    return [...funds].sort((a, b) => {
      const va = a.profit_loss_ratio ?? -Infinity
      const vb = b.profit_loss_ratio ?? -Infinity
      return order === 'desc' ? vb - va : va - vb
    })
  },

  // 切换隐藏金额
  toggleHideAmount() {
    const hideAmount = !this.data.hideAmount
    this.setData({ hideAmount })
    wx.setStorageSync('hideAmount', hideAmount)
  }
})