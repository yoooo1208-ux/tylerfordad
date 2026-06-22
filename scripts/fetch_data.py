import requests
import json
import time
from datetime import datetime

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def fetch_json(url, retries=3):
    for i in range(retries):
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            res.raise_for_status()
            data = res.json()
            if data: return data
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            time.sleep(2)
    return None

def process_twse():
    print("Fetching TWSE data...")
    # Use MI_INDEX instead of STOCK_DAY_ALL from OpenAPI, as OpenAPI is often delayed
    twse_api_data = fetch_json("https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&type=ALLBUT0999")
    twse_main = []
    if twse_api_data and 'tables' in twse_api_data:
        for table in twse_api_data['tables']:
            fields = table.get('fields', [])
            if len(fields) >= 9 and fields[0] == '證券代號':
                twse_main = table.get('data', [])
                break

    if not twse_main:
        return {}

    # 盤中零股 TWTC7U
    twse_intraday_odd = fetch_json("https://www.twse.com.tw/exchangeReport/TWTC7U?response=json")
    
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
        # TWTC7U fields: [0:證券代號, 1:證券名稱, 2:成交股數, 3:成交筆數, 4:成交金額]
        add_odd(twse_intraday_odd, 0, 2, 3)

    results = {}
    for row in twse_main:
        code = row[0].strip()
        name = row[1].strip()
        
        if not (len(code) == 4 and code.isdigit()):
            continue
            
        try:
            total_vol = int(row[2].replace(',', ''))
            total_trades = int(row[3].replace(',', ''))
            close_price_str = row[8].replace(',', '').strip()
            # Handle cases where closing price is empty, '--' or contains tags
            if close_price_str and close_price_str != '--':
                close_price = float(close_price_str)
            else:
                close_price = 0.0

            sign_html = row[9]
            change_val_str = row[10].strip()
            change = 0.0
            if change_val_str and change_val_str != 'X':
                try:
                    val = float(change_val_str)
                    if 'red' in sign_html or '+' in sign_html:
                        change = val
                    elif 'green' in sign_html or '-' in sign_html:
                        change = -val
                except ValueError:
                    pass
            
            ref_price = close_price - change
            change_pct = (change / ref_price * 100) if ref_price > 0 else 0.0

        except ValueError:
            continue
            
        if total_trades == 0:
            continue

        odd_v = odd_vols.get(code, 0)
        odd_t = odd_trades.get(code, 0)

        reg_vol = total_vol - odd_v
        reg_trades = total_trades - odd_t
        
        if reg_trades <= 0 or reg_vol <= 0:
            continue
            
        avg_vol_shares = reg_vol / reg_trades
        avg_vol_lots = avg_vol_shares / 1000.0
        avg_trade_value = avg_vol_shares * close_price
        
        results[code] = {
            'code': code,
            'name': name,
            'market': '上市',
            'close': close_price,
            'avg_value': avg_trade_value,
            'avg_lots_per_trade': round(avg_vol_lots, 2),
            'change_pct': round(change_pct, 2),
            'reg_trades': reg_trades,
            'reg_vol_lots': round(reg_vol / 1000.0, 2),
            'odd_vol_lots': round(odd_v / 1000.0, 2),
            'odd_trades': odd_t
        }
    return results

def process_tpex():
    print("Fetching TPEx data...")
    tpex_main_api = fetch_json("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes")
    
    # TPEx intraday odd lot via OpenAPI
    tpex_intraday = fetch_json("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_intraday_odd_lot")
    if not tpex_intraday or len(tpex_intraday) == 0:
        # Fallback to general odd stock API if intraday is empty (e.g. weekend)
        tpex_intraday = fetch_json("https://www.tpex.org.tw/openapi/v1/tpex_odd_stock")
    
    odd_vols = {}
    odd_trades = {}
    
    def add_odd_tpex(data_list):
        if not data_list: return
        for row in data_list:
            if isinstance(row, dict):
                code = row.get('SecuritiesCompanyCode', '').strip()
                try:
                    vol = int(row.get('TradeVolume', '0').replace(',', ''))
                    trades = int(row.get('NumberOfTransactions', '0').replace(',', ''))
                    odd_vols[code] = odd_vols.get(code, 0) + vol
                    odd_trades[code] = odd_trades.get(code, 0) + trades
                except ValueError:
                    pass

    add_odd_tpex(tpex_intraday)

    results = {}
    if not tpex_main_api: return results
    
    for item in tpex_main_api:
        code = item.get('SecuritiesCompanyCode', '').strip()
        name = item.get('CompanyName', '').strip()
        
        if not (len(code) == 4 and code.isdigit()):
            continue
            
        try:
            total_vol = int(item.get('TradingShares', '0').replace(',', ''))
            total_trades = int(item.get('TransactionNumber', '0').replace(',', ''))
            close_price = float(item.get('Close', '0').replace(',', '')) if item.get('Close', '0') else 0.0

            change_str = item.get('Change', '').strip()
            change = 0.0
            if change_str and change_str != 'X':
                try:
                    change = float(change_str)
                except ValueError:
                    pass
            
            ref_price = close_price - change
            change_pct = (change / ref_price * 100) if ref_price > 0 else 0.0
        except ValueError:
            continue
            
        if total_trades == 0:
            continue

        odd_v = odd_vols.get(code, 0)
        odd_t = odd_trades.get(code, 0)

        reg_vol = total_vol - odd_v
        reg_trades = total_trades - odd_t
        
        if reg_trades <= 0 or reg_vol <= 0:
            continue
            
        avg_vol_shares = reg_vol / reg_trades
        avg_vol_lots = avg_vol_shares / 1000.0
        avg_trade_value = avg_vol_shares * close_price
        
        results[code] = {
            'code': code,
            'name': name,
            'market': '櫃買',
            'close': close_price,
            'avg_value': avg_trade_value,
            'avg_lots_per_trade': round(avg_vol_lots, 2),
            'change_pct': round(change_pct, 2),
            'reg_trades': reg_trades,
            'reg_vol_lots': round(reg_vol / 1000.0, 2),
            'odd_vol_lots': round(odd_v / 1000.0, 2),
            'odd_trades': odd_t
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
    
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully saved {len(all_data)} records to data.json")

if __name__ == "__main__":
    main()
