import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { testD1 } from './test-d1';
import {
	MAX_BATCH, contactRate, hallStats, isBotUserAgent, orgMonthlyStats, parseListingBatch, parsePeriod, parseScope,
	recentMonths, recordListingEvents, statsCsv, totals, type StatsCsvLabels
} from './listing-stats';

let db: D1Database;
let exec: (sql: string) => void;
let query: <T>(sql: string) => Promise<T[]>;

beforeEach(async () => {
	({ db, exec } = await testD1());
	query = async <T>(sql: string) => ((await db.prepare(sql).all()).results as T[]);
	exec(`
		INSERT INTO organizations (id, name, slug, is_hallify_partner) VALUES ('paid', 'Kaštieľ', 'kastiel', 0), ('free', 'Reduta', 'reduta', 0), ('off', 'Zavreté', 'zavrete', 0);
		INSERT INTO organizations (id, name, slug, listing_only, is_hallify_partner) VALUES ('ext', 'Mlyn', 'mlyn', 1, 1);
		UPDATE organizations SET suspended_at = datetime('now') WHERE id = 'off';
		INSERT INTO subscriptions (id, org_id, plan, status) VALUES ('s1', 'paid', 'starter', 'active'), ('s2', 'free', 'free', 'active');
		INSERT INTO halls (id, org_id, name, slug, address, is_public) VALUES
		  ('h-paid', 'paid', 'Veľká sála', 'velka', 'Košice', 1),
		  ('h-free', 'free', 'Zrkadlová', 'zrkadlova', 'Košice', 1),
		  ('h-draft', 'free', 'Návrh', 'navrh', NULL, 0),
		  ('h-off', 'off', 'Zavretá', 'zavreta', 'Prešov', 1),
		  ('h-ext', 'ext', 'Mlyn', 'mlyn', 'Levoča', 1);
		UPDATE halls SET booking_mode = 'external' WHERE id = 'h-ext';
	`);
});

describe('event batches', () => {
	it('counts each hall and kind once per batch, skipping what is not an event', () => {
		const counts = parseListingBatch({ events: [
			{ hall_id: 'h-paid', type: 'impression' }, { hall_id: 'h-paid', type: 'impression' },
			{ hall_id: 'h-paid', type: 'website_click' }, { hall_id: 'h-free', type: 'detail_view' },
			{ hall_id: 'h-free', type: 'like' }, { hall_id: "x'; DROP TABLE halls;--", type: 'impression' }, null, 'junk'
		] });
		expect(Object.fromEntries(counts!)).toEqual({
			'h-paid': { impressions: 1, detail_views: 0, website_clicks: 1, phone_clicks: 0, email_clicks: 0 },
			'h-free': { impressions: 0, detail_views: 1, website_clicks: 0, phone_clicks: 0, email_clicks: 0 }
		});
	});

	it('refuses what is not a batch, or one longer than the cap', () => {
		expect(parseListingBatch(null)).toBeNull();
		expect(parseListingBatch({ events: 'x' })).toBeNull();
		expect(parseListingBatch({ events: Array.from({ length: MAX_BATCH + 1 }, () => ({ hall_id: 'h', type: 'impression' })) })).toBeNull();
		expect(parseListingBatch({ events: [] })?.size).toBe(0);
	});

	it('drops crawlers, previews, headless browsers and requests without a user agent', () => {
		for (const ua of [
			'', null, 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)',
			'facebookexternalhit/1.1', 'Mozilla/5.0 HeadlessChrome/120.0', 'curl/8.4.0', 'python-requests/2.31', 'Chrome-Lighthouse'
		]) expect(isBotUserAgent(ua), String(ua)).toBe(true);
		expect(isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36')).toBe(false);
		expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')).toBe(false);
	});
});

describe('recording', () => {
	it('adds to the day\'s row in one statement, and only for visible halls', async () => {
		const batch = parseListingBatch({ events: [
			{ hall_id: 'h-paid', type: 'impression' }, { hall_id: 'h-paid', type: 'phone_click' },
			{ hall_id: 'h-draft', type: 'impression' }, { hall_id: 'h-off', type: 'impression' }, { hall_id: 'nope', type: 'impression' }
		] })!;
		await recordListingEvents(db, batch, '2026-10-20');
		await recordListingEvents(db, batch, '2026-10-20');
		await recordListingEvents(db, parseListingBatch({ events: [{ hall_id: 'h-paid', type: 'impression' }] })!, '2026-10-21');
		const rows = await query<{ hall_id: string; day: string; impressions: number; phone_clicks: number }>(
			'SELECT hall_id, day, impressions, phone_clicks FROM listing_stats ORDER BY day');
		expect(rows).toEqual([
			{ hall_id: 'h-paid', day: '2026-10-20', impressions: 2, phone_clicks: 2 },
			{ hall_id: 'h-paid', day: '2026-10-21', impressions: 1, phone_clicks: 0 }
		]);
	});

	it('goes when the hall goes', async () => {
		await recordListingEvents(db, parseListingBatch({ events: [{ hall_id: 'h-free', type: 'impression' }] })!, '2026-10-20');
		exec(`DELETE FROM halls WHERE id = 'h-free'`);
		expect(await query('SELECT * FROM listing_stats')).toEqual([]);
	});
});

describe('periods', () => {
	it('reads the last 30 / 90 days and calendar months, nothing in the future', () => {
		expect(parsePeriod(null, '2026-10-24')).toEqual({ key: '30d', from: '2026-09-25', to: '2026-10-24' });
		expect(parsePeriod('90d', '2026-10-24')).toEqual({ key: '90d', from: '2026-07-27', to: '2026-10-24' });
		expect(parsePeriod('2026-02', '2026-10-24')).toEqual({ key: '2026-02', from: '2026-02-01', to: '2026-02-28' });
		expect(parsePeriod('2026-12', '2026-10-24').key).toBe('30d');
		expect(parsePeriod('2026-13', '2026-10-24').key).toBe('30d');
		expect(recentMonths('2026-02-10', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
		expect(parseScope('partner')).toBe('partner');
		expect(parseScope('nope')).toBe('all');
	});
});

describe('reports', () => {
	beforeEach(() => {
		exec(`
			INSERT INTO listing_stats (hall_id, day, impressions, detail_views, website_clicks, phone_clicks, email_clicks) VALUES
			  ('h-ext', '2026-10-01', 100, 20, 6, 3, 1),
			  ('h-ext', '2026-09-15', 50, 10, 1, 0, 0),
			  ('h-paid', '2026-10-02', 40, 8, 0, 2, 0),
			  ('h-free', '2026-08-01', 7, 1, 0, 0, 0);
		`);
	});

	it('sums each listed hall over the period, with clicks and click-through', async () => {
		const rows = await hallStats(db, { key: '2026-10', from: '2026-10-01', to: '2026-10-31' }, { kind: 'all' });
		expect(rows.map((r) => [r.hall_id, r.listing_type, r.impressions, r.clicks])).toEqual([
			['h-ext', 'external', 100, 10],
			['h-paid', 'partner', 40, 2],
			['h-free', 'basic', 0, 0]
		]);
		expect(rows[0].ctr).toBeCloseTo(0.5); // 10 clicks on 20 page views
		expect(rows[2].ctr).toBeNull();
		// Not listed (a draft, a suspended venue) and nothing counted: not in the report.
		expect(rows.some((r) => r.hall_id === 'h-draft' || r.hall_id === 'h-off')).toBe(false);
	});

	it('filters to venues not on Hallify, or to partners — never counting a listing as a partner', async () => {
		const period = { key: '90d', from: '2026-08-01', to: '2026-10-31' };
		expect((await hallStats(db, period, { kind: 'listing' })).map((r) => r.hall_id)).toEqual(['h-ext']);
		expect((await hallStats(db, period, { kind: 'partner' })).map((r) => r.hall_id)).toEqual(['h-paid']);
	});

	it('shows a venue its own halls only, and by month', async () => {
		const rows = await hallStats(db, { key: '90d', from: '2026-08-01', to: '2026-10-31' }, { kind: 'org', orgId: 'free' });
		expect(rows.map((r) => r.hall_id).sort()).toEqual(['h-draft', 'h-free']);
		expect(await orgMonthlyStats(db, 'ext', '2026-01')).toEqual([
			{ month: '2026-10', impressions: 100, detail_views: 20, website_clicks: 6, phone_clicks: 3, email_clicks: 1 },
			{ month: '2026-09', impressions: 50, detail_views: 10, website_clicks: 1, phone_clicks: 0, email_clicks: 0 }
		]);
	});

	it('totals rows and rates them', () => {
		const t = totals([
			{ impressions: 100, detail_views: 5, website_clicks: 3, phone_clicks: 1, email_clicks: 1 },
			{ impressions: 0, detail_views: 2, website_clicks: 0, phone_clicks: 0, email_clicks: 0 }
		]);
		expect(t).toEqual({ impressions: 100, detail_views: 7, website_clicks: 3, phone_clicks: 1, email_clicks: 1, clicks: 5, ctr: 5 / 7 });
		expect(contactRate(1, 0)).toBeNull();
	});

	it('exports CSV a spreadsheet opens: BOM, the period on each row, formulas defused', async () => {
		exec(`UPDATE organizations SET name = '=HYPERLINK("x")' WHERE id = 'paid'`);
		const period = { key: '2026-10', from: '2026-10-01', to: '2026-10-31' };
		const labels: StatsCsvLabels = {
			venue: 'Prevádzka', hall: 'Priestor', type: 'Typ', mode: 'Rezervácie', impressions: 'Zobrazenia', detailViews: 'Otvorenia',
			websiteClicks: 'Web', phoneClicks: 'Telefón', emailClicks: 'E-mail', clicks: 'Kliknutia', ctr: 'Miera kontaktu (%)', from: 'Od', to: 'Do',
			listingTypes: { partner: 'Partner', basic: 'Na Hallify', external: 'Mimo Hallify' },
			modes: { hallify: 'Cez Hallify', external: 'U prevádzky' }
		};
		const csv = statsCsv(await hallStats(db, period, { kind: 'all' }), period, labels, ';');
		const lines = csv.replace('﻿', '').trim().split('\r\n');
		expect(csv.startsWith('﻿')).toBe(true);
		expect(lines[0]).toBe('Prevádzka;Priestor;Typ;Rezervácie;Od;Do;Zobrazenia;Otvorenia;Web;Telefón;E-mail;Kliknutia;Miera kontaktu (%)');
		expect(lines[1]).toBe('Mlyn;Mlyn;Mimo Hallify;U prevádzky;2026-10-01;2026-10-31;100;20;6;3;1;10;50,00');
		expect(lines[2].startsWith(`"'=HYPERLINK(""x"")";Veľká sála;Partner;`)).toBe(true);
		expect(lines[3].endsWith(';0;0;0;0;0;0;')).toBe(true);
	});
});

describe('external halls in the database (0041)', () => {
	it('never take Hallify bookings, whoever writes the row', async () => {
		exec(`UPDATE halls SET allow_reservations = 1 WHERE id = 'h-ext'`);
		exec(`INSERT INTO halls (id, org_id, name, booking_mode, allow_reservations) VALUES ('h-new', 'ext', 'Nová', 'external', 1)`);
		exec(`UPDATE halls SET booking_mode = 'external' WHERE id = 'h-free'`);
		const rows = await query<{ id: string; allow_reservations: number }>(
			`SELECT id, allow_reservations FROM halls WHERE id IN ('h-ext', 'h-new', 'h-free') ORDER BY id`);
		expect(rows).toEqual([
			{ id: 'h-ext', allow_reservations: 0 }, { id: 'h-free', allow_reservations: 0 }, { id: 'h-new', allow_reservations: 0 }
		]);
		// Every existing hall keeps today's behaviour.
		expect((await query<{ booking_mode: string }>(`SELECT booking_mode FROM halls WHERE id = 'h-paid'`))[0].booking_mode).toBe('hallify');
		expect(() => exec(`UPDATE halls SET booking_mode = 'phone' WHERE id = 'h-paid'`)).toThrow();
	});
});
