# gap_db

GAP 台灣發貨倉庫（DC）成立前期的系統串接前導專案。

## 專案用途

GAP 在台灣成立發貨倉庫前，需要先把 GAP 端的 EDI 資料和倉儲管理系統（WMS）串接起來。
目前還沒有完整、正確的串接文件格式，所以這個專案用來：

1. **先行試錯**：依現有的規格文件和範例檔，建立資料庫表格與匯入程式，實際匯入拋檔資料
2. **比對修正**：拿 WMS 拋檔和 GAP 原始 EDI 檔逐欄比對，找出欄位的真正意義與格式差異，修正表格結構
3. **產出正確的串接文件**：反覆修正，直到欄位定義和資料格式都確認無誤
4. **轉交**：把確認後的串接文件、資料庫結構與匯入程式，轉交給實際負責的主要開發人員

因此這裡的表格結構與欄位名稱都還在調整中。尚未確認的欄位和需要注意的資料問題，記錄在 [`注意事項.md`](./注意事項.md)。

## 串接的資料

GAP 以 X12 EDI 送出資料，經 WMS 轉檔成 `|` 分隔的拋檔後匯入資料庫：

| GAP EDI | 內容 | WMS 拋檔 | 資料表 |
|---|---|---|---|
| 832 | 商品主檔（新增 / 修改 / 刪除） | `.im` | `gapwmc_832_item` |
| 850 | 採購單（PO） | `.rc`（RCPHDR / RCPDETL / RCPCTNDR） | `gapwmc_850_header` / `gapwmc_850_detail` / `gapwmc_850_carton` |

另有 `item_master` 表，依 3M 的 ItemMaster mapping spec（SCALE ITM 格式）建立，目前保留作為參考，沒有資料。

## 專案內容

| 檔案 | 說明 |
|---|---|
| [`gap_db.sql`](./gap_db.sql) | PostgreSQL 資料表定義（在 pgAdmin 執行），每個欄位都有註解說明來源 |
| [`scripts/import.mjs`](./scripts/import.mjs) | WMS 拋檔（`.im` / `.rc`）匯入程式 |
| [`注意事項.md`](./注意事項.md) | 尚未確認的欄位、資料格式的注意事項 |
| `doc/` | GAP 規格文件與範例拋檔（不放進 repo） |

## 使用方式

### 1. 建立資料庫

在 pgAdmin 連到 `postgres` 資料庫，先單獨執行：

```sql
CREATE DATABASE gap_db ENCODING 'UTF8';
```

再選取 `gap_db`，開啟 Query Tool 執行 [`gap_db.sql`](./gap_db.sql)。

### 2. 設定連線

在專案根目錄建立 `.env`（已加入 `.gitignore`，不會被 commit）：

```
PGHOST=localhost
PGPORT=5432
PGDATABASE=gap_db
PGUSER=postgres
PGPASSWORD=你的密碼
```

### 3. 匯入拋檔

```bash
pnpm install
pnpm run import-wms <檔案...>               # 匯入
pnpm run import-wms --dry-run <檔案...>     # 只檢查，不寫入
pnpm run import-wms --replace <檔案...>     # 已匯入過的檔案，刪除舊資料後重新匯入
```

- 依檔案第一行自動判斷是 `.im` 還是 `.rc`
- 每個檔案各自一個交易，任何一行出錯（欄數不符、型別錯誤等）整個檔案都不會寫入
- 欄數和表格定義不符的檔案會被拒絕，代表拋檔格式有變動，需要先更新 `gap_db.sql`

## 桌面應用程式

專案同時包含一個 Tauri + React 桌面應用程式的架構（`src/`、`src-tauri/`），由 [Modern Desktop App Template](https://github.com/elibroftw/modern-desktop-app-template) 建立，目前仍是範本狀態，尚未連接資料庫。

```bash
pnpm dev      # 開發模式
pnpm rls      # 建置正式版
```
