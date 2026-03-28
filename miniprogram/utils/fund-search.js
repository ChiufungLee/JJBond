const { get } = require('./request')
const { debounce } = require('./util')

const createFundSearchManager = ({
  page,
  limit = 10,
  keywordKey = 'searchKeyword',
  resultsKey = 'searchResults',
  searchingKey = 'searching',
  searchedKey = null,
  minKeywordLength = 2,
  debounceDelay = 500,
  onSuccess,
  onError
}) => {
  let requestId = 0

  const clearResults = () => {
    const nextState = {
      [resultsKey]: [],
      [searchingKey]: false
    }

    if (searchedKey) {
      nextState[searchedKey] = false
    }

    page.setData(nextState)
  }

  const search = async (keyword, overrides = {}) => {
    const trimmedKeyword = (keyword || '').trim()
    const searchLimit = overrides.limit || limit

    page.setData({
      [keywordKey]: trimmedKeyword
    })

    if (trimmedKeyword.length < minKeywordLength) {
      clearResults()
      return []
    }

    requestId += 1
    const currentRequestId = requestId

    const pendingState = {
      [searchingKey]: true
    }

    if (searchedKey) {
      pendingState[searchedKey] = false
    }

    page.setData(pendingState)

    try {
      const results = await get('/funds/search', { q: trimmedKeyword, limit: searchLimit })

      if (currentRequestId !== requestId) {
        return []
      }

      const list = results || []
      const successState = {
        [resultsKey]: list,
        [searchingKey]: false
      }

      if (searchedKey) {
        successState[searchedKey] = true
      }

      page.setData(successState)

      if (onSuccess) {
        onSuccess(list, trimmedKeyword)
      }

      return list
    } catch (error) {
      if (currentRequestId !== requestId) {
        return []
      }

      const errorState = {
        [searchingKey]: false
      }

      if (searchedKey) {
        errorState[searchedKey] = true
      }

      page.setData(errorState)

      if (onError) {
        onError(error, trimmedKeyword)
      }

      throw error
    }
  }

  const onInput = debounce(function(e) {
    const keyword = e.detail.value.trim()
    search(keyword).catch(() => {})
  }, debounceDelay)

  const invalidate = () => {
    requestId += 1
  }

  return {
    search,
    onInput,
    clearResults,
    invalidate
  }
}

module.exports = {
  createFundSearchManager
}
