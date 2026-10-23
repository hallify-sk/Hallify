import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/email', () => ({ sendEmail: vi.fn(async () => true) }));

import { emailChangedNotice, passwordChangedNotice, sendEmailChangedNotice, sendPasswordChangedNotice } from './account-emails';
import { sendEmail } from '$lib/email';

describe('email-changed notice', () => {
	it('names the new address, escaped, in the reader\'s language', () => {
		const sk = emailChangedNotice('sk', '<b>x</b>@evil.sk');
		expect(sk.subject).toContain('zmenený');
		expect(sk.html).toContain('&lt;b&gt;x&lt;/b&gt;@evil.sk');
		expect(sk.html).not.toContain('<b>x</b>');
		expect(sk.html).not.toContain('{new}');
		expect(sk.html).not.toContain('{contact}');
		expect(emailChangedNotice('en', 'a@b.sk').subject).toContain('changed');
	});

	it('goes to the OLD address', async () => {
		await sendEmailChangedNotice({} as never, 'en', 'old@x.sk', 'new@x.sk');
		expect(vi.mocked(sendEmail).mock.calls[0][1]).toBe('old@x.sk');
	});
});

describe('password-changed notice (M4)', () => {
	it('names the account, escaped, in the reader\'s language, with no placeholders left', () => {
		const sk = passwordChangedNotice('sk', '<i>a</i>@b.sk', 'Kaštieľ');
		expect(sk.subject).toContain('zmenené');
		expect(sk.html).toContain('&lt;i&gt;a&lt;/i&gt;@b.sk');
		expect(sk.html).toContain('Kaštieľ');
		expect(sk.html).not.toMatch(/\{account\}|\{contact\}/);
		expect(passwordChangedNotice('en', 'a@b.sk').subject).toContain('changed');
	});

	it('goes to the account itself, under the venue\'s name for a venue client', async () => {
		vi.mocked(sendEmail).mockClear();
		await sendPasswordChangedNotice({} as never, 'sk', 'client@x.sk', 'Kaštieľ');
		const call = vi.mocked(sendEmail).mock.calls[0];
		expect(call[1]).toBe('client@x.sk');
		expect(call[5]).toEqual({ fromName: 'Kaštieľ' });
	});
});
