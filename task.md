Phase 1 中針對 832 與 850 所設計的相關邏輯。
832 測試項目
請測試 001、002 及 003 Status：
•	003：新增 SKU 時，系統應建立新的 SKU。
•	001：針對既有 SKU 進行更新。
•	002：系統應刪除對應的 SKU，目前設計走向不刪除資料庫，讓USER操作時隱藏不顯示，系統管理員可查詢數據，需要建立employees表格以帳號權限管理。
850 測試項目（相同 PO#）
1.	新增 SKU／Size
2.	刪除 SKU／Size
3.	變更 Item 數量
4.	取消該 PO#
5.	重新啟用該 PO#
6.	未收到 Item Master 即收到 DPO 的情境，系統需觸發警示 Email 通知，可用C:\Users\EZ5279\Documents\gap_db\doc\new_850 檔案夾內的資料做測試，
來觸發警示 Email 通知，此功能暫用google mail 來進行。

---

## 開發任務規劃 (Phase 1: 832 / 850 邏輯)

規劃依據：本文件需求 + `注意事項.md`（欄位不確定性、匯入程式行為）+ 現況程式碼盤點
（`gap_db.sql`、`scripts/import.mjs`、`src-tauri/src/db.rs`、`src/views/*`）。

### 現況盤點（規劃前已確認的事實）

- `gapwmc_832_item.status`（ADD/UPDATE/DELETE）已存在，`import.mjs` 會依 `.im` 檔名判斷並寫入，且**設計上每次匯入一律新增資料列、不覆寫不刪除**（因 `sku` 非唯一 key）。003（新增）、001（更新）就目前匯入機制已可寫入正確的 `status`；尚未驗證的是「查詢/畫面端」如何正確解讀這些歷史列。
- `gapwmc_850_*` 三表也是**每個檔案各自一組交易、append-only**，同一 PO 收到多次拋檔時，資料庫會有多筆 header（用 `source_file` 分辨），沒有「更新既有 PO 狀態」的邏輯；850 測試項目 1-5 都要求觀察「同一 PO# 隨時間變化」，目前完全沒有串連同一 PO 多次拋檔的查詢/比對邏輯。
- 沒有 `employees` 資料表、沒有角色權限機制；`LoginPage.tsx` 目前是寫死帳密（`admin@example.com` / `123456`）的樣板程式碼，尚未接資料庫。
- 專案目前沒有任何寄信套件（Node 端 `package.json` 無 nodemailer 類套件；Rust 端 `Cargo.toml` 無 lettre 類 crate），Email 警示通知功能要從零建立。
- `RCPHDR` 欄位順序在不同批次拋檔中曾經搬動過（見 `注意事項.md` 第 7 點），任何依欄位位置判斷「狀態」的邏輯，每次收到新批次都要先人工核對欄位位置。
- **RCPHDR 欄位順序基準版本（已定案，2026-09-30）**：以 2026-09-29 `doc/new_850` 批次 + 2026-09-30 匯入的 `doc/850-SKU existence`（TS260930~TS260934，5 檔）所使用的 64 欄版本為準，即現行 `gap_db.sql` 的 `f11_vendor_name`／`f12_vendor_number`／`f13_order_status`／`f18_country_of_origin`／`f45_in_dc_date`／`f46_po_creation_date` 欄位位置。之後若收到欄位順序不同的新批次，需重新核對並更新 `gap_db.sql` + `注意事項.md`，不可直接沿用此基準。

### Phase 1-A：資料模型準備

1. **832 SKU 唯一識別鍵（已定案，2026-09-30）**：`customer_code` + 完整 9 碼品號（`sku` 8 碼 + `long_description` 第 1 碼）+ `item_size`（實際內容為顏色）+ `item_colour`（實際內容為尺寸）。四者組合視為同一 SKU/Size 變體，用於分組取「最新一筆 status」；因設計為 append-only，此組合鍵**不是**資料庫唯一鍵/UNIQUE constraint，只用於查詢端 `GROUP BY` / `DISTINCT ON` 判斷最新狀態。SQL 範例：
   ```sql
   SELECT DISTINCT ON (customer_code, sku, left(long_description,1), item_size, item_colour)
          customer_code, sku, left(long_description,1) AS last_digit, item_size, item_colour, status, created_at
   FROM gapwmc_832_item
   ORDER BY customer_code, sku, left(long_description,1), item_size, item_colour, created_at DESC;
   ```
2. **新增 `employees` 表**：帳號、密碼（雜湊儲存，不可明碼）、角色（至少 `admin` / `user`）。改寫 `LoginPage.tsx` 串接資料庫驗證，移除寫死帳密。範圍先求最小可用（登入 + 角色判斷），不做完整權限系統。
3. **850 同一 PO 的狀態追蹤欄位/視圖**：比照 832 的 append-only 設計，不改動匯入行為，而是新增一個依 `f06_po_number` 分組、以 `created_at`／`f45_in_dc_date` 排序取「最新一筆 header」及「最新一筆 detail（依 item_number+last_digit 分組）」的查詢或 view，作為「目前 PO 狀態」的判斷依據。

### Phase 1-B：832 測試邏輯（001 / 002 / 003）

1. 準備/確認三種檔名情境（`_Add_`／`_Update_`／`_Delete_`）各自的測試 `.im` 檔，用 `pnpm run import-wms --dry-run` 先驗證欄位對齊，再正式匯入，確認 `status` 寫入正確。
2. 依 Phase 1-A 定義的唯一識別鍵，撰寫「取每個 SKU 最新一筆 status」的查詢（`DISTINCT ON` 或 window function）。
3. 貨品主檔頁面（`ItemMasterView.tsx` / `query_832_items`）：一般使用者只顯示「最新 status ≠ DELETE」的 SKU；新增管理員專用查詢（沿用 `QueryTable` 元件即可），可看到全部歷史列（含已刪除）。存取權限依 Phase 1-A 的 `employees.role` 判斷。
4. 撰寫測試紀錄：針對 001/002/003 各自的預期結果（新增列出現、更新列出現且不覆蓋舊列、刪除列出現但畫面隱藏）逐一驗證並記錄。

### Phase 1-C：850 測試邏輯（同一 PO#，情境 1-5）

1. 依 Phase 1-A 的「最新 header／detail」查詢，實作以下比對邏輯（皆為新查詢，不改匯入行為）：
   - 情境 1／2（新增／刪除 SKU-Size）：比較同一 PO 前後兩次匯入的 detail 明細（依 item_number+last_digit 分組），找出只出現在新批次或只出現在舊批次的品項。
   - 情境 3（變更 Item 數量）：同一 item_number 在不同批次的 `f06_order_quantity` 差異。
   - 情境 4／5（取消／重新啟用 PO）：同一 PO 的最新 `f13_order_status` 是否為 `CANCELLED`，及後續是否又出現 `ACTIVE` 的新批次。
2. 準備測試資料：目前 `doc/new_850`（ACTIVE/COMPLETE/CANCELLED 各一）與 `doc/850-SKU existence`（5 個新增 SKU 情境）可覆蓋情境 1、4。情境 2（刪除 SKU/Size）、3（變更 Item 數量）、5（重新啟用 PO）**由使用者提供樣本檔**，已建立對應資料夾，請將檔案放入：
   - 情境 2（刪除 SKU/Size）：`doc/850-scenario-2-delete-sku/`
   - 情境 3（變更 Item 數量）：`doc/850-scenario-3-qty-change/`
   - 情境 5（重新啟用 PO）：`doc/850-scenario-5-reactivate-po/`

   （`doc/` 已列在 `.gitignore`，這三個資料夾不會被提交進 repo；檔案就緒後再進行匯入與比對邏輯驗證。）
3. 收貨明細頁面（`ReceivingView.tsx`）視需要增加「依 PO 顯示狀態變化」的查詢畫面（可先用既有 `QueryTable` + 新查詢指令，不急著做時間軸 UI）。

### Phase 1-D：850 測試邏輯（情境 6：未收到 Item Master 即收到 DPO）+ Email 警示

1. **比對邏輯**：850 detail 的完整品號（`f05_item_number` + `f26_item_last_digit`）在 `gapwmc_832_item` 中找不到對應（依 Phase 1-A 唯一鍵、且排除最新 status 為 DELETE 的列），視為「未收到 Item Master」。
2. **觸發點**：選擇在 `scripts/import.mjs` 匯入 850 檔案完成後，針對本次匯入的 detail 列執行上述比對（比在畫面上另做輪詢查詢更貼近「收到 DPO 當下即觸發」的需求）。
3. **Email 寄送**：新增 Node 端寄信套件（如 nodemailer），透過 Gmail SMTP 寄送警示信。帳密／App Password 一律放 `.env`（比照現有 `PG*` 變數作法，絕不寫死在程式碼），需要使用者提供 Gmail 帳號的**應用程式密碼**（Google 帳號需開啟兩步驟驗證才能產生）。
4. 測試方式：使用 `doc/new_850` 內品號刻意不在 `gapwmc_832_item` 中的資料觸發警示，確認信件寄出且內容包含 PO 號、品號、匯入檔名。

### 相依關係

- Phase 1-B／1-C／1-D 都依賴 Phase 1-A 的唯一識別鍵定義與「最新狀態」查詢先完成。
- Phase 1-D 的 Email 功能依賴 Phase 1-C 的 850 比對邏輯（品號比對）與使用者提供的 Gmail 憑證。
- `employees` 表與登入改造（Phase 1-A-2）只有 Phase 1-B 的「隱藏已刪除 SKU / 管理員查詢」需要，其餘 Phase 可先與其並行開發。

### 風險 / 待確認事項

狀態（2026-09-30 使用者回覆後更新）：

- ✅ **已定案**：832 SKU 唯一識別鍵 = `customer_code` + 完整 9 碼品號 + `item_size` + `item_colour`（見 Phase 1-A-1）。
- ⏳ **待使用者提供**：850 情境 2／3／5 測試樣本檔，已建立對應資料夾（見 Phase 1-C-2），檔案到位後才能進行該三個情境的驗證。
- ✅ **已定案**：`RCPHDR` 欄位順序以 2026-09-29/09-30 批次（現行 `gap_db.sql` 64 欄版本）為基準；後續若欄位又搬動仍需重新核對，此風險屬於「每次新批次都要做的固定檢查」，非一次性可解決。
- ✅ **已驗證（2026-09-30）**：Gmail 帳號／App Password（`.env` 的 `EMAIL_USER`／`EMAIL_PASS`／`EMAIL_FROM`）已用 `smtp.gmail.com:465` 實際寄出測試信成功，憑證可用。
- ✅ **已定案**：`employees` 角色僅 `admin` / `user` 兩種。

### 估計複雜度

- Phase 1-A：中（資料庫設計 + 登入改造）
- Phase 1-B：中（依賴唯一鍵確認後，查詢與畫面調整量不大）
- Phase 1-C：中～高（缺測試樣本、比對邏輯需要設計驗證）

---

## 實作進度（2026-09-30）

### ✅ Phase 1-A 已完成

- `gap_db.sql` 新增 `employees` 表（`CREATE EXTENSION pgcrypto` + bcrypt 雜湊 + 預設帳號 `admin` / `admin123`，已套用到本機資料庫並驗證登入查詢）。
- `src-tauri/src/db.rs` 新增 `login` 指令（`LoginRequest`/`Employee`，用 `crypt()` 比對，不落地存密碼明碼），已在 `lib.rs` 註冊。
- `src/auth/AuthContext.tsx`（新檔）：`AuthProvider`/`useAuth`，登入結果存 `sessionStorage`；已掛進 `src/Providers.tsx`。
- 832 SKU 唯一識別鍵已在 SQL 端驗證：`DISTINCT ON (customer_code, sku, left(long_description,1), item_size, item_colour) ... ORDER BY ..., created_at DESC`。

### ✅ Phase 1-B 已完成（832 001/002/003）

- `query_832_items`（`db.rs`）新增 `include_deleted` 邏輯：一般使用者只看每個 SKU 最新且非 DELETE 的一列；管理員勾選「顯示已刪除 SKU」可看完整歷史（含 DELETE）。
- `QueryTable.tsx` 新增 `checkboxFilters`；`ItemMasterView.tsx` 依 `useAuth()` 的 `role` 動態決定是否顯示此勾選框。
- `AuthenticationForm.tsx` / `LoginPage.tsx` 改接真正的 `login` 指令，欄位由 email 改為帳號，移除寫死帳密。
- **實測結果**（用既有 `doc/new_832` 三個檔案，已在資料庫中）：一般使用者視角 90 筆（60 ADD + 30 UPDATE），管理員視角 135 筆（含 45 DELETE）。三個測試檔目前彼此 SKU 互不重疊，尚未有「同一 SKU 先 ADD 再 UPDATE/DELETE」的資料可驗證覆蓋順序，但分組/排序邏輯已用 SQL 直接驗證正確。

### ✅ Phase 1-D 已完成並實測成功（情境 6 + Email 警示）

- 新增 `scripts/email-alert.mjs`（用 Node 內建 `tls` 手動走 Gmail SMTP，未額外安裝套件 — 這台機器上 `pnpm add` 會因檔案鎖定問題弄壞 `node_modules`，故避開新增依賴）。
- `scripts/import.mjs`：`.rc` 匯入成功且非 `--dry-run` 時，比對本次匯入的明細品號（`f05_item_number` + `f26_item_last_digit`）是否存在於 `gapwmc_832_item`（比對邏輯：`sku || left(long_description,1)`，不論 status），找不到就寄警示信；寄信失敗只印警告、不影響已完成的匯入。
- **實測**：重新匯入 `doc/850-SKU existence/850_PO_62028556_Active.txt_PO_TS260930.rc`（`--replace`），2 個品號都不在 Item Master 中，警示信成功寄出（`smtp.gmail.com` 回 250 OK）。

### ⏳ Phase 1-C 待續（850 情境 1-5，同 PO#）

- 尚未建立比對查詢（新增/刪除 SKU、數量變更、取消/重啟 PO）。
- 發現一個資料面的問題：`doc/850-SKU existence` 這組檔案雖然檔名都提到 PO 62028556，但實際 `f06_po_number` 欄位是 `TS260930`～`TS260934`（5 個不同值），不是同一個 PO#；这組資料比較適合當作 Phase 1-D（情境 6）的測試資料，不能拿來測「同一 PO# 新增 SKU」（情境 1）。情境 1、4 目前沒有「同一 PO# 出現在兩個不同批次」的樣本可用；情境 2／3／5 仍在等使用者提供（資料夾已建好，見上）。
- 建議：情境 1-5 全部一起等測試樣本到齊後再實作比對邏輯，比較有把握一次做對，避免資料面問題重工。

### 已知限制（尚未做，非本次範圍）

- 沒有做路由層級的登入保護（未登入直接輸入網址仍可進 `/item-master`），只做了「已登入角色決定看不看得到已刪除 SKU」。
- `login` 指令沒有做 session token/次數限制等安全機制，帳密驗證信任前端傳入的 `role` 做 UI 顯示判斷，屬於內部試點工具的最小可用實作，非對外系統等級的存取控制。
- UI 沒有實機驗證：這台機器上跑 `pnpm start` 時 1420 埠已被佔用（應該是你自己開著的 `pnpm dev`），且沒有可用的瀏覽器自動化橋接，所以登入頁/勾選框的畫面互動沒有用瀏覽器實際點過一輪；已完成的驗證是 SQL 直接查詢、`cargo check`、`tsc --noEmit` 全部過。你那邊如果本來就開著 `pnpm dev`，畫面應該已經透過 HMR 自動更新了，麻煩實際登入 `admin` / `admin123` 測一次。
- Phase 1-D：中（新增外部依賴 nodemailer + 憑證管理）

---

## 開發任務規劃：UAT 測試按鈕（2026-09-30）

### 需求重述

在「貨品主檔」「收貨明細」兩個頁面的查詢列最右邊（查詢/重置按鈕右側，如附圖紅色按鈕）新增「UAT 測試」按鈕。
User 把測試檔放進對應資料夾後按下按鈕，系統自動執行「832 測試項目（001/002/003）」與「850 測試項目（情境 1-6，相同 PO#）」的測試程序，
不用再手動下 `pnpm run import-wms` 指令。

### 現況盤點

- `doc/850-scenario-3-qty-change/` 現在有 2 個檔（`..._TS260933.rc`、`..._TS260934.rc`），`850-scenario-2-delete-sku/`、`850-scenario-5-reactivate-po/` 仍是空的。
- **⚠️ 發現一個會影響整個「相同 PO#」比對邏輯的問題**：剛放進來的 scenario-3 兩個檔案，`f06_po_number` 欄位分別是 `TS260933`、`TS260934`— 兩個檔案的 PO 號還是不一樣，不是同一個 PO#。目前為止收到的所有 850 測試檔（`850-SKU existence`、`new_850`、`850-scenario-3-qty-change`）都是這個模式：每個檔案的 `f06_po_number` 各自不同，唯一共通點是「檔名開頭都是 `850_PO_62028556_Active.txt_PO_...`」，也就是說**同一個 Gap PO（62028556）只出現在檔名裡，資料表的 `f06_po_number` 欄位實際存的是每次收貨的 receipt ID，不是原始 PO 號**。
  → 這代表 Phase 1-C／UAT 測試如果依 `gapwmc_850_header.f06_po_number` 分組來找「同一 PO 的前後變化」，目前所有測試檔都分不到同一組，情境 1-5 全部測不出來。這是本次規劃最關鍵的待確認事項，見下方風險 1。
- 目前沒有任何後端指令可以從畫面觸發「匯入 + 驗證」；匯入邏輯目前只存在 `scripts/import.mjs`（Node），桌面 App 的畫面只能呼叫 `src-tauri` 的 Rust Tauri 指令 (`invoke`)，兩邊目前是分開的。
- `src-tauri/Cargo.toml` 已經有 `tauri-plugin-shell = "2"` 且已在 `lib.rs` 註冊 `.plugin(tauri_plugin_shell::init())`，代表 Rust 端可以直接呼叫外部程式（例如 `pnpm run import-wms`），只是目前完全沒用到。

### 架構決策提案：UAT 指令用 tauri-plugin-shell 呼叫既有的 import.mjs，不重寫一份匯入邏輯

兩個可能做法：
1. **（提案）Rust 新增 `run_uat_test` 指令，內部用 `tauri_plugin_shell` 執行 `pnpm run import-wms <掃到的檔案...>`**，拿到 stdout/exit code 後，再用既有的 `tokio-postgres` client 下驗證查詢（例如「latest status 是否符合預期」「品號是否在 832 找得到」），組成一份結構化報告回傳給前端。優點：不用把 `.im`/`.rc` 的解析與寫入邏輯在 Rust 重寫一份（`import.mjs` 已經有欄位對齊、交易、重複匯入判斷等邏輯），兩邊维護一份就好。缺點：正式打包的 release 版本需要目標機器裝好 Node/pnpm 且 `scripts/import.mjs` 隨附，這對「桌面 App 應該要能獨立執行」不是很乾淨；但目前這是內部試點工具、開發機上跑 `pnpm dev`，這個限制可以接受。
2. 把匯入邏輯整個在 Rust 重寫一份 (`db.rs` 直接讀檔案、INSERT)。優點是最終產物不依賴 Node；缺點是同一套邏輯要維護兩份（欄位對齊、event 判斷等），且工作量明顯更大。

**建議採用做法 1**，除非你有打包成單一執行檔給其他人用的規劃（若有，麻煩先講，我會改用做法 2）。

### 功能範圍規劃

- **貨品主檔頁的「UAT 測試」**：掃描 `doc/new_832/`（或另外建一個 `doc/832-uat-test/`，待確認，見風險 3）裡的 `.im` 檔，執行匯入，再驗證：
  - 003（新增）：該次匯入的列 `status = 'ADD'` 且都寫入成功
  - 001（更新）：`status = 'UPDATE'`
  - 002（刪除）：`status = 'DELETE'`，且驗證「一般使用者查詢看不到、管理員勾選後看得到」（查 `query_832_items` 兩種模式的結果都符合預期）
- **收貨明細頁的「UAT 測試」**：掃描 `850-scenario-2-delete-sku/`、`850-scenario-3-qty-change/`、`850-scenario-5-reactivate-po/`（以及既有的 `850-SKU existence/`、`new_850/`，涵蓋情境 6、部份情境 1/4 資料）裡的 `.rc` 檔，執行匯入，再依風險 1 確認後的分組方式驗證情境 1-6。
- 資料夾裡沒有檔案的情境，報告裡顯示「⏭ 略過（無測試檔案）」，不算失敗。
- 執行結果用 Modal（彈出視窗）列出每個測試項目（001/002/003、情境 1-6）的 ✅ 通過 / ❌ 失敗 / ⏭ 略過，失敗時附簡短原因；不寫入資料庫額外記錄，單純這次執行的即時報告（除非你想要留存歷次執行紀錄，也請告知）。

### 風險 / 待確認事項（開發前需要你回覆）

1. **🔴 HIGH（阻擋 Phase 1-C 與情境 1-6 驗證邏輯）**：「相同 PO#」的分組依據要用什麼？
   - (a) 直接用 `gapwmc_850_header.f06_po_number`——但照目前所有測試檔的實際內容，這樣永遠分不到同一組，情境 1-5 測不出來（除非之後真的收到 `f06_po_number` 相同的多筆檔案）。
   - (b) 改成從 `source_file` 檔名解析出原始 Gap PO（例：`850_PO_62028556_Active.txt_PO_TS260933.rc` → 62028556），用這個當分組 key。這樣才能把 `850-SKU existence`、`850-scenario-*` 這些檔案串起來測情境 1-5，但要新增檔名解析邏輯（且要你確認這個檔名格式以後都會維持）。
   - (c) 其他：例如請 WMS 端之後補發「真的共用同一個 `f06_po_number`」的測試檔，這次先不做情境 1-5 的自動驗證，UAT 按鈕只做情境 6 + 832。
2. **🟡 MEDIUM**：832 的 UAT 測試檔要用現有的 `doc/new_832/`，還是要比照 850 建一個獨立的 `doc/832-uat-test/` 資料夾（意義：以後你要放新的 832 測試檔時，跟現有已經在資料庫的 `doc/new_832` 分開，不會搞混哪些已經測過）。
3. **🟡 MEDIUM**：情境 2、5 的資料夾目前還是空的；UAT 按鈕會先把這兩項顯示為「略過」，等你放檔案進去才會真的測試到。
4. **🟢 LOW**：報告要不要留存（例如寫進資料庫一張 `uat_runs` 記錄表，之後可以看歷次測試趨勢），還是單純這次執行完看過就好（不留存）？目前規劃是不留存。
5. **🟢 LOW**：「UAT 測試」按鈕點下去後，如果同時有其他人在操作查詢（理論上這是單機工具，機率低），要不要 disable 查詢按鈕避免衝突？目前規劃不特別處理（風險低）。

### 估計複雜度

- Rust `run_uat_test` 指令（shell 出去跑 import-wms + 驗證查詢）：中
- 前端按鈕 + 結果 Modal：低～中
- 風險 1 的分組邏輯（若選 (b)）：中，需要新增檔名解析且要處理解析失敗的例外情況

**等待確認**：以上規劃、尤其是風險 1（PO# 分組依據）和架構決策（shell 出去跑 import.mjs），麻煩確認後我再開始寫程式。

### 決策確定（2026-09-30 使用者回覆）

1. **情境 1-5（相同 PO# 比對）暫緩**（⚠️ 已被下方「850 UAT 改版」取代，情境 1-6 現已全部實作）：UAT 測試這次先只做「情境 6（未收到 Item Master）」+「832 001/002/003」。等之後有真正共用同一個 `f06_po_number` 的測試檔，再做情境 1-5 的分組比對邏輯。
2. **執行方式**：Rust 新增 `run_uat_test` 指令，用 `tauri-plugin-shell` 呼叫既有的 `pnpm run import-wms --replace <檔案>`，不重寫匯入邏輯。
3. **832 測試檔資料夾**：另建 `doc/832-uat-test/`，與已經測過的 `doc/new_832/` 分開。
4. **結果留存**：新增 `uat_runs` 資料表，每次執行寫入一筆記錄（頁面、觸發帳號、逐項結果 JSON、整體結果、時間）。

### 確定後的設計

**資料庫**：`gap_db.sql` 新增
```sql
CREATE TABLE IF NOT EXISTS uat_runs (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    page           VARCHAR(20) NOT NULL,   -- 'item_master' / 'receiving'
    triggered_by   VARCHAR(50),            -- employees.account
    overall_status VARCHAR(10) NOT NULL,   -- pass / fail
    results        JSONB NOT NULL,         -- [{name, status, detail}, ...]  status: pass/fail/skip
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ
);
```

**測試檔資料夾**：
- 貨品主檔（832）：掃描 `doc/832-uat-test/` 的 `.im` 檔
- 收貨明細（850）（⚠️ 已改為單一資料夾 `doc/850-uat-test/`，見下方「850 UAT 改版」；以下為當時的舊設計）：掃描 `doc/850-SKU existence/`、`doc/850-scenario-2-delete-sku/`、`doc/850-scenario-3-qty-change/`、`doc/850-scenario-5-reactivate-po/` 的 `.rc` 檔（情境 2/5 資料夾目前空的會顯示「略過」；情境 1-5 比對本身這次不驗證，這些檔案單純被匯入 + 跑情境 6 檢查）

**Rust `run_uat_test(page, account)` 指令流程**：
1. 依 `page` 決定要掃描的資料夾
2. 對資料夾內每個檔案，用 `tauri_plugin_shell` 執行 `pnpm run import-wms --replace <檔案>`（工作目錄設為專案根目錄），收集 stdout/exit code
3. 解析 import.mjs 的輸出：匯入成功/失敗、是否印出「已寄出警示信」（= 情境 6 觸發）
4. 832 頁面額外跑驗證查詢：確認 `status='ADD'/'UPDATE'/'DELETE'` 的列都有依檔名正確寫入；確認一般使用者查詢（`include_deleted` 未勾）看不到最新為 DELETE 的 SKU、管理員勾選後看得到
5. 組成 `UatTestItem[]`（每項 pass/fail/skip + 簡短說明），算出整體 pass/fail，寫入 `uat_runs`，回傳給前端

**前端**：`QueryTable` 右上角（查詢/重置按鈕右側，紅色）新增「UAT 測試」按鈕；`ItemMasterView`/`ReceivingView` 各自傳入 `page` 參數。點擊後顯示 loading，完成後開 Modal 列出每項測試 ✅/❌/⏭ + 說明。

### 新風險（決策後浮現）

- **🟡 MEDIUM**：Windows 上用 `tauri_plugin_shell::Command::new("pnpm")` 直接執行 `.cmd` 檔案有時需要特別處理（不像 Unix shell 那樣直接可執行），實作時要先驗證這條路能不能直接跑通，不行的話改用 `cmd /c pnpm run import-wms ...` 包一層。
- **🟢 LOW**：`--replace` 會覆蓋掉資料夾裡每個檔案「上一次」的匯入結果；如果之後同一資料夾裡混進不該重複匯入的正式資料，要注意這個按鈕的破壞性（目前資料夾內容都是測試檔，風險低）。

### ✅ 已實作並初步驗證（2026-09-30）

- `gap_db.sql` 新增 `uat_runs` 表，已套用到本機資料庫。
- `src-tauri/src/uat.rs`（新檔）：`run_uat_test(page, account)` 指令。832 掃 `doc/832-uat-test/`，850 掃 `doc/850-SKU existence/` + 三個 `850-scenario-*` 資料夾；每個檔案用 `cmd /C pnpm run import-wms --replace <檔案>`（透過 `tauri-plugin-shell`）匯入，解析 stdout 判斷成功/失敗/是否觸發情境 6 警示信；832 額外重用 `db::query_832_items` 驗證一般使用者/管理員視角筆數；結果寫入 `uat_runs` 並回傳給前端。
- `db.rs`：`connect()`、`Page.total`、`ItemFilter` 欄位改 `pub(crate)`，讓 `uat.rs` 可以重用既有查詢邏輯，不重寫一份。
- `Cargo.toml`：`tokio-postgres` 加上 `with-serde_json-1` feature（寫 JSONB 用），連帶把卡住的 `serde_json` 鎖定版本升級（`cargo update -p serde_json`）。
- `QueryTable.tsx`：新增 `uatPage` prop，查詢/重置按鈕右側（`ml='auto'` 推到最右）顯示紅色「UAT 測試」按鈕；完成後彈出 Modal 列出每項 ✅ 通過 / ❌ 失敗 / ⏭ 略過 + 說明。`ItemMasterView`/`ReceivingView` 分別傳入 `uatPage='item_master'`/`'receiving'`。

**已驗證的部分**（無法在這台機器上實際跑桌面 App 按按鈕，所以分開驗證每個環節）：
- `cargo check` / `tsc --noEmit` 全過。
- Windows 上 `cmd /C pnpm run import-wms --replace "<含空格的檔名>"` 直接測試成功（`uat.rs` 的 `run_import()` 就是用這個組合）。
- `uat_runs` 寫入 JSONB + 中文字內容測試成功（用 `psql -f` 讀檔測試, 避開了 Windows 終端機編碼問題; 測試資料已刪除）。
- 重用的 832 查詢邏輯（一般使用者/管理員視角筆數）已在前一輪對話驗證過。

**沒驗證到的部分**：沒有實際在桌面 App 裡點過「UAT 測試」按鈕跑一次完整流程（Tauri 的 `AppHandle`/`ShellExt` 呼叫沒辦法在這裡單獨測試），麻煩你實際點一次，尤其留意：
1. 按鈕位置是否符合附圖（查詢/重置右側）
2. 貨品主檔按下去：Modal 應該列出 832-uat-test 資料夾裡那個檔案的匯入結果 + 「832-002」隱藏已刪除驗證項目
3. 收貨明細按下去：情境 6（850-SKU existence）應該顯示匯入成功、有觸發警示信；情境 2/5（資料夾還是空的）應該顯示「略過」；情境 3（已有 2 個檔案）應該顯示匯入成功
4. 每次按下去都會重新寄情境 6 的警示信（`--replace` 全部重新跑一次），信箱可能會收到好幾封，這是預期行為

**等待確認**：麻煩實際測試一次，有問題我再繼續修。

### 832 UAT 歸檔（2026-09-30）

- 匯入成功（pass）的 `.im` 檔，會自動移到 `doc/832-uat-test/bak/`（不存在則建立）；匯入失敗的留在原處，方便修正重試。
- `bak/` 已有同名檔時，新檔名尾端加 Unix 秒數，不覆蓋舊檔。移動失敗不影響通過判定（資料已入庫），只在報告註明。
- 歸檔後資料夾為空，再按「UAT 測試」會顯示「略過」；「832-002」隱藏已刪除 SKU 的檢查仍照常執行。

### 850 UAT 改版：單一資料夾、依序匯入、逐步比對（2026-09-30）

**背景**：使用者提供 7 個測試檔（`uat_850/`）。SET 01～06 的 `f06_po_number` 都是 `TEST0001`（同一張 PO 依序變化），解決了上方「風險 1」中「所有測試檔 PO 號都不同、無法分組」的問題，因此情境 1-5 的比對現在可以實作。取代舊的四個資料夾（`850-SKU existence`、`850-scenario-2/3/5`，不再被掃描）。

**測試檔**：`doc/850-uat-test/`（由 `uat_850/` 複製），依檔名 `SET 01`→`SET 07` 順序匯入：

| 檔案 | 對應情境 | 預期結果（比對該 PO 最新一次匯入） |
|---|---|---|
| SET 01 Active | 基準 | TEST0001 `ACTIVE`，1 行：`324084338` × 114 |
| SET 02 add new line | 情境 1 新增 SKU | 2 行：`324084338` × 114、`323891352` × 114 |
| SET 03 Update Add Qty | 情境 3 變更數量 | 2 行：× 200、× 300 |
| SET 04 -LINE | 情境 2 刪除 SKU | 1 行：`324084338` × 200 |
| SET 05 Cancel | 情境 4 取消 PO | 狀態 `CANCEL` |
| SET 06 REP_ACTIVE | 情境 5 重新啟用 | 狀態回 `ACTIVE` |
| SET 07 NOSKU | 情境 6 未收到 Item Master | PO `TEST0002`，品號 `TEST84338`、`TEST91352`，**必須**觸發警示信 |

（完整品號 = `f05_item_number` + `f26_item_last_digit`，與 832 的 `sku || left(long_description, 1)` 對應。）

**行為（`src-tauri/src/uat.rs` 的 `run_receiving_uat`）**：
1. **前置檢查**：SET 01～06 用到的品號必須已存在於 `gapwmc_832_item`，缺任何一個就整批不匯入並報錯（否則每一步都會誤寄警示信）。
2. 依檔名順序逐檔匯入，匯入後比對：該 PO 最新一筆 header 就是本檔、狀態符合、明細行（品號 + 數量，依檔案順序）完全一致、警示信有無符合預期（SET 01～06 不可寄、SET 07 必須寄）。
3. 任一步失敗，後面的步驟顯示「略過」（後續情境依賴前一步的結果）。
4. 全部通過才整批移到 `doc/850-uat-test/bak/`；有失敗則全部留在原處，修正後可從頭重跑。
5. 檔名不是 `SET NN` 開頭的檔案：只驗證匯入成功，無比對規則。

**⚠️ 前置條件（截至撰寫時尚未滿足）**：資料庫的 832 表目前沒有 `324084338`、`323891352` 這兩個品號，需先匯入包含它們的 `.im` 檔，否則收貨明細的「UAT 測試」會停在前置檢查失敗。

**驗證狀況**：`cargo check` 通過、既有 3 項 `uat.rs` 單元測試通過、比對用的兩段 SQL 已在資料庫上驗證語法。**尚未實際跑過完整流程**（會寫入資料庫並寄信）；SET 07 的品號 `TEST84338`／`TEST91352` 是依欄位位置推算，第一次實跑時若 SET 07 比對失敗，請先核對這兩個值。

---

## Code Review 修正紀錄（2026-09-30）

針對 `/code-review` 找出的 13 項問題全部修正，逐項對應：

1. **CRITICAL 種子密碼**：`employees` 新增 `must_change_password` 欄位；預設 `admin`/`admin123` 帳號現在標記為「必須改密碼」，登入成功後 `LoginPage.tsx` 會卡在「請設定新密碼」畫面，不改密碼不能繼續用；新增 `change_password` 指令（驗證舊密碼、bcrypt 存新密碼）。
2. **HIGH 後端沒驗證 admin 權限**：`query_832_items` 新增 `account` 參數，`include_deleted=true` 時一定會在後端查 `employees.role`，不是 admin 就直接回錯誤「權限不足」；前端 `QueryTable.tsx` 現在每次查詢都會夾帶 `account`。`uat.rs` 內部呼叫也改用真正驗證過的路徑。
3. **MEDIUM `info` mutation**：`import.mjs` 的 `importRc`/`importIm`/`importFile` 全部改成回傳新物件，不再用傳入的 `info` 物件做 out-parameter mutation。
4. **MEDIUM 沒有逾時保護**：`email-alert.mjs` 的 SMTP 連線加了 15 秒逾時；`uat.rs` 的 `run_import` 用 `tokio::time::timeout` 包了 120 秒逾時，都不會再無限卡住。
5. **MEDIUM UAT 自我檢查邏輯太弱**：832-002 的驗證從「`admin.total >= normal.total`」（幾乎必過）改成先查資料庫「目前是否真的有已刪除的 SKU」，有的話要求 `admin.total > normal.total` 嚴格大於，才會真的抓到隱藏邏輯失效的情況。
6. **MEDIUM 完全沒有自動化測試**：新增 `scripts/import.test.mjs`（6 項）、`scripts/email-alert.test.mjs`（5 項，用 `node --test`，不裝套件）、`uat.rs` 內建 3 項 `#[cfg(test)]` 單元測試；`package.json` 新增 `test:unit` script。**過程中 `email-alert.test.mjs` 的其中一項測試真的抓到一個既有 bug**：`readResponse` 沒檢查 buffer 是否以 `\r\n` 結尾就判斷「收完了」，如果 SMTP 回應被 TCP 切成兩個 chunk 送達，可能提早把半行當完整回應處理；已修正並用真實 Gmail 帳號複測寄信成功。
7. **MEDIUM cmd.exe 特殊字元風險**：`uat.rs` 不再透過 `cmd /C pnpm run import-wms`，改成直接呼叫 `node scripts/import.mjs --replace <file>`（Windows 上 `node.exe` 可以被 `CreateProcess` 直接找到，不需要 shell 包一層），完全不經過 cmd.exe 的命令列解析，副作用是也一併簡化了程式碼。
8. **LOW 登入時間側路攻擊**：帳號不存在時，`login` 現在會多跑一次 `crypt()` 空跑，讓「帳號不存在」跟「帳號存在但密碼錯」的回應時間比較接近。
9. **LOW 死碼**：`run_import` 移除了沒有實際作用的 `stdout.contains("失敗")` 判斷式，只靠 exit code。
10. **LOW `.unwrap()`**：`uat.rs` 改用 `file_display_name()` 輔助函式，取不到檔名時退回完整路徑字串，不會 panic。
11. **LOW Modal 標題字串**：`QueryTable.tsx` 的三元運算式修正，不會再算出字面上的 `"undefined"`。
12/13：`gap_db.sql` 檔案長度、`tauri.conf.json` 的 updater placeholder 維持原樣（前者是既有的累積式 schema 慣例、後者不是這次改的範圍），已在上次的審查說明過原因。

**驗證方式**：`cargo check`（乾淨）、`cargo test --lib`（3 項全過）、`tsc --noEmit`（無新錯誤）、`node --test scripts/*.test.mjs`（11 項全過，含抓到並修好的 `readResponse` bug）、`psql` 直接驗證 `is_admin`/`change_password` 的 SQL 邏輯（正確舊密碼才能改、改密碼後舊密碼失效、`must_change_password` 正確翻轉）、實際用真實 Gmail 帳號複測寄信仍正常。

**⚠️ 修正過程中的意外插曲**：執行到一半發現 `doc/850-SKU existence/`、`850-scenario-2/3/5` 四個資料夾的測試檔全部不見了（資料夾變空）。確認過不是我這次的任何指令刪的（我的程式碼從頭到尾都沒有刪檔案的邏輯，只會刪資料庫裡的列），檢查 Windows 資源回收筒後發現這些檔案都在裡面（代表是用滑鼠/檔案總管刪除的，不是指令列強制刪除），已經全部還原回原本的檔名與位置，內容也核對過沒有損毀。如果你知道是什麼情況（例如你自己在檔案總管整理時誤刪），麻煩留意一下；如果不是你刪的，可能要注意一下這台機器上還有什麼東西會動到這個資料夾。

## uat_runs 新增 type / uat_task (測試目的)

- `uat_runs` 新增 `type TEXT[]`、`uat_task TEXT[]` 兩個平行陣列 (同索引成對), `gap_db.sql` 已含 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, 本機資料庫已套用; 既有 run 不回填 (NULL)。
- 832: ADD 記 `SKU`; UPDATE 每個變更欄位一筆 `欄位: 舊值 → 新值` (以 customer_code + sku + long_description 第 1 碼比對本檔之前最新一筆); DELETE 記 `Delete`。
- 850 (SET 01~07): `ACTIVE` / `UPDATE_ADD_LINE` / `UPDATE_QTY` / `UPDATE_DELETE_LINE` / `CANCEL` / `REP_ACTIVE` / `ITEM_NOT_FOUND`, uat_task 為 `PO 號: 變更說明`。
- `uat_runs_recode` 以 LATERAL unnest 展開, 同一個 run_id 的多筆測試目的各佔一列; 「共 N 筆」以展開後的列計, 側欄計數仍為執行次數。
- **2026-10-01 後續: 850 同一張 PO 只保留一份、原地更新** (取代先前 append-only): `import.mjs` 對 `.rc` 以 PO 號 upsert, 明細依完整品號同步 (更新數量 / 新增 / 刪除), 不留歷史; `gapwmc_850_header` 新增 `updated_at` 與唯一索引 `ux_gapwmc_850_header_po`; CANCEL / REP_ACTIVE 也是原地改狀態。850 UAT 改為匯入前檢查 PO 停在前一個情境的狀態, 重測前須先 `DELETE FROM gapwmc_850_header WHERE f06_po_number IN ('TEST0001','TEST0002');`。
- 比對邏輯在 `src-tauri/src/uat_diff.rs` (純函式 + 單元測試), 查舊資料在 `uat.rs` 的 `im_file_tasks`。
- **2026-10-01 後續: 850 品號不在 832 Item Master 時整個檔案擋下**: `import.mjs` 在寫入前檢查明細品號, 任何一個在 `gapwmc_832_item` 找不到就不寫入 header / detail / carton (新 PO 或既有 PO 的更新都一樣), 印出「已擋下」、exit 1、寄警示信。850 UAT 第 7 情境 (`ITEM_NOT_FOUND`) 改為驗證「被擋下 + 已寄警示信 + 資料庫沒有該 PO」才算通過。
