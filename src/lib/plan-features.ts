// A plan's feature list in the reader's language, built from the plan's limits so the
// list can never disagree with what the app enforces. (plans.ts `features` is the
// English summary Stripe shows on the receipt.)

import type { Plan } from '$lib/plans';
import type { sk } from '$lib/i18n';

type FeatureStrings = (typeof sk)['accountPages']['planFeatures'];

/** `ai`: whether the platform offers the AI assistant; off, the credits line goes. */
export function planFeatureList(plan: Plan, f: FeatureStrings, opts: { ai: boolean } = { ai: true }): string[] {
	const l = plan.limits;
	const out = [
		f.halls(l.maxHalls),
		f.members(l.maxMembers),
		f.reservations(l.maxReservationsPerHallMonth),
		f.gallery(l.maxGalleryImages),
		f.extras(l.maxExtrasPerHall),
		...(opts.ai ? [f.aiCredits(l.aiCreditsMonthly)] : []),
		l.customDomains ? f.customDomain : f.subdomain,
	];
	if (l.customBranding) out.push(f.customBranding);
	if (l.webhooks) out.push(f.webhooks);
	if (l.mcp) out.push(f.mcp);
	for (const s of plan.support ?? []) out.push(f[s]);
	return out;
}
