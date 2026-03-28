// pages/profile-edit/profile-edit.js
const { updateUserInfo } = require('../../utils/request')
const { checkLogin, getUserInfo, getToken, saveLoginInfo } = require('../../utils/auth')
const { showToast } = require('../../utils/util')

Page({
  data: {
    nickname: '',
    loading: false,
    canSubmit: false
  },

  onLoad() {
    if (!checkLogin()) {
      return
    }

    const userInfo = getUserInfo()
    const nickname = userInfo?.nickname || ''
    this.setData({
      nickname,
      canSubmit: nickname.trim().length >= 1
    })
  },

  onNicknameInput(e) {
    const nickname = e.detail.value
    this.setData({
      nickname,
      canSubmit: nickname.trim().length >= 1
    })
  },

  async handleSave() {
    const { nickname } = this.data
    const trimmedNickname = nickname.trim()

    if (!trimmedNickname) {
      showToast('请输入昵称')
      return
    }

    this.setData({ loading: true })

    try {
      // 调用更新接口
      const res = await updateUserInfo({
        nickname: trimmedNickname
      })

      // 更新本地存储的用户信息
      const userInfo = getUserInfo()
      const token = getToken()
      saveLoginInfo(token, {
        ...userInfo,
        nickname: res.nickname
      })

      showToast('修改成功')

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (error) {
      console.error('修改用户信息失败:', error)
      showToast(error.message || '修改失败，请稍后重试')
    } finally {
      this.setData({ loading: false })
    }
  }
})
