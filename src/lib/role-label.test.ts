import { describe, expect, it } from 'vitest';
import { sk, en } from './i18n';
import { orgRoleLabel, roleDisplayName, roleNamesClash } from './role-label';

describe('orgRoleLabel', () => {
	it('names the built-in roles in the reader\'s language', () => {
		expect(orgRoleLabel('owner', sk)).toBe('Vlastník');
		expect(orgRoleLabel('member', sk)).toBe('Člen');
		expect(orgRoleLabel('admin', sk)).toBe('Administrátor');
		expect(orgRoleLabel('owner', en)).toBe('Owner');
	});
	it('translates the seeded role names for display only', () => {
		expect(roleDisplayName('Administrator', sk)).toBe('Administrátor');
		expect(roleDisplayName('Member', sk)).toBe('Člen');
		expect(roleDisplayName('Member', en)).toBe('Member');
		expect(roleDisplayName('Barmani', sk)).toBe('Barmani');
	});
	it('passes anything else through', () => {
		expect(orgRoleLabel('custom', sk)).toBe('custom');
		expect(orgRoleLabel(null, sk)).toBe('');
	});
});

describe('roleNamesClash', () => {
	// REG-permissions-2: 'Člen' and 'Administrátor' were accepted next to the seeded
	// 'Member' and 'Administrator', and the Slovak UI then listed two of each.
	it('compares the translated names of the seeded roles too', () => {
		expect(roleNamesClash('Member', 'Člen')).toBe(true);
		expect(roleNamesClash('Administrator', ' administrátor ')).toBe(true);
		expect(roleNamesClash('Člen', 'Member')).toBe(true);
	});
	it('still compares stored names ignoring case', () => {
		expect(roleNamesClash('Barmani', 'barmani')).toBe(true);
		expect(roleNamesClash('Barmani', 'Čašníci')).toBe(false);
		expect(roleNamesClash('Member', 'Administrátor')).toBe(false);
	});
});
