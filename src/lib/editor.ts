import { writable } from "svelte/store";

export const stage = writable({
    width: 900,
    height: 900,
    grid: {
        size: 30,
        color: "#ccc",
    }
});