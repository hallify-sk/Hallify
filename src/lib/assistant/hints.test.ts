import { describe, expect, it } from 'vitest';
import { hintFor } from './hints';
import { sk, en } from '$lib/i18n';

describe('hintFor', () => {
	it('matches the page that is open', () => {
		expect(hintFor('/app/reservation/abc/layout')).toBe('layout');
		expect(hintFor('/app/reservation/abc')).toBe('event');
		expect(hintFor('/app/reservation/abc/manifest')).toBe('event');
		expect(hintFor('/app/reservation/new')).toBe('bookings');
		expect(hintFor('/app/manage/halls/h1/editor')).toBe('floorplan');
		expect(hintFor('/app/manage/halls/h1/templates/t1')).toBe('floorplan');
		expect(hintFor('/app/manage/halls/h1')).toBe('hall');
		expect(hintFor('/app/manage/halls')).toBe('halls');
		expect(hintFor('/app/manage/halls/new')).toBe('general');
		expect(hintFor('/app/manage')).toBe('bookings');
		expect(hintFor('/app/manage/calendar')).toBe('bookings');
		expect(hintFor('/app/manage/messages')).toBe('messages');
		expect(hintFor('/app/manage/settings/site')).toBe('general');
	});

	it('has a sentence for every hint in both languages', () => {
		for (const key of ['layout', 'event', 'floorplan', 'hall', 'halls', 'bookings', 'messages', 'general'] as const) {
			expect(sk.ai.widgetHints[key]).toBeTruthy();
			expect(en.ai.widgetHints[key]).toBeTruthy();
		}
	});
});
