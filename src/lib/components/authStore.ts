import type { Permission } from "$lib/server/models";
import type { UserSanitized } from "$lib/types/auth";
import { writable, type Writable } from "svelte/store";

export const userStore: Writable<UserSanitized | null> = writable(null);
export const permissionStore: Writable<Permission | null> = writable(null);

userStore.subscribe((value) => {
    console.log("User store updated:", value);
});