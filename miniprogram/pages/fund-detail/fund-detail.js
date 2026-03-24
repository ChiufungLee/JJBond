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
    isHeld: false,  // 是否持有该基金
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
      // 先尝试从用户持仓中获取
      const summary = await get('/funds/calculate')
      const fundDetail = (summary?.fund_details || []).find(
        item => item.fund_code === fundCode
      )

      let formattedInfo = null
      let isHeld = false

      if (fundDetail) {
        // 用户持有该基金
        isHeld = true
        formattedInfo = this.formatFundInfo(fundDetail)
      } else {
        // 用户未持有该基金，从 fund_info 接口获取基本信息
        const fundInfo = await get(`/funds/fund_info/${fundCode}`)
        if (fundInfo) {
          isHeld = false
          // 获取历史净值数据
          const navHistory = await get(`/funds/fund_nav_history/${fundCode}?days=30`)
          formattedInfo = this.formatFundInfoBasic(fundInfo, navHistory || [])
        }
      }

      if (!formattedInfo) {
        hideLoading()
        showToast('未找到该基金信息')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      // 获取今日净值（最新一条数据）
      const recentChanges = formattedInfo.recent_changes || []
      const todayData = recentChanges.length > 0 ? recentChanges[0] : null

      this.setData({
        fundInfo: formattedInfo,
        isHeld,
        loading: false,
        'tooltip.date': todayData ? todayData.date : '今日',
        'tooltip.value': todayData ? parseFloat(todayData.unit_nav).toFixed(4) : ''
      })
      hideLoading()

      // 延迟绘制图表，确保 DOM 已渲染
      if (formattedInfo && formattedInfo.recent_changes) {
        setTimeout(() => {
          this.drawChart(formattedInfo.recent_changes, isHeld ? formattedInfo.cost_price : null)
        }, 100)
      }
    } catch (error) {
      hideLoading()
      console.error('加载基金详情失败:', error)
      this.setData({ loading: false })
    }
  },

  // 格式化基金信息（持有基金，包含持仓数据）
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

  // 格式化基金基本信息（未持有基金，只有基本数据）
  formatFundInfoBasic(info, navHistory = []) {
    if (!info) return null

    return {
      fund_code: info.fundcode || info.fund_code,
      fund_name: info.name || info.fund_name,
      change_rate: info.gszzl ? `${info.gszzl}%` : '--',
      // 未持有基金没有以下数据
      cost: null,
      cost_formatted: '--',
      shares: '--',
      cost_price: null,
      today_value: info.gsz || '--',
      today_revenue: null,
      today_revenue_formatted: '--',
      total_revenue: null,
      total_revenue_formatted: '--',
      profit_loss_ratio: null,
      profit_loss_ratio_formatted: '--',
      recent_changes: navHistory
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

      // 存储图表数据用于点击检测
      this.chartData = {
        categories,
        seriesData,
        originalData
      }

      // 构建系列数据
      const series = [{
        name: '净值',
        data: seriesData,
        format: (val) => val.toFixed(4)
      }]

      // 计算 Y 轴范围
      let allValues = [...seriesData]
      let minY, maxY

      // 如果有成本价，添加成本价线
      if (costPrice) {
        const costPriceData = new Array(categories.length).fill(costPrice)
        series.push({
          name: '成本价',
          data: costPriceData,
          format: (val) => val.toFixed(4),
          dashed: true,
          showPoints: false,
          color: '#ff7a45'
        })
        allValues = [...allValues, costPrice]
        minY = Math.min(...allValues) * 0.995
        maxY = Math.max(...allValues) * 1.005
      } else {
        minY = Math.min(...seriesData) * 0.995
        maxY = Math.max(...seriesData) * 1.005
      }

      new wxCharts({
        canvasId: 'fundChart',
        context: this,
        type: 'line',
        categories: categories,
        series: series,
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
