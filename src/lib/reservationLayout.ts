// Shared seating-layout builder for a reservation — used by both the staff
// (/app/reservation/[id]/…) and the client (/halls/my-reservations/[id]/…)
// editor + manifest routes so they always agree on the same layout + guest list.

import { dbAll, fromJson } from '$lib/db/index';
import { migrateToMultiFloor } from '$lib/floorplan-types';
import type { MultiFloorState } from '$lib/floorplan-types';
import { parseResponses, allergiesNote, summarizeResponses } from '$lib/rsvp';
import type { D1Database } from '@cloudflare/workers-types';

export interface RsvpEntryRow { id: string; name: string; email: string | null; extra_guests: number; responses: string | null }

/** Base layout (saved arrangement if it has content, else the hall floor plan)
 *  with attending RSVPs merged in as seatable guests: the invitee
 *  (`rsvp_<id>_0`) + N anonymous "Guest" placeholders, grouped under the
 *  invitee's name, with the invitee's allergies seeded as a note. Stable ids
 *  keep seat assignments + manual notes across reloads. */
export async function buildSeatableLayout(
	db: D1Database,
	reservationId: string,
	hallFloorplanRaw: unknown,
	layoutRaw: unknown
): Promise<{ layout: MultiFloorState; rsvps: RsvpEntryRow[] }> {
	const savedLayout = fromJson(layoutRaw as string | null) as Record<string, unknown>;
	const hasSaved = !!savedLayout && typeof savedLayout === 'object' && (
		Array.isArray(savedLayout.floors) ? savedLayout.floors.length > 0
		: (!!savedLayout.tables || !!savedLayout.walls || !!savedLayout.zones)
	);
	const layout = migrateToMultiFloor(hasSaved ? savedLayout : fromJson(hallFloorplanRaw as string | null));

	const rsvps = await dbAll<RsvpEntryRow>(db,
		'SELECT id, name, email, extra_guests, responses FROM rsvp_entries WHERE reservation_id = ? ORDER BY created_at',
		reservationId);

	const gids = new Set(layout.guests.map((g) => g.id));
	const existing = new Map(layout.guests.map((g) => [g.id, g]));
	const addGuest = (id: string, firstName: string, lastName: string, group: string, note?: string) => {
		if (!gids.has(id)) { layout.guests.push({ id, firstName, lastName, group, note }); gids.add(id); return; }
		const g = existing.get(id);
		if (g && note && (!g.note || g.note.startsWith('Allergies:'))) g.note = note;
	};
	for (const r of rsvps) {
		const nm = (r.name ?? '').trim();
		const parts = nm.split(/\s+/);
		const note = allergiesNote(parseResponses(r.responses));
		addGuest(`rsvp_${r.id}_0`, parts[0] || nm, parts.slice(1).join(' '), nm, note || undefined);
		for (let i = 1; i <= (r.extra_guests || 0); i++) addGuest(`rsvp_${r.id}_${i}`, 'Guest', String(i), nm);
	}

	return { layout, rsvps };
}

/** Per-guest RSVP detail (email + answers) keyed by the invitee's stable guest id,
 *  for the manifest legend. */
export function rsvpDetailMap(rsvps: RsvpEntryRow[]): Record<string, { email: string | null; responses: { label: string; text: string }[] }> {
	const out: Record<string, { email: string | null; responses: { label: string; text: string }[] }> = {};
	for (const r of rsvps) {
		out[`rsvp_${r.id}_0`] = { email: r.email, responses: summarizeResponses(parseResponses(r.responses)) };
	}
	return out;
}
