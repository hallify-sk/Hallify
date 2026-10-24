// Subscription state, shared by the Stripe webhook, the billing page and emails.
// Client-safe: no Stripe SDK, no database.

import { PLANS, planFromAmount } from '$lib/plans';
import type { PlanId } from '$lib/plans';

/** What `subscriptions.status` may hold (CHECK constraint in 0001_baseline). */
export type SubStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';

/** Stripe statuses after which a subscription never becomes active again. */
export const TERMINAL_STRIPE_STATUSES = ['canceled', 'incomplete_expired'] as const;

/**
 * Stripe's status → ours. Every Stripe status is listed; anything unknown is treated
 * as NOT paid up, never as active (the fallback used to be 'active', so `unpaid` and
 * `incomplete` subscriptions kept every paid feature).
 *
 * - unpaid: Stripe has given up retrying an invoice. Suspended until paid → 'paused'.
 * - incomplete: the first payment has not gone through (e.g. waiting for 3-D Secure).
 *   Nothing has been paid yet → 'paused'.
 * - incomplete_expired: that first payment never came; the subscription is void.
 */
export function toStatus(stripeStatus: string | null | undefined): SubStatus {
	switch (stripeStatus) {
		case 'active': return 'active';
		case 'trialing': return 'trialing';
		case 'past_due': return 'past_due';
		case 'canceled':
		case 'incomplete_expired': return 'cancelled';
		case 'paused':
		case 'unpaid':
		case 'incomplete':
		default: return 'paused';
	}
}

/**
 * Whether a status grants the subscription's paid plan.
 *
 * past_due does: Stripe is still retrying the card (Smart Retries, then the
 * subscription becomes unpaid or is cancelled per the Stripe settings), and a single
 * declined renewal should not take a venue's site down. The owner is emailed and
 * the billing page shows a warning for as long as it lasts.
 */
export function isEntitled(status: string | null | undefined): boolean {
	return status === 'active' || status === 'trialing' || status === 'past_due';
}

/**
 * What choosing a paid plan on the billing page does.
 *
 *  - 'checkout': no live subscription (Free, never subscribed, or the last one ended)
 *    → Stripe Checkout creates one.
 *  - 'change': a paid-up subscription → change THAT one in place.
 *  - 'settle': a subscription that still exists but is not paid up (unpaid,
 *    incomplete, paused). The organisation is on Free meanwhile, but a Checkout here
 *    would start a SECOND subscription next to it and bill twice; the owner settles
 *    the existing one in the billing portal instead.
 */
export function upgradeRoute(sub: {
	plan: string;
	status: string | null | undefined;
	stripeSubscriptionId: string | null | undefined;
	stripeStatus: string | null | undefined;
}): 'checkout' | 'change' | 'settle' {
	const live =
		!!sub.stripeSubscriptionId &&
		!(TERMINAL_STRIPE_STATUSES as readonly string[]).includes(sub.stripeStatus ?? '') &&
		sub.status !== 'cancelled';
	if (live && !isEntitled(sub.status)) return 'settle';
	if (sub.plan === 'free' || !sub.stripeSubscriptionId || !live) return 'checkout';
	return 'change';
}

const PAID: PlanId[] = ['starter', 'professional', 'enterprise'];

/** A plan id we can trust from Stripe metadata (never 'free', never an unknown word). */
export function paidPlanOrNull(v: unknown): PlanId | null {
	return typeof v === 'string' && (PAID as string[]).includes(v) ? (v as PlanId) : null;
}

/**
 * Which paid plan a Stripe subscription is for: the price amount first (it is what
 * Stripe actually charges, and it follows a scheduled downgrade when its phase
 * starts), then the plan recorded in metadata, then what we already knew. Null when
 * none of them names a real plan; the caller then leaves the plan alone rather than
 * dropping a paying organisation to Free.
 */
export function resolveStripePlan(
	amountCents: number | null | undefined,
	metadataPlan: unknown,
	known: PlanId | string | null | undefined
): PlanId | null {
	return (amountCents != null ? planFromAmount(amountCents) : null)
		?? paidPlanOrNull(metadataPlan)
		?? paidPlanOrNull(known);
}

export function planName(id: string | null | undefined): string {
	return (id && id in PLANS ? PLANS[id as PlanId].name : null) ?? PLANS.free.name;
}
