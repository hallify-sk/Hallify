import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { readableInkOn, contrastRatio } from './contrast';

describe('readableInkOn', () => {
	it('puts dark ink on the default Hallify pink (white fails AA there)', () => {
		expect(readableInkOn('#f05ca1')).toBe('#1a1416');
		expect(contrastRatio('#f05ca1', '#1a1416')!).toBeGreaterThan(4.5);
	});

	it('keeps white on dark fills and dark ink on pale ones', () => {
		expect(readableInkOn('#1f3a5f')).toBe('#ffffff');
		expect(readableInkOn('#000000')).toBe('#ffffff');
		expect(readableInkOn('#ffffff')).toBe('#1a1416');
		expect(readableInkOn('#fce5ef')).toBe('#1a1416');
	});

	it('always picks the ink with the higher contrast', () => {
		for (const fill of ['#f05ca1', '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#808080', '#0ea5e9', '#a6225e']) {
			const ink = readableInkOn(fill);
			const other = ink === '#ffffff' ? '#1a1416' : '#ffffff';
			expect(contrastRatio(fill, ink)!).toBeGreaterThanOrEqual(contrastRatio(fill, other)!);
		}
	});

	it('falls back to the themed token when the fill cannot be measured', () => {
		expect(readableInkOn(undefined)).toBe('var(--accent-contrast)');
		expect(readableInkOn('var(--accent)')).toBe('var(--accent-contrast)');
	});
});

describe('console text tokens (I30)', () => {
	// The three console themes, as app.css defines them: muted and subtle text must
	// clear WCAG AA (4.5:1) on every surface text normally sits on.
	const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
	const block = (selector: string) => {
		const start = css.indexOf(selector);
		return css.slice(start, css.indexOf('\n}', start));
	};
	const token = (src: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(src)?.[1];
	const root = block(':root');
	const themes = { slate: root, dark: block('[data-theme="dark"]'), warm: block('[data-theme="warm"]') };

	for (const [name, src] of Object.entries(themes)) {
		it(`${name}: muted and subtle text read at 4.5:1 or better`, () => {
			const get = (k: string) => token(src, k) ?? token(root, k)!;
			for (const ink of ['text-muted', 'text-subtle']) {
				for (const bg of ['bg-base', 'bg-panel', 'bg-panel2']) {
					expect(contrastRatio(get(ink), get(bg))!, `${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
				}
			}
		});
	}
});

describe('organisation brand ink (B77)', () => {
	// A var() inside a custom property resolves where the property is declared. The
	// brand inks live on the shell, not on html, so a theme block on html that reads
	// them always takes its fallback — the console kept Hallify pink for text.
	const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
	const layout = readFileSync(new URL('../routes/+layout.svelte', import.meta.url), 'utf8');
	const rule = (selector: string) => {
		const start = css.indexOf(`\n${selector} {`);
		return start < 0 ? '' : css.slice(start, css.indexOf('\n}', start + 1));
	};

	it('the theme blocks on html never read the brand inks', () => {
		for (const sel of [':root', '[data-theme="dark"]', '[data-theme="warm"]']) {
			expect(rule(sel), sel).not.toBe('');
			expect(rule(sel), sel).not.toMatch(/--brand-ink/);
		}
	});

	it('the branded element picks its ink per theme', () => {
		expect(rule('[data-brand]')).toMatch(/--accent-ink:\s*var\(--brand-ink-light,/);
		expect(rule('[data-theme="dark"] [data-brand]')).toMatch(/--accent-ink:\s*var\(--brand-ink-dark,/);
	});

	it('every element that carries the brand inks is marked [data-brand]', () => {
		const carriers = layout.match(/<div[^>]*style=\{brandStyle\}[^>]*>/g) ?? [];
		expect(carriers.length).toBeGreaterThan(0);
		for (const tag of carriers) expect(tag).toMatch(/data-brand=/);
	});
});
