// Security notices about a person's own account.

import { sendEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { OPERATOR } from '$lib/legal';
import type { Locale } from '$lib/i18n';
import type { D1Database } from '@cloudflare/workers-types';

const escape = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The notice's subject and HTML, separate from sending so it can be tested. */
export function emailChangedNotice(locale: Locale | null | undefined, newEmail: string): { subject: string; html: string } {
	const p = st(locale).profile;
	const body = escape(p.emailNoticeBody)
		.replace('{new}', `<strong>${escape(newEmail)}</strong>`)
		.replace('{contact}', `<a href="mailto:${escape(OPERATOR.contactEmail)}">${escape(OPERATOR.contactEmail)}</a>`);
	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#202322">
		<h2 style="font-size:19px;font-weight:700;margin:0 0 12px">${escape(p.emailNoticeTitle)}</h2>
		<p style="font-size:14px;line-height:1.6;color:#454a45;margin:0">${body}</p>
		<p style="font-size:12px;color:#878f87;margin:22px 0 0">Hallify</p>
	</div>`;
	return { subject: p.emailNoticeSubject, html };
}

/**
 * Tell the OLD address that the account's sign-in email changed. Whoever changed it
 * already controls the new one; the old one is where the real owner still reads mail
 * if the change was not theirs. Best-effort: the change itself has already been made.
 */
export async function sendEmailChangedNotice(
	db: D1Database,
	locale: Locale | null | undefined,
	oldEmail: string,
	newEmail: string
): Promise<boolean> {
	const { subject, html } = emailChangedNotice(locale, newEmail);
	return sendEmail(db, oldEmail, subject, html, 'emailChanged');
}
