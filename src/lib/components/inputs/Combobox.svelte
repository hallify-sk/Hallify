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

<div class="relative combobox w-full">
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
		class="w-full invalid:border-red-400 bg-slate-100 border border-slate-400/30 rounded text-sm p-2 text-slate-500 focus:text-slate-700 shadow-sm"
	/>
	{#if showOptions}
		<div
			class="absolute top-10 z-30 left-0 pt-1 border rounded border-slate-400/30 flex flex-col bg-slate-100 w-full text-sm max-h-40 overflow-y-auto"
		>
			{#if validateHex(name)}
				<button
					onclick={() => changeValue(name, name)}
					class="p-2 hover:bg-slate-200 cursor-pointer w-full flex flex-row flex-nowrap gap-2 items-center"
				>
					<div style="background: {name}" class="p-2 rounded block aspect-square"></div>
					{name}
				</button>
			{:else}
				{#each options.filter((i) => i.name.toLowerCase().includes(name.toLowerCase())) as option}
					<button
						onclick={() => changeValue(option.name, option.value)}
						class="p-2 hover:bg-slate-200 cursor-pointer w-full flex flex-row flex-nowrap gap-2 items-center"
					>
						<div style="background: {option.value}" class="p-2 rounded block aspect-square"></div>
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
