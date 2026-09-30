// 收貨明細: 查詢 gapwmc_850_header / detail / carton (Gap 850 轉出的 WMS 收貨檔), 一筆明細一列
import { QueryTable } from '../components/QueryTable';

// 與 src-tauri/src/db.rs 的 RECEIPT_850_COLUMNS 相同順序: 表頭 -> 明細 -> 箱明細
const COLUMNS = [
	'f06_po_number', 'f03_receipt_id', 'f04_receipt_id_type', 'f05_receipt_type', 'f11_vendor_name',
	'f12_vendor_number', 'f18_country_of_origin', 'f13_order_status', 'f45_in_dc_date', 'f46_po_creation_date',
	'f04_line_number', 'f03_line_ref', 'f05_item_number', 'f26_item_last_digit', 'f06_order_quantity',
	'f07_quantity_um', 'f71_product_type',
	'carton_f08_line_number'
] as const;

// 與 db.rs 的 ReceiptFilter 欄位相同; item_number 可輸入 8 碼或完整 9 碼
const FILTERS = ['po_number', 'vendor_name', 'item_number', 'order_status'] as const;

export default function ReceivingView() {
	return <QueryTable command='query_850_receipts' columns={COLUMNS} filters={FILTERS} uatPage='receiving' />;
}
