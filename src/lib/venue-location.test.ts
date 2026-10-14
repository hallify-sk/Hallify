import { describe, expect, it } from 'vitest';
import { parseCoordinates, hasCoordinates } from './venue-location';

describe('venue map coordinates', () => {
  it('accepts zero coordinates and both geographic boundaries', () => {
    expect(parseCoordinates('0', '0')).toEqual({ latitude: 0, longitude: 0 });
    expect(parseCoordinates('-90', '180')).toEqual({ latitude: -90, longitude: 180 });
    expect(hasCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
  });
  it('clears an optional position only when both fields are blank', () => {
    expect(parseCoordinates('', null)).toEqual({ latitude: null, longitude: null });
    expect(parseCoordinates('50.08', '')).toBeNull();
    expect(parseCoordinates('', '14.42')).toBeNull();
    expect(hasCoordinates({ latitude: null, longitude: 0 })).toBe(false);
  });
  it('rejects nonfinite and out of range positions', () => {
    for (const pair of [['91', '14'], ['50', '-181'], ['NaN', '14'], ['50', 'Infinity'], ['no location', '14']]) {
      expect(parseCoordinates(...pair as [string, string])).toBeNull();
    }
  });
});
