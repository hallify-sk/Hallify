// A member's built-in organisation role in the reader's language. The raw key
// ('owner', 'member') used to be shown, capitalised by CSS, in the Slovak UI.

import { sk, en } from './i18n';
import { sameRoleName } from './permissions';

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

/** Every name a role is shown under: the stored one and its display name in each
 *  language. */
function shownNames(name: string): string[] {
	return [name, roleDisplayName(name, sk), roleDisplayName(name, en)];
}

/**
 * Whether two role names would read as the same role somewhere in the UI.
 *
 * `sameRoleName` alone compares the stored names, so a role called 'Člen' cleared
 * it against the seeded 'Member' and the Slovak Roles tab then showed two 'Člen'
 * roles. The display names in every language are compared as well.
 */
export function roleNamesClash(a: string, b: string): boolean {
	const shownA = shownNames(a);
	return shownNames(b).some((nb) => shownA.some((na) => sameRoleName(na, nb)));
}
