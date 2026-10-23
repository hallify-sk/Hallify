import { describe, expect, it } from 'vitest';
import { securityTxt } from './security-txt';
import { OPERATOR } from './legal';

describe('security.txt', () => {
	it('has a contact and an Expires less than a year ahead', () => {
		const now = new Date('2026-10-23T12:00:00Z');
		const body = securityTxt('https://hallify.sk', now);
		expect(body).toContain(`Contact: mailto:${OPERATOR.contactEmail}`);
		const expires = new Date(/Expires: (\S+)/.exec(body)![1]);
		const days = (expires.getTime() - now.getTime()) / 86_400_000;
		expect(days).toBeGreaterThan(300);
		expect(days).toBeLessThan(365);
		expect(body).toContain('Canonical: https://hallify.sk/.well-known/security.txt');
	});
});
