import { isHttpError } from '@sveltejs/kit';
import { requireOrgPermission } from '$lib/server/access';
import { st } from '$lib/i18n-server';
import type { LeaveRefusal } from '$lib/orgLifecycle';

/** Why leaving was refused, in the viewer's language. */
export function leaveRefusalMessage(reason: LeaveRefusal, locale: App.Locals['locale']): string {
	const t = st(locale).serverErrors;
	if (reason === 'notMember') return t.notMemberOfOrg;
	if (reason === 'lastMember') return t.lastMemberCloseOrgInstead;
	return t.onlyOwnerPromoteOrClose;
}

/** settings.manage as a yes/no, for settings pages an ordinary member may also open
 *  (the Advanced tab, where anyone can leave the organisation). */
export async function canManageSettings(locals: App.Locals): Promise<boolean> {
	try {
		await requireOrgPermission(locals, 'settings.manage');
		return true;
	} catch (e) {
		if (isHttpError(e) && e.status === 403) return false;
		throw e;
	}
}
