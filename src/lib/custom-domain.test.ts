import { describe, it, expect } from 'vitest';
import { tidyDomain, isValidCustomDomain, claimExpired } from './custom-domain';

describe('tidyDomain', () => {
	it('strips scheme, path, port and trailing dot', () => {
		expect(tidyDomain(' https://Rezervacie.Kastiel.sk/sala?x=1 ')).toBe('rezervacie.kastiel.sk');
		expect(tidyDomain('kastiel.sk.')).toBe('kastiel.sk');
		expect(tidyDomain('kastiel.sk:8080')).toBe('kastiel.sk');
	});
});

describe('isValidCustomDomain', () => {
	it('accepts ordinary hostnames', () => {
		expect(isValidCustomDomain('kastiel.sk')).toBe(true);
		expect(isValidCustomDomain('rezervacie.kastiel-mosovce.sk')).toBe(true);
		expect(isValidCustomDomain('xn--katiel-xya.sk')).toBe(true);
	});

	it('rejects what DNS cannot resolve', () => {
		expect(isValidCustomDomain('-bad-.sk')).toBe(false);
		expect(isValidCustomDomain('a..b.sk')).toBe(false);
		expect(isValidCustomDomain('bad-.sk')).toBe(false);
		expect(isValidCustomDomain('localhost')).toBe(false);
		expect(isValidCustomDomain('10.0.0.1')).toBe(false);
		expect(isValidCustomDomain(`${'a'.repeat(64)}.sk`)).toBe(false);
		expect(isValidCustomDomain('kastiel.s')).toBe(false);
		expect(isValidCustomDomain('kas tiel.sk')).toBe(false);
	});
});

describe('claimExpired', () => {
	const now = new Date('2026-10-23T12:00:00Z');
	it('expires unverified claims after a week', () => {
		expect(claimExpired('2026-10-10 12:00:00', now)).toBe(true);
		expect(claimExpired('2026-10-20 12:00:00', now)).toBe(false);
		expect(claimExpired('nonsense', now)).toBe(false);
	});
});
