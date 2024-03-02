<script lang="ts">
    export let disabled: boolean = false;
    export let name: string;
    export let checked: boolean = false;
    export let onCheck: () => void = () => {};
</script>

<input on:change={onCheck} bind:checked={checked} type="checkbox" class="hidden peer" {name} {disabled} id="{name}">
<label for={name} class="w-5 h-5 grid rounded border-2 border-slate-400/60 hover:border-slate-400 cursor-pointer duration-100 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 group place-items-center peer-disabled:border-slate-300">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 {checked ? "block" : "hidden"} fill-slate-200 stroke-1 stroke-slate-200">
        <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
    </svg>
</label>