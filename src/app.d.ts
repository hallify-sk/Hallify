import type { SessionUser } from '$lib/auth';
import type { PlanId } from '$lib/plans';
import type { D1Database, R2Bucket, ExecutionContext } from '@cloudflare/workers-types';

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
  /** True when a platform admin is viewing this org without being a member ("view as"). */
  impersonated?: boolean;
  subscription: {
    plan: PlanId;
    status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';
    stripeCustomerId: string | null;
    currentPeriodEnd: string | null;
  };
}

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        R2: R2Bucket;
      };
      context: ExecutionContext;
      caches: CacheStorage & { default: Cache };
    }
    interface Locals {
      db: D1Database;
      user: SessionUser | null;
      branding: Branding;
      currentOrg: OrgContext | null;
      domainOrg: { id: string; name: string; slug: string; logoUrl: string | null } | null;
      locale: 'sk' | 'en';
    }
    interface PageData {
      user?: SessionUser | null;
      branding?: Branding;
      currentOrg?: OrgContext | null;
      locale?: 'sk' | 'en';
    }
  }
}

export {};
