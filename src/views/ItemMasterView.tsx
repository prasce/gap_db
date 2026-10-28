// 貨品主檔: 上方為表頭 (gapwmc_832_item, 一次一個 SKU), 下方 Detail / Price history 頁籤為這個 SKU 的
// 全部事件紀錄 (新的在前)。「匯出資料」仍匯出 query_832_items 的完整欄位
import { Alert, Button, Group, Loader, Select, Tabs, Text, TextInput } from '@mantine/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { joinPastedLines, QueryTable } from '../components/QueryTable';
import { UatButton } from '../components/UatButton';
import { exportXlsx, type Page, type Row } from '../lib/exportXlsx';
import { BASE_FILTERS, DETAIL_COLUMNS, EXPORT_COLUMNS, PRICE_COLUMNS, PRICE_LABELS } from './itemMaster/columns';
import { ItemHeaderPanel } from './itemMaster/ItemHeaderPanel';

type FilterState = Record<(typeof BASE_FILTERS)[number], string>;
const EMPTY_FILTER: FilterState = { customer_code: '', sku: '', source_file: '', status: '' };

// status 為事件類型: ADD (新增) / UPDATE (更新) / DELETE (刪除); 空字串代表不限制
const STATUS_OPTIONS = [
	{ value: '', label: '全部' },
	{ value: 'ADD', label: 'ADD' },
	{ value: 'DELETE', label: 'DELETE' },
	{ value: 'UPDATE', label: 'UPDATE' },
];

// 空字串代表不限制
const toParams = (filter: FilterState) =>
	Object.fromEntries(Object.entries(filter).map(([key, value]) => [key, value.trim() || null]));

export default function ItemMasterView() {
	const { employee } = useAuth();
	const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
	// skuIndex: 第幾筆 (1-based); 後端每頁固定一筆, 所以 page 就是序號, total 就是符合條件的筆數
	const [skuIndex, setSkuIndex] = useState(1);
	const [header, setHeader] = useState<Row>();
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string>();
	const [exporting, setExporting] = useState(false);
	// 只採用最後一次查詢的結果, 避免較慢回來的舊結果蓋掉新結果
	const latestSearch = useRef(0);

	async function loadHeader(source: FilterState, index: number) {
		const searchId = ++latestSearch.current;
		setLoading(true);
		setError(undefined);
		try {
			const page = await invoke<Page>('query_832_items', {
				filter: toParams(source), page: index, pageSize: 1, account: employee?.account ?? null,
			});
			if (searchId !== latestSearch.current) return;
			setHeader(page.items[0]);
			setTotal(page.total);
			setSkuIndex(index);
		} catch (e) {
			if (searchId === latestSearch.current) setError(String(e));
		} finally {
			if (searchId === latestSearch.current) setLoading(false);
		}
	}

	useEffect(() => {
		if (isTauri()) loadHeader(filter, 1);
	}, []);

	if (!isTauri()) return <Alert color='yellow'>需在桌面 App 中執行才能讀取資料庫</Alert>;

	const search = () => loadHeader(filter, 1);
	const reset = () => {
		setFilter(EMPTY_FILTER);
		loadHeader(EMPTY_FILTER, 1);
	};
	const exportData = async () => {
		setExporting(true);
		await exportXlsx({ command: 'query_832_items', params: toParams(filter), columns: EXPORT_COLUMNS, exportName: 'item_master', account: employee?.account ?? null });
		setExporting(false);
	};
	const setField = (field: keyof FilterState, value: string) => setFilter(prev => ({ ...prev, [field]: value }));

	const headerId = header ? String(header.id) : undefined;
	const textFilters = BASE_FILTERS.filter(field => field !== 'status');

	return <>
		<Group mb='md' gap='sm'>
			{textFilters.map(field =>
				<TextInput key={field} size='xs' w={160} placeholder={`請輸入:${field}`} value={filter[field]}
					onPaste={e => {
						// 從 Excel 貼上多行時, 單行輸入框會吃掉換行讓值黏在一起, 先換成 ; 再插入游標位置 (查詢端支援 ; 分隔多個值)
						const pasted = e.clipboardData.getData('text');
						if (!/[\r\n\t]/.test(pasted)) return;
						e.preventDefault();
						const input = e.currentTarget;
						const start = input.selectionStart ?? input.value.length;
						const end = input.selectionEnd ?? start;
						setField(field, input.value.slice(0, start) + joinPastedLines(pasted) + input.value.slice(end));
					}}
					onChange={e => setField(field, e.currentTarget.value)}
					onKeyDown={e => e.key === 'Enter' && search()} />)}
			<Select size='xs' w={160} data={STATUS_OPTIONS} value={filter.status} allowDeselect={false}
				onChange={value => setField('status', value ?? '')} />
			<Button size='xs' w={80} color='gapBlue' onClick={search}>查詢</Button>
			<Button size='xs' w={80} color='gapBlue' onClick={reset}>重置</Button>
			<Button size='xs' color='gapBlue' variant='outline' loading={exporting} onClick={exportData}>匯出資料</Button>
			<UatButton page='item_master' />
		</Group>

		{error && <Alert color='red' mb='md'>{error}</Alert>}

		{/* mih 固定高度: 載入中文字有無不會讓下方內容上下跳動 */}
		<Group mb='xs' gap='xs' mih={28}>
			{loading && <Loader size='xs' />}
			<Text size='sm' c='dimmed'>{total > 0 ? `第 ${skuIndex} / 共 ${total} 筆` : '沒有符合條件的資料'}</Text>
			<Button size='compact-xs' variant='default' disabled={skuIndex <= 1 || loading} onClick={() => loadHeader(filter, skuIndex - 1)}>上一筆</Button>
			<Button size='compact-xs' variant='default' disabled={skuIndex >= total || loading} onClick={() => loadHeader(filter, skuIndex + 1)}>下一筆</Button>
		</Group>

		<ItemHeaderPanel header={header} />

		<Tabs defaultValue='detail' mt='lg' keepMounted={false}>
			<Tabs.List>
				<Tabs.Tab value='detail'>Detail</Tabs.Tab>
				<Tabs.Tab value='price'>Price history</Tabs.Tab>
			</Tabs.List>
			<Tabs.Panel value='detail' pt='md'>
				{/* key: 換一筆時重新掛載, 從第 1 頁重新載入 */}
				{headerId
					? <QueryTable key={headerId} command='query_832_detail' columns={DETAIL_COLUMNS} filters={[]} hideSearchBar fixedParams={{ header_id: headerId }} />
					: <Text size='sm' c='dimmed'>無資料</Text>}
			</Tabs.Panel>
			<Tabs.Panel value='price' pt='md'>
				{headerId
					? <QueryTable key={headerId} command='query_832_price' columns={PRICE_COLUMNS} columnLabels={PRICE_LABELS} filters={[]} hideSearchBar fixedParams={{ header_id: headerId }} />
					: <Text size='sm' c='dimmed'>無資料</Text>}
			</Tabs.Panel>
		</Tabs>
	</>;
}
