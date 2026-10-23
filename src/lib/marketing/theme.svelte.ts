/**
 * The marketing pages' light/dark choice.
 *
 * It used to be a $state inside MarketingShell, and every marketing page renders its
 * own shell, so the choice was forgotten on the next click. It now lives at module
 * scope for the rest of the visit and in a cookie for the next one, which the page
 * loads read so the server renders the chosen theme and nothing flashes.
 *
 * The module state is only ever written from a click, so on the server, where
 * module state is shared between requests, it stays null and the cookie decides.
 */
export type MarketingTheme = 'light' | 'dark';

export const MARKETING_THEME_COOKIE = 'hallify-marketing-theme';

let chosen = $state<MarketingTheme | null>(null);

/** The theme picked during this visit, if any. */
export function chosenMarketingTheme(): MarketingTheme | null {
  return chosen;
}

export function chooseMarketingTheme(theme: MarketingTheme): void {
  chosen = theme;
  if (typeof document === 'undefined') return;
  document.cookie = `${MARKETING_THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** A cookie value, or null for anything that is not a theme. */
export function readMarketingTheme(value: string | null | undefined): MarketingTheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}
