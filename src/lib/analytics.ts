/** Google Tag Manager + funnel instrumentation.
 *
 *  ── Design notes, because two constraints in this codebase shape all of it ──
 *
 *  1. CONSENT. GTM/GA4 cookies are not strictly necessary, so under GDPR + the
 *     ePrivacy rules Slovakia implements they need PRIOR opt-in consent. So GTM is
 *     never injected until the visitor accepts, and Google Consent Mode v2 defaults
 *     are pushed *before* the container loads (denied across the board). Declining
 *     leaves no GTM script on the page at all.
 *
 *  2. MULTI-TENANCY. Two containers, each with its own owner:
 *       - Hallify's platform container (platform setting 'analytics'), on every
 *         surface: the apex, the console, and venues' public sites. On a venue's site
 *         it measures whether Hallify brings that venue visitors and bookings.
 *       - the venue's OWN container (org_settings key 'gtm'), on that venue's site.
 *     On a venue's site both load, one after the other, into the same dataLayer.
 *     They report to different properties, so nothing is counted twice. The consent
 *     banner there names both, and one choice covers both.
 *
 *  3. SERVER-SIDE GTM. Either container may have a server container (sGTM): gtm.js
 *     is then loaded from that first-party origin, and its origin is pushed to the
 *     dataLayer (sgtm_platform_url / sgtm_venue_url) for the GA4 tag's
 *     server_container_url. The page's CSP allows exactly those origins.
 *
 *  No inline <script> is used: the loader is bundled, so `script-src 'self'` still
 *  covers our own code and only googletagmanager.com has to be allowed.
 */

export { consentUi, openConsentSettings } from './analytics.svelte';
import { GOOGLE_TAG_ORIGIN, type AnalyticsContainer } from './analytics-servers';
export type { AnalyticsContainer } from './analytics-servers';

export const CONSENT_COOKIE = 'hallify-consent';
/** Bumped 1 -> 2 when consent became granular. A version change re-asks everyone,
 *  which is the correct behaviour: a choice made against different categories is not
 *  valid consent for the new ones. */
export const CONSENT_VERSION = 2;

/** Necessary cookies are not listed — they are not consent-based and cannot be
 *  refused (session, language, and the consent record itself). */
export interface ConsentState {
  /** Google Analytics — how the service is used. */
  analytics: boolean;
  /** Google Ads signals — conversion matching and remarketing. */
  marketing: boolean;
}

export const CONSENT_NONE: ConsentState = { analytics: false, marketing: false };
export const CONSENT_ALL: ConsentState = { analytics: true, marketing: true };

interface DataLayerEvent { event?: string; [k: string]: unknown }
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: DataLayerEvent[];
    gtag?: Gtag;
    __hallifyGtmLoaded?: string;
    __hallifyGtmIds?: string[];
  }
}

function dl(): DataLayerEvent[] {
  if (typeof window === 'undefined') return [];
  window.dataLayer = window.dataLayer ?? [];
  return window.dataLayer;
}

/** Consent Mode v2 uses arguments-object pushes, not plain objects. */
function gtag(...args: unknown[]): void {
  dl().push(arguments as unknown as DataLayerEvent);
  void args;
}

/** The visitor's stored choice, or null if they have not decided yet. */
export function readConsent(): ConsentState | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  if (!m) return null;
  const raw = decodeURIComponent(m[1]);
  const [v, ...rest] = raw.split(':');
  if (Number(v) !== CONSENT_VERSION) return null;
  const flags = rest.join(':');
  return {
    analytics: /analytics=1/.test(flags),
    marketing: /marketing=1/.test(flags),
  };
}

function writeConsent(state: ConsentState): void {
  const oneYear = 60 * 60 * 24 * 365;
  const value = `${CONSENT_VERSION}:analytics=${state.analytics ? 1 : 0},marketing=${state.marketing ? 1 : 0}`;
  document.cookie =
    `${CONSENT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; samesite=lax` +
    (location.protocol === 'https:' ? '; secure' : '');
}

/** Map our two categories onto the four Consent Mode v2 signals. */
function consentSignals(state: ConsentState) {
  return {
    analytics_storage: state.analytics ? 'granted' : 'denied',
    ad_storage: state.marketing ? 'granted' : 'denied',
    ad_user_data: state.marketing ? 'granted' : 'denied',
    ad_personalization: state.marketing ? 'granted' : 'denied',
  } as const;
}

/** Consent Mode v2 defaults. Must run BEFORE the container is injected. */
function pushConsentDefaults(): void {
  gtag('consent', 'default', {
    ...consentSignals(CONSENT_NONE),
    functionality_storage: 'granted', // session + language — strictly necessary
    security_storage: 'granted',
    wait_for_update: 500,
  });
}

/** A container to load: an id alone means Google's loader. */
export type ContainerRef = string | AnalyticsContainer;
type ContainerInput = ContainerRef | ContainerRef[] | null | undefined;

function asContainers(input: ContainerInput): AnalyticsContainer[] {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  return list.map((c) => (typeof c === 'string' ? { id: c, origin: GOOGLE_TAG_ORIGIN, owner: 'platform' as const } : c)).filter((c) => !!c.id);
}

function injectGtm(c: AnalyticsContainer): void {
  const loaded = (window.__hallifyGtmIds ??= []);
  if (loaded.includes(c.id)) return;
  if (!loaded.length) dl().push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  loaded.push(c.id);
  window.__hallifyGtmLoaded = c.id;
  const s = document.createElement('script');
  s.async = true;
  s.src = `${c.origin}/gtm.js?id=${encodeURIComponent(c.id)}`;
  document.head.appendChild(s);
}

/** Tell the containers where their server containers are, for server_container_url. */
function pushServerConfig(list: AnalyticsContainer[]): void {
  const of = (owner: AnalyticsContainer['owner']) => list.find((c) => c.owner === owner && c.origin !== GOOGLE_TAG_ORIGIN)?.origin;
  const platform = of('platform'), venue = of('venue');
  if (platform || venue) dl().push({ event: 'hallify_config', sgtm_platform_url: platform, sgtm_venue_url: venue });
}

/** True when at least one consent-based category is on. */
function anyGranted(state: ConsentState): boolean {
  return state.analytics || state.marketing;
}

/** Call once on mount. Sets defaults, and loads the containers only if something was accepted. */
export function initAnalytics(containers: ContainerInput): void {
  const list = asContainers(containers);
  if (typeof window === 'undefined' || !list.length) return;
  pushConsentDefaults();
  pushServerConfig(list);
  const stored = readConsent();
  if (stored && anyGranted(stored)) {
    gtag('consent', 'update', consentSignals(stored));
    for (const c of list) injectGtm(c);
  }
}

/** Record a choice, update Consent Mode, and load GTM if anything was accepted.
 *
 *  Withdrawal matters as much as granting: GDPR Art. 7(3) requires it to be as easy
 *  as giving consent. Going from granted to denied pushes an `update` with the
 *  signals denied, so Google stops using storage immediately. The container script
 *  stays in memory for the current page — a reload clears it entirely, and no
 *  further storage or identifiers are used in the meantime. */
export function setConsent(state: ConsentState, containers: ContainerInput): void {
  if (typeof window === 'undefined') return;
  writeConsent(state);
  gtag('consent', 'update', consentSignals(state));
  if (anyGranted(state)) for (const c of asContainers(containers)) injectGtm(c);
}

// ─── Funnel events ────────────────────────────────────────────────────────────
//
// Queued to dataLayer regardless of consent: with consent denied nothing is sent
// anywhere (no container is loaded), and if the visitor accepts later, GTM replays
// what is already in the dataLayer. Names follow GA4 e-commerce where one fits, so
// the standard funnel reports work without custom configuration.

/** Push a raw event. Prefer the named helpers below. */
export function track(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  dl().push({ event, ...params });
}

/** BOOKING FUNNEL — a venue's customers, on that venue's bubble. */
export const booking = {
  /** /halls — the venue's hall list. */
  viewHallList: (count: number) => track('view_item_list', { item_list_name: 'halls', items_count: count }),
  /** /halls/[slug] — a specific hall. */
  viewHall: (slug: string, name: string) =>
    track('view_item', { items: [{ item_id: slug, item_name: name, item_category: 'hall' }] }),
  /** Booking form opened. */
  beginBooking: (slug: string, name: string) =>
    track('begin_checkout', { items: [{ item_id: slug, item_name: name, item_category: 'hall' }] }),
  /** Each step completed inside the form — this is what shows WHERE people drop. */
  bookingStep: (slug: string, step: 'date_selected' | 'guests_entered' | 'extras_selected' | 'details_entered') =>
    track('booking_step', { item_id: slug, step }),
  /** Submitted and accepted by the server. */
  bookingSubmitted: (slug: string, status: string, guests: number | null) =>
    track('purchase', {
      transaction_id: `${slug}-${Date.now()}`,
      items: [{ item_id: slug, item_category: 'hall', quantity: 1 }],
      booking_status: status,
      guests,
    }),
  /** Rejected by a rule — the single most useful drop-off signal. */
  bookingRejected: (slug: string, reason: string) => track('booking_rejected', { item_id: slug, reason }),
};

/** SAAS FUNNEL — Hallify's own e-commerce, apex only. */
export const saas = {
  viewPricing: () => track('view_item_list', { item_list_name: 'plans' }),
  signUpStarted: () => track('sign_up_started'),
  signUpCompleted: () => track('sign_up'),
  orgCreated: (slug: string) => track('create_org', { org_slug: slug }),
  /** Plan picker opened. */
  viewPlans: (currentPlan: string) => track('view_plans', { current_plan: currentPlan }),
  /** Upgrade clicked — the hand-off to Stripe Checkout. */
  beginUpgrade: (plan: string, price: number | null) =>
    track('begin_checkout', {
      currency: 'EUR', value: price ?? 0,
      items: [{ item_id: plan, item_name: `Hallify ${plan}`, price: price ?? 0, quantity: 1 }],
    }),
  /** Returned from Stripe successfully. */
  upgradeCompleted: (plan: string, price: number | null) =>
    track('purchase', {
      transaction_id: `sub-${plan}-${Date.now()}`,
      currency: 'EUR', value: price ?? 0,
      items: [{ item_id: plan, item_name: `Hallify ${plan}`, price: price ?? 0, quantity: 1 }],
    }),
  upgradeAbandoned: (plan: string) => track('checkout_abandoned', { plan }),
};

// ─── User context ─────────────────────────────────────────────────────────────
//
// Segmentation dimensions pushed once per page so every downstream event can be
// sliced by them ("free-plan owners drop at guest entry", "clients on bubbles convert
// better than apex"). Sent as a `user_data` event plus top-level keys so GTM can read
// either shape.
//
// ⚠️ DELIBERATELY EXCLUDED — do not add these:
//   email, first/last name, org NAME, reservation titles, guest names.
// Two independent reasons. (1) Google's own terms prohibit sending PII to GA4/GTM;
// accounts get data deleted or suspended for it. (2) The privacy policy in
// $lib/legal.ts commits to no third-party tracking beyond what is consented, and a
// venue's guest data is the VENUE's to control under the DPA, not ours to forward.
// `user_id` and `org_id` are opaque UUIDs — pseudonymous identifiers, useful for
// joining back to our own DB, and they carry no personal detail on their own.

export interface UserContext {
  logged_in: boolean;
  /** anonymous | client (books venues) | organization (venue staff) | platform_admin */
  user_type: 'anonymous' | 'client' | 'organization' | 'platform_admin';
  /** Opaque UUID. Doubles as GA4 user_id for cross-device stitching. */
  user_id?: string;
  org_id?: string;
  org_role?: 'owner' | 'admin' | 'member';
  plan?: string;
  subscription_status?: string;
  /** apex = hallify.sk (our SaaS funnel); bubble = a venue's own domain. */
  surface: 'apex' | 'bubble';
  /** The venue whose site this is (bubble only). Opaque UUID. Lets Hallify's own
   *  container report each venue's traffic and bookings separately. */
  venue_id?: string;
  /** This visit came from Hallify: from hallify.sk, or a link tagged
   *  utm_source=hallify. Kept for the browser session, so a booking made a few pages
   *  later is still credited. This is what answers "does Hallify bring them business". */
  hallify_referral?: boolean;
  locale: string;
}

let lastContext = '';

/** Push the current user context. Safe to call on every navigation — it de-dupes,
 *  so GTM doesn't see a stream of identical pushes. */
export function setUserContext(ctx: UserContext): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(ctx);
  if (serialized === lastContext) return;
  lastContext = serialized;
  dl().push({ event: 'user_data', ...ctx, user_properties: { ...ctx } });
}
