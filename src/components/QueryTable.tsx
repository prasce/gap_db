// 查詢頁共用版面: 查詢框 + 查詢按鈕 + 可勾選的資料表 + 分頁
// command 為 src-tauri/src/db.rs 中回傳 Page 的 Tauri 指令; columns 須與該指令的欄位清單同順序
import { Alert, Button, Checkbox, Group, Loader, Pagination, Select, Table, Text, TextInput } from '@mantine/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';

type Row = { id: number } & Record<string, string | null>;
// total = 符合條件的總筆數; items 最多 limit 筆
type Page = { items: Row[], total: number, limit: number };

const PAGE_SIZE_OPTIONS = ['15', '25', '50', '100'];

interface QueryTableProps {
	command: string,
	columns: readonly string[],
	// 查詢條件名稱, 對應指令參數 filter 的欄位
	filters: readonly string[]
}

export function QueryTable({ command, columns, filters }: QueryTableProps) {
	const [filter, setFilter] = useState<Record<string, string>>(() => Object.fromEntries(filters.map(f => [f, ''])));
	const [items, setItems] = useState<Row[]>([]);
	const [total, setTotal] = useState(0);
	const [pageSize, setPageSize] = useState(15);
	const [currentPage, setCurrentPage] = useState(1);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string>();
	// 只採用最後一次查詢的結果, 避免較慢回來的舊結果蓋掉新結果
	const latestSearch = useRef(0);

	// overridePage/overridePageSize: 換頁或改變每頁筆數時要用新值立即查詢, 不能等對應 state 更新才讀得到
	async function search(overrideFilter?: Record<string, string>, overridePage?: number, overridePageSize?: number) {
		const searchId = ++latestSearch.current;
		setLoading(true);
		setError(undefined);
		try {
			const source = overrideFilter ?? filter;
			// 空字串代表不限制
			const params = Object.fromEntries(filters.map(f => [f, source[f]?.trim() || null]));
			const page = await invoke<Page>(command, {
				filter: params,
				page: overridePage ?? currentPage,
				pageSize: overridePageSize ?? pageSize,
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

	return <>
		<Group mb='md' gap='sm'>
			{filters.map(field =>
				<TextInput key={field} size='xs' w={160} placeholder={`請輸入:${field}`} value={filter[field] ?? ''}
					onChange={e => {
						const value = e.currentTarget.value;
						setFilter(prev => ({ ...prev, [field]: value }));
					}}
					onKeyDown={e => e.key === 'Enter' && applyFilter()} />
			)}
			{/* 不用 disabled={loading} 卡按鈕: 本地查詢通常一瞬間就回來, 切換 disabled 樣式的重繪反而造成按鈕看起來在抖動;
			    連續點擊的正確性已經靠 search() 裡的 latestSearch 只採用最後一次結果來保護 */}
			<Button size='xs' w={80} color='gapBlue' onClick={applyFilter}>查詢</Button>
			<Button size='xs' w={80} color='gapBlue' onClick={reset}>重置</Button>
		</Group>

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
