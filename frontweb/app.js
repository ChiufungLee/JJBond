const API_BASE_URL = '/api';

function safeParseJSON(value, fallback = null) {
    if (!value) return fallback;

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function parseNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function formatFixed(value, digits = 2, fallback = '-') {
    const num = parseNumber(value);
    return num === null ? fallback : num.toFixed(digits);
}

function formatDate(value, fallback = '-') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
}

function hasNegativeSign(value) {
    return String(value ?? '').trim().startsWith('-');
}

function formatCurrency(value, digits = 2, fallback = '-') {
    const num = parseNumber(value);
    return num === null ? fallback : `¥${num.toFixed(digits)}`;
}

function formatSignedCurrency(value, digits = 2, fallback = '-') {
    const num = parseNumber(value);
    return num === null ? fallback : `${num >= 0 ? '+' : ''}¥${num.toFixed(digits)}`;
}

function formatSignedPercent(value, digits = 2, fallback = '-') {
    const num = parseNumber(value);
    return num === null ? fallback : `${num >= 0 ? '+' : ''}${num.toFixed(digits)}%`;
}

function getProfitClass(value, defaultClass = 'profit-positive') {
    const num = parseNumber(value);
    if (num === null) return defaultClass;
    return num < 0 ? 'profit-negative' : 'profit-positive';
}

class FundManagerApp {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.token = localStorage.getItem('authToken');
        this.currentUser = safeParseJSON(localStorage.getItem('currentUser'), null);
        this.searchCache = {};
        this.selectedFund = null;
        this.chart = null; // 存储当前图表实例
        this.currentPortfolioSummary = null; // 添加这个属性来存储当前的数据
        this.currentView = 'portfolio';
        this.messageTimer = null;

        // 检查登录状态
        this.checkAuthStatus();
        this.init();
    }

    init() {
        if (!this.isAuthenticated) {
            // 未登录，跳转到登录页面
            window.location.href = 'login.html';
            // this.showUnauthenticatedUI();
            return;
        }
        
        this.bindEvents();
        this.showAuthenticatedUI();
        this.calculatePortfolio();
    }

    checkAuthStatus() {
        const token = localStorage.getItem('authToken');
        const parsedUser = safeParseJSON(localStorage.getItem('currentUser'), null);
        const expiresAt = localStorage.getItem('token_expires_at');
        const expiresAtMs = Date.parse(expiresAt || '');

        if (token && parsedUser && Number.isFinite(expiresAtMs)) {
            // 校验 token 是否在有效期内（与后端 ACCESS_TOKEN_EXPIRE_MINUTES=30 一致）
            if (Date.now() < expiresAtMs) {
                this.token = token;
                this.currentUser = parsedUser;
                this.isAuthenticated = true;
                return;
            }
        }

        this.clearAuth();
    }

    bindEvents() {
        // 导航按钮事件
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        document.getElementById('addFundBtn').addEventListener('click', () => this.showAddFundModal());
        document.getElementById('viewFundsBtn').addEventListener('click', () => this.showFundsList());
        document.getElementById('refreshPortfolioBtn').addEventListener('click', () => this.refreshPortfolioWithMessage());
        document.getElementById('backToPortfolioBtn').addEventListener('click', () => this.showPortfolioView());
        document.getElementById('viewWatchlistBtn').addEventListener('click', () => this.showWatchlistPage());
        document.getElementById('addToWatchlistBtn').addEventListener('click', () => this.showAddWatchlistModal());
        document.getElementById('backToPortfolioFromWatchlistBtn').addEventListener('click', () => this.showPortfolioView());
        document.addEventListener('click', (e) => this.handleDocumentClick(e));

        // 如果有登录/注册重定向按钮（在未登录状态显示）
        const loginRedirectBtn = document.getElementById('loginRedirectBtn');
        const registerRedirectBtn = document.getElementById('registerRedirectBtn');

        if (loginRedirectBtn) {
            loginRedirectBtn.addEventListener('click', () => {
                window.location.href = 'login.html';
            });
        }

        if (registerRedirectBtn) {
            registerRedirectBtn.addEventListener('click', () => {
                window.location.href = 'register.html';
            });
        }
    }

    async refreshPortfolioWithMessage() {
        
        // 获取刷新按钮，用于显示加载状态
        const refreshBtn = document.getElementById('refreshPortfolioBtn');
        const originalText = refreshBtn ? refreshBtn.textContent : '刷新收益';
        
        try {
            // 显示加载状态
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<span class="loading-spinner"></span>刷新中...';
                refreshBtn.classList.add('loading');
            }
            
            this.showMessage('正在刷新基金数据，请稍候...', 'info');
            
            // 执行刷新
            await this.calculatePortfolio();
            
            // 显示成功消息
            this.showMessage('收益刷新成功！', 'success');
            
        } catch (error) {
            console.error('刷新收益失败:', error);
        } finally {
            // 恢复按钮状态
            if (refreshBtn) {
                setTimeout(() => {
                    refreshBtn.disabled = false;
                    refreshBtn.textContent = originalText;
                    refreshBtn.classList.remove('loading');
                }, 500); // 延迟恢复，确保用户看到状态变化
            }
        }
    }

    // 兼容旧调用，统一委托给 updateViewState
    setButtonVisibilityForPortfolio() {
        this.updateViewState('portfolio');
    }

    setButtonVisibilityForFundsList() {
        this.updateViewState('funds');
    }

    setButtonVisibilityForWatchlist() {
        this.updateViewState('watchlist');
    }

    showAuthenticatedUI() {
        
        // 显示已登录界面，隐藏未登录界面
        const loggedOutSection = document.getElementById('loggedOutSection');
        const fundsPage = document.getElementById('fundsPage');
        
        if (loggedOutSection) {
            loggedOutSection.classList.add('hidden');
        }
        
        if (fundsPage) {
            fundsPage.classList.remove('hidden');
        }
        
        // 更新用户信息
        const userInfo = document.getElementById('userInfo');
        if (userInfo && this.currentUser) {
            userInfo.textContent = `欢迎你，${this.currentUser.username}`;
            userInfo.classList.remove('hidden');
        }
        
        // 显示退出按钮
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        this.updateViewState('portfolio');
    }

    showUnauthenticatedUI() {
        
        // 显示未登录界面，隐藏已登录界面
        const loggedOutSection = document.getElementById('loggedOutSection');
        const fundsPage = document.getElementById('fundsPage');
        
        if (loggedOutSection) {
            loggedOutSection.classList.remove('hidden');
        }
        
        if (fundsPage) {
            fundsPage.classList.add('hidden');
        }
        
        // 隐藏用户信息和退出按钮
        const userInfo = document.getElementById('userInfo');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (userInfo) userInfo.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        

    }

    updateViewState(view) {
        this.currentView = view;

        const pages = {
            portfolio: document.getElementById('portfolioPage'),
            funds: document.getElementById('fundsListPage'),
            watchlist: document.getElementById('watchlistPage')
        };

        Object.entries(pages).forEach(([key, element]) => {
            if (!element) return;
            element.classList.toggle('hidden', key !== view);
        });

        const buttonRules = {
            viewFundsBtn: view === 'portfolio',
            refreshPortfolioBtn: view === 'portfolio',
            addFundBtn: view !== 'watchlist',
            backToPortfolioBtn: view === 'funds',
            viewWatchlistBtn: view === 'portfolio',
            addToWatchlistBtn: view === 'watchlist',
            backToPortfolioFromWatchlistBtn: view === 'watchlist'
        };

        Object.entries(buttonRules).forEach(([id, visible]) => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.toggle('hidden', !visible);
            }
        });
    }

    handleDocumentClick(event) {
        const searchPairs = [
            ['searchResults', 'fundSearch'],
            ['watchlistSearchResults', 'watchlistFundSearch']
        ];

        searchPairs.forEach(([resultsId, inputId]) => {
            const searchResults = document.getElementById(resultsId);
            const searchInput = document.getElementById(inputId);

            if (!searchResults || !searchInput) return;
            if (searchResults.contains(event.target) || event.target === searchInput) return;

            searchResults.classList.remove('show');
        });
    }

    // 显示基金列表
    showFundsList() {
        this.updateViewState('funds');
        this.loadFunds();
    }

    // 显示投资组合概览
    showPortfolioView() {
        this.updateViewState('portfolio');

        // 已有缓存数据则直接渲染，无需重新请求
        if (this.currentPortfolioSummary) {
            this.displayPortfolioSummary(this.currentPortfolioSummary);
        } else {
            this.calculatePortfolio();
        }
    }

    // 显示自选基金页面
    showWatchlistPage() {
        this.updateViewState('watchlist');
        this.loadWatchlist();
    }

    // 加载自选基金列表
    async loadWatchlist() {
        const container = document.getElementById('watchlistContainer');
        if (!container) return;

        container.innerHTML = '<div class="loading-state">加载中...</div>';

        try {
            const watchlist = await this.makeRequest('/watchlist/');
            this.displayWatchlist(watchlist);
        } catch (error) {
            console.error('加载自选失败:', error);
            container.innerHTML = '<div class="no-data">加载自选基金失败，请稍后重试</div>';
        }
    }

    // 显示自选基金列表
    displayWatchlist(watchlist) {
        const container = document.getElementById('watchlistContainer');
        if (!container) return;

        if (!watchlist || watchlist.length === 0) {
            container.innerHTML = `
                <div class="no-funds">
                    <p>暂无自选基金</p>
                    <p class="no-funds-hint">点击"添加自选"开始关注您感兴趣的基金</p>
                </div>
            `;
            return;
        }

        const normalizedWatchlist = watchlist.map((item) => {
            const totalChangeRate = parseNumber(item.total_change_rate);
            return {
                ...item,
                safeFundCode: escapeHtml(item.fund_code || '-'),
                safeFundName: escapeHtml(item.fund_name || '-'),
                isHolding: Boolean(item.is_holding),
                addedAt: formatDate(item.added_at),
                currentNavText: formatFixed(item.current_nav, 4),
                costNavText: formatFixed(item.cost_nav, 4),
                changeRateText: item.change_rate || '--',
                changeRateClass: hasNegativeSign(item.change_rate) ? 'profit-negative' : 'profit-positive',
                totalChangeClass: (totalChangeRate ?? 0) >= 0 ? 'profit-positive' : 'profit-negative',
                totalChangeDisplay: totalChangeRate === null ? '--' : `${totalChangeRate >= 0 ? '+' : ''}${totalChangeRate.toFixed(2)}%`
            };
        });

        const tableRows = normalizedWatchlist.map(item => `
                <tr>
                    <td class="fund-code">${item.safeFundCode}</td>
                    <td class="fund-name">${item.safeFundName}</td>
                    <td>${item.isHolding ? '<span class="holding-tag">已持有</span>' : '<span class="not-holding-tag">未持有</span>'}</td>
                    <td>${item.addedAt}</td>
                    <td>${item.costNavText}</td>
                    <td>${item.currentNavText}</td>
                    <td class="${item.changeRateClass}">${escapeHtml(item.changeRateText)}</td>
                    <td class="${item.totalChangeClass}">${item.totalChangeDisplay}</td>
                    <td class="action-cell">
                        ${!item.isHolding ? `<button class="btn btn-sm btn-primary" data-action="buy-watchlist" data-fund-code="${item.safeFundCode}" data-fund-name="${item.safeFundName}">买入</button>` : ''}
                        <button class="btn btn-sm btn-danger" data-action="remove-watchlist" data-watchlist-id="${item.id}" data-fund-name="${item.safeFundName}">移除</button>
                    </td>
                </tr>
            `).join('');

        const mobileCards = this._buildWatchlistCards(normalizedWatchlist);

        container.innerHTML = `
            <div class="watchlist-summary">
                <h3>我的自选 (共 ${normalizedWatchlist.length} 只)</h3>
            </div>
            <div class="watchlist-table-container desktop-only">
                <table class="funds-table">
                    <thead>
                        <tr>
                            <th>基金代码</th>
                            <th>基金名称</th>
                            <th>状态</th>
                            <th>加入时间</th>
                            <th>加入时净值</th>
                            <th>当前净值</th>
                            <th>今日涨跌</th>
                            <th>自选涨幅</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            <div class="watchlist-cards-list mobile-only">
                ${mobileCards}
            </div>
        `;

        container.querySelectorAll('[data-action="buy-watchlist"]').forEach((button) => {
            button.addEventListener('click', () => {
                this.buyFundFromWatchlist(button.dataset.fundCode, button.dataset.fundName);
            });
        });

        container.querySelectorAll('[data-action="remove-watchlist"]').forEach((button) => {
            button.addEventListener('click', () => {
                this.removeFromWatchlist(Number(button.dataset.watchlistId), button.dataset.fundName);
            });
        });
    }

    // 构建自选基金移动端卡片
    _buildWatchlistCards(watchlist) {
        return watchlist.map(item => `
                <div class="watchlist-mobile-card">
                    <div class="wmc-header">
                        <div class="wmc-title">
                            <span class="wmc-name">${item.safeFundName}</span>
                            <span class="wmc-code">${item.safeFundCode}</span>
                        </div>
                        <div class="wmc-change ${item.changeRateClass}">
                            ${escapeHtml(item.changeRateText)}
                        </div>
                    </div>
                    <div class="wmc-metrics">
                        <div class="wmc-metric">
                            <span class="wmc-metric-label">自选涨幅</span>
                            <span class="wmc-metric-value ${item.totalChangeClass}">${item.totalChangeDisplay}</span>
                        </div>
                        <div class="wmc-metric">
                            <span class="wmc-metric-label">加入时净值</span>
                            <span class="wmc-metric-value">${item.costNavText}</span>
                        </div>
                        <div class="wmc-metric">
                            <span class="wmc-metric-label">当前净值</span>
                            <span class="wmc-metric-value">${item.currentNavText}</span>
                        </div>
                    </div>
                    <div class="wmc-sub-metrics">
                        <div class="wmc-sub-item">
                            <span class="wmc-sub-label">加入时间</span>
                            <span class="wmc-sub-value">${item.addedAt}</span>
                        </div>
                        <div class="wmc-sub-item">
                            <span class="wmc-sub-label">状态</span>
                            <span class="wmc-sub-value">
                                ${item.isHolding ? '<span class="wmc-tag wmc-tag--holding">已持有</span>' : '<span class="wmc-tag wmc-tag--not-holding">未持有</span>'}
                            </span>
                        </div>
                    </div>
                    <div class="wmc-footer">
                        ${!item.isHolding ? `<button class="btn btn-sm btn-primary" data-action="buy-watchlist" data-fund-code="${item.safeFundCode}" data-fund-name="${item.safeFundName}">买入</button>` : ''}
                        <button class="btn btn-sm btn-danger" data-action="remove-watchlist" data-watchlist-id="${item.id}" data-fund-name="${item.safeFundName}">移除</button>
                    </div>
                </div>
            `).join('');
    }

    // 显示添加自选模态框
    showAddWatchlistModal() {
        const modalHTML = `
            <div class="modal show">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>添加自选基金</h3>
                        <button class="close-btn" data-action="close-modal">&times;</button>
                    </div>
                    <form id="addWatchlistForm">
                        <div class="form-group">
                            <label for="watchlistFundSearch">选择基金 <span class="red">*</span></label>
                            <div class="search-container">
                                <input type="text"
                                       id="watchlistFundSearch"
                                       name="fund_search"
                                       required
                                       placeholder="输入基金名称或代码搜索..."
                                       autocomplete="off">
                                <div id="watchlistSearchResults" class="search-results"></div>
                            </div>
                            <input type="hidden" id="watchlistFundCode" name="fund_code">
                            <input type="hidden" id="watchlistFundName" name="fund_name">
                            <small class="form-text">添加后将自动记录当前净值，方便后续跟踪涨跌幅</small>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" data-action="close-modal">取消</button>
                            <button type="submit" class="btn btn-primary">添加</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.showModal(modalHTML);
        this.initWatchlistFundSearch();

        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer) {
            modalContainer.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
                button.addEventListener('click', () => this.closeModal());
            });
        }

        const form = document.getElementById('addWatchlistForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const fundCode = document.getElementById('watchlistFundCode').value;
                const fundName = document.getElementById('watchlistFundName').value;

                if (!fundCode) {
                    this.showMessage('请先选择基金', 'error');
                    return;
                }

                await this.addToWatchlist(fundCode, fundName);
            });
        }
    }

    // 初始化自选基金搜索
    initWatchlistFundSearch() {
        const searchInput = document.getElementById('watchlistFundSearch');
        const searchResults = document.getElementById('watchlistSearchResults');

        if (!searchInput || !searchResults) return;

        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const keyword = e.target.value.trim();

            if (keyword.length < 2) {
                searchResults.innerHTML = '';
                searchResults.classList.remove('show');
                return;
            }

            searchTimeout = setTimeout(async () => {
                await this.searchFundsForWatchlist(keyword);
            }, 300);
        });
    }

    // 搜索自选基金
    async searchFundsForWatchlist(keyword) {
        const searchResults = document.getElementById('watchlistSearchResults');
        if (!searchResults) return;

        try {
            searchResults.innerHTML = '<div class="search-loading">搜索中...</div>';
            searchResults.classList.add('show');

            const data = await this.makeRequest(`/funds/search?q=${encodeURIComponent(keyword)}&limit=10`, {
                method: 'GET'
            });
            this.displayWatchlistSearchResults(data);
        } catch (error) {
            console.error('搜索异常:', error);
            searchResults.innerHTML = '<div class="search-error">搜索失败</div>';
        }
    }

    // 显示自选搜索结果
    displayWatchlistSearchResults(funds) {
        const searchResults = document.getElementById('watchlistSearchResults');
        const searchInput = document.getElementById('watchlistFundSearch');

        if (!searchResults || !searchInput) return;

        if (!funds || funds.length === 0) {
            searchResults.innerHTML = '<div class="search-empty">未找到相关基金</div>';
            return;
        }

        searchResults.innerHTML = funds.map((fund) => {
            const fundCode = escapeHtml(fund.fund_code || '');
            const fundName = escapeHtml(fund.fund_name || '');
            return `
                <div class="search-item"
                     data-code="${fundCode}"
                     data-name="${fundName}">
                    <div class="fund-name">${fundName}</div>
                    <div class="fund-code">${fundCode}</div>
                </div>
            `;
        }).join('');

        searchResults.classList.add('show');

        const items = searchResults.querySelectorAll('.search-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const codeInput = document.getElementById('watchlistFundCode');
                const nameInput = document.getElementById('watchlistFundName');
                if (codeInput) codeInput.value = item.dataset.code;
                if (nameInput) nameInput.value = item.dataset.name;
                searchInput.value = item.dataset.name;
                searchResults.classList.remove('show');
                this.showMessage(`已选择: ${item.dataset.name} (${item.dataset.code})`, 'info');
            });
        });
    }

    // 添加到自选
    async addToWatchlist(fundCode, fundName) {
        try {
            await this.makeRequest('/watchlist/', {
                method: 'POST',
                body: JSON.stringify({
                    fund_code: fundCode,
                    fund_name: fundName
                })
            });

            this.showMessage('已添加到自选！', 'success');
            this.closeModal();
            this.loadWatchlist();
        } catch (error) {
            console.error('添加自选失败:', error);
        }
    }

    // 从自选移除
    async removeFromWatchlist(watchlistId, fundName) {
        if (!confirm(`确定要将 ${fundName} 从自选中移除吗？`)) {
            return;
        }

        try {
            await this.makeRequest(`/watchlist/${watchlistId}`, {
                method: 'DELETE'
            });

            this.showMessage('已从自选移除！', 'success');
            this.loadWatchlist();
        } catch (error) {
            console.error('移除自选失败:', error);
        }
    }

    // 从自选买入（跳转到添加基金）
    buyFundFromWatchlist(fundCode, fundName) {
        this.showPortfolioView();
        this.showAddFundModal();

        // 延迟设置基金信息
        setTimeout(() => {
            const searchInput = document.getElementById('fundSearch');
            const codeInput = document.getElementById('fundCode');
            const nameInput = document.getElementById('fundName');

            if (searchInput) searchInput.value = fundName;
            if (codeInput) codeInput.value = fundCode;
            if (nameInput) nameInput.value = fundName;

            this.selectedFund = {
                fund_code: fundCode,
                fund_name: fundName
            };
        }, 100);
    }

    async parseResponse(response) {
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch {
                return null;
            }
        }

        try {
            const text = await response.text();
            return text ? { detail: text } : null;
        } catch {
            return null;
        }
    }

    async makeRequest(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${this.baseURL}${url}`, {
                ...options,
                headers
            });

            // 检查认证状态
            if (response.status === 401) {
                this.clearAuth();
                this.showMessage('登录已过期，请重新登录', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 500);
                throw new Error('认证失败，请重新登录');
            }

            const data = await this.parseResponse(response);

            if (!response.ok) {
                throw new Error(data?.detail || '请求失败');
            }

            return data;
        } catch (error) {
            if (!error.message.includes('认证失败')) {
                this.showMessage(error.message || '请求失败', 'error');
            }
            throw error;
        }
    }

    // 基金相关功能
    async loadFunds() {
        try {
            const funds = await this.makeRequest('/funds/');
            this.displayFunds(funds);
        } catch (error) {
            console.error('加载基金列表失败:', error);
        }
    }

    async addFund(fundData) {
        try {
            const data = await this.makeRequest('/funds/', {
                method: 'POST',
                body: JSON.stringify(fundData)
            });

            this.showMessage('基金添加成功！', 'success');
            this.closeModal();
            this.calculatePortfolio();
            // 如果当前在基金列表页面，也刷新列表
            if (this.currentView === 'funds') {
                this.loadFunds();
            }
            return data;
        } catch (error) {
            throw error;
        }
    }

    async updateFund(fundId, fundData) {
        try {
            const data = await this.makeRequest(`/funds/${fundId}`, {
                method: 'PUT',
                body: JSON.stringify(fundData)
            });

            this.showMessage('基金更新成功！', 'success');
            this.closeModal();
            this.calculatePortfolio();
            // 自动刷新基金列表，避免手动刷新页面
            if (this.currentView === 'funds') {
                this.loadFunds();
            }
            return data;
        } catch (error) {
            throw error;
        }
    }

    async deleteFund(fundId) {
        try {
            if (!confirm('确定要删除这只基金吗？')) {
                return;
            }

            await this.makeRequest(`/funds/${fundId}`, {
                method: 'DELETE'
            });

            this.showMessage('基金删除成功！', 'success');
            this.calculatePortfolio();
            // 自动刷新基金列表
            if (this.currentView === 'funds') {
                this.loadFunds();
            }

        } catch (error) {
            this.showMessage(error.message, 'error');
            throw error;
        }
    }

    async calculatePortfolio() {
        try {
            const summary = await this.makeRequest('/funds/calculate');
            this.currentPortfolioSummary = summary;
            this.displayPortfolioSummary(summary);
        } catch (error) {
            if (error.message.includes('404')) {
                this.showMessage('暂无基金数据，请先添加基金', 'error');
                this.displayPortfolioSummary({
                    total_cost: 0,
                    yesterday_holding_amount: 0,
                    yesterday_holding_income: 0,
                    today_revenue: 0,
                    today_holding_amount: 0,
                    low_fund_list: [],
                    high_fund_list: [],
                    fund_details: []
                });
            } else if (!error.message.includes('认证失败')) {
                this.showMessage(error.message, 'error');
            }
        }
    }

    displayFunds(funds) {
        const fundsList = document.getElementById('fundsList');

        if (!funds || funds.length === 0) {
            fundsList.innerHTML = `
                <div class="no-funds">
                    <p>暂无基金数据</p>
                    <p class="no-funds-hint">点击"添加基金"开始管理您的投资组合</p>
                </div>
            `;
            return;
        }

        const normalizedFunds = funds.map((fund) => {
            const costPrice = parseNumber(fund.cost_price) ?? 0;
            const shares = parseNumber(fund.shares) ?? 0;
            return {
                ...fund,
                safeFundCode: escapeHtml(fund.fund_code || '-'),
                safeFundName: escapeHtml(fund.fund_name || fund.fund_code || '-'),
                costPrice,
                shares,
                costPriceText: formatFixed(costPrice, 4),
                sharesText: shares.toLocaleString(),
                totalCostText: formatFixed(costPrice * shares, 2)
            };
        });

        fundsList.innerHTML = normalizedFunds.map(fund => `
            <div class="fund-card" data-fund-id="${fund.id}">
                <div class="fund-header">
                    <div class="fund-title">
                        <h3 class="fund-display-name">${fund.safeFundName}</h3>
                        <p>(${fund.safeFundCode})</p>
                    </div>
                    <div class="fund-actions">
                        <button class="btn btn-outline btn-sm" data-action="edit-fund" data-fund-id="${fund.id}">编辑</button>
                        <button class="btn btn-danger btn-sm" data-action="delete-fund" data-fund-id="${fund.id}">删除</button>
                    </div>
                </div>
                <div class="fund-details">
                    <div class="fund-detail-row">
                        <span class="label">持仓成本:</span>
                        <span class="value">¥${fund.costPriceText}</span>
                    </div>
                    <div class="fund-detail-row">
                        <span class="label">持有份额:</span>
                        <span class="value">${fund.sharesText}</span>
                    </div>
                    <div class="fund-detail-row">
                        <span class="label">购买成本:</span>
                        <span class="value">¥${fund.totalCostText}</span>
                    </div>
                </div>
            </div>
        `).join('');

        fundsList.querySelectorAll('[data-action="edit-fund"]').forEach((button) => {
            const fund = normalizedFunds.find((item) => String(item.id) === button.dataset.fundId);
            if (!fund) return;
            button.addEventListener('click', () => {
                this.showEditFundModal(fund.id, fund.fund_code, fund.costPrice, fund.shares, fund.fund_name || '');
            });
        });

        fundsList.querySelectorAll('[data-action="delete-fund"]').forEach((button) => {
            button.addEventListener('click', () => {
                this.deleteFund(Number(button.dataset.fundId));
            });
        });
    }

    // 构建移动端基金卡片列表 HTML（独立方法，避免嵌套模板字符串）
    _buildFundCards(fundDetails) {
        const normalizedFunds = this.normalizePortfolioFunds(fundDetails);

        return normalizedFunds.map((fund) => {
            const hasTrendData = fund.recentChanges.length > 0;

            let bodyHtml = '';
            if (!fund.isUnavailable) {
                bodyHtml = `
                <div class="fmc-key-metrics">
                    <div class="fmc-metric">
                        <span class="fmc-metric-label">今日收益</span>
                        <span class="fmc-metric-value ${getProfitClass(fund.todayRevenue)}">
                            ${formatSignedCurrency(fund.todayRevenue)}
                        </span>
                    </div>
                    <div class="fmc-metric">
                        <span class="fmc-metric-label">总收益</span>
                        <span class="fmc-metric-value ${getProfitClass(fund.totalRevenue)}">
                            ${formatSignedCurrency(fund.totalRevenue)}
                        </span>
                    </div>
                    <div class="fmc-metric">
                        <span class="fmc-metric-label">收益比例</span>
                        <span class="fmc-metric-value ${getProfitClass(fund.profitLossRatio)}">
                            ${formatSignedPercent(fund.profitLossRatio)}
                        </span>
                    </div>
                </div>
                <div class="fmc-sub-metrics">
                    <div class="fmc-sub-item">
                        <span class="fmc-sub-label">昨日净值</span>
                        <span class="fmc-sub-value">${formatFixed(fund.previousNav, 4)}</span>
                    </div>
                    <div class="fmc-sub-item">
                        <span class="fmc-sub-label">今日估值</span>
                        <span class="fmc-sub-value ${fund.todayValueClass}">
                            ${fund.todayValueText}${fund.todayValueArrow ? ` ${fund.todayValueArrow}` : ''}
                        </span>
                    </div>
                    <div class="fmc-sub-item">
                        <span class="fmc-sub-label">持仓成本</span>
                        <span class="fmc-sub-value">${formatCurrency(fund.cost)}</span>
                    </div>
                </div>`;
            }

            const footerHtml = hasTrendData
                ? `<button class="btn btn-sm trend-button fmc-trend-btn" data-action="show-trend" data-fund-code="${fund.safeFundCodeAttr}" data-fund-name="${fund.safeFundNameAttr}">查看趋势</button>`
                : `<span class="fmc-no-trend">暂无趋势数据</span>`;

            return `
            <div class="fund-mobile-card ${fund.isUnavailable ? 'fund-mobile-card--unavailable' : ''}">
                <div class="fmc-header">
                    <div class="fmc-title">
                        <span class="fmc-name">${fund.safeFundNameText}</span>
                        <span class="fmc-code">${fund.safeFundCodeText}</span>
                    </div>
                    <div class="fmc-change ${fund.isUnavailable ? '' : fund.changeRateClass}">
                        ${fund.isUnavailable ? '数据获取失败' : fund.changeRateText}
                    </div>
                </div>
                ${bodyHtml}
                <div class="fmc-footer">${footerHtml}</div>
            </div>`;
        }).join('');
    }

    normalizePortfolioFunds(fundDetails = []) {
        return fundDetails.map((fund) => {
            const previousNav = parseNumber(fund.shangrijingzhi);
            const todayValue = parseNumber(fund.today_value);
            const todayRevenue = parseNumber(fund.today_revenue);
            const totalRevenue = parseNumber(fund.total_revenue);
            const profitLossRatio = parseNumber(fund.profit_loss_ratio);
            const cost = parseNumber(fund.cost);
            const costPrice = parseNumber(fund.cost_price);
            const changeRateText = fund.change_rate || '--';
            const recentChanges = Array.isArray(fund.recent_changes) ? fund.recent_changes : [];
            const safeFundCodeText = escapeHtml(fund.fund_code || '-');
            const safeFundNameText = escapeHtml(fund.fund_name || '-');
            const isUp = todayValue !== null && previousNav !== null && todayValue > previousNav;
            const isDown = todayValue !== null && previousNav !== null && todayValue < previousNav;

            return {
                ...fund,
                previousNav,
                todayValue,
                todayRevenue,
                totalRevenue,
                profitLossRatio,
                cost,
                costPrice,
                recentChanges,
                changeRateText,
                changeRateClass: hasNegativeSign(changeRateText) ? 'profit-negative' : 'profit-positive',
                safeFundCodeText,
                safeFundNameText,
                safeFundCodeAttr: escapeHtml(fund.fund_code || ''),
                safeFundNameAttr: escapeHtml(fund.fund_name || '-'),
                previousNavText: formatFixed(previousNav, 4),
                todayValueText: formatFixed(todayValue, 4),
                costText: formatCurrency(cost),
                costPriceText: formatFixed(costPrice, 4),
                todayRevenueText: formatSignedCurrency(todayRevenue),
                totalRevenueText: formatSignedCurrency(totalRevenue),
                profitLossRatioText: formatSignedPercent(profitLossRatio),
                todayRevenueClass: getProfitClass(todayRevenue),
                totalRevenueClass: getProfitClass(totalRevenue),
                profitLossRatioClass: getProfitClass(profitLossRatio),
                todayValueClass: isUp ? 'profit-positive' : isDown ? 'profit-negative' : '',
                todayValueArrow: isUp ? '↑' : isDown ? '↓' : '',
                isUnavailable: Boolean(fund.data_unavailable)
            };
        });
    }

    displayPortfolioSummary(summary) {
        this.currentPortfolioSummary = summary;

        const portfolioContainer = document.getElementById('portfolioSummaryContainer');
        if (!portfolioContainer) return;

        const fundCount = parseNumber(summary.fund_count) ?? 0;
        const fundDetails = Array.isArray(summary.fund_details) ? summary.fund_details : [];
        const normalizedFunds = this.normalizePortfolioFunds(fundDetails);
        const totalCost = parseNumber(summary.total_cost) ?? 0;
        const todayRevenue = parseNumber(summary.today_revenue) ?? 0;
        const totalRevenue = parseNumber(summary.total_revenue)
            ?? normalizedFunds.reduce((sum, fund) => sum + (fund.totalRevenue ?? 0), 0);
        const lowFundList = Array.isArray(summary.low_fund_list) ? summary.low_fund_list : [];
        const highFundList = Array.isArray(summary.high_fund_list) ? summary.high_fund_list : [];
        const textColorClass = getProfitClass(todayRevenue);
        const totalColorClass = getProfitClass(totalRevenue);
        const greetingText = todayRevenue >= 0 ? '恭喜发财！' : '请开心起来!';

        let valuationHtml = '';
        if (lowFundList.length > 0 || highFundList.length > 0) {
            const lowHtml = lowFundList.length > 0 ? `
                <div class="valuation-item low-valuation">
                    <h5>跌幅大于3%的基金</h5>
                    <div class="fund-codes">
                        ${lowFundList.map((code) => `<span class="fund-code-tag">${escapeHtml(code)}</span>`).join('')}
                    </div>
                </div>` : '';
            const highHtml = highFundList.length > 0 ? `
                <div class="valuation-item high-valuation">
                    <h5>涨幅大于3%的基金</h5>
                    <div class="fund-codes">
                        ${highFundList.map((code) => `<span class="fund-code-tag">${escapeHtml(code)}</span>`).join('')}
                    </div>
                </div>` : '';
            valuationHtml = `
                <div class="valuation-section">
                    <div class="valuation-grid">${lowHtml}${highHtml}</div>
                </div>`;
        }

        let detailHtml = '<div class="no-data">暂无基金明细数据</div>';
        if (normalizedFunds.length > 0) {
            const tableRows = normalizedFunds.map((fund) => {
                const trendBtn = fund.recentChanges.length > 0
                    ? `<button class="btn trend-button" data-action="show-trend" data-fund-code="${fund.safeFundCodeAttr}" data-fund-name="${fund.safeFundNameAttr}">查看趋势</button>`
                    : `<span class="no-trend-data">暂无数据</span>`;
                const navArrow = fund.todayValueArrow
                    ? ` <span class="price-arrow ${fund.todayValueClass}">${fund.todayValueArrow}</span>`
                    : '';

                return `
                <tr>
                    <td class="fund-code">${fund.safeFundCodeText}</td>
                    <td class="fund-name">${fund.safeFundNameText}</td>
                    <td>${fund.costText}</td>
                    <td>${fund.costPriceText}</td>
                    <td>${fund.previousNavText}/${fund.todayValueText}${navArrow}</td>
                    <td class="${fund.changeRateClass}">${escapeHtml(fund.changeRateText)}</td>
                    <td class="${fund.todayRevenueClass}">${fund.todayRevenueText}</td>
                    <td class="${fund.totalRevenueClass}">${fund.totalRevenueText}</td>
                    <td class="${fund.profitLossRatioClass}">${fund.profitLossRatioText}</td>
                    <td>${trendBtn}</td>
                </tr>`;
            }).join('');

            detailHtml = `
                <div class="funds-details-section">
                    <h4>基金明细(共${fundCount}只基金)</h4>
                    <div class="funds-table-container desktop-only">
                        <table class="funds-table">
                            <thead>
                                <tr>
                                    <th>基金代码</th><th>基金名称</th><th>购买金额</th>
                                    <th>持仓成本</th><th>上日净值/今日估值</th><th>涨跌幅度</th>
                                    <th>今日收益</th><th>总收益</th><th>收益比例</th><th>涨跌走势</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                    <div class="fund-cards-list mobile-only">
                        ${this._buildFundCards(normalizedFunds)}
                    </div>
                </div>`;
        }

        portfolioContainer.innerHTML = `
            <div class="portfolio-summary">
                <div class="summary-section">
                    <div class="simplified-summary-grid desktop-only">
                        <div class="summary-item">
                            <label>总成本</label>
                            <span class="value">${formatCurrency(totalCost)}</span>
                        </div>
                        <div class="summary-item">
                            <label>累计收益</label>
                            <span class="value ${totalColorClass}">${formatSignedCurrency(totalRevenue)}</span>
                        </div>
                        <div class="summary-item">
                            <label>今日收益</label>
                            <span class="value ${textColorClass}">${formatSignedCurrency(todayRevenue)}</span>
                        </div>
                        <div class="summary-item greeting-item">
                            <span class="greeting-text ${textColorClass}">${greetingText}</span>
                        </div>
                    </div>
                    <div class="summary-mobile-grid mobile-only">
                        <div class="summary-mobile-card">
                            <div class="smc-row">
                                <span class="smc-label">总成本</span>
                                <span class="smc-value">${formatCurrency(totalCost)}</span>
                            </div>
                            <div class="smc-divider"></div>
                            <div class="smc-row">
                                <span class="smc-label">累计收益</span>
                                <span class="smc-value ${totalColorClass}">${formatSignedCurrency(totalRevenue)}</span>
                            </div>
                        </div>
                        <div class="summary-mobile-card">
                            <div class="smc-row">
                                <span class="smc-label">今日收益</span>
                                <span class="smc-value ${textColorClass}">${formatSignedCurrency(todayRevenue)}</span>
                            </div>
                            <div class="smc-divider"></div>
                            <div class="smc-row smc-greeting">
                                <span class="smc-value ${textColorClass}">${greetingText}</span>
                            </div>
                        </div>
                    </div>
                </div>
                ${valuationHtml}
                ${detailHtml}
            </div>
        `;

        portfolioContainer.querySelectorAll('[data-action="show-trend"]').forEach((button) => {
            button.addEventListener('click', () => {
                this.showFundTrendModal(button.dataset.fundCode, button.dataset.fundName);
            });
        });
    }

    showFundTrendModal(fundCode, fundName) {
        if (!this.currentPortfolioSummary || !this.currentPortfolioSummary.fund_details) {
            this.showMessage('无法获取基金数据，请刷新页面后重试', 'error');
            return;
        }

        const fund = this.currentPortfolioSummary.fund_details.find((item) => item.fund_code === fundCode);
        if (!fund) {
            this.showMessage(`未找到基金 ${fundCode} 的数据`, 'error');
            return;
        }

        const recentChanges = Array.isArray(fund.recent_changes) ? fund.recent_changes : [];
        if (recentChanges.length === 0) {
            this.showMessage('该基金暂无趋势数据', 'info');
            return;
        }

        const normalizedChanges = recentChanges.map((item) => ({
            date: escapeHtml(item.date || '-'),
            unitNav: parseNumber(item.unit_nav),
            dailyGrowthValue: parseNumber(item.daily_growth_value),
            dailyGrowthText: escapeHtml(item.daily_growth || '-')
        }));

        const reversedChanges = [...normalizedChanges].reverse();
        const reversedDates = reversedChanges.map((item) => item.date);
        const reversedNavValues = reversedChanges.map((item) => item.unitNav);
        const reversedGrowthValues = reversedChanges.map((item) => item.dailyGrowthValue);

        const tableRows = normalizedChanges.map((item) => `
                <tr>
                    <td>${item.date}</td>
                    <td>${formatFixed(item.unitNav, 4)}</td>
                    <td class="${getProfitClass(item.dailyGrowthValue)}">${item.dailyGrowthText}</td>
                </tr>
            `).join('');

        const mobileCards = normalizedChanges.slice(0, 5).map((item) => `
                <div class="trend-mobile-row">
                    <span class="tmr-date">${item.date}</span>
                    <span class="tmr-nav">${formatFixed(item.unitNav, 4)}</span>
                    <span class="tmr-growth ${getProfitClass(item.dailyGrowthValue)}">${item.dailyGrowthText}</span>
                </div>
            `).join('');

        const modalHTML = `
            <div class="modal show trend-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${escapeHtml(fundName)} (${escapeHtml(fundCode)}) - 最近涨跌趋势</h3>
                        <button class="close-btn" data-action="close-chart-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="trend-chart-container">
                            <canvas id="trendChart"></canvas>
                        </div>
                        <div class="trend-data-summary" style="margin-top: 20px;">
                            <h4>最近 ${normalizedChanges.length} 日数据</h4>
                            <div class="desktop-only">
                                <table class="funds-table" style="font-size: 12px; width: 100%;">
                                    <thead>
                                        <tr>
                                            <th>日期</th>
                                            <th>单位净值</th>
                                            <th>日增长率</th>
                                        </tr>
                                    </thead>
                                    <tbody>${tableRows}</tbody>
                                </table>
                            </div>
                            <div class="mobile-only trend-mobile-list">
                                <div class="trend-mobile-header">
                                    <span>日期</span>
                                    <span>净值</span>
                                    <span>涨跌</span>
                                </div>
                                ${mobileCards}
                                ${normalizedChanges.length > 5 ? `<div class="trend-mobile-more">还有 ${normalizedChanges.length - 5} 条数据</div>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px; text-align: right;">
                        <button class="btn btn-secondary" data-action="close-chart-modal">关闭</button>
                    </div>
                </div>
            </div>
        `;

        this.showModal(modalHTML, 'chart');

        const chartModalContainer = document.getElementById('chartModalContainer');
        if (chartModalContainer) {
            chartModalContainer.querySelectorAll('[data-action="close-chart-modal"]').forEach((button) => {
                button.addEventListener('click', () => this.closeModal('chart'));
            });
        }

        setTimeout(() => {
            this.renderTrendChart(fundCode, fundName, reversedDates, reversedNavValues, reversedGrowthValues);
        }, 100);
    }

    // 渲染趋势图 - 修复可能的错误
    renderTrendChart(fundCode, fundName, dates, navValues, growthValues) {
        const ctx = document.getElementById('trendChart');
        if (!ctx) {
            console.error('找不到图表canvas元素');
            return;
        }

        if (this.chart) {
            this.chart.destroy();
        }

        const isMobile = window.innerWidth <= 768;

        try {
            this.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: '单位净值',
                            data: navValues,
                            borderColor: '#4c74b1',
                            backgroundColor: 'rgba(75, 192, 192, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            yAxisID: 'y',
                            tension: 0.4,
                            pointRadius: isMobile ? 2 : 4,
                            pointHoverRadius: isMobile ? 4 : 6,
                        },
                        {
                            label: '日增长率(%)',
                            data: growthValues,
                            borderColor: '#f7a35c',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            borderWidth: 2,
                            fill: false,
                            yAxisID: 'y1',
                            tension: 0.4,
                            pointRadius: isMobile ? 2 : 4,
                            pointHoverRadius: isMobile ? 4 : 6,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        title: {
                            display: !isMobile,
                            text: `${fundName} (${fundCode}) 净值走势`,
                            font: { size: 14 }
                        },
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: isMobile ? 11 : 13 },
                                boxWidth: isMobile ? 12 : 20,
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.datasetIndex === 0) {
                                        label += formatFixed(context.parsed.y, 4);
                                    } else {
                                        label += formatSignedPercent(context.parsed.y, 2, '-').replace(/^\+/, '');
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: !isMobile,
                                text: '日期'
                            },
                            ticks: {
                                maxTicksLimit: isMobile ? 5 : 10,
                                maxRotation: isMobile ? 45 : 30,
                                font: { size: isMobile ? 10 : 12 },
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: !isMobile,
                                text: '单位净值'
                            },
                            ticks: {
                                font: { size: isMobile ? 10 : 12 },
                                callback(value) {
                                    return formatFixed(value, isMobile ? 3 : 4);
                                }
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: !isMobile,
                                text: '日增长率(%)'
                            },
                            grid: { drawOnChartArea: false },
                            ticks: {
                                font: { size: isMobile ? 10 : 12 },
                                callback(value) {
                                    return formatSignedPercent(value, 2, '-').replace(/^\+/, '');
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('图表渲染失败:', error);
            const chartContainer = document.querySelector('.trend-chart-container');
            if (chartContainer) {
                chartContainer.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">图表渲染失败: ${escapeHtml(error.message)}</div>`;
            }
        }
    }

    logout() {
        this.clearAuth();
        // this.showMessage('已退出登录', 'info');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 200);
    }

    clearAuth() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('last_login');
        localStorage.removeItem('token_expires_at');
        this.token = null;
        this.currentUser = null;
        this.isAuthenticated = false;
    }

    // 显示添加基金模态框
    showAddFundModal() {
        const modalHTML = `
            <div class="modal show">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>添加基金</h3>
                        <button class="close-btn" data-action="close-modal">&times;</button>
                    </div>
                    <form id="addFundForm">
                        <div class="form-group">
                            <label for="fundSearch">选择基金 <span class="red">*</span></label>
                            <div class="search-container">
                                <input type="text"
                                       id="fundSearch"
                                       name="fund_search"
                                       required
                                       placeholder="输入基金名称或代码搜索..."
                                       autocomplete="off">
                                <div id="searchResults" class="search-results"></div>
                            </div>
                            <input type="hidden" id="fundCode" name="fund_code">
                            <input type="hidden" id="fundName" name="fund_name">
                            <small class="form-text">输入基金名称或代码，从搜索结果中选择</small>
                        </div>
                        <div class="form-group">
                            <label for="fundCostPrice">持仓成本 <span class="red">*</span></label>
                            <input type="number" id="fundCostPrice" name="cost_price"
                                   step="0.0001" min="0.0001" required
                                   placeholder="如：1.2345">
                        </div>
                        <div class="form-group">
                            <label for="fundShares">持有份额 <span class="red">*</span></label>
                            <input type="number" id="fundShares" name="shares"
                                   step="0.01" min="0.01" required
                                   placeholder="如：1000.00">
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" data-action="close-modal">取消</button>
                            <button type="submit" class="btn btn-primary">添加</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.showModal(modalHTML);
        this.initFundSearch();

        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer) {
            modalContainer.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
                button.addEventListener('click', () => this.closeModal());
            });
        }

        const form = document.getElementById('addFundForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                if (!this.selectedFund) {
                    this.showMessage('请先选择基金', 'error');
                    return;
                }

                const formData = new FormData(e.target);
                const fundData = {
                    fund_code: formData.get('fund_code'),
                    fund_name: formData.get('fund_name'),
                    cost_price: parseFloat(formData.get('cost_price')),
                    shares: parseFloat(formData.get('shares'))
                };

                await this.addFund(fundData);
            });
        }
    }

    initFundSearch() {
        const searchInput = document.getElementById('fundSearch');
        const searchResults = document.getElementById('searchResults');
        
        if (!searchInput || !searchResults) return;
        
        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const keyword = e.target.value.trim();

            if (keyword.length < 2) {
                searchResults.innerHTML = '';
                searchResults.classList.remove('show');
                return;
            }

            searchTimeout = setTimeout(async () => {
                await this.searchFunds(keyword);
            }, 300);
        });
    }

    async searchFunds(keyword) {
        const searchResults = document.getElementById('searchResults');

        if (!searchResults) return;

        try {
            searchResults.innerHTML = '<div class="search-loading">搜索中...</div>';
            searchResults.classList.add('show');

            const data = await this.makeRequest(`/funds/search?q=${encodeURIComponent(keyword)}&limit=10`, {
                method: 'GET'
            });
            this.displaySearchResults(data);
        } catch (error) {
            console.error('搜索异常:', error);
            this.displayLocalCacheResults(keyword);
        }
    }

    displayLocalCacheResults(keyword) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        const localFunds = [
            {fund_code: "000001", fund_name: "华夏成长混合", fund_type: "混合型"},
            {fund_code: "000002", fund_name: "华夏大盘精选", fund_type: "股票型"},
            {fund_code: "000003", fund_name: "华夏现金增利货币A", fund_type: "货币型"},
            {fund_code: "110011", fund_name: "易方达中小盘混合", fund_type: "混合型"},
            {fund_code: "161725", fund_name: "招商中证白酒指数(LOF)A", fund_type: "指数型"},
        ];
        
        if (keyword) {
            const keywordLower = keyword.toLowerCase();
            const filtered = localFunds.filter(fund => 
                fund.fund_name.toLowerCase().includes(keywordLower) || 
                fund.fund_code.includes(keyword)
            );
            
            if (filtered.length > 0) {
                this.displaySearchResults(filtered);
                searchResults.innerHTML += '<div class="search-note">使用本地缓存数据</div>';
                return;
            }
        }
        
        searchResults.innerHTML = '<div class="search-empty">未找到相关基金</div>';
    }

    displaySearchResults(funds) {
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('fundSearch');

        if (!searchResults || !searchInput) return;

        if (!funds || funds.length === 0) {
            searchResults.innerHTML = '<div class="search-empty">未找到相关基金</div>';
            return;
        }

        searchResults.innerHTML = funds.map((fund) => {
            const fundCode = escapeHtml(fund.fund_code || '');
            const fundName = escapeHtml(fund.fund_name || '');
            return `
                <div class="search-item"
                     data-code="${fundCode}"
                     data-name="${fundName}">
                    <div class="fund-name">${fundName}</div>
                    <div class="fund-code">${fundCode}</div>
                </div>
            `;
        }).join('');

        searchResults.classList.add('show');

        const items = searchResults.querySelectorAll('.search-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                this.selectFund(
                    item.dataset.code,
                    item.dataset.name
                );
                searchResults.classList.remove('show');
                searchInput.value = item.dataset.name;
            });
        });
    }

    selectFund(fundCode, fundName) {
        this.selectedFund = {
            fund_code: fundCode,
            fund_name: fundName
        };
        
        const codeInput = document.getElementById('fundCode');
        const nameInput = document.getElementById('fundName');
        
        if (codeInput) codeInput.value = fundCode;
        if (nameInput) nameInput.value = fundName;
        
        this.showMessage(`已选择: ${fundName} (${fundCode})`, 'info');
    }

    showEditFundModal(fundId, fundCode, costPrice, shares, fundName = '') {
        const displayName = fundName
            ? `${fundName}(${fundCode})`
            : `${fundCode}`;

        const modalHTML = `
            <div class="modal show">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>编辑基金</h3>
                        <button class="close-btn" data-action="close-modal">&times;</button>
                    </div>
                    <form id="editFundForm">
                        <div class="form-group">
                            <label>基金信息</label>
                            <div class="display-field" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;">
                                ${escapeHtml(displayName)}
                            </div>
                            <input type="hidden" id="editFundCode" name="fund_code" value="${escapeHtml(fundCode)}">
                        </div>
                        <div class="form-group">
                            <label for="editCostPrice">持仓成本 <span class="red">*</span></label>
                            <input type="number" id="editCostPrice" name="cost_price"
                                   value="${parseNumber(costPrice) ?? ''}" step="0.0001" min="0.0001" required>
                        </div>
                        <div class="form-group">
                            <label for="editShares">持有份额 <span class="red">*</span></label>
                            <input type="number" id="editShares" name="shares"
                                   value="${parseNumber(shares) ?? ''}" step="0.01" min="0.01" required>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" data-action="close-modal">取消</button>
                            <button type="submit" class="btn btn-primary">更新</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.showModal(modalHTML);

        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer) {
            modalContainer.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
                button.addEventListener('click', () => this.closeModal());
            });
        }

        const form = document.getElementById('editFundForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const fundData = {
                    fund_code: formData.get('fund_code'),
                    cost_price: parseFloat(formData.get('cost_price')),
                    shares: parseFloat(formData.get('shares'))
                };

                await this.updateFund(fundId, fundData);
            });
        }
    }

    showModal(html, modalType = 'normal') {
        const modalContainer = modalType === 'chart'
            ? document.getElementById('chartModalContainer')
            : document.getElementById('modalContainer');

        if (!modalContainer) return;

        modalContainer.innerHTML = html;
        modalContainer.classList.remove('hidden');
        modalContainer.classList.add('show');

        setTimeout(() => {
            const modal = modalContainer.querySelector('.modal');
            if (!modal) return;

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modalType);
                }
            });
        }, 0);
    }

    closeModal(modalType = 'normal') {
        const modalContainer = modalType === 'chart'
            ? document.getElementById('chartModalContainer')
            : document.getElementById('modalContainer');

        if (modalContainer) {
            modalContainer.classList.add('hidden');
            modalContainer.classList.remove('show');
            modalContainer.innerHTML = '';
        }

        if (modalType !== 'chart') {
            this.selectedFund = null;
        }

        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    showMessage(message, type = 'info') {
        const messageEl = document.getElementById('message');
        if (!messageEl) return;

        if (this.messageTimer) {
            clearTimeout(this.messageTimer);
        }

        messageEl.textContent = message;
        messageEl.className = `message ${type}`;
        messageEl.classList.remove('hidden');

        this.messageTimer = setTimeout(() => {
            messageEl.classList.add('hidden');
            this.messageTimer = null;
        }, 3000);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FundManagerApp();
});