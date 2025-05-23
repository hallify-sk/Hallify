// See https://kit.svelte.dev/docs/types#app

import type { UserWithoutPassword } from '$lib/server/auth';
import type { Permission, UserSession } from '$lib/server/schema';

// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: UserWithoutPassword | null;
			session: UserSession | null;
			permission: Permission;
		}
	}
}

export {};
