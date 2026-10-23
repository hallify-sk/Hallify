import { describe, expect, it } from 'vitest';
import {
	ADMINISTRATOR_PERMISSIONS,
	AREA_OPENERS,
	CONSOLE_PERMISSIONS,
	DEFAULT_ROLE_PERMISSIONS,
	PERMISSIONS,
	areaAccess,
	consoleEntryPermissions,
	sanitize,
	type AreaAccess,
	type Permission
} from './permissions';
import { consoleNav } from './console-nav';
import { mayPostInChannel, mayReadChannel } from './team-chat-access';

/**
 * The permission matrix (D3): what each permission, held on its own, lets a member
 * do. Every row of the role editor has to promise something this table delivers;
 * a permission that changes nothing here is a checkbox that lies.
 */
const NOTHING: AreaAccess = {
	reservations: { view: false, manage: false },
	calendar: { view: false, openReservations: false, create: false },
	halls: { view: false, manage: false, floorplans: false, templates: false, tableTypes: false },
	members: { view: false, manage: false },
	messages: { view: false, send: false },
	announcements: { post: false }
};

const EXPECTED: Record<Permission, Partial<{ [K in keyof AreaAccess]: Partial<AreaAccess[K]> }> | 'elsewhere'> = {
	'reservations.view': { reservations: { view: true }, calendar: { openReservations: true } },
	'reservations.manage': {
		reservations: { view: true, manage: true },
		calendar: { view: true, openReservations: true, create: true }
	},
	'halls.view': { halls: { view: true } },
	'halls.manage': { halls: { view: true, manage: true, tableTypes: true } },
	'floorplans.manage': { halls: { view: true, floorplans: true } },
	'templates.manage': { halls: { view: true, templates: true, tableTypes: true } },
	'calendar.view': { calendar: { view: true } },
	'messages.view': { messages: { view: true } },
	// Writing needs reading: alone, messages.send opens nothing.
	'messages.send': {},
	'announcements.manage': { announcements: { post: true } },
	'members.view': { members: { view: true } },
	'members.manage': { members: { view: true, manage: true } },
	// These are enforced by their own pages and actions (People tabs, settings,
	// billing, the assistant), not by the area matrix.
	'ai.use': 'elsewhere',
	'roles.manage': 'elsewhere',
	'invites.manage': 'elsewhere',
	'settings.manage': 'elsewhere',
	'billing.manage': 'elsewhere'
};

function expected(p: Permission): AreaAccess {
	const spec = EXPECTED[p];
	const out = structuredClone(NOTHING);
	if (spec === 'elsewhere') return out;
	for (const [area, flags] of Object.entries(spec)) Object.assign((out as never)[area], flags);
	return out;
}

describe('the permission matrix', () => {
	it('covers every permission in the catalogue', () => {
		expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISSIONS].sort());
	});

	for (const p of PERMISSIONS) {
		it(`gives ${p} on its own exactly what it promises`, () => {
			expect(areaAccess([p])).toEqual(expected(p));
		});
	}

	it('gives nothing to nobody', () => {
		expect(areaAccess([])).toEqual(NOTHING);
	});

	it('lets messages.send write once messages.view lets them read', () => {
		expect(areaAccess(['messages.view', 'messages.send']).messages).toEqual({ view: true, send: true });
	});

	it('gives the default Member role read-only pages and the right to write messages', () => {
		const a = areaAccess(DEFAULT_ROLE_PERMISSIONS);
		expect(a.reservations).toEqual({ view: true, manage: false });
		expect(a.halls).toEqual({ view: true, manage: false, floorplans: false, templates: false, tableTypes: false });
		expect(a.calendar).toEqual({ view: true, openReservations: true, create: false });
		expect(a.members).toEqual({ view: true, manage: false });
		expect(a.messages).toEqual({ view: true, send: true });
		expect(a.announcements.post).toBe(false);
	});

	it('gives an Administrator everything', () => {
		const a = areaAccess(ADMINISTRATOR_PERMISSIONS);
		expect(Object.values(a).every((area) => Object.values(area).every(Boolean))).toBe(true);
	});
});

describe('the console door', () => {
	it('opens on every area opener and every manage permission', () => {
		const entry = new Set(consoleEntryPermissions());
		for (const p of CONSOLE_PERMISSIONS) expect(entry.has(p)).toBe(true);
		for (const list of Object.values(AREA_OPENERS)) for (const p of list) expect(entry.has(p)).toBe(true);
	});

	it('only names permissions this build understands', () => {
		const entry = consoleEntryPermissions();
		expect(sanitize(entry)).toEqual(entry);
	});

	it('keeps the dashboard for manage permissions', () => {
		expect(CONSOLE_PERMISSIONS.filter((p) => p.endsWith('.view'))).toEqual([]);
		// announcements.manage posts in the team chat; on its own it opened nothing
		// but the dashboard.
		expect(CONSOLE_PERMISSIONS).not.toContain('announcements.manage');
	});

	it('shows a link for every area a permission opens, and none it does not', () => {
		for (const p of PERMISSIONS) {
			const a = areaAccess([p]);
			const nav = consoleNav('member', [p]);
			expect({ p, halls: nav.halls }).toEqual({ p, halls: a.halls.view });
			expect({ p, reservations: nav.reservations }).toEqual({ p, reservations: a.reservations.view });
			expect({ p, calendar: nav.calendar }).toEqual({ p, calendar: a.calendar.view });
			expect({ p, messages: nav.clientMessages }).toEqual({ p, messages: a.messages.view });
			expect({ p, members: nav.members === '/app/manage/members' }).toEqual({ p, members: a.members.view });
		}
	});
});

describe('team channels', () => {
	const general = { type: 'general', archived_at: null };
	const announcement = { type: 'announcement', archived_at: null };

	it('reads general channels on messages.view, and announcements always', () => {
		expect(mayReadChannel(areaAccess([]), general)).toBe(false);
		expect(mayReadChannel(areaAccess([]), announcement)).toBe(true);
		expect(mayReadChannel(areaAccess(['messages.view']), general)).toBe(true);
	});

	it('posts in general channels on messages.send, in announcements on announcements.manage', () => {
		expect(mayPostInChannel(areaAccess(['messages.view']), general)).toBe(false);
		expect(mayPostInChannel(areaAccess(['messages.view', 'messages.send']), general)).toBe(true);
		expect(mayPostInChannel(areaAccess(['messages.view', 'messages.send']), announcement)).toBe(false);
		expect(mayPostInChannel(areaAccess(['announcements.manage']), announcement)).toBe(true);
		expect(mayPostInChannel(areaAccess(['announcements.manage']), general)).toBe(false);
	});

	it('takes no posts in an archived channel', () => {
		const all = areaAccess(PERMISSIONS);
		expect(mayPostInChannel(all, { ...general, archived_at: '2026-01-01' })).toBe(false);
		expect(mayPostInChannel(all, { ...announcement, archived_at: '2026-01-01' })).toBe(false);
	});
});
