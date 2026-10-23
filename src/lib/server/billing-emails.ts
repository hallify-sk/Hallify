// Telling an organisation's owners when its subscription stops paying for itself.
//
// A failed renewal, a suspension or the end of a subscription changes what a venue
// can do (halls beyond the plan go private), and none of it used to be announced.

import { env } from '$env/dynamic/private';
import { dbAll, dbFirst } from '$lib/db/index';
import { sendEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { planName } from '$lib/billing';
import type { SubStatus } from '$lib/billing';
import type { PlanLimitChange } from '$lib/limits';

type Db = App.Locals['db'];

export type BillingNotice = 'payment_failed' | 'suspended' | 'ended';

interface Before { plan: string; status: string; stripe_plan: string | null }
interface After { plan: string; status: SubStatus; stripePlan: string | null }

/** Which notice, if any, a change of subscription state deserves. Pure, for tests. */
export function noticeFor(before: Before | null, after: After): BillingNotice | null {
	if (!before) return null; // a brand-new subscription: nothing was lost
	const hadPaid = (before.stripe_plan ?? before.plan) !== 'free';
	if (!hadPaid || before.status === after.status) return null;
	if (after.status === 'past_due') return 'payment_failed';
	if (after.status === 'paused' && before.status !== 'cancelled') return 'suspended';
	if (after.status === 'cancelled') return 'ended';
	return null;
}

const esc = (s: string) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));

async function orgLocale(db: Db, orgId: string): Promise<'sk' | 'en'> {
	try {
		const row = await dbFirst<{ value: string }>(db, "SELECT value FROM org_settings WHERE org_id = ? AND key = 'locale'", orgId);
		const lang = row?.value ? (JSON.parse(row.value) as { default?: unknown }).default : null;
		return lang === 'en' ? 'en' : 'sk';
	} catch {
		return 'sk';
	}
}

export function billingNoticeEmail(
	locale: 'sk' | 'en',
	kind: BillingNotice,
	opts: { orgName: string; plan: string; lockedHalls: string[]; billingUrl: string }
): { subject: string; html: string } {
	const tx = st(locale).accountPages.billingEmail;
	const body = kind === 'payment_failed' ? tx.paymentFailedBody : kind === 'suspended' ? tx.suspendedBody : tx.endedBody;
	const subject = kind === 'payment_failed' ? tx.paymentFailedSubject : kind === 'suspended' ? tx.suspendedSubject : tx.endedSubject;
	const halls = opts.lockedHalls.length
		? `<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 8px">${esc(tx.lockedHalls)}</p>
		<ul style="font-size:14px;line-height:1.6;color:#454a45;margin:0 0 16px;padding-left:20px">${opts.lockedHalls.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
		: '';
	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#202322">
		<h2 style="font-size:20px;font-weight:800;margin:0 0 12px">${esc(subject)}</h2>
		<p style="font-size:14px;line-height:1.6;color:#5d635d;margin:0 0 16px">${esc(body(opts.plan, opts.orgName))}</p>
		${halls}
		<a href="${esc(opts.billingUrl)}" style="display:inline-block;background:#f05ca1;color:#27131c;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:12px">
			${esc(tx.cta)}
		</a>
	</div>`;
	return { subject, html };
}

/** Email every owner of the organisation about a change that cost it something. */
export async function notifyBillingChange(
	db: Db,
	change: { orgId: string; before: Before | null | undefined; after: After; halls: PlanLimitChange }
): Promise<BillingNotice | null> {
	const kind = noticeFor(change.before ?? null, change.after);
	if (!kind) return null;
	const org = await dbFirst<{ name: string }>(db, 'SELECT name FROM organizations WHERE id = ?', change.orgId);
	const owners = await dbAll<{ email: string }>(db,
		`SELECT u.email FROM organization_members m JOIN users u ON u.id = m.user_id
		  WHERE m.org_id = ? AND m.role = 'owner'`, change.orgId);
	if (!org || owners.length === 0) return kind;
	const locale = await orgLocale(db, change.orgId);
	const { subject, html } = billingNoticeEmail(locale, kind, {
		orgName: org.name,
		plan: planName(change.after.stripePlan ?? change.before?.stripe_plan ?? change.before?.plan),
		lockedHalls: change.halls.locked.map((h) => h.name),
		billingUrl: `${env.APP_URL ?? ''}/app/billing`,
	});
	for (const o of owners) await sendEmail(db, o.email, subject, html, `billing-${kind}`);
	return kind;
}
