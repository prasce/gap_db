// 貨品主檔頁的欄位清單; 各組須與 src-tauri/src/db.rs 對應清單相同順序

// 上方表頭表單 (一個 SKU 一次): 取自 query_832_items 回傳的那一列, 一列 4 格
export const HEADER_COLUMNS = [
	'customer_code', 'sku', 'item_desc', 'barcode',
	'item_size', 'item_colour', 'item_style', 'division',
	'class_id', 'sub_class_id', 'list_price', 'currency_code',
	'season_code_description', 'department_name', 'source_file'
] as const;

// 表頭標籤與欄位名稱不同的; 其餘直接顯示欄位名稱
export const HEADER_LABELS: Record<string, string> = { season_code_description: 'season_code' };

// db.rs ITEM_832_DETAIL_COLUMNS (query_832_detail): Detail 頁籤, 表頭沒顯示的欄位都在這裡
export const DETAIL_COLUMNS = [
	'length', 'width', 'height', 'weight', 'units_per_carton', 'units_per_pallet', 'bundle_items', 'product_remarks',
	'garment_product_type_description', 'ticket_type_description', 'maintenance_type_code', 'commodity_code',
	'reference_identification_division_id_brand', 'product_service_id', 'description', 'division_name',
	'status', 'created_at'
] as const;

// db.rs ITEM_832_PRICE_COLUMNS (query_832_price): Price history 頁籤
export const PRICE_COLUMNS = ['list_price', 'old_price_period', 'net_price', 'new_price_period', 'created_at'] as const;

export const PRICE_LABELS: Record<string, string> = {
	list_price: 'List Price', old_price_period: 'List Price date',
	net_price: 'New Price', new_price_period: 'New Price date'
};

// 「匯出資料」用: query_832_items 的欄位 (db.rs ITEM_832_COLUMNS, 最後多 created_at、source_file)
export const EXPORT_COLUMNS = [
	'customer_code', 'sku', 'item_desc',
	'garment_product_type_description', 'ticket_type_description', 'maintenance_type_code', 'commodity_code',
	'old_price_period', 'new_price_period',
	'item_size', 'item_colour', 'item_style', 'division', 'reference_identification_division_id_brand',
	'class_id', 'sub_class_id', 'list_price', 'net_price', 'currency_code',
	'product_service_id', 'description', 'division_name',
	'season_code_description', 'department_name', 'status', 'created_at', 'source_file'
] as const;

// 查詢列條件, 與 db.rs 的 ItemFilter 欄位相同
export const BASE_FILTERS = ['customer_code', 'sku', 'source_file', 'status'] as const;
