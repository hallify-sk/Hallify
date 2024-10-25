<script lang="ts">
    export let name = "";
    export let id = "";

    export let checked = false;
</script>

<input bind:checked={checked} type="checkbox" {name} {id} class="hidden peer">
<label for={name} class="w-8 h-4 p-0.5 bg-slate-300 rounded-full block relative cursor-pointer peer-checked:bg-blue-500 duration-200">
    <div class="w-3 h-3 bg-white block rounded-full absolute {checked ? "left-[18px]" : "left-0.5"} duration-200"></div>
</label>