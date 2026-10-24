import { describe, expect, it, vi } from 'vitest';
import {
	acceptedTerms, acceptedDpa, recordLegalAcceptance, recordDpaAcceptance,
	ACCEPT_TERMS_FIELD, ACCEPT_DPA_FIELD
} from './legal-acceptance';
import { LEGAL_UPDATED } from '$lib/legal';

function form(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

describe('acceptedTerms', () => {
	it('is true only when the checkbox was ticked', () => {
		expect(acceptedTerms(form({ [ACCEPT_TERMS_FIELD]: 'on' }))).toBe(true);
		expect(acceptedTerms(form({}))).toBe(false);
		expect(acceptedTerms(form({ [ACCEPT_TERMS_FIELD]: 'yes' }))).toBe(false);
	});
});

describe('recordLegalAcceptance', () => {
	it('stores who accepted, for which venue, where, and which version', async () => {
		const bind = vi.fn(() => ({ run: async () => ({ success: true }) }));
		const prepare = vi.fn(() => ({ bind }));
		await recordLegalAcceptance({ prepare } as never, { userId: 'u_1', orgId: 'o_1', context: 'register' });
		expect(prepare.mock.calls[0]).toEqual([expect.stringContaining('INSERT INTO legal_acceptances')]);
		const [, userId, orgId, context, version] = bind.mock.calls[0] as unknown[];
		expect([userId, orgId, context, version]).toEqual(['u_1', 'o_1', 'register', LEGAL_UPDATED]);
	});

	it('never throws when the write fails, so sign-up still works', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const prepare = () => ({ bind: () => ({ run: async () => { throw new Error('no such table: legal_acceptances'); } }) });
		await expect(recordLegalAcceptance({ prepare } as never, { userId: 'u_1', context: 'register' })).resolves.toBeUndefined();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe('acceptedDpa', () => {
	it('is true only when the DPA checkbox itself was ticked', () => {
		expect(acceptedDpa(form({ [ACCEPT_DPA_FIELD]: 'on' }))).toBe(true);
		expect(acceptedDpa(form({}))).toBe(false);
		// Ticking the Terms box is not accepting the DPA.
		expect(acceptedDpa(form({ [ACCEPT_TERMS_FIELD]: 'on' }))).toBe(false);
	});
});

describe('recordDpaAcceptance', () => {
	it('stores the organisation, who accepted for it, and which version', async () => {
		const bind = vi.fn(() => ({ run: async () => ({ success: true }) }));
		const prepare = vi.fn(() => ({ bind }));
		await recordDpaAcceptance({ prepare } as never, { userId: 'u_1', orgId: 'o_1' });
		expect(prepare.mock.calls[0]).toEqual([expect.stringContaining('INSERT INTO dpa_acceptances')]);
		const [, orgId, userId, version] = bind.mock.calls[0] as unknown[];
		expect([orgId, userId, version]).toEqual(['o_1', 'u_1', LEGAL_UPDATED]);
	});

	it('never throws when the write fails, so the organisation is still created', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const prepare = () => ({ bind: () => ({ run: async () => { throw new Error('no such table: dpa_acceptances'); } }) });
		await expect(recordDpaAcceptance({ prepare } as never, { userId: 'u_1', orgId: 'o_1' })).resolves.toBeUndefined();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
