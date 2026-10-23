import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

// Cloudflare for SaaS configured; its API is faked over fetch below.
const fakeEnv: Record<string, string | undefined> = { CF_ZONE_ID: 'zone', CF_API_TOKEN: 'token', CF_CNAME_TARGET: 'fallback.hallify.sk' };
vi.mock('$env/dynamic/private', () => ({ env: fakeEnv }));

const { testD1 } = await import('./test-d1');
const { checkCustomDomain, registerCustomDomain, sweepCustomDomains, refreshPendingDomains } = await import('./custom-domains');

type Host = { id: string; hostname: string; status: string; ssl: { status: string }; ownership_verification?: object; verification_errors?: string[] };
let hosts: Map<string, Host>;
let calls: string[];
let apiDown: boolean;

function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	const url = new URL(String(input));
	const method = init?.method ?? 'GET';
	calls.push(`${method} ${url.pathname}${url.search}`);
	const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	const err = (status: number, message: string) => new Response(JSON.stringify({ success: false, errors: [{ code: status, message }] }), { status });
	if (apiDown) return Promise.resolve(err(500, 'internal error'));
	const id = url.pathname.split('/custom_hostnames/')[1];
	if (method === 'POST') {
		const hostname = JSON.parse(String(init?.body)).hostname as string;
		if ([...hosts.values()].some((h) => h.hostname === hostname)) return Promise.resolve(err(409, 'Duplicate custom hostname found.'));
		const h: Host = {
			id: `cf-${hostname}`, hostname, status: 'pending', ssl: { status: 'pending_validation' },
			ownership_verification: { type: 'txt', name: `_cf-custom-hostname.${hostname}`, value: `own-${hostname}` },
			verification_errors: ['custom hostname does not CNAME to this zone.'],
		};
		hosts.set(h.id, h);
		return Promise.resolve(ok(h));
	}
	if (method === 'DELETE') { hosts.delete(id); return Promise.resolve(ok({ id })); }
	if (id) return Promise.resolve(hosts.has(id) ? ok(hosts.get(id)) : err(404, 'Custom hostname not found.'));
	const name = url.searchParams.get('hostname');
	return Promise.resolve(ok([...hosts.values()].filter((h) => h.hostname === name)));
}

let db: D1Database;
let exec: (sql: string) => void;
const row = async (id: string) =>
	(await db.prepare('SELECT * FROM custom_domains WHERE id = ?').bind(id).first()) as Record<string, string | null> | null;
const domainRow = async (id: string) => {
	const r = await row(id);
	return { id, org_id: r!.org_id!, domain: r!.domain!, cf_hostname_id: r!.cf_hostname_id, verified_at: r!.verified_at, created_at: r!.created_at! };
};

beforeEach(async () => {
	hosts = new Map();
	calls = [];
	apiDown = false;
	fakeEnv.CF_ZONE_ID = 'zone';
	vi.stubGlobal('fetch', vi.fn(fakeFetch));
	({ db, exec } = await testD1());
	exec(`INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Kaštieľ', 'kastiel'), ('o2', 'Reduta', 'reduta');`);
});

describe('custom-domain verification (D9)', () => {
	it('registers the hostname and stores the CNAME and TXT records to show', async () => {
		exec(`INSERT INTO custom_domains (id, org_id, domain) VALUES ('d1', 'o1', 'rezervacie.kastiel.sk')`);
		await registerCustomDomain(db, await domainRow('d1'));
		const r = await row('d1');
		expect(r!.cf_hostname_id).toBe('cf-rezervacie.kastiel.sk');
		expect(r!.cf_status).toBe('pending');
		expect(r!.verified_at).toBeNull();
		expect(JSON.parse(r!.dns_records!)).toEqual([
			{ type: 'CNAME', name: 'rezervacie.kastiel.sk', value: 'fallback.hallify.sk', purpose: 'routing' },
			{ type: 'TXT', name: '_cf-custom-hostname.rezervacie.kastiel.sk', value: 'own-rezervacie.kastiel.sk', purpose: 'ownership' },
		]);
	});

	it('verifies only once the hostname and certificate are active', async () => {
		exec(`INSERT INTO custom_domains (id, org_id, domain) VALUES ('d1', 'o1', 'kastiel.sk')`);
		await registerCustomDomain(db, await domainRow('d1'));

		let res = await checkCustomDomain(db, await domainRow('d1'));
		expect(res).toMatchObject({ ok: true, verified: false });
		expect((await row('d1'))!.check_error).toContain('CNAME');

		hosts.get('cf-kastiel.sk')!.status = 'active';
		res = await checkCustomDomain(db, await domainRow('d1'));
		expect(res.verified).toBe(false); // certificate still pending

		hosts.get('cf-kastiel.sk')!.ssl.status = 'active';
		hosts.get('cf-kastiel.sk')!.verification_errors = [];
		res = await checkCustomDomain(db, await domainRow('d1'));
		expect(res.verified).toBe(true);
		const r = await row('d1');
		expect(r!.verified_at).not.toBeNull();
		expect(r!.check_error).toBeNull();
		expect(r!.ssl_status).toBe('active');
	});

	it('stops serving a verified domain whose DNS moved away, but not on a transient state', async () => {
		hosts.set('cf-x', { id: 'cf-x', hostname: 'kastiel.sk', status: 'active_redeploying', ssl: { status: 'pending_deployment' } });
		exec(`INSERT INTO custom_domains (id, org_id, domain, cf_hostname_id, verified_at) VALUES ('d1', 'o1', 'kastiel.sk', 'cf-x', '2026-10-01 10:00:00')`);
		expect((await checkCustomDomain(db, await domainRow('d1'))).verified).toBe(true);
		expect((await row('d1'))!.verified_at).toBe('2026-10-01 10:00:00');

		hosts.get('cf-x')!.status = 'moved';
		expect((await checkCustomDomain(db, await domainRow('d1'))).verified).toBe(false);
		expect((await row('d1'))!.verified_at).toBeNull();
	});

	it('re-registers a hostname Cloudflare lost, and adopts one it already has', async () => {
		exec(`INSERT INTO custom_domains (id, org_id, domain, cf_hostname_id) VALUES ('d1', 'o1', 'kastiel.sk', 'cf-gone')`);
		await checkCustomDomain(db, await domainRow('d1'));
		expect((await row('d1'))!.cf_hostname_id).toBe('cf-kastiel.sk');

		hosts.set('cf-old', { id: 'cf-old', hostname: 'reduta.sk', status: 'active', ssl: { status: 'active' } });
		exec(`INSERT INTO custom_domains (id, org_id, domain) VALUES ('d2', 'o2', 'reduta.sk')`);
		await registerCustomDomain(db, await domainRow('d2'));
		expect((await row('d2'))!.cf_hostname_id).toBe('cf-old');
	});

	it('a Cloudflare outage changes nothing but the error shown', async () => {
		hosts.set('cf-x', { id: 'cf-x', hostname: 'kastiel.sk', status: 'active', ssl: { status: 'active' } });
		exec(`INSERT INTO custom_domains (id, org_id, domain, cf_hostname_id, verified_at) VALUES ('d1', 'o1', 'kastiel.sk', 'cf-x', '2026-10-01 10:00:00')`);
		apiDown = true;
		const res = await checkCustomDomain(db, await domainRow('d1'));
		expect(res).toMatchObject({ ok: false, verified: true });
		const r = await row('d1');
		expect(r!.verified_at).toBe('2026-10-01 10:00:00');
		expect(r!.check_error).toBe('internal error');
	});

	it('the hourly sweep verifies, releases week-old unverified claims, and leaves fresh ones', async () => {
		hosts.set('cf-live', { id: 'cf-live', hostname: 'live.sk', status: 'active', ssl: { status: 'active' } });
		hosts.set('cf-old', { id: 'cf-old', hostname: 'old.sk', status: 'pending', ssl: { status: 'pending_validation' } });
		hosts.set('cf-new', { id: 'cf-new', hostname: 'new.sk', status: 'pending', ssl: { status: 'pending_validation' } });
		exec(`INSERT INTO custom_domains (id, org_id, domain, cf_hostname_id, created_at) VALUES
			('live', 'o1', 'live.sk', 'cf-live', datetime('now', '-30 days')),
			('old',  'o1', 'old.sk',  'cf-old',  datetime('now', '-8 days')),
			('new',  'o2', 'new.sk',  'cf-new',  datetime('now', '-1 days'))`);
		const out = await sweepCustomDomains(db);
		expect(out).toMatchObject({ checked: 3, verified: 1, expired: 1 });
		expect((await row('live'))!.verified_at).not.toBeNull();
		expect(await row('old')).toBeNull();
		expect(hosts.has('cf-old')).toBe(false);
		expect((await row('new'))!.verified_at).toBeNull();
	});

	it('never releases a claim when Cloudflare cannot be asked', async () => {
		exec(`INSERT INTO custom_domains (id, org_id, domain, cf_hostname_id, created_at) VALUES ('old', 'o1', 'old.sk', 'cf-old', datetime('now', '-8 days'))`);
		apiDown = true;
		expect((await sweepCustomDomains(db)).expired).toBe(0);
		expect(await row('old')).not.toBeNull();

		// Not configured (a missing token): nothing is asked, nothing is deleted.
		apiDown = false;
		delete fakeEnv.CF_ZONE_ID;
		const before = calls.length;
		expect(await sweepCustomDomains(db)).toEqual({ checked: 0, verified: 0, unverified: 0, expired: 0 });
		expect(await row('old')).not.toBeNull();
		expect(calls.length).toBe(before);
	});

	it('the open settings page re-checks only stale pending domains of its own organisation', async () => {
		hosts.set('cf-a', { id: 'cf-a', hostname: 'a.sk', status: 'pending', ssl: { status: 'pending_validation' } });
		hosts.set('cf-b', { id: 'cf-b', hostname: 'b.sk', status: 'pending', ssl: { status: 'pending_validation' } });
		exec(`INSERT INTO custom_domains (id, org_id, domain, cf_hostname_id, checked_at) VALUES
			('a', 'o1', 'a.sk', 'cf-a', NULL),
			('b', 'o2', 'b.sk', 'cf-b', NULL)`);
		expect(await refreshPendingDomains(db, 'o1')).toBe(1);
		expect(await refreshPendingDomains(db, 'o1')).toBe(0); // just checked
		expect(calls).toEqual(['GET /client/v4/zones/zone/custom_hostnames/cf-a']);
	});
});
