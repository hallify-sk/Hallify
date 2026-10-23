import { describe, it, expect } from 'vitest';
import { consoleNav } from './console-nav';
import { ADMINISTRATOR_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from './permissions';

describe('consoleNav', () => {
	it('gives the owner every link', () => {
		const nav = consoleNav('owner', PERMISSIONS);
		expect(nav).toEqual({
			console: true, halls: true, reservations: true, calendar: true, assistant: true,
			clientMessages: true, announcements: true, members: '/app/manage/members',
			billing: true, settings: true
		});
	});

	it('gives an admin everything they had before, billing included', () => {
		const nav = consoleNav('admin', ADMINISTRATOR_PERMISSIONS);
		expect(nav.console && nav.halls && nav.reservations && nav.settings && nav.billing && nav.clientMessages).toBe(true);
	});

	it('gives a plain member no console links', () => {
		const nav = consoleNav('member', DEFAULT_ROLE_PERMISSIONS);
		expect(Object.values(nav).some(Boolean)).toBe(false);
	});

	it('shows a custom role exactly the pages its permissions open', () => {
		const nav = consoleNav('member', [...DEFAULT_ROLE_PERMISSIONS, 'reservations.manage', 'ai.use']);
		expect(nav.console).toBe(true);
		expect(nav.reservations).toBe(true);
		expect(nav.calendar).toBe(true);
		expect(nav.assistant).toBe(true);
		expect(nav.halls).toBe(false);
		expect(nav.settings).toBe(false);
		expect(nav.clientMessages).toBe(false);
		expect(nav.members).toBe(null);
	});

	it('takes a template-only role into the console without other links', () => {
		const nav = consoleNav('member', ['templates.manage']);
		expect(nav.console).toBe(true);
		expect(nav.halls || nav.reservations || nav.settings).toBe(false);
	});

	it('sends People to the first page the member may open', () => {
		expect(consoleNav('member', ['invites.manage']).members).toBe('/app/manage/members/invites');
		expect(consoleNav('member', ['roles.manage']).members).toBe('/app/manage/members/roles');
		expect(consoleNav('member', ['members.view']).members).toBe(null);
	});
});
