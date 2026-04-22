const { formatMoney, formatPercent } = require('./util')

const isDownChangeRate = (changeRate) => {
  return (changeRate && changeRate[0] === '-') || changeRate === '0' || changeRate === '0.00%' || changeRate === '--'
}

const normalizeFundDetail = (item) => ({
  ...item,
  cost_formatted: formatMoney(item.cost),
  amount_formatted: formatMoney(item.amount),
  today_revenue_formatted: item.today_revenue !== null ? formatMoney(item.today_revenue) : '--',
  total_revenue_formatted: item.total_revenue !== null ? formatMoney(item.total_revenue) : '--',
  profit_loss_ratio_formatted: item.profit_loss_ratio !== null ? formatPercent(item.profit_loss_ratio) : '--',
  change_rate: item.change_rate || '--',
  change_rate_class: isDownChangeRate(item.change_rate || '--') ? 'down' : 'up',
  nav_updated: !!item.nav_updated
})

const formatPortfolioSummary = (summary) => {
  if (!summary) {
    return null
  }

  const totalRevenue = summary.today_holding_amount - summary.total_cost

  return {
    ...summary,
    total_cost_formatted: formatMoney(summary.total_cost),
    yesterday_holding_amount_formatted: formatMoney(summary.yesterday_holding_amount),
    yesterday_holding_income_formatted: formatMoney(summary.yesterday_holding_income),
    today_revenue_formatted: formatMoney(summary.today_revenue),
    today_holding_amount_formatted: formatMoney(summary.today_holding_amount),
    today_revenue_percent: summary.yesterday_holding_amount > 0
      ? ((summary.today_revenue / summary.yesterday_holding_amount) * 100).toFixed(2)
      : '0.00',
    total_revenue: totalRevenue,
    total_revenue_percent: summary.total_cost > 0
      ? ((totalRevenue / summary.total_cost) * 100).toFixed(2)
      : '0.00',
    total_revenue_formatted: formatMoney(totalRevenue),
    fund_details: (summary.fund_details || []).map(normalizeFundDetail)
  }
}

module.exports = {
  formatPortfolioSummary,
  normalizeFundDetail,
  isDownChangeRate
}
