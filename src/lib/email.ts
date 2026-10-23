import { dbAll, dbFirst, dbRun, fromJson } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { env } from '$env/dynamic/private';

// Email is sent platform-wide via the Brevo transactional HTTP API
// (https://developers.brevo.com/reference/sendtransacemail). Every email goes
// out from a single platform sender (EMAIL_FROM); organizations do not configure
// their own SMTP. Set BREVO_API_KEY as a Worker secret; EMAIL_FROM / EMAIL_FROM_NAME
// are plain vars. If BREVO_API_KEY is missing, sends are skipped and logged failed.
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const FROM_EMAIL = env.EMAIL_FROM || 'noreply@hallify.sk';
const FROM_NAME = env.EMAIL_FROM_NAME || 'Hallify';

/** The four emails addressed to the venue's own staff. Each can be aimed at a
 *  subset of the team from Settings → Advanced. */
export type TeamNotifyEvent = 'newReservation' | 'guestMessage' | 'guestCancel' | 'guestEdit';

export interface EmailNotifyConfig {
	// Notify the org's owners/admins
	newReservation: boolean;
	guestMessage: boolean;
	guestCancel: boolean;
	guestEdit: boolean;
	// Notify the guest
	statusChange: boolean;
	newMessage: boolean;
	/** Per-event staff recipients, written by Settings → Advanced. `null` or absent
	 *  means "every owner and admin", so a member invited tomorrow is included
	 *  without anyone revisiting that screen. An explicit list is honoured as-is. */
	recipients?: Partial<Record<TeamNotifyEvent, string[] | null>>;
}

export interface EmailTemplates {
	newReservation?: string;
	guestMessage?: string;
	guestCancel?: string;
	guestEdit?: string;
	statusChange?: string;
	hallCancellation?: string;
	newMessage?: string;
	passwordReset?: string;
	testEmail?: string;
}

export const DEFAULT_TEMPLATES: Required<EmailTemplates> = {
	newReservation: `<h2>New Reservation</h2>
<p><b>{{userName}}</b> created a new reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
	guestMessage: `<h2>New message from a guest</h2>
<p><b>{{senderName}}</b> sent a message about <b>{{subject}}</b>:</p>
<blockquote>{{message}}</blockquote>`,
	guestCancel: `<h2>Booking cancelled by a guest</h2>
<p><b>{{guestName}}</b> cancelled their booking <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
	guestEdit: `<h2>Booking changed by a guest</h2>
<p><b>{{guestName}}</b> updated their booking <b>{{title}}</b> at <b>{{hallName}}</b> (date: <b>{{date}}</b>).</p>`,
	statusChange: `<h2>Reservation Status Updated</h2>
<p>Your reservation <b>{{title}}</b> has been updated to: <b>{{status}}</b>.</p>`,
	hallCancellation: `<h2>Your reservation has been cancelled</h2>
<p>Your reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b> has been cancelled by the venue.</p>
<blockquote style="white-space:pre-wrap">{{message}}</blockquote>
<p>You can reply to the venue from your reservation in Hallify.</p>`,
	newMessage: `<h2>New Message</h2>
<p><b>{{senderName}}</b> sent a message in ticket <b>{{subject}}</b>.</p>`,
	passwordReset: `<h2>Password Reset</h2>
<p>You requested a password reset. Click the link below to set a new password:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>`,
	testEmail: `<h2>Hallify email test</h2>
<p>If you can read this, email sending is working correctly.</p>`,
};

// Per-organization notification preferences (set on /app/manage/settings/email).
export async function getNotifyConfig(db: D1Database, orgId: string): Promise<EmailNotifyConfig> {
	const row = await dbFirst<{ value: string | null }>(
		db,
		"SELECT value FROM org_settings WHERE org_id = ? AND key = 'email_notifications'",
		orgId
	);
	const config = row ? fromJson<EmailNotifyConfig>(row.value) : null;
	// Default ON: transactional notifications are expected unless an org opts out.
	return {
		newReservation: true, guestMessage: true, guestCancel: true, guestEdit: true,
		statusChange: true, newMessage: true,
		...(config ?? {}),
	};
}

export async function getEmailTemplates(db: D1Database): Promise<Required<EmailTemplates>> {
	const row = await dbFirst<{ value: string | null }>(
		db,
		"SELECT value FROM system_settings WHERE key = 'email_templates'"
	);
	const templates = row ? fromJson<EmailTemplates>(row.value) : null;
	return { ...DEFAULT_TEMPLATES, ...templates };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function logEmail(db: D1Database, recipient: string, subject: string, template: string | null, status: 'sent' | 'failed', error?: string) {
	try {
		await dbRun(
			db,
			'INSERT INTO email_log (id, recipient, subject, template, status, error) VALUES (?, ?, ?, ?, ?, ?)',
			crypto.randomUUID(), recipient, subject, template, status, error ?? null
		);
	} catch { /* don't fail on logging errors */ }
}

export async function sendEmail(db: D1Database, to: string, subject: string, html: string, templateName?: string): Promise<boolean> {
	const apiKey = env.BREVO_API_KEY;
	if (!apiKey) {
		console.warn(`[email] BREVO_API_KEY not set — skipping send to ${to}: ${subject}`);
		await logEmail(db, to, subject, templateName ?? null, 'failed', 'BREVO_API_KEY not configured');
		return false;
	}

	try {
		const res = await fetch(BREVO_ENDPOINT, {
			method: 'POST',
			headers: {
				'api-key': apiKey,
				'content-type': 'application/json',
				'accept': 'application/json',
			},
			body: JSON.stringify({
				sender: { email: FROM_EMAIL, name: FROM_NAME },
				to: [{ email: to }],
				subject,
				htmlContent: html,
			}),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Brevo ${res.status}: ${body}`);
		}

		await logEmail(db, to, subject, templateName ?? null, 'sent');
		return true;
	} catch (err) {
		console.error('[email] Failed to send:', err);
		await logEmail(db, to, subject, templateName ?? null, 'failed', err instanceof Error ? err.message : String(err));
		return false;
	}
}

export async function sendTestEmail(db: D1Database, to: string): Promise<{ ok: boolean; error?: string }> {
	const templates = await getEmailTemplates(db);
	const ok = await sendEmail(db, to, 'Hallify – Test Email', templates.testEmail, 'testEmail');
	return ok ? { ok: true } : { ok: false, error: 'Check the BREVO_API_KEY secret and that hallify.sk is an authenticated sender in Brevo.' };
}

// Send an email to the owners/admins of an organization.
//
// `onlyUserIds` is the per-event recipient list saved in Settings → Advanced:
//   null / undefined → every owner and admin (the default)
//   []               → nobody (the event is switched off)
//   [ids]            → those members, still filtered to current owners/admins, so a
//                      stale id or a demoted member never receives staff mail.
async function emailOrgStaff(
	db: D1Database,
	orgId: string,
	subject: string,
	html: string,
	templateName: string,
	onlyUserIds?: string[] | null
) {
	const scoped = Array.isArray(onlyUserIds);
	if (scoped && onlyUserIds!.length === 0) return;

	const recipients = scoped
		? await dbAll<{ email: string }>(db,
			`SELECT u.email FROM organization_members m JOIN users u ON u.id = m.user_id
			 WHERE m.org_id = ? AND m.role IN ('owner', 'admin')
			   AND u.id IN (${onlyUserIds!.map(() => '?').join(',')})`,
			orgId, ...onlyUserIds!
		)
		: await dbAll<{ email: string }>(db,
			`SELECT u.email FROM organization_members m JOIN users u ON u.id = m.user_id
			 WHERE m.org_id = ? AND m.role IN ('owner', 'admin')`,
			orgId
		);

	for (const r of recipients) {
		await sendEmail(db, r.email, subject, html, templateName);
	}
}

// New reservation → email the organization's owners and admins.
export async function notifyNewReservation(db: D1Database, orgId: string, title: string, userName: string, hallName: string, date: string) {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.newReservation) return;
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.newReservation, { title, userName, hallName, date });
	await emailOrgStaff(db, orgId, `New reservation: ${title}`, html, 'newReservation', notify.recipients?.newReservation ?? null);
}

// Guest sent a message → email the organization's owners and admins.
export async function notifyGuestMessage(db: D1Database, orgId: string, senderName: string, subject: string, message: string) {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.guestMessage) return;
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.guestMessage, { senderName, subject, message });
	await emailOrgStaff(db, orgId, `New message: ${subject}`, html, 'guestMessage', notify.recipients?.guestMessage ?? null);
}

// Guest cancelled a booking → email the organization's owners and admins.
export async function notifyGuestCancel(db: D1Database, orgId: string, guestName: string, title: string, hallName: string, date: string) {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.guestCancel) return;
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.guestCancel, { guestName, title, hallName, date });
	await emailOrgStaff(db, orgId, `Booking cancelled: ${title}`, html, 'guestCancel', notify.recipients?.guestCancel ?? null);
}

// Guest edited a booking → email the organization's owners and admins.
export async function notifyGuestEdit(db: D1Database, orgId: string, guestName: string, title: string, hallName: string, date: string) {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.guestEdit) return;
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.guestEdit, { guestName, title, hallName, date });
	await emailOrgStaff(db, orgId, `Booking updated: ${title}`, html, 'guestEdit', notify.recipients?.guestEdit ?? null);
}

// Reservation status change → email the guest who made the booking.
export async function notifyStatusChange(db: D1Database, orgId: string, userEmail: string, title: string, newStatus: string) {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.statusChange) return;
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.statusChange, { title, status: newStatus });
	await sendEmail(db, userEmail, `Reservation update: ${title}`, html, 'statusChange');
}

// The venue cancelled a booking with a note (closing a hall) → email the guest.
// One email carrying the note rather than a status mail plus a "new message" mail.
// It is a status change, so it honours the org's statusChange switch. Every value is
// escaped here: the note is free text typed by staff and renderTemplate escapes nothing.
export async function notifyHallCancellation(
	db: D1Database,
	orgId: string,
	userEmail: string,
	vars: { title: string; hallName: string; date: string; message: string }
) {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.statusChange) return;
	const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.hallCancellation, {
		title: esc(vars.title), hallName: esc(vars.hallName), date: esc(vars.date), message: esc(vars.message),
	});
	await sendEmail(db, userEmail, `Reservation cancelled: ${vars.title}`, html, 'hallCancellation');
}

// New message in a ticket thread → email the recipient.
export async function notifyNewMessage(db: D1Database, orgId: string, recipientEmail: string, ticketSubject: string, senderName: string) {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.newMessage) return;
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.newMessage, { subject: ticketSubject, senderName });
	await sendEmail(db, recipientEmail, `New message: ${ticketSubject}`, html, 'newMessage');
}

export async function sendPasswordResetEmail(db: D1Database, to: string, resetUrl: string): Promise<boolean> {
	const templates = await getEmailTemplates(db);
	const html = renderTemplate(templates.passwordReset, { resetUrl });
	return sendEmail(db, to, 'Hallify – Password Reset', html, 'passwordReset');
}

// Platform announcement → email every owner/admin of the targeted orgs.
export async function sendAnnouncementEmail(
	db: D1Database,
	orgIds: string[],
	opts: { level: string; title: string; body: string }
): Promise<{ delivered: number; failed: number }> {
	// Counted, so the platform page reports what really went out instead of
	// "sent by email" when every send failed.
	const result = { delivered: 0, failed: 0 };
	if (!orgIds.length) return result;
	const safe = (s: string) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
	const accent = ({ info: '#a6225e', success: '#2f7a52', warning: '#955f10', error: '#c3362c' } as Record<string, string>)[opts.level] ?? '#a6225e';
	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#202322">
		<div style="border-left:4px solid ${accent};padding-left:14px;margin-bottom:16px">
			<h2 style="font-size:19px;font-weight:800;margin:0 0 6px">${safe(opts.title)}</h2>
			<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:${accent};font-weight:700">${safe(opts.level)}</div>
		</div>
		<p style="font-size:14px;line-height:1.6;color:#454a45;white-space:pre-wrap;margin:0">${safe(opts.body)}</p>
		<p style="font-size:12px;color:#878f87;margin:22px 0 0">— The Hallify team</p>
	</div>`;
	// De-dupe recipients across orgs (an owner of two targeted orgs gets one email).
	const seen = new Set<string>();
	for (const orgId of orgIds) {
		const recipients = await dbAll<{ email: string }>(db,
			`SELECT u.email FROM organization_members m JOIN users u ON u.id = m.user_id
			 WHERE m.org_id = ? AND m.role IN ('owner', 'admin')`, orgId);
		for (const r of recipients) {
			if (!r.email || seen.has(r.email)) continue;
			seen.add(r.email);
			if (await sendEmail(db, r.email, `Hallify announcement: ${opts.title}`, html, 'announcement')) result.delivered++;
			else result.failed++;
		}
	}
	return result;
}

// Organization invite → email the invited address with the accept link.
export async function sendOrgInviteEmail(
	db: D1Database,
	to: string,
	opts: { orgName: string; inviterName: string; role: string; inviteUrl: string }
): Promise<boolean> {
	const safe = (s: string) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#202322">
		<h2 style="font-size:20px;font-weight:800;margin:0 0 12px">You've been invited to ${safe(opts.orgName)}</h2>
		<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 8px">
			${safe(opts.inviterName)} invited you to join <strong>${safe(opts.orgName)}</strong> on Hallify as a <strong>${safe(opts.role)}</strong>.
		</p>
		<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 20px">
			Click below to accept. If you don't have an account yet, you'll be able to create one.
		</p>
		<a href="${opts.inviteUrl}" style="display:inline-block;background:#f05ca1;color:#27131c;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:12px">
			Accept invitation
		</a>
		<p style="font-size:12px;color:#878f87;margin:22px 0 0">
			Or paste this link into your browser:<br><span style="word-break:break-all">${opts.inviteUrl}</span>
		</p>
		<p style="font-size:12px;color:#878f87;margin:14px 0 0">This invitation expires in 7 days.</p>
	</div>`;
	return sendEmail(db, to, `You've been invited to ${opts.orgName} on Hallify`, html, 'orgInvite');
}

const esc = (s: string) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

// Reservation event invite → email a person who doesn't have a client account yet,
// with a link to set a password and become the event's owner. Localized to the
// organization's preferred language.
export async function sendReservationInviteEmail(
	db: D1Database,
	to: string,
	opts: { firstName: string; orgName: string; inviterName: string; eventTitle: string; hallName: string; date: string; inviteUrl: string },
	locale: 'sk' | 'en' = 'sk'
): Promise<boolean> {
	const tx = locale === 'en'
		? {
			subject: `${opts.orgName}: you've been invited to manage an event`,
			heading: `You've been invited to manage an event`,
			intro: `${esc(opts.inviterName)} from <strong>${esc(opts.orgName)}</strong> has set up an event for you and invited you to manage it.`,
			event: 'Event', hall: 'Hall', date: 'Date',
			cta: 'Create my account',
			body: `Click below to create your account — your name and email are already filled in, so you only need to choose a password. You'll then become the owner of this event.`,
			or: 'Or paste this link into your browser:',
			expires: 'This invitation expires in 14 days.',
		}
		: {
			subject: `${opts.orgName}: máte pozvánku na správu udalosti`,
			heading: `Boli ste pozvaní spravovať udalosť`,
			intro: `${esc(opts.inviterName)} z organizácie <strong>${esc(opts.orgName)}</strong> pre vás pripravil(a) udalosť a pozýva vás spravovať ju.`,
			event: 'Udalosť', hall: 'Sála', date: 'Dátum',
			cta: 'Vytvoriť účet',
			body: `Kliknutím nižšie si vytvoríte účet — vaše meno aj e-mail sú už vyplnené, stačí si zvoliť heslo. Následne sa stanete vlastníkom tejto udalosti.`,
			or: 'Alebo skopírujte tento odkaz do prehliadača:',
			expires: 'Platnosť pozvánky je 14 dní.',
		};

	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#202322">
		<h2 style="font-size:20px;font-weight:800;margin:0 0 12px">${tx.heading}</h2>
		<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 16px">${tx.intro}</p>
		<div style="background:#f9f9f7;border:1px solid #dfe2dd;border-radius:10px;padding:14px 16px;margin:0 0 18px;font-size:14px;color:#454a45">
			<div style="margin:0 0 4px"><strong>${tx.event}:</strong> ${esc(opts.eventTitle)}</div>
			<div style="margin:0 0 4px"><strong>${tx.hall}:</strong> ${esc(opts.hallName)}</div>
			<div><strong>${tx.date}:</strong> ${esc(opts.date)}</div>
		</div>
		<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 20px">${tx.body}</p>
		<a href="${opts.inviteUrl}" style="display:inline-block;background:#f05ca1;color:#27131c;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:12px">
			${tx.cta}
		</a>
		<p style="font-size:12px;color:#878f87;margin:22px 0 0">
			${tx.or}<br><span style="word-break:break-all">${opts.inviteUrl}</span>
		</p>
		<p style="font-size:12px;color:#878f87;margin:14px 0 0">${tx.expires}</p>
	</div>`;
	return sendEmail(db, to, tx.subject, html, 'reservationInvite');
}

// Existing client was added to an org-created event → notify them with a link to it.
export async function notifyEventAssigned(
	db: D1Database,
	to: string,
	opts: { orgName: string; eventTitle: string; hallName: string; date: string; eventUrl: string },
	locale: 'sk' | 'en' = 'sk'
): Promise<boolean> {
	const tx = locale === 'en'
		? {
			subject: `${opts.orgName}: you've been added to an event`,
			heading: `You've been added to an event`,
			intro: `<strong>${esc(opts.orgName)}</strong> has added you to an event. You can view and manage it from your reservations.`,
			event: 'Event', hall: 'Hall', date: 'Date',
			cta: 'View the event',
		}
		: {
			subject: `${opts.orgName}: boli ste pridaní k udalosti`,
			heading: `Boli ste pridaní k udalosti`,
			intro: `Organizácia <strong>${esc(opts.orgName)}</strong> vás pridala k udalosti. Môžete ju zobraziť a spravovať vo svojich rezerváciách.`,
			event: 'Udalosť', hall: 'Sála', date: 'Dátum',
			cta: 'Zobraziť udalosť',
		};

	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#202322">
		<h2 style="font-size:20px;font-weight:800;margin:0 0 12px">${tx.heading}</h2>
		<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 16px">${tx.intro}</p>
		<div style="background:#f9f9f7;border:1px solid #dfe2dd;border-radius:10px;padding:14px 16px;margin:0 0 18px;font-size:14px;color:#454a45">
			<div style="margin:0 0 4px"><strong>${tx.event}:</strong> ${esc(opts.eventTitle)}</div>
			<div style="margin:0 0 4px"><strong>${tx.hall}:</strong> ${esc(opts.hallName)}</div>
			<div><strong>${tx.date}:</strong> ${esc(opts.date)}</div>
		</div>
		<a href="${opts.eventUrl}" style="display:inline-block;background:#f05ca1;color:#27131c;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:12px">
			${tx.cta}
		</a>
	</div>`;
	return sendEmail(db, to, tx.subject, html, 'eventAssigned');
}
