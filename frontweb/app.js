const API_BASE_URL = '/api';

class FundManagerApp {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.token = localStorage.getItem('authToken');
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        this.searchCache = {};
        this.selectedFund = null;
        this.chart = null; // 存储当前图表实例
        this.currentPortfolioSummary = null; // 添加这个属性来存储当前的数据
        
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
        const token      = localStorage.getItem('authToken');
        const user       = localStorage.getItem('currentUser');
        const expiresAt  = localStorage.getItem('token_expires_at');

        if (token && user && expiresAt) {
            // 校验 token 是否在有效期内（与后端 ACCESS_TOKEN_EXPIRE_MINUTES=30 一致）
            if (new Date() < new Date(expiresAt)) {
                this.token = token;
                this.currentUser = JSON.parse(user);
                this.isAuthenticated = true;
                return;
            } else {
                // token 已过期，清除本地存储
                this.clearAuth();
            }
        }

        this.isAuthenticated = false;
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

        // 设置概览页面按钮状态
    setButtonVisibilityForPortfolio() {
        const viewFundsBtn = document.getElementById('viewFundsBtn');
        const refreshPortfolioBtn = document.getElementById('refreshPortfolioBtn');
        const addFundBtn = document.getElementById('addFundBtn');
        const backToPortfolioBtn = document.getElementById('backToPortfolioBtn');
        const viewWatchlistBtn = document.getElementById('viewWatchlistBtn');
        const addToWatchlistBtn = document.getElementById('addToWatchlistBtn');
        const backToPortfolioFromWatchlistBtn = document.getElementById('backToPortfolioFromWatchlistBtn');

        // 显示：基金列表、刷新收益、添加基金、自选基金
        if (viewFundsBtn) viewFundsBtn.style.display = 'inline-block';
        if (refreshPortfolioBtn) refreshPortfolioBtn.style.display = 'inline-block';
        if (addFundBtn) addFundBtn.style.display = 'inline-block';
        if (viewWatchlistBtn) viewWatchlistBtn.style.display = 'inline-block';

        // 隐藏：返回概览、添加自选
        if (backToPortfolioBtn) backToPortfolioBtn.style.display = 'none';
        if (addToWatchlistBtn) addToWatchlistBtn.style.display = 'none';
        if (backToPortfolioFromWatchlistBtn) backToPortfolioFromWatchlistBtn.style.display = 'none';
    }

    // 设置基金列表页面按钮状态
    setButtonVisibilityForFundsList() {
        const viewFundsBtn = document.getElementById('viewFundsBtn');
        const refreshPortfolioBtn = document.getElementById('refreshPortfolioBtn');
        const addFundBtn = document.getElementById('addFundBtn');
        const backToPortfolioBtn = document.getElementById('backToPortfolioBtn');
        const viewWatchlistBtn = document.getElementById('viewWatchlistBtn');
        const addToWatchlistBtn = document.getElementById('addToWatchlistBtn');
        const backToPortfolioFromWatchlistBtn = document.getElementById('backToPortfolioFromWatchlistBtn');

        // 隐藏：基金列表、刷新收益、自选基金
        if (viewFundsBtn) viewFundsBtn.style.display = 'none';
        if (refreshPortfolioBtn) refreshPortfolioBtn.style.display = 'none';
        if (viewWatchlistBtn) viewWatchlistBtn.style.display = 'none';
        if (addToWatchlistBtn) addToWatchlistBtn.style.display = 'none';
        if (backToPortfolioFromWatchlistBtn) backToPortfolioFromWatchlistBtn.style.display = 'none';

        // 显示：添加基金、返回概览
        if (addFundBtn) addFundBtn.style.display = 'inline-block';
        if (backToPortfolioBtn) backToPortfolioBtn.style.display = 'inline-block';
    }

    // 设置自选基金页面按钮状态
    setButtonVisibilityForWatchlist() {
        const viewFundsBtn = document.getElementById('viewFundsBtn');
        const refreshPortfolioBtn = document.getElementById('refreshPortfolioBtn');
        const addFundBtn = document.getElementById('addFundBtn');
        const backToPortfolioBtn = document.getElementById('backToPortfolioBtn');
        const viewWatchlistBtn = document.getElementById('viewWatchlistBtn');
        const addToWatchlistBtn = document.getElementById('addToWatchlistBtn');
        const backToPortfolioFromWatchlistBtn = document.getElementById('backToPortfolioFromWatchlistBtn');

        // 隐藏：基金列表、刷新收益、添加基金、自选基金、返回概览(持仓)
        if (viewFundsBtn) viewFundsBtn.style.display = 'none';
        if (refreshPortfolioBtn) refreshPortfolioBtn.style.display = 'none';
        if (addFundBtn) addFundBtn.style.display = 'none';
        if (viewWatchlistBtn) viewWatchlistBtn.style.display = 'none';
        if (backToPortfolioBtn) backToPortfolioBtn.style.display = 'none';

        // 显示：添加自选、返回概览(自选)
        if (addToWatchlistBtn) addToWatchlistBtn.style.display = 'inline-block';
        if (backToPortfolioFromWatchlistBtn) backToPortfolioFromWatchlistBtn.style.display = 'inline-block';
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
        this.setButtonVisibilityForPortfolio();
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

    // 显示基金列表
    showFundsList() {
        const portfolioPage = document.getElementById('portfolioPage');
        const fundsListPage = document.getElementById('fundsListPage');
        
        if (portfolioPage) portfolioPage.style.display = 'none';
        if (fundsListPage) fundsListPage.style.display = 'block';
        
        this.setButtonVisibilityForFundsList();

        this.loadFunds();
    }

    // 显示投资组合概览
    showPortfolioView() {
        const portfolioPage = document.getElementById('portfolioPage');
        const fundsListPage = document.getElementById('fundsListPage');
        const watchlistPage = document.getElementById('watchlistPage');

        if (fundsListPage) fundsListPage.style.display = 'none';
        if (watchlistPage) watchlistPage.style.display = 'none';
        if (portfolioPage) portfolioPage.style.display = 'block';

        this.setButtonVisibilityForPortfolio();

        // 已有缓存数据则直接渲染，无需重新请求
        if (this.currentPortfolioSummary) {
            this.displayPortfolioSummary(this.currentPortfolioSummary);
        } else {
            this.calculatePortfolio();
        }
    }

    // 显示自选基金页面
    showWatchlistPage() {
        const portfolioPage = document.getElementById('portfolioPage');
        const fundsListPage = document.getElementById('fundsListPage');
        const watchlistPage = document.getElementById('watchlistPage');

        if (portfolioPage) portfolioPage.style.display = 'none';
        if (fundsListPage) fundsListPage.style.display = 'none';
        if (watchlistPage) watchlistPage.style.display = 'block';

        this.setButtonVisibilityForWatchlist();
        this.loadWatchlist();
    }

    // 加载自选基金列表
    async loadWatchlist() {
        const container = document.getElementById('watchlistContainer');
        if (!container) return;

        container.innerHTML = '<div class="loading-state"><text>加载中...</text></div>';

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

        // 构建桌面端表格行
        const tableRows = watchlist.map(item => {
            const isHolding = item.is_holding;
            const addedAt = new Date(item.added_at).toLocaleDateString();
            const changeRateClass = item.change_rate && item.change_rate.includes('-') ? 'profit-negative' : 'profit-positive';
            const totalChangeClass = (item.total_change_rate || 0) >= 0 ? 'profit-positive' : 'profit-negative';
            const totalChangeDisplay = item.total_change_rate !== null ?
                `${item.total_change_rate >= 0 ? '+' : ''}${item.total_change_rate.toFixed(2)}%` : '--';
            const safeName = (item.fund_name || '').replace(/'/g, "\\'");

            return `
                <tr>
                    <td class="fund-code">${item.fund_code}</td>
                    <td class="fund-name">${item.fund_name || '-'}</td>
                    <td>${isHolding ? '<span class="holding-tag">已持有</span>' : '<span class="not-holding-tag">未持有</span>'}</td>
                    <td>${addedAt}</td>
                    <td>${item.cost_nav ? item.cost_nav.toFixed(4) : '-'}</td>
                    <td>${item.current_nav ? item.current_nav.toFixed(4) : '-'}</td>
                    <td class="${changeRateClass}">${item.change_rate || '--'}</td>
                    <td class="${totalChangeClass}">${totalChangeDisplay}</td>
                    <td class="action-cell">
                        ${!isHolding ? `<button class="btn btn-sm btn-primary" onclick="app.buyFundFromWatchlist('${item.fund_code}', '${safeName}')">买入</button>` : ''}
                        <button class="btn btn-sm btn-danger" onclick="app.removeFromWatchlist(${item.id}, '${safeName}')">移除</button>
                    </td>
                </tr>
            `;
        }).join('');

        // 构建移动端卡片
        const mobileCards = this._buildWatchlistCards(watchlist);

        container.innerHTML = `
            <div class="watchlist-summary">
                <h3>我的自选 (共 ${watchlist.length} 只)</h3>
            </div>
            <!-- 桌面端表格 -->
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
            <!-- 移动端卡片 -->
            <div class="watchlist-cards-list mobile-only">
                ${mobileCards}
            </div>
        `;
    }

    // 构建自选基金移动端卡片
    _buildWatchlistCards(watchlist) {
        return watchlist.map(item => {
            const isHolding = item.is_holding;
            const addedAt = new Date(item.added_at).toLocaleDateString();
            const changeRateClass = item.change_rate && item.change_rate.includes('-') ? 'profit-negative' : 'profit-positive';
            const totalChangeClass = (item.total_change_rate || 0) >= 0 ? 'profit-positive' : 'profit-negative';
            const totalChangeDisplay = item.total_change_rate !== null ?
                `${item.total_change_rate >= 0 ? '+' : ''}${item.total_change_rate.toFixed(2)}%` : '--';
            const safeName = (item.fund_name || '').replace(/'/g, "\\'");

            return `
                <div class="watchlist-mobile-card">
                    <div class="wmc-header">
                        <div class="wmc-title">
                            <span class="wmc-name">${item.fund_name || '-'}</span>
                            <span class="wmc-code">${item.fund_code}</span>
                        </div>
                        <div class="wmc-change ${changeRateClass}">
                            ${item.change_rate || '--'}
                        </div>
                    </div>
                    <div class="wmc-metrics">
                        <div class="wmc-metric">
                            <span class="wmc-metric-label">自选涨幅</span>
                            <span class="wmc-metric-value ${totalChangeClass}">${totalChangeDisplay}</span>
                        </div>
                        <div class="wmc-metric">
                            <span class="wmc-metric-label">加入时净值</span>
                            <span class="wmc-metric-value">${item.cost_nav ? item.cost_nav.toFixed(4) : '-'}</span>
                        </div>
                        <div class="wmc-metric">
                            <span class="wmc-metric-label">当前净值</span>
                            <span class="wmc-metric-value">${item.current_nav ? item.current_nav.toFixed(4) : '-'}</span>
                        </div>
                    </div>
                    <div class="wmc-sub-metrics">
                        <div class="wmc-sub-item">
                            <span class="wmc-sub-label">加入时间</span>
                            <span class="wmc-sub-value">${addedAt}</span>
                        </div>
                        <div class="wmc-sub-item">
                            <span class="wmc-sub-label">状态</span>
                            <span class="wmc-sub-value">
                                ${isHolding ? '<span class="wmc-tag wmc-tag--holding">已持有</span>' : '<span class="wmc-tag wmc-tag--not-holding">未持有</span>'}
                            </span>
                        </div>
                    </div>
                    <div class="wmc-footer">
                        ${!isHolding ? `<button class="btn btn-sm btn-primary" onclick="app.buyFundFromWatchlist('${item.fund_code}', '${safeName}')">买入</button>` : ''}
                        <button class="btn btn-sm btn-danger" onclick="app.removeFromWatchlist(${item.id}, '${safeName}')">移除</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 显示添加自选模态框
    showAddWatchlistModal() {
        const modalHTML = `
            <div class="modal show">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>添加自选基金</h3>
                        <button class="close-btn" onclick="app.closeModal()">&times;</button>
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
                            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">取消</button>
                            <button type="submit" class="btn btn-primary">添加</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.showModal(modalHTML);
        this.initWatchlistFundSearch();

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

        document.addEventListener('click', (e) => {
            if (searchResults && searchInput &&
                !searchResults.contains(e.target) && e.target !== searchInput) {
                searchResults.classList.remove('show');
            }
        });
    }

    // 搜索自选基金
    async searchFundsForWatchlist(keyword) {
        const searchResults = document.getElementById('watchlistSearchResults');
        if (!searchResults) return;

        try {
            searchResults.innerHTML = '<div class="search-loading">搜索中...</div>';
            searchResults.classList.add('show');

            const url = `/api/funds/search?q=${encodeURIComponent(keyword)}&limit=10`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayWatchlistSearchResults(data);
            } else {
                searchResults.innerHTML = '<div class="search-error">搜索失败，请稍后重试</div>';
            }
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

        let resultsHTML = '';
        funds.forEach(fund => {
            resultsHTML += `
                <div class="search-item"
                     data-code="${fund.fund_code}"
                     data-name="${fund.fund_name}">
                    <div class="fund-name">${fund.fund_name}</div>
                    <div class="fund-code">${fund.fund_code}</div>
                </div>
            `;
        });

        searchResults.innerHTML = resultsHTML;
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

    async makeRequest(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${this.baseURL}${url}`, {
                ...options,
                headers
            });

            // 检查认证状态
            if (response.status === 401) {
                // 认证失败，跳转到登录页面
                this.clearAuth();
                this.showMessage('登录已过期，请重新登录', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 500);
                throw new Error('认证失败，请重新登录');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || '请求失败');
            }

            return data;
        } catch (error) {
            if (!error.message.includes('认证失败')) {
                this.showMessage(error.message, 'error');
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
            if (document.getElementById('fundsListPage') && 
                document.getElementById('fundsListPage').style.display !== 'none') {
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
            // 检查是否在基金列表页面，如果是则刷新列表
            const fundsListPage = document.getElementById('fundsListPage');
            if (fundsListPage && fundsListPage.style.display !== 'none') {
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
            const fundsListPage = document.getElementById('fundsListPage');
            if (fundsListPage && fundsListPage.style.display !== 'none') {
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

        fundsList.innerHTML = funds.map(fund => {
            // 创建一个包含基金名称和代码的显示字符串
            const fundDisplayName = fund.fund_name ? 
                `${fund.fund_name}(${fund.fund_code})` : 
                `${fund.fund_code}`;
            
            return `
            <div class="fund-card" data-fund-id="${fund.id}">
                <div class="fund-header">
                    <div class="fund-title">
                        <h3 class="fund-display-name">${fund.fund_name}</h3>
                        <p>(${fund.fund_code})</p>
                    </div>
                    <div class="fund-actions">
                        <button class="btn btn-outline btn-sm" onclick="app.showEditFundModal(${fund.id}, '${fund.fund_code}', ${fund.cost_price}, ${fund.shares}, '${fund.fund_name || ''}')">编辑</button>
                        <button class="btn btn-danger btn-sm" onclick="app.deleteFund(${fund.id})">删除</button>
                    </div>
                </div>
                <div class="fund-details">
                    <div class="fund-detail-row">
                        <span class="label">持仓成本:</span>
                        <span class="value">¥${fund.cost_price.toFixed(4)}</span>
                    </div>
                    <div class="fund-detail-row">
                        <span class="label">持有份额:</span>
                        <span class="value">${fund.shares.toLocaleString()}</span>
                    </div>
                    <div class="fund-detail-row">
                        <span class="label">购买成本:</span>
                        <span class="value">¥${(fund.cost_price * fund.shares).toFixed(2)}</span>
                    </div>

                </div>
            </div>
        `}).join('');
    }

    // 构建移动端基金卡片列表 HTML（独立方法，避免嵌套模板字符串）
    _buildFundCards(fund_details) {
        return fund_details.map(fund => {
            const changeRate       = fund.change_rate || '--';
            const todayValue       = fund.today_value;
            const todayRevenue     = fund.today_revenue;
            const totalRevenue     = fund.total_revenue;
            const profitLossRatio  = fund.profit_loss_ratio;
            const shangrijingzhi   = fund.shangrijingzhi;
            const isUnavailable    = fund.data_unavailable;
            const changeRateClass  = changeRate.includes('-') ? 'profit-negative' : 'profit-positive';
            const hasTrendData     = fund.recent_changes && fund.recent_changes.length > 0;
            const isUp             = todayValue != null && shangrijingzhi != null && todayValue > shangrijingzhi;
            const safeName         = (fund.fund_name || '-').replace(/'/g, "\\'");

            let bodyHtml = '';
            if (!isUnavailable) {
                bodyHtml = `
                <div class="fmc-key-metrics">
                    <div class="fmc-metric">
                        <span class="fmc-metric-label">今日收益</span>
                        <span class="fmc-metric-value ${todayRevenue >= 0 ? 'profit-positive' : 'profit-negative'}">
                            ${todayRevenue >= 0 ? '+' : ''}¥${todayRevenue.toFixed(2)}
                        </span>
                    </div>
                    <div class="fmc-metric">
                        <span class="fmc-metric-label">总收益</span>
                        <span class="fmc-metric-value ${totalRevenue >= 0 ? 'profit-positive' : 'profit-negative'}">
                            ${totalRevenue >= 0 ? '+' : ''}¥${totalRevenue.toFixed(2)}
                        </span>
                    </div>
                    <div class="fmc-metric">
                        <span class="fmc-metric-label">收益比例</span>
                        <span class="fmc-metric-value ${profitLossRatio >= 0 ? 'profit-positive' : 'profit-negative'}">
                            ${profitLossRatio >= 0 ? '+' : ''}${profitLossRatio.toFixed(2)}%
                        </span>
                    </div>
                </div>
                <div class="fmc-sub-metrics">
                    <div class="fmc-sub-item">
                        <span class="fmc-sub-label">昨日净值</span>
                        <span class="fmc-sub-value">${shangrijingzhi != null ? shangrijingzhi.toFixed(4) : '-'}</span>
                    </div>
                    <div class="fmc-sub-item">
                        <span class="fmc-sub-label">今日估值</span>
                        <span class="fmc-sub-value ${isUp ? 'profit-positive' : 'profit-negative'}">
                            ${todayValue != null ? todayValue.toFixed(4) : '-'} ${isUp ? '↑' : '↓'}
                        </span>
                    </div>
                    <div class="fmc-sub-item">
                        <span class="fmc-sub-label">持仓成本</span>
                        <span class="fmc-sub-value">¥${(fund.cost || 0).toFixed(2)}</span>
                    </div>
                </div>`;
            }

            const footerHtml = hasTrendData
                ? `<button class="btn btn-sm trend-button fmc-trend-btn" onclick="app.showFundTrendModal('${fund.fund_code}', '${safeName}')">📈 查看趋势</button>`
                : `<span class="fmc-no-trend">暂无趋势数据</span>`;

            return `
            <div class="fund-mobile-card ${isUnavailable ? 'fund-mobile-card--unavailable' : ''}">
                <div class="fmc-header">
                    <div class="fmc-title">
                        <span class="fmc-name">${fund.fund_name || '-'}</span>
                        <span class="fmc-code">${fund.fund_code || '-'}</span>
                    </div>
                    <div class="fmc-change ${isUnavailable ? '' : changeRateClass}">
                        ${isUnavailable ? '数据获取失败' : changeRate}
                    </div>
                </div>
                ${bodyHtml}
                <div class="fmc-footer">${footerHtml}</div>
            </div>`;
        }).join('');
    }

    displayPortfolioSummary(summary) {
        this.currentPortfolioSummary = summary;

        const portfolioContainer = document.getElementById('portfolioSummaryContainer');
        if (!portfolioContainer) return;

        const fund_count    = summary.fund_count || 0;
        const total_cost    = summary.total_cost || 0;
        const today_revenue = summary.today_revenue || 0;
        const total_revenue = summary.fund_details && summary.fund_details.length > 0
            ? summary.fund_details.reduce((sum, f) => sum + (f.total_revenue || 0), 0) : 0;

        const low_fund_list  = summary.low_fund_list  || [];
        const high_fund_list = summary.high_fund_list || [];
        const fund_details   = summary.fund_details   || [];

        const isPositive      = today_revenue >= 0;
        const textColorClass  = isPositive ? 'profit-positive' : 'profit-negative';
        const greetingText    = isPositive ? '恭喜发财！' : '请开心起来!';
        const isTotalPositive = total_revenue >= 0;
        const total_ColorClass = isTotalPositive ? 'profit-positive' : 'profit-negative';

        // 涨跌预警区块
        let valuationHtml = '';
        if (low_fund_list.length > 0 || high_fund_list.length > 0) {
            const lowHtml = low_fund_list.length > 0 ? `
                <div class="valuation-item low-valuation">
                    <h5>跌幅大于3%的基金</h5>
                    <div class="fund-codes">
                        ${low_fund_list.map(code => `<span class="fund-code-tag">${code}</span>`).join('')}
                    </div>
                </div>` : '';
            const highHtml = high_fund_list.length > 0 ? `
                <div class="valuation-item high-valuation">
                    <h5>涨幅大于3%的基金</h5>
                    <div class="fund-codes">
                        ${high_fund_list.map(code => `<span class="fund-code-tag">${code}</span>`).join('')}
                    </div>
                </div>` : '';
            valuationHtml = `
                <div class="valuation-section">
                    <div class="valuation-grid">${lowHtml}${highHtml}</div>
                </div>`;
        }

        // 基金明细区块（桌面表格 + 移动卡片）
        let detailHtml = '<div class="no-data">暂无基金明细数据</div>';
        if (fund_details.length > 0) {
            // 桌面端：表格
            const tableRows = fund_details.map(fund => {
                const changeRate      = fund.change_rate || '0.00%';
                const todayValue      = fund.today_value || 0;
                const todayRevenue    = fund.today_revenue || 0;
                const totalRevenue    = fund.total_revenue || 0;
                const profitLossRatio = fund.profit_loss_ratio || 0;
                const shangrijingzhi  = fund.shangrijingzhi || 0;
                const changeRateClass = changeRate.includes('-') ? 'profit-negative' : 'profit-positive';
                const isUp            = todayValue > shangrijingzhi;
                const arrowClass      = isUp ? 'profit-positive' : 'profit-negative';
                const arrowIcon       = isUp ? '↑' : '↓';
                const hasTrendData    = fund.recent_changes && fund.recent_changes.length > 0;
                const safeName        = (fund.fund_name || '-').replace(/'/g, "\\'");
                const trendBtn        = hasTrendData
                    ? `<button class="btn trend-button" onclick="app.showFundTrendModal('${fund.fund_code}', '${safeName}')">查看趋势</button>`
                    : `<span class="no-trend-data">暂无数据</span>`;
                return `
                <tr>
                    <td class="fund-code">${fund.fund_code || '-'}</td>
                    <td class="fund-name">${fund.fund_name || '-'}</td>
                    <td>¥${(fund.cost || 0).toFixed(2)}</td>
                    <td>${(fund.cost_price || 0).toFixed(4)}</td>
                    <td>${shangrijingzhi.toFixed(4)}/${todayValue.toFixed(4)} <span class="price-arrow ${arrowClass}">${arrowIcon}</span></td>
                    <td class="${changeRateClass}">${changeRate}</td>
                    <td class="${todayRevenue >= 0 ? 'profit-positive' : 'profit-negative'}">¥${todayRevenue.toFixed(2)}</td>
                    <td class="${totalRevenue >= 0 ? 'profit-positive' : 'profit-negative'}">¥${totalRevenue.toFixed(2)}</td>
                    <td class="${profitLossRatio >= 0 ? 'profit-positive' : 'profit-negative'}">${profitLossRatio.toFixed(2)}%</td>
                    <td>${trendBtn}</td>
                </tr>`;
            }).join('');

            detailHtml = `
                <div class="funds-details-section">
                    <h4>基金明细(共${fund_count}只基金)</h4>
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
                        ${this._buildFundCards(fund_details)}
                    </div>
                </div>`;
        }

        portfolioContainer.innerHTML = `
            <div class="portfolio-summary">
                <div class="summary-section">
                    <!-- 桌面端：4格独立卡片 -->
                    <div class="simplified-summary-grid desktop-only">
                        <div class="summary-item">
                            <label>总成本</label>
                            <span class="value">¥${total_cost.toFixed(2)}</span>
                        </div>
                        <div class="summary-item">
                            <label>累计收益</label>
                            <span class="value ${total_ColorClass}">¥${total_revenue.toFixed(2)}</span>
                        </div>
                        <div class="summary-item">
                            <label>今日收益</label>
                            <span class="value ${textColorClass}">¥${today_revenue.toFixed(2)}</span>
                        </div>
                        <div class="summary-item greeting-item">
                            <span class="greeting-text ${textColorClass}">${greetingText}</span>
                        </div>
                    </div>
                    <!-- 移动端：2张合并卡片 -->
                    <div class="summary-mobile-grid mobile-only">
                        <div class="summary-mobile-card">
                            <div class="smc-row">
                                <span class="smc-label">总成本</span>
                                <span class="smc-value">¥${total_cost.toFixed(2)}</span>
                            </div>
                            <div class="smc-divider"></div>
                            <div class="smc-row">
                                <span class="smc-label">累计收益</span>
                                <span class="smc-value ${total_ColorClass}">¥${total_revenue.toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="summary-mobile-card">
                            <div class="smc-row">
                                <span class="smc-label">今日收益</span>
                                <span class="smc-value ${textColorClass}">${today_revenue >= 0 ? '+' : ''}¥${today_revenue.toFixed(2)}</span>
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
    }

    showFundTrendModal(fundCode, fundName) {

        // 从当前数据中查找基金
        if (!this.currentPortfolioSummary || !this.currentPortfolioSummary.fund_details) {
            this.showMessage('无法获取基金数据，请刷新页面后重试', 'error');
            return;
        }

        const fund = this.currentPortfolioSummary.fund_details.find(f => f.fund_code === fundCode);


        if (!fund) {
            this.showMessage(`未找到基金 ${fundCode} 的数据`, 'error');
            return;
        }

        if (!fund.recent_changes || fund.recent_changes.length === 0) {
            this.showMessage('该基金暂无趋势数据', 'info');
            return;
        }

        const recentChanges = fund.recent_changes;

        // 准备图表数据 - 注意：数据已经按日期从新到旧排列，我们需要反转顺序
        const dates = recentChanges.map(item => item.date);
        const navValues = recentChanges.map(item => item.unit_nav);
        const growthValues = recentChanges.map(item => item.daily_growth_value);

        // 反转数据，让日期从旧到新
        const reversedDates = [...dates].reverse();
        const reversedNavValues = [...navValues].reverse();
        const reversedGrowthValues = [...growthValues].reverse();

        // 构建数据表格行
        const tableRows = recentChanges.map(item => {
            const growthClass = item.daily_growth_value >= 0 ? 'profit-positive' : 'profit-negative';
            return `
                <tr>
                    <td>${item.date}</td>
                    <td>${item.unit_nav.toFixed(4)}</td>
                    <td class="${growthClass}">${item.daily_growth}</td>
                </tr>
            `;
        }).join('');

        // 构建移动端卡片（只显示最近5条）
        const mobileCards = recentChanges.slice(0, 5).map(item => {
            const growthClass = item.daily_growth_value >= 0 ? 'profit-positive' : 'profit-negative';
            return `
                <div class="trend-mobile-row">
                    <span class="tmr-date">${item.date}</span>
                    <span class="tmr-nav">${item.unit_nav.toFixed(4)}</span>
                    <span class="tmr-growth ${growthClass}">${item.daily_growth}</span>
                </div>
            `;
        }).join('');

        const modalHTML = `
            <div class="modal show trend-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${fundName} (${fundCode}) - 最近涨跌趋势</h3>
                        <button class="close-btn" onclick="app.closeModal('chart')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="trend-chart-container">
                            <canvas id="trendChart"></canvas>
                        </div>
                        <div class="trend-data-summary" style="margin-top: 20px;">
                            <h4>最近 ${recentChanges.length} 日数据</h4>
                            <!-- 桌面端表格 -->
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
                            <!-- 移动端简化显示 -->
                            <div class="mobile-only trend-mobile-list">
                                <div class="trend-mobile-header">
                                    <span>日期</span>
                                    <span>净值</span>
                                    <span>涨跌</span>
                                </div>
                                ${mobileCards}
                                ${recentChanges.length > 5 ? `<div class="trend-mobile-more">还有 ${recentChanges.length - 5} 条数据</div>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px; text-align: right;">
                        <button class="btn btn-secondary" onclick="app.closeModal('chart')">关闭</button>
                    </div>
                </div>
            </div>
        `;

        this.showModal(modalHTML,'chart');

        // 延迟执行，确保DOM已渲染
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
                            display: !isMobile,   // 移动端隐藏标题，节省空间
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
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.datasetIndex === 0) {
                                        label += context.parsed.y.toFixed(4);
                                    } else {
                                        label += context.parsed.y.toFixed(2) + '%';
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
                                // 移动端自动跳过标签，避免重叠
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
                                callback: function(value) {
                                    return value.toFixed(isMobile ? 3 : 4);
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
                                callback: function(value) {
                                    return value.toFixed(2) + '%';
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
                chartContainer.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">图表渲染失败: ${error.message}</div>`;
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
                        <button class="close-btn" onclick="app.closeModal()">&times;</button>
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
                            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">取消</button>
                            <button type="submit" class="btn btn-primary">添加</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.showModal(modalHTML);
        this.initFundSearch();
        
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
        
        document.addEventListener('click', (e) => {
            if (searchResults && searchInput && 
                !searchResults.contains(e.target) && e.target !== searchInput) {
                searchResults.classList.remove('show');
            }
        });
    }

    async searchFunds(keyword) {
        const searchResults = document.getElementById('searchResults');
        
        if (!searchResults) return;
        
        
        try {
            searchResults.innerHTML = '<div class="search-loading">搜索中...</div>';
            searchResults.classList.add('show');

            const url = `${this.baseURL}/funds/search?q=${encodeURIComponent(keyword)}&limit=10`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.displaySearchResults(data);
            } else {
                searchResults.innerHTML = '<div class="search-error">搜索失败，请稍后重试</div>';
            }
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
        
        let resultsHTML = '';
        funds.forEach(fund => {
            resultsHTML += `
                <div class="search-item" 
                     data-code="${fund.fund_code}" 
                     data-name="${fund.fund_name}">
                    <div class="fund-name">${fund.fund_name}</div>
                    <div class="fund-code">${fund.fund_code}</div>
                </div>
            `;
        });
        
        searchResults.innerHTML = resultsHTML;
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
        // 创建一个显示名称，格式为：基金名称(代码：012934)
        const displayName = fundName ? 
            `${fundName}(${fundCode})` : 
            `${fundCode}`;
            
        const modalHTML = `
            <div class="modal show">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>编辑基金</h3>
                        <button class="close-btn" onclick="app.closeModal()">&times;</button>
                    </div>
                    <form id="editFundForm">
                        <div class="form-group">
                            <label>基金信息</label>
                            <div class="display-field" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;">
                                ${displayName}
                            </div>
                            <input type="hidden" id="editFundCode" name="fund_code" value="${fundCode}">
                        </div>
                        <div class="form-group">
                            <label for="editCostPrice">持仓成本 <span class="red">*</span></label>
                            <input type="number" id="editCostPrice" name="cost_price" 
                                   value="${costPrice}" step="0.0001" min="0.0001" required>
                        </div>
                        <div class="form-group">
                            <label for="editShares">持有份额 <span class="red">*</span></label>
                            <input type="number" id="editShares" name="shares" 
                                   value="${shares}" step="0.01" min="0.01" required>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">取消</button>
                            <button type="submit" class="btn btn-primary">更新</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.showModal(modalHTML);
        
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
        let modalContainer;
        
        if (modalType === 'chart') {
            modalContainer = document.getElementById('chartModalContainer');
            if (modalContainer) {
                // 显示模态框容器
                modalContainer.style.display = 'block';
                modalContainer.classList.remove('hidden');
                // 添加 show 类
                modalContainer.classList.add('show');
                modalContainer.innerHTML = html;
                
                // 添加点击遮罩关闭功能
                setTimeout(() => {
                    const modal = modalContainer.querySelector('.modal');
                    if (modal) {
                        modal.addEventListener('click', (e) => {
                            if (e.target === modal) {
                                this.closeModal('chart');
                            }
                        });
                    }
                }, 0);
            }
        } else {
            modalContainer = document.getElementById('modalContainer');
            if (modalContainer) {
                modalContainer.innerHTML = html;
                
                // 普通模态框的遮罩关闭功能
                setTimeout(() => {
                    const modal = modalContainer.querySelector('.modal');
                    if (modal) {
                        modal.addEventListener('click', (e) => {
                            if (e.target === modal) {
                                this.closeModal();
                            }
                        });
                    }
                }, 0);
            }
        }
    }

    // 修改 closeModal 方法
    closeModal(modalType = 'normal') {
        let modalContainer;
        
        if (modalType === 'chart') {
            modalContainer = document.getElementById('chartModalContainer');
            if (modalContainer) {
                modalContainer.style.display = 'none';
                modalContainer.classList.remove('show');
                modalContainer.innerHTML = '';
            }
        } else {
            modalContainer = document.getElementById('modalContainer');
            if (modalContainer) {
                modalContainer.innerHTML = '';
            }
        }
        
        this.selectedFund = null;
        
        // 销毁图表实例
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

        showMessage(message, type = 'info') {
            const messageEl = document.getElementById('message');
            if (!messageEl) return;
            
            messageEl.textContent = message;
            messageEl.className = `message ${type}`;
            messageEl.style.display = 'block';

            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 3000);
        }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FundManagerApp();
});