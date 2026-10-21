import type { D1Database } from '@cloudflare/workers-types';
import { dbAll } from '$lib/db/index';
import { inventoryOverage } from '$lib/floorplan-geometry';
import { st } from '$lib/i18n-server';
import type { Locale } from '$lib/i18n';

/**
 * Why a layout may not be saved, or null when it may: it places more of a table
 * type than the hall owns. The editor stops this as tables are placed; this is
 * the rule for anything that posts a layout on its own.
 */
export async function tableInventoryError(
	db: D1Database, hallId: string, layoutJson: string, locale: Locale | undefined | null
): Promise<string | null> {
	const types = await dbAll<{ id: string; name: string; amount: number }>(db,
		'SELECT id, name, amount FROM table_types WHERE hall_id = ? AND amount > 0', hallId);
	if (!types.length) return null;
	const over = inventoryOverage(layoutJson, types);
	if (!over.length) return null;
	return st(locale).serverErrors.tableInventoryExceeded(over.map((o) => `${o.name} ${o.used}/${o.amount}`).join(', '));
}
