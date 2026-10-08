// 收貨明細頁的欄位清單; 各組須與 src-tauri/src/db.rs 對應清單相同順序

// db.rs HEADER_850_COLUMNS (query_850_headers): 上方表頭表單
export const HEADER_COLUMNS = [
	'f01_record_type', 'f02_interface_record_id', 'f03_receipt_id', 'f04_receipt_id_type', 'f05_receipt_type',
	'f06_po_number', 'f11_vendor_name', 'f12_vendor_number', 'f13_order_status', 'f18_country_of_origin',
	'f45_in_dc_date', 'f46_po_creation_date', 'created_at', 'updated_at', 'source_file'
] as const;

// db.rs detail_850_columns (query_850_details): Detail 頁籤
export const DETAIL_COLUMNS = [
	'f01_record_type', 'f02_interface_record_id', 'f03_line_ref', 'f04_line_number', 'f05_item_number',
	'f06_order_quantity', 'f07_quantity_um', 'f71_product_type', 'created_at', 'updated_at'
] as const;

// db.rs carton_850_columns (query_850_cartons): Carton 頁籤
export const CARTON_COLUMNS = [
	'f01_record_type', 'f02_interface_record_id', 'f03_line_ref', 'f07_po_number', 'f08_line_number', 'created_at'
] as const;

// db.rs RECEIPT_850_COLUMNS (query_850_receipts): 「匯出資料」用, 一筆明細一列 (含表頭欄位)
export const EXPORT_COLUMNS = [
	'f06_po_number', 'f03_receipt_id', 'f04_receipt_id_type', 'f05_receipt_type', 'f11_vendor_name',
	'f12_vendor_number', 'f18_country_of_origin', 'f13_order_status', 'f45_in_dc_date', 'f46_po_creation_date',
	'f04_line_number', 'f03_line_ref', 'f05_item_number', 'f26_item_last_digit', 'f06_order_quantity',
	'f07_quantity_um', 'f71_product_type',
	'carton_f08_line_number', 'created_at', 'updated_at', 'source_file'
] as const;

// 查詢列條件, 與 db.rs 的 ReceiptFilter 欄位相同; item_number 可輸入 8 碼或完整 9 碼, 多個值用 ; 分隔
export const FILTERS = ['po_number', 'source_file', 'item_number', 'order_status'] as const;
