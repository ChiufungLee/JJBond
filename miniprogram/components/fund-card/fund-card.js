// components/fund-card/fund-card.js
Component({
  properties: {
    fund: {
      type: Object,
      value: {}
    }
  },

  data: {
    defaultFund: {
      fund_name: '',
      fund_code: '',
      today_revenue: 0,
      change_rate: '0.00%'
    }
  },

  methods: {
    onTap() {
      const fund = this.properties.fund
      this.triggerEvent('tap', { fund })
    }
  }
})
