import { ActionIcon, Avatar, Collapse, Indicator, Text, Tooltip, UnstyledButton, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconBell, IconChevronDown, IconChevronUp, IconFileText, IconHome, IconMenu2, IconPencil, IconUser } from '@tabler/icons-react';
import { useState } from 'react';
import { BsMoonStarsFill } from 'react-icons/bs';
import { IoSunnySharp } from 'react-icons/io5';
import { NavLink } from 'react-router-dom';
import classes from './DoubleNavbar.module.css';

export const ICON_RAIL_WIDTH = 60;
export const PANEL_WIDTH = 200;

export interface NavItem {
	label: string,
	count: number,
	path: string
}

export interface NavSection {
	label: string,
	items: NavItem[]
}

// static placeholder data, to be replaced with real GAP data
export const SECTIONS: NavSection[] = [
	{
		label: 'Open Deals', items: [
			{ label: 'All Open Deals', count: 64, path: '/deals/open/all' },
			{ label: 'Sales', count: 31, path: '/deals/open/sales' },
			{ label: 'Purchases', count: 29, path: '/deals/open/purchases' },
			{ label: 'Refinances', count: 4, path: '/deals/open/refinances' }
		]
	},
	{ label: 'Completed Deals', items: [] },
	{ label: 'Deal Docket', items: [] }
];

const RAIL_ICONS = [
	{ id: 'notifications', label: 'Notifications', icon: IconBell, badge: 5 },
	{ id: 'home', label: 'Home', icon: IconHome },
	{ id: 'documents', label: 'Documents', icon: IconFileText },
	{ id: 'edit', label: 'Edit', icon: IconPencil },
	{ id: 'people', label: 'People', icon: IconUser }
];

interface DoubleNavbarProps {
	panelOpened: boolean,
	onTogglePanel: () => void,
	onNavigate?: () => void
}

export function DoubleNavbar({ panelOpened, onTogglePanel, onNavigate }: DoubleNavbarProps) {
	const { toggleColorScheme } = useMantineColorScheme();
	const colorScheme = useComputedColorScheme();
	const [activeIcon, setActiveIcon] = useState('home');
	const [openSections, setOpenSections] = useState<Record<string, boolean>>({ [SECTIONS[0]!.label]: true });
	const toggleSection = (label: string) => setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));

	const railIcons = RAIL_ICONS.map(({ id, label, icon: Icon, badge }) => {
		const icon = <Icon size={22} stroke={1.8} />;
		return <Tooltip key={id} label={label} position='right' withArrow transitionProps={{ duration: 0 }}>
			<UnstyledButton onClick={() => setActiveIcon(id)} className={classes.railButton} data-active={activeIcon === id || undefined} aria-label={label}>
				{badge ? <Indicator label={badge} size={16} color='blue.4' offset={2}>{icon}</Indicator> : icon}
			</UnstyledButton>
		</Tooltip>;
	});

	const sections = SECTIONS.map(section => {
		const opened = !!openSections[section.label];
		return <div key={section.label} className={classes.section}>
			<UnstyledButton className={classes.sectionHeader} data-opened={opened || undefined} onClick={() => toggleSection(section.label)}>
				<Text size='sm' fw={600}>{section.label}</Text>
				{opened ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
			</UnstyledButton>
			<Collapse in={opened}>
				{section.items.map(item =>
					<NavLink key={item.path} to={item.path} onClick={onNavigate}
						className={({ isActive }) => classes.item + (isActive ? ' ' + classes.itemActive : '')}>
						<Text size='sm'>{item.label}</Text>
						<Text size='xs' className={classes.count}>{item.count}</Text>
					</NavLink>
				)}
			</Collapse>
		</div>;
	});

	return <div className={classes.wrapper}>
		<div className={classes.rail} style={{ width: ICON_RAIL_WIDTH }}>
			<div className={classes.railTop}>
				<ActionIcon id='toggle-theme' title='Ctrl + J' variant='default' onClick={toggleColorScheme} size={30}>
					{colorScheme === 'dark' ? <IoSunnySharp size={'1.5em'} /> : <BsMoonStarsFill />}
				</ActionIcon>
			</div>
			<div className={classes.railIcons}>
				{!panelOpened &&
					<UnstyledButton onClick={onTogglePanel} className={classes.railButton} aria-label='Expand panel'>
						<IconMenu2 size={20} stroke={1.5} />
					</UnstyledButton>}
				{railIcons}
			</div>
			<Indicator position='bottom-end' color='green' size={10} offset={5} withBorder className={classes.avatar}>
				<Avatar radius='xl' size={32} color='white' variant='outline' />
			</Indicator>
		</div>
		{panelOpened &&
			<div className={classes.panel} style={{ width: PANEL_WIDTH }}>
				<div className={classes.panelTop}>
					<UnstyledButton onClick={onTogglePanel} className={classes.panelToggle} aria-label='Collapse panel'>
						<IconMenu2 size={18} stroke={1.5} />
					</UnstyledButton>
				</div>
				{sections}
			</div>}
	</div>;
}
