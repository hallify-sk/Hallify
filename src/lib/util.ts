import { writable, type Writable } from 'svelte/store';
import type { Permission } from './server/models';
import { minimatch } from 'minimatch';

export function isValidEmail(email: string): boolean {
	return /.+@.+/.test(email);
}

export const collapsibleOpen: Writable<string> = writable('');

export function checkPathPermission(path: string, permission: Permission): boolean {
	if (permission.disallowed_paths.some((disallowedPath) => minimatch(path, disallowedPath))) {
		return false;
	}
	return permission.allowed_paths.some((allowedPath) => minimatch(path, allowedPath));
}

export function validateHex(v: string) {
	return /^#([0-9A-F]{3}){1,2}$/i.test(v);
}

export const serializeNonPOJOs = (obj: object) => {
	return JSON.parse(JSON.stringify(obj));
};
