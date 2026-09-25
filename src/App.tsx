import { AppShell, Burger, Button, Space, Text, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { isTauri } from '@tauri-apps/api/core';
import * as tauriEvent from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import * as tauriLogger from '@tauri-apps/plugin-log';
import { relaunch } from '@tauri-apps/plugin-process';
import * as tauriUpdater from '@tauri-apps/plugin-updater';
import { JSX, lazy, LazyExoticComponent, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { ImCross } from 'react-icons/im';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import classes from './App.module.css';
import { useCookie, useLocalForage } from './common/utils';
import { DoubleNavbar, ICON_RAIL_WIDTH, PANEL_WIDTH } from './components/DoubleNavbar';
import { PageTabs } from './components/PageTabs';
import { ScrollToTop } from './components/ScrollToTop';
import { useTauriContext } from './tauri/TauriProvider';
import { TitleBar } from './tauri/TitleBar';
import DealsView from './views/DealsView';
import ExampleView from './views/ExampleView';
import FallbackAppRender from './views/FallbackErrorBoundary';
import FallbackSuspense from './views/FallbackSuspense';
import { LoginPage } from './views/LoginPage';
import { ForgotPassword } from './views/ForgotPassword';
// if some views are large, you can use lazy loading to reduce the initial app load time
const LazyView = lazy(() => import('./views/LazyView'));

// imported views need to be added to the `views` list variable
interface View {
	component: (() => JSX.Element) | LazyExoticComponent<() => JSX.Element>,
	path: string,
	exact?: boolean,
	name: string
}

// 主應用程式組件
function MainApp() {
	const { t } = useTranslation();
	// check if using custom titlebar to adjust other components
	const { usingCustomTitleBar } = useTauriContext();

	// routes; the sidebar menu itself is defined in DoubleNavbar.tsx
	const views: View[] = [
		{ component: DealsView, path: '/deals/open/all', name: 'All Open Deals' },
		{ component: DealsView, path: '/deals/open/sales', name: 'Sales' },
		{ component: DealsView, path: '/deals/open/purchases', name: 'Purchases' },
		{ component: DealsView, path: '/deals/open/refinances', name: 'Refinances' },
		{ component: ExampleView, path: '/example-view', name: t('ExampleView') },
		{ component: () => <Text>Woo, routing works</Text>, path: '/example-view-2', name: 'Test Routing' },
		{ component: LazyView, path: '/lazy-view', name: 'Lazy Load' }
		// Other ways to add views to this array:
		//     { component: () => <Home prop1={'stuff'} />, path: '/home', name: t('Home') },
		//     { component: React.memo(About), path: '/about', name: t('About') },
	];

	const { toggleColorScheme } = useMantineColorScheme();
	const colorScheme = useComputedColorScheme();
	useHotkeys([['ctrl+J', toggleColorScheme]]);

	// opened is for mobile nav
	const [mobileNavOpened, { toggle: toggleMobileNav }] = useDisclosure();

	// second-level panel of the sidebar (the icon rail always stays visible)
	const [navPanelOpenedCookie, setNavPanelOpenedCookie] = useCookie('nav-panel-opened', 'true');
	const navPanelOpened = navPanelOpenedCookie === 'true';
	const toggleNavPanel = () => setNavPanelOpenedCookie(o => o === 'true' ? 'false' : 'true');

	// page tabs: visiting a view opens a tab for it; closing the active tab moves to its neighbour
	const location = useLocation();
	const navigate = useNavigate();
	const [openTabs, setOpenTabs] = useState<string[]>([]);
	useEffect(() => {
		if (views.some(view => view.path === location.pathname)) {
			setOpenTabs(tabs => tabs.includes(location.pathname) ? tabs : [...tabs, location.pathname]);
		}
	}, [location.pathname]);
	const closeTab = (path: string) => {
		const index = openTabs.indexOf(path);
		const remaining = openTabs.filter(tab => tab !== path);
		setOpenTabs(remaining);
		// with no tabs left, go to an empty page
		if (path === location.pathname) navigate(remaining[Math.min(index, remaining.length - 1)] ?? '/home');
	};
	const tabs = openTabs.map(path => ({ path, label: views.find(view => view.path === path)?.name ?? path }));

	const [scroller, setScroller] = useState<HTMLElement | null>(null);
	// load preferences using localForage
	const [footersSeen, setFootersSeen, footersSeenLoading] = useLocalForage('footersSeen', {});

	// Tauri event listeners (run on mount)
	if (isTauri()) {
		useEffect(() => {
			const promise = tauriEvent.listen('longRunningThread', ({ payload }: { payload: any }) => {
				tauriLogger.info(payload.message);
			});
			return () => { promise.then(unlisten => unlisten()) };
		}, []);
		// system tray events
		useEffect(() => {
			const promise = tauriEvent.listen('systemTray', ({ payload, ...eventObj }: { payload: { message: string } }) => {
				tauriLogger.info(payload.message);
				// for debugging purposes only
				notifications.show({
					title: '[DEBUG] System Tray Event',
					message: payload.message
				});
			});
			return () => { promise.then(unlisten => unlisten()) };
		}, []);

		// update checker
		useEffect(() => {
			(async () => {
				const update = await tauriUpdater.check();
				if (update) {
					const color = colorScheme === 'dark' ? 'teal' : 'teal.8';
					notifications.show({
						id: 'UPDATE_NOTIF',
						title: t('updateAvailable', { v: update.version }),
						color,
						message: <>
							<Text>{update.body}</Text>
							<Button color={color} style={{ width: '100%' }} onClick={() => update.downloadAndInstall(event => {
								switch (event.event) {
									case 'Started':
										notifications.show({ title: t('installingUpdate', { v: update.version }), message: t('relaunchMsg'), autoClose: false });
										// contentLength = event.data.contentLength;
										// tauriLogger.info(`started downloading ${event.data.contentLength} bytes`);
										break;
									case 'Progress':
										// downloaded += event.data.chunkLength;
										// tauriLogger.info(`downloaded ${downloaded} from ${contentLength}`);
										break;
									case 'Finished':
										// tauriLogger.info('download finished');
										break;
								}
							}).then(relaunch)}>{t('installAndRelaunch')}</Button>
						</>,
						autoClose: false
					});
				}
			})()
		}, []);

		// Handle additional app launches (url, etc.)
		useEffect(() => {
			const promise = tauriEvent.listen('newInstance', async ({ payload, ...eventObj }: { payload: { args: string[], cwd: string } }) => {
				const appWindow = getCurrentWebviewWindow();
				if (!(await appWindow.isVisible())) await appWindow.show();

				if (await appWindow.isMinimized()) {
					await appWindow.unminimize();
					await appWindow.setFocus();
				}

				let args = payload?.args;
				let cwd = payload?.cwd;
				if (args?.length > 1) {

				}
			});
			return () => { promise.then(unlisten => unlisten()) };
		}, []);
	}

	const FOOTER_KEY = 'footer[0]';
	const showFooter = FOOTER_KEY && !footersSeenLoading && !(FOOTER_KEY in footersSeen);
	// assume key is always available
	const footerText = t(FOOTER_KEY);

	// hack for global styling the vertical simplebar based on state
	useEffect(() => {
		const el = document.getElementsByClassName('simplebar-vertical')[0];
		if (el instanceof HTMLElement) {
			el.style.marginTop = usingCustomTitleBar ? '70px' : '40px';
			el.style.marginBottom = showFooter ? '50px' : '0px';
		}
	}, [usingCustomTitleBar, showFooter]);

	return <>
		{usingCustomTitleBar && <TitleBar />}
		<AppShell padding='md'
			header={{ height: 40 }}
			footer={showFooter ? { height: 60 } : undefined}
			layout='alt'
			navbar={{ width: ICON_RAIL_WIDTH + (navPanelOpened ? PANEL_WIDTH : 0), breakpoint: 'sm', collapsed: { mobile: !mobileNavOpened } }}
			className={classes.appShell}>
			<AppShell.Main>
				{usingCustomTitleBar && <Space h='xl' />}
				<SimpleBar scrollableNodeProps={{ ref: setScroller }} autoHide={false} className={classes.simpleBar}>
					<ErrorBoundary FallbackComponent={FallbackAppRender} /*onReset={_details => resetState()} */ onError={e => tauriLogger.error(e.message)}>
						<Routes>
							{/* empty page shown when every tab has been closed */}
							<Route path='/home' element={null} />
							{views.map((view, index) => <Route key={index} path={view.path} element={<Suspense fallback={<FallbackSuspense />}><view.component /></Suspense>} />)}
						</Routes>
					</ErrorBoundary>
					{/* prevent the footer from covering bottom text of a route view */}
					<Space h={showFooter ? 70 : 50} />
					<ScrollToTop scroller={scroller} bottom={showFooter ? 70 : 20} />
				</SimpleBar>
			</AppShell.Main>
			<AppShell.Header data-tauri-drag-region px='xs' className={classes.header}>
				<Burger hiddenFrom='sm' opened={mobileNavOpened} onClick={toggleMobileNav} size='sm' mr='xs' />
				<PageTabs tabs={tabs} activePath={location.pathname} onSelect={navigate} onClose={closeTab} />
			</AppShell.Header>

			<AppShell.Navbar className={classes.fullHeightNavbar} withBorder={false}>
				<DoubleNavbar panelOpened={navPanelOpened} onTogglePanel={toggleNavPanel} onNavigate={() => mobileNavOpened && toggleMobileNav()} />
			</AppShell.Navbar>

			{showFooter &&
				<AppShell.Footer p='md' className={classes.footer}>
					{footerText}
					<Button variant='subtle' size='xs' onClick={() => setFootersSeen(prev => ({ ...prev, [FOOTER_KEY]: '' }))}>
						<ImCross />
					</Button>
				</AppShell.Footer>}
		</AppShell>

	</>;
}

// 主路由組件
export default function App() {
	return (
		<ErrorBoundary FallbackComponent={FallbackAppRender} onError={e => tauriLogger.error(e.message)}>
			<Routes>
				<Route path='/' element={<LoginPage />} />
				<Route path='/forgot-password' element={<ForgotPassword />} />
				<Route path='/*' element={<MainApp />} />
			</Routes>
		</ErrorBoundary>
	);
}
