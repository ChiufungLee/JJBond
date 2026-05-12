const { post } = require('../../utils/request')
const { checkLogin } = require('../../utils/auth')

Page({
  data: {
    content: '',
    count: 0,
    canSubmit: false,
    submitting: false
  },

  onInput(e) {
    const content = e.detail.value
    this.setData({
      content,
      count: content.length,
      canSubmit: content.trim().length > 0
    })
  },

  async handleSubmit() {
    if (!checkLogin()) return

    const { content } = this.data
    const trimmed = content.trim()
    if (!trimmed) return

    this.setData({ submitting: true })

    try {
      await post('/feedback/', { content: trimmed })
      wx.showToast({ title: '感谢你的建议', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
