export interface Coordinates { latitude: number | null; longitude: number | null }

/** Accept either a complete WGS84 pair or an explicit clearing of both fields. */
export function parseCoordinates(lat: unknown, lng: unknown): Coordinates | null {
  const latitudeText = String(lat ?? '').trim();
  const longitudeText = String(lng ?? '').trim();
  if (!latitudeText && !longitudeText) return { latitude: null, longitude: null };
  if (!latitudeText || !longitudeText) return null;
  const latitude = Number(latitudeText), longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function hasCoordinates(value: Coordinates): boolean {
  return value.latitude !== null && value.longitude !== null &&
    Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}
