// pages/funds/funds.js
const { get, del } = require('../../utils/request')
const { isLoggedIn } = require('../../utils/auth')
const { formatMoney, formatPercent, showLoading, hideLoading, showToast, showConfirm } = require('../../utils/util')

Page({
  data: {
    funds: [],
    loading: true,
    hideAmount: false,
    sortOrder: 'desc',  // 持有收益率排序：desc=从高到低，asc=从低到高
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({
        url: '/pages/login/login'
      })
      return
    }
    // 读取隐藏金额状态
    const hideAmount = wx.getStorageSync('hideAmount') || false
    this.setData({ hideAmount })
  },

  onShow() {
    this.loadFunds()
  },

  // 加载基金列表（使用计算接口获取实时数据）
  async loadFunds() {
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      const summary = await get('/funds/calculate-simple')
      const funds = (summary?.fund_details || []).map(item => ({
        ...item,
        cost_formatted: formatMoney(item.cost),
        today_revenue_formatted: item.today_revenue !== null ? formatMoney(item.today_revenue) : '--',
        total_revenue_formatted: item.total_revenue !== null ? formatMoney(item.total_revenue) : '--',
        profit_loss_ratio_formatted: item.profit_loss_ratio !== null ? formatPercent(item.profit_loss_ratio) : '--',
        change_rate: item.change_rate || '--',
        // 涨幅颜色：负数或0或无数据显示绿色，正数显示红色
        change_rate_class: (item.change_rate && item.change_rate[0] === '-') || item.change_rate === '0' || item.change_rate === '0.00%' || item.change_rate === '--' ? 'down' : 'up'
      }))
      const sorted = this._sortFunds(funds, this.data.sortOrder)
      this.setData({ funds: sorted })
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