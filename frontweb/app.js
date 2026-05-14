/* =============================================
   JJBond H5 - Core Application
   ============================================= */
const API_BASE = '/api';

/* ---- Utilities ---- */
function safeParse(v, fb = null) { try { return JSON.parse(v); } catch { return fb; } }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function parseNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function formatFixed(v, d = 2, fb = '-') { const n = parseNum(v); return n === null ? fb : n.toFixed(d); }
function formatMoney(v, d = 2, fb = '-') {
    const n = parseNum(v);
    if (n === null) return fb;
    return n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function formatSignedMoney(v, d = 2, fb = '-') {
    const n = parseNum(v);
    if (n === null) return fb;
    return (n >= 0 ? '+' : '') + '¥' + Math.abs(n).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function formatPercent(v, d = 2, fb = '-') {
    const n = parseNum(v);
    if (n === null) return fb;
    return (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
}
function hasNeg(v) { return String(v ?? '').trim().startsWith('-'); }
function trendClass(v) { const n = parseNum(v); return n !== null && n < 0 ? 'text-down' : 'text-up'; }
function profitClass(v) { const n = parseNum(v); return n !== null && n < 0 ? 'profit-negative' : 'profit-positive'; }
function formatDate(d, fmt) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt)) return '-';
    const pad = n => String(n).padStart(2, '0');
    const Y = dt.getFullYear(), M = pad(dt.getMonth()+1), D = pad(dt.getDate());
    if (fmt === 'YYYY-MM-DD') return `${Y}-${M}-${D}`;
    return `${Y}/${M}/${D}`;
}
function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function throttle(fn, ms = 100) { let last = 0; return (...a) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...a); }; }; }

/* ---- Toast ---- */
let toastTimer = null;
function showToast(msg, type = 'info', dur = 2500) {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = msg;
    el.className = 'toast ' + type + ' show';
    toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

/* ---- Modal ---- */
function showModal(html) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    if (!overlay || !box) return;
    box.innerHTML = html;
    overlay.classList.add('show');
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };
}
function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('show');
}
function showConfirm(text, onOk, okText = '确定', cancelText = '取消') {
    showModal(`
        <div class="confirm-dialog">
            <div class="cd-text">${escapeHtml(text)}</div>
            <div class="cd-actions">
                <button class="btn btn-outline" onclick="closeModal()">${escapeHtml(cancelText)}</button>
                <button class="btn btn-primary" id="confirmOkBtn">${escapeHtml(okText)}</button>
            </div>
        </div>
    `);
    document.getElementById('confirmOkBtn').onclick = () => { closeModal(); onOk(); };
}

/* ---- Auth ---- */
const Auth = {
    get token() { return localStorage.getItem('authToken'); },
    set token(v) { v ? localStorage.setItem('authToken', v) : localStorage.removeItem('authToken'); },
    get user() { return safeParse(localStorage.getItem('currentUser'), null); },
    set user(v) { v ? localStorage.setItem('currentUser', JSON.stringify(v)) : localStorage.removeItem('currentUser'); },
    get isLoggedIn() { return Boolean(this.token && this.user); },
    save(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem('last_login', new Date().toISOString());
        localStorage.setItem('token_expires_at', new Date(Date.now() + 30*60000).toISOString());
    },
    clear() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('last_login');
        localStorage.removeItem('token_expires_at');
    },
    check() {
        const exp = localStorage.getItem('token_expires_at');
        if (this.token && this.user && exp && Date.now() < Date.parse(exp)) return true;
        return false;
    }
};

/* ---- API Client ---- */
const apiCache = new Map();
const inflight = new Map();

async function apiRequest(url, options = {}, retry = true) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (Auth.token) headers['Authorization'] = 'Bearer ' + Auth.token;

    const resp = await fetch(API_BASE + url, { ...options, headers, credentials: 'same-origin' });

    if (resp.status === 401 && retry) {
        const refreshed = await refreshToken();
        if (refreshed) return apiRequest(url, options, false);
        Auth.clear();
        showToast('登录已过期', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 500);
        throw new Error('认证失败');
    }

    const ct = resp.headers.get('content-type') || '';
    let data = null;
    if (ct.includes('json')) { try { data = await resp.json(); } catch {} }
    else { try { const t = await resp.text(); data = t ? { detail: t } : null; } catch {} }

    if (!resp.ok) throw new Error(data?.detail || '请求失败');
    return data;
}

async function refreshToken() {
    try {
        const resp = await fetch(API_BASE + '/auth/refresh', { method: 'POST', credentials: 'same-origin' });
        if (!resp.ok) return false;
        const data = await resp.json();
        if (!data?.access_token) return false;
        Auth.token = data.access_token;
        localStorage.setItem('token_expires_at', new Date(Date.now() + 30*60000).toISOString());
        return true;
    } catch { return false; }
}

async function apiGet(url, params = {}, cacheTTL = 0) {
    const qs = new URLSearchParams(params).toString();
    const fullUrl = qs ? `${url}?${qs}` : url;
    const cacheKey = 'GET:' + fullUrl;

    if (cacheTTL > 0) {
        const cached = apiCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < cacheTTL) return cached.data;
    }

    if (inflight.has(cacheKey)) return inflight.get(cacheKey);

    const promise = apiRequest(fullUrl).finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, promise);

    const data = await promise;
    if (cacheTTL > 0) apiCache.set(cacheKey, { data, ts: Date.now() });
    return data;
}

function invalidateCache(pattern) {
    for (const key of apiCache.keys()) {
        if (key.includes(pattern)) apiCache.delete(key);
    }
}

async function apiPost(url, body) { return apiRequest(url, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(url, body) { return apiRequest(url, { method: 'PUT', body: JSON.stringify(body) }); }
async function apiDel(url) { return apiRequest(url, { method: 'DELETE' }); }

/* ---- Router ---- */
const Router = {
    currentTab: 'index',
    currentSub: null,
    pages: {},

    register(name, handler) { this.pages[name] = handler; },

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    },

    handleRoute() {
        const hash = location.hash.slice(1) || '/index';
        const [path, queryStr] = hash.split('?');
        const params = Object.fromEntries(new URLSearchParams(queryStr || ''));

        if (path.startsWith('/sub/')) {
            const subName = path.slice(5);
            this.showSub(subName, params);
        } else {
            const tabName = path.slice(1) || 'index';
            this.showTab(tabName, params);
        }
    },

    showTab(name, params = {}) {
        if (this.currentSub) {
            document.getElementById('subPage').classList.remove('active');
            this.currentSub = null;
        }

        const validTabs = ['index', 'watchlist', 'market', 'mine'];
        if (!validTabs.includes(name)) name = 'index';

        this.currentTab = name;

        // Toggle page visibility
        validTabs.forEach(t => {
            const el = document.getElementById('page-' + t);
            if (el) el.classList.toggle('hidden', t !== name);
        });

        // Toggle tab bar active
        document.querySelectorAll('.tab-item').forEach(el => {
            el.classList.toggle('active', el.dataset.tab === name);
        });

        // Show tab bar, set navbar title
        document.getElementById('tabBar').classList.remove('hidden');
        document.getElementById('pageContainer').classList.remove('no-tab');
        document.getElementById('navLeft').innerHTML = '';
        document.getElementById('navRight').innerHTML = '';

        const titles = { index: '基金管理', watchlist: '自选基金', market: '行情', mine: '我的' };
        document.getElementById('navTitle').textContent = titles[name] || '基金管理';

        // Render page
        const handler = this.pages[name];
        if (handler) handler(params);
    },

    showSub(name, params = {}) {
        this.currentSub = name;
        const subPage = document.getElementById('subPage');
        const content = document.getElementById('subPageContent');
        subPage.classList.add('active');
        document.getElementById('subNavRight').innerHTML = '';

        const titles = {
            'fund-detail': '基金详情', 'search': '搜索', 'calendar': '收益日历',
            'ranking': '排行榜', 'sector': '板块', 'sector-funds': '板块基金',
            'funds': '持仓分布', 'fund-manage': '基金管理'
        };
        document.getElementById('subNavTitle').textContent = titles[name] || '';
        document.getElementById('subBackBtn').onclick = () => history.back();

        const handler = this.pages['sub:' + name];
        if (handler) handler(content, params);
    },

    navigate(path) { location.hash = path; },
    back() { history.back(); }
};

/* ---- Tab Bar Events ---- */
document.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', () => {
        Router.navigate('/' + el.dataset.tab);
    });
});

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.isLoggedIn && !location.hash.includes('/sub/')) {
        // Check if user was trying to access a protected page
        if (!location.hash || location.hash === '#/' || location.hash === '#/index') {
            window.location.href = 'login.html';
            return;
        }
    }
    Router.init();
});

/* ---- Export to global ---- */
window.app = {
    Auth, Router, apiGet, apiPost, apiPut, apiDel, invalidateCache,
    showToast, showModal, closeModal, showConfirm,
    escapeHtml, parseNum, formatFixed, formatMoney, formatSignedMoney,
    formatPercent, hasNeg, trendClass, profitClass, formatDate,
    debounce, throttle
};
