// pages/funds/funds.js
const { get, del } = require('../../utils/request')
const { isLoggedIn } = require('../../utils/auth')
const { formatMoney, showLoading, hideLoading, showToast, showConfirm } = require('../../utils/util')

Page({
  data: {
    funds: [],
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
    this.loadFunds()
  },

  // 加载基金列表
  async loadFunds() {
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      const funds = await get('/funds/')
      this.setData({
        funds: (funds || []).map(item => ({
          ...item,
          cost_formatted: formatMoney(item.cost_price * item.shares),
          cost_price_formatted: formatMoney(item.cost_price),
          shares_formatted: item.shares.toFixed(2)
        }))
      })
    } catch (error) {
      console.error('加载基金列表失败:', error)
    } finally {
      hideLoading()
      this.setData({ loading: false })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadFunds().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 跳转到添加基金页
  goToAddFund() {
    wx.navigateTo({
      url: '/pages/funds-add/funds-add'
    })
  },

  // 跳转到编辑基金页
  goToEditFund(e) {
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
  }
})
