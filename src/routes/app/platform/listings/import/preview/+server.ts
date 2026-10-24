import { error, json } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { IMPORT_MAX_ITEMS } from '$lib/listing-import';
import { previewImport } from '$lib/server/listing-import';
import type { RequestHandler } from './$types';

/** The whole file, checked: each item valid by the form's rules, or why not, and
 *  whether it is a venue the directory already has. Writes nothing. */
export const POST: RequestHandler = async ({ request, locals }) => {
  requirePlatformAdmin(locals);
  const l = st(locals.locale).listings;
  let items: unknown;
  try {
    items = ((await request.json()) as { items?: unknown })?.items;
  } catch {
    error(400, l.importInvalidFile);
  }
  if (!Array.isArray(items)) error(400, l.importInvalidFile);
  if (items.length > IMPORT_MAX_ITEMS) error(400, l.importTooMany(IMPORT_MAX_ITEMS));
  return json({ rows: await previewImport(locals.db, items, l) });
};
