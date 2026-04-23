// pages/sector/sector.js
const { get } = require('../../utils/request')

const SECTOR_TYPES = [
  { key: 'industry', name: '行业板块' },
  { key: 'concept', name: '概念板块' }
]

const SORT_FIELDS = [
  { key: 'change', name: '涨跌幅' },
  { key: 'flow', name: '资金流入' }
]

const TIME_RANGES = {
  change: [
    { key: 'D', name: '日' },
    { key: 'W', name: '周' },
    { key: 'M', name: '月' }
  ],
  flow: [
    { key: 'FLOW', name: '实时' },
    { key: 'FLOW_W', name: '周' },
    { key: 'FLOW_M', name: '月' }
  ]
}

Page({
  data: {
    sectorTypes: SECTOR_TYPES,
    sortFields: SORT_FIELDS,
    currentType: 'industry',
    currentSort: 'change',
    currentTime: 'D',
    timeRanges: TIME_RANGES.change,
    sectorList: [],
    loading: false,
    error: false,
    errorMessage: ''
  },

  onLoad() {
    this.loadSectors()
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

  onSortChange(e) {
    const sort = e.currentTarget.dataset.sort
    if (sort === this.data.currentSort) return
    const timeRanges = TIME_RANGES[sort]
    const currentTime = timeRanges[0].key
    this.setData({
      currentSort: sort,
      timeRanges,
      currentTime,
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

  async loadSectors() {
    if (this.data.loading) return

    this.setData({ loading: true, error: false, errorMessage: '' })

    try {
      const result = await get('/sector/', {
        type: this.data.currentType,
        sort: this.data.currentSort,
        st: this.data.currentTime
      })

      const sectorList = (result.data || []).map(item => ({
        ...item,
        valueText: this._formatValue(item.value),
        isUp: item.value >= 0
      }))

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

  _formatValue(value) {
    if (value === null || value === undefined) return '--'
    const num = parseFloat(value)
    if (isNaN(num)) return '--'
    if (this.data.currentSort === 'change') {
      return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
    }
    // 资金流入，单位亿元
    const yi = num / 100000000
    return yi >= 0 ? `+${yi.toFixed(2)}亿` : `${yi.toFixed(2)}亿`
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
