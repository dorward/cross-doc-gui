import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import lightTheme from 'primereact/resources/themes/lara-light-blue/theme.css?inline';
import darkTheme from 'primereact/resources/themes/lara-dark-blue/theme.css?inline';
import type { DesktopApi } from '../shared/api.js';
import type { ColorMode } from '../shared/appearance.js';

const query = '(prefers-color-scheme: dark)';
const systemSnapshot = () => matchMedia(query).matches;
const subscribe = (changed: () => void) => {
	const media = matchMedia(query);
	media.addEventListener('change', changed);
	return () => media.removeEventListener('change', changed);
};
export function useAppearance(api: DesktopApi) {
	const generation = useRef(Symbol());
	const [ready, setReady] = useState(false);
	const [preference, setPreference] = useState<ColorMode>('system');
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const systemDark = useSyncExternalStore(subscribe, systemSnapshot);
	const effective = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
	useEffect(() => {
		const current = Symbol();
		generation.current = current;
		void api.getAppearance().then(
			(result) => {
				if (current !== generation.current) return;
				setReady(true);
				if (result.ok) setPreference(result.value);
				else setSaveError(result.error);
			},
			() => {
				if (current === generation.current) {
					setReady(true);
					setSaveError('Unable to load appearance preference.');
				}
			},
		);
		return () => {
			generation.current = Symbol();
		};
	}, [api]);
	useLayoutEffect(() => {
		const style = document.createElement('style');
		style.id = 'cross-doc-appearance-theme';
		style.textContent = effective === 'dark' ? darkTheme : lightTheme;
		document.head.append(style);
		document.documentElement.dataset.colorMode = effective;
		document.documentElement.style.colorScheme = effective;
		return () => {
			style.remove();
		};
	}, [effective]);
	const choose = async (value: ColorMode) => {
		const current = generation.current;
		setSaving(true);
		setSaveError(null);
		try {
			const result = await api.setAppearance(value);
			if (current !== generation.current) return;
			setReady(true);
			if (result.ok) setPreference(result.value);
			else setSaveError(result.error);
		} catch {
			if (current === generation.current) setSaveError('Unable to save appearance preference.');
		} finally {
			if (current === generation.current) setSaving(false);
		}
	};
	return { preference, choose, saving, ready, saveError };
}
