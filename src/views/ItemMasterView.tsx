// 貨品主檔: 查詢 gapwmc_832_item (Gap 832 轉出的 WMS 商品檔)
import { useAuth } from '../auth/AuthContext';
import { QueryTable } from '../components/QueryTable';

// 與 src-tauri/src/db.rs 的 ITEM_832_COLUMNS 相同順序, 最後多 created_at、source_file 兩欄 (query_832_items 另外附加)
const COLUMNS = [
	'customer_code', 'sku', 'item_desc', 'long_description',
	'item_size', 'item_colour', 'item_style', 'division', 'department', 'list_price', 'country_of_origin',
	'udf1', 'udf2', 'udf3', 'udf4', 'udf5', 'udf6', 'status', 'created_at', 'source_file'
] as const;

// 與 db.rs 的 ItemFilter 欄位相同
const BASE_FILTERS = ['customer_code', 'sku', 'source_file', 'long_description', 'status'] as const;
// 管理員專用: 顯示每個 SKU 的完整歷史 (含已刪除); 一般使用者只看得到每個 SKU 最新且非 DELETE 的一筆
const ADMIN_FILTERS = [...BASE_FILTERS, 'include_deleted'] as const;

// status 為事件類型: ADD (新增) / UPDATE (更新) / DELETE (刪除); 空字串代表不限制
const SELECT_FILTERS = {
	status: [
		{ value: '', label: '全部' },
		{ value: 'ADD', label: 'ADD' },
		{ value: 'DELETE', label: 'DELETE' },
		{ value: 'UPDATE', label: 'UPDATE' },
	],
};

const CHECKBOX_FILTERS = {
	include_deleted: { label: '顯示已刪除 SKU (含完整歷史)' },
};

export default function ItemMasterView() {
	const { employee } = useAuth();
	const isAdmin = employee?.role === 'admin';
	const filters = isAdmin ? ADMIN_FILTERS : BASE_FILTERS;

	return <QueryTable command='query_832_items' columns={COLUMNS} filters={filters}
		selectFilters={SELECT_FILTERS} checkboxFilters={isAdmin ? CHECKBOX_FILTERS : undefined} uatPage='item_master' exportName='item_master' />;
}
