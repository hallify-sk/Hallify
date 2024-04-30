<script lang="ts">
	import type { RecordModel, ListResult } from 'pocketbase';

	export let value: string = '';
	export let data: ListResult<RecordModel>;

	console.log(data);
	export function resetValue() {
		value = '';
	}

	function findSuggestions() {
		if (value.trim().length < 3) return {};
		let val = data.items.filter((v, i, a) => {
			const keys = Object.keys(v);
			return keys.some((key) => {
				switch (typeof v[key]) {
					case 'string': {
						return v[key].includes(value);
					}
					case 'object': {
						const secondKeys = Object.keys(v[key]);
						return secondKeys.some((secKey) => {
                            console.log(key, secKey);
							switch (typeof v[key][secKey]) {
								case 'string': {
									return v[key][secKey].includes(value);
								}
								case 'object': {
									return false;
								}
								default:
									return false;
							}
						});
					}
					default:
						return false;
				}
			});
		});
		console.log(val);
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
			on:change={findSuggestions}
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
