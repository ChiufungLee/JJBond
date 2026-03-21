// pages/calendar/calendar.js
Page({
  data: {
    calendarData: [],
    loading: true
  },

  onLoad() {
    this.loadCalendarData()
  },

  async loadCalendarData() {
    // TODO: 从后端获取收益日历数据
    this.setData({
      calendarData: [],
      loading: false
    })
  },

  onPullDownRefresh() {
    this.loadCalendarData().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
