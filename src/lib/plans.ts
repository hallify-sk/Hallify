export type PlanId = 'free' | 'starter' | 'professional' | 'enterprise';

export interface PlanLimits {
  maxHalls: number;            // -1 = unlimited
  maxMembers: number;          // -1 = unlimited
  maxReservationsPerMonth: number; // -1 = unlimited
  maxGalleryImages: number;    // -1 = unlimited
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number | null;  // null = contact for quote
  limits: PlanLimits;
  features: string[];
  stripePriceEnvKey?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    limits: { maxHalls: 1, maxMembers: 5, maxReservationsPerMonth: 20, maxGalleryImages: 3 },
    features: ['1 hall', '5 members', '20 reservations/month', 'Basic RSVP', '3 gallery images'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 29,
    limits: { maxHalls: 5, maxMembers: 25, maxReservationsPerMonth: 200, maxGalleryImages: 10 },
    features: ['5 halls', '25 members', '200 reservations/month', 'Custom branding', 'Custom SMTP', 'RSVP + templates', '10 gallery images'],
    stripePriceEnvKey: 'STRIPE_PRICE_STARTER',
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    priceMonthly: 79,
    limits: { maxHalls: 20, maxMembers: 100, maxReservationsPerMonth: -1, maxGalleryImages: 25 },
    features: ['20 halls', '100 members', 'Unlimited reservations', 'Custom branding', 'Custom SMTP', 'Calendar view', 'Priority support', '25 gallery images'],
    stripePriceEnvKey: 'STRIPE_PRICE_PROFESSIONAL',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null,
    limits: { maxHalls: -1, maxMembers: -1, maxReservationsPerMonth: -1, maxGalleryImages: -1 },
    features: ['Unlimited halls', 'Unlimited members', 'Unlimited reservations', 'Custom branding', 'Custom SMTP', 'SLA', 'Dedicated support'],
  },
};

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] ?? PLANS.free;
}

export function isWithinLimit(limit: number, current: number): boolean {
  return limit === -1 || current < limit;
}
