const Api = (() => {
  const BASE = '/api';
  const CACHE_TTL = 10000;
  const cache = new Map();
  const inflight = new Map();

  function getToken() {
    return localStorage.getItem('token');
  }

  function setToken(token) {
    localStorage.setItem('token', token);
  }

  function clearToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  }

  function setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  function buildHeaders(isForm = false) {
    const headers = {};
    if (!isForm) {
      headers['Content-Type'] = 'application/json';
    }
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function handleResponse(resp) {
    if (resp.status === 401) {
      clearToken();
      if (window.App && App.onUnauthorized) {
        App.onUnauthorized();
      }
      throw new Error('登录已过期，请重新登录');
    }
    const data = await resp.json();
    if (!resp.ok) {
      const msg = data.detail || data.message || `请求失败 (${resp.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function cacheKey(url) {
    return url;
  }

  async function request(method, path, body, options = {}) {
    const url = BASE + path;
    const isForm = options.form;

    if (method === 'GET') {
      const key = cacheKey(url);
      const cached = cache.get(key);
      if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
      }
      if (inflight.has(key)) {
        return inflight.get(key);
      }
      const promise = fetch(url, {
        method: 'GET',
        headers: buildHeaders(),
      }).then(handleResponse).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, promise);
      const data = await promise;
      cache.set(key, { data, time: Date.now() });
      return data;
    }

    const fetchOptions = {
      method,
      headers: buildHeaders(isForm),
    };

    if (body) {
      if (isForm) {
        const formData = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) {
          if (v != null) formData.append(k, v);
        }
        fetchOptions.body = formData;
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    const data = await fetch(url, fetchOptions).then(handleResponse);

    // Invalidate related cache on mutations
    if (method !== 'GET') {
      for (const key of cache.keys()) {
        if (key.includes('/funds') || key.includes('/watchlist')) {
          cache.delete(key);
        }
      }
    }

    return data;
  }

  return {
    getToken,
    setToken,
    clearToken,
    getUser,
    setUser,
    get: (path) => request('GET', path),
    post: (path, body, options) => request('POST', path, body, options),
    put: (path, body, options) => request('PUT', path, body, options),
    del: (path) => request('DELETE', path),
    clearCache: () => cache.clear(),
  };
})();
