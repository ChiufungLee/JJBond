// pages/ranking/ranking.js
const { get } = require('../../utils/request')

// 排行榜类型配置
const RANKING_TYPES = [
  { key: 'day', name: '日涨幅' },
  { key: 'week', name: '周涨幅' },
  { key: 'month', name: '月涨幅' },
  { key: 'year', name: '近1年' },
  { key: 'ytd', name: '今年来' }
]

Page({
  data: {
    rankingTypes: RANKING_TYPES,
    currentType: 'day',
    sortOrder: 'desc',  // desc: 降序（涨幅从高到低）, asc: 升序（涨幅从低到高）
    rankingList: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    error: false,
    errorMessage: '',
    hasMore: true,
    lastUpdate: ''
  },

  onLoad() {
    this.loadRanking()
  },

  onShow() {
    // 页面显示时不重新加载，保持当前状态
  },

  // 切换排行榜类型
  onTypeChange(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.currentType) return

    this.setData({
      currentType: type,
      rankingList: [],
      page: 1,
      hasMore: true,
      loading: false,
      error: false,
      errorMessage: ''
    })
    this.loadRanking()
  },

  // 切换排序方向
  toggleSortOrder() {
    const newOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc'
    this.setData({
      sortOrder: newOrder,
      rankingList: [],
      page: 1,
      hasMore: true,
      loading: false,
      error: false,
      errorMessage: ''
    })
    this.loadRanking()
  },

  // 加载排行榜数据
  async loadRanking() {
    // 防止重复加载
    if (this.data.loading) return
    if (!this.data.hasMore) return

    // 保存当前状态，防止在异步过程中被改变
    const loadType = this.data.currentType
    const loadPage = this.data.page
    const loadOrder = this.data.sortOrder

    this.setData({
      loading: true,
      error: false,
      errorMessage: ''
    })

    try {
      const result = await get('/ranking/', {
        type: loadType,
        page: loadPage,
        page_size: this.data.pageSize,
        desc: loadOrder === 'desc' ? true : false
      })

      // 检查状态是否已经改变，如果改变了则丢弃这次请求结果
      if (this.data.currentType !== loadType || this.data.sortOrder !== loadOrder) {
        this.setData({ loading: false })
        return
      }

      const newList = (result.data || []).map(item => ({
        ...item,
        changeText: this.formatChange(item.change),
        changeClass: item.change >= 0 ? 'up' : 'down'
      }))

      this.setData({
        rankingList: loadPage === 1 ? newList : [...this.data.rankingList, ...newList],
        total: result.total || 0,
        lastUpdate: result.lastUpdate || '',
        hasMore: loadPage * this.data.pageSize < (result.total || 0),
        page: loadPage + 1,
        loading: false,
        error: false,
        errorMessage: ''
      })

    } catch (error) {
      console.error('加载排行榜失败:', error)
      this.setData({
        loading: false,
        error: true,
        errorMessage: error.message || '加载排行榜失败，请稍后重试'
      })
    }
  },

  // 格式化涨跌幅
  formatChange(value) {
    if (value === null || value === undefined) return '--'
    const num = parseFloat(value)
    if (isNaN(num)) return '--'
    return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
  },

  // 跳转到基金详情
  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/fund-detail/fund-detail?code=${code}`
    })
  },

  // 添加到自选
  async addToWatchlist(e) {
    const { code, name } = e.currentTarget.dataset
    const { post } = require('../../utils/request')
    const { showToast } = require('../../utils/util')

    try {
      await post('/watchlist/', {
        fund_code: code,
        fund_name: name
      })
      showToast('已添加到自选')
    } catch (error) {
      console.error('添加自选失败:', error)
      if (error.message && error.message.includes('已存在')) {
        showToast('已在自选中')
      }
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true,
      rankingList: [],
      loading: false,
      error: false,
      errorMessage: ''
    })
    await this.loadRanking()
    wx.stopPullDownRefresh()
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadRanking()
  }
})
