export type PlanId = 'free' | 'starter' | 'professional' | 'enterprise';

export interface PlanLimits {
  maxHalls: number;            // -1 = unlimited (max ACTIVE, non-locked halls)
  maxMembers: number;          // -1 = unlimited
  maxReservationsPerHallMonth: number; // -1 = unlimited; cap per hall per calendar month (by event date)
  maxGalleryImages: number;    // -1 = unlimited
  customDomains: boolean;      // bring-your-own custom domain (paid only)
  customBranding: boolean;     // Customize page: logo / colors / theme (paid only)
  webhooks: boolean;           // outgoing webhooks (paid only — Starter and up)
  advancedRsvp: boolean;       // custom RSVP fields / editor (paid only; Free = basic name+email)
  maxExtrasPerHall: number;    // bookable extras an org can define per hall (-1 = unlimited)
  aiCreditsMonthly: number;    // AI assistant credits each period (10 credits = 1 EUR); refilled TO this, not added
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number | null;  // null = contact for quote
  limits: PlanLimits;
  /** English summary, used for the Stripe product description. The console builds
   *  its localised list from `limits` and `support` (see $lib/plan-features). */
  features: string[];
  /** Support tiers on top of the limits. */
  support?: Array<'prioritySupport' | 'sla' | 'dedicatedSupport'>;
  stripePriceEnvKey?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    limits: { maxHalls: 1, maxMembers: 2, maxReservationsPerHallMonth: 5, maxGalleryImages: 5, customDomains: false, customBranding: false, webhooks: false, advancedRsvp: false, maxExtrasPerHall: 3, aiCreditsMonthly: 2 },
    features: ['1 hall', '2 organization members', '5 reservations/hall/month', '5 gallery images', 'Basic RSVP', 'Free subdomain'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 29.99,
    limits: { maxHalls: 3, maxMembers: 10, maxReservationsPerHallMonth: 12, maxGalleryImages: 10, customDomains: true, customBranding: true, webhooks: true, advancedRsvp: true, maxExtrasPerHall: 6, aiCreditsMonthly: 20 },
    features: ['3 halls', '10 organization members', '12 reservations/hall/month', 'Custom domain', 'Custom branding', 'Webhooks', 'Advanced RSVP editing', '10 gallery images per hall'],
    stripePriceEnvKey: 'STRIPE_PRICE_STARTER',
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    priceMonthly: 79.99,
    limits: { maxHalls: 10, maxMembers: -1, maxReservationsPerHallMonth: 20, maxGalleryImages: 20, customDomains: true, customBranding: true, webhooks: true, advancedRsvp: true, maxExtrasPerHall: 10, aiCreditsMonthly: 60 },
    features: ['10 halls', 'Unlimited organization members', '20 reservations/hall/month', 'Custom domain', 'Custom branding', 'Webhooks', 'Advanced RSVP editing', '20 gallery images per hall', 'Priority support'],
    support: ['prioritySupport'],
    stripePriceEnvKey: 'STRIPE_PRICE_PROFESSIONAL',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null,
    limits: { maxHalls: -1, maxMembers: -1, maxReservationsPerHallMonth: -1, maxGalleryImages: -1, customDomains: true, customBranding: true, webhooks: true, advancedRsvp: true, maxExtrasPerHall: -1, aiCreditsMonthly: 60 },
    features: ['Unlimited halls', 'Unlimited organization members', 'Unlimited reservations', 'Unlimited gallery images', 'Custom domain', 'Custom branding', 'Webhooks', 'Advanced RSVP editing', 'Priority support', 'SLA', 'Dedicated support'],
    support: ['prioritySupport', 'sla', 'dedicatedSupport'],
  },
};

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] ?? PLANS.free;
}

export function isWithinLimit(limit: number, current: number): boolean {
  return limit === -1 || current < limit;
}

/** Map a Stripe price amount (in cents) back to a plan id — the source of truth
 *  for which plan a subscription is on, independent of (possibly stale) metadata. */
export function planFromAmount(cents: number): PlanId | null {
  for (const p of Object.values(PLANS)) {
    if (p.priceMonthly != null && p.priceMonthly > 0 && Math.round(p.priceMonthly * 100) === cents) {
      return p.id;
    }
  }
  return null;
}

/** Compare two paid plans by price; positive = `a` costs more than `b`. */
export function comparePlanPrice(a: PlanId, b: PlanId): number {
  return (PLANS[a]?.priceMonthly ?? 0) - (PLANS[b]?.priceMonthly ?? 0);
}
