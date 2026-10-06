import { isTauri } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useEffect } from 'react';

// 登入頁用固定大小的小視窗 (只留縮小/關閉), 登入後的主畫面可縮放、可最大化
export const LOGIN_WINDOW_SIZE = { width: 500, height: 309 };
export const MAIN_WINDOW_SIZE = { width: 1280, height: 800 };
export const MAIN_WINDOW_MIN_SIZE = { width: 1000, height: 600 };

export type WindowMode = 'login' | 'main';

async function applyWindowMode(mode: WindowMode) {
	const win = getCurrentWebviewWindow();
	if (mode === 'login') {
		// 先拿掉最小尺寸限制, 才能縮到登入視窗的大小
		await win.setMinSize(null);
		await win.setResizable(false);
		await win.setMaximizable(false);
		if (await win.isMaximized()) await win.unmaximize();
		await win.setSize(new LogicalSize(LOGIN_WINDOW_SIZE.width, LOGIN_WINDOW_SIZE.height));
	} else {
		// 先解除固定大小, setSize 才會生效
		await win.setResizable(true);
		await win.setMaximizable(true);
		await win.setMinSize(new LogicalSize(MAIN_WINDOW_MIN_SIZE.width, MAIN_WINDOW_MIN_SIZE.height));
		await win.setSize(new LogicalSize(MAIN_WINDOW_SIZE.width, MAIN_WINDOW_SIZE.height));
	}
	await win.center();
}

// 瀏覽器模式 (pnpm start) 沒有 Tauri API, 什麼都不做
export function useWindowMode(mode: WindowMode) {
	useEffect(() => {
		if (!isTauri()) return;
		applyWindowMode(mode).catch(console.error);
	}, [mode]);
}
