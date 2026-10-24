// Applying Stripe's view of a subscription or a payment to our database.
//
// Used by the webhook and by the pages Stripe redirects back to (which apply the
// state they fetch so an owner sees the result even if the webhook is late). Every
// path here is safe to run twice and safe to run out of order.

import type Stripe from 'stripe';
import { dbFirst, dbRun } from '$lib/db/index';
import { enforcePlanLimits } from '$lib/limits';
import type { PlanLimitChange } from '$lib/limits';
import { TERMINAL_STRIPE_STATUSES, isEntitled, resolveStripePlan, toStatus } from '$lib/billing';
import type { SubStatus } from '$lib/billing';
import type { PlanId } from '$lib/plans';
import { grantPurchase } from '$lib/server/ai/credits';
import { creditsForCents } from '$lib/ai-credits';
import { notifyBillingChange } from '$lib/server/billing-emails';
import { classifyPlanChange, dispatchPlatformEvent } from '$lib/server/platform-webhooks';

type Db = App.Locals['db'];

/** The columns of our subscriptions row this module reads. */
export interface StoredSubscription {
	plan: string;
	status: string;
	stripe_subscription_id: string | null;
	stripe_status: string | null;
	stripe_plan: string | null;
	stripe_event_at: number | null;
}

export type SkipReason = 'no_org' | 'unknown_org' | 'stale' | 'ended' | 'other_subscription' | 'unknown_plan';

export interface SyncResult {
	applied: boolean;
	reason?: SkipReason;
	orgId?: string;
	before?: StoredSubscription | null;
	after?: { plan: PlanId; status: SubStatus; stripePlan: PlanId | null };
	halls?: PlanLimitChange;
}

const isTerminal = (s: string | null | undefined) => (TERMINAL_STRIPE_STATUSES as readonly string[]).includes(s ?? '');

/**
 * Whether a subscription state stamped `at` may replace what we hold. Stripe does not
 * deliver events in order and retries old ones, so:
 *  - anything older than the newest state applied is stale;
 *  - a subscription that has ended (canceled, incomplete_expired) never comes back,
 *    so a later-arriving non-final state for it is ignored;
 *  - a subscription other than the one on file may not take a paid plan away: when an
 *    organisation pays for a newer subscription, the end of an older one is history.
 */
export function skipReason(
	existing: StoredSubscription | null,
	incoming: { subscriptionId: string; stripeStatus: string; at: number }
): SkipReason | null {
	if (!existing) return null;
	if (existing.stripe_event_at != null && incoming.at < existing.stripe_event_at) return 'stale';
	if (existing.stripe_subscription_id === incoming.subscriptionId) {
		const ended = isTerminal(existing.stripe_status) || (existing.stripe_status == null && existing.status === 'cancelled');
		if (ended && !isTerminal(incoming.stripeStatus)) return 'ended';
		return null;
	}
	if (
		existing.stripe_subscription_id &&
		existing.plan !== 'free' &&
		isEntitled(existing.status) &&
		!isEntitled(toStatus(incoming.stripeStatus))
	) {
		return 'other_subscription';
	}
	return null;
}

/** The current period end, wherever this API version keeps it (subscription or item). */
function periodEndOf(sub: Stripe.Subscription): string | null {
	const s = sub as unknown as { current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } };
	const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
	return end ? new Date(end * 1000).toISOString() : null;
}

/**
 * Store a subscription's state for its organisation and apply the plan's hall limits.
 * `at` is when the state was true (the event's `created`, or now for a fresh fetch).
 */
export async function applySubscription(db: Db, sub: Stripe.Subscription, at: number): Promise<SyncResult> {
	const orgId = sub.metadata?.orgId;
	if (!orgId) return { applied: false, reason: 'no_org' };
	// An organisation deleted since (or a test event): nothing to update. Answering 200
	// stops Stripe retrying for days; the foreign key used to turn this into a 500.
	const org = await dbFirst<{ id: string }>(db, 'SELECT id FROM organizations WHERE id = ?', orgId);
	if (!org) return { applied: false, reason: 'unknown_org', orgId };

	const existing = await dbFirst<StoredSubscription>(db,
		`SELECT plan, status, stripe_subscription_id, stripe_status, stripe_plan, stripe_event_at
		   FROM subscriptions WHERE org_id = ?`, orgId);
	const reason = skipReason(existing, { subscriptionId: sub.id, stripeStatus: sub.status, at });
	if (reason) return { applied: false, reason, orgId, before: existing };

	const status = toStatus(sub.status);
	const amount = sub.items?.data?.[0]?.price?.unit_amount ?? null;
	const known = existing?.stripe_subscription_id === sub.id ? (existing.stripe_plan ?? existing.plan) : null;
	const stripePlan = resolveStripePlan(amount, sub.metadata?.plan, known);
	// A price we cannot map and no usable metadata: leave the plan alone. Dropping a
	// paying organisation to Free (and suspending its halls) on a guess is worse.
	if (!stripePlan && status !== 'cancelled') {
		console.error(`[stripe] subscription ${sub.id} for org ${orgId}: no plan for amount ${amount}; left unchanged`);
		return { applied: false, reason: 'unknown_plan', orgId, before: existing };
	}
	// What the organisation gets now: the subscription's plan only while it is paid up.
	const plan: PlanId = stripePlan && isEntitled(status) ? stripePlan : 'free';

	await dbRun(db,
		`INSERT INTO subscriptions (id, org_id, plan, status, stripe_customer_id, stripe_subscription_id,
		                            current_period_end, stripe_plan, stripe_status, stripe_event_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		 ON CONFLICT (org_id) DO UPDATE
		   SET plan = excluded.plan,
		       status = excluded.status,
		       stripe_customer_id = excluded.stripe_customer_id,
		       stripe_subscription_id = excluded.stripe_subscription_id,
		       current_period_end = excluded.current_period_end,
		       stripe_plan = excluded.stripe_plan,
		       stripe_status = excluded.stripe_status,
		       stripe_event_at = excluded.stripe_event_at,
		       updated_at = datetime('now')`,
		crypto.randomUUID(), orgId, plan, status,
		typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
		sub.id, periodEndOf(sub), stripePlan, sub.status, at);

	// Suspends halls over the new limit, or brings suspended ones back when there is room.
	const halls = await enforcePlanLimits(db, orgId, plan);
	const after = { plan, status, stripePlan };

	// Platform webhook. Compared with what was stored, so the same state applied twice
	// (webhook and redirect page, or a replayed event) is announced once.
	const change = classifyPlanChange(existing ? { plan: existing.plan, status: existing.status } : null, { plan, status });
	if (change) {
		dispatchPlatformEvent(db, 'org.plan_changed', {
			org_id: orgId, change, old_plan: existing?.plan ?? null, new_plan: plan,
			old_status: existing?.status ?? null, new_status: status, source: 'stripe', stripe_subscription_id: sub.id,
		});
	}

	try {
		await notifyBillingChange(db, { orgId, before: existing, after, halls });
	} catch (err) {
		// The state is stored; a failed email must not make Stripe retry the event.
		console.error('[stripe] billing notice failed', err);
	}
	return { applied: true, orgId, before: existing, after, halls };
}

/**
 * Credit an AI credit pack once its money has arrived. Card payments arrive with
 * `checkout.session.completed`; delayed methods (SEPA debit, bank transfer) complete
 * unpaid and arrive later with `checkout.session.async_payment_succeeded`.
 * Idempotent per Checkout session.
 */
export async function applyCreditPurchase(db: Db, session: Stripe.Checkout.Session): Promise<'credited' | 'already' | 'unpaid' | 'ignored'> {
	const orgId = session.metadata?.orgId;
	if (session.mode !== 'payment' || session.metadata?.kind !== 'ai_credits' || !orgId) return 'ignored';
	if (session.payment_status !== 'paid') return 'unpaid';
	const org = await dbFirst<{ id: string }>(db, 'SELECT id FROM organizations WHERE id = ?', orgId);
	if (!org) return 'ignored';
	// The credits follow the amount paid, not the pack recorded at checkout, so a
	// checkout opened before a rate change still buys what was paid for.
	const credits = creditsForCents(session.amount_total ?? 0);
	if (!Number.isInteger(credits) || credits <= 0) return 'ignored';
	const granted = await grantPurchase(db, orgId, credits, session.id, session.metadata.userId ?? null);
	if (granted) {
		// Once per session, like the credit itself.
		const money = { amount_cents: session.amount_total ?? null, currency: session.currency ?? null };
		dispatchPlatformEvent(db, 'ai_credits.purchased', {
			org_id: orgId, credits, ...money, purchased_by: session.metadata.userId ?? null, stripe_checkout_session_id: session.id,
		});
		dispatchPlatformEvent(db, 'payment.succeeded', { org_id: orgId, kind: 'ai_credits', ...money, plan: null, stripe_object_id: session.id });
	}
	return granted ? 'credited' : 'already';
}

/** The organisation a Stripe customer pays for, if we know it. */
async function orgForCustomer(db: Db, customer: string | { id: string } | null | undefined): Promise<{ org_id: string; plan: string } | null> {
	const id = typeof customer === 'string' ? customer : customer?.id;
	if (!id) return null;
	return dbFirst<{ org_id: string; plan: string }>(db, 'SELECT org_id, plan FROM subscriptions WHERE stripe_customer_id = ?', id).catch(() => null);
}

/** Subscription invoices, paid or not: only announced as platform webhooks (the
 *  subscription's own events change the plan). Needs `invoice.paid` and
 *  `invoice.payment_failed` enabled on the Stripe webhook endpoint. */
export async function announceInvoice(db: Db, invoice: Stripe.Invoice, paid: boolean): Promise<void> {
	const org = await orgForCustomer(db, invoice.customer as string | { id: string } | null);
	if (!org) return;
	if (paid) {
		// A €0 invoice (a trial, a fully credited proration) is not a payment.
		if (!invoice.amount_paid) return;
		dispatchPlatformEvent(db, 'payment.succeeded', {
			org_id: org.org_id, kind: 'subscription', amount_cents: invoice.amount_paid, currency: invoice.currency,
			plan: org.plan, stripe_object_id: invoice.id ?? null,
		});
	} else {
		dispatchPlatformEvent(db, 'payment.failed', {
			org_id: org.org_id, kind: 'subscription', amount_cents: invoice.amount_due, currency: invoice.currency,
			attempt_count: invoice.attempt_count ?? null,
			next_attempt_at: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null,
			stripe_object_id: invoice.id ?? null,
		});
	}
}

/** Dependencies the event handler needs from outside (Stripe API), injectable for tests. */
export interface SyncDeps {
	retrieveSubscription: (id: string) => Promise<Stripe.Subscription | null>;
	now?: () => number;
}

/** Apply one verified Stripe event. Unknown event types are acknowledged and ignored. */
export async function handleStripeEvent(db: Db, event: Stripe.Event, deps: SyncDeps): Promise<void> {
	switch (event.type) {
		case 'customer.subscription.created':
		case 'customer.subscription.updated':
		case 'customer.subscription.deleted':
		case 'customer.subscription.paused':
		case 'customer.subscription.resumed': {
			const res = await applySubscription(db, event.data.object as Stripe.Subscription, event.created);
			if (!res.applied) console.warn(`[stripe] ${event.type} ${event.id} not applied: ${res.reason}`);
			return;
		}

		case 'checkout.session.completed':
		case 'checkout.session.async_payment_succeeded': {
			const session = event.data.object as Stripe.Checkout.Session;
			if (session.mode === 'payment') {
				await applyCreditPurchase(db, session);
				return;
			}
			// A new subscription: apply its current state straight away instead of
			// waiting for (or depending on the order of) the subscription events.
			const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
			if (!subId) return;
			const sub = await deps.retrieveSubscription(subId);
			if (sub) {
				await applySubscription(db, sub, deps.now ? deps.now() : Math.floor(Date.now() / 1000));
			}
			return;
		}

		// A credit pack paid by a delayed method that then did not arrive.
		case 'checkout.session.async_payment_failed': {
			const session = event.data.object as Stripe.Checkout.Session;
			const orgId = session.metadata?.orgId;
			if (session.mode !== 'payment' || session.metadata?.kind !== 'ai_credits' || !orgId) return;
			dispatchPlatformEvent(db, 'payment.failed', {
				org_id: orgId, kind: 'ai_credits', amount_cents: session.amount_total ?? null, currency: session.currency ?? null,
				attempt_count: null, next_attempt_at: null, stripe_object_id: session.id,
			});
			return;
		}

		case 'invoice.paid':
		case 'invoice.payment_failed':
			await announceInvoice(db, event.data.object as Stripe.Invoice, event.type === 'invoice.paid');
			return;
	}
}
