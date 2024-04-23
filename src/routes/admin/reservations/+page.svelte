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

	export let data;
	let selectAll: boolean,
		checkboxes: Array<{ id: string; checked: boolean }> = [],
		reservations: RecordModel[],
		displayShadow: boolean = false,
		tableWrapper: HTMLElement,
		loadingreservation: boolean = false,
		deleteModal: boolean = false,
		pbPage: number = 1;

	$: if (data) {
		const resultData: ListResult<RecordModel> = data.reservations;
		reservations = resultData.items.sort(tableSort);
		mapCheckboxes();
	}

	function handleTableShadow() {
		displayShadow = tableWrapper?.scrollWidth > tableWrapper?.clientWidth;
	}

	onMount(async () => {
		if (browser) {
			window.addEventListener('resize', handleTableShadow);
		}
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

	async function redirectToreservation(
		id: string
	): Promise<MouseEventHandler<HTMLTableRowElement> | null | undefined> {
		await goto(`/reservations/${id}`);
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
		reservations = reservations.sort(tableSort);
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
			if (checkboxes.every((v) => v?.checked === true)) {
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
		reservations.map((reservation, i) => {
			checkboxes[i] = { id: reservation.id, checked: false };
		});
	}
	async function handleLoadingreservations(
		result: ActionResult<
			globalThis.Record<string, unknown> | undefined,
			globalThis.Record<string, unknown> | undefined
		>
	) {
		if (result.type != 'success') return;
		if (!result.data) return;
		reservations = [...reservations, ...(result.data.reservations as any).items];
		mapCheckboxes();
		reservations.sort(tableSort);
	}
</script>

<AdminNav user={data.user} />
<div class="flex flex-col flex-nowrap pt-12 pl-80">
	<h1 class="col-span-12 text-xl text-text-600 font-semibold mx-8">Rezervácie</h1>
	<div bind:this={tableWrapper} class="overflow-auto min-h-screen w-full">
		<form
			id="reservationselect"
			action="?/removereservations"
			method="POST"
			use:enhance={() => {
				return async ({ result }) => {
					await applyAction(result);
					await invalidateAll();
				};
			}}
		>
			<table class="w-full mt-8 leading-[3rem] text-slate-500 border-separate" cellspacing="0">
				<colgroup>
					<col class="w-10" />
					<col class="w-auto min-w-[200px]" />
					<col class="w-auto min-w-[160px]" />
					<col class="w-auto min-w-[160px]" />
					<col class="w-auto min-w-[160px]" />
					<col class="w-auto min-w-[160px]" />
					<col class="w-12" />
				</colgroup>
				<thead>
					<tr>
						<th class="flex items-center px-8 whitespace-nowrap h-[3rem] mt-1">
							<Checkbox
								disabled={!Boolean(reservations?.length)}
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
								handleSortProperty('category');
							}}
							class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
							>Kategória</th
						>
						<th
							on:click={() => {
								handleSortProperty('guestCount');
							}}
							class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
							>Počet hostí</th
						>
						<th
							on:click={() => {
								handleSortProperty('date');
							}}
							class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
							>Dátum</th
						>
						<th
							on:click={() => {
								handleSortProperty('created');
							}}
							class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t"
							>Vytvorené</th
						>
						<th
							class="px-4 right-0 sticky bg-background-50 {displayShadow
								? 'arrow'
								: ''} transition-colors border-b border-slate-400/40 group-hover:bg-background-100 duration-100"
						/>
					</tr>
				</thead>
				<tbody>
					{#if reservations?.length}
						{#each reservations as reservation, index}
							<tr
								on:click={async () => {
									await redirectToreservation(reservation.id);
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
										name={reservation.id}
									/>
								</td>
								<td class="px-2 whitespace-nowrap overflow-ellipsis overflow-hidden"
									>#{reservation.id} - {reservation.name == ''
										? 'Nenastavené'
										: reservation.name}</td
								>
								<td class="px-2">
									{#if reservation.expand?.category?.name}
										{reservation.expand.category.name}
									{:else}
										Nenastavené
									{/if}
								</td>
								<td class="px-2">
									{#if reservation.guestCount}
										{reservation.guestCount}
									{:else}
										Nenastavené
									{/if}
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">{new Date(reservation.date).toLocaleDateString('sk')}</p>
									</div>
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">
											{new Date(reservation.created).toLocaleDateString('sk')}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{new Date(reservation.created).toLocaleTimeString('sk')}
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
								{#if !reservations.length}
									<p>No reservations found.</p>
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
					{#if reservations.length < data.reservations.totalItems}
						<tr>
							<td class="text-center leading-10 py-2" colspan="7">
								<button
									type="submit"
									class="cursor-pointer text-black bg-gray-400/20 hover:bg-gray-400/40 rounded px-4"
								>
									{#if loadingreservation}
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
											action="?/getMorereservations"
											method="post"
											use:enhance={({ formData }) => {
												pbPage += 1;
												formData.set('page', `${pbPage}`);
												return async ({ result }) => {
													handleLoadingreservations(result);

													await applyAction(result);
												};
											}}
										>
											<button type="submit">
												Load more ({data.reservations.totalItems - reservations.length})
											</button>
										</form>
									{/if}
								</button>
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</form>
	</div>
</div>

{#if deleteModal}
	<div
		transition:fly={{ duration: 200, y: 10 }}
		class="shadow fixed bottom-20 left-1/2 -translate-x-1/2 justify-between border border-background-200 bg-background-100 rounded-full w-[28rem] flex items-center px-6 py-2"
	>
		<p class="text-text-600">
			Označen{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'é' : 'á'} <b>{checkboxes.filter((t) => t?.checked === true).length}</b>
			rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'e' : 'a'}
		</p>
		<button
			type="submit"
			class="flex py-2 px-2 rounded-md text-text-100 gap-4 bg-accent-700 hover:bg-accent-600"
		>
			Vymazať rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'e' : 'u'}
		</button>
		<!--
		<button
			form="ticketSelect"
			type="submit"
			on:click={deleteSelected}
			class="p-2 cursor-pointer text-red-600 duration-100 hover:bg-red-400/20 bg-red-400/10 px-4 rounded"
			>Delete selected</button
		>-->
	</div>
{/if}

<style>
	th,
	td:not(.ignoreBorder) {
		@apply border-b border-slate-400/40;
	}
	.arrow {
		box-shadow: 0 0 5px 2px rgba(0, 0, 0, 0.1);
		clip-path: inset(0px -15px 0px -15px);
	}
</style>
