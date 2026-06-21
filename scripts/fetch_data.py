import requests
import json
import time
import os
from datetime import datetime

# Set up headers to pretend to be a browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
}

def fetch_json(url, retries=3):
    for i in range(retries):
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            res.raise_for_status()
            return res.json()
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            time.sleep(2)
    return None

def process_twse():
    print("Fetching TWSE data...")
    # 1. Main Data (STOCK_DAY_ALL via OpenAPI is reliable)
    twse_main = fetch_json("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL")
    if not twse_main:
        return {}

    # 2. Intraday Odd Lot (TWTCGU via main site since OpenAPI is often empty)
    twse_intraday_odd = fetch_json("https://www.twse.com.tw/exchangeReport/TWTCGU?response=json")
    
    # 3. After-hours Odd Lot (TWT53U via main site)
    twse_after_odd = fetch_json("https://www.twse.com.tw/exchangeReport/TWT53U?response=json")

    # Parse odd lots into dictionaries for quick lookup
    odd_vols = {}
    odd_trades = {}
    
    def add_odd(data_json, code_idx, vol_idx, trade_idx):
        if not data_json or 'data' not in data_json: return
        for row in data_json['data']:
            code = row[code_idx].strip()
            try:
                vol = int(row[vol_idx].replace(',', ''))
                trades = int(row[trade_idx].replace(',', ''))
                odd_vols[code] = odd_vols.get(code, 0) + vol
                odd_trades[code] = odd_trades.get(code, 0) + trades
            except ValueError:
                pass

    if twse_intraday_odd and 'data' in twse_intraday_odd:
        # TWTCGU fields: ['證券代號', '證券名稱', '成交股數', '成交金額', '成交筆數', ...]
        add_odd(twse_intraday_odd, 0, 2, 4)
    elif twse_intraday_odd and 'tables' in twse_intraday_odd:
        for table in twse_intraday_odd['tables']:
            add_odd(table, 0, 2, 4)
            
    if twse_after_odd and 'data' in twse_after_odd:
        # TWT53U fields: ['證券代號', '證券名稱', '成交股數', '成交筆數', ...]
        add_odd(twse_after_odd, 0, 2, 3)
    elif twse_after_odd and 'tables' in twse_after_odd:
        for table in twse_after_odd['tables']:
            add_odd(table, 0, 2, 3)

    results = {}
    for item in twse_main:
        code = item['Code'].strip()
        name = item['Name'].strip()
        
        # 1. 排除代號不是 4 位數字的標的 (排除 ETF、權證等)
        if not (len(code) == 4 and code.isdigit()):
            continue
            
        try:
            total_vol = int(item['TradeVolume'].replace(',', ''))
            total_trades = int(item['Transaction'].replace(',', ''))
            total_value = int(item['TradeValue'].replace(',', ''))
            close_price = float(item['ClosingPrice'].replace(',', '')) if item['ClosingPrice'] else 0.0
        except ValueError:
            continue
            
        if total_trades == 0:
            continue

        # Subtract odd lots
        reg_vol = total_vol - odd_vols.get(code, 0)
        reg_trades = total_trades - odd_trades.get(code, 0)
        
        if reg_trades <= 0 or reg_vol <= 0:
            continue
            
        avg_vol_shares = reg_vol / reg_trades
        avg_vol_lots = avg_vol_shares / 1000.0  # Convert to 張
        
        results[code] = {
            'code': code,
            'name': name,
            'market': '上市',
            'close': close_price,
            'value': total_value,
            'avg_lots_per_trade': round(avg_vol_lots, 2),
            'reg_trades': reg_trades,
            'reg_vol_lots': round(reg_vol / 1000.0, 2)
        }
    return results

def process_tpex():
    print("Fetching TPEx data...")
    # TPEx main quotes
    tpex_main_api = fetch_json("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes")
    
    # TPEx odd lot APIs
    tpex_intraday = fetch_json("https://www.tpex.org.tw/web/stock/aftertrading/intraday_odd_lot/stk_quote_result.php?l=zh-tw&o=json")
    tpex_after = fetch_json("https://www.tpex.org.tw/web/stock/aftertrading/odd_trading_info/stk_quote_result.php?l=zh-tw&o=json")
    
    odd_vols = {}
    odd_trades = {}
    
    def add_odd_tpex(data_json, code_idx, vol_idx, trade_idx):
        if not data_json: return
        
        # New format uses tables
        if 'tables' in data_json:
            for table in data_json['tables']:
                if 'data' in table:
                    for row in table['data']:
                        code = row[code_idx].strip()
                        try:
                            vol = int(row[vol_idx].replace(',', ''))
                            trades = int(row[trade_idx].replace(',', ''))
                            odd_vols[code] = odd_vols.get(code, 0) + vol
                            odd_trades[code] = odd_trades.get(code, 0) + trades
                        except ValueError:
                            pass
        elif 'aaData' in data_json:
            for row in data_json['aaData']:
                code = row[code_idx].strip()
                try:
                    vol = int(row[vol_idx].replace(',', ''))
                    trades = int(row[trade_idx].replace(',', ''))
                    odd_vols[code] = odd_vols.get(code, 0) + vol
                    odd_trades[code] = odd_trades.get(code, 0) + trades
                except ValueError:
                    pass

    # Intraday fields: ['代號', '名稱', '成交股數', '成交金額', '成交筆數', ...]
    add_odd_tpex(tpex_intraday, 0, 2, 4)
    # After-hours fields: ['代號', '名稱', '成交股數', '成交金額', '成交筆數', ...]
    add_odd_tpex(tpex_after, 0, 2, 4)

    results = {}
    if not tpex_main_api: return results
    
    for item in tpex_main_api:
        code = item.get('SecuritiesCompanyCode', '').strip()
        name = item.get('CompanyName', '').strip()
        
        # 1. 排除代號不是 4 位數字的標的
        if not (len(code) == 4 and code.isdigit()):
            continue
            
        try:
            total_vol = int(item.get('TradingShares', '0').replace(',', ''))
            total_trades = int(item.get('TransactionNumber', '0').replace(',', ''))
            total_value = int(item.get('TransactionAmount', '0').replace(',', ''))
            close_price = float(item.get('Close', '0').replace(',', '')) if item.get('Close', '0') else 0.0
        except ValueError:
            continue
            
        if total_trades == 0:
            continue

        # Subtract odd lots
        reg_vol = total_vol - odd_vols.get(code, 0)
        reg_trades = total_trades - odd_trades.get(code, 0)
        
        if reg_trades <= 0 or reg_vol <= 0:
            continue
            
        avg_vol_shares = reg_vol / reg_trades
        avg_vol_lots = avg_vol_shares / 1000.0
        
        results[code] = {
            'code': code,
            'name': name,
            'market': '櫃買',
            'close': close_price,
            'value': total_value,
            'avg_lots_per_trade': round(avg_vol_lots, 2),
            'reg_trades': reg_trades,
            'reg_vol_lots': round(reg_vol / 1000.0, 2)
        }
    return results

def main():
    twse_data = process_twse()
    tpex_data = process_tpex()
    
    all_data = list(twse_data.values()) + list(tpex_data.values())
    
    # Sort by avg_lots_per_trade descending
    all_data.sort(key=lambda x: x['avg_lots_per_trade'], reverse=True)
    
    output = {
        'update_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'data': all_data
    }
    
    # Ensure directory exists if needed, but we output to root for pages
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully saved {len(all_data)} records to data.json")

if __name__ == "__main__":
    main()
