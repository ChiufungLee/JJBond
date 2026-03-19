// components/summary-card/summary-card.js
Component({
  properties: {
    summary: {
      type: Object,
      value: null
    }
  },

  data: {
    defaultSummary: {
      today_revenue: 0,
      today_revenue_formatted: '0.00',
      today_revenue_percent: '0.00',
      total_cost: 0,
      today_holding_amount: 0,
      fund_count: 0
    }
  },

  methods: {
    onTap() {
      this.triggerEvent('tap')
    }
  }
})
