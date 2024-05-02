<script lang="ts">
	import type { RecordModel, ListResult } from 'pocketbase';

	export let value: string = '';
	export let data: ListResult<RecordModel>;

	let inputElement: HTMLInputElement;

	const supportedLocales = ["sk", "en"];
	export function resetValue() {
		value = '';
	}
	//Run this function recursively if the value is an object, return the keys
	function deepSearch(obj: { [any: string]: any }, value: string) {
		for (let key in obj) {
			if (typeof obj[key] === 'string' && obj[key].toLowerCase().includes(value.toLowerCase())) {
				return true;
			}
			if (typeof obj[key] === 'object' && obj[key] !== null) {
				if (deepSearch(obj[key], value)) {
					return true;
				}
			}
		}
		return false;
	}

	function updateSuggestions() {
		const suggestions = findSuggestions();
	}

	function findSuggestions() {
		value = inputElement.value;
		if (value.trim().length < 3) return [];
		if(value.startsWith("#")){
			value = value.slice(1);
		}
		return data.items.filter((v, i, a) => {
			const keys = Object.keys(v);
			return keys.some((key) => {
				switch (typeof v[key]) {
					case 'string': {
						for(const locale of supportedLocales){
							if(new Date(v[key]).toLocaleDateString(locale).toLowerCase().includes(value.toLowerCase())){
								return true
							}
							if(new Date(v[key]).toLocaleTimeString(locale).toLowerCase().includes(value.toLowerCase())){
								return true
							}
							if(new Date(v[key]).toLocaleString(locale).toLowerCase().includes(value.toLowerCase())){
								return true
							}
						}
						return v[key].toLowerCase().includes(value.toLowerCase());
					}
					case 'object': {
						return deepSearch(v[key], value.toLowerCase());
					}
					default:
						return false;
				}
			});
		});
	}
</script>

<form method="get" class="w-full flex flex-row flex-nowrap">
	<div
		class="aspect-square bg-background-100 grid place-items-center rounded-l-lg w-12 text-text-400"
	>
		<svg
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
	<div class="w-full flex flex-row flex-nowrap">
		<input
			bind:this={inputElement}
			on:input={updateSuggestions}
			id="query"
			name="query"
			bind:value
			type="text"
			placeholder="Jožko Mrkvička"
			class="w-full p-3 peer {value.trim() == ''
				? 'rounded-r-lg'
				: ''} bg-background-100 border-l border-l-background-200 text-text-600 outline-none focus:brightness-95"
		/>
		{#if value.trim() != ''}
			<div
				class="w-fit flex flex-row gap-1 bg-background-100 peer-focus:brightness-95 rounded-r-lg p-2"
			>
				<button
					on:click={resetValue}
					type="reset"
					class="bg-background-100 hover:bg-background-200 rounded-md text-text-900 p-1 px-4"
					>Restart</button
				>
				<button
					type="submit"
					class="bg-primary-500 hover:bg-primary-600 p-1 px-4 text-text-50 rounded-md"
					>Search</button
				>
			</div>
		{/if}
	</div>
</form>
