// 貨品主檔上方的表頭表單: 以唯讀欄位顯示一個 SKU (gapwmc_832_item 一列), 一列 4 格
import { SimpleGrid, TextInput } from '@mantine/core';
import type { Row } from '../../lib/exportXlsx';
import { HEADER_COLUMNS, HEADER_LABELS } from './columns';

export function ItemHeaderPanel({ header }: { header?: Row }) {
	// 輸入框尺寸與收貨明細的表頭一致: 寬度 90%、高度 27px、字體 11px
	return <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing='sm' verticalSpacing='sm' maw='90%'>
		{HEADER_COLUMNS.map(column =>
			<TextInput key={column} size='xs' readOnly label={HEADER_LABELS[column] ?? column} value={header?.[column] ?? ''}
				styles={{ label: { fontWeight: 500, fontSize: 11 }, input: { height: 27, minHeight: 27, fontSize: 11 } }} />)}
	</SimpleGrid>;
}
