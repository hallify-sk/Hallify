import { sk, en } from '$lib/i18n';

type ProfileKey = keyof typeof sk.hallProfile;

/** The built-in amenity keys and the label each one has on the venue site. */
const BUILT_IN: Record<string, ProfileKey> = {
  parking: 'amenityParking', catering: 'amenityCatering', av: 'amenityAv', wifi: 'amenityWifi',
  ac: 'amenityAc', accessible: 'amenityAccessible', outdoor: 'amenityOutdoor', stage: 'amenityStage',
  dancefloor: 'amenityDancefloor', bar: 'amenityBar',
};

export interface CustomAmenity { slug: string; label_sk: string | null; label_en: string | null }

/**
 * What a visitor reads for an amenity key: the translated name of a built-in one,
 * or the organisation's own label for a custom one, in the visitor's language with
 * the other as a fallback. Null for a key nobody can name any more (a custom
 * amenity the venue has since deleted), so the page never shows "custom-virivka".
 */
export function amenityLabel(key: string, locale: 'sk' | 'en', custom: CustomAmenity[] = []): string | null {
  const builtIn = BUILT_IN[key];
  if (builtIn) return String((locale === 'en' ? en : sk).hallProfile[builtIn]);
  const own = custom.find(item => item.slug === key);
  if (!own) return null;
  const first = locale === 'en' ? own.label_en : own.label_sk;
  const second = locale === 'en' ? own.label_sk : own.label_en;
  return first?.trim() || second?.trim() || null;
}

/** Labels for a hall's amenities, unknown keys dropped and duplicates removed. */
export function amenityLabels(keys: string[], locale: 'sk' | 'en', custom: CustomAmenity[] = []): string[] {
  const labels = keys.map(key => amenityLabel(key, locale, custom)).filter((label): label is string => !!label);
  return [...new Set(labels)];
}
