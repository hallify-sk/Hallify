import { describe, expect, it } from 'vitest';
import { isReservedSubdomain } from './reserved-subdomains';

describe('isReservedSubdomain', () => {
	it('keeps mail, media and infrastructure names away from organisations', () => {
		for (const label of ['media', 'company', 'mail', 'mx', 'mx2', 'mx3', 'smtp', 'webmail', 'autodiscover', 'Zoho', 'mcp', 'status'])
			expect(isReservedSubdomain(label)).toBe(true);
	});

	it('leaves venue names and the slugs existing organisations already hold', () => {
		for (const label of ['kastiel-teplicka', 'reduta', 'hallify', 'test']) expect(isReservedSubdomain(label)).toBe(false);
	});
});
