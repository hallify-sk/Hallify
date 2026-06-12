import type { SessionUser } from '$lib/auth';
import type { PlanId } from '$lib/plans';

export interface Branding {
  appName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  theme?: 'slate' | 'dark' | 'warm';
}

export interface OrgContext {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  subscription: {
    plan: PlanId;
    status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';
    stripeCustomerId: string | null;
    currentPeriodEnd: Date | null;
  };
}

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
      branding: Branding;
      currentOrg: OrgContext | null;
      domainOrg: { id: string; name: string; slug: string; logoUrl: string | null } | null;
    }
    interface PageData {
      user?: SessionUser | null;
      branding?: Branding;
      currentOrg?: OrgContext | null;
    }
  }
}

export {};
