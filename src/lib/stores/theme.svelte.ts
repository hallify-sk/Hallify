let _theme = $state<string>('slate');

export const themeStore = {
	get current() { return _theme; },
	set(val: string) {
		_theme = val;
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', val);
		}
	}
};
