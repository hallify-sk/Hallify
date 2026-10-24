// "We map your venue for you" (0008, M25): what moving a request on does for the
// venue. Every status change Hallify makes is emailed to whoever asked (or, when
// they have left the organisation, to its owners) and shows in the organisation's
// notification centre; delivery hands over something real — the plan drawn in the
// hall's editor, or a file kept in private storage and downloaded from the hall page.

import { dbAll, dbFirst } from '$lib/db/index';
import { sendEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { escapeHtml, renderLayout } from '$lib/server/email-layout';
import { emailCopy } from '$lib/server/email-copy';
import { notifyOrg } from '$lib/server/notification-centre';
import { sniffImageType } from '$lib/server/image-sniff';

type Db = App.Locals['db'];

export const MAPPING_STATUSES = ['requested', 'contacted', 'scheduled', 'delivered', 'cancelled'] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export function isMappingStatus(s: unknown): s is MappingStatus {
	return MAPPING_STATUSES.includes(s as MappingStatus);
}

/** Longest message to the venue. */
export const MAX_REPLY_NOTE = 2000;
/** A measured plan as a PDF or a large picture; well above what one needs. */
export const MAX_DELIVERY_FILE = 20 * 1024 * 1024;

/** Delivery files live outside halls/, so /uploads never serves them publicly. */
export function deliveryFileKey(requestId: string, name: string): string {
	return `floorplan-deliveries/${requestId}/${Date.now()}-${safeFileName(name)}`;
}

/** A file name fit for a storage key and a Content-Disposition header. */
export function safeFileName(name: string): string {
	const base = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
		.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
	return base || 'podorys';
}

/** What a delivery file really is, from its first bytes: a PDF or a picture. */
export function sniffDeliveryType(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
	if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
	const image = sniffImageType(bytes);
	return image === 'image/gif' ? null : image;
}

/**
 * Whether a request may be marked delivered: something has to be handed over — the
 * hall's plan drawn in its editor, or a file. "Delivered" used to deliver nothing.
 */
export function canDeliver(hasFloorplan: boolean, hasFile: boolean): boolean {
	return hasFloorplan || hasFile;
}

/** The email telling the venue where its request stands. */
export function mappingStatusEmail(
	locale: string | null | undefined,
	o: { hall: string; status: MappingStatus; reply: string | null; fileName: string | null; url: string }
): { subject: string; html: string } {
	const lang = locale === 'en' ? 'en' : 'sk';
	const f = st(lang).floorplanService;
	const label = {
		requested: f.statusRequested, contacted: f.statusContacted, scheduled: f.statusScheduled,
		delivered: f.statusDelivered, cancelled: f.statusCancelled
	}[o.status];
	const body = {
		requested: f.emailBodyRequested, contacted: f.emailBodyContacted, scheduled: f.emailBodyScheduled,
		delivered: f.emailBodyDelivered, cancelled: f.emailBodyCancelled
	}[o.status](o.hall);
	const subject = f.emailSubject(o.hall, label);
	const html = renderLayout({
		locale: lang,
		brand: 'Hallify',
		subject,
		bodyHtml: `<p>${escapeHtml(body)}</p>`,
		details: [[f.emailStatus, label], [f.emailFile, o.status === 'delivered' ? o.fileName : null]],
		note: o.reply ? { label: st(lang).hallAdmin.mappingReplyLabel, text: o.reply } : null,
		cta: { label: f.emailCta, url: o.url },
		linkFallback: emailCopy(lang).footer.linkFallback
	});
	return { subject, html };
}

/**
 * Tell the venue that Hallify moved its request on: an email to the person who asked
 * (to the owners when that person is no longer a member) and a notification for
 * those who manage halls. Never throws: the status is saved whatever happens here.
 */
export async function announceMappingStatus(db: Db, requestId: string, origin: string, actorId: string | null): Promise<number> {
	try {
		const req = await dbFirst<{
			org_id: string; hall_id: string; hall_name: string; status: string; reply_note: string | null;
			delivery_file_name: string | null; requested_by: string;
		}>(db,
			`SELECT fr.org_id, fr.hall_id, h.name AS hall_name, fr.status, fr.reply_note, fr.delivery_file_name, fr.requested_by
			   FROM floorplan_requests fr JOIN halls h ON h.id = fr.hall_id WHERE fr.id = ?`, requestId);
		if (!req || !isMappingStatus(req.status)) return 0;

		await notifyOrg(db, {
			orgId: req.org_id, kind: 'mapping.updated',
			params: { hall: req.hall_name, status: req.status },
			link: `/app/manage/halls/${req.hall_id}#floorplan`, actorId,
			dedupeKey: `mapping:${requestId}`
		});

		let to = await dbAll<{ email: string; locale: string | null }>(db,
			`SELECT u.email, u.locale FROM users u
			   JOIN organization_members m ON m.user_id = u.id AND m.org_id = ?
			  WHERE u.id = ?`, req.org_id, req.requested_by);
		if (to.length === 0) {
			to = await dbAll<{ email: string; locale: string | null }>(db,
				`SELECT u.email, u.locale FROM users u
				   JOIN organization_members m ON m.user_id = u.id AND m.org_id = ? AND m.role = 'owner'`, req.org_id);
		}
		let sent = 0;
		const url = `${origin.replace(/\/$/, '')}/app/manage/halls/${req.hall_id}#floorplan`;
		for (const r of to) {
			const { subject, html } = mappingStatusEmail(r.locale, {
				hall: req.hall_name, status: req.status, reply: req.reply_note, fileName: req.delivery_file_name, url
			});
			if (await sendEmail(db, r.email, subject, html, 'floorplan-request-status').catch(() => false)) sent++;
		}
		return sent;
	} catch (err) {
		console.error('announceMappingStatus failed', err);
		return 0;
	}
}
