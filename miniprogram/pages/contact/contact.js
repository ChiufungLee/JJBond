// pages/contact/contact.js
Page({
  data: {
    contactInfo: {
      email: 'support@jjbond.com',
      wechat: 'JJBond_Service'
    }
  },

  onLoad() {},

  // 复制到剪贴板
  copyToClipboard(e) {
    const { text } = e.currentTarget.dataset
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        })
      }
    })
  }
})
