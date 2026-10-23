import { describe, it, expect } from 'vitest';
import {
	tidyDomain, isValidCustomDomain, claimExpired, claimExpiresAt, dnsRecordsFor, parseDnsRecords,
	judgeHostname, hostnameProblems, domainState,
} from './custom-domain';

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

describe('Cloudflare status (D9)', () => {
	const pending = {
		status: 'pending',
		ssl: { status: 'pending_validation', validation_records: [{ txt_name: '_acme-challenge.kastiel.sk', txt_value: 'abc' }] },
		ownership_verification: { type: 'txt', name: '_cf-custom-hostname.kastiel.sk', value: 'uuid-1' },
		verification_errors: ['custom hostname does not CNAME to this zone.'],
	};

	it('shows the CNAME and every TXT record Cloudflare asks for', () => {
		expect(dnsRecordsFor('kastiel.sk', 'fallback.hallify.sk', pending)).toEqual([
			{ type: 'CNAME', name: 'kastiel.sk', value: 'fallback.hallify.sk', purpose: 'routing' },
			{ type: 'TXT', name: '_cf-custom-hostname.kastiel.sk', value: 'uuid-1', purpose: 'ownership' },
			{ type: 'TXT', name: '_acme-challenge.kastiel.sk', value: 'abc', purpose: 'certificate' },
		]);
		expect(dnsRecordsFor('kastiel.sk', 'fallback.hallify.sk')).toHaveLength(1);
	});

	it('round-trips stored records and ignores junk', () => {
		const recs = dnsRecordsFor('kastiel.sk', 'fallback.hallify.sk', pending);
		expect(parseDnsRecords(JSON.stringify(recs))).toEqual(recs);
		expect(parseDnsRecords('not json')).toEqual([]);
		expect(parseDnsRecords('{"a":1}')).toEqual([]);
		expect(parseDnsRecords('[{"type":"A","name":"x","value":"y"}]')).toEqual([]);
		expect(parseDnsRecords(null)).toEqual([]);
	});

	it('is live only when both the hostname and its certificate are active', () => {
		expect(judgeHostname({ status: 'active', ssl: { status: 'active' } })).toBe('live');
		expect(judgeHostname({ status: 'active_redeploying', ssl: { status: 'active' } })).toBe('live');
		expect(judgeHostname({ status: 'active', ssl: { status: 'pending_validation' } })).toBe('pending');
		expect(judgeHostname({ status: 'pending', ssl: { status: 'active' } })).toBe('pending');
		expect(judgeHostname(pending)).toBe('pending');
	});

	it('is gone when Cloudflare lost it or the DNS moved away', () => {
		expect(judgeHostname(null)).toBe('gone');
		expect(judgeHostname({ status: 'moved', ssl: { status: 'active' } })).toBe('gone');
		expect(judgeHostname({ status: 'active', ssl: { status: 'expired' } })).toBe('gone');
	});

	it("collects Cloudflare's explanations once", () => {
		expect(hostnameProblems(pending)).toBe('custom hostname does not CNAME to this zone.');
		expect(hostnameProblems({ status: 'pending', verification_errors: ['x', 'x'], ssl: { validation_errors: [{ message: 'y' }] } })).toBe('x · y');
		expect(hostnameProblems({ status: 'active', ssl: { status: 'active' } })).toBeNull();
	});

	it('states: verified, pending, or not configured on this server', () => {
		expect(domainState({ verified_at: '2026-10-01 10:00:00' }, false)).toBe('verified');
		expect(domainState({ verified_at: null }, true)).toBe('pending');
		expect(domainState({ verified_at: null }, false)).toBe('not_configured');
	});

	it('a claim is released a week after it was made', () => {
		expect(claimExpiresAt('2026-10-16 12:00:00')?.toISOString()).toBe('2026-10-23T12:00:00.000Z');
		expect(claimExpiresAt('nonsense')).toBeNull();
	});
});
