export function isValidEmail(email: string): boolean {
	return /.+@.+/.test(email);
}

import { writable, type Writable } from "svelte/store";

export const collapsibleOpen: Writable<string> = writable("");