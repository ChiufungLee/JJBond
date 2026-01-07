class FundManagerApp {
    constructor() {
        this.baseURL = '/api';
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
        // 检查token是否存在
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('currentUser');
        const lastLogin = localStorage.getItem('last_login');
        
        if (token && user && lastLogin) {
            // 检查登录是否在7天内
            const lastLoginDate = new Date(lastLogin);
            const now = new Date();
            const daysDiff = (now - lastLoginDate) / (1000 * 60 * 60 * 24);
            
            if (daysDiff < 7) {
                this.token = token;
                this.currentUser = JSON.parse(user);
                this.isAuthenticated = true;
                return;
            } else {
                console.log('登录已过期');
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
        
        // 显示：基金列表、刷新收益、添加基金
        if (viewFundsBtn) viewFundsBtn.style.display = 'inline-block';
        if (refreshPortfolioBtn) refreshPortfolioBtn.style.display = 'inline-block';
        if (addFundBtn) addFundBtn.style.display = 'inline-block';
        
        // 隐藏：返回概览
        if (backToPortfolioBtn) backToPortfolioBtn.style.display = 'none';
    }
    
    // 设置基金列表页面按钮状态
    setButtonVisibilityForFundsList() {
        const viewFundsBtn = document.getElementById('viewFundsBtn');
        const refreshPortfolioBtn = document.getElementById('refreshPortfolioBtn');
        const addFundBtn = document.getElementById('addFundBtn');
        const backToPortfolioBtn = document.getElementById('backToPortfolioBtn');
        
        // 隐藏：基金列表、刷新收益
        if (viewFundsBtn) viewFundsBtn.style.display = 'none';
        if (refreshPortfolioBtn) refreshPortfolioBtn.style.display = 'none';
        
        // 显示：添加基金、返回概览
        if (addFundBtn) addFundBtn.style.display = 'inline-block';
        if (backToPortfolioBtn) backToPortfolioBtn.style.display = 'inline-block';
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
        console.log('显示未登录界面');
        
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
        
        // 绑定重定向按钮事件
        this.bindRedirectEvents();
    }

    bindRedirectEvents() {
        // 登录跳转按钮
        const loginRedirectBtn = document.getElementById('loginRedirectBtn');
        const registerRedirectBtn = document.getElementById('registerRedirectBtn');
        
        if (loginRedirectBtn) {
            loginRedirectBtn.addEventListener('click', () => {
                window.location.href = 'login.html';
            });
        }
        
        if (registerRedirectBtn) {
            registerRedirectBtn.addEventListener('click', () => {
                window.location.href = 'register';
            });
        }
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
        
        if (fundsListPage) fundsListPage.style.display = 'none';
        if (portfolioPage) portfolioPage.style.display = 'block';
        
        this.setButtonVisibilityForPortfolio();

        this.calculatePortfolio();
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

    displayPortfolioSummary(summary) {

        this.currentPortfolioSummary = summary;

        const portfolioContainer = document.getElementById('portfolioSummaryContainer');
        
        if (!portfolioContainer) return;
        
        const fund_count = summary.fund_count || 0;
        const total_cost = summary.total_cost || 0;
        const today_revenue = summary.today_revenue || 0;
        const total_revenue = summary.fund_details && summary.fund_details.length > 0 ? 
            summary.fund_details.reduce((sum, fund) => sum + (fund.total_revenue || 0), 0) : 0;
        
        const low_fund_list = summary.low_fund_list || [];
        const high_fund_list = summary.high_fund_list || [];
        const fund_details = summary.fund_details || [];

        const isPositive = today_revenue >= 0;
        const textColorClass = isPositive ? 'profit-positive' : 'profit-negative';

        const positiveGreetings = [
        "恭喜发财！",
        "以为要亏，结果涨了！",
        "小赚一笔，今日元气拉满！",
        "我这手气，买啥涨啥哈哈哈！",
        "今日小胜，明日大赚！"
        ];

        const negativeGreetings = [
        "我这手气，买啥跌啥，简直是股市的'反向指标'。",
        "居然亏钱了？！对，你没听错，一个本该稳如老狗的东西，亏了。",
        "每次看基金收益，都有种在坐过山车的感觉——直线下坠版。",
        "又跌？我买你图个啥？不就图个你比余额宝那三瓜俩枣稍微强点儿么？",
        "亏损？我陪你笑一笑！",
        "小亏一下，大赚在后头！"
        ];

        // 随机抽取问候语
        const greetingText = isPositive 
        ? positiveGreetings[Math.floor(Math.random() * positiveGreetings.length)]
        : negativeGreetings[Math.floor(Math.random() * negativeGreetings.length)];

        const isTotalPositive = total_revenue >= 0;
        const total_ColorClass = isTotalPositive ? 'profit-positive' : 'profit-negative';

        portfolioContainer.innerHTML = `
            <div class="portfolio-summary">
                <div class="summary-section">
                    <div class="simplified-summary-grid">
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
                </div>

                ${low_fund_list.length > 0 || high_fund_list.length > 0 ? `
                <div class="valuation-section">
                    <div class="valuation-grid">
                        ${low_fund_list.length > 0 ? `
                        <div class="valuation-item low-valuation">
                            <h5>跌幅大于3%的基金</h5>
                            <div class="fund-codes">
                                ${low_fund_list.map(code => `<span class="fund-code-tag">${code}</span>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${high_fund_list.length > 0 ? `
                        <div class="valuation-item high-valuation">
                            <h5>涨幅大于3%的基金</h5>
                            <div class="fund-codes">
                                ${high_fund_list.map(code => `<span class="fund-code-tag">${code}</span>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                ${fund_details.length > 0 ? `
                <div class="funds-details-section">
                    <h4>基金明细(共${fund_count}只基金)</h4>
                    <div class="funds-table-container">
                        <table class="funds-table">
                            <thead>
                                <tr>
                                    <th>基金代码</th>
                                    <th>基金名称</th>
                                    <th>购买金额</th>
                                    <th>持仓成本</th>
                                    <th>上日净值/今日估值</th>
                                    <th>涨跌幅度</th>
                                    <th>今日收益</th>
                                    <th>总收益</th>
                                    <th>收益比例</th>
                                    <th>涨跌走势</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${fund_details.map(fund => {
                                // 从后端数据获取值
                                const changeRate = fund.change_rate || '0.00%';
                                const todayValue = fund.today_value || 0;
                                const todayRevenue = fund.today_revenue || 0;
                                const totalRevenue = fund.total_revenue || 0;
                                const profitLossRatio = fund.profit_loss_ratio || 0;
                                const shangrijingzhi = fund.shangrijingzhi || 0;
                                
                                // 判断涨跌幅是否有负号
                                const changeRateHasNegativeSign = changeRate.includes('-');
                                // 判断涨跌幅样式（负数显示绿色，正数显示红色）
                                const changeRateClass = changeRateHasNegativeSign ? 'profit-negative' : 'profit-positive';
                                
                                // 比较今日估值和成本价，显示上下箭头
                                const costPrice = fund.cost_price || 0;
                                const isUp = todayValue > shangrijingzhi;
                                const arrowIcon = isUp ? '↑' : '↓';
                                const arrowClass = isUp ? 'profit-positive' : 'profit-negative';

                                // 检查是否有趋势数据
                                const hasTrendData = fund.recent_changes && fund.recent_changes.length > 0;

                                return `
                                <tr>
                                    <td class="fund-code">${fund.fund_code || '-'}</td>
                                    <td class="fund-name">${fund.fund_name || '-'}</td>
                                    <td>¥${(fund.cost || 0).toFixed(2)}</td>
                                    <td>${(fund.cost_price || 0).toFixed(4)}</td>
                                    <td>${(fund.shangrijingzhi || 0).toFixed(4)}/${(fund.today_value || 0).toFixed(4)} <span class="price-arrow ${arrowClass}">${arrowIcon}</span></td>
                                    <td class="${changeRateClass}">
                                        ${changeRate}
                                    </td>
                                    <td class="${todayRevenue >= 0 ? 'profit-positive' : 'profit-negative'}">
                                        ¥${todayRevenue.toFixed(2)}
                                    </td>
                                    <td class="${totalRevenue >= 0 ? 'profit-positive' : 'profit-negative'}">
                                        ¥${totalRevenue.toFixed(2)}
                                    </td>
                                    <td class="${profitLossRatio >= 0 ? 'profit-positive' : 'profit-negative'}">
                                        ${profitLossRatio.toFixed(2)}%
                                    </td>
                                    <td>
                                        ${hasTrendData ? 
                                            `<button class="btn trend-button" onclick="app.showFundTrendModal('${fund.fund_code}', '${fund.fund_name.replace(/'/g, "\\'")}')">查看趋势</button>` :
                                            `<span class="no-trend-data">暂无数据</span>`
                                        }
                                    </td>
                                </tr>
                                `;
                            }).join('')}

                            </tbody>
                        </table>
                    </div>
                </div>
                ` : '<div class="no-data">暂无基金明细数据</div>'}
            </div>
        `;
    }

        // 显示基金趋势图模态框
    // 显示基金趋势图模态框 - 修复这个方法
    showFundTrendModal(fundCode, fundName) {
        console.log('正在显示趋势图，基金代码:', fundCode, '基金名称:', fundName);
        console.log('当前组合数据:', this.currentPortfolioSummary);
        
        // 从当前数据中查找基金
        if (!this.currentPortfolioSummary || !this.currentPortfolioSummary.fund_details) {
            this.showMessage('无法获取基金数据，请刷新页面后重试', 'error');
            return;
        }
        
        const fund = this.currentPortfolioSummary.fund_details.find(f => f.fund_code === fundCode);
        
        console.log('找到的基金数据:', fund);
        
        if (!fund) {
            this.showMessage(`未找到基金 ${fundCode} 的数据`, 'error');
            return;
        }
        
        if (!fund.recent_changes || fund.recent_changes.length === 0) {
            this.showMessage('该基金暂无趋势数据', 'info');
            return;
        }

        const recentChanges = fund.recent_changes;
        console.log('趋势数据:', recentChanges);
        
        // 准备图表数据 - 注意：数据已经按日期从新到旧排列，我们需要反转顺序
        const dates = recentChanges.map(item => item.date);
        const navValues = recentChanges.map(item => item.unit_nav);
        const growthValues = recentChanges.map(item => item.daily_growth_value);
        
        // 反转数据，让日期从旧到新
        const reversedDates = [...dates].reverse();
        const reversedNavValues = [...navValues].reverse();
        const reversedGrowthValues = [...growthValues].reverse();
        
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
                            <table class="funds-table" style="font-size: 12px; width: 100%;">
                                <thead>
                                    <tr>
                                        <th>日期</th>
                                        <th>单位净值</th>
                                        <th>日增长率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recentChanges.map(item => {
                                        const growthClass = item.daily_growth_value >= 0 ? 'profit-positive' : 'profit-negative';
                                        return `
                                            <tr>
                                                <td>${item.date}</td>
                                                <td>${item.unit_nav.toFixed(4)}</td>
                                                <td class="${growthClass}">${item.daily_growth}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
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

        // 销毁之前的图表实例
        if (this.chart) {
            this.chart.destroy();
        }

        try {
            // 创建新的图表
            this.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: '单位净值',
                            data: navValues,
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            yAxisID: 'y',
                            tension: 0.4
                        },
                        {
                            label: '日增长率(%)',
                            data: growthValues,
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            borderWidth: 2,
                            fill: false,
                            yAxisID: 'y1',
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: `${fundName} (${fundCode}) 净值走势`,
                            font: {
                                size: 16
                            }
                        },
                        legend: {
                            display: true,
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
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
                                display: true,
                                text: '日期'
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: '单位净值'
                            },
                            ticks: {
                                callback: function(value) {
                                    return value.toFixed(4);
                                }
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: '日增长率(%)'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                            ticks: {
                                callback: function(value) {
                                    return value.toFixed(2) + '%';
                                }
                            }
                        }
                    }
                }
            });
            
            console.log('图表渲染成功');
        } catch (error) {
            console.error('图表渲染失败:', error);
            // 显示错误信息
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
        
        console.log(`搜索基金: "${keyword}"`);
        
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
                console.log(`搜索成功，找到 ${data.length} 个结果`);
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
    console.log('页面加载完成，初始化应用...');
    window.app = new FundManagerApp();
});