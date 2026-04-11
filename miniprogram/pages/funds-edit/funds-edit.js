// pages/funds-edit/funds-edit.js
const { get, put } = require('../../utils/request')
const { checkLogin } = require('../../utils/auth')
const { showLoading, hideLoading, showToast } = require('../../utils/util')
const app = getApp()

Page({
  data: {
    fundId: null,
    fundInfo: null,
    cost_price: '',
    shares: '',
    loading: true,
    submitting: false
  },

  onLoad(options) {
    if (!checkLogin()) {
      return
    }

    const { id } = options
    if (!id) {
      showToast('参数错误')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({ fundId: id })
    this.loadFundInfo(id)
  },

  // 加载基金信息
  async loadFundInfo(id) {
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      const fund = await get(`/funds/${id}`)

      this.setData({
        fundInfo: fund,
        cost_price: String(fund.cost_price),
        shares: String(fund.shares),
        loading: false
      })
      hideLoading()
    } catch (error) {
      hideLoading()
      console.error('加载基金信息失败:', error)
      this.setData({
        loading: false,
        fundInfo: null
      })
      showToast(error.message || '基金不存在或已无权限访问')
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  // 输入成本价
  onCostPriceInput(e) {
    this.setData({ cost_price: e.detail.value })
  },

  // 输入份额
  onSharesInput(e) {
    this.setData({ shares: e.detail.value })
  },

  // 提交更新
  async handleSubmit() {
    const { fundId, cost_price, shares } = this.data

    if (!cost_price || isNaN(cost_price) || parseFloat(cost_price) <= 0) {
      showToast('请输入正确的成本价')
      return
    }
    if (!shares || isNaN(shares) || parseFloat(shares) <= 0) {
      showToast('请输入正确的份额')
      return
    }

    this.setData({ submitting: true })
    showLoading('保存中...')

    try {
      await put(`/funds/${fundId}`, {
        cost_price: parseFloat(cost_price),
        shares: parseFloat(shares)
      })

      hideLoading()
      app.markFundDirty(this.data.fundInfo?.fund_code)
      app.markPortfolioDirty()
      showToast('保存成功')

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      hideLoading()
      console.error('保存失败:', error)
      showToast(error.message || '保存失败，请稍后重试')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
