// UAT 測試目的 (uat_runs.type / uat_task) 的純比對邏輯, 不碰資料庫, 方便單元測試; 查詢舊資料的部分在 uat.rs
//   - 832: 新舊兩筆 gapwmc_832_item (to_jsonb) 逐欄比較 -> "欄位名: 舊值 → 新值"
//   - 850: 同一張 PO 前後兩次匯入的明細行比較 (新增行 / 刪除行 / 數量變更)
use serde_json::{Map, Value};

// 一筆測試目的; kind 寫入 uat_runs.type, task 寫入 uat_task (兩個陣列同索引成對)
#[derive(Debug, Clone, PartialEq)]
pub struct UatTask {
  pub kind: String,
  pub task: String,
}

impl UatTask {
  pub fn new(kind: &str, task: impl Into<String>) -> Self {
    Self { kind: kind.to_string(), task: task.into() }
  }
}

// 不算「內容變更」的欄位: 識別/來源/時間, 每次匯入本來就會不同
const IM_META_COLUMNS: [&str; 5] = ["id", "source_file", "line_no", "status", "created_at"];

#[derive(Debug, Clone, PartialEq)]
pub struct ColumnChange {
  pub column: String,
  pub old: String,
  pub new: String,
}

fn show(value: Option<&Value>) -> String {
  match value {
    None | Some(Value::Null) => "(空)".to_string(),
    Some(Value::String(s)) => s.clone(),
    Some(other) => other.to_string(),
  }
}

// 逐欄比較新舊兩筆 832 列, 回傳有變更的欄位 (欄位名依 new 的順序)
pub fn diff_columns(old: &Map<String, Value>, new: &Map<String, Value>) -> Vec<ColumnChange> {
  new
    .iter()
    .filter(|(column, _)| !IM_META_COLUMNS.contains(&column.as_str()))
    .filter(|(column, value)| old.get(*column).unwrap_or(&Value::Null) != *value)
    .map(|(column, value)| ColumnChange { column: column.clone(), old: show(old.get(column)), new: show(Some(value)) })
    .collect()
}

// 去重並保留出現順序, 以逗號串起; 沒有 SKU 時回傳 "(無 SKU)"
fn sku_list(skus: &[String]) -> String {
  let mut seen: Vec<&str> = Vec::new();
  for sku in skus {
    if !sku.is_empty() && !seen.contains(&sku.as_str()) {
      seen.push(sku);
    }
  }
  if seen.is_empty() { "(無 SKU)".to_string() } else { seen.join(",") }
}

// 832 一個檔案的測試目的: ADD / DELETE 記本檔新增或刪除的 SKU (去重, 逗號分隔, 例 "3210TEST,3240TEST"), UPDATE 每個變更欄位一筆。
// skus 為本檔各列的 sku; changes 為 None 代表找不到舊資料可比對; 相同的變更 (多個 SKU 改同一欄同樣的值) 只記一筆
pub fn im_tasks(event: &str, skus: &[String], changes: Option<&[ColumnChange]>) -> Vec<UatTask> {
  match event {
    "ADD" | "DELETE" => vec![UatTask::new(event, sku_list(skus))],
    _ => match changes {
      None => vec![UatTask::new(event, "(找不到舊資料可比對)")],
      Some([]) => vec![UatTask::new(event, "(無欄位變更)")],
      Some(list) => {
        let mut tasks: Vec<UatTask> = Vec::new();
        for c in list {
          let task = UatTask::new(event, format!("{}: {} → {}", c.column, c.old, c.new));
          if !tasks.contains(&task) {
            tasks.push(task);
          }
        }
        tasks
      }
    },
  }
}

pub type Line = (String, f64); // (完整品號, 訂購數量)

#[derive(Debug, Default, PartialEq)]
pub struct LineDiff {
  pub added: Vec<Line>,
  pub removed: Vec<String>,
  pub qty_changed: Vec<(String, f64, f64)>, // (品號, 舊數量, 新數量)
}

pub fn diff_lines(prev: &[Line], cur: &[Line]) -> LineDiff {
  let find = |lines: &[Line], item: &str| lines.iter().find(|(i, _)| i == item).map(|(_, q)| *q);
  LineDiff {
    added: cur.iter().filter(|(i, _)| find(prev, i).is_none()).cloned().collect(),
    removed: prev.iter().filter(|(i, _)| find(cur, i).is_none()).map(|(i, _)| i.clone()).collect(),
    qty_changed: cur
      .iter()
      .filter_map(|(i, q)| find(prev, i).filter(|old| (old - q).abs() > 1e-9).map(|old| (i.clone(), old, *q)))
      .collect(),
  }
}

fn qty(q: f64) -> String {
  if q.fract() == 0.0 { format!("{q:.0}") } else { q.to_string() }
}

// 850 一個情境的測試目的; prev 為匯入前這張 PO 在資料庫的 (狀態, 明細) (同一張 PO 只有一份, 匯入會原地更新它), 沒有代表這是該 PO 第一次出現
pub fn receiving_tasks(kind: &str, po: &str, status: &str, cur: &[Line], prev: Option<(&str, &[Line])>) -> Vec<UatTask> {
  let diff = prev.map(|(_, lines)| diff_lines(lines, cur)).unwrap_or_default();
  let prev_status = prev.map_or("(無)", |(s, _)| s);
  let tasks: Vec<String> = match kind {
    "ACTIVE" => vec![format!("{po}: 新開 PO ({} 行)", cur.len())],
    "UPDATE_ADD_LINE" => diff.added.iter().map(|(i, q)| format!("{po}: +{i} ({})", qty(*q))).collect(),
    "UPDATE_QTY" => diff.qty_changed.iter().map(|(i, o, n)| format!("{po}: {i} {} → {}", qty(*o), qty(*n))).collect(),
    "UPDATE_DELETE_LINE" => diff.removed.iter().map(|i| format!("{po}: -{i}")).collect(),
    "CANCEL" => vec![format!("{po}: {prev_status} → {status}")],
    "REP_ACTIVE" => vec![format!("{po}: {prev_status} 保留, 新增一筆 {status}")],
    "ITEM_NOT_FOUND" => {
      let items: Vec<&str> = cur.iter().map(|(i, _)| i.as_str()).collect();
      vec![format!("{po}: {} (已擋下, 未寫入; 已寄警示信)", items.join(", "))]
    }
    _ => Vec::new(),
  };
  if tasks.is_empty() {
    return vec![UatTask::new(kind, format!("{po}: (無變更)"))];
  }
  tasks.into_iter().map(|t| UatTask::new(kind, t)).collect()
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn obj(v: Value) -> Map<String, Value> {
    v.as_object().unwrap().clone()
  }

  fn line(item: &str, q: f64) -> Line {
    (item.to_string(), q)
  }

  #[test]
  fn diff_columns_lists_only_changed_columns_and_skips_meta_columns() {
    let old = obj(json!({"id": 1, "status": "ADD", "item_desc": "A", "long_description": "1-FLAT-0-003", "item_colour": "M-0002"}));
    let new = obj(json!({"id": 9, "status": "UPDATE", "item_desc": "B", "long_description": "12-FLAT-0-001", "item_colour": "M-0002"}));

    let changes = diff_columns(&old, &new);

    assert_eq!(
      changes,
      vec![
        ColumnChange { column: "item_desc".into(), old: "A".into(), new: "B".into() },
        ColumnChange { column: "long_description".into(), old: "1-FLAT-0-003".into(), new: "12-FLAT-0-001".into() },
      ]
    );
  }

  #[test]
  fn diff_columns_shows_null_as_empty_marker() {
    let old = obj(json!({"item_colour": null}));
    let new = obj(json!({"item_colour": "6-0006"}));

    assert_eq!(diff_columns(&old, &new)[0].old, "(空)");
  }

  #[test]
  fn im_tasks_add_and_delete_list_distinct_skus() {
    let skus = ["3210TEST".to_string(), "3240TEST".to_string(), "3210TEST".to_string()];
    assert_eq!(im_tasks("ADD", &skus, None), vec![UatTask::new("ADD", "3210TEST,3240TEST")]);
    assert_eq!(im_tasks("DELETE", &skus[..1], None), vec![UatTask::new("DELETE", "3210TEST")]);
    assert_eq!(im_tasks("ADD", &[], None)[0].task, "(無 SKU)");
  }

  #[test]
  fn im_tasks_update_makes_one_task_per_change_and_dedups() {
    let c = ColumnChange { column: "long_description".into(), old: "1-FLAT-0-003".into(), new: "12-FLAT-0-001".into() };

    let tasks = im_tasks("UPDATE", &[], Some(&[c.clone(), c]));

    assert_eq!(tasks, vec![UatTask::new("UPDATE", "long_description: 1-FLAT-0-003 → 12-FLAT-0-001")]);
  }

  #[test]
  fn im_tasks_update_without_old_row_or_changes_is_explained() {
    assert_eq!(im_tasks("UPDATE", &[], None)[0].task, "(找不到舊資料可比對)");
    assert_eq!(im_tasks("UPDATE", &[], Some(&[]))[0].task, "(無欄位變更)");
  }

  #[test]
  fn diff_lines_detects_added_removed_and_qty_changes() {
    let prev = vec![line("A", 114.0), line("B", 114.0)];
    let cur = vec![line("A", 200.0), line("C", 5.0)];

    let diff = diff_lines(&prev, &cur);

    assert_eq!(diff.added, vec![line("C", 5.0)]);
    assert_eq!(diff.removed, vec!["B".to_string()]);
    assert_eq!(diff.qty_changed, vec![("A".to_string(), 114.0, 200.0)]);
  }

  #[test]
  fn receiving_tasks_cover_each_scenario_kind() {
    let one = vec![line("324084338", 114.0)];
    let two = vec![line("324084338", 114.0), line("323891352", 114.0)];
    let changed = vec![line("324084338", 200.0), line("323891352", 300.0)];

    assert_eq!(receiving_tasks("ACTIVE", "TEST0001", "ACTIVE", &one, None)[0].task, "TEST0001: 新開 PO (1 行)");
    assert_eq!(
      receiving_tasks("UPDATE_ADD_LINE", "TEST0001", "ACTIVE", &two, Some(("ACTIVE", &one)))[0].task,
      "TEST0001: +323891352 (114)"
    );
    let qty_tasks = receiving_tasks("UPDATE_QTY", "TEST0001", "ACTIVE", &changed, Some(("ACTIVE", &two)));
    assert_eq!(qty_tasks.len(), 2);
    assert_eq!(qty_tasks[0].task, "TEST0001: 324084338 114 → 200");
    assert_eq!(
      receiving_tasks("UPDATE_DELETE_LINE", "TEST0001", "ACTIVE", &one, Some(("ACTIVE", &two)))[0].task,
      "TEST0001: -323891352"
    );
    assert_eq!(receiving_tasks("CANCEL", "TEST0001", "CANCEL", &one, Some(("ACTIVE", &one)))[0].task, "TEST0001: ACTIVE → CANCEL");
    assert_eq!(
      receiving_tasks("REP_ACTIVE", "TEST0001", "ACTIVE", &one, Some(("CANCEL", &one)))[0].task,
      "TEST0001: CANCEL 保留, 新增一筆 ACTIVE"
    );
    assert_eq!(
      receiving_tasks("ITEM_NOT_FOUND", "TEST0002", "ACTIVE", &[line("TEST84338", 114.0), line("TEST91352", 114.0)], None)[0].task,
      "TEST0002: TEST84338, TEST91352 (已擋下, 未寫入; 已寄警示信)"
    );
  }

  #[test]
  fn receiving_tasks_fall_back_when_nothing_changed() {
    let one = vec![line("A", 1.0)];

    let tasks = receiving_tasks("UPDATE_QTY", "P", "ACTIVE", &one, Some(("ACTIVE", &one)));

    assert_eq!(tasks, vec![UatTask::new("UPDATE_QTY", "P: (無變更)")]);
  }
}
