import { describe, it, expect } from 'vitest';
import { brandShellStyle } from './brand-style';
import { contrastRatio, inkOnDark, inkOnLight } from './contrast';

const prop = (style: string, name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(style)?.[1];

describe('brandShellStyle (B77)', () => {
	it("overrides nothing for no colour, an unusable one, or Hallify's own pink", () => {
		for (const c of [undefined, null, '', 'red', '#fff', 'var(--x)', '#f05ca1', '#F05CA1']) {
			expect(brandShellStyle(c as string | null | undefined), String(c)).toBe('');
		}
	});

	it('gives the shell the brand fill and a readable text ink for each theme', () => {
		const s = brandShellStyle('#1a7f5a');
		expect(prop(s, 'accent')).toBe('#1a7f5a');
		expect(prop(s, 'accent-action')).toBe('#1a7f5a');
		expect(prop(s, 'brand-ink-light')).toBe(inkOnLight('#1a7f5a'));
		expect(prop(s, 'brand-ink-dark')).toBe(inkOnDark('#1a7f5a'));
		expect(contrastRatio(prop(s, 'brand-ink-light')!, '#fefefd')!).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(prop(s, 'brand-ink-dark')!, '#222723')!).toBeGreaterThanOrEqual(4.5);
		expect(prop(s, 'accent-dim')).toBe('rgba(26, 127, 90, 0.1)');
	});

	it('never sets --accent-ink itself: app.css picks it per theme on [data-brand]', () => {
		expect(brandShellStyle('#1a7f5a')).not.toMatch(/--accent-ink:/);
	});
});
