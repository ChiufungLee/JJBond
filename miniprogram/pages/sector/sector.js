// pages/sector/sector.js
const { get } = require('../../utils/request')

const SECTOR_TYPES = [
  { key: 'industry', name: '行业板块' },
  { key: 'concept', name: '概念板块' }
]

function getNowTime() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const TIME_RANGES = [
  { key: 'D', name: '实时', changeSt: 'D', flowSt: 'FLOW' },
  { key: 'W', name: '近一周', changeSt: 'W', flowSt: 'FLOW_W' },
  { key: 'M', name: '近一月', changeSt: 'M', flowSt: 'FLOW_M' },
]

function formatChange(value) {
  if (value === null || value === undefined) return '--'
  const num = parseFloat(value)
  if (isNaN(num)) return '--'
  return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
}

function formatFlow(value) {
  if (value === null || value === undefined) return '--'
  const num = parseFloat(value)
  if (isNaN(num)) return '--'
  const yi = num / 100000000
  return yi >= 0 ? `+${yi.toFixed(2)}亿` : `${yi.toFixed(2)}亿`
}

Page({
  data: {
    sectorTypes: SECTOR_TYPES,
    currentType: 'industry',
    currentTime: 'D',
    timeRanges: TIME_RANGES,
    sectorList: [],
    loading: false,
    error: false,
    errorMessage: '',
    sortOrder: 'desc'
  },

  onLoad() {
    this.updateRealTimeName()
    this._timer = setInterval(() => this.updateRealTimeName(), 60000)
    this.loadSectors()
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer)
  },

  updateRealTimeName() {
    const time = getNowTime()
    const timeRanges = this.data.timeRanges.map(item => {
      if (item.key === 'D') return { ...item, name: `实时(${time})` }
      return item
    })
    this.setData({ timeRanges })
  },

  onTypeChange(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.currentType) return
    this.setData({
      currentType: type,
      sectorList: [],
      loading: false,
      error: false
    })
    this.loadSectors()
  },

  onTimeChange(e) {
    const time = e.currentTarget.dataset.time
    if (time === this.data.currentTime) return
    this.setData({
      currentTime: time,
      sectorList: [],
      loading: false,
      error: false
    })
    this.loadSectors()
  },

  onSortChange() {
    const sortOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc'
    const sectorList = [...this.data.sectorList].sort((a, b) => {
      const diff = (a.flowValue || 0) - (b.flowValue || 0)
      return sortOrder === 'asc' ? diff : -diff
    })
    this.setData({ sortOrder, sectorList })
  },

  async loadSectors() {
    if (this.data.loading) return

    this.setData({ loading: true, error: false, errorMessage: '' })

    try {
      const type = this.data.currentType
      const timeConfig = TIME_RANGES.find(t => t.key === this.data.currentTime)

      const [changeRes, flowRes] = await Promise.all([
        get('/sector/', { type, sort: 'change', st: timeConfig.changeSt }),
        get('/sector/', { type, sort: 'flow', st: timeConfig.flowSt }),
      ])

      const flowMap = {}
      ;(flowRes.data || []).forEach(item => {
        flowMap[item.code] = item.value
      })

      const sortOrder = this.data.sortOrder
      const sectorList = (changeRes.data || []).map(item => {
        const flowValue = flowMap[item.code] !== undefined ? flowMap[item.code] : null
        return {
          ...item,
          flowValue,
          changeText: formatChange(item.value),
          flowText: formatFlow(flowValue),
          isUp: flowValue !== null ? flowValue >= 0 : item.value >= 0,
        }
      }).sort((a, b) => {
        const diff = (a.flowValue || 0) - (b.flowValue || 0)
        return sortOrder === 'asc' ? diff : -diff
      })

      this.setData({
        sectorList,
        loading: false,
        error: false
      })
    } catch (error) {
      console.error('加载板块数据失败:', error)
      this.setData({
        sectorList: [],
        loading: false,
        error: true,
        errorMessage: error.message || '加载板块数据失败'
      })
    }
  },

  goToSectorFunds(e) {
    const { code, name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/sector-funds/sector-funds?code=${code}&name=${encodeURIComponent(name)}` })
  },

  async onPullDownRefresh() {
    await this.loadSectors()
    wx.stopPullDownRefresh()
  },

  onShareAppMessage() {
    return {
      title: '基金板块详情 - JJBond',
      path: '/pages/sector/sector'
    }
  }
})
