// pages/market/market.js
const { get } = require('../../utils/request')

Page({
  data: {
    loading: true,
    groups: [],
    activeFlowTab: 'inflow',
    activeSectorType: 'industry',
    flowList: [],
    rankingList: [],
  },

  onLoad() {
    this._loaded = false
    this.loadIndices()
    this.loadFlowData()
    this.loadRanking()
    this._loaded = true
  },

  onShow() {
    if (this._loaded) {
      this.loadIndices()
      this.loadFlowData()
      this.loadRanking()
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
      this.setData({ groups, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  async loadFlowData() {
    try {
      const [industryRes, conceptRes] = await Promise.all([
        get('/sector/', { type: 'industry', sort: 'flow', st: 'FLOW' }),
        get('/sector/', { type: 'concept', sort: 'flow', st: 'FLOW' }),
      ])

      const formatFlow = v => {
        const yi = v / 100000000
        return (yi >= 0 ? '+' : '') + yi.toFixed(2) + '亿'
      }

      const buildLists = items => {
        const inflow = items.filter(i => i.value > 0).slice(0, 10)
        const outflow = items.filter(i => i.value < 0).slice(-10).reverse()
        return {
          inflow: inflow.map((item, i) => ({
            rank: i + 1, name: item.name, valueStr: formatFlow(item.value), isUp: true,
          })),
          outflow: outflow.map((item, i) => ({
            rank: i + 1, name: item.name, valueStr: formatFlow(item.value), isUp: false,
          })),
        }
      }

      this._flowData = {
        industry: buildLists(industryRes.data || []),
        concept: buildLists(conceptRes.data || []),
      }
      this._applyFlowView()
    } catch (e) {
      console.error('加载资金流数据失败:', e)
    }
  },

  _applyFlowView() {
    const sector = this._flowData[this.data.activeSectorType]
    if (!sector) return
    this.setData({ flowList: sector[this.data.activeFlowTab] })
  },

  onFlowTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeFlowTab) return
    this.setData({ activeFlowTab: tab })
    this._applyFlowView()
  },

  onSectorTypeChange(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.activeSectorType) return
    this.setData({ activeSectorType: type })
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
      this.setData({ rankingList })
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
})
