import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { isSafeWebhookUrl } from '$lib/safe-url';
import { PLATFORM_EVENTS } from '$lib/platform-webhook-events';
import { logPlatformAction } from '$lib/server/platform-audit';
import {
	AUTO_DISABLE_AFTER,
	MAX_ATTEMPTS,
	generateWebhookSecret,
	redeliverPlatformDelivery,
	sendPlatformTest,
} from '$lib/server/platform-webhooks';
import type { Actions, PageServerLoad } from './$types';

interface EndpointRow {
	id: string;
	url: string;
	secret: string;
	events: string | null;
	enabled: number;
	description: string | null;
	created_at: string;
	consecutive_failures: number;
	disabled_reason: string | null;
	disabled_at: string | null;
	last_success_at: string | null;
	last_failure_at: string | null;
	created_by_email: string | null;
}

function parseEvents(raw: string | null): string[] | null {
	if (raw === null) return null;
	try {
		const list: unknown = JSON.parse(raw);
		return Array.isArray(list) ? list.filter((e): e is string => typeof e === 'string') : [];
	} catch {
		return [];
	}
}

/** The create/edit form: URL, description and events (every event, or a chosen few). */
function readForm(data: FormData, locale: App.Locals['locale']) {
	const tx = st(locale).platformWebhooks;
	const url = String(data.get('url') ?? '').trim();
	const description = String(data.get('description') ?? '').trim().slice(0, 200);
	const all = data.get('scope') !== 'selected';
	const chosen = PLATFORM_EVENTS.filter((e) => data.get(`event_${e}`) === 'on');
	const values = { url, description, all, events: chosen as string[] };
	if (!isSafeWebhookUrl(url) || url.length > 2000) return { error: tx.urlRules, values };
	if (!all && chosen.length === 0) return { error: tx.noEventsChosen, values };
	return { url, description: description || null, events: all ? null : JSON.stringify(chosen), values };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requirePlatformAdmin(locals);
	const endpointFilter = (url.searchParams.get('endpoint') ?? '').slice(0, 64);

	let rows: EndpointRow[] = [];
	try {
		rows = await dbAll<EndpointRow>(locals.db,
			`SELECT w.id, w.url, w.secret, w.events, w.enabled, w.description, w.created_at, w.consecutive_failures,
			        w.disabled_reason, w.disabled_at, w.last_success_at, w.last_failure_at, u.email AS created_by_email
			   FROM platform_webhooks w LEFT JOIN users u ON u.id = w.created_by
			  ORDER BY w.created_at DESC`);
	} catch {
		rows = []; // migration 0040 not applied yet
	}
	// The secret itself never leaves the server after it was shown once; its last
	// characters tell two endpoints apart.
	const endpoints = rows.map(({ secret, events, ...w }) => ({ ...w, events: parseEvents(events), secretTail: secret.slice(-4) }));

	const known = endpoints.some((e) => e.id === endpointFilter) ? endpointFilter : '';
	const deliveries = await dbAll<{
		id: string; webhook_id: string; event: string; payload: string; status: string; attempts: number;
		next_attempt_at: string | null; last_attempt_at: string | null; response_code: number | null; error: string | null;
		created_at: string; url: string;
	}>(locals.db,
		`SELECT d.id, d.webhook_id, d.event, d.payload, d.status, d.attempts, d.next_attempt_at, d.last_attempt_at,
		        d.response_code, d.error, d.created_at, w.url
		   FROM platform_webhook_deliveries d JOIN platform_webhooks w ON w.id = d.webhook_id
		  ${known ? 'WHERE d.webhook_id = ?' : ''}
		  ORDER BY d.created_at DESC, d.rowid DESC LIMIT 50`, ...(known ? [known] : [])).catch(() => []);

	const attempts = deliveries.length
		? await dbAll<{ delivery_id: string; attempt: number; trigger: string; status_code: number | null; duration_ms: number | null; error: string | null; response_body: string | null; attempted_at: string }>(locals.db,
			`SELECT delivery_id, attempt, trigger, status_code, duration_ms, error, response_body, attempted_at
			   FROM platform_webhook_attempts WHERE delivery_id IN (${deliveries.map(() => '?').join(',')})
			  ORDER BY attempted_at`, ...deliveries.map((d) => d.id)).catch(() => [])
		: [];

	return {
		endpoints,
		deliveries: deliveries.map((d) => ({ ...d, attempts_log: attempts.filter((a) => a.delivery_id === d.id) })),
		endpointFilter: known,
		limits: { maxAttempts: MAX_ATTEMPTS, autoDisableAfter: AUTO_DISABLE_AFTER },
	};
};

async function endpointOr404(locals: App.Locals, id: string) {
	return dbFirst<{ id: string; url: string; enabled: number; description: string | null; events: string | null }>(locals.db,
		'SELECT id, url, enabled, description, events FROM platform_webhooks WHERE id = ?', id);
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const admin = requirePlatformAdmin(locals);
		const parsed = readForm(await request.formData(), locals.locale);
		if ('error' in parsed) return fail(400, { formError: parsed.error, formId: 'create', values: parsed.values });
		const id = crypto.randomUUID();
		const secret = generateWebhookSecret();
		await dbRun(locals.db,
			'INSERT INTO platform_webhooks (id, url, secret, events, description, created_by) VALUES (?, ?, ?, ?, ?, ?)',
			id, parsed.url, secret, parsed.events, parsed.description, admin.id);
		await logPlatformAction(locals, 'webhook.create', { type: 'webhook', id, label: parsed.url }, { events: parsed.events ? JSON.parse(parsed.events) : 'all' });
		return { saved: true, revealed: { id, secret } };
	},

	update: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const current = await endpointOr404(locals, id);
		if (!current) return fail(404, { error: st(locals.locale).platformWebhooks.notFound });
		const parsed = readForm(data, locals.locale);
		if ('error' in parsed) return fail(400, { formError: parsed.error, formId: id, values: parsed.values });
		await dbRun(locals.db,
			`UPDATE platform_webhooks SET url = ?, events = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
			parsed.url, parsed.events, parsed.description, id);
		const changed: Record<string, unknown> = {};
		if (current.url !== parsed.url) changed.url = { from: current.url, to: parsed.url };
		if (current.events !== parsed.events) changed.events = parsed.events ? JSON.parse(parsed.events) : 'all';
		if ((current.description ?? null) !== parsed.description) changed.description = parsed.description;
		await logPlatformAction(locals, 'webhook.update', { type: 'webhook', id, label: parsed.url }, changed);
		return { saved: true };
	},

	/** Pause or switch on. Switching on clears an automatic switch-off and its count. */
	toggle: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		const current = await endpointOr404(locals, id);
		if (!current) return fail(404, { error: st(locals.locale).platformWebhooks.notFound });
		const enable = !current.enabled;
		await dbRun(locals.db,
			enable
				? `UPDATE platform_webhooks SET enabled = 1, consecutive_failures = 0, disabled_reason = NULL, disabled_at = NULL, updated_at = datetime('now') WHERE id = ?`
				: `UPDATE platform_webhooks SET enabled = 0, disabled_reason = NULL, disabled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
			id);
		await logPlatformAction(locals, enable ? 'webhook.enable' : 'webhook.disable', { type: 'webhook', id, label: current.url });
		return { saved: true };
	},

	rollSecret: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		const current = await endpointOr404(locals, id);
		if (!current) return fail(404, { error: st(locals.locale).platformWebhooks.notFound });
		const secret = generateWebhookSecret();
		await dbRun(locals.db, `UPDATE platform_webhooks SET secret = ?, updated_at = datetime('now') WHERE id = ?`, secret, id);
		await logPlatformAction(locals, 'webhook.roll_secret', { type: 'webhook', id, label: current.url });
		return { revealed: { id, secret } };
	},

	delete: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		const current = await endpointOr404(locals, id);
		if (!current) return fail(404, { error: st(locals.locale).platformWebhooks.notFound });
		await dbRun(locals.db, 'DELETE FROM platform_webhooks WHERE id = ?', id);
		await logPlatformAction(locals, 'webhook.delete', { type: 'webhook', id, label: current.url });
		return { deleted: true };
	},

	test: async ({ request, locals }) => {
		const admin = requirePlatformAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		const result = await sendPlatformTest(locals.db, id, admin.id);
		if (!result) return fail(404, { error: st(locals.locale).platformWebhooks.notFound });
		return { sendResult: { id, ok: result.ok, statusCode: result.statusCode, error: result.error } };
	},

	redeliver: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const deliveryId = String((await request.formData()).get('delivery_id') ?? '');
		const result = await redeliverPlatformDelivery(locals.db, deliveryId);
		if (!result) return fail(404, { error: st(locals.locale).platformWebhooks.notFound });
		return { sendResult: { id: deliveryId, ok: result.ok, statusCode: result.statusCode, error: result.error } };
	},
};
