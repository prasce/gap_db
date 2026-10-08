// 收貨明細: 上方為表頭 (gapwmc_850_header, 一次一張 PO), 下方 Detail / Carton 頁籤為這張 PO 的
// gapwmc_850_detail / gapwmc_850_carton。「匯出資料」仍匯出一筆明細一列的 query_850_receipts
import { Alert, Button, Group, Loader, Tabs, Text, TextInput } from '@mantine/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { joinPastedLines, QueryTable } from '../components/QueryTable';
import { UatButton } from '../components/UatButton';
import { exportXlsx, type Page, type Row } from '../lib/exportXlsx';
import { CARTON_COLUMNS, DETAIL_COLUMNS, EXPORT_COLUMNS, FILTERS } from './receiving/columns';
import { ReceiptHeaderPanel } from './receiving/ReceiptHeaderPanel';

type FilterState = Record<(typeof FILTERS)[number], string>;
const EMPTY_FILTER: FilterState = { po_number: '', source_file: '', item_number: '', order_status: '' };

// 空字串代表不限制
const toParams = (filter: FilterState) => Object.fromEntries(FILTERS.map(f => [f, filter[f].trim() || null]));

export default function ReceivingView() {
	const { employee } = useAuth();
	const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
	// poIndex: 第幾張 PO (1-based); 後端每頁固定一張, 所以 page 就是 PO 的序號, total 就是符合條件的 PO 張數
	const [poIndex, setPoIndex] = useState(1);
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
			const page = await invoke<Page>('query_850_headers', { filter: toParams(source), page: index, pageSize: 1 });
			if (searchId !== latestSearch.current) return;
			setHeader(page.items[0]);
			setTotal(page.total);
			setPoIndex(index);
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
		await exportXlsx({ command: 'query_850_receipts', params: toParams(filter), columns: EXPORT_COLUMNS, exportName: 'receiving', account: employee?.account ?? null });
		setExporting(false);
	};
	const setField = (field: keyof FilterState, value: string) => setFilter(prev => ({ ...prev, [field]: value }));

	const headerId = header ? String(header.id) : undefined;

	return <>
		<Group mb='md' gap='sm'>
			{FILTERS.map(field =>
				<TextInput key={field} size='xs' w={160} placeholder={`請輸入:${field}`} value={filter[field]}
					onPaste={e => {
						// 從 Excel 貼上多行時, 單行輸入框會吃掉換行讓值黏在一起, 先換成 ; 再插入游標位置
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
			<Button size='xs' w={80} color='gapBlue' onClick={search}>查詢</Button>
			<Button size='xs' w={80} color='gapBlue' onClick={reset}>重置</Button>
			<Button size='xs' color='gapBlue' variant='outline' loading={exporting} onClick={exportData}>匯出資料</Button>
			<UatButton page='receiving' />
		</Group>

		{error && <Alert color='red' mb='md'>{error}</Alert>}

		{/* mih 固定高度: 載入中文字有無不會讓下方內容上下跳動 */}
		<Group mb='xs' gap='xs' mih={28}>
			{loading && <Loader size='xs' />}
			<Text size='sm' c='dimmed'>{total > 0 ? `第 ${poIndex} / 共 ${total} 張 PO` : '沒有符合條件的 PO'}</Text>
			<Button size='compact-xs' variant='default' disabled={poIndex <= 1 || loading} onClick={() => loadHeader(filter, poIndex - 1)}>上一張</Button>
			<Button size='compact-xs' variant='default' disabled={poIndex >= total || loading} onClick={() => loadHeader(filter, poIndex + 1)}>下一張</Button>
		</Group>

		<ReceiptHeaderPanel header={header} />

		<Tabs defaultValue='detail' mt='lg' keepMounted={false}>
			<Tabs.List>
				<Tabs.Tab value='detail'>Detail</Tabs.Tab>
				<Tabs.Tab value='carton'>Carton</Tabs.Tab>
			</Tabs.List>
			<Tabs.Panel value='detail' pt='md'>
				{/* key: 換一張 PO 時重新掛載, 明細從第 1 頁、清空條件重新載入 */}
				{headerId
					? <QueryTable key={headerId} command='query_850_details' columns={DETAIL_COLUMNS} filters={['item_number']} fixedParams={{ header_id: headerId }} />
					: <Text size='sm' c='dimmed'>無資料</Text>}
			</Tabs.Panel>
			<Tabs.Panel value='carton' pt='md'>
				{headerId
					? <QueryTable key={headerId} command='query_850_cartons' columns={CARTON_COLUMNS} filters={[]} fixedParams={{ header_id: headerId }} />
					: <Text size='sm' c='dimmed'>無資料</Text>}
			</Tabs.Panel>
		</Tabs>
	</>;
}
