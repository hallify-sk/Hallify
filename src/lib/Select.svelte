<script lang="ts">
	import { onMount } from "svelte";

    export let selected: string | null | undefined = "";
    export let defaultText: string;
    export let options: Array<{id: string, name: string}>
    export let value: string | null | undefined = null;
    export let invalid: boolean;
    let select: HTMLElement;
    let open: boolean = false;
    function toggleSelect(){
        open = !open;
        invalid = false;
    };
    function changeText(event: any){
        selected = ((event.currentTarget as HTMLElement).parentElement)?.getAttribute("data-text");
        value = ((event.currentTarget as HTMLElement).parentElement)?.parentElement?.querySelector("input")?.value;
        toggleSelect();
    }
    onMount(()=>{
        select.addEventListener("focusout", (ev) => {
            if(select.contains(ev.relatedTarget as Node)) return;
            open = false;
        });
    });
    let nameRegisterError = false;
</script>

<fieldset class="relative text-input">
    <input
        placeholder=""
        type="text"
        required={true}
        id="name"
        name="name"
        class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {nameRegisterError
            ? 'border-red-500'
            : ''}"
    />
    <label
        for="name"
        class="absolute top-0.5 left-1 {nameRegisterError
            ? 'text-red-500'
            : 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
        >Celé meno</label
    >
</fieldset>

<div bind:this={select} class="flex flex-col flex-nowrap w-full relative">
    <button type="button" on:click={toggleSelect} class="pb-0.5 px-2 pt-5 relative text-left cursor-pointer bg-background-100 w-full rounded-md text-text-600 peer group h-12">
        <p class="absolute {selected ? "-top-2.5 left-1" : open ? "-top-2.5 left-1" : "left-3 top-2.5"} pointer-events-none duration-100 text-text-600 bg rounded px-1 font-thin">{defaultText}</p>
        <p class="text-slate-600 group-focus-within:text-sky-500">{selected ? selected : ""}</p>
        {#if open}
        <svg class="w-4 h-4 absolute right-2 top-3" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.5 15.75l7.5-7.5 7.5 7.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        {:else}
        <svg class="w-4 h-4 absolute right-2 top-3" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        {/if}
    </button>
    <ul class="border border-slate-400 z-20 rounded mt-0.5 absolute top-full w-full bg-slate-200 {open ? "block" : "hidden"}">
        <form>
        {#each options as option}
        <li class="flex flex-row hover:bg-slate-300 duration-100 w-full group cursor-pointer">
            <input type="radio" name="category" class="hidden peer" value={option.id} >
            <label for="config" class="cursor-pointer text-slate-600 group-hover:text-slate-800 w-full" data-text={option.name}>
                <button type="button" on:click={changeText} class="w-full p-2 text-left">{option.name}</button>
            </label>
        </li>
        {/each}
        </form>
    </ul>
</div>