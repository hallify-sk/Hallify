<script lang="ts">
	//Icons

	//Components
	import Switch from '$lib/components/inputs/Switch.svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import Button from '$lib/components/Button.svelte';

	const { data } = $props();

	let validate: string[] = $state([]);

	$effect(() => {
		validate.forEach((i) => {
			(document.getElementById(i) as HTMLInputElement).setCustomValidity('Chybné pole');
		});
	});

	import DateRangePicker from '$lib/components/inputs/DateRange.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Checkbox from '$lib/components/inputs/Checkbox.svelte';
	import Select from '$lib/components/inputs/Select.svelte';
	import TextInput from '$lib/components/inputs/TextInput.svelte';

	let selectedValue = $state('');
	let startDate: Date | null = $state(null);
	let endDate: Date | null = $state(null);

	// Edit dialog state
	let showEditEventBlockDialog: boolean = $state(false);
	let editingEventBlock: any = $state(null);
	let editSelectedValue = $state('');
	let editStartDate: Date | null = $state(null);
	let editEndDate: Date | null = $state(null);
	let editReason = $state('');
	let editEventBlockError: string | null = $state(null);

	const isDateRangeLessThanWeek = $derived(() => {
		if (!startDate || !endDate) return true;

		const diffTime = endDate.getTime() - startDate.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		return diffDays < 7;
	});

	// Calculate if date range is less than a week for edit dialog
	const isEditDateRangeLessThanWeek = $derived(() => {
		if (!editStartDate || !editEndDate) return true;
		const diffTime = editEndDate.getTime() - editStartDate.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return diffDays < 7;
	});

	function handleDateChange(start: Date | null, end: Date | null) {
		console.log('Date range changed:', { start, end });
	}

	let showTempEventBlocksDialog: boolean = $state(false);
	let eventBlockError: string | null = $state(null);

	const halls = $derived(
		data.halls.map((hall) => ({
			label: hall.hall.name,
			value: `${hall.hall.id}`
		}))
	);

	function openEditDialog(block: any) {
		editingEventBlock = block;
		editSelectedValue = block.hallId.toString();
		editStartDate = new Date(block.startDate);
		editEndDate = new Date(block.endDate);
		editReason = block.reason;
		editEventBlockError = null;
		showEditEventBlockDialog = true;
	}

	function resetEditForm() {
		editingEventBlock = null;
		editSelectedValue = '';
		editStartDate = null;
		editEndDate = null;
		editReason = '';
		editEventBlockError = null;
	}

	async function handleDeleteEventBlock() {
		if (!editingEventBlock) return;

		if (confirm('Naozaj chcete zmazať túto výluku?')) {
			try {
				const formData = new FormData();
				formData.set('eventBlockId', editingEventBlock.id.toString());

				const response = await fetch('?/deleteEventBlock', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();

				if (result.type === 'success') {
					await invalidateAll();
					showEditEventBlockDialog = false;
					resetEditForm();
					// Optional: Show success toast
					console.log('Event block deleted successfully');
				} else {
					editEventBlockError = result.data?.message || 'Chyba pri mazaní výluky';
				}
			} catch (error) {
				console.error('Delete error:', error);
				editEventBlockError = 'Chyba pri mazaní výluky. Skúste to znova.';
			}
		}
	}

	// Add state for permanent blocks
	let permanentBlocksChanges = $state<Record<string, Record<string, boolean>>>({});
	let savingPermanentBlocks = $state(false);
	let permanentBlocksError = $state<string | null>(null);

	// Initialize permanent blocks state
	$effect(() => {
		if (data.halls) {
			const initialState: Record<string, Record<string, boolean>> = {};
			data.halls.forEach((hallItem) => {
				const hallId = hallItem.hall.id.toString();
				const allowedDays = hallItem.hall.allowedDays || [
					'pon',
					'uto',
					'str',
					'stv',
					'pia',
					'sob',
					'ned'
				];

				initialState[hallId] = {
					pon: allowedDays.includes('pon'),
					uto: allowedDays.includes('uto'),
					str: allowedDays.includes('str'),
					stv: allowedDays.includes('stv'),
					pia: allowedDays.includes('pia'),
					sob: allowedDays.includes('sob'),
					ned: allowedDays.includes('ned')
				};
			});
			permanentBlocksChanges = initialState;
		}
	});

	function togglePermanentBlock(hallId: string, day: string) {
		if (!permanentBlocksChanges[hallId]) {
			permanentBlocksChanges[hallId] = {};
		}
		permanentBlocksChanges[hallId][day] = !permanentBlocksChanges[hallId][day];
	}

	function hasChanges() {
		// Check if there are any changes from the original state
		return data.halls.some((hallItem) => {
			const hallId = hallItem.hall.id.toString();
			const currentState = permanentBlocksChanges[hallId];
			if (!currentState) return false;

			const allowedDays = hallItem.hall.allowedDays || [
				'pon',
				'uto',
				'str',
				'stv',
				'pia',
				'sob',
				'ned'
			];

			return ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'].some((day) => {
				const original = allowedDays.includes(day);
				return currentState[day] !== original;
			});
		});
	}

	async function savePermanentBlocks() {
		savingPermanentBlocks = true;
		permanentBlocksError = null;

		try {
			const formData = new FormData();
			formData.set('permanentBlocks', JSON.stringify(permanentBlocksChanges));

			const response = await fetch('?/updatePermanentBlocks', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (result.type === 'success') {
				await invalidateAll();
			} else {
				permanentBlocksError = result.data?.message || 'Chyba pri ukladaní zmien';
			}
		} catch (error) {
			console.error('Save error:', error);
			permanentBlocksError = 'Chyba pri ukladaní zmien. Skúste to znova.';
		} finally {
			savingPermanentBlocks = false;
		}
	}

	function resetPermanentBlocks() {
		// Reset to original state
		const initialState: Record<string, Record<string, boolean>> = {};
		data.halls.forEach((hallItem) => {
			const hallId = hallItem.hall.id.toString();
			const allowedDays = hallItem.hall.allowedDays || [
				'pon',
				'uto',
				'str',
				'stv',
				'pia',
				'sob',
				'ned'
			];

			initialState[hallId] = {
				pon: allowedDays.includes('pon'),
				uto: allowedDays.includes('uto'),
				str: allowedDays.includes('str'),
				stv: allowedDays.includes('stv'),
				pia: allowedDays.includes('pia'),
				sob: allowedDays.includes('sob'),
				ned: allowedDays.includes('ned')
			};
		});
		permanentBlocksChanges = initialState;
		permanentBlocksError = null;
	}
</script>

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
	<div class="flex flex-row flex-wrap items-center justify-between w-full mx-auto max-w-7xl">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-text-1">Prehľad</p>
			<p class="text-text-main">Časové výluky</p>
		</div>
	</div>
	<div class="flex flex-col items-start w-full gap-4 mx-auto mt-4 max-w-7xl">
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative w-full overflow-hidden border rounded border-border-main/30 bg-background-1"
			>
				<!-- Header with Actions -->
				<div
					class="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border-main/30 bg-background-1"
				>
					<div>
						<h2 class="text-text-main font-medium">Trvalé výluky</h2>
						<p class="text-sm text-text-2">Nastavte dni, kedy sú sály natrvalo nedostupné</p>
					</div>

					{#if hasChanges()}
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="px-3 py-1 text-sm text-text-2 hover:text-text-main transition-colors"
								onclick={resetPermanentBlocks}
								disabled={savingPermanentBlocks}
							>
								Zrušiť
							</button>
							<Button
								color="primary"
								onclick={savePermanentBlocks}
								disabled={savingPermanentBlocks}
							>
								{savingPermanentBlocks ? 'Ukladá sa...' : 'Uložiť zmeny'}
							</Button>
						</div>
					{:else}
						<div class="flex items-center gap-1 text-sm text-text-2">
							<svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								></path>
							</svg>
							Uložené
						</div>
					{/if}
				</div>

				<!-- Error Display -->
				{#if permanentBlocksError}
					<div class="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
						<p class="text-sm text-red-800">{permanentBlocksError}</p>
					</div>
				{/if}

				<!-- Table -->
				<div class="overflow-y-auto max-h-96">
					<table class="w-full border-collapse">
						<colgroup>
							<col span="1" style="width: 30%; min-width:150px;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
						</colgroup>
						<thead class="sticky top-0 bg-background-2 z-5">
							<tr>
								<th
									rowspan="2"
									class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase border-r border-solid border-r-border-main/40"
								>
									Názov sály
								</th>
								<th
									colspan="7"
									class="text-[0.65rem] px-4 pt-2 text-text-1 font-bold text-center uppercase"
								>
									Povolené dni
									<div class="text-xs font-normal text-text-2 mt-1">Vypnuté = trvalá výluka</div>
								</th>
							</tr>
							<tr class="bg-background-2">
								<th class="text-[0.65rem] text-center px-2 py-2 text-text-1 font-normal uppercase"
									>Po</th
								>
								<th class="text-[0.65rem] text-center px-2 py-2 text-text-1 font-normal uppercase"
									>Ut</th
								>
								<th class="text-[0.65rem] text-center px-2 py-2 text-text-1 font-normal uppercase"
									>St</th
								>
								<th class="text-[0.65rem] text-center px-2 py-2 text-text-1 font-normal uppercase"
									>Št</th
								>
								<th class="text-[0.65rem] text-center px-2 py-2 text-text-1 font-normal uppercase"
									>Pi</th
								>
								<th class="text-[0.65rem] text-center px-2 py-2 text-text-1 font-normal uppercase"
									>So</th
								>
								<th class="text-[0.65rem] text-center px-2 py-2 text-text-1 font-normal uppercase"
									>Ne</th
								>
							</tr>
						</thead>
						<tbody>
							{#each data.halls as hallItem}
								{@const hall = hallItem.hall}
								{@const hallId = hall.id.toString()}
								{@const enabledDays = permanentBlocksChanges[hallId]
									? Object.values(permanentBlocksChanges[hallId]).filter(Boolean).length
									: 7}
								<tr class="event-table-row hover:bg-background-4/50 transition-colors">
									<td class="event-table-long-text font-medium">
										{hall.name}
										<!-- Status indicator -->
										<div class="flex items-center gap-1 mt-1">
											{#if enabledDays === 7}
												<span class="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
													Plne dostupná
												</span>
											{:else if enabledDays === 0}
												<span class="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
													Uplne blokovaná
												</span>
											{:else}
												<span class="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
													{enabledDays}/7 dní
												</span>
											{/if}
										</div>
									</td>
									{#each ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'] as day}
										<td class="px-2 py-3 text-center">
											<button
												type="button"
												class="relative w-8 h-8 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50
										{permanentBlocksChanges[hallId]?.[day]
													? 'bg-green-100 border-2 border-green-500 hover:bg-green-200'
													: 'bg-red-100 border-2 border-red-500 hover:bg-red-200'}"
												onclick={() => togglePermanentBlock(hallId, day)}
												title="{permanentBlocksChanges[hallId]?.[day]
													? 'Dostupné'
													: 'Blokované'} - {day}"
											>
												{#if permanentBlocksChanges[hallId]?.[day]}
													<!-- Check icon -->
													<svg
														class="w-4 h-4 text-green-600 mx-auto"
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path
															fill-rule="evenodd"
															d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
															clip-rule="evenodd"
														></path>
													</svg>
												{:else}
													<!-- X icon -->
													<svg
														class="w-4 h-4 text-red-600 mx-auto"
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path
															fill-rule="evenodd"
															d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
															clip-rule="evenodd"
														></path>
													</svg>
												{/if}
											</button>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Footer with Quick Actions -->
				<div class="border-t border-border-main/30 bg-background-2 p-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-4 text-xs text-text-2">
							<div class="flex items-center gap-1">
								<div class="w-3 h-3 bg-green-100 border border-green-500 rounded"></div>
								<span>Dostupné</span>
							</div>
							<div class="flex items-center gap-1">
								<div class="w-3 h-3 bg-red-100 border border-red-500 rounded"></div>
								<span>Blokované</span>
							</div>
						</div>

						<div class="flex items-center gap-2">
							<button
								type="button"
								class="text-xs text-text-2 hover:text-text-main transition-colors"
								onclick={() => {
									// Enable all days for all halls
									const newState = { ...permanentBlocksChanges };
									data.halls.forEach((hallItem) => {
										const hallId = hallItem.hall.id.toString();
										newState[hallId] = {
											pon: true,
											uto: true,
											str: true,
											stv: true,
											pia: true,
											sob: true,
											ned: true
										};
									});
									permanentBlocksChanges = newState;
								}}
							>
								Povoliť všetko
							</button>
							<span class="text-text-2">•</span>
							<button
								type="button"
								class="text-xs text-text-2 hover:text-text-main transition-colors"
								onclick={() => {
									// Disable weekends for all halls
									const newState = { ...permanentBlocksChanges };
									data.halls.forEach((hallItem) => {
										const hallId = hallItem.hall.id.toString();
										if (newState[hallId]) {
											newState[hallId].sob = false;
											newState[hallId].ned = false;
										}
									});
									permanentBlocksChanges = newState;
								}}
							>
								Blokovať víkendy
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative flex flex-col w-full overflow-y-auto border rounded border-border-main/30 h-96 bg-background-1"
			>
				<div
					class="flex flex-row items-center justify-between p-4 border-b border-border-main/30 bg-background-1 sticky top-0 z-20"
				>
					<h2 class="text-text-main">Časové výluky</h2>
					<Button
						onclick={() => {
							showTempEventBlocksDialog = true;
						}}
						color="primary">Vytvoriť výluku</Button
					>
				</div>
				<div>
					<div class="overflow-y-auto">
						<table class="w-full border-collapse">
							<colgroup>
								<col span="1" style="width: 15%;" />
								<col span="1" style="width: 20%;" />
								<col span="1" style="width: 25%;" />
								<col span="1" style="width: 30%;" />
							</colgroup>
							<thead>
								<tr class="bg-background-2">
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">
										Sála
									</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">
										Dátumový rozsah
									</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">
										Dôvod
									</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">
										Dni
									</th>
								</tr>
							</thead>
							<tbody>
								{#each data.eventBlocks as block}
									{@const hall = data.halls.find((h) => h.hall.id === block.hallId)}
									<tr
										class="event-table-row cursor-pointer hover:bg-background-4 transition-colors"
										onclick={() => openEditDialog(block)}
									>
										<td class="event-table-long-text">
											{hall?.hall.name || 'Neznáma sála'}
										</td>
										<td class="px-4 py-3 text-sm text-text-4">
											{new Date(block.startDate).toLocaleDateString('sk-SK')} -
											{new Date(block.endDate).toLocaleDateString('sk-SK')}
										</td>
										<td class="event-table-long-text">
											{block.reason}
										</td>
										<td class="px-4 py-3 text-sm">
											<span class="px-2 py-1 text-orange-600 rounded bg-orange-300/40 text-xs">
												{#if block.blockedDays && block.blockedDays.length === 7}
													Všetky dni
												{:else if block.blockedDays && block.blockedDays.length > 0}
													{block.blockedDays.join(', ')}
												{:else}
													Všetky dni
												{/if}
											</span>
										</td>
									</tr>
								{:else}
									<tr>
										<td colspan="4" class="px-4 py-8 text-center text-text-2">
											Žiadne časové výluky
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
			<div
				class="flex flex-col w-full border rounded border-border-main/30 min-w-72 sm:w-72 sm:h-96 bg-background-1"
			>
				<div class="p-4 border-b border-border-main/30">
					<h2 class="text-text-main">Naplánované výluky</h2>
				</div>
				<div class="block h-full">
					<Calendar
						eventBlocks={data.eventBlocks.map((block) => ({
							...block,
							blockedDays: block.blockedDays || []
						}))}
						permanentBlocks={data.halls.map((hallItem) => {
							const hall = hallItem.hall;
							const allowedDays = hall.allowedDays || ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'];

							// Convert allowedDays to blockedDays (opposite)
							const allDays = ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'];
							const blockedDays = allDays.filter((day) => !allowedDays.includes(day));

							return {
								id: hall.id,
								hallId: hall.id,
								reason: 'Trvalá výluka',
								blockedDays: blockedDays,
								isActive: blockedDays.length > 0
							};
						}).filter((block) => block.isActive)}
						halls={data.halls.map((h) => ({
							id: h.hall.id,
							name: h.hall.name,
							color: h.hall.color
						}))}
					/>
				</div>
			</div>
		</div>
		<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Počet sál</h2>
				<p class="text-3xl font-bold text-text-main">{data?.halls?.length ?? 0}</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Naplánované udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
		</div>
	</div>
</div>

<Dialog bind:open={showTempEventBlocksDialog}>
	{#snippet header()}
		<div class="flex items-center gap-2">
			<p>Vytvoriť dočasnú výluku</p>
		</div>
	{/snippet}
	<div class="flex flex-col w-full">
		<form
			class="flex flex-col w-full"
			action="?/createEventBlock"
			method="post"
			use:enhance={({ formData }) => {
				formData.set('hallId', selectedValue);
				formData.set('startDate', startDate ? startDate.toISOString() : '');
				formData.set('endDate', endDate ? endDate.toISOString() : '');
				formData.set('reason', (document.getElementById('reason') as HTMLInputElement).value);
				formData.set(
					'days',
					JSON.stringify(
						['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'].map((day) => ({
							day,
							checked: (document.getElementById(day) as HTMLInputElement).checked
						}))
					)
				);
				return async ({ result }) => {
					if (result.type === 'failure') {
						eventBlockError = result.data?.message as string;
						if (Array.isArray(result.data?.validate)) validate = result.data.validate;
						console.error(result);
					} else if (result.type === 'success') {
						await invalidateAll();
						showTempEventBlocksDialog = false;
						// Reset form
						selectedValue = '';
						startDate = null;
						endDate = null;
						eventBlockError = null;
						await applyAction(result);
					}
				};
			}}
		>
			<div class="p-6 flex flex-col gap-6">
				<!-- Step indicator -->
				<div class="flex items-center gap-2 text-xs text-text-2 mb-2">
					<span
						class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium"
						>1</span
					>
					<span class="flex-1 h-px bg-border-main/30"></span>
					<span
						class="w-6 h-6 {selectedValue
							? 'bg-primary text-white'
							: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>2</span
					>
					<span class="flex-1 h-px bg-border-main/30"></span>
					<span
						class="w-6 h-6 {startDate && endDate
							? 'bg-primary text-white'
							: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>3</span
					>
					<span class="flex-1 h-px bg-border-main/30"></span>
					<span
						class="w-6 h-6 bg-border-main/30 text-text-2 rounded-full flex items-center justify-center text-xs font-medium"
						>4</span
					>
				</div>

				<!-- Step 1: Hall Selection -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium"
						>
							1
						</div>
						<h3 class="text-base font-medium text-text-main">Vyberte sálu</h3>
					</div>
					<div class="pl-8">
						<Select
							bind:value={selectedValue}
							options={halls}
							placeholder="Kliknite pre výber sály..."
							label="Sála"
						/>
					</div>
				</div>

				<!-- Step 2: Date Range -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 {selectedValue
								? 'bg-primary text-white'
								: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>
							2
						</div>
						<h3 class="text-base font-medium text-text-main">Zadajte časové obdobie</h3>
					</div>
					<div class="pl-8">
						<DateRangePicker
							bind:startDate
							bind:endDate
							onDateChange={handleDateChange}
							placeholder="Kliknite pre výber dátumového rozsahu..."
							minDate={new Date()}
						/>
						{#if startDate && endDate}
							<div class="mt-2 p-3 bg-background-2 rounded-lg">
								<p class="text-sm text-text-main font-medium">
									Vybraný rozsah: <span class="font-normal"
										>{startDate.toLocaleDateString('sk-SK')} - {endDate.toLocaleDateString(
											'sk-SK'
										)}</span
									>
								</p>
								<p class="text-xs text-text-2 mt-1">
									{Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))} dní
								</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Step 3: Day Selection -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 {startDate && endDate
								? 'bg-primary text-white'
								: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>
							3
						</div>
						<h3
							class="text-base font-medium text-text-main"
							class:opacity-50={isDateRangeLessThanWeek()}
						>
							Vyberte dni výluky
						</h3>
						{#if isDateRangeLessThanWeek()}
							<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded"
								>Voliteľné pre rozsahy 7+ dní</span
							>
						{/if}
					</div>
					<div class="pl-8">
						{#if !isDateRangeLessThanWeek()}
							<p class="text-sm text-text-2 mb-3">
								Označte dni v týždni, kedy bude sála nedostupná počas vybraného obdobia.
							</p>
						{/if}

						<div class="grid grid-cols-7 gap-2" class:disabled-section={isDateRangeLessThanWeek()}>
							{#each ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'] as day}
								<div class="flex flex-col items-center">
									<label
										for={day}
										class="text-sm text-text-1 capitalize mb-1"
										class:opacity-50={isDateRangeLessThanWeek()}
									>
										{day}
									</label>
									<Checkbox
										name={day}
										id={day}
										checked={true}
										disabled={isDateRangeLessThanWeek()}
									/>
								</div>
							{/each}
						</div>

						{#if isDateRangeLessThanWeek()}
							<div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
								<p class="text-sm text-blue-800">
									<strong>Tip:</strong> Pre rozsahy kratšie ako týždeň sa výluka aplikuje na všetky dni
									automaticky. Výber konkrétnych dní je dostupný len pre dlhšie obdobia.
								</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Step 4: Reason -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 bg-border-main/30 text-text-2 rounded-full flex items-center justify-center text-xs font-medium"
						>
							4
						</div>
						<h3 class="text-base font-medium text-text-main">Uveďte dôvod výluky</h3>
					</div>
					<div class="pl-8">
						<TextInput
							id="reason"
							name="reason"
							type="text"
							placeholder="Napr. Rekonštrukcia, Údržba, Súkromná udalosť..."
						/>
						<p class="text-xs text-text-2 mt-1">
							Tento dôvod bude zobrazený pri zamietnutí rezervácií.
						</p>
					</div>
				</div>

				<!-- Error Display -->
				{#if eventBlockError}
					<div class="p-3 bg-red-50 border border-red-200 rounded-lg">
						<p class="text-sm text-red-800">{eventBlockError}</p>
					</div>
				{/if}
			</div>

			<!-- Footer Actions -->
			<div
				class="flex justify-between items-center p-4 border-t border-border-main/30 bg-background-2"
			>
				<button
					type="button"
					class="px-4 py-2 text-sm text-text-2 hover:text-text-main transition-colors"
					onclick={() => (showTempEventBlocksDialog = false)}
				>
					Zrušiť
				</button>

				<Button type="submit" color="primary" disabled={!selectedValue || !startDate || !endDate}>
					Vytvoriť výluku
				</Button>
			</div>
		</form>
	</div>
</Dialog>

<!-- Add the edit dialog after the create dialog -->
<Dialog bind:open={showEditEventBlockDialog}>
	{#snippet header()}
		<div class="flex items-center gap-2">
			<p>Upraviť výluku</p>
		</div>
	{/snippet}
	<div class="flex flex-col w-full">
		<form
		 class="flex flex-col w-full"
			action="?/updateEventBlock"
			method="post"
			use:enhance={({ formData }) => {
				formData.set('eventBlockId', editingEventBlock?.id.toString() || '');
				formData.set('hallId', editSelectedValue);
				formData.set('startDate', editStartDate ? editStartDate.toISOString() : '');
				formData.set('endDate', editEndDate ? editEndDate.toISOString() : '');
				formData.set('reason', editReason);
				
				// FIX: Remove the JSON stringify and just set the individual checkboxes
				// The server will read them directly from formData
				
				return async ({ result }) => {
					if (result.type === 'failure') {
						editEventBlockError = result.data?.message as string;
						if (Array.isArray(result.data?.validate)) validate = result.data.validate;
						console.error(result);
					} else if (result.type === 'success') {
						await invalidateAll();
						showEditEventBlockDialog = false;
						resetEditForm();
						await applyAction(result);
					}
				};
			}}
		>
			<div class="p-6 flex flex-col gap-6">
				<!-- Step indicator -->
				<div class="flex items-center gap-2 text-xs text-text-2 mb-2">
					<span
						class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium"
						>1</span
					>
					<span class="flex-1 h-px bg-border-main/30"></span>
					<span
						class="w-6 h-6 {editSelectedValue
							? 'bg-primary text-white'
							: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>2</span
					>
					<span class="flex-1 h-px bg-border-main/30"></span>
					<span
						class="w-6 h-6 {editStartDate && editEndDate
							? 'bg-primary text-white'
							: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>3</span
					>
					<span class="flex-1 h-px bg-border-main/30"></span>
					<span
						class="w-6 h-6 {editReason
							? 'bg-primary text-white'
							: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>4</span
					>
				</div>

				<!-- Step 1: Hall Selection -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium"
						>
							1
						</div>
						<h3 class="text-base font-medium text-text-main">Sála</h3>
					</div>
					<div class="pl-8">
						<Select
							bind:value={editSelectedValue}
							options={halls}
							placeholder="Vyberte sálu..."
							label="Sála"
						/>
					</div>
				</div>

				<!-- Step 2: Date Range -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 {editSelectedValue
								? 'bg-primary text-white'
								: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>
							2
						</div>
						<h3 class="text-base font-medium text-text-main">Časové obdobie</h3>
					</div>
					<div class="pl-8">
						<DateRangePicker
							bind:startDate={editStartDate}
							bind:endDate={editEndDate}
							placeholder="Vyberte dátumový rozsah..."
							minDate={new Date()}
						/>
						{#if editStartDate && editEndDate}
							<div class="mt-2 p-3 bg-background-2 rounded-lg">
								<p class="text-sm text-text-main font-medium">
									Vybraný rozsah: <span class="font-normal">
										{editStartDate.toLocaleDateString('sk-SK')} - {editEndDate.toLocaleDateString(
											'sk-SK'
										)}
									</span>
								</p>
								<p class="text-xs text-text-2 mt-1">
									{Math.ceil(
										(editEndDate.getTime() - editStartDate.getTime()) / (1000 * 60 * 60 * 24)
									)} dní
								</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Step 3: Day Selection -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 {editStartDate && editEndDate
								? 'bg-primary text-white'
								: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>
							3
						</div>
						<h3
							class="text-base font-medium text-text-main"
							class:opacity-50={isEditDateRangeLessThanWeek()}
						>
							Dni výluky
						</h3>
						{#if isEditDateRangeLessThanWeek()}
							<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded"
								>Voliteľné pre rozsahy 7+ dní</span
							>
						{/if}
					</div>
					<div class="pl-8">
						{#if !isEditDateRangeLessThanWeek()}
							<p class="text-sm text-text-2 mb-3">
								Označte dni v týždni, kedy bude sála nedostupná počas vybraného obdobia.
							</p>
						{/if}

						<div
							class="grid grid-cols-7 gap-2"
							class:disabled-section={isEditDateRangeLessThanWeek()}
						>
							{#each ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'] as day}
								<div class="flex flex-col items-center">
									<label
										for="edit-{day}"
										class="text-sm text-text-1 capitalize mb-1"
										class:opacity-50={isEditDateRangeLessThanWeek()}
									>
										{day}
									</label>
									<Checkbox
										name="edit-{day}"
										id="edit-{day}"
										checked={editingEventBlock?.blockedDays?.includes(day) || false}
										disabled={isEditDateRangeLessThanWeek()}
									/>
								</div>
							{/each}
						</div>

						{#if isEditDateRangeLessThanWeek()}
							<div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
								<p class="text-sm text-blue-800">
									<strong>Tip:</strong> Pre rozsahy kratšie ako týždeň sa výluka aplikuje na všetky dni
									automaticky.
								</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Step 4: Reason -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 {editReason
								? 'bg-primary text-white'
								: 'bg-border-main/30 text-text-2'} rounded-full flex items-center justify-center text-xs font-medium"
						>
							4
						</div>
						<h3 class="text-base font-medium text-text-main">Dôvod výluky</h3>
					</div>
					<div class="pl-8">
						<TextInput
							id="edit-reason"
							name="edit-reason"
							type="text"
							bind:value={editReason}
							placeholder="Napr. Rekonštrukcia, Údržba, Súkromná udalosť..."
						/>
						<p class="text-xs text-text-2 mt-1">
							Tento dôvod bude zobrazený pri zamietnutí rezervácií.
						</p>
					</div>
				</div>

				<!-- Error Display -->
				{#if editEventBlockError}
					<div class="p-3 bg-red-50 border border-red-200 rounded-lg">
						<p class="text-sm text-red-800">{editEventBlockError}</p>
					</div>
				{/if}
			</div>

			<!-- Footer Actions -->
			<div
				class="flex justify-between items-center p-4 border-t border-border-main/30 bg-background-2"
			>
				<div class="flex gap-2">
					<button
						type="button"
						class="px-4 py-2 text-sm text-text-2 hover:text-text-main transition-colors"
						onclick={() => {
							showEditEventBlockDialog = false;
							resetEditForm();
						}}
					>
						Zrušiť
					</button>

					<Button type="button" color="danger" onclick={handleDeleteEventBlock}>Zmazať</Button>
				</div>

				<Button
					type="submit"
					color="primary"
					disabled={!editSelectedValue || !editStartDate || !editEndDate || !editReason}
				>
					Uložiť zmeny
				</Button>
			</div>
		</form>
	</div>
</Dialog>

<style lang="postcss">
	/*
	.color-picker-radio {
		@apply w-full h-full rounded block p-1 border border-border-main/30 cursor-pointer relative hover:bg-slate-200;
	}
	.color-picker-radio div {
		@apply w-full h-full rounded block;
	}*/
	:global(input[type='radio'] + .color-picker-radio svg) {
		@apply hidden;
	}
	:global(input[type='radio']:checked + .color-picker-radio svg) {
		@apply block absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-text-main;
	}
	.event-table-row {
		@apply border-t border-border-main/30;
	}
	/*
	.event-table-row-modify {
		@apply mx-2 border-border-main/30 border w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-slate-300;
	}*/
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-text-main max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
	.disabled-section {
		@apply opacity-60 pointer-events-none;
	}
</style>
