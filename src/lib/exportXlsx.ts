// 查詢頁共用的匯出: 以目前查詢條件逐頁取回全部資料, 寫成 .xlsx; 檔名與位置由使用者在儲存對話框選擇
import { invoke } from '@tauri-apps/api/core';
import { notifications } from '@mantine/notifications';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import writeExcelFile from 'write-excel-file/universal';

export type Row = { id: number } & Record<string, string | null>;
// total = 符合條件的總筆數; items 最多 limit 筆
export type Page = { items: Row[], total: number, limit: number };

// 匯出時逐頁取回的每頁筆數, 對齊後端 MAX_PAGE_SIZE
const EXPORT_PAGE_SIZE = 100;

interface ExportOptions {
	command: string,
	// 指令參數 filter 的內容 (空值為 null)
	params: Record<string, string | null>,
	columns: readonly string[],
	exportName: string,
	account: string | null,
}

export async function exportXlsx({ command, params, columns, exportName, account }: ExportOptions) {
	try {
		const rows: Row[] = [];
		for (let pageNo = 1; ; pageNo++) {
			const page = await invoke<Page>(command, { filter: params, page: pageNo, pageSize: EXPORT_PAGE_SIZE, account });
			rows.push(...page.items);
			if (rows.length >= page.total || page.items.length === 0) break;
		}
		if (rows.length === 0) {
			notifications.show({ message: '沒有可匯出的資料', color: 'yellow' });
			return;
		}
		const stamp = new Date().toLocaleString('sv').replace(/[-: ]/g, '').replace(/^(\d{8})(\d{6})$/, '$1_$2');
		const path = await save({ defaultPath: `${exportName}_${stamp}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
		if (!path) return;
		const sheetData = [
			columns.map(column => ({ value: column, fontWeight: 'bold' as const })),
			...rows.map(row => columns.map(column => ({ value: row[column] ?? '', type: String }))),
		];
		const blob = await writeExcelFile(sheetData, { columns: columns.map(() => ({ width: 22 })) }).toBlob();
		await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
		notifications.show({ title: '匯出完成', message: `共 ${rows.length} 筆: ${path}`, color: 'green' });
	} catch (e) {
		notifications.show({ title: '匯出失敗', message: String(e), color: 'red' });
	}
}
