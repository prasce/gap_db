// PostgreSQL (gap_db) 存取; 連線設定使用 libpq 標準環境變數 PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
use serde::{Deserialize, Serialize};
use std::env;
use tokio_postgres::{Client, NoTls, Row};

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

// 貨品主檔查詢條件; 空值代表不限制, 有值時為部分符合、不分大小寫
#[derive(Debug, Default, Deserialize)]
pub struct ItemFilter {
  customer_code: Option<String>,
  sku: Option<String>,
  barcode: Option<String>,
  long_description: Option<String>,
}

// gapwmc_832_item 的 26 個資料欄; NUMERIC 欄位在 SQL 中轉成文字
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

#[derive(Debug, Serialize)]
pub struct Item832 {
  id: i64,
  #[serde(flatten)]
  fields: std::collections::BTreeMap<&'static str, Option<String>>,
}

impl From<Row> for Item832 {
  fn from(row: Row) -> Self {
    Item832 {
      id: row.get("id"),
      fields: ITEM_832_COLUMNS
        .iter()
        .map(|&c| (c, row.get::<_, Option<String>>(c)))
        .collect(),
    }
  }
}

// 空白視為不限制; 跳脫 LIKE 的萬用字元, 讓 % 和 _ 當一般字元比對
fn like_term(v: &Option<String>) -> Option<String> {
  v.as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

// 查詢最多回傳的筆數; total 為符合條件的總筆數, 超過上限時前端會提示
const QUERY_LIMIT: i64 = 1000;

#[derive(Debug, Serialize)]
pub struct Item832Page {
  items: Vec<Item832>,
  total: i64,
  limit: i64,
}

#[tauri::command]
pub async fn query_832_items(filter: ItemFilter) -> Result<Item832Page, String> {
  let client = connect().await?;
  let select = ITEM_832_COLUMNS
    .iter()
    .map(|c| format!("{c}::text AS {c}"))
    .collect::<Vec<_>>()
    .join(", ");
  let sql = format!(
    "SELECT id, {select}, count(*) OVER () AS total FROM gapwmc_832_item
     WHERE ($1::text IS NULL OR customer_code ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR sku ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR barcode ILIKE '%' || $3 || '%')
       AND ($4::text IS NULL OR long_description ILIKE '%' || $4 || '%')
     ORDER BY id
     LIMIT {QUERY_LIMIT}"
  );
  let rows = client
    .query(
      &sql,
      &[
        &like_term(&filter.customer_code),
        &like_term(&filter.sku),
        &like_term(&filter.barcode),
        &like_term(&filter.long_description),
      ],
    )
    .await
    .map_err(|e| format!("查詢失敗: {e}"))?;
  // count(*) OVER () 在 LIMIT 之前計算, 所以是全部符合條件的筆數
  let total = rows.first().map_or(0, |row| row.get::<_, i64>("total"));
  Ok(Item832Page {
    items: rows.into_iter().map(Item832::from).collect(),
    total,
    limit: QUERY_LIMIT,
  })
}

#[tauri::command]
pub async fn count_832_items() -> Result<i64, String> {
  let client = connect().await?;
  let row = client
    .query_one("SELECT count(*) FROM gapwmc_832_item", &[])
    .await
    .map_err(|e| format!("查詢失敗: {e}"))?;
  Ok(row.get(0))
}
