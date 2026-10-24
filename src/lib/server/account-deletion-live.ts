// The real side effects of deleting an account (D7): Stripe, closing an organisation
// as Settings → Close does, and the emails. Kept apart from account-deletion.ts so
// that the data rules can be tested without any of them.

import { sendEmail, notifyGuestCancel } from '$lib/email';
import { cancelSubscription } from '$lib/stripe';
import { archiveAndDeleteOrg } from '$lib/orgLifecycle';
import { dispatchWebhooks } from '$lib/notifications';
import { st } from '$lib/i18n-server';
import { escapeHtml, renderLayout } from '$lib/server/email-layout';
import { emailCopy } from '$lib/server/email-copy';
import { logReservationActivity } from '$lib/server/reservation-activity';
import type { DeletionDeps } from '$lib/server/account-deletion';
import type { R2Deleter } from '$lib/server/hall-images';
import type { D1Database } from '@cloudflare/workers-types';

/** The email to the person who became owner when the previous one deleted their account. */
export function newOwnerEmail(locale: string | null | undefined, orgName: string, previousOwner: string, url: string): { subject: string; html: string } {
	const c = st(locale === 'en' ? 'en' : 'sk').identity;
	const subject = c.newOwnerSubject(orgName);
	const html = renderLayout({
		locale: locale === 'en' ? 'en' : 'sk',
		brand: 'Hallify',
		subject,
		bodyHtml: `<p>${escapeHtml(c.newOwnerBody(orgName, previousOwner || '—'))}</p>`,
		cta: { label: c.newOwnerCta, url },
		linkFallback: emailCopy(locale).footer.linkFallback
	});
	return { subject, html };
}

export function liveDeletionDeps(db: D1Database, opts: { origin: string; closedBy: { id: string; email: string }; r2?: R2Deleter | null }): DeletionDeps {
	const origin = opts.origin.replace(/\/$/, '');
	return {
		endSubscription: (id) => cancelSubscription(id),
		async closeOrg(orgId) {
			// strictBilling: a subscription that cannot be cancelled stops the deletion.
			await archiveAndDeleteOrg(db, orgId, {
				closedBy: opts.closedBy.id,
				closedByEmail: opts.closedBy.email,
				reason: 'user_deleted',
				strictBilling: true,
				r2: opts.r2
			});
		},
		async notifyNewOwner(o) {
			const { subject, html } = newOwnerEmail(o.to.locale, o.orgName, o.previousOwner, `${origin}/app/billing`);
			await sendEmail(db, o.to.email, subject, html, 'ownershipTransferred');
		},
		async notifyCancelled(b) {
			await logReservationActivity(db, {
				reservationId: b.id, orgId: b.org_id, actorId: null, actorName: b.guestName, kind: 'status', status: 'cancelled'
			});
			dispatchWebhooks(db, b.org_id, 'reservation.status_changed', {
				reservation_id: b.id, title: b.title, hall_name: b.hall_name, event_date: b.event_date,
				status: 'cancelled', changed_by: 'client'
			}).catch(() => {});
			// Awaited: the account (and with it the client's address used as Reply-To) is
			// anonymised right after this.
			await notifyGuestCancel(db, b.org_id, b.guestName, b.title, b.hall_name, b.event_date, { reservationId: b.id });
		}
	};
}
