// 貨品主檔: 查詢 gapwmc_832_item (Gap 832 轉出的 WMS 商品檔)
import { QueryTable } from '../components/QueryTable';

// 與 src-tauri/src/db.rs 的 ITEM_832_COLUMNS 相同順序
const COLUMNS = [
	'customer_code', 'sku', 'item_desc', 'barcode', 'length', 'width', 'height', 'weight',
	'units_per_carton', 'units_per_pallet', 'bundle_items', 'product_remarks', 'long_description',
	'item_size', 'item_colour', 'item_style', 'division', 'department', 'list_price', 'country_of_origin',
	'udf1', 'udf2', 'udf3', 'udf4', 'udf5', 'udf6'
] as const;

// 與 db.rs 的 ItemFilter 欄位相同
const FILTERS = ['customer_code', 'sku', 'barcode', 'long_description'] as const;

export default function ItemMasterView() {
	return <QueryTable command='query_832_items' columns={COLUMNS} filters={FILTERS} />;
}
