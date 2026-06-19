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
