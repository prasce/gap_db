// 「UAT 測試」按鈕與結果視窗; page 為送給 run_uat_test 指令的頁面代碼
import { Badge, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { invoke } from '@tauri-apps/api/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

// 與 src-tauri/src/uat.rs 的 UatResult/UatItem 相同格式
type UatItemStatus = 'pass' | 'fail' | 'skip';
interface UatItem { name: string, status: UatItemStatus, detail: string }
interface UatResult { id: number, page: string, overall_status: UatItemStatus, items: UatItem[] }

const UAT_STATUS_LABEL: Record<UatItemStatus, { label: string, color: string }> = {
	pass: { label: '通過', color: 'green' },
	fail: { label: '失敗', color: 'red' },
	skip: { label: '略過', color: 'gray' },
};

export type UatPage = 'item_master' | 'receiving';

export function UatButton({ page }: { page: UatPage }) {
	const { employee } = useAuth();
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<UatResult>();

	async function run() {
		setRunning(true);
		try {
			setResult(await invoke<UatResult>('run_uat_test', { page, account: employee?.account ?? null }));
		} catch (e) {
			notifications.show({ title: 'UAT 測試執行失敗', message: String(e), color: 'red' });
		} finally {
			setRunning(false);
		}
	}

	return <>
		<Button size='xs' color='red' ml='auto' loading={running} onClick={run}>UAT 測試</Button>
		<Modal opened={!!result} onClose={() => setResult(undefined)}
			title={`UAT 測試結果${result ? ' - ' + UAT_STATUS_LABEL[result.overall_status].label : ''}`} size='lg'>
			<Stack gap='sm'>
				{result?.items.map((item, i) =>
					<div key={i}>
						<Group gap='xs' wrap='nowrap'>
							<Badge size='sm' color={UAT_STATUS_LABEL[item.status].color}>{UAT_STATUS_LABEL[item.status].label}</Badge>
							<Text size='sm' fw={500}>{item.name}</Text>
						</Group>
						{item.detail && <Text size='xs' c='dimmed' ml={4} style={{ whiteSpace: 'pre-wrap' }}>{item.detail}</Text>}
					</div>)}
			</Stack>
		</Modal>
	</>;
}
