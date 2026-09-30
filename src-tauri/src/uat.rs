// 「UAT 測試」按鈕: 貨品主檔/收貨明細頁面用, 讓 user 把測試檔放進指定資料夾後按鈕觸發, 依 task.md 規劃
//   - 重用 scripts/import.mjs (透過 tauri-plugin-shell 直接執行 `node scripts/import.mjs --replace <file>`), 不在 Rust 重寫一份匯入邏輯
//   - 832: 掃描 doc/832-uat-test/ 的 .im 檔, 匯入後順便驗證「一般使用者隱藏已刪除 SKU / 管理員可查完整歷史」邏輯
//   - 850: 掃描 doc/850-SKU existence/ (情境 6) 與 doc/850-scenario-2/3/5-.../ (目前僅驗證匯入成功, 情境 1-5 的比對邏輯待日後有
//     真正共用同一個 PO# 的測試檔才實作, 見 task.md「UAT 測試按鈕」風險 1)
use crate::db;
use serde::Serialize;
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

async fn run_item_master_uat(app: &AppHandle, account: Option<&str>) -> Result<Vec<UatItem>, String> {
  let folder = project_root().join("doc").join("832-uat-test");
  let files = list_files(&folder, "im");
  if files.is_empty() {
    return Ok(vec![UatItem {
      name: "832 測試 (001/002/003)".into(),
      status: "skip".into(),
      detail: "doc/832-uat-test/ 沒有 .im 測試檔, 請放入檔案後再測試".into(),
    }]);
  }

  let mut items = Vec::new();
  for file in &files {
    let name = file_display_name(file);
    match run_import(app, file).await {
      Ok(stdout) => items.push(UatItem {
        name: format!("832 匯入: {name}"),
        status: "pass".into(),
        detail: stdout.trim().to_string(),
      }),
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

  Ok(items)
}

async fn run_receiving_uat(app: &AppHandle) -> Result<Vec<UatItem>, String> {
  // (資料夾名稱, 報告項目名稱); 情境 2/3/5 目前只驗證「檔案匯入成功」, 尚未實作「同一 PO# 前後比對」邏輯 (見 task.md)
  let folders: [(&str, &str); 4] = [
    ("850-SKU existence", "情境 6 - 未收到 Item Master 即收到 DPO"),
    ("850-scenario-2-delete-sku", "情境 2 - 刪除 SKU/Size (僅驗證匯入成功, 比對邏輯待實作)"),
    ("850-scenario-3-qty-change", "情境 3 - 變更 Item 數量 (僅驗證匯入成功, 比對邏輯待實作)"),
    ("850-scenario-5-reactivate-po", "情境 5 - 重新啟用 PO (僅驗證匯入成功, 比對邏輯待實作)"),
  ];

  let mut items = Vec::new();
  for (dir_name, label) in folders {
    let folder = project_root().join("doc").join(dir_name);
    let files = list_files(&folder, "rc");
    if files.is_empty() {
      items.push(UatItem {
        name: label.into(),
        status: "skip".into(),
        detail: format!("doc/{dir_name}/ 沒有 .rc 測試檔, 請放入檔案後再測試"),
      });
      continue;
    }

    let mut ok = true;
    let mut details = Vec::new();
    for file in &files {
      let fname = file_display_name(file);
      match run_import(app, file).await {
        Ok(stdout) => {
          let alerted = stdout.contains("已寄出警示信");
          details.push(format!("{fname}: 匯入成功{}", if alerted { " (觸發情境 6 警示信)" } else { "" }));
        }
        Err(e) => {
          ok = false;
          details.push(format!("{fname}: 失敗 - {e}"));
        }
      }
    }
    items.push(UatItem { name: label.into(), status: if ok { "pass" } else { "fail" }.into(), detail: details.join("\n") });
  }

  Ok(items)
}

#[tauri::command]
pub async fn run_uat_test(app: AppHandle, page: String, account: Option<String>) -> Result<UatResult, String> {
  let items = match page.as_str() {
    "item_master" => run_item_master_uat(&app, account.as_deref()).await?,
    "receiving" => run_receiving_uat(&app).await?,
    other => return Err(format!("未知的頁面: {other}")),
  };
  let overall_status = if items.iter().any(|i| i.status == "fail") { "fail" } else { "pass" };
  let results_json = serde_json::to_value(&items).map_err(|e| format!("結果序列化失敗: {e}"))?;

  let client = db::connect().await?;
  let row = client
    .query_one(
      "INSERT INTO uat_runs (page, triggered_by, overall_status, results, finished_at) \
       VALUES ($1, $2, $3, $4, now()) RETURNING id",
      &[&page, &account, &overall_status, &results_json],
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
