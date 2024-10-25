<script lang="ts">
    export let name: string;
    export let id: string;
    export let type: "text" | "password" | "email" = "text";
</script>

<input {type} {name} {id} class="w-full bg-slate-100 border border-slate-400/30 rounded mt-2 text-sm p-2 text-slate-500 focus:text-slate-700 shadow-sm"/>