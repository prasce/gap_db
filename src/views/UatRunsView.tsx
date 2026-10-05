// uat_runs_recode: 查詢 uat_runs (「UAT 測試」按鈕的歷次執行紀錄), 一次執行一列
import { QueryTable } from '../components/QueryTable';

// 與 src-tauri/src/db.rs 的 UAT_RUN_COLUMNS 相同順序; type / uat_task 為測試目的 (同一個 run 有多筆時展開成多列), results 為各狀態筆數摘要
const COLUMNS = ['run_id', 'page', 'triggered_by', 'overall_status', 'started_at', 'finished_at', 'type', 'uat_task', 'results'] as const;

// 與 db.rs 的 UatRunFilter 欄位相同; run_id 為精確比對 (輸入 3 只查 run 3); started_at 可輸入日期 (例 2026-09-30) 或時間片段做部分符合
const FILTERS = ['page', 'triggered_by', 'overall_status', 'started_at', 'run_id'] as const;

// page: 觸發頁面 (item_master 貨品主檔 / receiving 收貨明細); overall_status: 整體結果; 空字串代表不限制
const SELECT_FILTERS = {
	page: [
		{ value: '', label: '全部' },
		{ value: 'item_master', label: 'item_master' },
		{ value: 'receiving', label: 'receiving' },
	],
	overall_status: [
		{ value: '', label: '全部' },
		{ value: 'pass', label: 'pass' },
		{ value: 'fail', label: 'fail' },
	],
};

export default function UatRunsView() {
	return <QueryTable command='query_uat_runs' columns={COLUMNS} filters={FILTERS} selectFilters={SELECT_FILTERS} exportName='uat_runs' />;
}
