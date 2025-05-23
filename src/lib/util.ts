import { writable, type Writable } from 'svelte/store';
import type { Permission } from './server/schema';
import { minimatch } from 'minimatch';
import colors from 'tailwindcss/colors';

export function isValidEmail(email: string): boolean {
	return /.+@.+/.test(email);
}

export const collapsibleOpen: Writable<string> = writable('');

export function checkPathPermission(path: string, permission: Permission): boolean {
	const { allowed_paths, disallowed_paths } = parsePermissionPaths(permission);
	if (disallowed_paths.some((disallowedPath) => minimatch(path, disallowedPath))) {
		return false;
	}
	return allowed_paths.some((allowedPath) => minimatch(path, allowedPath));
}

export function validateHex(v: string) {
	return /^#([0-9A-F]{3}){1,2}$/i.test(v);
}

export const serializeNonPOJOs = (obj: object) => {
	return JSON.parse(JSON.stringify(obj));
};

export const parsePermissionPaths = (
	permission: Permission
): { allowed_paths: string[]; disallowed_paths: string[] } => {
	let allowedPaths: string[] = [];
	if (permission?.allowed_paths) {
		allowedPaths = permission.allowed_paths.split(',').map((path) => path.trim());
	}
	let disallowedPaths: string[] = [];
	if (permission?.disallowed_paths) {
		disallowedPaths = permission.disallowed_paths.split(',').map((path) => path.trim());
	}
	return {
		allowed_paths: allowedPaths,
		disallowed_paths: disallowedPaths
	};
};

export const points: Writable<Array<{ x: number; y: number; name: string }>> = writable([]);
export const zonePoints: Writable<Array<{ x: number; y: number; name: string; color: string }>> =
	writable([]);

export const walls: Writable<Array<{ points: number[]; name: string }>> = writable([]);
export const zones: Writable<Array<{ points: number[]; name: string; color: string }>> = writable(
	[]
);

export const currentColor: Writable<string> = writable(colors.red[500]);
