import { Button, Container, Group, Paper, PasswordInput, Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthenticationForm } from './AuthenticationForm';
import classes from './LoginPage.module.css';

export function LoginPage() {
	const navigate = useNavigate();
	const { login, changePassword } = useAuth();
	const [loading, setLoading] = useState(false);
	// 帳號的 must_change_password 為 true 時 (例如預設管理員種子帳號), 登入成功後先卡在這一步強制改密碼, 不直接放行
	const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [changing, setChanging] = useState(false);

	const handleLogin = async (values: { account: string, password: string }) => {
		setLoading(true);
		try {
			const employee = await login(values.account, values.password);
			if (employee.must_change_password) {
				setCurrentPassword(values.password);
				setNeedsPasswordChange(true);
				notifications.show({
					title: '請先變更密碼',
					message: '這個帳號目前使用預設/暫用密碼，請先設定新密碼才能繼續使用',
					color: 'yellow'
				});
				return;
			}
			notifications.show({
				title: '登入成功',
				message: `歡迎登入GAP測試環境！(${employee.role === 'admin' ? '管理員' : '一般使用者'})`,
				color: 'blue'
			});
			navigate('/item-master');
		} catch (e) {
			notifications.show({
				title: '登入失敗',
				message: String(e),
				color: 'red'
			});
		} finally {
			setLoading(false);
		}
	};

	const handleChangePassword = async (event: FormEvent) => {
		event.preventDefault();
		if (newPassword.length < 6) {
			notifications.show({ title: '密碼太短', message: '新密碼至少需要 6 碼', color: 'red' });
			return;
		}
		if (newPassword !== confirmPassword) {
			notifications.show({ title: '密碼不一致', message: '兩次輸入的新密碼不一樣', color: 'red' });
			return;
		}
		setChanging(true);
		try {
			await changePassword(currentPassword, newPassword);
			notifications.show({ title: '密碼已更新', message: '請用新密碼繼續使用', color: 'blue' });
			navigate('/item-master');
		} catch (e) {
			notifications.show({ title: '變更密碼失敗', message: String(e), color: 'red' });
		} finally {
			setChanging(false);
		}
	};

	if (needsPasswordChange) {
		return (
			<Container size={420} my={40}>
				<Title ta="center" className={classes.title}>
					請設定新密碼
				</Title>
				<Paper radius="md" p="lg" withBorder shadow="md" mt={25}>
					<form onSubmit={handleChangePassword}>
						<Stack>
							<PasswordInput required label="新密碼" placeholder="至少 6 碼"
								value={newPassword} onChange={(e) => setNewPassword(e.currentTarget.value)} />
							<PasswordInput required label="確認新密碼" placeholder="再輸入一次新密碼"
								value={confirmPassword} onChange={(e) => setConfirmPassword(e.currentTarget.value)} />
						</Stack>
						<Group justify="flex-end" mt="xl">
							<Button type="submit" color="gapBlue" radius="xl" w={140} loading={changing}>確認變更</Button>
						</Group>
					</form>
				</Paper>
			</Container>
		);
	}

	return (
		<Container size={420} my={40}>
			<Title ta="center" className={classes.title}>
				歡迎使用GAP測試環境
			</Title>

			<AuthenticationForm onSubmit={handleLogin} loading={loading} shadow="md" p={25} mt={25} />
		</Container>
	);
}
