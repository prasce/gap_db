// 查詢頁共用版面: 查詢框 + 查詢按鈕 + 可勾選的資料表
// command 為 src-tauri/src/db.rs 中回傳 Page 的 Tauri 指令; columns 須與該指令的欄位清單同順序
import { Alert, Button, Checkbox, Group, Loader, Table, Text, TextInput } from '@mantine/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';

type Row = { id: number } & Record<string, string | null>;
// total = 符合條件的總筆數; items 最多 limit 筆
type Page = { items: Row[], total: number, limit: number };

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
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string>();
	// 只採用最後一次查詢的結果, 避免較慢回來的舊結果蓋掉新結果
	const latestSearch = useRef(0);

	async function search() {
		const searchId = ++latestSearch.current;
		setLoading(true);
		setError(undefined);
		try {
			// 空字串代表不限制
			const params = Object.fromEntries(filters.map(f => [f, filter[f]?.trim() || null]));
			const page = await invoke<Page>(command, { filter: params });
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

	useEffect(() => {
		if (isTauri()) search();
	}, []);

	if (!isTauri()) return <Alert color='yellow'>需在桌面 App 中執行才能讀取資料庫</Alert>;

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
					onChange={e => setFilter(prev => ({ ...prev, [field]: e.currentTarget.value }))}
					onKeyDown={e => e.key === 'Enter' && !loading && search()} />
			)}
			<Button size='xs' w={80} onClick={search} loading={loading}>查詢</Button>
		</Group>

		{error && <Alert color='red' mb='md'>{error}</Alert>}

		<Group mb='xs' gap='xs'>
			<Text size='sm' c='dimmed'>
				共 {total} 筆{total > items.length && `，僅顯示前 ${items.length} 筆，請加上查詢條件縮小範圍`}
				{selected.size > 0 && `，已選 ${selected.size} 筆`}
			</Text>
			{loading && <Loader size='xs' />}
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
	</>;
}
