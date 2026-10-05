// 「UAT 測試」按鈕: 貨品主檔/收貨明細頁面用, 讓 user 把測試檔放進指定資料夾後按鈕觸發, 依 task.md 規劃
//   - 重用 scripts/import.mjs (透過 tauri-plugin-shell 直接執行 `node scripts/import.mjs --replace <file>`), 不在 Rust 重寫一份匯入邏輯
//   - 832: 掃描 doc/832-uat-test/ 的 .im 檔, 匯入後順便驗證「一般使用者隱藏已刪除 SKU / 管理員可查完整歷史」邏輯
//   - 850: 掃描 doc/850-uat-test/ 的 .rc 檔 (SET 01~07), 依檔名順序匯入, 匯入前先確認同一張 PO 停在前一個情境通過後的狀態 (一個情境通過才能測下一個), 匯入後比對 PO 的狀態/明細行, 每個情境通過就立刻把該檔移到 bak/
use crate::db;
use crate::uat_diff::{self, ColumnChange, Line, UatTask};
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

// 單一檔案匯入的逾時上限; 避免 Gmail SMTP 卡住或 node 程序掛住時整個 UAT 測試永遠轉圈圈
const IMPORT_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Serialize, Clone)]
pub struct UatItem {
  name: String,
  status: String, // pass / fail / skip
  detail: String,
}

#[derive(Debug, Serialize)]
pub struct UatResult {
  id: i64,
  page: String,
  overall_status: String,
  items: Vec<UatItem>,
}

fn project_root() -> PathBuf {
  PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/.."))
}

fn file_display_name(file: &Path) -> String {
  file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| file.to_string_lossy().into_owned())
}

// 列出資料夾內指定副檔名的檔案 (不分大小寫), 依檔名排序; 資料夾不存在或是空的都回傳空清單, 不算錯誤
fn list_files(folder: &Path, ext: &str) -> Vec<PathBuf> {
  let mut files: Vec<PathBuf> = std::fs::read_dir(folder)
    .into_iter()
    .flatten()
    .filter_map(|entry| entry.ok())
    .map(|entry| entry.path())
    .filter(|path| {
      path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(ext))
    })
    .collect();
  files.sort();
  files
}

// 執行 `node scripts/import.mjs --replace <file>`; 直接呼叫 node.exe (CreateProcess 會自動補上 .exe 副檔名找到它),
// 不透過 pnpm/cmd.exe, 避免 cmd.exe 的命令列再解析對 &、%、^ 等字元有特殊處理的風險, 也不用處理 pnpm 是 .cmd 檔案的問題
async fn run_import(app: &AppHandle, file: &Path) -> Result<String, String> {
  let script = project_root().join("scripts").join("import.mjs");
  let command = app
    .shell()
    .command("node")
    .arg(script.as_os_str())
    .arg("--replace")
    .arg(file.as_os_str())
    .current_dir(project_root());

  let output = tokio::time::timeout(IMPORT_TIMEOUT, command.output())
    .await
    .map_err(|_| format!("匯入逾時 (超過 {} 秒)", IMPORT_TIMEOUT.as_secs()))?
    .map_err(|e| format!("執行匯入指令失敗: {e}"))?;

  let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    return Err(if stderr.trim().is_empty() { stdout } else { format!("{stdout}\n{stderr}") });
  }
  Ok(stdout)
}

// 把匯入成功的測試檔移到來源資料夾下的 bak/ (不存在就建立), 避免下次按 UAT 測試又重複匯入同一份;
// bak/ 已有同名檔案時在檔名後加上時間戳 (Unix 秒), 不覆蓋舊檔
fn move_to_bak(file: &Path) -> Result<PathBuf, String> {
  let bak = file.parent().ok_or("找不到檔案所在資料夾")?.join("bak");
  std::fs::create_dir_all(&bak).map_err(|e| format!("建立 bak 資料夾失敗: {e}"))?;
  let name = file.file_name().ok_or("找不到檔名")?;
  let mut dest = bak.join(name);
  if dest.exists() {
    let secs = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_secs())
      .unwrap_or(0);
    dest = bak.join(format!("{}.{secs}", name.to_string_lossy()));
  }
  std::fs::rename(file, &dest).map_err(|e| format!("移動檔案失敗: {e}"))?;
  Ok(dest)
}

// 單一情境成功後立刻歸檔; 回傳要附加在該情境報告的一行說明。
// 移動失敗不影響通過判定 (資料已入庫), 只在報告註明
fn archive_note(file: &Path) -> String {
  match move_to_bak(file) {
    Ok(dest) => format!("已歸檔: {} -> {}", file_display_name(file), dest.display()),
    Err(e) => format!("{}: 未能移至 bak: {e}", file_display_name(file)),
  }
}

// 832 一個檔案匯入後的測試目的: 取本檔新列的事件類型 (importer 依檔名寫入 status), UPDATE 時逐列去找同 SKU 的上一筆舊資料比對。
// 舊資料以 customer_code + sku + long_description 第 1 碼配對 (不含 item_size/item_colour, 所以 item_colour 被改也看得出來),
// 只取本檔之前匯入的列 (id 較小), 同 SKU 有多筆時優先選 item_size 相同的
async fn im_file_tasks(source_file: &str) -> Result<Vec<UatTask>, String> {
  let client = db::connect().await?;
  let new_rows = client
    .query("SELECT to_jsonb(t) FROM gapwmc_832_item t WHERE source_file = $1 ORDER BY line_no", &[&source_file])
    .await
    .map_err(|e| format!("查詢本檔資料失敗: {e}"))?;
  let new_rows: Vec<Map<String, Value>> = new_rows
    .iter()
    .filter_map(|r| r.get::<_, Value>(0).as_object().cloned())
    .collect();
  let Some(first) = new_rows.first() else { return Ok(Vec::new()) };
  let event = first.get("status").and_then(Value::as_str).unwrap_or("UPDATE").to_string();
  let skus: Vec<String> = new_rows.iter().filter_map(|r| r.get("sku").and_then(Value::as_str).map(str::to_string)).collect();
  if event != "UPDATE" {
    return Ok(uat_diff::im_tasks(&event, &skus, None));
  }

  let text = |row: &Map<String, Value>, key: &str| row.get(key).and_then(Value::as_str).map(str::to_string);
  let mut changes: Vec<ColumnChange> = Vec::new();
  let mut any_old = false;
  for row in &new_rows {
    let old = client
      .query_opt(
        "SELECT to_jsonb(p) FROM gapwmc_832_item p \
         WHERE p.customer_code = $1 AND p.sku = $2 \
           AND left(p.long_description, 1) IS NOT DISTINCT FROM left($3::text, 1) \
           AND p.id < (SELECT min(id) FROM gapwmc_832_item WHERE source_file = $4) \
         ORDER BY (p.item_size IS NOT DISTINCT FROM $5::text) DESC, p.id DESC LIMIT 1",
        &[&text(row, "customer_code"), &text(row, "sku"), &text(row, "long_description"), &source_file, &text(row, "item_size")],
      )
      .await
      .map_err(|e| format!("查詢舊資料失敗: {e}"))?;
    if let Some(old) = old.and_then(|r| r.get::<_, Value>(0).as_object().cloned()) {
      any_old = true;
      changes.extend(uat_diff::diff_columns(&old, row));
    }
  }
  Ok(uat_diff::im_tasks(&event, &skus, any_old.then_some(changes.as_slice())))
}

async fn run_item_master_uat(app: &AppHandle, account: Option<&str>) -> Result<(Vec<UatItem>, Vec<UatTask>), String> {
  let folder = project_root().join("doc").join("832-uat-test");
  let files = list_files(&folder, "im");
  if files.is_empty() {
    let skip = UatItem {
      name: "832 測試 (001/002/003)".into(),
      status: "skip".into(),
      detail: "doc/832-uat-test/ 沒有 .im 測試檔, 請放入檔案後再測試".into(),
    };
    return Ok((vec![skip], Vec::new()));
  }

  let mut items = Vec::new();
  let mut tasks: Vec<UatTask> = Vec::new();
  for file in &files {
    let name = file_display_name(file);
    match run_import(app, file).await {
      // 匯入成功即記錄測試目的並歸檔, 不等其他檔案; 匯入失敗的檔案留在原處。測試目的要在歸檔前取 (只看資料庫, 不依賴檔案位置)
      Ok(stdout) => {
        let task_note = match im_file_tasks(&name).await {
          Ok(file_tasks) => {
            tasks.extend(file_tasks);
            String::new()
          }
          Err(e) => format!("\n未能記錄測試目的: {e}"),
        };
        items.push(UatItem {
          name: format!("832 匯入: {name}"),
          status: "pass".into(),
          detail: format!("{}\n{}{task_note}", stdout.trim(), archive_note(file)),
        });
      }
      Err(e) => items.push(UatItem { name: format!("832 匯入: {name}"), status: "fail".into(), detail: e }),
    }
  }

  // 002: 一般使用者查詢應該看不到「最新 status = DELETE」的 SKU, 管理員 (真的登入 admin 帳號時) 應該看得到;
  // 直接重用 query_832_items (跟畫面查詢同一份邏輯與同一份權限檢查), 而不是在這裡另外組一份比對用的 SQL。
  // 管理員視角查詢現在會做後端權限驗證, 所以如果目前執行 UAT 測試的帳號不是 admin, 這一項會直接回報失敗並說明原因
  let normal = db::query_832_items(db::ItemFilter::default(), 1, 1, None).await?;
  let admin_result = db::query_832_items(
    db::ItemFilter { include_deleted: Some("true".into()), ..Default::default() },
    1,
    1,
    account.map(str::to_string),
  )
  .await;

  let client = db::connect().await?;
  let has_any_delete: bool = client
    .query_one(
      &format!(
        "SELECT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON ({key}) status FROM gapwmc_832_item \
         ORDER BY {key}, created_at DESC) t WHERE status = 'DELETE')",
        key = db::SKU_IDENTITY_KEY
      ),
      &[],
    )
    .await
    .map(|row| row.get(0))
    .map_err(|e| format!("驗證查詢失敗: {e}"))?;

  items.push(match admin_result {
    Ok(admin) => {
      // 資料庫裡如果真的有已刪除的 SKU, 管理員視角筆數必須嚴格大於一般使用者視角, 才代表隱藏邏輯真的有作用
      // (單純 >= 就算隱藏邏輯完全失效、兩邊筆數一樣也會誤判通過, 見 code review 發現的問題)
      let ok = if has_any_delete { admin.total > normal.total } else { admin.total == normal.total };
      UatItem {
        name: "832-002: 一般使用者隱藏已刪除 SKU / 管理員可查完整歷史".into(),
        status: if ok { "pass" } else { "fail" }.into(),
        detail: format!(
          "一般使用者視角 {} 筆, 管理員視角 (含已刪除) {} 筆, 資料庫目前{}已刪除狀態的 SKU",
          normal.total,
          admin.total,
          if has_any_delete { "有" } else { "沒有" }
        ),
      }
    }
    Err(e) => UatItem {
      name: "832-002: 一般使用者隱藏已刪除 SKU / 管理員可查完整歷史".into(),
      status: "fail".into(),
      detail: format!("管理員視角查詢失敗 (執行 UAT 測試的帳號可能不是 admin): {e}"),
    },
  });

  Ok((items, tasks))
}

// 850 UAT 情境 (doc/850-uat-test/ 的 SET 01~07): SET 01~06 是同一張 PO (TEST0001) 依序變化, 必須依檔名順序匯入,
// 850 同一張 PO 同時只有一份有效的, 每個檔案都是原地更新它 (CANCEL 只改狀態保留); SET 06 重新啟用則新增一筆, 舊的 CANCEL 筆保留; 每一步匯入後都比對這張 PO 的 header 狀態與明細行; SET 07 是另一張 PO, 品號不在 832 (情境 7), 必須被擋下 (不寫入資料庫) 並寄警示信
struct ReceivingCase {
  set_no: u32,
  label: &'static str,
  kind: &'static str, // 寫入 uat_runs.type 的測試目的代碼
  po: &'static str,
  status: &'static str,
  lines: &'static [(&'static str, f64)], // (完整品號 = f05_item_number + f26_item_last_digit, 訂購數量)
  expect_blocked: bool, // true: 品號不在 832 Item Master, 整個檔案必須被擋下 (不寫入 header/detail/carton) 並寄警示信
}

const RECEIVING_CASES: [ReceivingCase; 7] = [
  ReceivingCase { set_no: 1, kind: "ACTIVE", label: "基準 - PO 生效 (1 行)", po: "TEST0001", status: "ACTIVE", lines: &[("324084338", 114.0)], expect_blocked: false },
  ReceivingCase {
    set_no: 2,
    kind: "UPDATE_ADD_LINE",
    label: "情境 1 - 新增 SKU/Size",
    po: "TEST0001",
    status: "ACTIVE",
    lines: &[("324084338", 114.0), ("323891352", 114.0)],
    expect_blocked: false,
  },
  ReceivingCase {
    set_no: 3,
    kind: "UPDATE_QTY",
    label: "情境 3 - 變更 Item 數量",
    po: "TEST0001",
    status: "ACTIVE",
    lines: &[("324084338", 200.0), ("323891352", 300.0)],
    expect_blocked: false,
  },
  ReceivingCase { set_no: 4, kind: "UPDATE_DELETE_LINE", label: "情境 2 - 刪除 SKU/Size", po: "TEST0001", status: "ACTIVE", lines: &[("324084338", 200.0)], expect_blocked: false },
  ReceivingCase { set_no: 5, kind: "CANCEL", label: "情境 4 - 取消 PO", po: "TEST0001", status: "CANCEL", lines: &[("324084338", 200.0)], expect_blocked: false },
  ReceivingCase { set_no: 6, kind: "REP_ACTIVE", label: "情境 5 - 重新啟用 PO (新增一筆)", po: "TEST0001", status: "ACTIVE", lines: &[("324084338", 200.0)], expect_blocked: false },
  ReceivingCase {
    set_no: 7,
    kind: "ITEM_NOT_FOUND",
    label: "情境 6 - 未收到 Item Master 即收到 DPO",
    po: "TEST0002",
    status: "ACTIVE",
    lines: &[("TEST84338", 114.0), ("TEST91352", 114.0)],
    expect_blocked: true,
  },
];

// 檔名開頭 "SET 03 ..." -> 3
fn parse_set_no(file_name: &str) -> Option<u32> {
  let digits: String = file_name.strip_prefix("SET ")?.chars().take_while(|c| c.is_ascii_digit()).collect();
  digits.parse().ok()
}

// 同一張 PO 在資料庫的目前狀態: 取最新一筆 header (同一張 PO 同時只有一份有效的, 再收到就原地更新; CANCEL 只改狀態保留,
// CANCEL 之後再 ACTIVE 會新增一筆, 見 scripts/import.mjs pickTargetHeader + ux_gapwmc_850_header_po)
struct PoState {
  header_id: i64,
  header_count: i64, // 這張 PO 目前共有幾筆 header (含已取消保留的)
  cancelled_count: i64,
  source_file: String,
  status: String,
  lines: Vec<Line>,
}

async fn po_state(client: &tokio_postgres::Client, po: &str) -> Result<Option<PoState>, String> {
  let Some(row) = client
    .query_opt(
      "SELECT id, source_file, f13_order_status, count(*) OVER () AS header_count,               count(*) FILTER (WHERE upper(trim(f13_order_status)) IN ('CANCEL', 'CANCELLED')) OVER () AS cancelled_count        FROM gapwmc_850_header WHERE f06_po_number = $1 ORDER BY id DESC LIMIT 1",
      &[&po],
    )
    .await
    .map_err(|e| format!("驗證查詢失敗: {e}"))?
  else {
    return Ok(None);
  };
  let header_id: i64 = row.get("id");
  let status: Option<String> = row.get("f13_order_status");
  Ok(Some(PoState {
    header_id,
    header_count: row.get("header_count"),
    cancelled_count: row.get("cancelled_count"),
    source_file: row.get::<_, Option<String>>("source_file").unwrap_or_default(),
    status: status.unwrap_or_default().trim().to_string(),
    lines: header_lines(client, header_id).await?,
  }))
}

fn same_lines(actual: &[Line], expected: &[Line]) -> bool {
  actual.len() == expected.len() && actual.iter().zip(expected).all(|(a, e)| a.0 == e.0 && (a.1 - e.1).abs() < 1e-9)
}

fn expected_lines(case: &ReceivingCase) -> Vec<Line> {
  case.lines.iter().map(|(i, q)| (i.to_string(), *q)).collect()
}

// 匯入前檢查 (GAP 要求一個情境通過才能測下一個): 同一張 PO 前一個情境 (SET 編號較小者) 通過後留下的狀態, 必須就是資料庫現在的狀態。
// 前面的檔案通過後已移到 bak/, 所以用資料庫判斷而不是看檔案在不在。這張 PO 的第一個情境則要求 PO 還不存在 (才是「新開 PO」)。
// 回傳匯入前的 (狀態, 明細) 供產生 uat_task 比對用; 新開 PO 回傳 None
async fn precheck_receiving_case(case: &ReceivingCase) -> Result<Option<(String, Vec<Line>)>, String> {
  let client = db::connect().await?;
  let state = po_state(&client, case.po).await?;
  let earlier = RECEIVING_CASES.iter().filter(|c| c.po == case.po && c.set_no < case.set_no).max_by_key(|c| c.set_no);
  match (earlier, state) {
    (None, None) => Ok(None),
    (None, Some(_)) => Err(format!(
      "PO {po} 已存在於資料庫, 無法測「新開 PO」。請先刪除測試資料再測: DELETE FROM gapwmc_850_header WHERE f06_po_number = '{po}';",
      po = case.po
    )),
    (Some(e), None) => Err(format!("前一個情境 SET {:02} ({}) 尚未通過 (資料庫沒有 PO {}), 請依序先測完", e.set_no, e.label, case.po)),
    (Some(e), Some(s)) => {
      if s.status != e.status || !same_lines(&s.lines, &expected_lines(e)) {
        return Err(format!(
          "PO {} 目前的狀態與前一個情境 SET {:02} ({}) 通過後應有的狀態不符 (預期 {} {:?}, 實際 {} {:?}), 請依序測試",
          case.po, e.set_no, e.label, e.status, expected_lines(e), s.status, s.lines
        ));
      }
      Ok(Some((s.status, s.lines)))
    }
  }
}

// 這個情境匯入後, 這張 PO 預期有幾筆 header: 每個「重新啟用」(REP_ACTIVE) 都會新增一筆, 其餘情境原地更新
fn expected_header_count(case: &ReceivingCase) -> i64 {
  1 + RECEIVING_CASES.iter().filter(|c| c.po == case.po && c.kind == "REP_ACTIVE" && c.set_no <= case.set_no).count() as i64
}

// 匯入後比對: 最新一筆 header 是被本檔寫入的 (source_file 就是本檔), 狀態、明細行 (依檔案順序) 與預期一致, header 筆數正確
// (CANCEL 只改狀態不刪除, 重新啟用則新增一筆且舊的 CANCEL 筆保留)
async fn verify_receiving_case(case: &ReceivingCase, file_name: &str) -> Result<(), String> {
  let client = db::connect().await?;
  let state = po_state(&client, case.po).await?.ok_or_else(|| format!("資料庫找不到 PO {}", case.po))?;
  if state.source_file != file_name {
    return Err(format!("PO {} 最後更新的檔案是 {}, 不是本檔", case.po, state.source_file));
  }
  if state.status != case.status {
    return Err(format!("PO {} 狀態應為 {}, 實際為 {}", case.po, case.status, state.status));
  }
  let expected = expected_lines(case);
  if !same_lines(&state.lines, &expected) {
    return Err(format!("明細行不符: 預期 {expected:?}, 實際 {:?}", state.lines));
  }
  let expected_count = expected_header_count(case);
  if state.header_count != expected_count {
    return Err(format!("PO {} 應有 {expected_count} 筆 header, 實際 {} 筆", case.po, state.header_count));
  }
  if case.kind == "REP_ACTIVE" && state.cancelled_count < 1 {
    return Err(format!("PO {} 重新啟用後, 舊的 CANCEL 那筆應保留, 但資料庫沒有已取消的 header", case.po));
  }
  Ok(())
}

// 被擋下的情境 (品號不在 832 Item Master): 匯入程式必須以失敗結束並印出「已擋下」與「已寄出警示信」,
// 且資料庫完全沒有這張 PO (header 不存在, detail / carton 隨 header 一起不存在, 沒有任何寫入)
async fn verify_blocked_case(case: &ReceivingCase, output: &str) -> Result<(), String> {
  if !output.contains("已擋下") {
    return Err(format!("應被擋下但輸出沒有「已擋下」:\n{}", output.trim()));
  }
  if !output.contains("已寄出警示信") {
    return Err("已擋下, 但沒有寄出警示信 (請檢查 Gmail 設定)".to_string());
  }
  let client = db::connect().await?;
  if po_state(&client, case.po).await?.is_some() {
    return Err(format!("PO {} 應被擋下, 但資料庫已經有它的資料", case.po));
  }
  Ok(())
}

// 某筆 850 header 的明細行 (完整品號 = f05_item_number + f26_item_last_digit, 訂購數量), 依檔案順序
async fn header_lines(client: &tokio_postgres::Client, header_id: i64) -> Result<Vec<Line>, String> {
  let rows = client
    .query(
      "SELECT f05_item_number || coalesce(f26_item_last_digit, '') AS item, f06_order_quantity::text AS qty \
       FROM gapwmc_850_detail WHERE header_id = $1 ORDER BY id",
      &[&header_id],
    )
    .await
    .map_err(|e| format!("驗證查詢失敗: {e}"))?;
  Ok(
    rows
      .iter()
      .map(|r| {
        let item: String = r.get("item");
        let qty: String = r.get("qty");
        (item, qty.parse::<f64>().unwrap_or(f64::NAN))
      })
      .collect(),
  )
}

async fn item_master_exists(full_item: &str) -> Result<bool, String> {
  let client = db::connect().await?;
  client
    .query_one(
      "SELECT EXISTS (SELECT 1 FROM gapwmc_832_item WHERE sku || left(long_description, 1) = $1)",
      &[&full_item],
    )
    .await
    .map(|row| row.get(0))
    .map_err(|e| format!("驗證查詢失敗: {e}"))
}

async fn run_receiving_uat(app: &AppHandle) -> Result<(Vec<UatItem>, Vec<UatTask>), String> {
  let folder = project_root().join("doc").join("850-uat-test");
  let files = list_files(&folder, "rc"); // 依檔名排序 = SET 01, 02, ... 的執行順序
  if files.is_empty() {
    let skip = UatItem {
      name: "850 測試 (情境 1-7)".into(),
      status: "skip".into(),
      detail: "doc/850-uat-test/ 沒有 .rc 測試檔, 請放入檔案後再測試".into(),
    };
    return Ok((vec![skip], Vec::new()));
  }
  let present: Vec<u32> = files.iter().filter_map(|f| parse_set_no(&file_display_name(f))).collect();

  // 前置檢查: 不預期觸發警示信的情境, 品號必須先有 832 Item Master, 否則每一步都會誤寄警示信; 缺的話一個檔案都不匯入
  let mut missing = Vec::new();
  for case in RECEIVING_CASES.iter().filter(|c| !c.expect_blocked && present.contains(&c.set_no)) {
    for (item, _) in case.lines {
      if !missing.contains(item) && !item_master_exists(item).await? {
        missing.push(*item);
      }
    }
  }
  if !missing.is_empty() {
    let check = UatItem {
      name: "850 前置檢查: 832 Item Master".into(),
      status: "fail".into(),
      detail: format!("以下品號在 gapwmc_832_item 找不到, 請先匯入對應的 832 檔案後再測試 (避免每個步驟都誤寄警示信): {}", missing.join(", ")),
    };
    return Ok((vec![check], Vec::new()));
  }

  let mut items = Vec::new();
  let mut failed = false;
  let mut tasks: Vec<UatTask> = Vec::new();
  for file in &files {
    let fname = file_display_name(file);
    let case = parse_set_no(&fname).and_then(|n| RECEIVING_CASES.iter().find(|c| c.set_no == n));
    let name = match case {
      Some(c) => format!("{} ({fname})", c.label),
      None => format!("850 匯入: {fname}"),
    };
    if failed {
      items.push(UatItem { name, status: "skip".into(), detail: "前面的步驟失敗, 後續情境依賴前一步的結果, 未執行".into() });
      continue;
    }
    // outcome: (報告說明, 匯入前這張 PO 的 (狀態, 明細)); 後者用來產生 uat_task。順序: 匯入前檢查前一個情境 -> 匯入 -> 匯入後比對
    let outcome = match case {
      Some(c) => match precheck_receiving_case(c).await {
        Ok(prev) => match (c.expect_blocked, run_import(app, file).await) {
          // 預期被擋下: 匯入程式失敗結束 (Err) 才是對的, 還要確認沒有寫入任何資料
          (true, Err(output)) => verify_blocked_case(c, &output).await.map(|_| (format!("已擋下, 未寫入資料庫, 已寄警示信\n{}", output.trim()), prev)),
          (true, Ok(stdout)) => Err(format!("應被擋下卻匯入成功了:\n{}", stdout.trim())),
          (false, Ok(stdout)) => verify_receiving_case(c, &fname).await.map(|_| (format!("匯入成功, 比對通過\n{}", stdout.trim()), prev)),
          (false, Err(e)) => Err(e),
        },
        Err(e) => Err(e),
      },
      None => run_import(app, file).await.map(|stdout| (format!("匯入成功 (無比對規則)\n{}", stdout.trim()), None)),
    };
    match outcome {
      Ok((detail, prev)) => {
        // 通過比對的情境立刻歸檔; 沒有比對規則的檔案沒被驗證過, 不歸檔, 留在原處並在報告註明
        let detail = match case {
          Some(c) => {
            let cur: Vec<Line> = c.lines.iter().map(|(i, q)| (i.to_string(), *q)).collect();
            let prev = prev.as_ref().map(|(status, lines)| (status.as_str(), lines.as_slice()));
            tasks.extend(uat_diff::receiving_tasks(c.kind, c.po, c.status, &cur, prev));
            format!("{detail}\n{}", archive_note(file))
          }
          None => format!("{detail}\n{fname}: 無比對規則, 未歸檔"),
        };
        items.push(UatItem { name, status: "pass".into(), detail });
      }
      Err(detail) => {
        failed = true;
        items.push(UatItem { name, status: "fail".into(), detail });
      }
    }
  }

  Ok((items, tasks))
}

#[tauri::command]
pub async fn run_uat_test(app: AppHandle, page: String, account: Option<String>) -> Result<UatResult, String> {
  let (items, tasks) = match page.as_str() {
    "item_master" => run_item_master_uat(&app, account.as_deref()).await?,
    "receiving" => run_receiving_uat(&app).await?,
    other => return Err(format!("未知的頁面: {other}")),
  };
  let overall_status = if items.iter().any(|i| i.status == "fail") { "fail" } else { "pass" };
  let results_json = serde_json::to_value(&items).map_err(|e| format!("結果序列化失敗: {e}"))?;

  // 沒有測試目的 (例如略過/前置檢查失敗) 就存 NULL, 列表只顯示一列
  let kinds: Option<Vec<String>> = (!tasks.is_empty()).then(|| tasks.iter().map(|t| t.kind.clone()).collect());
  let task_texts: Option<Vec<String>> = (!tasks.is_empty()).then(|| tasks.iter().map(|t| t.task.clone()).collect());

  let client = db::connect().await?;
  let row = client
    .query_one(
      "INSERT INTO uat_runs (page, triggered_by, overall_status, results, finished_at, type, uat_task) \
       VALUES ($1, $2, $3, $4, now(), $5, $6) RETURNING id",
      &[&page, &account, &overall_status, &results_json, &kinds, &task_texts],
    )
    .await
    .map_err(|e| format!("寫入 uat_runs 失敗: {e}"))?;

  Ok(UatResult { id: row.get("id"), page, overall_status: overall_status.to_string(), items })
}

#[cfg(test)]
mod tests {
  use super::*;

  // 用系統暫存目錄底下的隨機子資料夾當測試用資料夾, 不加額外的 tempfile 類套件依賴
  fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("gap_db_uat_test_{name}_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn list_files_filters_by_extension_case_insensitive_and_sorts() {
    let dir = temp_dir("ext_filter");
    std::fs::write(dir.join("b.IM"), "").unwrap();
    std::fs::write(dir.join("a.im"), "").unwrap();
    std::fs::write(dir.join("c.rc"), "").unwrap();
    std::fs::write(dir.join("readme.txt"), "").unwrap();

    let files = list_files(&dir, "im");
    let names: Vec<String> = files.iter().map(|f| file_display_name(f)).collect();

    assert_eq!(names, vec!["a.im".to_string(), "b.IM".to_string()]);

    std::fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn list_files_returns_empty_for_missing_folder() {
    let dir = std::env::temp_dir().join("gap_db_uat_test_does_not_exist");
    let _ = std::fs::remove_dir_all(&dir);

    assert!(list_files(&dir, "im").is_empty());
  }

  #[test]
  fn file_display_name_uses_the_file_name_component() {
    let path = PathBuf::from("C:/some/dir/SET 01 test.im");
    assert_eq!(file_display_name(&path), "SET 01 test.im");
  }
}
