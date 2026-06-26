document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('table-body');
    const updateTimeEl = document.getElementById('update-time');
    const searchInput = document.getElementById('search-input');
    const loadingState = document.getElementById('loading');
    const noDataState = document.getElementById('no-data');
    const sortHeaders = document.querySelectorAll('.sortable');
    const forceUpdateBtn = document.getElementById('force-update-btn');

    let stockData = [];
    let filteredData = [];
    let currentSort = { key: 'avg_lots', desc: true };

    // Format numbers with commas
    const formatNumber = (num) => {
        return new Intl.NumberFormat('zh-TW').format(num);
    };

    // Format large numbers (e.g., billions)
    const formatValue = (num) => {
        if (num >= 100000000) {
            return (num / 100000000).toFixed(2) + ' 億';
        } else if (num >= 10000) {
            return (num / 10000).toFixed(2) + ' 萬';
        }
        return formatNumber(num);
    };

    // Render table
    const renderTable = () => {
        tableBody.innerHTML = '';
        
        if (filteredData.length === 0) {
            noDataState.classList.remove('hidden');
            return;
        }
        
        noDataState.classList.add('hidden');

        filteredData.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            const marketClass = item.market === '上市' ? 'twse' : 'tpex';
            
            let changeHtml = '<td class="value-column text-neutral">-</td>';
            if (item.change_pct !== undefined) {
                const pct = item.change_pct;
                const pctStr = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
                if (pct >= 9.5) {
                    changeHtml = `<td><span class="value-column bg-limit-up">${pctStr}</span></td>`;
                } else if (pct <= -9.5) {
                    changeHtml = `<td><span class="value-column bg-limit-down">${pctStr}</span></td>`;
                } else if (pct > 0) {
                    changeHtml = `<td class="value-column text-up">${pctStr}</td>`;
                } else if (pct < 0) {
                    changeHtml = `<td class="value-column text-down">${pctStr}</td>`;
                } else {
                    changeHtml = `<td class="value-column text-neutral">0.00%</td>`;
                }
            }

            tr.innerHTML = `
                <td class="rank">${index + 1}</td>
                <td class="code">${item.code}</td>
                <td class="name">${item.name}</td>
                <td><span class="market-badge ${marketClass}">${item.market}</span></td>
                <td class="value-column">${item.close.toFixed(2)}</td>
                ${changeHtml}
                <td class="value-column">${formatValue(item.avg_value)}</td>
                <td class="highlight-avg">${item.avg_lots_per_trade.toFixed(2)}</td>
                <td class="value-column" style="color: var(--text-secondary);">${formatNumber(Math.round(item.odd_vol_lots))}</td>
                <td class="value-column" style="color: var(--text-secondary);">${formatNumber(item.odd_trades)}</td>
                <td class="value-column">${formatNumber(Math.round(item.reg_vol_lots))}</td>
                <td class="value-column">${formatNumber(item.reg_trades)}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Sort data
    const sortData = (key, desc) => {
        filteredData.sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
            
            // Map custom keys to data properties
            if (key === 'avg_lots') valA = a.avg_lots_per_trade, valB = b.avg_lots_per_trade;
            if (key === 'reg_vol') valA = a.reg_vol_lots, valB = b.reg_vol_lots;
            if (key === 'odd_vol') valA = a.odd_vol_lots, valB = b.odd_vol_lots;
            if (key === 'odd_trades') valA = a.odd_trades, valB = b.odd_trades;
            if (key === 'change_pct') valA = a.change_pct || 0, valB = b.change_pct || 0;

            if (valA < valB) return desc ? 1 : -1;
            if (valA > valB) return desc ? -1 : 1;
            return 0;
        });
    };

    // Handle sort click
    sortHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const key = header.getAttribute('data-sort');
            
            // Update sort state
            if (currentSort.key === key) {
                currentSort.desc = !currentSort.desc;
            } else {
                currentSort.key = key;
                currentSort.desc = true;
            }

            // Update UI
            sortHeaders.forEach(h => {
                const icon = h.querySelector('.sort-icon');
                icon.className = 'sort-icon';
                icon.textContent = '';
                if (h.getAttribute('data-sort') === key) {
                    icon.classList.add(currentSort.desc ? 'desc' : 'asc');
                    icon.textContent = currentSort.desc ? '▼' : '▲';
                }
            });

            sortData(currentSort.key, currentSort.desc);
            renderTable();
        });
    });

    // Handle search
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        
        if (term === '') {
            filteredData = [...stockData];
        } else {
            filteredData = stockData.filter(item => 
                item.code.toLowerCase().includes(term) || 
                item.name.toLowerCase().includes(term)
            );
        }
        
        sortData(currentSort.key, currentSort.desc);
        renderTable();
    });

    // Fetch data
    const fetchData = async () => {
        try {
            // Add a timestamp to prevent browser caching so it always checks for the latest data.json
            const response = await fetch(`data.json?t=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const result = await response.json();
            stockData = result.data;
            filteredData = [...stockData];
            
            // Default sort by avg_lots desc
            sortData('avg_lots', true);
            
            // Update initial UI state for sort icons
            sortHeaders.forEach(h => {
                const icon = h.querySelector('.sort-icon');
                icon.className = 'sort-icon';
                icon.textContent = '';
                if (h.getAttribute('data-sort') === 'avg_lots') {
                    icon.classList.add('desc');
                    icon.textContent = '▼';
                }
            });
            
            updateTimeEl.innerHTML = `<span class="indicator"></span> 更新時間：${result.update_time}`;
            loadingState.classList.add('hidden');
            renderTable();
            
        } catch (error) {
            console.error('Error fetching data:', error);
            loadingState.innerHTML = `
                <p style="color: #ef4444;">載入失敗，請稍後再試。</p>
                <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">如果你是在本地直接打開 HTML，可能會有 CORS 或是找不到檔案的問題。建議使用 VS Code Live Server 或上傳到 Github Pages 後觀看。</p>
            `;
        }
    };

    fetchData();

    // Trigger manual update via GitHub Action
    if (forceUpdateBtn) {
        forceUpdateBtn.addEventListener('click', async () => {
            // 請替換為您的 GitHub Fine-grained Personal Access Token
            // ⚠️ 警告：這會公開在網頁上，請確保該 Token "只有" tylerfordad 這個 repo 的 Actions (Read and Write) 權限
            const GITHUB_TOKEN = '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'; 
            const REPO_OWNER = 'yoooo1208-ux';
            const REPO_NAME = 'tylerfordad';
            const WORKFLOW_ID = 'daily_update.yml';
            const BRANCH = 'main';

            if (GITHUB_TOKEN === 'YOUR_GITHUB_TOKEN_HERE') {
                alert('請先在 app.js 中設定您的 GitHub Token 才能使用此功能！(請看程式碼註解)');
                return;
            }

            forceUpdateBtn.disabled = true;
            forceUpdateBtn.textContent = '觸發中...';
            forceUpdateBtn.style.opacity = '0.7';
            forceUpdateBtn.style.cursor = 'not-allowed';

            try {
                const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}/dispatches`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `Bearer ${GITHUB_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ref: BRANCH
                    })
                });

                if (response.ok || response.status === 204) {
                    alert('已成功觸發更新！GitHub 伺服器約需 1~2 分鐘抓取資料，請稍後再重整網頁。');
                } else {
                    const errData = await response.json().catch(() => ({}));
                    console.error('GitHub API Error:', errData);
                    alert(`觸發失敗 (${response.status})：${errData.message || '請檢查 Token 權限'}`);
                }
            } catch (error) {
                console.error('Trigger Error:', error);
                alert('網路連線錯誤，無法觸發更新。');
            } finally {
                forceUpdateBtn.disabled = false;
                forceUpdateBtn.textContent = '手動更新';
                forceUpdateBtn.style.opacity = '1';
                forceUpdateBtn.style.cursor = 'pointer';
            }
        });
    }
});
