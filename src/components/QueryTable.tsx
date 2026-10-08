// 查詢頁共用版面: 查詢框 + 查詢按鈕 + 可勾選的資料表 + 分頁
// command 為 src-tauri/src/db.rs 中回傳 Page 的 Tauri 指令; columns 須與該指令的欄位清單同順序
import { Alert, Button, Checkbox, Group, Loader, Pagination, Select, Table, Text, TextInput } from '@mantine/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { exportXlsx, type Page, type Row } from '../lib/exportXlsx';
import { UatButton, type UatPage } from './UatButton';

const PAGE_SIZE_OPTIONS = ['15', '25', '50', '100'];
interface QueryTableProps {
	command: string,
	columns: readonly string[],
	// 查詢條件名稱, 對應指令參數 filter 的欄位
	filters: readonly string[],
	// 部分條件改用下拉選單而非文字輸入; key 須為 filters 其中之一, value 為選項清單 (value 為空字串代表不限制)
	selectFilters?: Record<string, readonly { value: string, label: string }[]>
	// 部分條件改用勾選框而非文字輸入; key 須為 filters 其中之一, 勾選時送出 'true', 未勾選時送出空字串 (不限制)
	checkboxFilters?: Record<string, { label: string }>
	// 顯示「UAT 測試」按鈕並指定送給 run_uat_test 指令的頁面代碼; 不傳則不顯示按鈕
	uatPage?: UatPage
	// 顯示「匯出資料」按鈕, 值為預設檔名 (不含副檔名); 匯出目前查詢條件下的全部資料 (不受分頁限制) 為 .xlsx; 不傳則不顯示按鈕
	exportName?: string
	// 每次查詢固定附加的條件 (不顯示輸入框), 例如主從式頁面用 header_id 限定明細屬於哪一張 PO; 值改變時請用 key 重新掛載
	fixedParams?: Record<string, string>
}

// 貼上的多行文字 (換行/Tab 分隔, 例如 Excel 一欄) 轉成 ; 分隔的一行, 略過空白行
export function joinPastedLines(text: string): string {
	return text.split(/[\r\n\t]+/).map(part => part.trim()).filter(Boolean).join(';');
}

export function QueryTable({ command, columns, filters, selectFilters, checkboxFilters, uatPage, exportName, fixedParams }: QueryTableProps) {
	const { employee } = useAuth();
	const [filter, setFilter] = useState<Record<string, string>>(() => Object.fromEntries(filters.map(f => [f, ''])));
	const [items, setItems] = useState<Row[]>([]);
	const [total, setTotal] = useState(0);
	const [pageSize, setPageSize] = useState(15);
	const [currentPage, setCurrentPage] = useState(1);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string>();
	const [exporting, setExporting] = useState(false);
	// 只採用最後一次查詢的結果, 避免較慢回來的舊結果蓋掉新結果
	const latestSearch = useRef(0);

	// 查詢條件 -> 指令參數 filter; 空字串代表不限制, fixedParams 一律附加
	function toParams(source: Record<string, string>) {
		return { ...Object.fromEntries(filters.map(f => [f, source[f]?.trim() || null])), ...fixedParams };
	}

	async function exportData() {
		if (!exportName) return;
		setExporting(true);
		await exportXlsx({ command, params: toParams(filter), columns, exportName, account: employee?.account ?? null });
		setExporting(false);
	}

	// overridePage/overridePageSize: 換頁或改變每頁筆數時要用新值立即查詢, 不能等對應 state 更新才讀得到
	async function search(overrideFilter?: Record<string, string>, overridePage?: number, overridePageSize?: number) {
		const searchId = ++latestSearch.current;
		setLoading(true);
		setError(undefined);
		try {
			const source = overrideFilter ?? filter;
			const params = toParams(source);
			const page = await invoke<Page>(command, {
				filter: params,
				page: overridePage ?? currentPage,
				pageSize: overridePageSize ?? pageSize,
				// 只有 query_832_items 會用到 (後端驗證 include_deleted 只有真的 admin 帳號才放行);
				// query_850_receipts 沒有宣告這個參數, 多送這個 key 會被忽略, 不影響其他頁面
				account: employee?.account ?? null,
			});
			if (searchId !== latestSearch.current) return;
			setItems(page.items);
			setTotal(page.total);
			setSelected(new Set());
		} catch (e) {
			if (searchId === latestSearch.current) setError(String(e));
		} finally {
			if (searchId === latestSearch.current) setLoading(false);
		}
	}

	// 套用查詢條件時一律跳回第 1 頁, 避免停在超出新結果範圍的頁次
	function applyFilter() {
		setCurrentPage(1);
		search(undefined, 1);
	}

	function reset() {
		const empty = Object.fromEntries(filters.map(f => [f, '']));
		setFilter(empty);
		setCurrentPage(1);
		search(empty, 1);
	}

	function changePage(page: number) {
		setCurrentPage(page);
		search(undefined, page);
	}

	function changePageSize(value: string | null) {
		const size = Number(value ?? PAGE_SIZE_OPTIONS[0]);
		setPageSize(size);
		setCurrentPage(1);
		search(undefined, 1, size);
	}

	useEffect(() => {
		if (isTauri()) search();
	}, []);

	if (!isTauri()) return <Alert color='yellow'>需在桌面 App 中執行才能讀取資料庫</Alert>;

	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const allSelected = items.length > 0 && selected.size === items.length;
	const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(item => item.id)));
	const toggleOne = (id: number) => setSelected(prev => {
		const next = new Set(prev);
		next.has(id) ? next.delete(id) : next.add(id);
		return next;
	});

	const checkboxFields = filters.filter(field => checkboxFilters?.[field]);

	return <>
		<Group mb='sm' gap='sm'>
			{filters.map(field => {
				if (checkboxFilters?.[field]) return null;
				const options = selectFilters?.[field];
				if (options) {
					return <Select key={field} size='xs' w={160} data={options as { value: string, label: string }[]}
						value={filter[field] ?? ''} allowDeselect={false}
						onChange={value => setFilter(prev => ({ ...prev, [field]: value ?? '' }))} />;
				}
				return <TextInput key={field} size='xs' w={160} placeholder={`請輸入:${field}`} value={filter[field] ?? ''}
					onPaste={e => {
						// 從 Excel 等貼上多行時, 單行輸入框會把換行吃掉讓值黏在一起, 先換成 ; 再插入游標位置 (查詢端支援 ; 分隔多個值)
						const pasted = e.clipboardData.getData('text');
						if (!/[\r\n\t]/.test(pasted)) return;
						e.preventDefault();
						const input = e.currentTarget;
						const start = input.selectionStart ?? input.value.length;
						const end = input.selectionEnd ?? start;
						const value = input.value.slice(0, start) + joinPastedLines(pasted) + input.value.slice(end);
						setFilter(prev => ({ ...prev, [field]: value }));
					}}
					onChange={e => {
						const value = e.currentTarget.value;
						setFilter(prev => ({ ...prev, [field]: value }));
					}}
					onKeyDown={e => e.key === 'Enter' && applyFilter()} />;
			})}
			{/* 不用 disabled={loading} 卡按鈕: 本地查詢通常一瞬間就回來, 切換 disabled 樣式的重繪反而造成按鈕看起來在抖動;
			    連續點擊的正確性已經靠 search() 裡的 latestSearch 只採用最後一次結果來保護 */}
			<Button size='xs' w={80} color='gapBlue' onClick={applyFilter}>查詢</Button>
			<Button size='xs' w={80} color='gapBlue' onClick={reset}>重置</Button>
			{exportName &&
				<Button size='xs' color='gapBlue' variant='outline' loading={exporting} onClick={exportData}>匯出資料</Button>}
			{uatPage && <UatButton page={uatPage} />}
		</Group>

		{checkboxFields.length > 0 &&
			<Group mb='md' gap='sm'>
				{checkboxFields.map(field => {
					const checkbox = checkboxFilters![field]!;
					return <Checkbox key={field} size='xs' label={checkbox.label} checked={filter[field] === 'true'}
						onChange={e => {
							// 要先同步讀出 checked 存成區域變數: e.currentTarget 在 handler 同步執行完就會被 React 清空,
							// 直接在 setFilter 的 updater function 裡讀 (非同步執行) 會拿到 null 而炸掉
							const checked = e.currentTarget.checked;
							setFilter(prev => ({ ...prev, [field]: checked ? 'true' : '' }));
						}} />;
				})}
			</Group>}

		{error && <Alert color='red' mb='md'>{error}</Alert>}

		{/* mih 固定高度: loading/已選文字有無會影響這行高度, 沒固定的話按查詢/換頁時下方表格會跟著上下跳動 */}
		<Group mb='xs' gap='xs' mih={22}>
			{loading && <Loader size='xs' />}
			{selected.size > 0 && <Text size='sm' c='dimmed'>已選 {selected.size} 筆</Text>}
		</Group>

		<Table.ScrollContainer minWidth={columns.length * 130}>
			<Table striped highlightOnHover withRowBorders fz='sm'>
				<Table.Thead>
					<Table.Tr>
						<Table.Th w={40}>
							<Checkbox size='xs' aria-label='全選' checked={allSelected}
								indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} />
						</Table.Th>
						{columns.map(column => <Table.Th key={column} style={{ whiteSpace: 'nowrap' }}>{column}</Table.Th>)}
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{items.map(item =>
						<Table.Tr key={item.id} bg={selected.has(item.id) ? 'var(--mantine-primary-color-light)' : undefined}>
							<Table.Td>
								<Checkbox size='xs' aria-label={`選取 ${item[columns[0]!] ?? item.id}`} checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} />
							</Table.Td>
							{columns.map(column => <Table.Td key={column} style={{ whiteSpace: 'nowrap' }}>{item[column]}</Table.Td>)}
						</Table.Tr>
					)}
				</Table.Tbody>
			</Table>
		</Table.ScrollContainer>

		<Group justify='space-between' mt='sm'>
			<Group gap='xs'>
				<Text size='sm' c='dimmed'>Showing</Text>
				<Select size='xs' w={70} data={PAGE_SIZE_OPTIONS} value={String(pageSize)}
					onChange={changePageSize} allowDeselect={false} />
				<Text size='sm' c='dimmed'>items per page</Text>
			</Group>
			<Text size='sm' c='dimmed'>共 {total} 筆</Text>
			<Pagination.Root total={totalPages} value={currentPage} onChange={changePage} size='sm' color='gapBlue'>
				<Group gap={5}>
					<Button variant='default' size='xs' onClick={() => changePage(currentPage - 1)} disabled={currentPage <= 1}>Previous</Button>
					<Pagination.Items />
					<Button variant='default' size='xs' onClick={() => changePage(currentPage + 1)} disabled={currentPage >= totalPages}>Next</Button>
				</Group>
			</Pagination.Root>
		</Group>
	</>;
}
