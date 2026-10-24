// First-party counters for directory listings: how often each hall was shown, opened,
// and how often its website, phone or e-mail was clicked. Written by
// POST /api/listing-events, read by the platform's listings report (and its CSV for
// sales offers) and by each venue's console.
//
// PRIVACY. Nothing here identifies a visitor: no cookie is set or read, and no IP
// address, user agent or identifier is stored — only a count per hall and day. The
// rate limit keys on a one-way hash of the address that is discarded with its
// window. With no personal data and nothing stored on the visitor's device, these
// counters need no consent (unlike GA4, which runs only after the banner).

import { dbAll } from '$lib/db/index';
import { csvCell } from '$lib/csvExport';
import { LISTING_EVENT_TYPES, listingType, type ListingEventType, type ListingType } from '$lib/listings';
import { PARTNER_SQL } from './discovery';

type Db = App.Locals['db'];

/** Most events one request may carry. The page sends far fewer (one per card seen). */
export const MAX_BATCH = 50;

/** The counter column each event type adds to. */
const COLUMN: Record<ListingEventType, keyof Counts> = {
	impression: 'impressions',
	detail_view: 'detail_views',
	website_click: 'website_clicks',
	phone_click: 'phone_clicks',
	email_click: 'email_clicks'
};

export interface Counts {
	impressions: number;
	detail_views: number;
	website_clicks: number;
	phone_clicks: number;
	email_clicks: number;
}

const zero = (): Counts => ({ impressions: 0, detail_views: 0, website_clicks: 0, phone_clicks: 0, email_clicks: 0 });

/**
 * Crawlers, link previews, uptime checks and headless browsers. They load pages and
 * scroll cards into view like a person, and would inflate exactly the figure a venue
 * is shown in an offer. A missing user agent is not a browser either.
 */
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|scrap|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|telegram|curl\/|wget|python|httpclient|okhttp|java\/|go-http|node-fetch|axios|monitor|pingdom|uptime|phantom|selenium|puppeteer|playwright|cypress/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
	const s = (ua ?? '').trim();
	return !s || BOT_UA.test(s);
}

const HALL_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Read a posted batch: `{ events: [{ hall_id, type }] }`. The same hall and type
 * twice in one batch counts once — the page already sends each once per page view,
 * so a repeat is a replay, not a second visitor. Null when the body is not a batch
 * at all or is longer than MAX_BATCH; unknown types and malformed ids are skipped.
 */
export function parseListingBatch(body: unknown): Map<string, Counts> | null {
	const events = (body as { events?: unknown } | null)?.events;
	if (!Array.isArray(events) || events.length > MAX_BATCH) return null;
	const seen = new Set<string>();
	const counts = new Map<string, Counts>();
	for (const e of events) {
		const hallId = (e as { hall_id?: unknown })?.hall_id;
		const type = (e as { type?: unknown })?.type;
		if (typeof hallId !== 'string' || !HALL_ID.test(hallId)) continue;
		if (!(LISTING_EVENT_TYPES as readonly unknown[]).includes(type)) continue;
		const key = `${hallId}\n${type}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const row = counts.get(hallId) ?? zero();
		row[COLUMN[type as ListingEventType]] += 1;
		counts.set(hallId, row);
	}
	return counts;
}

/** Today's date in UTC, the day a counter row belongs to. */
export function utcDay(now = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/**
 * A hall whose page or card a visitor can see: public and live, its organisation not
 * suspended. Looser than LISTED_HALL_SQL on purpose — a venue site shows a public
 * hall that has no address yet, and its page views count too.
 */
const COUNTABLE_HALL_SQL = `h.is_public = 1 AND h.plan_locked = 0 AND h.archived_at IS NULL AND o.suspended_at IS NULL`;

/**
 * Add a parsed batch to today's counters in ONE statement: the batch goes in as a
 * JSON parameter and is joined to the halls table, so an id that is not a countable
 * hall writes nothing, and each hall's row is created or incremented (UPSERT).
 */
export async function recordListingEvents(db: Db, counts: Map<string, Counts>, day = utcDay()): Promise<void> {
	if (!counts.size) return;
	const rows = [...counts].map(([h, c]) => ({ h, ...c }));
	await db.prepare(
		`INSERT INTO listing_stats (hall_id, day, impressions, detail_views, website_clicks, phone_clicks, email_clicks)
		 SELECT h.id, ?,
		        json_extract(j.value, '$.impressions'), json_extract(j.value, '$.detail_views'),
		        json_extract(j.value, '$.website_clicks'), json_extract(j.value, '$.phone_clicks'),
		        json_extract(j.value, '$.email_clicks')
		   FROM json_each(?) j
		   JOIN halls h ON h.id = json_extract(j.value, '$.h')
		   JOIN organizations o ON o.id = h.org_id
		  WHERE ${COUNTABLE_HALL_SQL}
		 ON CONFLICT (hall_id, day) DO UPDATE SET
		   impressions    = impressions    + excluded.impressions,
		   detail_views   = detail_views   + excluded.detail_views,
		   website_clicks = website_clicks + excluded.website_clicks,
		   phone_clicks   = phone_clicks   + excluded.phone_clicks,
		   email_clicks   = email_clicks   + excluded.email_clicks`
	).bind(day, JSON.stringify(rows)).run();
}

// ─── Reporting ───────────────────────────────────────────────────────────────

/** A reporting window: the last 30 or 90 days, or one calendar month (YYYY-MM). */
export interface StatsPeriod {
	key: string;
	/** First and last day, inclusive, YYYY-MM-DD. */
	from: string;
	to: string;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parsePeriod(raw: string | null | undefined, today = utcDay()): StatsPeriod {
	const value = (raw ?? '').trim();
	const m = MONTH.exec(value);
	if (m && value <= today.slice(0, 7)) {
		const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
		return { key: value, from: `${value}-01`, to: `${value}-${String(last).padStart(2, '0')}` };
	}
	const days = value === '90d' ? 90 : 30;
	const from = new Date(`${today}T00:00:00Z`);
	from.setUTCDate(from.getUTCDate() - (days - 1));
	return { key: `${days}d`, from: from.toISOString().slice(0, 10), to: today };
}

/** The current month and the eleven before it, newest first, for a month picker. */
export function recentMonths(today = utcDay(), count = 12): string[] {
	const [y, mo] = today.split('-').map(Number);
	return Array.from({ length: count }, (_, i) => {
		const d = new Date(Date.UTC(y, mo - 1 - i, 1));
		return d.toISOString().slice(0, 7);
	});
}

export interface HallStatsRow extends Counts {
	hall_id: string;
	hall_name: string;
	hall_slug: string | null;
	org_id: string;
	org_name: string;
	org_slug: string;
	booking_mode: string;
	listing_type: ListingType;
	/** Website, phone and e-mail clicks together. */
	clicks: number;
	/** Contact rate: clicks per page view, or null with no page views. */
	ctr: number | null;
}

/**
 * Contact clicks per page view; null with no page views. Not clicks per impression:
 * a contact is clicked on the venue's page (and a page is often reached from a search
 * engine or the venue's own site, never having been a card), so that ratio would run
 * past 100 %. Per page view it reads as "of those who looked closer, how many got in
 * touch". Several kinds of click on one view can still take it over 100 %, rarely.
 */
export function contactRate(clicks: number, views: number): number | null {
	return views > 0 ? clicks / views : null;
}

export type PlatformScope = 'all' | 'listing' | 'partner';
export type StatsScope = { kind: PlatformScope } | { kind: 'org'; orgId: string };

/** The platform report's filter: every listed hall, venues not on Hallify, or partners. */
export function parseScope(raw: string | null | undefined): PlatformScope {
	return raw === 'listing' || raw === 'partner' ? raw : 'all';
}

/** The directory's rule (LISTED_HALL_SQL) without the address check, which the
 *  report does not need: a listed hall's numbers matter however it is described. */
const LISTED_FOR_REPORT = `(${COUNTABLE_HALL_SQL})`;

type RawRow = Omit<HallStatsRow, 'listing_type' | 'clicks' | 'ctr'> & { listing_only: number; is_partner: number };

/**
 * One row per hall with its counters summed over the period. The platform sees every
 * listed hall (and any hall that collected numbers in the period, so a hall taken
 * off the directory still accounts for what it got); a venue sees all its own halls.
 */
export async function hallStats(db: Db, period: StatsPeriod, scope: StatsScope): Promise<HallStatsRow[]> {
	const where = scope.kind === 'org'
		? 'h.org_id = ? AND (h.archived_at IS NULL OR st.hall_id IS NOT NULL)'
		: `(${LISTED_FOR_REPORT} OR st.hall_id IS NOT NULL)${scope.kind === 'listing' ? ' AND o.listing_only = 1' : scope.kind === 'partner' ? ` AND ${PARTNER_SQL} = 1` : ''}`;
	const rows = await dbAll<RawRow>(db,
		`SELECT h.id AS hall_id, h.name AS hall_name, h.slug AS hall_slug, h.booking_mode,
		        o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.listing_only, ${PARTNER_SQL} AS is_partner,
		        COALESCE(st.impressions, 0) AS impressions, COALESCE(st.detail_views, 0) AS detail_views,
		        COALESCE(st.website_clicks, 0) AS website_clicks, COALESCE(st.phone_clicks, 0) AS phone_clicks,
		        COALESCE(st.email_clicks, 0) AS email_clicks
		   FROM halls h
		   JOIN organizations o ON o.id = h.org_id
		   LEFT JOIN subscriptions s ON s.org_id = o.id
		   LEFT JOIN (
		     SELECT hall_id, SUM(impressions) AS impressions, SUM(detail_views) AS detail_views,
		            SUM(website_clicks) AS website_clicks, SUM(phone_clicks) AS phone_clicks, SUM(email_clicks) AS email_clicks
		       FROM listing_stats WHERE day BETWEEN ? AND ? GROUP BY hall_id
		   ) st ON st.hall_id = h.id
		  WHERE ${where}
		  ORDER BY COALESCE(st.impressions, 0) DESC, COALESCE(st.detail_views, 0) DESC, o.name, h.name`,
		period.from, period.to, ...(scope.kind === 'org' ? [scope.orgId] : []));
	return rows.map(({ listing_only, is_partner, ...r }) => {
		const counts = {
			impressions: Number(r.impressions), detail_views: Number(r.detail_views),
			website_clicks: Number(r.website_clicks), phone_clicks: Number(r.phone_clicks), email_clicks: Number(r.email_clicks)
		};
		const clicks = counts.website_clicks + counts.phone_clicks + counts.email_clicks;
		return { ...r, ...counts, listing_type: listingType({ listing_only, is_partner }), clicks, ctr: contactRate(clicks, counts.detail_views) };
	});
}

/** Column sums over a set of rows, with the same derived figures as a row. */
export function totals(rows: Counts[]): Counts & { clicks: number; ctr: number | null } {
	const t = zero();
	for (const r of rows) for (const k of Object.keys(t) as (keyof Counts)[]) t[k] += r[k];
	const clicks = t.website_clicks + t.phone_clicks + t.email_clicks;
	return { ...t, clicks, ctr: contactRate(clicks, t.detail_views) };
}

export interface MonthStats extends Counts { month: string }

/** An organisation's halls together, month by month, the newest first. */
export async function orgMonthlyStats(db: Db, orgId: string, fromMonth: string): Promise<MonthStats[]> {
	const rows = await dbAll<MonthStats>(db,
		`SELECT substr(st.day, 1, 7) AS month,
		        SUM(st.impressions) AS impressions, SUM(st.detail_views) AS detail_views,
		        SUM(st.website_clicks) AS website_clicks, SUM(st.phone_clicks) AS phone_clicks, SUM(st.email_clicks) AS email_clicks
		   FROM listing_stats st JOIN halls h ON h.id = st.hall_id
		  WHERE h.org_id = ? AND st.day >= ?
		  GROUP BY month ORDER BY month DESC`,
		orgId, `${fromMonth}-01`);
	return rows.map((r) => ({
		month: r.month, impressions: Number(r.impressions), detail_views: Number(r.detail_views),
		website_clicks: Number(r.website_clicks), phone_clicks: Number(r.phone_clicks), email_clicks: Number(r.email_clicks)
	}));
}

export interface StatsCsvLabels {
	venue: string; hall: string; type: string; mode: string;
	impressions: string; detailViews: string; websiteClicks: string; phoneClicks: string; emailClicks: string; clicks: string; ctr: string;
	from: string; to: string;
	listingTypes: Record<ListingType, string>;
	modes: Record<'hallify' | 'external', string>;
}

/**
 * The report as CSV, for a sales offer: one row per hall, the period on every row so
 * a pasted extract still says what it covers. `delimiter` is ';' for a Slovak reader
 * (Excel on a comma-decimal locale only splits on semicolons), and the rate is a
 * plain number with the locale's decimal mark so the spreadsheet can sum it.
 */
export function statsCsv(rows: HallStatsRow[], period: StatsPeriod, labels: StatsCsvLabels, delimiter = ','): string {
	const decimal = delimiter === ';' ? ',' : '.';
	const head = [labels.venue, labels.hall, labels.type, labels.mode, labels.from, labels.to, labels.impressions, labels.detailViews,
		labels.websiteClicks, labels.phoneClicks, labels.emailClicks, labels.clicks, labels.ctr];
	const lines = [head.map((h) => csvCell(h, delimiter)).join(delimiter)];
	for (const r of rows) {
		lines.push([
			csvCell(r.org_name, delimiter), csvCell(r.hall_name, delimiter),
			csvCell(labels.listingTypes[r.listing_type], delimiter),
			csvCell(labels.modes[r.booking_mode === 'external' ? 'external' : 'hallify'], delimiter),
			period.from, period.to,
			r.impressions, r.detail_views, r.website_clicks, r.phone_clicks, r.email_clicks, r.clicks,
			r.ctr === null ? '' : (r.ctr * 100).toFixed(2).replace('.', decimal)
		].join(delimiter));
	}
	// A byte-order mark so Excel reads the Slovak letters as UTF-8.
	return '﻿' + lines.join('\r\n') + '\r\n';
}
