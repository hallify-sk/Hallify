import { dbAll, dbFirst, dbRun, fromJson } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { env } from '$env/dynamic/private';
import { inBackground, requestScope } from '$lib/server/background';
import { DEFAULT_TEMPLATES, LEGACY_DEFAULT_TEMPLATES, emailCopy, type EmailLocale, type TemplateKey } from '$lib/server/email-copy';
import { escapeHtml, renderLayout, renderTemplate } from '$lib/server/email-layout';
import { isUserLocale, orgDefaultLocale, recipientLocale, storedLocaleForEmail } from '$lib/server/user-locale';
import { statusLabel } from '$lib/reservationStatus';
import { formatDate, formatMoney } from '$lib/format';
import { st } from '$lib/i18n-server';
import { orgPublicBaseUrl } from '$lib/orgUrl';
import { formatIban, type PaymentView } from '$lib/payment';
import { loadPaymentView } from '$lib/server/payments';
import { feedbackDeadline } from '$lib/feedback';
import { memberEmails } from '$lib/server/reservation-members';

// Email is sent platform-wide via the Brevo transactional HTTP API
// (https://developers.brevo.com/reference/sendtransacemail). Every email goes
// out from a single platform sender (EMAIL_FROM); organizations do not configure
// their own SMTP. Set BREVO_API_KEY as a Worker secret; EMAIL_FROM / EMAIL_FROM_NAME
// are plain vars. If BREVO_API_KEY is missing, sends are skipped and logged failed.
//
// Emails about a venue carry the venue's name as the sender name and a Reply-To
// that reaches a person (the venue's contact address for clients, the client for
// staff), are written in the recipient's language, and use one layout
// ($lib/server/email-layout). Every exported sender is kept alive past the response
// (inBackground), so call sites that fire and forget are not cut off on Workers.
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const FROM_EMAIL = env.EMAIL_FROM || 'noreply@hallify.sk';
const FROM_NAME = env.EMAIL_FROM_NAME || 'Hallify';

/** The four emails addressed to the venue's own staff. Each can be aimed at a
 *  subset of the team from Settings → Advanced. */
export type TeamNotifyEvent = 'newReservation' | 'guestMessage' | 'guestCancel' | 'guestEdit';

export interface EmailNotifyConfig {
	// Notify the org's team
	newReservation: boolean;
	guestMessage: boolean;
	guestCancel: boolean;
	guestEdit: boolean;
	// Notify the guest
	statusChange: boolean;
	newMessage: boolean;
	/** The client's own booking, change or cancellation is confirmed to them. */
	bookingReceipt: boolean;
	/** The client is told when the venue changes their extras, details or table layout. */
	venueChanges: boolean;
	/** The client is reminded a few days before the event. */
	eventReminder: boolean;
	/** Per-event staff recipients, written by Settings → Advanced. `null` or absent
	 *  means "every member of the organisation", so a member invited tomorrow is
	 *  included without anyone revisiting that screen. An explicit list is honoured
	 *  as-is, as long as at least one of its people is still a member. */
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
	bookingReceived?: string;
	bookingConfirmed?: string;
	clientEdited?: string;
	clientCancelled?: string;
	venueChanged?: string;
	eventReminder?: string;
	paymentDetails?: string;
	feedbackRequest?: string;
}

const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES.sk) as TemplateKey[];

// Per-organization notification preferences (set on /app/manage/settings/advanced).
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
		bookingReceipt: true, venueChanges: true, eventReminder: true,
		...(config ?? {}),
	};
}

// ── Templates ───────────────────────────────────────────────────────────────

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

/** True when `value` is one of the shipped defaults for `key` (in any language, or
 *  the old English one). Such a copy was saved by the settings form, not written by
 *  anyone, and must not pin every recipient to that one language. */
export function isDefaultTemplate(key: TemplateKey, value: string): boolean {
	const v = normalise(value);
	return [DEFAULT_TEMPLATES.sk[key], DEFAULT_TEMPLATES.en[key], LEGACY_DEFAULT_TEMPLATES[key]]
		.some((d) => d != null && normalise(d) === v);
}

/** The templates to use for `locale`. A stored template wins only when it says
 *  something: an empty (or whitespace-only) one, or an unchanged default, falls
 *  back to the default in the recipient's language. Before this, clearing a
 *  template sent blank emails. */
export function resolveTemplates(stored: EmailTemplates | null | undefined, locale: EmailLocale = 'sk'): Required<EmailTemplates> {
	const out = { ...DEFAULT_TEMPLATES[locale] } as Required<EmailTemplates>;
	for (const key of TEMPLATE_KEYS) {
		const value = stored?.[key];
		if (typeof value === 'string' && value.trim() !== '' && !isDefaultTemplate(key, value)) {
			out[key] = value;
		}
	}
	return out;
}

async function loadStoredTemplates(db: D1Database): Promise<EmailTemplates | null> {
	try {
		const row = await dbFirst<{ value: string | null }>(db, "SELECT value FROM system_settings WHERE key = 'email_templates'");
		return row ? fromJson<EmailTemplates>(row.value) : null;
	} catch {
		return null;
	}
}

export async function getEmailTemplates(db: D1Database, locale: EmailLocale = 'sk'): Promise<Required<EmailTemplates>> {
	return resolveTemplates(await loadStoredTemplates(db), locale);
}

// ── Sending ─────────────────────────────────────────────────────────────────

async function logEmail(db: D1Database, recipient: string, subject: string, template: string | null, status: 'sent' | 'failed', error?: string) {
	try {
		await dbRun(
			db,
			'INSERT INTO email_log (id, recipient, subject, template, status, error) VALUES (?, ?, ?, ?, ?, ?)',
			crypto.randomUUID(), recipient, subject, template, status, error ?? null
		);
	} catch { /* don't fail on logging errors */ }
}

export interface SendOptions {
	/** Sender display name; the address is always EMAIL_FROM. */
	fromName?: string | null;
	/** Where replies go. Without it, replies reach the no-reply mailbox. */
	replyTo?: string | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A sender name Brevo accepts: one line, no angle brackets or quotes, bounded. */
function cleanName(name: string): string {
	return name.replace(/[\r\n<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
}

export const sendEmail = inBackground(async function sendEmail(
	db: D1Database,
	to: string,
	subject: string,
	html: string,
	templateName?: string,
	opts: SendOptions = {}
): Promise<boolean> {
	const apiKey = env.BREVO_API_KEY;
	if (!apiKey) {
		console.error(`[email] BREVO_API_KEY not set — no email can be sent (to ${to}: ${subject})`);
		await logEmail(db, to, subject, templateName ?? null, 'failed', 'BREVO_API_KEY not configured');
		return false;
	}

	const replyTo = opts.replyTo && EMAIL_RE.test(opts.replyTo) && opts.replyTo !== to ? opts.replyTo : null;
	const fromName = cleanName(opts.fromName || FROM_NAME) || FROM_NAME;

	try {
		const res = await fetch(BREVO_ENDPOINT, {
			method: 'POST',
			headers: {
				'api-key': apiKey,
				'content-type': 'application/json',
				'accept': 'application/json',
			},
			body: JSON.stringify({
				sender: { email: FROM_EMAIL, name: fromName },
				to: [{ email: to }],
				...(replyTo ? { replyTo: { email: replyTo } } : {}),
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
		const message = err instanceof Error ? err.message : String(err);
		if (isConfigError(message)) {
			// Not one bad address: every email is failing until the key is fixed.
			console.error(`[email] OUTAGE — Brevo refused the API key; no email can be sent until BREVO_API_KEY is fixed. ${message}`);
		} else {
			console.error('[email] Failed to send:', err);
		}
		await logEmail(db, to, subject, templateName ?? null, 'failed', message);
		return false;
	}
});

// ── Delivery health ─────────────────────────────────────────────────────────

/** A failure that hits every email rather than one recipient: no key, or Brevo
 *  refusing the key or the sender (401/403). */
export function isConfigError(error: string | null | undefined): boolean {
	if (!error) return false;
	return /BREVO_API_KEY not configured|^Brevo 40[13]\b/.test(error);
}

export interface EmailHealth {
	configured: boolean;
	/** True while email is broken for everyone: no key, or the latest attempt failed
	 *  with a configuration error and nothing has been delivered since. */
	down: boolean;
	lastError: string | null;
	lastFailureAt: string | null;
	lastSuccessAt: string | null;
	/** Failed attempts since the last delivered email. */
	failedSinceSuccess: number;
}

export async function getEmailHealth(db: D1Database): Promise<EmailHealth> {
	const configured = !!env.BREVO_API_KEY;
	let row: { last_sent: string | null; last_failed: string | null; last_error: string | null; failed_since: number | string | null } | null = null;
	try {
		row = await dbFirst(db, `
			SELECT
				(SELECT MAX(created_at) FROM email_log WHERE status = 'sent') AS last_sent,
				(SELECT MAX(created_at) FROM email_log WHERE status = 'failed') AS last_failed,
				(SELECT error FROM email_log WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1) AS last_error,
				(SELECT COUNT(*) FROM email_log WHERE status = 'failed'
				   AND created_at >= COALESCE((SELECT MAX(created_at) FROM email_log WHERE status = 'sent'), '')) AS failed_since`);
	} catch { /* no log table: report what the config says */ }
	const lastSent = row?.last_sent ?? null;
	const lastFailed = row?.last_failed ?? null;
	const failingNow = !!lastFailed && (!lastSent || lastFailed >= lastSent);
	return {
		configured,
		down: !configured || (failingNow && isConfigError(row?.last_error)),
		lastError: row?.last_error ?? null,
		lastFailureAt: lastFailed,
		lastSuccessAt: lastSent,
		failedSinceSuccess: Number(row?.failed_since ?? 0),
	};
}

/** True when no email can currently go out at all. Callers use it to avoid telling
 *  someone "we've sent you an email" during an outage — without revealing anything
 *  about a particular address, since the answer is the same for every address. */
export async function emailServiceDown(db: D1Database): Promise<boolean> {
	try {
		return (await getEmailHealth(db)).down;
	} catch {
		return false;
	}
}

// ── Context: people, venues, reservations, links ────────────────────────────

/** The language the current request is being served in, if any. */
function requestLocale(): EmailLocale | null {
	const l = requestScope()?.locals?.locale;
	return isUserLocale(l) ? l : null;
}

/** Absolute base of the console (staff links). */
function appBase(): string {
	const fromEnv = (env.APP_URL || '').replace(/\/$/, '');
	if (fromEnv) return fromEnv;
	return requestScope()?.url?.origin ?? 'https://hallify.sk';
}

/** Absolute base of a venue's own site (client links). */
async function venueBase(db: D1Database, orgId: string): Promise<string> {
	const reqUrl = requestScope()?.url;
	let probe: URL;
	try { probe = reqUrl ?? new URL(appBase()); } catch { probe = new URL('https://hallify.sk'); }
	try {
		const base = await orgPublicBaseUrl(db, orgId, probe);
		if (base) return base;
	} catch { /* fall through */ }
	return reqUrl?.origin ?? appBase();
}

interface OrgInfo { name: string; contactEmail: string | null }

/** The venue's name and a public contact address (the first hall that lists one). */
async function orgInfo(db: D1Database, orgId: string): Promise<OrgInfo> {
	try {
		const row = await dbFirst<{ name: string; contact_email: string | null }>(db,
			`SELECT o.name,
			        (SELECT h.contact_email FROM halls h
			          WHERE h.org_id = o.id AND h.contact_email IS NOT NULL AND h.contact_email != ''
			          ORDER BY h.archived_at IS NOT NULL, h.created_at LIMIT 1) AS contact_email
			   FROM organizations o WHERE o.id = ?`, orgId);
		if (row) return { name: row.name, contactEmail: row.contact_email };
	} catch {
		try {
			const row = await dbFirst<{ name: string }>(db, 'SELECT name FROM organizations WHERE id = ?', orgId);
			if (row) return { name: row.name, contactEmail: null };
		} catch { /* ignore */ }
	}
	return { name: 'Hallify', contactEmail: null };
}

interface ReservationContext {
	id: string;
	orgId: string;
	title: string;
	eventDate: string;
	startTime: string | null;
	endTime: string | null;
	guests: number | null;
	status: string;
	hallName: string;
	hallEmail: string | null;
	clientId: string | null;
	clientEmail: string | null;
	clientName: string | null;
	clientLocale: EmailLocale | null;
	/** True when the booking belongs to a venue client (not a staff member's own event). */
	clientIsClient: boolean;
}

async function loadReservation(db: D1Database, id: string | null | undefined): Promise<ReservationContext | null> {
	if (!id) return null;
	type Row = {
		id: string; org_id: string; title: string; event_date: string; start_time: string | null; end_time: string | null;
		num_guests: number | null; status: string; hall_name: string; hall_email: string | null;
		client_id: string | null; client_email: string | null; first_name: string | null; last_name: string | null; client_locale?: string | null;
		client_account_type: string | null;
	};
	const sql = (withLocale: boolean) => `
		SELECT r.id, r.org_id, r.title, r.event_date, r.start_time, r.end_time, r.num_guests, r.status,
		       h.name AS hall_name, h.contact_email AS hall_email,
		       u.id AS client_id, u.email AS client_email, u.first_name, u.last_name, u.account_type AS client_account_type
		       ${withLocale ? ', u.locale AS client_locale' : ''}
		  FROM reservations r
		  JOIN halls h ON h.id = r.hall_id
		  LEFT JOIN users u ON u.id = r.user_id
		 WHERE r.id = ?`;
	let row: Row | null = null;
	try {
		row = await dbFirst<Row>(db, sql(true), id);
	} catch {
		try { row = await dbFirst<Row>(db, sql(false), id); } catch { return null; }
	}
	if (!row) return null;
	return {
		id: row.id,
		orgId: row.org_id,
		title: row.title,
		eventDate: row.event_date,
		startTime: row.start_time,
		endTime: row.end_time,
		guests: row.num_guests,
		status: row.status,
		hallName: row.hall_name,
		hallEmail: row.hall_email || null,
		clientId: row.client_id,
		clientEmail: row.client_email,
		clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
		clientLocale: isUserLocale(row.client_locale) ? row.client_locale : null,
		clientIsClient: row.client_account_type === 'client',
	};
}

/** The reservation a message thread belongs to, if any. */
async function ticketReservationId(db: D1Database, ticketId: string | null | undefined): Promise<string | null> {
	if (!ticketId) return null;
	try {
		const row = await dbFirst<{ reservation_id: string | null }>(db, 'SELECT reservation_id FROM tickets WHERE id = ?', ticketId);
		return row?.reservation_id ?? null;
	} catch {
		return null;
	}
}

/** "23. mája 2027" / "23 May 2027" for a stored YYYY-MM-DD; anything else unchanged. */
function eventDate(date: string, locale: EmailLocale): string {
	return /^\d{4}-\d{2}-\d{2}$/.test(date)
		? formatDate(date, locale, { day: 'numeric', month: 'long', year: 'numeric' })
		: date;
}

function timeRange(start: string | null, end: string | null): string | null {
	const s = start?.slice(0, 5);
	const e = end?.slice(0, 5);
	if (s && e) return `${s} – ${e}`;
	return s || null;
}

function reservationDetails(res: ReservationContext, locale: EmailLocale, forStaff: boolean): Array<[string, string | null]> {
	const c = emailCopy(locale).details;
	return [
		[c.event, res.title],
		[c.hall, res.hallName],
		[c.date, eventDate(res.eventDate, locale)],
		[c.time, timeRange(res.startTime, res.endTime)],
		[c.guests, res.guests != null ? String(res.guests) : null],
		...(forStaff
			? [[c.client, res.clientName ? `${res.clientName}${res.clientEmail ? ` (${res.clientEmail})` : ''}` : res.clientEmail] as [string, string | null],
			   [c.status, statusLabel(res.status, locale)] as [string, string | null]]
			: []),
	];
}

const staffReservationUrl = (id: string) => `${appBase()}/app/reservation/${encodeURIComponent(id)}`;
const staffThreadUrl = (ticketId: string) => `${appBase()}/app/manage/messages/${encodeURIComponent(ticketId)}`;

// ── Staff notifications ─────────────────────────────────────────────────────

interface Recipient { email: string; locale: EmailLocale | null }

async function orgMembers(db: D1Database, orgId: string, onlyUserIds?: string[]): Promise<Recipient[]> {
	const filter = onlyUserIds?.length ? ` AND u.id IN (${onlyUserIds.map(() => '?').join(',')})` : '';
	const params = [orgId, ...(onlyUserIds ?? [])];
	const base = (withLocale: boolean) =>
		`SELECT u.email${withLocale ? ', u.locale' : ''} FROM organization_members m JOIN users u ON u.id = m.user_id
		  WHERE m.org_id = ?${filter}`;
	let rows: Array<{ email: string; locale?: string | null }>;
	try {
		rows = await dbAll(db, base(true), ...params);
	} catch {
		rows = await dbAll(db, base(false), ...params);
	}
	const seen = new Set<string>();
	return rows
		.filter((r) => r.email && !seen.has(r.email) && seen.add(r.email))
		.map((r) => ({ email: r.email, locale: isUserLocale(r.locale) ? r.locale : null }));
}

/**
 * Who on the team receives a staff email.
 *
 *   null / undefined → every member of the organisation (owners, admins and members:
 *                      the settings screen calls this "the whole team")
 *   []               → nobody (the event is switched off)
 *   [ids]            → those people, while they are still members. If none of them
 *                      is (the only chosen person was removed from the team), the
 *                      email goes to the whole team rather than to nobody: the venue
 *                      switched this email on, and silently dropping new bookings
 *                      is the worse failure.
 */
export async function staffRecipients(db: D1Database, orgId: string, onlyUserIds?: string[] | null): Promise<Recipient[]> {
	if (Array.isArray(onlyUserIds)) {
		if (onlyUserIds.length === 0) return [];
		const chosen = await orgMembers(db, orgId, onlyUserIds);
		if (chosen.length > 0) return chosen;
		console.warn(`[email] none of the chosen recipients is still in org ${orgId}; notifying the whole team`);
	}
	return orgMembers(db, orgId);
}

type Built = { subject: string; html: string };

async function emailStaff(
	db: D1Database,
	orgId: string,
	templateName: TeamNotifyEvent,
	onlyUserIds: string[] | null | undefined,
	build: (locale: EmailLocale) => Built | Promise<Built>,
	opts: SendOptions = {}
): Promise<void> {
	const recipients = await staffRecipients(db, orgId, onlyUserIds);
	if (!recipients.length) return;
	const fallback = (await orgDefaultLocale(db, orgId)) ?? 'sk';
	const cache = new Map<EmailLocale, Built>();
	for (const r of recipients) {
		const locale = r.locale ?? fallback;
		let built = cache.get(locale);
		if (!built) { built = await build(locale); cache.set(locale, built); }
		await sendEmail(db, r.email, built.subject, built.html, templateName, opts);
	}
}

interface StaffEmailInput {
	key: TeamNotifyEvent;
	orgId: string;
	vars: Record<string, string>;
	/** The raw event date, formatted per recipient. */
	date?: string;
	subject: (c: ReturnType<typeof emailCopy>) => string;
	res: ReservationContext | null;
	link: { url: string; label: (c: ReturnType<typeof emailCopy>) => string } | null;
}

async function notifyStaffAbout(db: D1Database, input: StaffEmailInput) {
	const notify = await getNotifyConfig(db, input.orgId);
	if (!notify[input.key]) return;
	const org = await orgInfo(db, input.orgId);
	const stored = await loadStoredTemplates(db);
	const replyTo = input.res?.clientEmail ?? null;
	await emailStaff(db, input.orgId, input.key, notify.recipients?.[input.key] ?? null, (locale) => {
		const c = emailCopy(locale);
		const subject = input.subject(c);
		const vars = { ...input.vars, ...(input.date != null ? { date: eventDate(input.date, locale) } : {}) };
		const html = renderLayout({
			locale,
			brand: org.name,
			subject,
			bodyHtml: renderTemplate(resolveTemplates(stored, locale)[input.key], vars),
			details: input.res ? reservationDetails(input.res, locale, true) : [],
			cta: input.link ? { label: input.link.label(c), url: input.link.url } : null,
			linkFallback: c.footer.linkFallback,
			footer: [replyTo ? c.footer.replyToClient(replyTo) : '', c.footer.staffSettings],
		});
		return { subject, html };
	}, { replyTo });
}

export interface NotifyExtra {
	/** The booking concerned: adds its details, a link to it, and the client as Reply-To. */
	reservationId?: string | null;
	/** The message thread concerned. */
	ticketId?: string | null;
}

// New reservation → email the organization's team.
export const notifyNewReservation = inBackground(async function notifyNewReservation(
	db: D1Database, orgId: string, title: string, userName: string, hallName: string, date: string, extra: NotifyExtra = {}
): Promise<void> {
	const res = await loadReservation(db, extra.reservationId);
	await notifyStaffAbout(db, {
		key: 'newReservation', orgId, res,
		vars: { title, userName, hallName }, date: res?.eventDate ?? date,
		subject: (c) => c.subject.newReservation(title),
		link: res ? { url: staffReservationUrl(res.id), label: (c) => c.cta.openReservation } : null,
	});
});

// Guest sent a message → email the organization's team, with the message itself.
export const notifyGuestMessage = inBackground(async function notifyGuestMessage(
	db: D1Database, orgId: string, senderName: string, subject: string, message: string, extra: NotifyExtra = {}
): Promise<void> {
	const res = await loadReservation(db, extra.reservationId ?? await ticketReservationId(db, extra.ticketId));
	const url = extra.ticketId ? staffThreadUrl(extra.ticketId) : res ? staffReservationUrl(res.id) : null;
	await notifyStaffAbout(db, {
		key: 'guestMessage', orgId, res,
		vars: { senderName, subject, message },
		subject: (c) => c.subject.guestMessage(subject),
		link: url ? { url, label: (c) => c.cta.openConversation } : null,
	});
});

// Guest cancelled a booking → email the organization's team.
export const notifyGuestCancel = inBackground(async function notifyGuestCancel(
	db: D1Database, orgId: string, guestName: string, title: string, hallName: string, date: string, extra: NotifyExtra = {}
): Promise<void> {
	const res = await loadReservation(db, extra.reservationId);
	await notifyStaffAbout(db, {
		key: 'guestCancel', orgId, res,
		vars: { guestName, title, hallName }, date,
		subject: (c) => c.subject.guestCancel(title),
		link: res ? { url: staffReservationUrl(res.id), label: (c) => c.cta.openReservation } : null,
	});
});

/** One field a client changed on their booking. */
export interface ReservationChange {
	field: 'title' | 'date' | 'startTime' | 'endTime' | 'guests' | 'description' | 'extras' | 'layout';
	from: string | null;
	to: string | null;
	/** Extras: what the selection before and after comes to, shown in the reader's currency format. */
	fromCents?: number | null;
	toCents?: number | null;
}

export interface ReservationSnapshot {
	title?: string | null;
	event_date?: string | null;
	start_time?: string | null;
	end_time?: string | null;
	num_guests?: number | null;
	description?: string | null;
}

/** What differs between two versions of a booking, for the "changed by the client"
 *  email (it used to say only that something changed). */
export function reservationChanges(before: ReservationSnapshot, after: ReservationSnapshot): ReservationChange[] {
	const norm = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());
	const pairs: Array<[ReservationChange['field'], unknown, unknown]> = [
		['title', before.title, after.title],
		['date', before.event_date, after.event_date],
		['startTime', before.start_time?.slice(0, 5), after.start_time?.slice(0, 5)],
		['endTime', before.end_time?.slice(0, 5), after.end_time?.slice(0, 5)],
		['guests', before.num_guests, after.num_guests],
		['description', before.description, after.description],
	];
	return pairs
		.filter(([, a, b]) => norm(a) !== norm(b))
		.map(([field, a, b]) => ({ field, from: norm(a), to: norm(b) }));
}

/** The changes as plain-text lines in `locale` ("Dátum: 12. mája 2027 → 13. mája 2027"). */
export function describeChanges(changes: ReservationChange[] | null | undefined, locale: EmailLocale): string {
	const c = emailCopy(locale).changes;
	if (!changes?.length) return c.unknown;
	const show = (field: ReservationChange['field'], v: string | null, cents?: number | null) => {
		if (field === 'extras') {
			const names = v ?? c.empty;
			return cents != null && cents > 0 ? `${names} (${formatMoney(cents, locale)})` : names;
		}
		if (v == null) return c.empty;
		if (field === 'date') return eventDate(v, locale);
		if (field === 'description') return v.length > 200 ? `${v.slice(0, 199)}…` : v;
		return v;
	};
	return changes.map((ch) => {
		// A replaced table layout has no "before → after" worth printing.
		if (ch.field === 'layout') return ch.to ? c.layoutTemplate(ch.to) : c.layoutReset;
		return `${c[ch.field]}: ${show(ch.field, ch.from, ch.fromCents)} → ${show(ch.field, ch.to, ch.toCents)}`;
	}).join('\n');
}

// Guest edited a booking → email the organization's team, saying what changed.
export const notifyGuestEdit = inBackground(async function notifyGuestEdit(
	db: D1Database, orgId: string, guestName: string, title: string, hallName: string, date: string,
	extra: NotifyExtra & { changes?: ReservationChange[] } = {}
): Promise<void> {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.guestEdit) return;
	const res = await loadReservation(db, extra.reservationId);
	// `changes` depends on the recipient's language, so it is filled per locale.
	const org = await orgInfo(db, orgId);
	const stored = await loadStoredTemplates(db);
	const replyTo = res?.clientEmail ?? null;
	await emailStaff(db, orgId, 'guestEdit', notify.recipients?.guestEdit ?? null, (locale) => {
		const c = emailCopy(locale);
		const subject = c.subject.guestEdit(title);
		const html = renderLayout({
			locale,
			brand: org.name,
			subject,
			bodyHtml: renderTemplate(resolveTemplates(stored, locale).guestEdit, {
				guestName, title, hallName, date: eventDate(date, locale), changes: describeChanges(extra.changes, locale),
			}),
			details: res ? reservationDetails(res, locale, true) : [],
			cta: res ? { label: c.cta.openReservation, url: staffReservationUrl(res.id) } : null,
			linkFallback: c.footer.linkFallback,
			footer: [replyTo ? c.footer.replyToClient(replyTo) : '', c.footer.staffSettings],
		});
		return { subject, html };
	}, { replyTo });
});

// ── Client notifications ────────────────────────────────────────────────────

interface ClientEmailInput {
	orgId: string;
	to: string;
	templateName: string;
	res: ReservationContext | null;
	build: (c: ReturnType<typeof emailCopy>, locale: EmailLocale, tpl: Required<EmailTemplates>) => {
		subject: string; bodyHtml: string; note?: { label: string; text: string } | null;
		/** Rows after the booking's own (the price and payment details). */
		details?: Array<[string, string | null]>;
		/** Lines above the standard footer. */
		footer?: string[];
	};
	link: { url: string; label: (c: ReturnType<typeof emailCopy>) => string } | null;
}

async function emailClient(db: D1Database, input: ClientEmailInput): Promise<boolean> {
	const org = await orgInfo(db, input.orgId);
	const locale: EmailLocale =
		(input.res && input.res.clientEmail === input.to ? input.res.clientLocale : null)
		?? (await recipientLocale(db, input.to, input.orgId));
	const c = emailCopy(locale);
	const tpl = resolveTemplates(await loadStoredTemplates(db), locale);
	const built = input.build(c, locale, tpl);
	// Replies reach the venue: the hall's own contact address, else the venue's.
	const replyTo = input.res?.hallEmail ?? org.contactEmail;
	const html = renderLayout({
		locale,
		brand: org.name,
		subject: built.subject,
		bodyHtml: built.bodyHtml,
		details: [...(input.res ? reservationDetails(input.res, locale, false) : []), ...(built.details ?? [])],
		note: built.note ?? null,
		cta: input.link ? { label: input.link.label(c), url: input.link.url } : null,
		linkFallback: c.footer.linkFallback,
		footer: [...(built.footer ?? []), replyTo ? c.footer.replyToVenue(org.name) : c.footer.noReplyClient, c.footer.sentBy(org.name)],
	});
	return sendEmail(db, input.to, built.subject, html, input.templateName, { fromName: c.via(org.name), replyTo });
}

/** The same email to the booking's owner and to everyone it is shared with (0038),
 *  each in their own language. Says whether the owner's copy went out. */
async function emailClientAndMembers(db: D1Database, input: ClientEmailInput): Promise<boolean> {
	const sent = await emailClient(db, input);
	if (input.res) {
		for (const to of await memberEmails(db, input.res.id, input.to)) await emailClient(db, { ...input, to });
	}
	return sent;
}

/** The booking's price and payment details as email rows (D6), in the reader's
 *  language. Empty when nothing is stated. */
export function paymentRows(p: PaymentView | null, locale: EmailLocale): Array<[string, string | null]> {
	if (!p || !p.hasAny) return [];
	const c = emailCopy(locale).payment;
	const money = (cents: number | null) => (cents == null ? null : formatMoney(cents, locale));
	const state = p.state === 'paid' ? c.paid : p.state === 'deposit_paid' ? c.depositReceived : null;
	return [
		[c.price, money(p.priceCents)],
		[c.deposit, money(p.depositCents)],
		[c.depositDue, p.depositCents != null && p.depositDueDate ? eventDate(p.depositDueDate, locale) : null],
		[c.state, state],
		[c.balance, p.state === 'deposit_paid' ? money(p.balanceCents) : null],
		[c.recipient, p.state === 'paid' ? null : p.recipient],
		[c.iban, p.state === 'paid' || !p.iban ? null : formatIban(p.iban)],
		[c.bic, p.state === 'paid' ? null : p.bic],
		[c.variableSymbol, p.state === 'paid' ? null : p.variableSymbol],
		[c.note, p.state === 'paid' ? null : p.note],
	];
}

async function clientReservationUrl(db: D1Database, orgId: string, reservationId: string): Promise<string> {
	return `${await venueBase(db, orgId)}/halls/my-reservations/${encodeURIComponent(reservationId)}`;
}

// Reservation status change → email the guest who made the booking, in their language,
// with what the new status means for them and the venue's note if there was one.
export const notifyStatusChange = inBackground(async function notifyStatusChange(
	db: D1Database, orgId: string, userEmail: string, title: string, newStatus: string,
	extra: NotifyExtra & { message?: string | null } = {}
): Promise<void> {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.statusChange) return;
	const res = await loadReservation(db, extra.reservationId);
	// The price and how to pay it travel with every status email (D6); a cancelled
	// booking has nothing left to pay.
	const payment = res && newStatus !== 'cancelled' ? await loadPaymentView(db, orgId, res.id) : null;
	const showPayment = !!payment?.hasAny;
	const org = showPayment ? await orgInfo(db, orgId) : null;
	// The owner, and everyone the event is shared with (0038).
	for (const to of [userEmail, ...(res ? await memberEmails(db, res.id, userEmail) : [])]) await emailClient(db, {
		orgId, to, templateName: 'statusChange', res,
		build: (c, locale, tpl) => {
			const status = statusLabel(newStatus, locale);
			const statusInfo = newStatus === 'waiting_payment' && payment?.hasInstructions
				? c.payment.waitingInfo
				: c.statusInfo[newStatus] ?? '';
			return {
				subject: c.subject.statusChange(title, status),
				bodyHtml: renderTemplate(tpl.statusChange, { title, status, statusInfo }),
				note: extra.message ? { label: c.noteFromVenue, text: extra.message } : null,
				details: showPayment ? paymentRows(payment, locale) : [],
				footer: showPayment && org ? [c.payment.disclaimer(org.name)] : [],
			};
		},
		link: res ? { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.viewBooking } : null,
	});
});

// The venue cancelled a booking with a note (closing a hall) → email the guest.
// One email carrying the note rather than a status mail plus a "new message" mail.
// It is a status change, so it honours the org's statusChange switch. renderTemplate
// escapes every value (the note is free text typed by staff).
export const notifyHallCancellation = inBackground(async function notifyHallCancellation(
	db: D1Database,
	orgId: string,
	userEmail: string,
	vars: { title: string; hallName: string; date: string; message: string },
	extra: NotifyExtra = {}
): Promise<void> {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.statusChange) return;
	const res = await loadReservation(db, extra.reservationId);
	for (const to of [userEmail, ...(res ? await memberEmails(db, res.id, userEmail) : [])]) await emailClient(db, {
		orgId, to, templateName: 'hallCancellation', res,
		build: (c, locale, tpl) => ({
			subject: c.subject.hallCancellation(vars.title),
			bodyHtml: renderTemplate(tpl.hallCancellation, {
				title: vars.title, hallName: vars.hallName, message: vars.message,
				date: res ? eventDate(res.eventDate, locale) : eventDate(vars.date, locale),
			}),
		}),
		link: res ? { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.reply } : null,
	});
});

// New message in a ticket thread → email the client, with the message itself.
export const notifyNewMessage = inBackground(async function notifyNewMessage(
	db: D1Database, orgId: string, recipientEmail: string, ticketSubject: string, senderName: string,
	extra: NotifyExtra & { message?: string | null } = {}
): Promise<void> {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.newMessage) return;
	const res = await loadReservation(db, extra.reservationId ?? await ticketReservationId(db, extra.ticketId));
	const url = res
		? await clientReservationUrl(db, orgId, res.id)
		: `${await venueBase(db, orgId)}/halls/messages`;
	await emailClient(db, {
		orgId, to: recipientEmail, templateName: 'newMessage', res,
		build: (c, _locale, tpl) => ({
			subject: c.subject.newMessage(ticketSubject),
			bodyHtml: renderTemplate(tpl.newMessage, { subject: ticketSubject, senderName, message: extra.message ?? '' }),
		}),
		link: { url, label: (c) => (res ? c.cta.reply : c.cta.viewMessages) },
	});
});

// The client's own booking → a receipt: "we have your request" while the venue
// decides, "confirmed" when the hall approves bookings automatically (the client
// used to hear nothing until a member of staff changed the status).
export const notifyBookingReceived = inBackground(async function notifyBookingReceived(
	db: D1Database, orgId: string, reservationId: string
): Promise<boolean> {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.bookingReceipt) return false;
	const res = await loadReservation(db, reservationId);
	if (!res?.clientEmail || !res.clientIsClient) return false;
	const confirmed = res.status === 'approved' || res.status === 'planned';
	return emailClient(db, {
		orgId, to: res.clientEmail, templateName: confirmed ? 'bookingConfirmed' : 'bookingReceived', res,
		build: (c, locale, tpl) => ({
			subject: confirmed ? c.subject.bookingConfirmed(res.title) : c.subject.bookingReceived(res.title),
			bodyHtml: renderTemplate(confirmed ? tpl.bookingConfirmed : tpl.bookingReceived, {
				title: res.title, hallName: res.hallName, date: eventDate(res.eventDate, locale),
				statusInfo: c.statusInfo[res.status] ?? '',
			}),
		}),
		link: { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.viewBooking },
	});
});

// The client changed or cancelled their own booking → confirm it to them, with what
// changed. The venue's staff get their own email (notifyGuestEdit / notifyGuestCancel).
export const notifyClientEdited = inBackground(async function notifyClientEdited(
	db: D1Database, orgId: string, reservationId: string, changes: ReservationChange[]
): Promise<boolean> {
	if (!changes.length) return false;
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.bookingReceipt) return false;
	const res = await loadReservation(db, reservationId);
	if (!res?.clientEmail || !res.clientIsClient) return false;
	return emailClient(db, {
		orgId, to: res.clientEmail, templateName: 'clientEdited', res,
		build: (c, locale, tpl) => ({
			subject: c.subject.clientEdited(res.title),
			bodyHtml: renderTemplate(tpl.clientEdited, { title: res.title, changes: describeChanges(changes, locale) }),
		}),
		link: { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.viewBooking },
	});
});

export const notifyClientCancelled = inBackground(async function notifyClientCancelled(
	db: D1Database, orgId: string, reservationId: string
): Promise<boolean> {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.bookingReceipt) return false;
	const res = await loadReservation(db, reservationId);
	if (!res?.clientEmail || !res.clientIsClient) return false;
	return emailClient(db, {
		orgId, to: res.clientEmail, templateName: 'clientCancelled', res,
		build: (c, locale, tpl) => ({
			subject: c.subject.clientCancelled(res.title),
			bodyHtml: renderTemplate(tpl.clientCancelled, { title: res.title, hallName: res.hallName, date: eventDate(res.eventDate, locale) }),
		}),
		link: { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.viewBooking },
	});
});

// The venue changed a client's booking (extras, date, time, guests, notes, or replaced
// the table layout the client may have arranged) → tell the client what changed.
// These used to change silently: only status changes reached the client.
export const notifyVenueChange = inBackground(async function notifyVenueChange(
	db: D1Database, orgId: string, reservationId: string, changes: ReservationChange[]
): Promise<boolean> {
	if (!changes.length) return false;
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.venueChanges) return false;
	const res = await loadReservation(db, reservationId);
	if (!res?.clientEmail || !res.clientIsClient) return false;
	if (res.status === 'cancelled' || res.status === 'completed') return false;
	return emailClientAndMembers(db, {
		orgId, to: res.clientEmail, templateName: 'venueChanged', res,
		build: (c, locale, tpl) => ({
			subject: c.subject.venueChanged(res.title),
			bodyHtml: renderTemplate(tpl.venueChanged, { title: res.title, changes: describeChanges(changes, locale) }),
		}),
		link: { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.viewBooking },
	});
});

// Staff send the booking's price and payment details to the client (D6), from the
// reservation page. Explicitly asked for, so no notification switch applies.
export const notifyPaymentDetails = inBackground(async function notifyPaymentDetails(
	db: D1Database, orgId: string, reservationId: string
): Promise<boolean> {
	const res = await loadReservation(db, reservationId);
	if (!res?.clientEmail || !res.clientIsClient) return false;
	const payment = await loadPaymentView(db, orgId, reservationId);
	if (!payment?.hasAny) return false;
	const org = await orgInfo(db, orgId);
	return emailClientAndMembers(db, {
		orgId, to: res.clientEmail, templateName: 'paymentDetails', res,
		build: (c, locale, tpl) => ({
			subject: c.subject.paymentDetails(res.title),
			bodyHtml: renderTemplate(tpl.paymentDetails, { title: res.title, hallName: res.hallName, date: eventDate(res.eventDate, locale) }),
			details: paymentRows(payment, locale),
			footer: [c.payment.disclaimer(org.name)],
		}),
		link: { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.viewBooking },
	});
});

// The event is over and its hall asks for feedback → invite the client to rate it, once
// (src/lib/server/feedback.ts picks the bookings and claims each before sending).
// The hall's own "ask for feedback" switch is the setting; there is no second one.
export const notifyFeedbackRequest = inBackground(async function notifyFeedbackRequest(
	db: D1Database, orgId: string, reservationId: string
): Promise<boolean> {
	const res = await loadReservation(db, reservationId);
	if (!res?.clientEmail || !res.clientIsClient || res.status !== 'completed') return false;
	const requestedAt = new Date().toISOString().slice(0, 10);
	return emailClient(db, {
		orgId, to: res.clientEmail, templateName: 'feedbackRequest', res,
		build: (c, locale, tpl) => ({
			subject: c.subject.feedbackRequest(res.title),
			bodyHtml: renderTemplate(tpl.feedbackRequest, {
				title: res.title, hallName: res.hallName, date: eventDate(res.eventDate, locale),
				deadline: eventDate(feedbackDeadline(res.eventDate, requestedAt), locale),
			}),
		}),
		link: { url: `${await clientReservationUrl(db, orgId, res.id)}#feedback`, label: (c) => c.cta.rateEvent },
	});
});

// A few days before the event → remind the client (src/lib/server/reminders.ts picks
// the bookings and makes sure each is reminded once).
export const notifyEventReminder = inBackground(async function notifyEventReminder(
	db: D1Database, orgId: string, reservationId: string
): Promise<boolean> {
	const notify = await getNotifyConfig(db, orgId);
	if (!notify.eventReminder) return false;
	const res = await loadReservation(db, reservationId);
	if (!res?.clientEmail || !res.clientIsClient) return false;
	return emailClientAndMembers(db, {
		orgId, to: res.clientEmail, templateName: 'eventReminder', res,
		build: (c, locale, tpl) => ({
			subject: c.subject.eventReminder(res.title, eventDate(res.eventDate, locale)),
			bodyHtml: renderTemplate(tpl.eventReminder, { title: res.title, hallName: res.hallName, date: eventDate(res.eventDate, locale) }),
		}),
		link: { url: await clientReservationUrl(db, orgId, res.id), label: (c) => c.cta.viewBooking },
	});
});

// ── Account emails ──────────────────────────────────────────────────────────

/** The reset email, in the language of the page it was requested from. On a venue
 *  site it carries the venue's name. */
export const sendPasswordResetEmail = inBackground(async function sendPasswordResetEmail(
	db: D1Database, to: string, resetUrl: string, locale?: EmailLocale
): Promise<boolean> {
	const scope = requestScope();
	const venue = scope?.locals?.domainOrg ?? null;
	const lang: EmailLocale = locale ?? requestLocale() ?? (await recipientLocale(db, to, venue?.id ?? null));
	const c = emailCopy(lang);
	const templates = await getEmailTemplates(db, lang);
	const brand = venue?.name ?? 'Hallify';
	const html = renderLayout({
		locale: lang,
		brand,
		subject: c.subject.passwordReset,
		bodyHtml: renderTemplate(templates.passwordReset, { resetUrl }),
		cta: { label: c.cta.resetPassword, url: resetUrl },
		footer: [c.footer.automatic],
	});
	const subject = venue ? `${c.subject.passwordReset} – ${venue.name}` : `Hallify – ${c.subject.passwordReset}`;
	return sendEmail(db, to, subject, html, 'passwordReset', venue ? { fromName: c.via(venue.name) } : {});
});

export const sendTestEmail = inBackground(async function sendTestEmail(
	db: D1Database, to: string
): Promise<{ ok: boolean; error?: string }> {
	const locale = requestLocale() ?? 'sk';
	const c = emailCopy(locale);
	const templates = await getEmailTemplates(db, locale);
	const html = renderLayout({ locale, brand: 'Hallify', subject: c.subject.testEmail, bodyHtml: renderTemplate(templates.testEmail, {}), footer: [c.footer.automatic] });
	const ok = await sendEmail(db, to, c.subject.testEmail, html, 'testEmail');
	if (ok) return { ok: true };
	const health = await getEmailHealth(db);
	return {
		ok: false,
		error: health.lastError
			? `${health.lastError} — ${st(locale).platformMisc.testEmailCheckBrevo}`
			: st(locale).platformMisc.testEmailCheckBrevo,
	};
});

// Platform announcement → email every owner/admin of the targeted orgs, each in
// their own language (the announcement text itself is as the admin wrote it).
export const sendAnnouncementEmail = inBackground(async function sendAnnouncementEmail(
	db: D1Database,
	orgIds: string[],
	opts: { level: string; title: string; body: string }
): Promise<{ delivered: number; failed: number }> {
	// Counted, so the platform page reports what really went out instead of
	// "sent by email" when every send failed.
	const result = { delivered: 0, failed: 0 };
	if (!orgIds.length) return result;
	const accent = ({ info: '#a6225e', success: '#2f7a52', warning: '#955f10', error: '#c3362c' } as Record<string, string>)[opts.level] ?? '#a6225e';
	const build = (locale: EmailLocale) => {
		const c = emailCopy(locale);
		const subject = c.subject.announcement(opts.title);
		const bodyHtml = `<div style="border-left:4px solid ${accent};padding-left:14px;margin:0 0 16px">
<h2>${escapeHtml(opts.title)}</h2>
<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:${accent};font-weight:700">${escapeHtml(c.announcement.level[opts.level] ?? opts.level)}</div>
</div>
<blockquote style="border-left:0;background:none;padding:0">${escapeHtml(opts.body)}</blockquote>
<p>${escapeHtml(c.announcement.signOff)}</p>`;
		return { subject, html: renderLayout({ locale, brand: 'Hallify', subject, bodyHtml, cta: { label: 'Hallify', url: appBase() + '/app' }, footer: [c.footer.automatic] }) };
	};
	// De-dupe recipients across orgs (an owner of two targeted orgs gets one email).
	const seen = new Set<string>();
	for (const orgId of orgIds) {
		let recipients: Array<{ email: string; locale?: string | null }>;
		const sql = (withLocale: boolean) => `SELECT u.email${withLocale ? ', u.locale' : ''} FROM organization_members m JOIN users u ON u.id = m.user_id
			 WHERE m.org_id = ? AND m.role IN ('owner', 'admin')`;
		try { recipients = await dbAll(db, sql(true), orgId); } catch { recipients = await dbAll(db, sql(false), orgId); }
		const fallback = (await orgDefaultLocale(db, orgId)) ?? 'sk';
		for (const r of recipients) {
			if (!r.email || seen.has(r.email)) continue;
			seen.add(r.email);
			const { subject, html } = build(isUserLocale(r.locale) ? r.locale : fallback);
			if (await sendEmail(db, r.email, subject, html, 'announcement')) result.delivered++;
			else result.failed++;
		}
	}
	return result;
});

// Organization invite → email the invited address with the accept link, in the
// invitee's language when they already have an account, else the inviter's.
export const sendOrgInviteEmail = inBackground(async function sendOrgInviteEmail(
	db: D1Database,
	to: string,
	opts: { orgName: string; inviterName: string; role: string; inviteUrl: string },
	locale?: EmailLocale
): Promise<boolean> {
	const lang: EmailLocale = locale ?? (await storedLocaleForEmail(db, to)) ?? requestLocale() ?? 'sk';
	const c = emailCopy(lang);
	const role = c.orgInvite.roles[opts.role] ?? opts.role;
	const subject = c.subject.orgInvite(opts.orgName);
	const bodyHtml = `<h2>${escapeHtml(c.orgInvite.heading(opts.orgName))}</h2>
<p>${c.orgInvite.intro(escapeHtml(opts.inviterName || c.orgInvite.someone), escapeHtml(opts.orgName), escapeHtml(role))}</p>
<p>${escapeHtml(c.orgInvite.body)}</p>`;
	const html = renderLayout({
		locale: lang,
		brand: opts.orgName,
		subject,
		bodyHtml,
		cta: { label: c.cta.acceptInvite, url: opts.inviteUrl },
		linkFallback: c.footer.linkFallback,
		footer: [c.orgInvite.expires, c.footer.automatic],
	});
	return sendEmail(db, to, subject, html, 'orgInvite', { fromName: c.via(opts.orgName) });
});

const esc = escapeHtml;

// Reservation event invite → email a person who doesn't have a client account yet,
// with a link to set a password and become the event's owner. Localized to the
// organization's preferred language.
export const sendReservationInviteEmail = inBackground(async function sendReservationInviteEmail(
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
			expires: 'This invitation expires in 14 days.',
		}
		: {
			subject: `${opts.orgName}: máte pozvánku na správu udalosti`,
			heading: `Boli ste pozvaní spravovať udalosť`,
			intro: `${esc(opts.inviterName)} z organizácie <strong>${esc(opts.orgName)}</strong> pre vás pripravil(a) udalosť a pozýva vás spravovať ju.`,
			event: 'Udalosť', hall: 'Sála', date: 'Dátum',
			cta: 'Vytvoriť účet',
			body: `Kliknutím nižšie si vytvoríte účet — vaše meno aj e-mail sú už vyplnené, stačí si zvoliť heslo. Následne sa stanete vlastníkom tejto udalosti.`,
			expires: 'Platnosť pozvánky je 14 dní.',
		};
	const c = emailCopy(locale);
	const html = renderLayout({
		locale,
		brand: opts.orgName,
		subject: tx.subject,
		bodyHtml: `<h2>${tx.heading}</h2>\n<p>${tx.intro}</p>\n<p>${tx.body}</p>`,
		details: [[tx.event, opts.eventTitle], [tx.hall, opts.hallName], [tx.date, opts.date]],
		cta: { label: tx.cta, url: opts.inviteUrl },
		linkFallback: c.footer.linkFallback,
		footer: [tx.expires, c.footer.sentBy(opts.orgName)],
	});
	return sendEmail(db, to, tx.subject, html, 'reservationInvite', { fromName: c.via(opts.orgName) });
});

// Existing client was added to an org-created event → notify them with a link to it.
export const notifyEventAssigned = inBackground(async function notifyEventAssigned(
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
	const c = emailCopy(locale);
	const html = renderLayout({
		locale,
		brand: opts.orgName,
		subject: tx.subject,
		bodyHtml: `<h2>${tx.heading}</h2>\n<p>${tx.intro}</p>`,
		details: [[tx.event, opts.eventTitle], [tx.hall, opts.hallName], [tx.date, opts.date]],
		cta: { label: tx.cta, url: opts.eventUrl },
		linkFallback: c.footer.linkFallback,
		footer: [c.footer.sentBy(opts.orgName)],
	});
	return sendEmail(db, to, tx.subject, html, 'eventAssigned', { fromName: c.via(opts.orgName) });
});

// An event was shared with someone (0038): an invitation to accept on the venue's
// site, or — when the venue's staff added an existing client — a note that it is now
// in their reservations. In the recipient's language when known.
export const sendReservationShareEmail = inBackground(async function sendReservationShareEmail(
	db: D1Database,
	to: string,
	opts: { orgId: string; reservationId: string; inviterName: string; url: string; mode: 'invite' | 'added' },
	locale?: EmailLocale
): Promise<boolean> {
	const res = await loadReservation(db, opts.reservationId);
	const org = await orgInfo(db, opts.orgId);
	const lang: EmailLocale = locale ?? (await recipientLocale(db, to, opts.orgId));
	const invite = opts.mode === 'invite';
	const who = esc(opts.inviterName || org.name);
	const title = res?.title ?? '';
	const tx = lang === 'en'
		? {
			subject: invite ? `${org.name}: ${opts.inviterName || org.name} shared an event with you` : `${org.name}: an event was shared with you`,
			heading: invite ? 'An event was shared with you' : 'You can now see this event',
			intro: invite
				? `${who} invited you to the event <strong>${esc(title)}</strong> at <strong>${esc(org.name)}</strong>. You will see its details, the seating and the messages with the venue.`
				: `<strong>${esc(org.name)}</strong> added you to the event <strong>${esc(title)}</strong>. You will find it in your reservations on the venue's site.`,
			body: invite ? 'Accept with the button below. Sign in, or create an account, with this email address.' : '',
			cta: invite ? 'Accept the invitation' : 'View the event',
			expires: invite ? 'The link works once and expires in 30 days.' : '',
		}
		: {
			subject: invite ? `${org.name}: ${opts.inviterName || org.name} s vami zdieľa udalosť` : `${org.name}: zdieľali s vami udalosť`,
			heading: invite ? 'Niekto s vami zdieľa udalosť' : 'Túto udalosť teraz vidíte aj vy',
			intro: invite
				? `${who} vás pozýva k udalosti <strong>${esc(title)}</strong> v <strong>${esc(org.name)}</strong>. Uvidíte jej podrobnosti, zasadací poriadok aj správy s prevádzkou.`
				: `<strong>${esc(org.name)}</strong> vás pridal(a) k udalosti <strong>${esc(title)}</strong>. Nájdete ju vo svojich rezerváciách na stránke prevádzky.`,
			body: invite ? 'Pozvánku prijmete tlačidlom nižšie. Prihláste sa alebo si vytvorte účet s touto e-mailovou adresou.' : '',
			cta: invite ? 'Prijať pozvánku' : 'Zobraziť udalosť',
			expires: invite ? 'Odkaz funguje raz a platí 30 dní.' : '',
		};
	const c = emailCopy(lang);
	const html = renderLayout({
		locale: lang,
		brand: org.name,
		subject: tx.subject,
		bodyHtml: `<h2>${tx.heading}</h2>\n<p>${tx.intro}</p>${tx.body ? `\n<p>${tx.body}</p>` : ''}`,
		details: res ? reservationDetails(res, lang, false) : [],
		cta: { label: tx.cta, url: opts.url },
		linkFallback: c.footer.linkFallback,
		footer: [tx.expires, c.footer.sentBy(org.name)].filter(Boolean),
	});
	return sendEmail(db, to, tx.subject, html, invite ? 'reservationShareInvite' : 'reservationShared', { fromName: c.via(org.name), replyTo: res?.hallEmail ?? org.contactEmail });
});
