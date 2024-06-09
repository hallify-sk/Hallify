<script lang="ts">
	import Checkbox from "$lib/Checkbox.svelte";
	import AdminNav from "$lib/AdminNav.svelte";
	import Search from "$lib/Search.svelte";
	import Popup from "$lib/Popup.svelte";
	import { onDestroy, onMount } from "svelte";
	import { applyAction, enhance } from "$app/forms";
	import { goto, invalidateAll } from "$app/navigation";
	import { browser } from "$app/environment";
	import { page } from "$app/stores";
	import { fly } from "svelte/transition";
	import type { RecordModel, ListResult } from "pocketbase";
	import type { MouseEventHandler } from "svelte/elements";
	import type { ActionResult } from "@sveltejs/kit";

	export let data;

	let selectAll: boolean,
		checkboxes: Array<{ id: string; checked: boolean }> = [],
		reservations: RecordModel[],
		displayShadow: boolean = false,
		tableWrapper: HTMLElement,
		loadingreservation: boolean = false,
		deleteModal: boolean = false,
		pbPage: number = 1,
		suggestions: RecordModel[] = [];

	let errorConfirmMessage: string = "";
	let query: string = $page.url.searchParams.get("query") || "";

	let updateQuery: () => void = () => {};
	let openConfirmModal = () => {};
	let closeConfirmModal = () => {};

	// Updates when data/suggestions change
	$: if (data) {
		const resultData: ListResult<RecordModel> = data.reservations;
		reservations = resultData.items.sort(tableSort);
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
			window.addEventListener("resize", handleTableShadow);
		}
		updateQuery();
	});
	onDestroy(async () => {
		if (browser) {
			window.removeEventListener("resize", handleTableShadow);
		}
	});
	/**
	 * Sorts reservations based on a specified property. TODO: VERIFY tableSort "@RETURNS" COMMENT ci je spravna logic a dava to anglikansky zmysel :sob: - ref: src/admin/reservations/+page.svelte 56
	 * @param {RecordModel} a - The first reservation object to compare.
	 * @param {RecordModel} b - The second reservation object to compare.
	 * @returns {number} - Returns a positive number if 'a' should come after 'b' in the sorted sequence, a negative number if 'a' should come before 'b', or zero if they are equal. asi - matematika 2 rocnik vyroky :sob:
	 */
	function tableSort(a: RecordModel, b: RecordModel) {
		const sortBy = $page.url.searchParams.get("sortBy") || "created";

		let sortProperty = "created";
		let inverse = false;

		// Check if sorting is in descending order
		if (sortBy) {
			inverse = sortBy.startsWith("-");
			sortProperty = inverse ? sortBy.slice(1) : sortBy;
		}

		// Compare the values of the specified property for 'a' and 'b'
		if (a.expand?.[sortProperty] && b.expand?.[sortProperty]) {
			// If both 'a' and 'b' have the specified property in their 'expand' object, compare their 'weight' values
			return (a.expand[sortProperty].weight < b.expand[sortProperty].weight ? 1 : -1) * (inverse ? -1 : 1);
		} else if (a.expand?.[sortProperty] && !b.expand?.[sortProperty]) {
			// If only 'a' has the specified property in its 'expand' object
			return (a.expand[sortProperty].weight < 0 ? 1 : -1) * (inverse ? -1 : 1);
		} else if (!a.expand?.[sortProperty] && b.expand?.[sortProperty]) {
			// If only 'b' has the specified property in its 'expand' object
			return (0 < b.expand[sortProperty].weight ? 1 : -1) * (inverse ? -1 : 1);
		} else {
			// If neither 'a' nor 'b' have the specified property in their 'expand' object, or if 'expand' is undefined
			// Compare the values of the specified property directly
			return (
				(a[sortProperty] > b[sortProperty] ? 1 : -1) *
				(inverse ? -1 : 1) *
				(isNaN(parseInt(a[sortProperty])) && isNaN(parseInt(b[sortProperty])) ? 1 : -1)
			);
		}
	}

	async function redirectToreservation(id: string): Promise<MouseEventHandler<HTMLTableRowElement> | null | undefined> {
		await goto(`/admin/reservations/${id}`);
		return;
	}

	/**
	 * Updates the sorting property in the URL query parameters and sorts reservations accordingly.
	 * @param {string} filter - The sorting property to be applied.
	 * @returns {Promise<void>} - A promise that resolves once the sorting is updated and the page navigates to the sorted URL.
	 */
	async function handleSortProperty(filter: string): Promise<void> {
		// Check if the current sorting property in the URL is the same as the new filter, and whether it's already in ascending order
		let modFilter = filter;
		if ($page.url.searchParams.get("sortBy") == filter && !$page.url.searchParams.get("sortBy")?.startsWith("-")) {
			modFilter = `-${filter}`;
		}

		$page.url.searchParams.set("sortBy", modFilter);
		reservations = reservations.sort(tableSort);

		return await goto(`?${$page.url.searchParams.toString()}`);
	}

	/**
	 * Deletes the selected reservations.
	 * - Reruns the load function to repopulate the data property.
	 * - Closes the delete modal.
	 * - Resets the selectAll flag to false.
	 * - Remaps the checkboxes.
	 * - Resets the query.
	 */
	async function deleteSelected() {
		await invalidateAll();
		deleteModal = false;
		selectAll = false;
		mapCheckboxes();
		query = "";
	}

	/**
	 * Handles the mass checkbox update when the "select all" checkbox is toggled.
	 * - Sets the deleteModal flag based on the checked status.
	 * - Updates the checked status of all checkboxes.
	 */
	function handleMassCheckboxUpdate(): void {
		const checked = !selectAll;
		deleteModal = checked;
		checkboxes = checkboxes.map((checkbox) => {
			return { id: checkbox.id, checked };
		});
	}

	// function handleCheckboxUpdate() {
	// 	// TODO: This function doesn't work without this timeout for some reason? Without timeout, the logic of this function is delayed by one checkbox update;
	// 	// the function may execute before the browser has finished updating the checkbox states -> resulting in the logic being based on the previous state
	// 	// timeout gives browser DOM to update the checkbox states prolly
	//  // below is implementation using eventlistener so the handleCheckboxChange only happens after checkbox changes itself
	// 	setTimeout(() => {
	// 		if (checkboxes.length && checkboxes.every((v) => v.checked == true)) {
	// 			selectAll = true;
	// 			deleteModal = true;
	// 		} else if (checkboxes.some((v) => v?.checked === true)) {
	// 			selectAll = false;
	// 			deleteModal = true;
	// 		} else {
	// 			selectAll = false;
	// 			deleteModal = false;
	// 		}
	// 	}, 1);
	// }

	checkboxes.forEach((checkboxData) => {
		const checkboxElement = document.getElementById(checkboxData.id);
		if (checkboxElement) {
			checkboxElement.addEventListener("change", handleCheckboxUpdate);
		}
	});

	/**
	 * Function to handle checkbox change event.
	 * Updates the 'selectAll' and 'deleteModal' state based on the checkbox status.
	 */
	function handleCheckboxUpdate() {
		if (checkboxes.length && checkboxes.every((checkbox) => checkbox.checked === true)) {
			selectAll = true;
			deleteModal = true;
		} else if (checkboxes.some((checkbox) => checkbox.checked === true)) {
			selectAll = false;
			deleteModal = true;
		} else {
			selectAll = false;
			deleteModal = false;
		}
	}

	/**
	 * Function to map reservations or suggestions to checkbox data.
	 * Resets the 'checkboxes' array and remaps checkboxes into it based on the current query status.
	 */
	function mapCheckboxes() {
		checkboxes = [];

		if (query) {
			suggestions.map((reservation, i) => {
				checkboxes[i] = { id: reservation.id, checked: false };
			});
		} else {
			reservations.map((reservation, i) => {
				checkboxes[i] = { id: reservation.id, checked: false };
			});
		}
	}

	/**
	 * Handles the loading of reservations data from the server response.
	 * Merges the newly loaded reservations into the existing reservations array
	 * triggers an update of the query, updates checkboxes based on the updated reservations
	 * and sorts the reservations based on the current sorting property.
	 *
	 * @param result - The result of the loading operation.
	 * @returns A Promise that resolves once the loading operation is handled.
	 */
	async function handleLoadingReservations(
		result: ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>
	): Promise<void> {
		if (result.type !== "success") return;
		if (!result.data) return;

		reservations = [...reservations, ...(result.data.reservations as any).items];

		setTimeout(() => {
			updateQuery();
		}, 1);

		mapCheckboxes();
		reservations.sort(tableSort);
	}
</script>

<AdminNav />
<div class="flex flex-col flex-nowrap pl-80">
	<h1 class="col-span-12 text-text-600 font-semibold mx-14 text-2xl">Rezervácie</h1>
	<div class="my-8 px-14 max-w-6xl mx-auto w-full">
		<Search bind:suggestions data={reservations} bind:updateSuggestions={updateQuery} bind:value={query} />
	</div>
	<div bind:this={tableWrapper} class="overflow-auto w-full">
		<!-- <form
			id="reservationselect"
			action="?/removeReservations"
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
				<col class="w-auto min-w-[160px]" />
				<col class="w-auto min-w-[160px]" />
				<col class="w-12" />
			</colgroup>
			<thead>
				<tr>
					<th class="flex items-center px-8 whitespace-nowrap h-[3rem] mt-1">
						<Checkbox
							disabled={!reservations?.length || (!suggestions?.length && Boolean(query))}
							bind:checked={selectAll}
							onCheck={handleMassCheckboxUpdate}
							name="select-all"
						/>
					</th>
					<th
						on:click={() => {
							handleSortProperty("name");
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t">Názov</th
					>
					<th
						on:click={() => {
							handleSortProperty("user");
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t">Používateľ</th
					>
					<th
						on:click={() => {
							handleSortProperty("category");
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t">Kategória</th
					>
					<th
						on:click={() => {
							handleSortProperty("guestCount");
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t">Počet hostí</th
					>
					<th
						on:click={() => {
							handleSortProperty("date");
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t">Dátum</th
					>
					<th
						on:click={() => {
							handleSortProperty("created");
						}}
						class="text-left hover:bg-background-100 px-2 cursor-pointer hover:text-text-600 rounded-t">Vytvorené</th
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
						{#each suggestions.filter((i) => suggestions.some((o) => o.id == i.id)) as suggestion, index}
							<tr
								on:click={async () => {
									await redirectToreservation(suggestion.id);
								}}
								class="hover:bg-background-100 cursor-pointer duration-100 border-b border-slate-400/40 group"
							>
								<td on:click|stopPropagation class="flex items-center px-8 whitespace-nowrap h-[3rem] mt-1">
									<Checkbox onCheck={handleCheckboxUpdate} bind:checked={checkboxes[index].checked} name={suggestion.id} />
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-60">
											{suggestion.name}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{suggestion.id}
										</p>
									</div>
								</td>
								<td class="px-2 whitespace-nowrap overflow-ellipsis overflow-hidden">{suggestion.expand?.user?.name}</td>
								<td class="px-2">
									{#if suggestion.expand?.category?.name}
										{suggestion.expand.category.name}
									{:else}
										Nenastavené
									{/if}
								</td>
								<td class="px-2">
									{#if suggestion.guestCount}
										{suggestion.guestCount}
									{:else}
										Nenastavené
									{/if}
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">{new Date(suggestion.date).toLocaleDateString("sk")}</p>
									</div>
								</td>
								<td class="px-2">
									<div class="flex flex-col gap-0">
										<p class="leading-5">
											{new Date(suggestion.created).toLocaleDateString("sk")}
										</p>
										<p class="leading-5 text-sm text-slate-400">
											{new Date(suggestion.created).toLocaleTimeString("sk")}
										</p>
									</div>
								</td>
								<td
									class="px-4 right-0 sticky bg-background-50 {displayShadow
										? 'arrow'
										: ''} transition-colors border-b border-slate-400/400 group-hover:bg-background-100 duration-100"
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
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
									<p>Nenašli sa žiadne rezervácie vyhovujúce vyhľadávaniu</p>
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
				{:else if reservations.length}
					{#each reservations as reservation, index}
						<tr
							on:click={async () => {
								await redirectToreservation(reservation.id);
							}}
							class="hover:bg-background-100 cursor-pointer duration-100 border-b border-slate-400/40 group"
						>
							<td on:click|stopPropagation class="flex items-center px-8 whitespace-nowrap h-[3rem] mt-1">
								<Checkbox onCheck={handleCheckboxUpdate} bind:checked={checkboxes[index].checked} name={reservation.id} />
							</td>
							<td class="px-2">
								<div class="flex flex-col gap-0">
									<p class="leading-5 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-60">
										{reservation.name}
									</p>
									<p class="leading-5 text-sm text-slate-400">
										{reservation.id}
									</p>
								</div>
							</td>
							<td class="px-2 whitespace-nowrap overflow-ellipsis overflow-hidden">{reservation.expand?.user?.name}</td>
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
									<p class="leading-5">{new Date(reservation.date).toLocaleDateString("sk")}</p>
								</div>
							</td>
							<td class="px-2">
								<div class="flex flex-col gap-0">
									<p class="leading-5">
										{new Date(reservation.created).toLocaleDateString("sk")}
									</p>
									<p class="leading-5 text-sm text-slate-400">
										{new Date(reservation.created).toLocaleTimeString("sk")}
									</p>
								</div>
							</td>
							<td
								class="px-4 right-0 sticky bg-background-50 {displayShadow
									? 'arrow'
									: ''} transition-colors border-b border-slate-400/400 group-hover:bg-background-100 duration-100"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
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
								<p>Nenašli sa žiadne rezervácie</p>
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
									action="?/getMoreReservations"
									method="post"
									use:enhance={({ formData }) => {
										pbPage += 1;
										formData.set("page", `${pbPage}`);
										return async ({ result }) => {
											handleLoadingReservations(result);

											await applyAction(result);
										};
									}}
								>
									<button class="px-4 bg-background-100 hover:bg-background-200 rounded-md text-text-900" type="submit">
										Načítať ďalšie ({data.reservations.totalItems - reservations.length})
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
			Označen{checkboxes.filter((t) => t?.checked === true).length > 1 ? "é" : "á"}
			<b>{checkboxes.filter((t) => t?.checked === true).length}</b>
			rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? "e" : "a"}
		</p>
		<button type="button" on:click={openConfirmModal} class="flex py-2 px-2 rounded-md text-text-100 gap-4 bg-accent-700 hover:bg-accent-600">
			Vymazať rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? "e" : "u"}
		</button>
	</div>
{/if}

<Popup bind:openPopup={openConfirmModal} bind:closePopup={closeConfirmModal}>
	<div class="w-80">
		<h2 class="text-text-700 text-xl mb-2">
			Vymazať rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? "e" : "u"}
		</h2>
		<p class="text-text-500 mb-4">
			Na vymazanie rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? "í" : "e"} potrebujete zadať dôvod, ktorý bude poslaný uživateľom
			cez E-Mail. Táto akcia je nevratná.
		</p>
		{#if errorConfirmMessage}
			<p class="text-red-500 mb-2 max-w-xs">{errorConfirmMessage}</p>
		{/if}
		<form
			action="?/removeReservations"
			method="POST"
			class="flex flex-col"
			use:enhance={({ formData }) => {
				formData.set("checkboxes", JSON.stringify(checkboxes.filter((t) => t?.checked === true).map((t) => t.id)));
				return async ({ result }) => {
					if (result.type === "failure") {
						errorConfirmMessage = typeof result.data?.message == "string" ? result.data.message : "";
					} else {
						await deleteSelected();
						closeConfirmModal();
					}
				};
			}}
		>
			<textarea
				placeholder="Dôvod na zrušenie rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? 'í' : 'e'}"
				maxlength="600"
				minlength="30"
				class="bg-background-100 resize-none rounded-md col-span-1 lg:col-span-2 min-h-40 p-2 text-text-600"
				name="reason"
				id="reason"
			></textarea>
			<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
				<button type="reset" on:click={closeConfirmModal} class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
					>Zrušiť</button
				>
				<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50">
					Vymazať rezerváci{checkboxes.filter((t) => t?.checked === true).length > 1 ? "e" : "u"}
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
