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


    // Trigger manual update via Google Apps Script Webhook with Polling
    if (forceUpdateBtn) {
        forceUpdateBtn.addEventListener('click', async () => {
            const GAS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbw5SszsrQ_5LKll4dYxeJGn7N86SjR9PmBIzmSjsNo-ZNusHzOqNhgMDQ8lKp6U5m5W/exec'; 

            if (!GAS_WEBHOOK_URL) {
                alert('系統尚未設定 Webhook 網址，請開發者設定後再試。');
                return;
            }

            const modal = document.getElementById('update-modal');
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            const modalTitle = document.getElementById('modal-title');
            const modalDesc = document.getElementById('modal-desc');

            // 取得目前的更新時間，用來對比是否抓取完成
            let oldUpdateTime = "";
            try {
                const initRes = await fetch(`data.json?t=${new Date().getTime()}`);
                const initData = await initRes.json();
                oldUpdateTime = initData.update_time;
            } catch (e) {
                console.warn("無法取得初始資料時間", e);
            }

            // 顯示 Modal
            modal.classList.remove('hidden');
            progressBar.style.width = '5%';
            progressText.innerText = '5%';
            modalTitle.innerText = '正在通知伺服器...';
            modalDesc.innerText = '正在喚醒爬蟲程式，請稍候...';

            let isError = false;

            try {
                // 發送請求給 GAS 觸發 GitHub Action
                const response = await fetch(GAS_WEBHOOK_URL);
                const result = await response.json();

                if (!result.success) {
                    throw new Error('觸發失敗: ' + result.code);
                }
            } catch (error) {
                console.error("Webhook error:", error);
                isError = true;
                modalTitle.innerText = '更新發生錯誤';
                modalDesc.innerText = '網路連線異常或權限設定錯誤，請先關閉並檢查。';
                progressBar.style.background = '#ef4444'; // 紅色
                setTimeout(() => modal.classList.add('hidden'), 5000);
                return;
            }

            // 成功觸發，開始跑條與輪詢 (Polling)
            modalTitle.innerText = '正在抓取證交所最新資料...';
            modalDesc.innerText = '這大約需要 1 到 2 分鐘，完成後會自動幫您重整畫面！';
            
            let progress = 10;
            progressBar.style.width = '10%';
            progressText.innerText = '10%';

            // 模擬進度條前進
            const progressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.floor(Math.random() * 5) + 1; // 隨機增加 1~5%
                    if (progress > 90) progress = 90;
                    progressBar.style.width = progress + '%';
                    progressText.innerText = progress + '%';
                }
            }, 3000);

            // 每 10 秒檢查一次 data.json 是否更新
            const checkUpdateInterval = setInterval(async () => {
                try {
                    const checkRes = await fetch(`data.json?t=${new Date().getTime()}`);
                    if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        if (checkData.update_time !== oldUpdateTime && checkData.update_time) {
                            // 發現更新完成！
                            clearInterval(progressInterval);
                            clearInterval(checkUpdateInterval);
                            
                            progressBar.style.width = '100%';
                            progressText.innerText = '100%';
                            modalTitle.innerText = '更新完成！';
                            modalDesc.innerText = '資料已是最新的，即將為您重新整理畫面...';
                            progressBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)'; // 綠色
                            
                            setTimeout(() => {
                                window.location.reload(true);
                            }, 1500);
                        }
                    }
                } catch (e) {
                    // 忽略檢查錯誤，繼續等
                }
            }, 10000);
            
            // 設定一個最長等待時間 (3分鐘)，防止無限等待
            setTimeout(() => {
                clearInterval(progressInterval);
                clearInterval(checkUpdateInterval);
                if (modalTitle.innerText !== '更新完成！') {
                    modalTitle.innerText = '更新可能已經完成';
                    modalDesc.innerText = '等待時間過長，即將為您重新整理畫面確認...';
                    setTimeout(() => {
                        window.location.reload(true);
                    }, 2000);
                }
            }, 180000);
        });
    }
});
