// pages/funds/funds.js
const { get } = require('../../utils/request')
const { isLoggedIn } = require('../../utils/auth')
const { formatPortfolioSummary } = require('../../utils/portfolio-summary')

Page({
  data: {
    funds: [],
    loading: true,
    error: false,
    errorMessage: '',
    loggedIn: false,
    pieData: null,
    sectorPieData: null,
  },

  onLoad() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
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
        this.setData({
          funds,
          pieData: this._buildPieData(funds),
          loading: false,
          error: false,
          errorMessage: ''
        })
        this._loadSectorData()
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
      this.setData({
        loading: false,
        funds,
        pieData: this._buildPieData(funds),
        error: false,
        errorMessage: ''
      })
      this._loadSectorData()
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

  onShareAppMessage() {
    return {
      title: '泪水打湿猪脚饭，今年要赚100万！',
      path: '/pages/ranking/ranking',
      imageUrl: '/icons/logo.png'
    }
  },

  onShareTimeline() {
    return {
      title: '泪水打湿猪脚饭，今年要赚100万！',
      imageUrl: '/icons/logo.png'
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

  _buildPieData(funds) {
    if (!funds || funds.length === 0) return null

    const colors = ['#722ed1', '#1890ff', '#13c2c2', '#52c41a', '#faad14', '#f5222d', '#eb2f96', '#2f54eb', '#fa8c16', '#a0d911']
    const totalCost = funds.reduce((sum, f) => sum + (f.cost || 0), 0)
    if (totalCost <= 0) return null

    let cumPct = 0
    const stops = []
    const legend = []

    funds.forEach((f, i) => {
      const pct = (f.cost || 0) / totalCost * 100
      const color = colors[i % colors.length]
      const start = cumPct
      cumPct += pct
      stops.push(`${color} ${start}% ${cumPct}%`)
      legend.push({
        name: f.fund_name || f.fund_code,
        pct: pct.toFixed(1),
        cost: f.cost || 0,
        color,
      })
    })

    legend.sort((a, b) => b.cost - a.cost)

    return {
      gradient: `conic-gradient(${stops.join(', ')})`,
      legend,
    }
  },

  async _loadSectorData() {
    try {
      const res = await get('/funds/sector-distribution')
      const sectors = res?.sectors || []
      this.setData({ sectorPieData: this._buildSectorPieData(sectors) })
    } catch (e) {
      console.error('加载板块分布失败:', e)
    }
  },

  _buildSectorPieData(sectors) {
    if (!sectors || sectors.length === 0) return null

    const colors = ['#722ed1', '#1890ff', '#13c2c2', '#52c41a', '#faad14', '#f5222d', '#eb2f96', '#2f54eb', '#fa8c16', '#a0d911']
    const total = sectors.reduce((sum, s) => sum + (s.value || 0), 0)
    if (total <= 0) return null

    let cumPct = 0
    const stops = []
    const legend = []

    sectors.forEach((s, i) => {
      const pct = s.percentage || ((s.value || 0) / total * 100)
      const color = colors[i % colors.length]
      const start = cumPct
      cumPct += pct
      stops.push(`${color} ${start}% ${cumPct}%`)
      legend.push({
        name: s.sector_name,
        pct: pct.toFixed(1),
        value: s.value || 0,
        color,
      })
    })

    legend.sort((a, b) => b.value - a.value)

    return {
      gradient: `conic-gradient(${stops.join(', ')})`,
      legend,
    }
  },
})
