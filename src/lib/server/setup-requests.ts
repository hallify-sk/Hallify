// The "we set Hallify up for you" add-on: asking for it, and changing your mind.
// Shared by the Billing and Help pages, which both offer it.

import { dbFirst, dbRun, wroteRow } from '$lib/db/index';
import { sendEmail } from '$lib/email';
import { OPERATOR } from '$lib/legal';
import { SETUP_SERVICE_PRICE_CENTS } from '$lib/setup-service';
import { st } from '$lib/i18n-server';
import { formatMoney } from '$lib/format';
import { dispatchPlatformEvent } from '$lib/server/platform-webhooks';
import type { OrgContext } from '../../app.d';

type Db = App.Locals['db'];

export interface OpenSetupRequest {
	id: string;
	status: string;
	created_at: string;
	note: string | null;
	price_cents: number;
}

/** Statuses the organisation may still withdraw from; once we are working on it, it
 *  is a conversation with us rather than a button. */
export const SETUP_CANCELLABLE = ['requested', 'contacted'];

const esc = (v: string) => v.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));

/** The organisation's outstanding request, if any. */
export async function openSetupRequest(db: Db, orgId: string): Promise<OpenSetupRequest | null> {
	try {
		return await dbFirst<OpenSetupRequest>(db,
			`SELECT id, status, created_at, note, price_cents FROM setup_requests
			  WHERE org_id = ? AND status NOT IN ('delivered', 'cancelled')
			  ORDER BY created_at DESC LIMIT 1`, orgId);
	} catch {
		return null; // table arrives with migration 0010; absent is "never requested"
	}
}

/** Record a request (one open request per organisation), tell us, and confirm it to
 *  the person who asked. Emails are best-effort: the queue is the source of truth. */
export async function createSetupRequest(locals: App.Locals, org: OrgContext, rawNote: string): Promise<void> {
	const user = locals.user!;
	const note = rawNote.trim().slice(0, 1000);
	if (await openSetupRequest(locals.db, org.id)) return;

	// The price is copied onto the row: changing the list price later must never
	// rewrite what this request was quoted.
	await dbRun(locals.db,
		`INSERT INTO setup_requests (id, org_id, requested_by, note, price_cents) VALUES (?, ?, ?, ?, ?)`,
		crypto.randomUUID(), org.id, user.id, note || null, SETUP_SERVICE_PRICE_CENTS);
	dispatchPlatformEvent(locals.db, 'setup_service.requested', {
		org_id: org.id, requested_by: user.id, price_cents: SETUP_SERVICE_PRICE_CENTS, has_note: !!note,
	});

	try {
		await sendEmail(
			locals.db,
			OPERATOR.contactEmail,
			`Setup service request — ${org.name}`,
			`<p><strong>${esc(org.name)}</strong> asked us to set their account up.</p>
			 <p>Agreed price: €${(SETUP_SERVICE_PRICE_CENTS / 100).toFixed(2)} one-off<br>
			 Requested by: ${esc(`${user.first_name} ${user.last_name}`)} (${esc(user.email)})</p>
			 <p>${note ? esc(note) : 'No additional notes.'}</p>`,
			'setup-request'
		);
	} catch { /* recorded regardless */ }

	try {
		const tx = st(locals.locale).setupService;
		const price = formatMoney(SETUP_SERVICE_PRICE_CENTS, locals.locale);
		await sendEmail(
			locals.db,
			user.email,
			tx.confirmEmailSubject,
			`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#202322">
				<h2 style="font-size:20px;font-weight:800;margin:0 0 12px">${esc(tx.confirmEmailSubject)}</h2>
				<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 12px">${esc(tx.confirmEmailBody(org.name, price))}</p>
				${note ? `<p style="font-size:14px;line-height:1.6;color:#454a45;margin:0 0 12px;padding:10px 14px;border-left:2px solid #dfe2dd"><strong>${esc(tx.pendingNote)}:</strong><br>${esc(note)}</p>` : ''}
				<p style="font-size:12px;color:#878f87;margin:14px 0 0">${esc(tx.confirmEmailCancel)}</p>
			</div>`,
			'setup-request-confirmation'
		);
	} catch { /* best-effort */ }
}

/** Withdraw the open request while we have not started on it. Tells us. */
export async function cancelSetupRequest(locals: App.Locals, org: OrgContext): Promise<boolean> {
	const open = await openSetupRequest(locals.db, org.id);
	if (!open || !SETUP_CANCELLABLE.includes(open.status)) return false;
	const res = await dbRun(locals.db,
		`UPDATE setup_requests SET status = 'cancelled', updated_at = datetime('now')
		  WHERE id = ? AND org_id = ? AND status IN ('requested', 'contacted')`, open.id, org.id);
	if (!wroteRow(res)) return false;
	try {
		const user = locals.user!;
		await sendEmail(
			locals.db,
			OPERATOR.contactEmail,
			`Setup service request cancelled — ${org.name}`,
			`<p><strong>${esc(org.name)}</strong> cancelled their setup request.</p>
			 <p>Cancelled by: ${esc(`${user.first_name} ${user.last_name}`)} (${esc(user.email)})</p>`,
			'setup-request-cancelled'
		);
	} catch { /* best-effort */ }
	return true;
}
