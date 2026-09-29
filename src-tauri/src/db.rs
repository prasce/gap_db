// PostgreSQL (gap_db) 存取; 連線設定使用 libpq 標準環境變數 PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, env};
use tokio_postgres::{types::ToSql, Client, NoTls};

// 開發時從專案根目錄的 .env 載入連線設定; 找不到檔案時沿用系統環境變數
pub fn load_env() {
  let _ = dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env"));
}

async fn connect() -> Result<Client, String> {
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

// 查詢最多回傳的筆數; total 為符合條件的總筆數, 超過上限時前端會提示
const QUERY_LIMIT: i64 = 1000;

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
  total: i64,
  limit: i64,
}

// 空白視為不限制; 跳脫 LIKE 的萬用字元, 讓 % 和 _ 當一般字元比對
fn like_term(v: &Option<String>) -> Option<String> {
  v.as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

// 共用查詢: columns 為 (SQL 運算式, 別名), from_where 為 FROM ... WHERE ... ORDER BY 部分;
// 每個查詢條件 $n 以部分符合、不分大小寫比對
async fn query_page(
  id_expr: &str,
  columns: &[(&str, &'static str)],
  from_where: &str,
  filters: &[&Option<String>],
) -> Result<Page, String> {
  let client = connect().await?;
  let select = columns
    .iter()
    .map(|(expr, alias)| format!("({expr})::text AS {alias}"))
    .collect::<Vec<_>>()
    .join(", ");
  let sql = format!(
    "SELECT {id_expr} AS id, {select}, count(*) OVER () AS total {from_where} LIMIT {QUERY_LIMIT}"
  );
  let terms: Vec<Option<String>> = filters.iter().map(|f| like_term(f)).collect();
  let params: Vec<&(dyn ToSql + Sync)> = terms.iter().map(|t| t as &(dyn ToSql + Sync)).collect();
  let rows = client
    .query(&sql, &params)
    .await
    .map_err(|e| format!("查詢失敗: {e}"))?;
  // count(*) OVER () 在 LIMIT 之前計算, 所以是全部符合條件的筆數
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
    limit: QUERY_LIMIT,
  })
}

// 以單一欄位做部分符合的 WHERE 條件; $n 為 NULL 時不限制
fn ilike(n: usize, expr: &str) -> String {
  format!("(${n}::text IS NULL OR {expr} ILIKE '%' || ${n} || '%')")
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
  customer_code: Option<String>,
  sku: Option<String>,
  barcode: Option<String>,
  long_description: Option<String>,
}

// gapwmc_832_item 的 26 個資料欄; 與 src/views/ItemMasterView.tsx 的 COLUMNS 相同順序
const ITEM_832_COLUMNS: [&str; 26] = [
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
];

#[tauri::command]
pub async fn query_832_items(filter: ItemFilter) -> Result<Page, String> {
  let columns: Vec<(&str, &'static str)> = ITEM_832_COLUMNS.iter().map(|&c| (c, c)).collect();
  let from_where = format!(
    "FROM gapwmc_832_item WHERE {} AND {} AND {} AND {} ORDER BY id",
    ilike(1, "customer_code"),
    ilike(2, "sku"),
    ilike(3, "barcode"),
    ilike(4, "long_description"),
  );
  query_page(
    "id",
    &columns,
    &from_where,
    &[
      &filter.customer_code,
      &filter.sku,
      &filter.barcode,
      &filter.long_description,
    ],
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
  vendor_name: Option<String>,
  item_number: Option<String>,
  order_status: Option<String>,
}

// (SQL 運算式, 別名); 只列已命名的欄位; 與 src/views/ReceivingView.tsx 的 COLUMNS 相同順序
const RECEIPT_850_COLUMNS: [(&str, &str); 18] = [
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
];

#[tauri::command]
pub async fn query_850_receipts(filter: ReceiptFilter) -> Result<Page, String> {
  let from_where = format!(
    "FROM gapwmc_850_detail d
     JOIN gapwmc_850_header h ON h.id = d.header_id
     WHERE {} AND {} AND {} AND {}
     ORDER BY h.id, d.id",
    ilike(1, "h.f06_po_number"),
    ilike(2, "h.f11_vendor_name"),
    // 商品編號被拆成前 8 碼與最後一碼; 接起來比對, 輸入 8 碼或完整 9 碼都能找到
    ilike(3, "(d.f05_item_number || coalesce(d.f26_item_last_digit, ''))"),
    ilike(4, "h.f13_order_status"),
  );
  query_page(
    "d.id",
    &RECEIPT_850_COLUMNS,
    &from_where,
    &[
      &filter.po_number,
      &filter.vendor_name,
      &filter.item_number,
      &filter.order_status,
    ],
  )
  .await
}

#[tauri::command]
pub async fn count_850_receipts() -> Result<i64, String> {
  count("SELECT count(*) FROM gapwmc_850_detail").await
}
