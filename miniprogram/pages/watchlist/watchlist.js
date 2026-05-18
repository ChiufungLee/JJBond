// pages/watchlist/watchlist.js
const { get, post, del } = require('../../utils/request')
const { isLoggedIn, checkLogin } = require('../../utils/auth')
const { formatPercent, showLoading, hideLoading, showToast, showConfirm } = require('../../utils/util')
const { isDownChangeRate } = require('../../utils/portfolio-summary')
const { createFundSearchManager } = require('../../utils/fund-search')

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    watchlist: [],
    searching: false,
    loading: true,
    loggedIn: false,
    hotFunds: [],
    hotSearchEnabled: true,
    searchFocused: false,
    sortField: 'change_rate',
    sortOrder: 'desc',
    isDemo: false,
    hotListScrolling: false
  },

  onLoad() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })

    this.searchManager = createFundSearchManager({
      page: this,
      limit: 10,
      onError(error) {
        console.error('搜索失败:', error)
      }
    })
    this.loadHotFunds()
  },

  onShow() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn, hotListScrolling: false })
    if (loggedIn) {
      const app = getApp()
      const cached = app.getWatchlistCache()
      if (cached) {
        const useDemo = cached.length === 0
        const displayList = useDemo ? this._getDemoWatchlist() : cached
        const sorted = this._sortWatchlist(displayList, this.data.sortField, this.data.sortOrder)
        this.setData({ watchlist: sorted, loading: false, isDemo: useDemo })
      } else {
        this.loadWatchlist()
      }
    } else {
      this.setData({
        loading: false,
        watchlist: [],
        isDemo: false
      })
    }
  },

  onUnload() {
    this.searchManager?.invalidate()
  },

  // 加载热搜基金
  async loadHotFunds() {
    try {
      const res = await get('/hot-search/funds', {}, { cacheTTL: 3600, forceRefresh: true })
      if (res && res.feature_enabled === false) {
        this.setData({ hotSearchEnabled: false, hotFunds: [] })
        return
      }
      if (res && res.data) {
        this.setData({ hotFunds: res.data })
      }
    } catch (error) {
      console.error('获取热搜基金失败:', error)
    }
  },

  // 加载自选列表
  async loadWatchlist() {
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      const watchlist = await get('/watchlist/')
      const formatted = (watchlist || []).map(item => ({
        ...item,
        added_at_formatted: this.formatDate(item.added_at),
        total_change_formatted: formatPercent(item.total_change_rate),
        nav_updated: !!item.nav_updated,
        change_rate_class: isDownChangeRate(item.change_rate) ? 'down' : 'up'
      }))
      // 如果已登录但无自选数据，使用 demo 数据展示
      const useDemo = formatted.length === 0
      const displayList = useDemo ? this._getDemoWatchlist() : formatted
      getApp().setWatchlistCache(displayList)
      const sorted = this._sortWatchlist(displayList, this.data.sortField, this.data.sortOrder)
      this.setData({ watchlist: sorted, loading: false, isDemo: useDemo })
      hideLoading()
    } catch (error) {
      hideLoading()
      console.error('加载自选失败:', error)
      this.setData({ loading: false })
    }
  },

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  },

  // 搜索框获得焦点
  onSearchFocus() {
    this.setData({ searchFocused: true })
  },

  // 跳转到搜索（聚焦搜索框）
  goToSearch() {
    this.setData({ searchFocused: true })
  },

  // 搜索框失去焦点
  onSearchBlur() {
    // 如果正在滚动热搜列表，延迟处理避免列表消失
    if (this.data.hotListScrolling) {
      this._blurTimer && clearTimeout(this._blurTimer)
      this._blurTimer = setTimeout(() => {
        this.setData({ searchFocused: false, hotListScrolling: false })
      }, 300)
      return
    }
    this.setData({ searchFocused: false })
  },

  // 热搜列表开始滚动
  onHotListScroll() {
    if (!this.data.hotListScrolling) {
      this.setData({ hotListScrolling: true })
    }
  },

  // 热搜列表触摸开始
  onHotListTouchStart() {
    this.setData({ hotListScrolling: true })
  },

  // 热搜列表触摸结束
  onHotListTouchEnd() {
    setTimeout(() => {
      this.setData({ hotListScrolling: false })
    }, 200)
  },

  // 搜索输入
  onSearchInput(e) {
    this.searchManager?.onInput(e)
  },

  // 搜索基金
  async searchFunds(keyword) {
    if (!this.searchManager) {
      return []
    }

    return this.searchManager.search(keyword)
  },

  // 跳转到基金详情
  goToFundDetail(e) {
    const { code } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/fund-detail/fund-detail?code=${code}`
    })
  },

  // 跳转到登录页
  goToLogin() {
    const app = getApp()
    app.goToLogin()
  },

  // 添加到自选
  async addToWatchlist(e) {
    if (!checkLogin()) return
    const { code, name } = e.currentTarget.dataset

    showLoading('添加中...')

    try {
      await post('/watchlist/', {
        fund_code: code,
        fund_name: name
      })
      hideLoading()
      showToast('已添加到自选')

      this.searchManager?.invalidate()
      this.searchManager?.clearResults()
      getApp().markWatchlistDirty()
      this.setData({ searchKeyword: '', searchFocused: false })
      this.loadWatchlist()
    } catch (error) {
      hideLoading()
      console.error('添加自选失败:', error)
    }
  },

  // 从自选移除
  async removeFromWatchlist(e) {
    if (!checkLogin()) return
    const { id, name } = e.currentTarget.dataset

    const confirmed = await showConfirm('确认移除', `确定要将 ${name} 从自选中移除吗？`)
    if (!confirmed) return

    showLoading('移除中...')

    try {
      await del(`/watchlist/${id}`)
      hideLoading()
      showToast('已从自选移除')
      getApp().markWatchlistDirty()
      this.loadWatchlist()
    } catch (error) {
      hideLoading()
      console.error('移除自选失败:', error)
    }
  },

  // 生成 demo 自选数据（已登录但无自选时展示）
  _getDemoWatchlist() {
    return [
      {
        id: 1,
        fund_code: '005827',
        fund_name: '易方达蓝筹精选混合',
        change_rate: '+1.85%',
        change_rate_class: 'up',
        total_change_rate: 8.56,
        total_change_formatted: '+8.56%',
        nav_updated: true,
        is_holding: true,
      },
      {
        id: 2,
        fund_code: '161725',
        fund_name: '招商中证白酒指数',
        change_rate: '-0.92%',
        change_rate_class: 'down',
        total_change_rate: -4.31,
        total_change_formatted: '-4.31%',
        nav_updated: false,
        is_holding: false,
      },
    ]
  },

  // 跳转到添加持仓
  goToAddFund(e) {
    if (!checkLogin()) return
    const { code, name } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/funds-add/funds-add?code=${code}&name=${encodeURIComponent(name)}`
    })
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '给你分享一只涨幅不错的基金~',
      path: '/pages/ranking/ranking',
      imageUrl: '/icons/logo.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: 'JJBond基金管家 - 发现好基金',
      imageUrl: '/icons/logo.png'
    }
  },

  // 按当日涨幅排序
  sortByToday() {
    this._toggleSort('change_rate')
  },

  // 按自选以来涨幅排序
  sortByTotal() {
    this._toggleSort('total_change_rate')
  },

  _toggleSort(field) {
    let order = 'desc'
    if (this.data.sortField === field) {
      order = this.data.sortOrder === 'desc' ? 'asc' : 'desc'
    }
    const sorted = this._sortWatchlist(this.data.watchlist, field, order)
    this.setData({ watchlist: sorted, sortField: field, sortOrder: order })
  },

  _sortWatchlist(list, field, order) {
    return [...list].sort((a, b) => {
      let va, vb
      if (field === 'change_rate') {
        va = this._parseRate(a.change_rate)
        vb = this._parseRate(b.change_rate)
      } else {
        va = a[field] ?? -Infinity
        vb = b[field] ?? -Infinity
      }
      return order === 'desc' ? vb - va : va - vb
    })
  },

  _parseRate(rateStr) {
    if (!rateStr) return -Infinity
    const num = parseFloat(rateStr.replace('%', ''))
    return isNaN(num) ? -Infinity : num
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadWatchlist().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
