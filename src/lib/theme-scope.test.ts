import { describe, it, expect } from 'vitest';
import { usesPersonalTheme } from './theme-scope';

describe('usesPersonalTheme', () => {
	it('applies in the console', () => {
		for (const p of ['/app', '/app/', '/app/manage', '/app/manage/halls/1/editor', '/app/login', '/app/messages']) {
			expect(usesPersonalTheme(p)).toBe(true);
		}
	});

	it('never applies on the public surfaces', () => {
		for (const p of ['/', '/halls', '/halls/sala/book', '/login', '/forgot-password', '/rsvp/abc', '/priestory', '/terms', '/application']) {
			expect(usesPersonalTheme(p)).toBe(false);
		}
	});

	it('leaves the site builder preview light, since it shows the public site', () => {
		expect(usesPersonalTheme('/app/manage/settings/site/preview')).toBe(false);
	});
});
