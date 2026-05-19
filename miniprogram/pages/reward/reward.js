// pages/reward/reward.js
const { get } = require('../../utils/request')

Page({
  data: {
    announcements: [],
    loading: true
  },

  onLoad() {
    this.loadAnnouncements()
  },

  async loadAnnouncements() {
    try {
      const list = await get('/announcements/', { position: 1 }, { skipAuth: true })
      this.setData({ announcements: list || [], loading: false })
    } catch (e) {
      this.setData({ announcements: [], loading: false })
    }
  }
})
