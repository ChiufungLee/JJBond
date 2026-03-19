/**
 * wx-charts 微信小程序图表工具
 * 使用 Canvas 2D 接口
 */

// 配置
const config = {
  yAxisSplit: 5,
  padding: 0,           // 减少内边距
  yAxisWidth: 45,       // Y轴宽度
  xAxisHeight: 30,
  fontSize: 10,
  colors: ['#722ed1', '#2fc25b', '#facc14', '#f04864', '#8543e0', '#13c2c2']
};

/**
 * 绘制折线图
 * @param {Object} opts - 配置选项
 * @param {string} opts.canvasId - canvas ID
 * @param {Object} opts.context - 页面上下文 (this)
 * @param {number} opts.width - 宽度
 * @param {number} opts.height - 高度
 * @param {Array} opts.categories - X轴类别
 * @param {Array} opts.series - 数据系列
 */
async function drawLineChart(opts) {
  const { canvasId, context, categories, series, yAxis, dataPointShape } = opts;

  // 获取 canvas 节点
  const query = wx.createSelectorQuery().in(context);
  const res = await new Promise((resolve, reject) => {
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((data) => {
        if (data && data[0]) {
          resolve(data[0]);
        } else {
          reject(new Error('Canvas节点未找到'));
        }
      });
  });

  const canvas = res.node;
  const ctx = canvas.getContext('2d');

  // 使用 canvas 实际尺寸
  const width = res.width;
  const height = res.height;

  // 设置 canvas 尺寸（考虑设备像素比）
  const dpr = wx.getSystemInfoSync().pixelRatio;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 计算图表区域 - 右侧留出一点空间避免标签被截断
  const chartWidth = width - config.padding * 2 - config.yAxisWidth - 10;
  const chartHeight = height - config.padding * 2 - config.xAxisHeight;

  // 收集所有数据
  let allData = [];
  series.forEach(s => {
    allData = allData.concat(s.data);
  });

  // 计算Y轴范围
  let min = yAxis && yAxis.min !== undefined ? yAxis.min : Math.min(...allData);
  let max = yAxis && yAxis.max !== undefined ? yAxis.max : Math.max(...allData);

  // 确保范围有效
  if (min === max) {
    min = min * 0.9;
    max = max * 1.1;
  }
  const range = max - min;

  // 绘制Y轴网格线和标签
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.font = `${config.fontSize}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= config.yAxisSplit; i++) {
    const y = config.padding + (chartHeight / config.yAxisSplit) * i;
    const value = max - (range / config.yAxisSplit) * i;

    // 绘制网格线
    ctx.beginPath();
    ctx.moveTo(config.padding + config.yAxisWidth, y);
    ctx.lineTo(width - config.padding, y);
    ctx.stroke();

    // 绘制Y轴标签
    ctx.fillStyle = '#999999';
    const label = yAxis && yAxis.format ? yAxis.format(value) : value.toFixed(2);
    ctx.fillText(label, config.padding + config.yAxisWidth - 5, y);
  }

  // 绘制数据线
  const colors = config.colors;
  const allPoints = [];  // 收集所有点坐标

  series.forEach((s, seriesIndex) => {
    const data = s.data;
    const color = s.color || colors[seriesIndex % colors.length];  // 支持自定义颜色
    const isDashed = s.dashed === true;
    const showPoints = s.showPoints !== false;  // 默认显示数据点

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    // 设置虚线
    if (isDashed) {
      ctx.setLineDash([5, 5]);  // 5px实线，5px空白
    } else {
      ctx.setLineDash([]);  // 实线
    }

    // 计算点坐标
    const points = data.map((d, dataIndex) => {
      const x = config.padding + config.yAxisWidth + (chartWidth / Math.max(data.length - 1, 1)) * dataIndex;
      const y = config.padding + chartHeight - ((d - min) / range) * chartHeight;
      return { x, y };
    });

    // 收集点坐标（只收集第一个系列，用于tooltip）
    if (seriesIndex === 0) {
      allPoints.push(...points);
    }

    // 绘制折线
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    // 重置虚线设置
    ctx.setLineDash([]);

    // 绘制数据点（虚线不绘制数据点）
    if (showPoints && dataPointShape !== false && !isDashed) {
      ctx.fillStyle = color;
      points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  });

  // 返回点坐标给调用方
  if (opts.onSuccess && allPoints.length > 0) {
    opts.onSuccess(allPoints);
  }

  // 绘制X轴标签
  ctx.fillStyle = '#999999';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const dataLength = series[0]?.data?.length || categories.length;
  const skipStep = Math.ceil(categories.length / 6); // 最多显示6个标签

  categories.forEach((category, index) => {
    const isLast = index === categories.length - 1;
    // 检查是否与最后一个标签太近（间隔小于skipStep的一半则跳过）
    const tooCloseToEnd = isLast ? false : (categories.length - 1 - index) < Math.floor(skipStep / 2);

    if (dataLength <= 6 || (index % skipStep === 0 && !tooCloseToEnd) || isLast) {
      const x = config.padding + config.yAxisWidth + (chartWidth / Math.max(categories.length - 1, 1)) * index;
      // 简化日期显示（只显示月-日）
      const label = category.length > 5 ? category.substring(5) : category;
      ctx.fillText(label, x, height - config.padding - config.xAxisHeight + 10);
    }
  });
}

// 主类
function WXCharts(opts) {
  this.opts = opts;
  this.canvasId = opts.canvasId;
  this.type = opts.type;
  this.context = opts.context;

  this.init();
}

WXCharts.prototype = {
  constructor: WXCharts,

  async init() {
    switch (this.type) {
      case 'line':
        try {
          await drawLineChart(this.opts);
        } catch (e) {
          console.error('绘制图表失败:', e);
        }
        break;
      default:
        console.warn('不支持的图表类型:', this.type);
    }
  },

  async updateData(data) {
    this.opts.series = data.series || this.opts.series;
    this.opts.categories = data.categories || this.opts.categories;
    try {
      await drawLineChart(this.opts);
    } catch (e) {
      console.error('更新图表失败:', e);
    }
  }
};

module.exports = WXCharts;
