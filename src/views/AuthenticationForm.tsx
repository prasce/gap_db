import { Button, Group, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { isTauri } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';
import classes from './LoginPage.module.css';

interface AuthenticationFormProps {
	onSubmit?: (values: { account: string, password: string }) => void,
	loading?: boolean
}

// 關閉應用程式（瀏覽器模式下只能嘗試關閉分頁）
function exitApp() {
	if (isTauri()) {
		exit(0);
	} else {
		window.close();
	}
}

// 欄位沒有獨立的 label, 提示文字和紅色必填星號一起畫在輸入框內, 輸入內容後就隱藏
function Hint({ text, visible }: { text: string, visible: boolean }) {
	if (!visible) return null;
	return <span className={classes.hint}>{text} <span className={classes.star}>*</span></span>;
}

export function AuthenticationForm({ onSubmit, loading }: AuthenticationFormProps) {
	const form = useForm({
		initialValues: {
			account: '',
			password: '',
		},
		validate: {
			account: (val) => (val.trim() ? null : '請輸入帳號'),
			password: (val) => (val ? null : '請輸入密碼'),
		},
	});

	const handleSubmit = (values: typeof form.values) => {
		onSubmit?.(values);
	};

	return (
		<form onSubmit={form.onSubmit(handleSubmit)}>
			<Stack gap='md'>
				<div className={classes.field}>
					<TextInput
						aria-label='帳號'
						value={form.values.account}
						onChange={(event) => form.setFieldValue('account', event.currentTarget.value)}
						error={form.errors.account}
						radius='md'
						autoFocus />
					<Hint text='請輸入帳號' visible={!form.values.account} />
				</div>

				<div className={classes.field}>
					<PasswordInput
						aria-label='密碼'
						value={form.values.password}
						onChange={(event) => form.setFieldValue('password', event.currentTarget.value)}
						error={form.errors.password}
						radius='md' />
					<Hint text='請輸入密碼' visible={!form.values.password} />
				</div>
			</Stack>

			<Group justify='flex-end' mt='xl'>
				<Button variant='outline' color='gapBlue' radius='xl' w={100} onClick={exitApp}>
					離開
				</Button>
				<Button type='submit' color='gapBlue' radius='xl' w={100} loading={loading}>
					登入
				</Button>
			</Group>
		</form>
	);
}
