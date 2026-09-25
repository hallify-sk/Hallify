import { describe, it, expect, vi } from 'vitest';
import { acceptedTerms, recordLegalAcceptance, ACCEPT_TERMS_FIELD } from './legalAcceptance';
import { LEGAL_UPDATED } from './legal';

function form(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

describe('acceptedTerms', () => {
	it('is true only when the checkbox was ticked', () => {
		expect(acceptedTerms(form({ [ACCEPT_TERMS_FIELD]: 'on' }))).toBe(true);
		expect(acceptedTerms(form({}))).toBe(false);
		expect(acceptedTerms(form({ [ACCEPT_TERMS_FIELD]: '' }))).toBe(false);
	});
});

describe('recordLegalAcceptance', () => {
	it('stores who accepted, where, and which version', async () => {
		const bind = vi.fn(() => ({ run: async () => ({ success: true }) }));
		const prepare = vi.fn(() => ({ bind }));
		await recordLegalAcceptance({ prepare } as never, { userId: 'u_1', orgId: 'o_1', context: 'checkout' });
		expect(prepare.mock.calls[0]).toEqual([expect.stringContaining('INSERT INTO legal_acceptances')]);
		const [, userId, orgId, context, version] = bind.mock.calls[0] as unknown[];
		expect([userId, orgId, context, version]).toEqual(['u_1', 'o_1', 'checkout', LEGAL_UPDATED]);
	});

	// A missing table (migration 0004 not applied yet) must not break signup or checkout.
	it('never throws when the write fails', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const prepare = () => ({ bind: () => ({ run: async () => { throw new Error('no such table: legal_acceptances'); } }) });
		await expect(recordLegalAcceptance({ prepare } as never, { userId: 'u_1', context: 'register' })).resolves.toBeUndefined();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
