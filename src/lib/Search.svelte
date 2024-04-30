<script lang="ts">
    export let value: string = "";

    export function resetValue(){
        value = "";
    };
</script>

<form method="get" class="w-full flex flex-row flex-nowrap">
    <div class="aspect-square bg-background-100 grid place-items-center rounded-l-lg w-12 text-text-400"
    ><svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="icon icon-tabler icons-tabler-outline icon-tabler-search"
        ><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
            d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"
        /><path d="M21 21l-6 -6" /></svg
    >
    </div>
    <div class="w-full relative">
        <input id="query" name="query" bind:value type="text" placeholder="Jožko Mrkvička" class="w-full p-3 rounded-r-lg bg-background-100 border-l border-l-background-200 outline-none focus:brightness-95" />
        {#if value.trim() != ""}
        <div class="absolute right-2 top-1/2 -translate-y-1/2">
            <button on:click={resetValue} type="reset" class="bg-background-100 hover:bg-background-200 rounded-md text-text-900 p-1 px-4">Restart</button>
            <button type="submit" class="bg-primary-500 hover:bg-primary-600 p-1 px-4 text-text-50 rounded-md">Search</button>
        </div>
        {/if}
    </div>
</form>
