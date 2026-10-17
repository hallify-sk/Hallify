import { describe, it, expect } from 'vitest';
import {
	EVENT_TYPE_KEYS,
	CUSTOM_EVENT_TYPE_MAX,
	normalizeEventType,
	parseEventTypes,
	serializeEventTypes,
	cleanCustomEventType,
	serializeReservationEventType,
	parseReservationEventType,
	eventTypeLabel,
} from './eventTypes';

const labels: Record<string, string> = {
	wedding: 'Svadba', ball: 'Ples', conference: 'Konferencia', birthday: 'Narodeniny', other: 'Iné',
};

describe('normalizeEventType', () => {
	it('keeps canonical keys', () => {
		for (const k of EVENT_TYPE_KEYS) expect(normalizeEventType(k)).toBe(k);
	});

	it('folds a legacy capitalized label back to its key', () => {
		expect(normalizeEventType('Wedding')).toBe('wedding');
	});

	it('drops anything it does not recognize', () => {
		expect(normalizeEventType('company party')).toBeNull();
		expect(normalizeEventType('')).toBeNull();
		expect(normalizeEventType(null)).toBeNull();
	});
});

describe('parseEventTypes (template matching)', () => {
	it('reads the JSON array a template now stores', () => {
		expect(parseEventTypes('["wedding","ball"]')).toEqual(['wedding', 'ball']);
	});

	it('still reads a legacy single value', () => {
		expect(parseEventTypes('wedding')).toEqual(['wedding']);
		expect(parseEventTypes('Wedding')).toEqual(['wedding']);
	});

	it('drops unknown entries and de-duplicates', () => {
		expect(parseEventTypes('["wedding","nope","Wedding"]')).toEqual(['wedding']);
	});

	it('returns nothing for empty or malformed input', () => {
		expect(parseEventTypes(null)).toEqual([]);
		expect(parseEventTypes('')).toEqual([]);
		expect(parseEventTypes('["wedding"')).toEqual([]);
	});

	it('never reads a reservation custom label as a template key', () => {
		// reservations.event_type can hold `other:<label>`; template matching must
		// fold that to nothing rather than inventing a key from it.
		expect(parseEventTypes('other:Company party')).toEqual([]);
	});

	it('round-trips through serializeEventTypes', () => {
		const stored = serializeEventTypes(['ball', 'nope', 'Ball', 'wedding']);
		expect(stored).toBe('["ball","wedding"]');
		expect(parseEventTypes(stored)).toEqual(['ball', 'wedding']);
		expect(serializeEventTypes(['nope'])).toBeNull();
	});
});

describe('cleanCustomEventType', () => {
	it('collapses whitespace and strips control characters', () => {
		expect(cleanCustomEventType('  Firemný\tvečierok \n')).toBe('Firemný večierok');
	});

	it('does not truncate — length is validated, not silently cut', () => {
		const long = 'x'.repeat(CUSTOM_EVENT_TYPE_MAX + 10);
		expect(cleanCustomEventType(long)).toHaveLength(CUSTOM_EVENT_TYPE_MAX + 10);
	});

	it('handles empty input', () => {
		expect(cleanCustomEventType(null)).toBe('');
	});
});

describe('reservations.event_type round trip', () => {
	it('stores a typed-in "Other" label alongside the key', () => {
		const stored = serializeReservationEventType('other', 'Firemný večierok');
		expect(stored).toBe('other:Firemný večierok');
		expect(parseReservationEventType(stored)).toEqual({ key: 'other', custom: 'Firemný večierok' });
		expect(eventTypeLabel(stored, labels)).toBe('Firemný večierok');
	});

	it('falls back to the plain key when "Other" is left blank', () => {
		expect(serializeReservationEventType('other', '   ')).toBe('other');
		expect(parseReservationEventType('other')).toEqual({ key: 'other', custom: null });
		expect(eventTypeLabel('other', labels)).toBe('Iné');
	});

	it('ignores a stray label on a non-Other key', () => {
		expect(serializeReservationEventType('wedding', 'Company party')).toBe('wedding');
		expect(eventTypeLabel('wedding', labels)).toBe('Svadba');
	});

	it('stores nothing for an unset or unrecognized selection', () => {
		expect(serializeReservationEventType('', 'anything')).toBeNull();
		expect(serializeReservationEventType('bogus', 'anything')).toBeNull();
		expect(parseReservationEventType(null)).toEqual({ key: null, custom: null });
		expect(eventTypeLabel(null, labels)).toBeNull();
	});

	it('survives a label that contains the prefix or a colon', () => {
		const stored = serializeReservationEventType('other', 'Other: the sequel');
		expect(stored).toBe('other:Other: the sequel');
		expect(parseReservationEventType(stored).custom).toBe('Other: the sequel');
	});
});
