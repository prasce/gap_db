// 收貨明細上方的表頭表單: 以唯讀欄位顯示一張 PO (gapwmc_850_header 一列), 一列 4 格
import { SimpleGrid, TextInput } from '@mantine/core';
import type { Row } from '../../lib/exportXlsx';
import { HEADER_COLUMNS } from './columns';

// 標籤只顯示欄位名稱, 去掉 fNN_ 的位置前綴 (fNN 是檔案欄位位置, 不是業務名稱)
const labelOf = (column: string) => column.replace(/^f\d+_/, '');

export function ReceiptHeaderPanel({ header }: { header?: Row }) {
	// 輸入框整體縮小 10%: 寬度 90%、高度 27px (xs 預設 30px)、字體 11px (xs 預設 12px)
	return <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing='sm' verticalSpacing='sm' maw='90%'>
		{HEADER_COLUMNS.map(column =>
			<TextInput key={column} size='xs' readOnly label={labelOf(column)} value={header?.[column] ?? ''}
				styles={{ label: { fontWeight: 500, fontSize: 11 }, input: { height: 27, minHeight: 27, fontSize: 11 } }} />)}
	</SimpleGrid>;
}
