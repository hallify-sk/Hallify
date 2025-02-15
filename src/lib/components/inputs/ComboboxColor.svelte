<script lang="ts">
	import { validateHex } from '$lib/util';
	import { onMount } from 'svelte';

	let showOptions = $state(false);

	function focusIn() {
		showOptions = true;
	}

	//If click outside of collapsible, close collapsible
	onMount(() => {
		document.addEventListener('click', (e) => {
			if (!(e.target as HTMLDivElement).closest('.combobox')) {
				showOptions = false;
			}
		});
	});

	function changeValue(newName: string, newValue: string) {
		name = newName;
		value = newValue;
		showOptions = false;
	}

	$effect(() => {
		if (name) {
			value = name;
		}
	});

	interface Props {
		options?: Array<{ value: string; name: string }>;
		placeholder?: string;
		name?: string;
		value?: string;
		id: string;
	}

	let {
		options = [],
		placeholder = '',
		name = $bindable(''),
		value = $bindable(''),
		id
	}: Props = $props();

	function removeValidation() {
		(document.getElementById(id) as HTMLInputElement).setCustomValidity('');
	}
</script>

<div class="relative w-full combobox">
	<input id="{id}_value" bind:value class="hidden" type="text" />
	<input
		bind:value={name}
		oninput={() => {
			value = name;
		}}
		onfocus={focusIn}
		onchange={removeValidation}
		{id}
		name={id}
		type="text"
		{placeholder}
		class="w-full p-2 text-sm border rounded shadow-sm invalid:border-red-400 bg-slate-100 border-slate-400/30 text-slate-500 focus:text-slate-700"
	/>
	{#if showOptions}
		<div
			class="absolute left-0 z-30 flex flex-col w-full pt-1 overflow-y-auto text-sm border rounded top-10 border-slate-400/30 bg-slate-100 max-h-40"
		>
			{#if validateHex(name)}
				<button
					onclick={() => changeValue(name, name)}
					class="flex flex-row items-center w-full gap-2 p-2 cursor-pointer hover:bg-slate-200 flex-nowrap"
				>
					<div style="background: {name}" class="block p-2 rounded aspect-square"></div>
					{name}
				</button>
			{:else}
				{#each options.filter((i) => i.name.toLowerCase().includes(name.toLowerCase())) as option}
					<button
						onclick={() => changeValue(option.name, option.value)}
						class="flex flex-row items-center w-full gap-2 p-2 cursor-pointer hover:bg-slate-200 flex-nowrap"
					>
						<div style="background: {option.value}" class="block p-2 rounded aspect-square"></div>
						{option.name}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
<!--
<select class="block w-full px-4 py-2 mt-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
    {#each options as option}
        <option value={option.value}>{option.name}</option>
    {/each}
</select>
-->
