import { describe, it, expect, beforeEach, vi } from 'vitest';

/** The consent gate is a legal requirement, not a preference: GTM must never load
 *  before the visitor opts in. These tests pin that behaviour so a future refactor
 *  can't quietly regress it.
 *
 *  Runs in the `node` environment, so window/document are stubbed by hand rather than
 *  pulling in jsdom. Only the surface analytics.ts actually touches is modelled. */

interface FakeScript { async?: boolean; src?: string }

function installDom(cookie = '') {
  const appended: FakeScript[] = [];
  const doc = {
    cookie,
    createElement: () => ({} as FakeScript),
    head: { appendChild: (s: FakeScript) => { appended.push(s); } },
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', {} as Record<string, unknown>);
  vi.stubGlobal('location', { protocol: 'https:' });
  return { appended, doc };
}

/** Fresh module per test — the module keeps load/dedupe state internally. */
async function freshModule() {
  vi.resetModules();
  return import('./analytics.js');
}

function gtmScripts(appended: FakeScript[]) {
  return appended.filter((s) => (s.src ?? '').includes('googletagmanager.com/gtm.js'));
}

describe('consent gate', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('does not load GTM when the visitor has not decided', async () => {
    const { appended } = installDom('');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    expect(gtmScripts(appended)).toHaveLength(0);
  });

  it('does not load GTM when consent was refused', async () => {
    const { appended } = installDom('hallify-consent=2%3Aanalytics%3D0%2Cmarketing%3D0');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    expect(gtmScripts(appended)).toHaveLength(0);
  });

  it('loads GTM when consent was already granted', async () => {
    const { appended } = installDom('hallify-consent=2%3Aanalytics%3D1%2Cmarketing%3D0');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    expect(gtmScripts(appended)).toHaveLength(1);
    expect(gtmScripts(appended)[0].src).toContain('id=GTM-ABC123');
  });

  it('loads GTM the moment consent is given, and not before', async () => {
    const { appended } = installDom('');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    expect(gtmScripts(appended)).toHaveLength(0);
    a.setConsent({ analytics: true, marketing: false }, 'GTM-ABC123');
    expect(gtmScripts(appended)).toHaveLength(1);
  });

  it('refusing consent never loads GTM', async () => {
    const { appended } = installDom('');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    a.setConsent({ analytics: false, marketing: false }, 'GTM-ABC123');
    expect(gtmScripts(appended)).toHaveLength(0);
  });

  it('does nothing at all when no container is configured', async () => {
    const { appended } = installDom('hallify-consent=2%3Aanalytics%3D1%2Cmarketing%3D0');
    const a = await freshModule();
    a.initAnalytics(null);
    expect(gtmScripts(appended)).toHaveLength(0);
  });

  it('ignores consent stored under an older version, so a category change re-asks', async () => {
    installDom('hallify-consent=1%3Aanalytics%3D1%2Cmarketing%3D1');
    const a = await freshModule();
    expect(a.readConsent()).toBeNull();
  });

  it('pushes Consent Mode defaults (all denied) before any container loads', async () => {
    installDom('');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    const dl = (globalThis as unknown as { window: { dataLayer: unknown[] } }).window.dataLayer;
    const args = dl.map((e) => Array.from(e as ArrayLike<unknown>));
    const consentDefault = args.find((e) => e[0] === 'consent' && e[1] === 'default');
    expect(consentDefault).toBeDefined();
    const flags = consentDefault![2] as Record<string, string>;
    expect(flags.analytics_storage).toBe('denied');
    expect(flags.ad_storage).toBe('denied');
    expect(flags.ad_user_data).toBe('denied');
    expect(flags.ad_personalization).toBe('denied');
  });

  it('only injects the container once even if asked repeatedly', async () => {
    const { appended } = installDom('hallify-consent=2%3Aanalytics%3D1%2Cmarketing%3D0');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    a.initAnalytics('GTM-ABC123');
    a.setConsent({ analytics: true, marketing: false }, 'GTM-ABC123');
    expect(gtmScripts(appended)).toHaveLength(1);
  });
});

describe('withdrawal', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('withdrawing pushes a denied Consent Mode update (Art. 7(3): as easy as granting)', async () => {
    installDom('hallify-consent=2%3Aanalytics%3D1%2Cmarketing%3D1');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    a.setConsent({ analytics: false, marketing: false }, 'GTM-ABC123');
    const dl = (globalThis as unknown as { window: { dataLayer: unknown[] } }).window.dataLayer;
    const updates = dl.map((e) => Array.from(e as ArrayLike<unknown>))
      .filter((e) => e[0] === 'consent' && e[1] === 'update');
    const last = updates.at(-1)![2] as Record<string, string>;
    expect(last.analytics_storage).toBe('denied');
    expect(last.ad_storage).toBe('denied');
    expect(last.ad_user_data).toBe('denied');
    expect(last.ad_personalization).toBe('denied');
  });

  it('marketing-only consent does not grant analytics storage', async () => {
    installDom('');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    a.setConsent({ analytics: false, marketing: true }, 'GTM-ABC123');
    const dl = (globalThis as unknown as { window: { dataLayer: unknown[] } }).window.dataLayer;
    const last = dl.map((e) => Array.from(e as ArrayLike<unknown>))
      .filter((e) => e[0] === 'consent' && e[1] === 'update').at(-1)![2] as Record<string, string>;
    expect(last.analytics_storage).toBe('denied');
    expect(last.ad_storage).toBe('granted');
  });

  it('analytics-only consent does not grant ad signals', async () => {
    installDom('');
    const a = await freshModule();
    a.initAnalytics('GTM-ABC123');
    a.setConsent({ analytics: true, marketing: false }, 'GTM-ABC123');
    const dl = (globalThis as unknown as { window: { dataLayer: unknown[] } }).window.dataLayer;
    const last = dl.map((e) => Array.from(e as ArrayLike<unknown>))
      .filter((e) => e[0] === 'consent' && e[1] === 'update').at(-1)![2] as Record<string, string>;
    expect(last.analytics_storage).toBe('granted');
    expect(last.ad_user_data).toBe('denied');
    expect(last.ad_personalization).toBe('denied');
  });
});

describe('user context', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('de-dupes identical pushes so navigation does not spam the dataLayer', async () => {
    installDom('');
    const a = await freshModule();
    const ctx = { logged_in: true, user_type: 'organization' as const, surface: 'apex' as const, locale: 'sk' };
    a.setUserContext(ctx);
    a.setUserContext({ ...ctx });
    const dl = (globalThis as unknown as { window: { dataLayer: { event?: string }[] } }).window.dataLayer;
    expect(dl.filter((e) => e.event === 'user_data')).toHaveLength(1);
  });

  it('pushes again when something actually changed (e.g. org switch)', async () => {
    installDom('');
    const a = await freshModule();
    const ctx = { logged_in: true, user_type: 'organization' as const, surface: 'apex' as const, locale: 'sk' };
    a.setUserContext(ctx);
    a.setUserContext({ ...ctx, org_id: 'org-2' });
    const dl = (globalThis as unknown as { window: { dataLayer: { event?: string }[] } }).window.dataLayer;
    expect(dl.filter((e) => e.event === 'user_data')).toHaveLength(2);
  });

  it('carries no PII — only pseudonymous identifiers and attributes', async () => {
    installDom('');
    const a = await freshModule();
    a.setUserContext({
      logged_in: true, user_type: 'organization', user_id: 'uuid-1', org_id: 'uuid-2',
      org_role: 'owner', plan: 'starter', subscription_status: 'active',
      surface: 'apex', locale: 'sk',
    });
    const dl = (globalThis as unknown as { window: { dataLayer: Record<string, unknown>[] } }).window.dataLayer;
    const pushed = dl.find((e) => e.event === 'user_data')!;
    const keys = Object.keys(pushed).join(',');
    for (const banned of ['email', 'first_name', 'last_name', 'name', 'org_name']) {
      expect(keys).not.toContain(banned);
    }
  });
});

describe('several containers and server-side GTM', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  const granted = 'hallify-consent=2%3Aanalytics%3D1%2Cmarketing%3D0';
  const containers = [
    { id: 'GTM-PLAT001', origin: 'https://data.hallify.sk', owner: 'platform' as const },
    { id: 'GTM-VENU001', origin: 'https://www.googletagmanager.com', owner: 'venue' as const },
  ];

  it('loads each container from its own origin, once', async () => {
    const { appended } = installDom(granted);
    const a = await freshModule();
    a.initAnalytics(containers);
    a.setConsent({ analytics: true, marketing: false }, containers);
    const srcs = appended.map((s) => s.src);
    expect(srcs).toEqual([
      'https://data.hallify.sk/gtm.js?id=GTM-PLAT001',
      'https://www.googletagmanager.com/gtm.js?id=GTM-VENU001',
    ]);
  });

  it('loads none of them before consent', async () => {
    const { appended } = installDom('');
    const a = await freshModule();
    a.initAnalytics(containers);
    expect(appended).toHaveLength(0);
  });

  it('tells the tags where the server containers are', async () => {
    installDom('');
    const a = await freshModule();
    a.initAnalytics(containers);
    const dl = (globalThis as unknown as { window: { dataLayer: Record<string, unknown>[] } }).window.dataLayer;
    const cfg = dl.find((e) => e.event === 'hallify_config')!;
    expect(cfg.sgtm_platform_url).toBe('https://data.hallify.sk');
    expect(cfg.sgtm_venue_url).toBeUndefined();
  });
});
