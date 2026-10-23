import { describe, it, expect } from 'vitest';
import { consoleNav } from './console-nav';
import { ADMINISTRATOR_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from './permissions';

describe('consoleNav', () => {
	it('gives the owner every link', () => {
		const nav = consoleNav('owner', PERMISSIONS);
		expect(nav).toEqual({
			console: true, section: true, halls: true, reservations: true, calendar: true, assistant: true,
			clientMessages: true, announcements: true, members: '/app/manage/members',
			billing: true, settings: true
		});
	});

	it('gives an admin everything they had before, billing included', () => {
		const nav = consoleNav('admin', ADMINISTRATOR_PERMISSIONS);
		expect(nav.console && nav.halls && nav.reservations && nav.settings && nav.billing && nav.clientMessages).toBe(true);
	});

	it('gives a plain member the read-only pages of the default role, without the dashboard', () => {
		const nav = consoleNav('member', DEFAULT_ROLE_PERMISSIONS);
		expect(nav.console).toBe(false);
		expect(nav.section).toBe(true);
		expect(nav.reservations && nav.halls && nav.calendar && nav.clientMessages).toBe(true);
		expect(nav.members).toBe('/app/manage/members');
		expect(nav.assistant || nav.settings || nav.billing || nav.announcements).toBe(false);
	});

	it('gives a member with no permissions nothing at all', () => {
		const nav = consoleNav('member', []);
		expect(Object.values(nav).some(Boolean)).toBe(false);
	});

	it('shows a custom role exactly the pages its permissions open', () => {
		const nav = consoleNav('member', ['reservations.manage', 'ai.use']);
		expect(nav.console).toBe(true);
		expect(nav.reservations).toBe(true);
		expect(nav.calendar).toBe(true);
		expect(nav.assistant).toBe(true);
		expect(nav.halls).toBe(false);
		expect(nav.settings).toBe(false);
		expect(nav.clientMessages).toBe(false);
		expect(nav.members).toBe(null);
	});

	it('takes a template-only role to the halls, where its templates live', () => {
		const nav = consoleNav('member', ['templates.manage']);
		expect(nav.console).toBe(true);
		expect(nav.halls).toBe(true);
		expect(nav.reservations || nav.settings).toBe(false);
	});

	it('follows a deny of a view permission', () => {
		const held = DEFAULT_ROLE_PERMISSIONS.filter((p) => p !== 'reservations.view' && p !== 'messages.view');
		const nav = consoleNav('member', held);
		expect(nav.reservations).toBe(false);
		expect(nav.clientMessages).toBe(false);
		expect(nav.calendar).toBe(true);
	});

	it('sends People to the first page the member may open', () => {
		expect(consoleNav('member', ['invites.manage']).members).toBe('/app/manage/members/invites');
		expect(consoleNav('member', ['roles.manage']).members).toBe('/app/manage/members/roles');
		expect(consoleNav('member', ['members.view']).members).toBe('/app/manage/members');
		expect(consoleNav('member', ['messages.send']).members).toBe(null);
	});
});
