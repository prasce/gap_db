// PostgreSQL (gap_db) 存取; 連線設定使用 libpq 標準環境變數 PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, env};
use tokio_postgres::{types::ToSql, Client, NoTls};

// 開發時從專案根目錄的 .env 載入連線設定; 找不到檔案時沿用系統環境變數
pub fn load_env() {
  let _ = dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env"));
}

pub(crate) async fn connect() -> Result<Client, String> {
  let mut config = tokio_postgres::Config::new();
  config
    .host(&env::var("PGHOST").unwrap_or_else(|_| "localhost".into()))
    .port(
      env::var("PGPORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(5432),
    )
    .dbname(&env::var("PGDATABASE").unwrap_or_else(|_| "gap_db".into()))
    .user(&env::var("PGUSER").unwrap_or_else(|_| "postgres".into()));
  if let Ok(password) = env::var("PGPASSWORD") {
    config.password(password);
  }
  let (client, connection) = config
    .connect(NoTls)
    .await
    .map_err(|e| format!("無法連線到資料庫: {e}"))?;
  tauri::async_runtime::spawn(async move {
    if let Err(e) = connection.await {
      eprintln!("database connection error: {e}");
    }
  });
  Ok(client)
}

// 查詢頁共用的回傳格式; fields 的 key 為欄位別名, 值一律為文字
#[derive(Debug, Serialize)]
pub struct RowData {
  id: i64,
  #[serde(flatten)]
  fields: BTreeMap<&'static str, Option<String>>,
}

#[derive(Debug, Serialize)]
pub struct Page {
  items: Vec<RowData>,
  pub(crate) total: i64,
  limit: i64,
}

// 每頁筆數上限, 對齊前端頁面大小選單的最大選項 (100), 避免不合理輸入
const MAX_PAGE_SIZE: i64 = 100;

// 空白視為不限制; 跳脫 LIKE 的萬用字元, 讓 % 和 _ 當一般字元比對
fn like_term(v: &Option<String>) -> Option<String> {
  v.as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

// 共用查詢: columns 為 (SQL 運算式, 別名), from_where 為 FROM ... WHERE ... ORDER BY 部分;
// 每個查詢條件 $n 以部分符合、不分大小寫比對; page 為 1-based 頁碼, page_size 為每頁筆數 (夾在 1..=MAX_PAGE_SIZE 之間)
async fn query_page(
  id_expr: &str,
  columns: &[(&str, &'static str)],
  from_where: &str,
  filters: &[&Option<String>],
  page: i64,
  page_size: i64,
) -> Result<Page, String> {
  let client = connect().await?;
  let page_size = page_size.clamp(1, MAX_PAGE_SIZE);
  let page = page.max(1);
  let offset = (page - 1) * page_size;
  let select = columns
    .iter()
    .map(|(expr, alias)| format!("({expr})::text AS {alias}"))
    .collect::<Vec<_>>()
    .join(", ");
  let sql = format!(
    "SELECT {id_expr} AS id, {select}, count(*) OVER () AS total {from_where} LIMIT {page_size} OFFSET {offset}"
  );
  let terms: Vec<Option<String>> = filters.iter().map(|f| like_term(f)).collect();
  let params: Vec<&(dyn ToSql + Sync)> = terms.iter().map(|t| t as &(dyn ToSql + Sync)).collect();
  let rows = client
    .query(&sql, &params)
    .await
    .map_err(|e| format!("查詢失敗: {e}"))?;
  // count(*) OVER () 在 LIMIT/OFFSET 之前計算, 所以是全部符合條件的筆數, 與目前頁次無關
  let total = rows.first().map_or(0, |row| row.get::<_, i64>("total"));
  let items = rows
    .iter()
    .map(|row| RowData {
      id: row.get("id"),
      fields: columns
        .iter()
        .map(|&(_, alias)| (alias, row.get::<_, Option<String>>(alias)))
        .collect(),
    })
    .collect();
  Ok(Page {
    items,
    total,
    limit: page_size,
  })
}

// 以單一欄位做部分符合的 WHERE 條件; $n 為 NULL 時不限制
fn ilike(n: usize, expr: &str) -> String {
  format!("(${n}::text IS NULL OR {expr} ILIKE '%' || ${n} || '%')")
}

// 與 ilike 相同的部分符合, 但輸入可以放多個值 (以 ; , 全形；， 或空白分隔, 例 "324011041;324011043"), 符合任何一個就算;
// 只有分隔符號沒有實際內容時視同沒有條件。仍是單一文字參數 $n, 呼叫端不用改傳值方式
fn ilike_any(n: usize, expr: &str) -> String {
  const SEP: &str = r"[;,；，\s]+";
  let terms = format!("SELECT t FROM unnest(regexp_split_to_array(${n}, '{SEP}')) t WHERE t <> ''");
  format!(
    "(${n}::text IS NULL OR NOT EXISTS ({terms}) OR {expr} ILIKE ANY (SELECT '%' || t || '%' FROM ({terms}) s(t)))"
  )
}

async fn count(sql: &str) -> Result<i64, String> {
  let client = connect().await?;
  let row = client
    .query_one(sql, &[])
    .await
    .map_err(|e| format!("查詢失敗: {e}"))?;
  Ok(row.get(0))
}

// ---------------------------------------------------------------------
// 貨品主檔 (gapwmc_832_item)
// ---------------------------------------------------------------------

// 查詢條件; 空值代表不限制
#[derive(Debug, Default, Deserialize)]
pub struct ItemFilter {
  pub(crate) customer_code: Option<String>,
  pub(crate) sku: Option<String>,
  pub(crate) source_file: Option<String>,
  pub(crate) long_description: Option<String>,
  pub(crate) status: Option<String>,
  // "true" 時 (僅限管理員畫面會送出此值): 顯示每個 SKU 的完整歷史列 (含 status = DELETE);
  // 其餘情況只顯示每個 SKU 最新一筆且 status <> DELETE 的列 (一般使用者畫面); 見 SKU_IDENTITY_KEY 說明
  pub(crate) include_deleted: Option<String>,
}

// 832 SKU 唯一識別鍵 (2026-09-30 定案, 見 task.md Phase 1-A-1): customer_code + 完整 9 碼品號 (sku; 2026-10 起 GAP
// 直接給 9 碼, 不再拆 8 碼 + long_description 第 1 碼) + item_size (實際內容為顏色) + item_colour (實際內容為尺寸)。
// gapwmc_832_item 為 append-only (每次匯入一律新增列, 不覆寫不刪除, 見 注意事項.md), 所以這組鍵不是資料庫層級的唯一鍵,
// 只用來在查詢端分組取「這個 SKU 目前最新一筆 status」。
pub(crate) const SKU_IDENTITY_KEY: &str = "customer_code, sku, item_size, item_colour";

// 確認 account 是否為 role='admin' 的員工; account 為 None 或查無此人一律視為非管理員
pub(crate) async fn is_admin(client: &Client, account: Option<&str>) -> Result<bool, String> {
  let Some(account) = account else { return Ok(false) };
  let row = client
    .query_opt("SELECT 1 FROM employees WHERE account = $1 AND role = 'admin'", &[&account])
    .await
    .map_err(|e| format!("權限查詢失敗: {e}"))?;
  Ok(row.is_some())
}

// gapwmc_832_item 的 27 個資料欄; 與 src/views/ItemMasterView.tsx 的 COLUMNS 相同順序
const ITEM_832_COLUMNS: [&str; 27] = [
  "customer_code",
  "sku",
  "item_desc",
  "barcode",
  "length",
  "width",
  "height",
  "weight",
  "units_per_carton",
  "units_per_pallet",
  "bundle_items",
  "product_remarks",
  "long_description",
  "item_size",
  "item_colour",
  "item_style",
  "division",
  "department",
  "list_price",
  "country_of_origin",
  "udf1",
  "udf2",
  "udf3",
  "udf4",
  "udf5",
  "udf6",
  "status",
];

#[tauri::command]
pub async fn query_832_items(
  filter: ItemFilter,
  page: i64,
  page_size: i64,
  account: Option<String>,
) -> Result<Page, String> {
  let mut columns: Vec<(&str, &'static str)> = ITEM_832_COLUMNS.iter().map(|&c| (c, c)).collect();
  // status 右邊多 created_at (這筆事件寫入的時間, 台北時間) 與 source_file (匯入的檔名); 與 ItemMasterView.tsx 的 COLUMNS 最後兩欄對應
  columns.push(("to_char(created_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI:SS')", "created_at"));
  columns.push(("source_file", "source_file"));
  // show_deleted=false (一般使用者): 每個 SKU 只取最新一筆, 且該筆 status 不是 DELETE 才顯示
  // show_deleted=true (管理員勾選「顯示已刪除」): 顯示全部歷史列, 不做任何篩選
  // 前端只是用 role 決定要不要「顯示」這個勾選框, 送出的 include_deleted 本身不可信任, 一定要在後端重新確認
  // account 對應的員工真的是 admin 才放行, 否則就算送出 include_deleted=true 也視為一般使用者查詢
  let requested_deleted = filter.include_deleted.as_deref() == Some("true");
  let show_deleted = if requested_deleted {
    let client = connect().await?;
    if !is_admin(&client, account.as_deref()).await? {
      return Err("權限不足，無法查看已刪除的 SKU".to_string());
    }
    true
  } else {
    false
  };
  let from_table = if show_deleted {
    "gapwmc_832_item".to_string()
  } else {
    format!(
      "(SELECT DISTINCT ON ({SKU_IDENTITY_KEY}) * FROM gapwmc_832_item \
        ORDER BY {SKU_IDENTITY_KEY}, created_at DESC) latest"
    )
  };
  // show_deleted 是後端算出的布林值 (不是使用者輸入的文字), 直接嵌入 SQL 常值不會有注入風險
  let hide_deleted_clause = if show_deleted { "TRUE" } else { "status IS DISTINCT FROM 'DELETE'" };
  let from_where = format!(
    "FROM {from_table} WHERE {} AND {} AND {} AND {} AND {} AND {hide_deleted_clause} ORDER BY id",
    ilike(1, "customer_code"),
    ilike_any(2, "sku"),
    ilike(3, "source_file"),
    ilike(4, "long_description"),
    ilike(5, "status"),
  );
  query_page(
    "id",
    &columns,
    &from_where,
    &[
      &filter.customer_code,
      &filter.sku,
      &filter.source_file,
      &filter.long_description,
      &filter.status,
    ],
    page,
    page_size,
  )
  .await
}

#[tauri::command]
pub async fn count_832_items() -> Result<i64, String> {
  count("SELECT count(*) FROM gapwmc_832_item").await
}

// ---------------------------------------------------------------------
// 收貨明細 (gapwmc_850_header / detail / carton), 一筆明細一列
// ---------------------------------------------------------------------

#[derive(Debug, Default, Deserialize)]
pub struct ReceiptFilter {
  po_number: Option<String>,
  source_file: Option<String>,
  item_number: Option<String>,
  order_status: Option<String>,
}

// (SQL 運算式, 別名); 只列已命名的欄位; 與 src/views/ReceivingView.tsx 的 COLUMNS 相同順序
const RECEIPT_850_COLUMNS: [(&str, &str); 21] = [
  ("h.f06_po_number", "f06_po_number"),
  ("h.f03_receipt_id", "f03_receipt_id"),
  ("h.f04_receipt_id_type", "f04_receipt_id_type"),
  ("h.f05_receipt_type", "f05_receipt_type"),
  ("h.f11_vendor_name", "f11_vendor_name"),
  ("h.f12_vendor_number", "f12_vendor_number"),
  ("h.f18_country_of_origin", "f18_country_of_origin"),
  ("h.f13_order_status", "f13_order_status"),
  ("h.f45_in_dc_date", "f45_in_dc_date"),
  ("h.f46_po_creation_date", "f46_po_creation_date"),
  ("d.f04_line_number", "f04_line_number"),
  ("d.f03_line_ref", "f03_line_ref"),
  ("d.f05_item_number", "f05_item_number"),
  ("d.f26_item_last_digit", "f26_item_last_digit"),
  ("d.f06_order_quantity", "f06_order_quantity"),
  ("d.f07_quantity_um", "f07_quantity_um"),
  ("d.f71_product_type", "f71_product_type"),
  // 同一筆明細可能有多筆箱明細; 合成一格 (例 "1, 2, 3"), 確保一筆明細只有一列
  (
    "SELECT string_agg(c.f08_line_number, ', ' ORDER BY c.id) FROM gapwmc_850_carton c
     WHERE c.header_id = d.header_id AND c.f03_line_ref = d.f03_line_ref",
    "carton_f08_line_number",
  ),
  // 這一行明細第一次寫入 / 最後一次被更新的時間 (detail 的 created_at / updated_at), 台北時間
  ("to_char(d.created_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI:SS')", "created_at"),
  ("to_char(d.updated_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI:SS')", "updated_at"),
  // 這張 PO 最後一次被哪個檔案更新 (header.source_file; 850 同一張 PO 只保留一份, 再收到就原地更新, 所以是最後一個檔案)
  ("h.source_file", "source_file"),
];

#[tauri::command]
pub async fn query_850_receipts(filter: ReceiptFilter, page: i64, page_size: i64) -> Result<Page, String> {
  let from_where = format!(
    "FROM gapwmc_850_detail d
     JOIN gapwmc_850_header h ON h.id = d.header_id
     WHERE {} AND {} AND {} AND {}
     ORDER BY h.id, d.id",
    ilike(1, "h.f06_po_number"),
    ilike(2, "h.source_file"),
    // 商品編號被拆成前 8 碼與最後一碼; 接起來比對, 輸入 8 碼或完整 9 碼都能找到
    ilike_any(3, "(d.f05_item_number || coalesce(d.f26_item_last_digit, ''))"),
    ilike(4, "h.f13_order_status"),
  );
  query_page(
    "d.id",
    &RECEIPT_850_COLUMNS,
    &from_where,
    &[
      &filter.po_number,
      &filter.source_file,
      &filter.item_number,
      &filter.order_status,
    ],
    page,
    page_size,
  )
  .await
}

#[tauri::command]
pub async fn count_850_receipts() -> Result<i64, String> {
  count("SELECT count(*) FROM gapwmc_850_detail").await
}

// ---------------------------------------------------------------------
// UAT 測試紀錄 (uat_runs), 一次「UAT 測試」按鈕執行一列
// ---------------------------------------------------------------------

#[derive(Debug, Default, Deserialize)]
pub struct UatRunFilter {
  page: Option<String>,
  triggered_by: Option<String>,
  overall_status: Option<String>,
  started_at: Option<String>,
  run_id: Option<String>, // 精確比對 uat_runs.id (不是部分符合), 輸入 3 只會找 run 3, 不會找到 13、30
}

// (SQL 運算式, 別名); 與 src/views/UatRunsView.tsx 的 COLUMNS 相同順序; 時間以台北時區顯示
const UAT_RUN_COLUMNS: [(&str, &str); 9] = [
  // 別名不能叫 id: query_page 已固定輸出 id 欄 (列識別), 同名會衝突
  ("r.id", "run_id"),
  ("r.page", "page"),
  ("r.triggered_by", "triggered_by"),
  ("r.overall_status", "overall_status"),
  ("to_char(r.started_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI:SS')", "started_at"),
  ("to_char(r.finished_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI:SS')", "finished_at"),
  // type / uat_task 是平行陣列, 下面 FROM 以 LATERAL unnest 展開, 同一個 run_id 的每筆測試目的各佔一列
  ("t.type", "type"),
  ("t.uat_task", "uat_task"),
  // results 是 [{name, status, detail}] 的 JSONB 陣列; 只顯示各狀態筆數, 有失敗項目時附上項目名稱
  (
    "SELECT format('通過 %s / 失敗 %s / 略過 %s',
            count(*) FILTER (WHERE e->>'status' = 'pass'),
            count(*) FILTER (WHERE e->>'status' = 'fail'),
            count(*) FILTER (WHERE e->>'status' = 'skip'))
            || coalesce(' 失敗項目: ' || string_agg(e->>'name', '; ') FILTER (WHERE e->>'status' = 'fail'), '')
     FROM jsonb_array_elements(r.results) e",
    "results",
  ),
];

#[tauri::command]
pub async fn query_uat_runs(filter: UatRunFilter, page: i64, page_size: i64) -> Result<Page, String> {
  let from_where = format!(
    "FROM uat_runs r
     LEFT JOIN LATERAL unnest(r.type, r.uat_task) WITH ORDINALITY AS t(type, uat_task, ord) ON true
     WHERE {} AND {} AND {} AND {} AND {}
     ORDER BY r.started_at DESC, r.id DESC, t.ord",
    ilike(1, "r.page"),
    ilike(2, "r.triggered_by"),
    ilike(3, "r.overall_status"),
    // 與畫面顯示相同的台北時間字串比對, 輸入 2026-09-30 即可查當天
    ilike(4, "to_char(r.started_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI:SS')"),
    "($5::text IS NULL OR r.id::text = $5)",
  );
  // 展開後同一個 run 會有多列, 列識別 (前端勾選/key) 要各自唯一: run id * 10000 + 序號 (沒有測試目的的舊紀錄序號為 0)
  query_page(
    "r.id * 10000 + coalesce(t.ord, 0)",
    &UAT_RUN_COLUMNS,
    &from_where,
    &[
      &filter.page,
      &filter.triggered_by,
      &filter.overall_status,
      &filter.started_at,
      &filter.run_id,
    ],
    page,
    page_size,
  )
  .await
}

#[tauri::command]
pub async fn count_uat_runs() -> Result<i64, String> {
  count("SELECT count(*) FROM uat_runs").await
}

// ---------------------------------------------------------------------
// employees: 帳號權限管理 (admin / user)
// ---------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
  account: String,
  password: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Employee {
  account: String,
  role: String,
  must_change_password: bool,
}

// 用 pgcrypto 的 crypt() 直接在 SQL 端比對 bcrypt 雜湊, 密碼明碼只在這次查詢的參數裡, 不落地存放
#[tauri::command]
pub async fn login(req: LoginRequest) -> Result<Employee, String> {
  let client = connect().await?;
  let row = client
    .query_opt(
      "SELECT account, role, must_change_password FROM employees \
       WHERE account = $1 AND password_hash = crypt($2, password_hash)",
      &[&req.account, &req.password],
    )
    .await
    .map_err(|e| format!("登入查詢失敗: {e}"))?;
  if let Some(row) = row {
    return Ok(Employee {
      account: row.get("account"),
      role: row.get("role"),
      must_change_password: row.get("must_change_password"),
    });
  }
  // 帳號不存在或密碼錯誤都會走到這裡; 帳號不存在時額外跑一次 crypt(), 讓回應時間接近「帳號存在但密碼錯」的情況,
  // 避免單純用回應時間差就能猜出哪些帳號存在 (bcrypt 刻意很慢, 沒跑到的話回應會明顯快很多)
  let _ = client.query_one("SELECT crypt($1, gen_salt('bf'))", &[&req.password]).await;
  Err("帳號或密碼錯誤".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordRequest {
  account: String,
  old_password: String,
  new_password: String,
}

#[tauri::command]
pub async fn change_password(req: ChangePasswordRequest) -> Result<(), String> {
  if req.new_password.len() < 6 {
    return Err("新密碼至少需要 6 碼".to_string());
  }
  let client = connect().await?;
  let updated = client
    .execute(
      "UPDATE employees SET password_hash = crypt($3, gen_salt('bf')), must_change_password = false \
       WHERE account = $1 AND password_hash = crypt($2, password_hash)",
      &[&req.account, &req.old_password, &req.new_password],
    )
    .await
    .map_err(|e| format!("更新密碼失敗: {e}"))?;
  if updated == 0 {
    return Err("帳號或原密碼錯誤".to_string());
  }
  Ok(())
}
