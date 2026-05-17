// pages/market/market.js
const { get } = require('../../utils/request')
const { isLoggedIn } = require('../../utils/auth')

Page({
  data: {
    loading: true,
    loggedIn: false,
    groups: [],
    indicesError: false,
    activeFlowTab: 'inflow',
    hasFlowData: false,
    flowList: [],
    flowTop3: [],
    flowRest: [],
    flowUpdateTime: '',
    rankingDate: '',
    rankingList: [],
    rankingEnabled: true,
  },

  onLoad() {
    this._loaded = false
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    this.loadIndices()
    if (loggedIn) {
      this.loadFlowData()
      this.loadRanking()
    }
    this._loaded = true
  },

  onShow() {
    if (this._loaded) {
      const loggedIn = isLoggedIn()
      this.setData({ loggedIn })
      this.loadIndices()
      if (loggedIn) {
        this.loadFlowData()
        this.loadRanking()
      } else {
        this.setData({ flowList: [], rankingList: [] })
      }
    }
  },

  onPullDownRefresh() {
    Promise.all([this.loadIndices(), this.loadFlowData(), this.loadRanking()]).then(() => wx.stopPullDownRefresh())
  },

  async loadIndices() {
    try {
      const res = await get('/market/indices', {}, { cacheTTL: 60000 })
      const groups = (res.groups || []).map(g => ({
        ...g,
        items: (g.items || []).map(idx => ({
          ...idx,
          priceStr: idx.price.toFixed(2),
          changeStr: (idx.change >= 0 ? '+' : '') + idx.change.toFixed(2),
          pctStr: (idx.change >= 0 ? '+' : '') + idx.change_pct.toFixed(2) + '%',
          isUp: idx.change >= 0,
        })),
      }))
      this.setData({ groups, indicesError: false, loading: false })
    } catch (e) {
      this.setData({ groups: [], indicesError: true, loading: false })
    }
  },

  async loadFlowData() {
    try {
      const res = await get('/sector/', { type: 'all', sort: 'flow', st: 'FLOW' })

      const formatFlow = v => {
        const yi = v / 100000000
        return (yi >= 0 ? '+' : '') + yi.toFixed(2) + '亿'
      }

      const formatRate = v => {
        if (v == null) return ''
        return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
      }

      const items = res.data || []
      if (items.length === 0) {
        this.setData({ hasFlowData: false })
        return
      }

      const inflow = items.filter(i => i.value > 0).slice(0, 10).map((item, i) => ({
        rank: i + 1, name: item.name, code: item.code, valueStr: formatFlow(item.value), isUp: true,
        changeRateStr: formatRate(item.change_rate), changeRateUp: (item.change_rate || 0) >= 0,
      }))
      const outflow = items.filter(i => i.value < 0).slice(-10).reverse().map((item, i) => ({
        rank: i + 1, name: item.name, code: item.code, valueStr: formatFlow(item.value), isUp: false,
        changeRateStr: formatRate(item.change_rate), changeRateUp: (item.change_rate || 0) >= 0,
      }))

      this._flowData = { inflow, outflow }
      this._applyFlowView()
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const flowUpdateTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
      this.setData({ hasFlowData: true, flowUpdateTime })
    } catch (e) {
      console.error('加载资金流数据失败:', e)
    }
  },

  _applyFlowView() {
    if (!this._flowData) return
    const list = this._flowData[this.data.activeFlowTab]
    this.setData({
      flowList: list,
      flowTop3: list.slice(0, 3),
      flowRest: list.slice(3),
    })
  },

  onFlowTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeFlowTab) return
    this.setData({ activeFlowTab: tab })
    this._applyFlowView()
  },

  async loadRanking() {
    try {
      const res = await get('/ranking/', { type: 'day', page: 1, page_size: 10, desc: true })
      if (res.feature_enabled === false) {
        this.setData({ rankingEnabled: false, rankingList: [] })
        return
      }
      const rankingList = (res.data || []).map(item => ({
        ...item,
        changeText: item.change >= 0 ? `+${item.change.toFixed(2)}%` : `${item.change.toFixed(2)}%`,
        isUp: item.change >= 0,
      }))
      const d = this._getLatestTradingDate()
      const pad = n => String(n).padStart(2, '0')
      const rankingDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      this.setData({ rankingEnabled: true, rankingList, rankingDate })
    } catch (e) {
      console.error('加载排行榜失败:', e)
    }
  },

  _getLatestTradingDate() {
    const d = new Date()
    const day = d.getDay()
    if (day === 0) d.setDate(d.getDate() - 2)      // 周日 → 上周五
    else if (day === 6) d.setDate(d.getDate() - 1)  // 周六 → 上周五
    return d
  },

  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/fund-detail/fund-detail?code=${code}` })
  },

  goToRanking() {
    wx.navigateTo({ url: '/pages/ranking/ranking' })
  },

  goToSector() {
    wx.navigateTo({ url: '/pages/sector/sector' })
  },

  goToLogin() {
    const app = getApp()
    app.goToLogin()
  },

  goToSectorDetail(e) {
    const { code, name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/sector/sector?code=${code}&name=${encodeURIComponent(name)}` })
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
})
