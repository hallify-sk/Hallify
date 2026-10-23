import { describe, expect, it } from 'vitest';
import { sk, en } from './i18n';
import { orgRoleLabel, roleDisplayName } from './role-label';

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
