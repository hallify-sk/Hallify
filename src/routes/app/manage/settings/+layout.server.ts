import type { LayoutServerLoad } from './$types';
import { canManageSettings } from '$lib/server/settings-access';

/** Whether to show every tab, or only Advanced (where any member can leave). */
export const load: LayoutServerLoad = async ({ locals }) => {
	return { canManageSettings: await canManageSettings(locals) };
};
