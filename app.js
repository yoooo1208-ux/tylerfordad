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

    // Helper to fetch JSON via CORS proxy
    const fetchJsonProxied = async (url) => {
        try {
            // Using allorigins as a reliable CORS proxy
            const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.error('Error fetching proxied data:', url, e);
            return null;
        }
    };

    // Helper to format date
    const getFormattedDate = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    };

    // Process TWSE
    const processTwse = async () => {
        const twse_api_data = await fetchJsonProxied("https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&type=ALLBUT0999");
        let twse_main = [];
        if (twse_api_data && twse_api_data.tables) {
            for (const table of twse_api_data.tables) {
                if (table.fields && table.fields.length >= 9 && table.fields[0] === '證券代號') {
                    twse_main = table.data || [];
                    break;
                }
            }
        }
        if (twse_main.length === 0) return {};

        const twse_intraday_odd = await fetchJsonProxied("https://www.twse.com.tw/exchangeReport/TWTC7U?response=json");
        const odd_vols = {};
        const odd_trades = {};
        
        if (twse_intraday_odd && twse_intraday_odd.data) {
            twse_intraday_odd.data.forEach(row => {
                const code = String(row[0]).trim();
                const vol = parseInt(String(row[2]).replace(/,/g, ''), 10) || 0;
                const trades = parseInt(String(row[3]).replace(/,/g, ''), 10) || 0;
                odd_vols[code] = (odd_vols[code] || 0) + vol;
                odd_trades[code] = (odd_trades[code] || 0) + trades;
            });
        }

        const results = {};
        twse_main.forEach(row => {
            const code = String(row[0]).trim();
            const name = String(row[1]).trim();
            if (code.length !== 4 || isNaN(code)) return;

            const total_vol = parseInt(String(row[2]).replace(/,/g, ''), 10) || 0;
            const total_trades = parseInt(String(row[3]).replace(/,/g, ''), 10) || 0;
            let close_price_str = String(row[8]).replace(/,/g, '').trim();
            const close_price = (close_price_str && close_price_str !== '--') ? parseFloat(close_price_str) : 0.0;

            const sign_html = String(row[9]);
            const change_val_str = String(row[10]).trim();
            let change = 0.0;
            if (change_val_str && change_val_str !== 'X') {
                const val = parseFloat(change_val_str) || 0.0;
                if (sign_html.includes('red') || sign_html.includes('+')) change = val;
                else if (sign_html.includes('green') || sign_html.includes('-')) change = -val;
            }

            const ref_price = close_price - change;
            const change_pct = ref_price > 0 ? (change / ref_price * 100) : 0.0;

            if (total_trades === 0) return;

            const odd_v = odd_vols[code] || 0;
            const odd_t = odd_trades[code] || 0;

            const reg_vol = total_vol - odd_v;
            const reg_trades = total_trades - odd_t;

            if (reg_trades <= 0 || reg_vol <= 0) return;

            const avg_vol_shares = reg_vol / reg_trades;
            const avg_vol_lots = avg_vol_shares / 1000.0;
            const avg_trade_value = avg_vol_shares * close_price;

            results[code] = {
                code, name, market: '上市', close: close_price,
                avg_value: avg_trade_value,
                avg_lots_per_trade: Math.round(avg_vol_lots * 100) / 100,
                change_pct: Math.round(change_pct * 100) / 100,
                reg_trades,
                reg_vol_lots: Math.round((reg_vol / 1000.0) * 100) / 100,
                odd_vol_lots: Math.round((odd_v / 1000.0) * 100) / 100,
                odd_trades: odd_t
            };
        });
        return results;
    };

    // Process TPEx
    const processTpex = async () => {
        const tpex_main_api = await fetchJsonProxied("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes");
        let tpex_intraday = await fetchJsonProxied("https://www.tpex.org.tw/openapi/v1/tpex_odd_stock");
        if (!tpex_intraday || tpex_intraday.length === 0) tpex_intraday = null;

        const odd_vols = {};
        const odd_trades = {};

        if (tpex_intraday) {
            tpex_intraday.forEach(row => {
                const code = String(row.SecuritiesCompanyCode || '').trim();
                const vol = parseInt(String(row.TradeVolume || '0').replace(/,/g, ''), 10) || 0;
                const trades = parseInt(String(row.NumberOfTransactions || '0').replace(/,/g, ''), 10) || 0;
                odd_vols[code] = (odd_vols[code] || 0) + vol;
                odd_trades[code] = (odd_trades[code] || 0) + trades;
            });
        }

        const results = {};
        if (!tpex_main_api) return results;

        tpex_main_api.forEach(item => {
            const code = String(item.SecuritiesCompanyCode || '').trim();
            const name = String(item.CompanyName || '').trim();
            if (code.length !== 4 || isNaN(code)) return;

            const total_vol = parseInt(String(item.TradingShares || '0').replace(/,/g, ''), 10) || 0;
            const total_trades = parseInt(String(item.TransactionNumber || '0').replace(/,/g, ''), 10) || 0;
            const close_price = item.Close ? parseFloat(String(item.Close).replace(/,/g, '')) : 0.0;

            const change_str = String(item.Change || '').trim();
            let change = 0.0;
            if (change_str && change_str !== 'X') {
                change = parseFloat(change_str) || 0.0;
            }

            const ref_price = close_price - change;
            const change_pct = ref_price > 0 ? (change / ref_price * 100) : 0.0;

            if (total_trades === 0) return;

            const odd_v = odd_vols[code] || 0;
            const odd_t = odd_trades[code] || 0;

            const reg_vol = total_vol - odd_v;
            const reg_trades = total_trades - odd_t;

            if (reg_trades <= 0 || reg_vol <= 0) return;

            const avg_vol_shares = reg_vol / reg_trades;
            const avg_vol_lots = avg_vol_shares / 1000.0;
            const avg_trade_value = avg_vol_shares * close_price;

            results[code] = {
                code, name, market: '櫃買', close: close_price,
                avg_value: avg_trade_value,
                avg_lots_per_trade: Math.round(avg_vol_lots * 100) / 100,
                change_pct: Math.round(change_pct * 100) / 100,
                reg_trades,
                reg_vol_lots: Math.round((reg_vol / 1000.0) * 100) / 100,
                odd_vol_lots: Math.round((odd_v / 1000.0) * 100) / 100,
                odd_trades: odd_t
            };
        });
        return results;
    };

    // Live update function
    const fetchLiveMarketData = async () => {
        try {
            noDataState.classList.add('hidden');
            loadingState.classList.remove('hidden');
            tableBody.innerHTML = '';
            
            const [twse_data, tpex_data] = await Promise.all([processTwse(), processTpex()]);
            
            let all_data = [...Object.values(twse_data), ...Object.values(tpex_data)];
            if (all_data.length === 0) {
                throw new Error("無法取得有效資料");
            }
            
            stockData = all_data;
            filteredData = [...stockData];
            
            // Sort
            sortData(currentSort.key, currentSort.desc);
            
            updateTimeEl.innerHTML = `<span class="indicator"></span> 更新時間：${getFormattedDate()} (即時抓取)`;
            loadingState.classList.add('hidden');
            renderTable();
            return true;
        } catch (error) {
            console.error("Live fetch error:", error);
            alert("即時抓取失敗，請稍後再試！");
            loadingState.classList.add('hidden');
            // Re-render old data if any
            if (stockData.length > 0) renderTable();
            return false;
        }
    };

    // Trigger manual update via live fetch
    if (forceUpdateBtn) {
        forceUpdateBtn.addEventListener('click', async () => {
            forceUpdateBtn.disabled = true;
            forceUpdateBtn.textContent = '抓取中...';
            forceUpdateBtn.style.opacity = '0.7';
            forceUpdateBtn.style.cursor = 'wait';

            await fetchLiveMarketData();

            forceUpdateBtn.disabled = false;
            forceUpdateBtn.textContent = '手動更新';
            forceUpdateBtn.style.opacity = '1';
            forceUpdateBtn.style.cursor = 'pointer';
        });
    }
});
