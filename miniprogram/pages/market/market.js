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
    flowList: [],
    flowUpdateTime: '',
    rankingDate: '',
    rankingList: [],
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

      const items = res.data || []
      const inflow = items.filter(i => i.value > 0).slice(0, 10).map((item, i) => ({
        rank: i + 1, name: item.name, code: item.code, valueStr: formatFlow(item.value), isUp: true,
      }))
      const outflow = items.filter(i => i.value < 0).slice(-10).reverse().map((item, i) => ({
        rank: i + 1, name: item.name, code: item.code, valueStr: formatFlow(item.value), isUp: false,
      }))

      this._flowData = { inflow, outflow }
      this._applyFlowView()
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const flowUpdateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      this.setData({ flowUpdateTime })
    } catch (e) {
      console.error('加载资金流数据失败:', e)
    }
  },

  _applyFlowView() {
    if (!this._flowData) return
    this.setData({ flowList: this._flowData[this.data.activeFlowTab] })
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
      const rankingList = (res.data || []).map(item => ({
        ...item,
        changeText: item.change >= 0 ? `+${item.change.toFixed(2)}%` : `${item.change.toFixed(2)}%`,
        isUp: item.change >= 0,
      }))
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const rankingDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      this.setData({ rankingList, rankingDate })
    } catch (e) {
      console.error('加载排行榜失败:', e)
    }
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
})
