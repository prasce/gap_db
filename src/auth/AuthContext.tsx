// 登入狀態管理: 呼叫 src-tauri/src/db.rs 的 login 指令驗證帳密, 登入結果 (帳號/角色) 存在 sessionStorage,
// 讓分頁重新整理時不用重新登入, 但關閉瀏覽器/App 後就會清除
import { invoke, isTauri } from '@tauri-apps/api/core';
import { createContext, PropsWithChildren, useContext, useState } from 'react';

export type Role = 'admin' | 'user';
export interface Employee {
	account: string,
	role: Role,
	must_change_password: boolean
}

interface AuthContextValue {
	employee: Employee | null,
	login: (account: string, password: string) => Promise<Employee>,
	logout: () => void,
	// 改密碼成功後更新本地的 employee.must_change_password, 讓畫面知道已經不用再強制改了
	changePassword: (oldPassword: string, newPassword: string) => Promise<void>
}

const STORAGE_KEY = 'gap_db.employee';

const AuthContext = createContext<AuthContextValue>({
	employee: null,
	login: async () => { throw new Error('AuthProvider 未掛載') },
	logout: () => { },
	changePassword: async () => { throw new Error('AuthProvider 未掛載') },
});

export const useAuth = () => useContext(AuthContext);

function loadStoredEmployee(): Employee | null {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) as Employee : null;
	} catch {
		return null;
	}
}

export function AuthProvider({ children }: PropsWithChildren) {
	const [employee, setEmployee] = useState<Employee | null>(loadStoredEmployee);

	async function login(account: string, password: string): Promise<Employee> {
		if (!isTauri()) throw new Error('需在桌面 App 中執行才能登入');
		const result = await invoke<Employee>('login', { req: { account, password } });
		setEmployee(result);
		try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result)); } catch { /* 忽略儲存失敗, 不影響登入 */ }
		return result;
	}

	function logout() {
		setEmployee(null);
		try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
	}

	async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
		if (!isTauri()) throw new Error('需在桌面 App 中執行');
		if (!employee) throw new Error('尚未登入');
		await invoke('change_password', { req: { account: employee.account, oldPassword, newPassword } });
		const updated = { ...employee, must_change_password: false };
		setEmployee(updated);
		try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* 忽略 */ }
	}

	return <AuthContext.Provider value={{ employee, login, logout, changePassword }}>{children}</AuthContext.Provider>;
}
