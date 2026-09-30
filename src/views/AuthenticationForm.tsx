import {
	Button,
	Divider,
	Group,
	Paper,
	PaperProps,
	PasswordInput,
	Stack,
	Text,
	TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { isTauri } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';
import classes from './LoginPage.module.css';

interface AuthenticationFormProps extends PaperProps {
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

export function AuthenticationForm(props: AuthenticationFormProps) {
	const { onSubmit, loading, ...paperProps } = props;
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
		<Paper radius='md' p='lg' withBorder {...paperProps} className={classes.card}>
			<Text size='lg' fw={500} className={classes.heading}>
				請輸入帳號密碼登入
			</Text>

			<Divider my='lg' />

			<form onSubmit={form.onSubmit(handleSubmit)}>
				<Stack>
					<TextInput
						required
						label='帳號'
						placeholder='請輸入帳號'
						value={form.values.account}
						onChange={(event) => form.setFieldValue('account', event.currentTarget.value)}
						error={form.errors.account}
						radius='md'
						classNames={{ label: classes.label }} />

					<PasswordInput
						required
						label='密碼'
						placeholder='請輸入密碼'
						value={form.values.password}
						onChange={(event) => form.setFieldValue('password', event.currentTarget.value)}
						error={form.errors.password}
						radius='md'
						classNames={{ label: classes.label }} />
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
		</Paper>
	);
}
