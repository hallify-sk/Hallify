import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/email', () => ({ sendEmail: vi.fn(async () => true) }));

import { emailChangedNotice, sendEmailChangedNotice } from './account-emails';
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
