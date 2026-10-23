import { describe, expect, it } from 'vitest';
import { navigationTarget } from './session';

describe('navigationTarget', () => {
	it('takes the last console page the assistant opened', () => {
		expect(navigationTarget([{ type: 'navigate', path: '/app/manage' }, { type: 'navigate', path: '/app/manage/reservations' }]))
			.toBe('/app/manage/reservations');
	});
	it('ignores anything outside the console, and junk', () => {
		expect(navigationTarget([{ type: 'navigate', path: 'https://evil.example/app/' }])).toBeNull();
		expect(navigationTarget([{ type: 'other', path: '/app/manage' }])).toBeNull();
		expect(navigationTarget(undefined)).toBeNull();
	});
});
