// Server-side translation. Picks the dictionary for the request's resolved locale
// (event.locals.locale) so +page.server.ts load/actions can localize fail()/error()
// messages. Servers can import the raw dictionaries directly (i18n.ts is data-only);
// they must NOT import the reactive `$lib/i18n.svelte` (that's client/runes-only).
import { sk, en, type Locale } from './i18n';

export function st(locale: Locale | undefined | null): typeof sk {
	return locale === 'en' ? en : sk;
}
