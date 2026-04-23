const { get } = require('../../utils/request')

Page({
  data: {
    sectorCode: '',
    sectorName: '',
    sectorInfo: null,
    fundList: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    hasMore: true,
    error: false,
    errorMessage: '',
  },

  onLoad(options) {
    const sectorCode = options.code || ''
    const sectorName = decodeURIComponent(options.name || '')
    this.setData({ sectorCode, sectorName })
    if (sectorName) {
      wx.setNavigationBarTitle({ title: '板块关联基金' })
    }
    this.loadSectorInfo()
    this.loadFunds()
  },

  async loadSectorInfo() {
    try {
      const res = await get(`/sector/${this.data.sectorCode}/detail`)
      this.setData({
        sectorInfo: {
          name: res.name || this.data.sectorName,
          changeD: this._formatChange(res.change_d),
          changeW: this._formatChange(res.change_w),
          changeM: this._formatChange(res.change_m),
          changeQ: this._formatChange(res.change_q),
          changeY: this._formatChange(res.change_y),
          changeYtd: this._formatChange(res.change_ytd),
          isUpD: res.change_d >= 0,
          isUpW: res.change_w >= 0,
          isUpM: res.change_m >= 0,
          isUpQ: res.change_q >= 0,
          isUpY: res.change_y >= 0,
          isUpYtd: res.change_ytd >= 0,
        },
      })
    } catch (e) {
      console.error('加载板块详情失败:', e)
    }
  },

  async loadFunds() {
    if (this.data.loading || !this.data.hasMore) return

    const loadPage = this.data.page
    this.setData({ loading: true, error: false, errorMessage: '' })

    try {
      const result = await get(`/sector/${this.data.sectorCode}/funds`, {
        page: loadPage,
        page_size: this.data.pageSize,
      })

      const newList = (result.data || []).map(item => ({
        ...item,
        changeText: this._formatChange(item.change),
        relationText: item.relation != null ? item.relation.toFixed(2) + '%' : '--',
        isUp: item.change >= 0,
      }))

      this.setData({
        fundList: loadPage === 1 ? newList : [...this.data.fundList, ...newList],
        total: result.total || 0,
        hasMore: loadPage * this.data.pageSize < (result.total || 0),
        page: loadPage + 1,
        loading: false,
      })
    } catch (error) {
      console.error('加载板块基金失败:', error)
      this.setData({
        loading: false,
        error: true,
        errorMessage: error.message || '加载板块基金失败',
      })
    }
  },

  _formatChange(value) {
    if (value === null || value === undefined) return '--'
    const num = parseFloat(value)
    if (isNaN(num)) return '--'
    return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
  },

  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/fund-detail/fund-detail?code=${code}` })
  },

  async onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, fundList: [], loading: false, error: false })
    this.loadSectorInfo()
    await this.loadFunds()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    this.loadFunds()
  },

  onShareAppMessage() {
    return {
      title: `${this.data.sectorName}板块基金 - JJBond`,
      path: `/pages/sector-funds/sector-funds?code=${this.data.sectorCode}&name=${encodeURIComponent(this.data.sectorName)}`,
    }
  },
})
