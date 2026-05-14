/* ---- Mine Page (我的) ---- */
(function() {
    const { Auth, apiPut, Router, showToast, escapeHtml } = window.app;

    let editingNickname = false;

    Router.register('mine', function(params) {
        const container = document.getElementById('page-mine');
        const user = Auth.user || {};
        const nickname = user.nickname || user.username || '未登录';
        const createdAt = user.created_at;
        let days = 0;
        if (createdAt) {
            const diff = Date.now() - new Date(createdAt).getTime();
            days = Math.max(0, Math.floor(diff / 86400000));
        }

        container.innerHTML = `
            <div class="user-card">
                <div class="avatar">&#128054;</div>
                <div class="user-info">
                    <div id="nicknameDisplay">
                        <span class="nickname" id="nicknameText" onclick="startEditNick()">${escapeHtml(nickname)}</span>
                    </div>
                    <div id="nicknameEdit" class="hidden">
                        <input type="text" class="nickname-input" id="nicknameInput" value="${escapeHtml(nickname)}" maxlength="20">
                    </div>
                    <div class="days">已相伴 ${days} 天</div>
                </div>
            </div>

            <div class="menu-section">
                <div class="menu-item" onclick="Router.navigate('/sub/funds')">
                    <span class="menu-icon">&#128202;</span>
                    <span class="menu-label">持仓分布</span>
                    <span class="menu-arrow">&gt;</span>
                </div>
                <div class="menu-item" onclick="Router.navigate('/sub/fund-manage')">
                    <span class="menu-icon">&#128221;</span>
                    <span class="menu-label">基金管理</span>
                    <span class="menu-arrow">&gt;</span>
                </div>
                <div class="menu-item" onclick="Router.navigate('/sub/calendar')">
                    <span class="menu-icon">&#128197;</span>
                    <span class="menu-label">收益日历</span>
                    <span class="menu-arrow">&gt;</span>
                </div>
            </div>

            <div class="menu-section">
                <div class="menu-item" onclick="Router.navigate('/sub/ranking')">
                    <span class="menu-icon">&#127942;</span>
                    <span class="menu-label">排行榜</span>
                    <span class="menu-arrow">&gt;</span>
                </div>
                <div class="menu-item" onclick="Router.navigate('/sub/sector')">
                    <span class="menu-icon">&#127961;</span>
                    <span class="menu-label">板块行情</span>
                    <span class="menu-arrow">&gt;</span>
                </div>
            </div>

            <div class="menu-section">
                <div class="menu-item" onclick="doLogout()">
                    <span class="menu-icon">&#128682;</span>
                    <span class="menu-label" style="color:#ff4d4f">退出登录</span>
                </div>
            </div>

            <div class="version-info">JJBond H5 v1.0.0</div>
        `;

        // Bind nickname input blur
        const input = document.getElementById('nicknameInput');
        if (input) {
            input.addEventListener('blur', () => saveNickname(input.value.trim()));
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        }
    });

    window.startEditNick = function() {
        const display = document.getElementById('nicknameDisplay');
        const edit = document.getElementById('nicknameEdit');
        const input = document.getElementById('nicknameInput');
        if (display && edit && input) {
            display.classList.add('hidden');
            edit.classList.remove('hidden');
            input.focus();
            input.select();
        }
    };

    async function saveNickname(nick) {
        const display = document.getElementById('nicknameDisplay');
        const edit = document.getElementById('nicknameEdit');
        const text = document.getElementById('nicknameText');

        if (!nick) {
            edit.classList.add('hidden');
            display.classList.remove('hidden');
            return;
        }

        try {
            await apiPut('/users/me/info', { nickname: nick });
            const user = Auth.user;
            if (user) { user.nickname = nick; Auth.user = user; }
            text.textContent = nick;
            showToast('昵称已更新', 'success');
        } catch (e) {
            showToast(e.message || '更新失败', 'error');
        }

        edit.classList.add('hidden');
        display.classList.remove('hidden');
    }

    window.doLogout = async function() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + Auth.token },
                credentials: 'same-origin'
            });
        } catch {}
        Auth.clear();
        window.location.href = 'login.html';
    };
})();
