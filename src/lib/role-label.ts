// A member's built-in organisation role in the reader's language. The raw key
// ('owner', 'member') used to be shown, capitalised by CSS, in the Slovak UI.

import type { sk } from './i18n';

export function orgRoleLabel(role: string | null | undefined, t: typeof sk): string {
	switch (role) {
		case 'owner': return t.membersAdmin.roleOwner;
		case 'admin': return t.membersAdmin.roleAdmin;
		case 'member': return t.membersAdmin.roleMember;
		default: return role ?? '';
	}
}

/** The two roles every organisation is seeded with are stored under English names
 *  ('Administrator', 'Member'; other code finds the first by that name), so they are
 *  translated for display only. A name an organisation chose is shown as it is. */
export function roleDisplayName(name: string, t: typeof sk): string {
	if (name === 'Administrator') return t.membersAdmin.roleAdmin;
	if (name === 'Member') return t.membersAdmin.roleMember;
	return name;
}
