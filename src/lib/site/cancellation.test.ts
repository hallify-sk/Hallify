import { describe, expect, it } from 'vitest';
import { withinCancelNotice, cancelDeadline } from './cancellation';

const at = (iso: string) => Date.parse(iso);

describe('withinCancelNotice', () => {
	it('allows cancelling any time without a notice period', () => {
		expect(withinCancelNotice('2026-11-05', 0, at('2026-11-04T12:00:00Z'))).toBe(true);
		expect(withinCancelNotice('2026-11-05', null, at('2026-11-04T12:00:00Z'))).toBe(true);
	});

	it('refuses inside the notice period (30 days, event 13 days away)', () => {
		expect(withinCancelNotice('2026-11-05', 30, at('2026-10-23T10:00:00Z'))).toBe(false);
	});

	it('allows it up to and including the deadline day, and not after', () => {
		const deadline = cancelDeadline('2026-11-05', 30)!;
		expect(deadline).toBe('2026-10-06');
		expect(withinCancelNotice('2026-11-05', 30, at('2026-10-06T00:00:00Z'))).toBe(true);
		expect(withinCancelNotice('2026-11-05', 30, at('2026-10-06T23:59:00Z'))).toBe(true);
		expect(withinCancelNotice('2026-11-05', 30, at('2026-10-07T00:00:00Z'))).toBe(false);
	});

	it('has no deadline without a notice period', () => {
		expect(cancelDeadline('2026-11-05', 0)).toBeNull();
	});
});
