// ─── RSVP response helpers ────────────────────────────────────────────────
// rsvp_entries.responses stores a self-describing list of the answers a guest
// gave on the public RSVP form, so the editor and the printable manifest can
// render them without re-reading the event's field configuration.

export interface RsvpResponse {
	name: string;
	label: string;
	type: string;
	value: string | string[] | boolean;
}

/** Parse the JSON stored in rsvp_entries.responses into a typed list. */
export function parseResponses(json: string | null | undefined): RsvpResponse[] {
	if (!json) return [];
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? (parsed as RsvpResponse[]) : [];
	} catch {
		return [];
	}
}

/** The list of allergens a guest reported, across every allergies-type field. */
export function allergiesList(responses: RsvpResponse[]): string[] {
	const out: string[] = [];
	for (const r of responses) {
		if (r.type === 'allergies' && Array.isArray(r.value)) out.push(...r.value);
	}
	return out;
}

/** A short note string seeded from a guest's allergies, e.g. "Allergies: Nuts, Dairy". */
export function allergiesNote(responses: RsvpResponse[]): string {
	const list = allergiesList(responses);
	return list.length ? `Allergies: ${list.join(', ')}` : '';
}

/** Human-readable [label, text] pairs of all non-empty answers, for manifests. */
export function summarizeResponses(responses: RsvpResponse[]): { label: string; text: string }[] {
	const out: { label: string; text: string }[] = [];
	for (const r of responses) {
		let text = '';
		if (Array.isArray(r.value)) text = r.value.join(', ');
		else if (typeof r.value === 'boolean') text = r.value ? 'Yes' : '';
		else text = String(r.value ?? '').trim();
		if (text) out.push({ label: r.label, text });
	}
	return out;
}
