import { writable, type Writable } from "svelte/store";

export const theme: Writable<"dark" | "light"> = writable();

let meno: string = "erik";

meno = meno.split("");