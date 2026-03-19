// pages/fund-detail/fund-detail.js
const { get } = require('../../utils/request')
const { formatMoney, formatPercent, showLoading, hideLoading, showToast } = require('../../utils/util')
let wxCharts = null

Page({
  data: {
    fundCode: '',
    fundInfo: null,
    loading: true,
    hideAmount: false,
    tooltip: {
      show: false,
      date: '今日',
      value: '',
      x: 0,
      y: 0
    }
  },

  // 存储图表数据用于点击检测
  chartData: null,
  chartPoints: null,

  onLoad(options) {
    const { code } = options
    if (!code) {
      showToast('参数错误')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 读取隐藏金额状态
    const hideAmount = wx.getStorageSync('hideAmount') || false
    this.setData({ fundCode: code, hideAmount })
  },

  onShow() {
    this.loadFundDetail()
  },

  onReady() {
    // 动态加载wx-charts
    try {
      wxCharts = require('../../libs/wx-charts.js')
    } catch (e) {
      console.warn('wx-charts加载失败:', e)
    }
  },

  // 加载基金详情
  async loadFundDetail() {
    const { fundCode } = this.data
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      // 从 /funds/calculate 获取用户的持仓数据
      const summary = await get('/funds/calculate')

      // 在 fund_details 中找到对应的基金
      const fundDetail = (summary?.fund_details || []).find(
        item => item.fund_code === fundCode
      )

      if (!fundDetail) {
        hideLoading()
        showToast('未找到该基金持仓')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const formattedInfo = this.formatFundInfo(fundDetail)

      // 获取今日净值（最新一条数据）
      const recentChanges = formattedInfo.recent_changes || []
      const todayData = recentChanges.length > 0 ? recentChanges[0] : null

      this.setData({
        fundInfo: formattedInfo,
        loading: false,
        'tooltip.date': todayData ? todayData.date : '今日',
        'tooltip.value': todayData ? parseFloat(todayData.unit_nav).toFixed(4) : ''
      })
      hideLoading()

      // 延迟绘制图表，确保 DOM 已渲染
      if (formattedInfo && formattedInfo.recent_changes) {
        setTimeout(() => {
          this.drawChart(formattedInfo.recent_changes, formattedInfo.cost_price)
        }, 100)
      }
    } catch (error) {
      hideLoading()
      console.error('加载基金详情失败:', error)
      this.setData({ loading: false })
    }
  },

  // 格式化基金信息
  formatFundInfo(info) {
    if (!info) return null

    return {
      ...info,
      cost_formatted: formatMoney(info.cost),
      amount_formatted: formatMoney(info.amount),
      today_revenue_formatted: formatMoney(info.today_revenue),
      total_revenue_formatted: formatMoney(info.total_revenue),
      profit_loss_ratio_formatted: formatPercent(info.profit_loss_ratio),
      shangrijingzhi_formatted: formatMoney(info.shangrijingzhi, 4)
    }
  },

  // 绘制图表
  drawChart(data, costPrice) {
    if (!wxCharts || !data || data.length === 0) return

    try {
      // 准备数据 - recent_changes 的数据结构是 { date, unit_nav, daily_growth }
      const categories = data.map(item => item.date || '').reverse()
      const seriesData = data.map(item => parseFloat(item.unit_nav) || 0).reverse()
      const originalData = [...data].reverse()

      // 成本价数据（每个点都是相同的成本价）
      const costPriceData = new Array(categories.length).fill(costPrice)

      // 计算 Y 轴范围，需要考虑成本价
      const allValues = [...seriesData, costPrice]
      const minY = Math.min(...allValues) * 0.995
      const maxY = Math.max(...allValues) * 1.005

      // 存储图表数据用于点击检测
      this.chartData = {
        categories,
        seriesData,
        originalData
      }

      new wxCharts({
        canvasId: 'fundChart',
        context: this,
        type: 'line',
        categories: categories,
        series: [{
          name: '净值',
          data: seriesData,
          format: (val) => val.toFixed(4)
        }, {
          name: '成本价',
          data: costPriceData,
          format: (val) => val.toFixed(4),
          dashed: true,      // 虚线
          showPoints: false, // 不显示数据点
          color: '#ff7a45'   // 橙色
        }],
        yAxis: {
          title: '净值',
          format: (val) => val.toFixed(2),
          min: minY,
          max: maxY
        },
        dataPointShape: true,
        onSuccess: (points) => {
          // 存储点坐标用于点击检测（只取净值线的点）
          this.chartPoints = points
          console.log('图表绘制成功，点数:', points ? points.length : 0)
          if (points && points.length > 0) {
            console.log('第一个点:', points[0])
          }
        }
      })
    } catch (e) {
      console.error('绘制图表失败:', e)
    }
  },

  // 处理图表触摸开始
  handleChartTouchStart(e) {
    this.updateTooltipPosition(e)
  },

  // 处理图表触摸移动
  handleChartTouchMove(e) {
    this.updateTooltipPosition(e)
  },

  // 处理图表触摸结束
  handleChartTouchEnd(e) {
    // 3秒后自动隐藏
    setTimeout(() => {
      this.setData({
        'tooltip.show': false,
      })
    }, 3000)
  },

  // 更新 tooltip 位置
  updateTooltipPosition(e) {
    if (!this.chartData || !this.chartPoints) {
      return
    }

    // 获取触摸点相对于 canvas 的坐标
    const touch = e.touches[0] || e.changedTouches[0]
    if (!touch) return

    const query = wx.createSelectorQuery().in(this)
    query.select('.chart-container').boundingClientRect((rect) => {
      if (!rect) return

      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      const points = this.chartPoints
      const { categories, seriesData } = this.chartData

      // 查找最近的点（基于 x 坐标）
      let nearestIndex = 0
      let minDist = Math.abs(x - points[0].x)

      points.forEach((point, index) => {
        const dist = Math.abs(x - point.x)
        if (dist < minDist) {
          minDist = dist
          nearestIndex = index
        }
      })

      if (nearestIndex >= 0) {
        const pointX = points[nearestIndex].x
        const pointY = points[nearestIndex].y

        // 计算提示框位置，确保不超出边界
        let tooltipX = pointX - 60
        let tooltipY = pointY > 50 ? pointY - 50 : 10

        this.setData({
          tooltip: {
            show: true,
            date: categories[nearestIndex],
            value: seriesData[nearestIndex].toFixed(4),
            x: pointX,
            y: pointY,
            tooltipX: tooltipX,
            tooltipY: tooltipY
          }
        })
      }
    }).exec()
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadFundDetail().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 切换隐藏金额
  toggleHideAmount() {
    const hideAmount = !this.data.hideAmount
    this.setData({ hideAmount })
    wx.setStorageSync('hideAmount', hideAmount)
  }
})
