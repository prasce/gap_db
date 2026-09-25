import { CloseButton, Text, UnstyledButton } from '@mantine/core';
import classes from './PageTabs.module.css';

export interface PageTab {
	path: string,
	label: string
}

interface PageTabsProps {
	tabs: PageTab[],
	activePath: string,
	onSelect: (path: string) => void,
	onClose: (path: string) => void
}

export function PageTabs({ tabs, activePath, onSelect, onClose }: PageTabsProps) {
	return <div className={classes.tabs}>
		{tabs.map(tab =>
			<div key={tab.path} className={classes.tab} data-active={tab.path === activePath || undefined}>
				<UnstyledButton className={classes.tabLabel} onClick={() => onSelect(tab.path)}>
					<Text size='sm' inherit>{tab.label}</Text>
				</UnstyledButton>
				<CloseButton size='sm' className={classes.close} aria-label={`Close ${tab.label}`} onClick={() => onClose(tab.path)} />
			</div>
		)}
	</div>;
}
