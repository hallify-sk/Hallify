<script lang="ts">
	import Checkbox from '$lib/Checkbox.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { fly } from 'svelte/transition';
	import type { RecordModel, ListResult } from 'pocketbase';
	import type { MouseEventHandler } from 'svelte/elements';
	import { browser } from '$app/environment';
	import type { ActionResult } from '@sveltejs/kit';
	import AdminNav from '$lib/AdminNav.svelte';
	import Search from '$lib/Search.svelte';
	import Popup from '$lib/Popup.svelte';

	export let data;

	let selectAll: boolean,
		checkboxes: Array<{ id: string; checked: boolean }> = [],
		users: RecordModel[],
		displayShadow: boolean = false,
		tableWrapper: HTMLElement,
		loadinguser: boolean = false,
		deleteModal: boolean = false,
		pbPage: number = 1,
		suggestions: RecordModel[] = [];

	$: if (data) {
		const resultData: ListResult<RecordModel> = data.users;
		users = resultData.items.sort(tableSort);
		mapCheckboxes();
	}

	$: if (suggestions) {
		mapCheckboxes();
		handleCheckboxUpdate();
	}

	function handleTableShadow() {
		displayShadow = tableWrapper?.scrollWidth > tableWrapper?.clientWidth;
	}

	onMount(async () => {
		handleTableShadow();
		if (browser) {
			window.addEventListener('resize', handleTableShadow);
		}
		updateQuery();
	});
	onDestroy(async () => {
		if (browser) {
			window.removeEventListener('resize', handleTableShadow);
		}
	});

	function tableSort(a: RecordModel, b: RecordModel) {
		//Uses custom function because this allows for deep sort based on weight values of DB relation attributes
		const sortBy = $page.url.searchParams.get('sortBy');
		let sortProperty = 'created';
		let inverse = false;
		if (sortBy) {
			inverse = sortBy.startsWith('-');
			sortProperty = inverse ? sortBy.slice(1) : sortBy;
		}
		if (a.expand?.[sortProperty] && b.expand?.[sortProperty]) {
			return (
				(a.expand[sortProperty].weight < b.expand[sortProperty].weight ? 1 : -1) *
				(inverse ? -1 : 1)
			);
		} else if (a.expand?.[sortProperty] && !b.expand?.[sortProperty]) {
			return (a.expand[sortProperty].weight < 0 ? 1 : -1) * (inverse ? -1 : 1);
		} else if (!a.expand?.[sortProperty] && b.expand?.[sortProperty]) {
			return (0 < b.expand[sortProperty].weight ? 1 : -1) * (inverse ? -1 : 1);
		} else {
			return (
				(a[sortProperty] > b[sortProperty] ? 1 : -1) *
				(inverse ? -1 : 1) *
				(isNaN(parseInt(a[sortProperty])) && isNaN(parseInt(b[sortProperty])) ? 1 : -1)
			);
		}
	}

	async function redirectTouser(
		id: string
	): Promise<MouseEventHandler<HTMLTableRowElement> | null | undefined> {
		await goto(`/admin/users/${id}`);
		return;
	}

	async function handleSortProperty(filter: string) {
		//This function puts the current sort property into the URL, and makes sure that this can be an inverse sort or normal sort by pre-pending a - to the sort property.
		let modFilter = filter;
		if (
			$page.url.searchParams.get('sortBy') == filter &&
			!$page.url.searchParams.get('sortBy')?.startsWith('-')
		)
			modFilter = `-${filter}`;
		$page.url.searchParams.set('sortBy', modFilter);
		users = users.sort(tableSort);
		return await goto(`?${$page.url.searchParams.toString()}`);
	}

	async function deleteSelected() {
		//Rerun the load function, repopulates the data property
		await invalidateAll();
		//Closes the modal
		deleteModal = false;
		selectAll = false;
		//Remaps the checkboxes
		mapCheckboxes();
		//Resets the query
		query = '';
	}

	function handleMassCheckboxUpdate() {
		const checked = !selectAll;
		if (checked) {
			deleteModal = true;
		} else {
			deleteModal = false;
		}
		checkboxes = checkboxes.map((checkbox) => {
			return { id: checkbox.id, checked };
		});
	}

	function handleCheckboxUpdate() {
		// TODO: This function doesn't work without this timeout for some reason? Without timeout, the logic of this function is delayed by one checkbox update;
		setTimeout(() => {
			if (checkboxes.length && checkboxes.every((v) => v.checked == true)) {
				selectAll = true;
				deleteModal = true;
			} else if (checkboxes.some((v) => v?.checked === true)) {
				selectAll = false;
				deleteModal = true;
			} else {
				selectAll = false;
				deleteModal = false;
			}
		}, 1);
	}

	function mapCheckboxes() {
		//Reset checkbox array;
		checkboxes = [];
		//Remap checkboxes into array;
		if (query) {
			suggestions.map((user, i) => {
				checkboxes[i] = { id: user.id, checked: false };
			});
		} else {
			users.map((user, i) => {
				checkboxes[i] = { id: user.id, checked: false };
			});
		}
	}
	async function handleLoadingusers(
		result: ActionResult<
			globalThis.Record<string, unknown> | undefined,
			globalThis.Record<string, unknown> | undefined
		>
	) {
		if (result.type != 'success') return;
		if (!result.data) return;
		users = [...users, ...(result.data.users as any).items];
		setTimeout(() => {
			updateQuery();
		}, 1);
		mapCheckboxes();
		users.sort(tableSort);
	}

	let openConfirmModal = () => {};
	let closeConfirmModal = () => {};

	let errorConfirmMessage: string = '';

	let query: string = $page.url.searchParams.get('query') || '';

	let updateQuery: () => void = () => {};
</script>

<AdminNav/>
<div class="flex flex-col flex-nowrap pt-24 pl-80">
	<h1 class="col-span-12 text-text-600 font-semibold mx-14 text-2xl">Používatelia</h1>
	<div class="my-8 px-14 max-w-6xl mx-auto w-full">
		<Search
			bind:suggestions
			data={users}
			bind:updateSuggestions={updateQuery}
			bind:value={query}
		/>
	</div>
	<div bind:this={tableWrapper} class="overflow-auto w-full">
		<!-- <form
			id="userselect"
			action="?/removeusers"
			method="POST"
			use:enhance={() => {
				return async ({ result }) => {
					await applyAction(result);
					await invalidateAll();
				};
			}}
		> -->
		<table class="w-full mt-8 leading-[3rem] text-slate-500 border-separate" cellspacing="0">
			<colgroup>
				<col class="w-10" />
				<col class="w-auto min-w-[200px]" />
				<col class="w-auto min-w-[200px]" />
				<col class="w-auto min-w-[160px]" />
				<col class="w-auto min-w-[160px]" />
				<col class="w-12" />
			</colgroup>
			<thead>
				<tr>
					<th class="flex items-center px-8 whitespace-nowrap h-[3rem] mt-1">
						<Checkbox
							disabled={!Boolean(users?.length) ||
								(!Boolean(suggestions?.length) && Boolean(query))}
							bind:checked={selectAll}
							onCheck={handleMassCheckboxUpdate}
							name="select-all"
						/>
					</th>
					<th
						on:click={() => {
							handleSortProperty('name');
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
						>Názov</th
					>
					<th
						on:click={() => {
							handleSortProperty('email');
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
						>E-mail</th
					>
					<th
						on:click={() => {
							handleSortProperty('created');
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
						>Vytvorený</th
					>
					<th
						on:click={() => {
							handleSortProperty('edited');
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
						>Posledná zmena</th
					>
					<th
						class="px-4 right-0 sticky bg-background-50 {displayShadow
							? 'arrow'
							: ''} transition-colors border-b border-slate-400/40 group-hover:bg-background-100 duration-100"
					/>
				</tr>
			</thead>
			<tbody>
				{#if query}
					{#if suggestions.filter((i) => suggestions.some((o) => o.id == i.id)).length}
						{#each suggestions.filter( (i) => suggestions.some((o) => o.id == i.id) ) as suggestion, index}
							<tr
								on:click={async () => {
									await redirectTouser(suggestion.id);
								}}
								class="hover:bg-background-100 cursor-pointer duration-100 border-b border-slate-400/40 group"
							>
								<td
									on:click|stopPropagation
									class="flex items-center px-8 whitespace-nowrap h-[3rem] mt-1"
								>
									<Checkbox
										onCheck={handleCheckboxUpdate}
										bind:checked={checkboxes[index].checked}
										name={suggestion.id}
									/>
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p
											class="leading-5 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-60"
										>
											{suggestion.name}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{suggestion.id}
										</p>
									</div>
								</td>
								<td class="px-2 whitespace-nowrap overflow-ellipsis overflow-hidden"
									>{suggestion.email}</td
								>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">
											{new Date(suggestion.created).toLocaleDateString('sk')}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{new Date(suggestion.created).toLocaleTimeString('sk')}
										</p>
									</div>
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">
											{new Date(suggestion.updated).toLocaleDateString('sk')}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{new Date(suggestion.updated).toLocaleTimeString('sk')}
										</p>
									</div>
								</td>
								<td
									class="px-4 right-0 sticky bg-background-50 {displayShadow
										? 'arrow'
										: ''} transition-colors border-b border-slate-400/400 group-hover:bg-background-100 duration-100"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="w-5 h-5"
									>
										<path
											fill-rule="evenodd"
											d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
											clip-rule="evenodd"
										/>
									</svg>
								</td>
							</tr>
						{/each}
					{:else}
						<tr>
							<td class="text-center leading-10 py-6" colspan="7">
								{#if !suggestions.length}
									<p>Nenašli sa žiadny používatelia vyhovujúci vyhľadávaniu</p>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="w-6 h-6 mx-auto animate-spin"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
										/>
									</svg>
								{/if}
							</td>
						</tr>
					{/if}
				{:else if users.length}
					{#each users as user, index}
						<tr
							on:click={async () => {
								await redirectTouser(user.id);
							}}
							class="hover:bg-background-100 cursor-pointer duration-100 border-b border-slate-400/40 group"
						>
							<td
								on:click|stopPropagation
								class="flex items-center px-8 whitespace-nowrap h-[3rem] mt-1"
							>
								<Checkbox
									onCheck={handleCheckboxUpdate}
									bind:checked={checkboxes[index].checked}
									name={user.id}
								/>
							</td>
							<td class="px-2">
								<div class="flex flex-col gap-0">
									<p class="leading-5 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-60">
										{user.name}
									</p>
									<p class="leading-5 text-sm text-slate-400">
										{user.id}
									</p>
								</div>
							</td>
							<td class="px-2 whitespace-nowrap overflow-ellipsis overflow-hidden"
									>{user.email}</td
								>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">
											{new Date(user.created).toLocaleDateString('sk')}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{new Date(user.created).toLocaleTimeString('sk')}
										</p>
									</div>
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">
											{new Date(user.updated).toLocaleDateString('sk')}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{new Date(user.updated).toLocaleTimeString('sk')}
										</p>
									</div>
								</td>
							<td
								class="px-4 right-0 sticky bg-background-50 {displayShadow
									? 'arrow'
									: ''} transition-colors border-b border-slate-400/400 group-hover:bg-background-100 duration-100"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="w-5 h-5"
								>
									<path
										fill-rule="evenodd"
										d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
										clip-rule="evenodd"
									/>
								</svg>
							</td>
						</tr>
					{/each}
				{:else}
					<tr>
						<td class="text-center leading-10 py-6" colspan="7">
							{#if !users.length}
								<p>Nenašli sa žiadny používatelia</p>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-6 h-6 mx-auto animate-spin"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
									/>
								</svg>
							{/if}
						</td>
					</tr>
				{/if}
				{#if users.length < data.users.totalItems}
					<tr>
						<td class="text-center leading-10 py-2" colspan="7">
							{#if loadinguser}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-6 h-6 mx-auto animate-spin"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
									/>
								</svg>
							{:else}
								<form
									action="?/getMoreusers"
									method="post"
									use:enhance={({ formData }) => {
										pbPage += 1;
										formData.set('page', `${pbPage}`);
										return async ({ result }) => {
											handleLoadingusers(result);

											await applyAction(result);
										};
									}}
								>
									<button
										class="px-4 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
										type="submit"
									>
										Načítať ďalšie ({data.users.totalItems - users.length})
									</button>
								</form>
							{/if}
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
		<!--</form>-->
	</div>
</div>

{#if deleteModal}
	<div
		transition:fly={{ duration: 200, y: 10 }}
		class="shadow fixed bottom-20 left-1/2 -translate-x-1/2 justify-between border border-background-200 bg-background-100 rounded-full w-[28rem] flex items-center px-6 py-2"
	>
		<p class="text-text-600">
			Označen{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'í' : 'ý'}
			<b>{checkboxes.filter((t) => t?.checked === true).length}</b>
			používate{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'lia' : 'ľ'}
		</p>
		<button
			type="button"
			on:click={openConfirmModal}
			class="flex py-2 px-2 rounded-md text-text-100 gap-4 bg-accent-700 hover:bg-accent-600"
		>
			Vymazať používateľ{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'ov' : 'a'}
		</button>
	</div>
{/if}

<Popup bind:openPopup={openConfirmModal} bind:closePopup={closeConfirmModal}>
	<div class="w-80">
		<h2 class="text-text-700 text-xl mb-2">
			Vymazať používateľ{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'ov' : 'a'}
		</h2>
		<p class="text-text-500 mb-4">
			Na vymazanie používateľ{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'ov' : 'a'} potrebujete
			zadať dôvod, ktorý im bude poslaný cez E-Mail. Táto akcia je nevratná.
		</p>
		{#if errorConfirmMessage}
			<p class="text-red-500 mb-2 max-w-xs">{errorConfirmMessage}</p>
		{/if}
		<form
			action="?/removeUsers"
			method="POST"
			class="flex flex-col"
			use:enhance={({ formData }) => {
				formData.set(
					'checkboxes',
					JSON.stringify(checkboxes.filter((t) => t?.checked === true).map((t) => t.id))
				);
				return async ({ result }) => {
					if (result.type === 'failure') {
						errorConfirmMessage =
							typeof result.data?.message == 'string' ? result.data.message : '';
					} else {
						await deleteSelected();
						closeConfirmModal();
					}
				};
			}}
		>
			<textarea
				placeholder="Dôvod na vymazanie používateľ{checkboxes.filter((t) => t?.checked === true)
					.length > 1
					? 'ov'
					: 'a'}"
				maxlength="600"
				minlength="30"
				class="bg-background-100 resize-none rounded-md col-span-1 lg:col-span-2 min-h-40 p-2 text-text-600"
				name="reason"
				id="reason"
			></textarea>
			<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
				<button
					type="reset"
					on:click={closeConfirmModal}
					class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
					>Zrušiť</button
				>
				<button
					type="submit"
					class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50"
				>
					Vymazať používateľ{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'ov' : 'a'}
				</button>
			</div>
		</form>
	</div>
</Popup>

<style lang="postcss">
	th,
	td:not(.ignoreBorder) {
		@apply border-b border-slate-400/40;
	}
	.arrow {
		box-shadow: 0 0 5px 2px rgba(0, 0, 0, 0.1);
		clip-path: inset(0px -15px 0px -15px);
	}
</style>
