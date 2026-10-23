import { describe, it, expect } from 'vitest';
import { expiryFromDateInput } from './announcements';

describe('expiryFromDateInput', () => {
	it('ends the chosen day', () => {
		expect(expiryFromDateInput('2026-12-31')).toBe('2026-12-31 23:59:59');
	});

	it('is null for empty or invalid input', () => {
		expect(expiryFromDateInput('')).toBeNull();
		expect(expiryFromDateInput(null)).toBeNull();
		expect(expiryFromDateInput('2026-02-30')).toBeNull();
		expect(expiryFromDateInput('31.12.2026')).toBeNull();
		expect(expiryFromDateInput("2026-12-31' OR 1=1")).toBeNull();
	});
});
