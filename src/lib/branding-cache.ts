let cacheTime = 0;
export const BRANDING_CACHE_TTL = 30_000;

export function getBrandingCacheTime() { return cacheTime; }
export function setBrandingCacheTime(t: number) { cacheTime = t; }
export function invalidateBrandingCache() { cacheTime = 0; }
