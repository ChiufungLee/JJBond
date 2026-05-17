const Utils = {
  formatMoney(n, decimals = 2) {
    if (n == null || isNaN(n)) return '--';
    const num = Number(n);
    const fixed = Math.abs(num).toFixed(decimals);
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (num < 0 ? '-' : '') + parts.join('.');
  },

  // Parse "1.25%" string to 1.25 number, or return null
  parseChangeStr(s) {
    if (s == null || s === '--') return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  },

  formatPercent(n, decimals = 2) {
    if (n == null || isNaN(n)) return '--';
    const num = Number(n);
    const sign = num > 0 ? '+' : '';
    return sign + num.toFixed(decimals) + '%';
  },

  formatChange(n, decimals = 4) {
    if (n == null || isNaN(n)) return '--';
    const num = Number(n);
    const sign = num > 0 ? '+' : '';
    return sign + num.toFixed(decimals);
  },

  formatDate(date, fmt = 'YYYY-MM-DD') {
    if (!date) return '--';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--';
    const map = {
      'YYYY': d.getFullYear(),
      'MM': String(d.getMonth() + 1).padStart(2, '0'),
      'DD': String(d.getDate()).padStart(2, '0'),
      'HH': String(d.getHours()).padStart(2, '0'),
      'mm': String(d.getMinutes()).padStart(2, '0'),
      'ss': String(d.getSeconds()).padStart(2, '0'),
    };
    let result = fmt;
    for (const [k, v] of Object.entries(map)) {
      result = result.replace(k, v);
    }
    return result;
  },

  getChangeClass(value) {
    if (value == null || isNaN(value)) return '';
    return Number(value) >= 0 ? 'text-up' : 'text-down';
  },

  isUp(value) {
    if (value == null) return false;
    return Number(value) >= 0;
  },

  debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  throttle(fn, ms = 100) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(this, args);
      }
    };
  },

  showToast(msg, type = 'success', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
      if (!container.children.length) container.remove();
    }, duration);
  },

  showLoading(text = '加载中...') {
    let overlay = document.getElementById('global-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-loading';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
      overlay.innerHTML = `<div class="loading-wrap"><div class="loading-spinner"></div><span>${text}</span></div>`;
      document.body.appendChild(overlay);
    }
  },

  hideLoading() {
    const overlay = document.getElementById('global-loading');
    if (overlay) overlay.remove();
  },

  daysSince(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - d) / (1000 * 60 * 60 * 24));
  },

  formatFlowYi(value) {
    if (value == null || isNaN(value)) return '--';
    const yi = Number(value) / 100000000;
    const sign = yi > 0 ? '+' : '';
    return sign + yi.toFixed(2) + '亿';
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};
