// Canonical event-type keys, shared across the template-creation dialog, template
// badges, and the client template filter. The key (lowercase) is what gets stored in
// `floorplan_templates.event_type`; human labels are resolved at render time via i18n
// (`t.eventTypes[key]`). Legacy templates may store a capitalized English label
// (e.g. "Wedding") — `normalizeEventType` folds those back to a key.

export const EVENT_TYPE_KEYS = ['wedding', 'ball', 'conference', 'birthday', 'other'] as const;
export type EventTypeKey = typeof EVENT_TYPE_KEYS[number];

/** Fold a stored event_type value (a key like "wedding", or a legacy label like
 *  "Wedding") to a canonical key, or null if unset/unrecognized. */
export function normalizeEventType(value: string | null | undefined): EventTypeKey | null {
  if (!value) return null;
  const v = value.toLowerCase();
  return (EVENT_TYPE_KEYS as readonly string[]).includes(v) ? (v as EventTypeKey) : null;
}

/** Parse a template's stored `event_type` column into a list of canonical keys.
 *  A template may now carry MULTIPLE types, stored as a JSON array (e.g.
 *  `["wedding","ball"]`). Legacy rows hold a single plain string ("wedding" or
 *  "Wedding") — both shapes are handled, and unknown values are dropped. */
export function parseEventTypes(raw: string | null | undefined): EventTypeKey[] {
  if (!raw) return [];
  let values: unknown[] = [raw];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { const parsed = JSON.parse(trimmed); if (Array.isArray(parsed)) values = parsed; }
    catch { /* fall back to single-value handling */ }
  }
  const out: EventTypeKey[] = [];
  for (const v of values) {
    const k = normalizeEventType(typeof v === 'string' ? v : null);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/** Serialize selected keys for storage in the `event_type` column — a JSON array,
 *  or null when empty. Input is normalized + de-duplicated. */
export function serializeEventTypes(keys: Iterable<string>): string | null {
  const out: EventTypeKey[] = [];
  for (const k of keys) {
    const n = normalizeEventType(k);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.length ? JSON.stringify(out) : null;
}

// ─── Reservation event type ──────────────────────────────────────────────────
// `floorplan_templates.event_type` (above) holds a SET of keys, because one layout
// can suit several occasions. `reservations.event_type` is a different thing: a
// single occasion, which may be one the canonical list does not name. Picking
// "Other" on the booking form reveals a text field, and that typed-in label is
// stored alongside the key as `other:<label>` so the value stays self-describing
// — a reader can still tell it is the "other" bucket, and the label survives.
//
// These helpers are deliberately separate from parseEventTypes/normalizeEventType:
// template matching must keep folding unknown values to nothing, and a prefixed
// custom label is not a template key.

/** Longest typed-in "Other" label we accept. Enforced server-side; the input
 *  carries the same cap as a maxlength so the UI agrees with the validator. */
export const CUSTOM_EVENT_TYPE_MAX = 60;

const CUSTOM_PREFIX = 'other:';

export interface ReservationEventType {
	/** Canonical key, or null when the stored value is unset/unrecognized. */
	key: EventTypeKey | null;
	/** The operator's own label, present only for a typed-in "Other". */
	custom: string | null;
}

/** Normalize a typed-in label: no control characters (it is rendered as a label),
 *  whitespace collapsed, trimmed. Does NOT truncate — length is validated, not
 *  silently cut, so an over-long value is reported rather than mangled. */
export function cleanCustomEventType(value: string | null | undefined): string {
	if (!value) return '';
	return value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Serialize a form's event-type pair for `reservations.event_type`.
 *  An unrecognized key stores nothing; "Other" with no label stores plain `other`. */
export function serializeReservationEventType(
	value: string | null | undefined,
	custom?: string | null
): string | null {
	const key = normalizeEventType(value);
	if (!key) return null;
	if (key !== 'other') return key;
	const label = cleanCustomEventType(custom);
	return label ? `${CUSTOM_PREFIX}${label}` : 'other';
}

/** Decode a stored `reservations.event_type` value. */
export function parseReservationEventType(raw: string | null | undefined): ReservationEventType {
	if (!raw) return { key: null, custom: null };
	const trimmed = raw.trim();
	if (trimmed.toLowerCase().startsWith(CUSTOM_PREFIX)) {
		const custom = cleanCustomEventType(trimmed.slice(CUSTOM_PREFIX.length));
		return { key: 'other', custom: custom || null };
	}
	return { key: normalizeEventType(trimmed), custom: null };
}

/** Human label for a stored reservation event type. `labels` is the caller's
 *  `t.eventTypes` dictionary, so this stays usable from both client and server. */
export function eventTypeLabel(
	raw: string | null | undefined,
	labels: Record<string, string>
): string | null {
	const { key, custom } = parseReservationEventType(raw);
	if (custom) return custom;
	return key ? (labels[key] ?? null) : null;
}
