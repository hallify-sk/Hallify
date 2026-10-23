import { error } from '@sveltejs/kit';
import { dbAll, dbFirst } from '$lib/db/index';
import { requireOrg } from '$lib/guards';
import { toCsv, exportFileName } from '$lib/org-export';
import type { RequestHandler } from './$types';

/**
 * Download the organisation's data: everything as JSON (?format=json, the default)
 * or the bookings as a spreadsheet (?format=csv).
 *
 * Owner only. The file holds every client's name and email, which is more than an
 * administrator needs to manage the venue, and the owner is the one who decides
 * to take the data elsewhere or close the organisation.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const org = requireOrg(locals);
	if (org.role !== 'owner' || org.impersonated) error(403, 'Forbidden');
	const db = locals.db;

	const reservations = await dbAll<Record<string, unknown>>(db,
		`SELECT r.id, r.title, r.description, r.event_date, r.start_time, r.end_time, r.status,
		        r.num_guests, r.extras_json, r.created_at,
		        h.name AS hall_name,
		        u.first_name AS client_first_name, u.last_name AS client_last_name, u.email AS client_email
		 FROM reservations r
		 LEFT JOIN halls h ON h.id = r.hall_id
		 LEFT JOIN users u ON u.id = r.user_id
		 WHERE r.org_id = ? OR r.hall_id IN (SELECT id FROM halls WHERE org_id = ?)
		 ORDER BY r.event_date DESC`,
		org.id, org.id);

	const meta = await dbFirst<{ slug: string; created_at: string }>(db,
		'SELECT slug, created_at FROM organizations WHERE id = ?', org.id);
	const slug = meta?.slug ?? org.id;

	if (url.searchParams.get('format') === 'csv') {
		const csv = toCsv(reservations, [
			{ key: 'event_date', label: 'Dátum' },
			{ key: 'start_time', label: 'Od' },
			{ key: 'end_time', label: 'Do' },
			{ key: 'title', label: 'Udalosť' },
			{ key: 'status', label: 'Stav' },
			{ key: 'num_guests', label: 'Hostia' },
			{ key: 'hall_name', label: 'Sála' },
			{ key: 'client_first_name', label: 'Meno' },
			{ key: 'client_last_name', label: 'Priezvisko' },
			{ key: 'client_email', label: 'E-mail' },
			{ key: 'description', label: 'Poznámka' },
			{ key: 'created_at', label: 'Vytvorené' },
		]);
		return new Response(csv, {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${exportFileName(slug, 'csv')}"`,
				'cache-control': 'no-store',
			},
		});
	}

	const halls = await dbAll(db, 'SELECT * FROM halls WHERE org_id = ? ORDER BY created_at', org.id);
	const hallIds = '(SELECT id FROM halls WHERE org_id = ?)';
	const resIds = `(SELECT id FROM reservations WHERE org_id = ? OR hall_id IN ${hallIds})`;
	const guests = await dbAll(db,
		`SELECT reservation_id, name, email, extra_guests, responses, created_at FROM rsvp_entries WHERE reservation_id IN ${resIds}`,
		org.id, org.id);
	// Explicit columns: never a password hash or a session.
	const clients = await dbAll(db,
		`SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.account_type, u.created_at
		 FROM users u
		 WHERE (u.org_id = ? AND u.account_type = 'client')
		    OR u.id IN (SELECT user_id FROM reservations WHERE org_id = ? OR hall_id IN ${hallIds})`,
		org.id, org.id, org.id);
	const members = await dbAll(db,
		`SELECT u.first_name, u.last_name, u.email, m.role, m.joined_at
		 FROM organization_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ?`, org.id);
	const settings = await dbAll(db, 'SELECT key, value, updated_at FROM org_settings WHERE org_id = ?', org.id);
	const extras = await dbAll(db, `SELECT * FROM hall_extras WHERE hall_id IN ${hallIds}`, org.id).catch(() => []);
	const tableTypes = await dbAll(db, `SELECT * FROM table_types WHERE hall_id IN ${hallIds}`, org.id).catch(() => []);
	const blocks = await dbAll(db, `SELECT * FROM hall_blocks WHERE hall_id IN ${hallIds}`, org.id).catch(() => []);
	const rsvpTemplates = await dbAll(db, 'SELECT * FROM rsvp_templates WHERE org_id = ?', org.id).catch(() => []);
	const domains = await dbAll(db, 'SELECT domain, verified_at, created_at FROM custom_domains WHERE org_id = ?', org.id);
	// Webhooks without their signing secrets.
	const webhooks = await dbAll(db, 'SELECT name, url, events, enabled, created_at FROM org_webhooks WHERE org_id = ?', org.id);
	const subscription = await dbFirst(db, 'SELECT plan, status, current_period_end FROM subscriptions WHERE org_id = ?', org.id);

	const body = JSON.stringify({
		exportedAt: new Date().toISOString(),
		organization: { id: org.id, name: org.name, slug, created_at: meta?.created_at ?? null },
		subscription,
		halls, hallExtras: extras, tableTypes, hallBlocks: blocks,
		reservations, guests, clients, members,
		rsvpTemplates, settings, customDomains: domains, webhooks,
	}, null, 2);

	return new Response(body, {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${exportFileName(slug, 'json')}"`,
			'cache-control': 'no-store',
		},
	});
};
