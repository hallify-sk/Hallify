import { error, json } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { IMPORT_CHUNK } from '$lib/listing-import';
import { importChunk } from '$lib/server/listing-import';
import type { RequestHandler } from './$types';

/** One chunk of the import (at most IMPORT_CHUNK venues): the page loops over the
 *  file, so one request never fetches more than a few photos. */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
  requirePlatformAdmin(locals);
  const l = st(locals.locale).listings;
  let entries: unknown;
  try {
    entries = ((await request.json()) as { entries?: unknown })?.entries;
  } catch {
    error(400, l.importInvalidFile);
  }
  if (!Array.isArray(entries) || entries.length > IMPORT_CHUNK) error(400, l.importInvalidFile);
  const valid = entries.filter((e): e is { index: number; item: unknown } =>
    !!e && typeof e === 'object' && Number.isInteger((e as { index?: unknown }).index));
  return json({ results: await importChunk(locals, platform?.env?.R2, valid, l) });
};
