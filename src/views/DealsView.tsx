import { Title } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import { SECTIONS } from '../components/DoubleNavbar';

// placeholder content for the deal list views
export default function DealsView() {
	const { pathname } = useLocation();
	const item = SECTIONS.flatMap(section => section.items).find(item => item.path === pathname);
	return <Title order={3}>{item?.label}</Title>;
}
