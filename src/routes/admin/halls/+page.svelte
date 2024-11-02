<script lang="ts">
	import { barGraphStyle } from '$lib/charts';
	import Dialog from '$lib/components/Dialog.svelte';
	import TextInput from '$lib/components/inputs/TextInput.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	import * as echarts from 'echarts';
	import { onDestroy, onMount } from 'svelte';
	import Switch from '$lib/components/inputs/Switch.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import Combobox from '$lib/components/inputs/Combobox.svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import { applyAction, enhance } from '$app/forms';
	import { writable, type Writable } from 'svelte/store';
	import { invalidateAll } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import Adjustments from '$lib/icons/Adjustments.svelte';

	export let data;
	console.log(data);

	let colorValue: string;

	let openEventDialog: () => void;
	let closeEventDialog: () => void;

	let openEventEditDialog: () => void;
	let closeEventEditDialog: () => void;

	let hallCreateError: string | unknown = '';
	let validate: Writable<string[]> = writable([]);

	const timeFrame: Writable<0 | 1 | 2> = writable(0);

	let destroy: (() => void) | undefined;
	let unsubscribeTimeFrame: () => void;

	onMount(() => {
		destroy = validate.subscribe((value) => {
			$validate.forEach((i) => {
				(document.getElementById(i) as HTMLInputElement).setCustomValidity('Chybné pole');
			});
		});

		var myChart = echarts.init(document.getElementById('chartWrapper'));

		unsubscribeTimeFrame = timeFrame.subscribe((v) => {
			switch (v) {
				case 1:
					{
						const getLast6Months = () => {
							const dates = [];
							const now = new Date();
							for (let i = 5; i >= 0; i--) {
								const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
								dates.push(date.toLocaleDateString('sk', { year: 'numeric', month: 'long' }));
							}
							return dates;
						};

						const months = getLast6Months();
						const hallData = data.halls.map((hall) => {
							return {
								name: hall.name,
								data: months.map((month) => {
									const reservations = data.reservations.filter((reservation) => {
										const reservationDate = new Date(reservation.date);
										return (
											reservationDate.toLocaleDateString('sk', {
												year: 'numeric',
												month: 'long'
											}) === month && reservation.hall_id === hall.id
										);
									});
									return reservations.length;
								}),
								color: hall.color
							};
						});

						const styleOptions = barGraphStyle(months);

						myChart.setOption({
							...styleOptions,
							series: hallData.map((hall) => ({
								type: 'bar',
								name: hall.name,
								data: hall.data,
								stack: 'total',
								itemStyle: {
									color: hall.color
								}
							}))
						});
					}
					break;
				case 2:
					{
						const getLast12Months = () => {
							const dates = [];
							const now = new Date();
							for (let i = 11; i >= 0; i--) {
								const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
								dates.push(date.toLocaleDateString('sk', { year: 'numeric', month: 'long' }));
							}
							return dates;
						};

						const months = getLast12Months();

						const hallData = data.halls.map((hall) => {
							return {
								name: hall.name,
								data: months.map((month) => {
									const reservations = data.reservations.filter((reservation) => {
										const reservationDate = new Date(reservation.date);
										return (
											reservationDate.toLocaleDateString('sk', {
												year: 'numeric',
												month: 'long'
											}) === month && reservation.hall_id === hall.id
										);
									});
									return reservations.length;
								}),
								color: hall.color
							};
						});

						const styleOptions = barGraphStyle(months);

						myChart.setOption({
							...styleOptions,
							series: hallData.map((hall) => ({
								type: 'bar',
								name: hall.name,
								data: hall.data,
								stack: 'total',
								itemStyle: {
									color: hall.color
								}
							}))
						});
					}
					break;
				default:
					{
						const getLast30Days = () => {
							const dates = [];
							for (let i = 29; i >= 0; i--) {
								const date = new Date();
								date.setDate(date.getDate() - i);
								dates.push(date.toLocaleDateString('sk'));
							}
							return dates;
						};

						const days = getLast30Days();

						const hallData = data.halls.map((hall) => {
							return {
								name: hall.name,
								data: days.map((day) => {
									const reservations = data.reservations.filter((reservation) => {
										const reservationDate = new Date(reservation.date);
										return (
											reservationDate.toLocaleDateString('sk') === day &&
											reservation.hall_id === hall.id
										);
									});
									return reservations.length;
								}),
								color: hall.color
							};
						});

						const styleOptions = barGraphStyle(days);

						myChart.setOption({
							...styleOptions,
							series: hallData.map((hall) => ({
								type: 'bar',
								name: hall.name,
								data: hall.data,
								stack: 'total',
								itemStyle: {
									color: hall.color
								}
							}))
						});
					}
					break;
			}
			console.log(v);
		});

		new ResizeObserver(() => myChart.resize()).observe(
			document.getElementById('chartWrapper') as HTMLElement
		);
	});

	onDestroy(() => {
		destroy?.();
		unsubscribeTimeFrame?.();
	});

	$state("hello");
</script>

<div class="w-full min-h-screen bg-slate-200 py-6 px-4 md:px-24">
	<div class="max-w-7xl w-full mx-auto flex flex-row flex-wrap justify-between items-center">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-slate-400">Prehľad</p>
			<p class="text-slate-700">Manažment sál</p>
		</div>
		<div class="flex flex-row flex-nowrap items-center">
			<button
				on:click={openEventDialog}
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</button>
		</div>
	</div>
	<div class="max-w-7xl w-full mx-auto flex flex-col gap-4 mt-4 items-start">
		<div class="flex flex-col sm:flex-row gap-4 w-full">
			<div
				class="border border-slate-400/30 w-full max-h-96 bg-slate-100 relative overflow-y-auto rounded"
			>
				<div class="p-4 border-b border-slate-400/30 sticky top-0 bg-slate-100">
					<h2>Prehľad sál</h2>
				</div>
				<div class="overflow-y-auto">
					<table class="w-full border-collapse">
						<colgroup>
							<col span="1" style="width: 5%;" />
							<col span="1" style="width: 25%; min-width:150px;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 5%;" />
							<col span="1" style="width: 5%;" />
							<col span="1" style="width: 5%;" />
							<col span="1" style="width: 10%; min-width:130px;" />
							<col span="1" style="width: 10%; min-width:130px;" />
						</colgroup>
						<thead>
							<tr class="bg-slate-200">
								<th></th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Názov</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Plan sály</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Farba</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Povoliť rezervácie</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Vlastné rozloženia</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Vynútiť rozloženia</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Vytvorené</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Naposledy zmenené</th
								>
							</tr>
						</thead>
						<tbody>
							{#each data.halls as hall}
								<tr class="event-table-row">
									<td>
										<button on:click={() => {
											openEventEditDialog();
										}} class="event-table-row-modify">
											<Icon scale="small">
												<Adjustments />
											</Icon>
										</button>
									</td>
									<td class="event-table-long-text">{hall.name}</td>
									<td class="text-sm px-4 py-3">
										{#if hall.plan}
											<span class="bg-green-300/40 px-2 py-1 rounded text-green-600">Nastavený</span
											>
										{:else}
											<span class="bg-red-300/40 px-2 py-1 rounded text-red-600">Nenastavený</span>
										{/if}
									</td>
									<td class="text-sm px-4 py-3 text-slate-600">
										<div class="flex flex-row gap-2 items-center">
											<div
												class="border border-slate-400/30 w-5 aspect-square rounded"
												style="background: {hall.color};"
											></div>
											<p>{hall.color}</p>
										</div>
									</td>
									<td class="text-sm px-4 py-3">
										{hall.allow_reservations ? 'Áno' : 'Nie'}
									</td>
									<td class="text-sm px-4 py-3">
										{hall.custom_layouts ? 'Áno' : 'Nie'}
									</td>
									<td class="text-sm px-4 py-3">
										{hall.force_layouts ? 'Áno' : 'Nie'}
									</td>
									<td class="text-sm px-4 py-3">
										<span class="flex flex-col">
											<p>{new Date(hall.created_at).toLocaleDateString('sk')}</p>
											<p class="text-xs text-slate-400">
												{new Date(hall.created_at).toLocaleTimeString('sk')}
											</p>
										</span>
									</td>
									<td class="text-sm px-4 py-3">
										<span class="flex flex-col">
											<p>{new Date(hall.updated_at).toLocaleDateString('sk')}</p>
											<p class="text-xs text-slate-400">
												{new Date(hall.updated_at).toLocaleTimeString('sk')}
											</p>
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
		<div class="flex flex-col sm:flex-row gap-4 w-full">
			<div
				class="border border-slate-400/30 w-full h-96 bg-slate-100 relative overflow-y-auto rounded flex flex-col"
			>
				<div
					class="p-4 border-b border-slate-400/30 bg-slate-100 flex flex-row justify-between items-center"
				>
					<h2>Prehľad udalostí v sálach</h2>
					<div class="flex flex-row gap-2 items-center justify-evenly">
						<p class="text-slate-400 text-sm">Obdobie:</p>
						<button
							on:click={() => {
								timeFrame.set(0);
							}}
							class="{$timeFrame == 0
								? 'text-slate-800'
								: 'text-slate-400'} text-sm hover:underline">30 dni</button
						>
						<button
							on:click={() => {
								timeFrame.set(1);
							}}
							class="{$timeFrame == 1
								? 'text-slate-800'
								: 'text-slate-400'} text-sm text-slate-400 hover:underline">Polrok</button
						>
						<button
							on:click={() => {
								timeFrame.set(2);
							}}
							class="{$timeFrame == 2
								? 'text-slate-800'
								: 'text-slate-400'} text-sm text-slate-400 hover:underline">Rok</button
						>
					</div>
				</div>
				<div class="overflow-y-auto h-full" id="chartWrapper"></div>
			</div>
			<div
				class="border border-slate-400/30 min-w-72 w-full sm:w-72 sm:h-96 bg-slate-100 flex flex-col rounded"
			>
				<div class="p-4 border-b border-slate-400/30">
					<h2>Naplánované udalosti</h2>
				</div>
				<div class="h-full block">
					<Calendar />
				</div>
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Počet sál</h2>
				<p class="text-3xl font-bold">{data?.halls?.length ?? 0}</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Naplánované udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
		</div>
	</div>
</div>

<Dialog title="Nová sála" bind:handleOpen={openEventDialog} bind:handleClose={closeEventDialog}>
	<form
		class="w-full flex flex-col"
		action="/admin/halls/?/create"
		method="post"
		use:enhance={({ formData }) => {
			formData.set('color', colorValue);
			return async ({ result }) => {
				if (result.type === 'failure') {
					hallCreateError = result.data?.message;
					Array.isArray(result.data?.validate) && validate.set(result.data?.validate);
					console.error(result);
				} else {
					await invalidateAll();
					closeEventDialog();
					await applyAction(result);
				}
			};
		}}
	>
		<div class="p-4 flex flex-col">
			<label for="name" class="text-sm text-slate-800">Názov</label>
			<TextInput name="name" id="name" />
			<div class="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
				<div class="flex flex-col gap-2">
					<p class="text-sm text-slate-800">Plán sály</p>
					<div class="flex flex-row w-full gap-2">
						<button
							class="flex flex-row justify-center gap-2 items-center hover:bg-slate-200/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm border border-slate-400/30 w-full"
						>
							<p>Použiť existujúci</p>
						</button>
						<button
							class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm w-full"
						>
							<Icon scale="small">
								<Plus />
							</Icon>
							<p>Vytvoriť nový</p>
						</button>
					</div>
					<img src="https://placehold.co/1080x1080" class="rounded-md" alt="Plán sály" />
				</div>

				<div class="flex flex-col gap-2">
					<label for="color" class="text-sm text-slate-800 flex flex-row gap-2"
						>Farba v grafoch <Tooltip>
							<p>
								Táto farba bude použitá v grafoch a prezentáciách, kde sa zobrazujú informácie o
								sále.
							</p>
						</Tooltip></label
					>
					<div class="flex flex-row flex-nowrap gap-2">
						<div
							class="border border-slate-400/30 aspect-square rounded"
							style="background: {colorValue};"
						></div>
						<Combobox
							id="color"
							bind:value={colorValue}
							placeholder="Názov farby / HEX kód"
							options={[
								{ value: '#3b82f6', name: 'Modrá' },
								{ value: '#8b5cf6', name: 'Fialová' }
							]}
						/>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="allow_reservations" id="allow_reservations" checked={true} />
						<label for="allow_reservations" class="text-sm text-slate-800"
							>Povoliť rezervácie v sále</label
						>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="custom_layouts" id="custom_layouts" />
						<label
							for="custom_layouts"
							class="text-sm text-slate-800 flex flex-row items-center gap-2"
							>Povoliť vlastné rozloženia
							<Tooltip>
								<p>
									Zapnutím tejto možnosti si uživatelia môžu vytvárať vlastné rozloženia stolov vo
									vašej sále. Ak je táto možnosť vypnutá, používatelia si môžu vyberať iba z vašich
									predom vytvorených rozložení.
								</p>
							</Tooltip>
						</label>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="force_layouts" id="force_layouts" />
						<label
							for="force_layouts"
							class="text-sm text-slate-800 flex flex-row items-center gap-2"
						>
							Vynútiť rozloženie sály
							<Tooltip>
								<p>
									Ak je táto možnosť vypnutá, uživatelia si môžu rozloženie stolov dodatočne vyplniť
									neskôr, po vytvorení rezervácie.
								</p>
							</Tooltip>
						</label>
					</div>
				</div>
			</div>
			{#if hallCreateError}
				<p in:fly={{ x: 10, duration: 600 }} class="text-red-500 mt-4">{hallCreateError}</p>
			{/if}
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
				on:click={closeEventDialog}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<button
				on:click={openEventDialog}
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</button>
		</div>
	</form>
</Dialog>

<Dialog title="Úprava parametrov sály" bind:handleOpen={openEventEditDialog} bind:handleClose={closeEventEditDialog}>
	<form
		class="w-full flex flex-col"
		action="/admin/halls/?/create"
		method="post"
		use:enhance={({ formData }) => {
			formData.set('color', colorValue);
			return async ({ result }) => {
				if (result.type === 'failure') {
					hallCreateError = result.data?.message;
					Array.isArray(result.data?.validate) && validate.set(result.data?.validate);
					console.error(result);
				} else {
					await invalidateAll();
					closeEventDialog();
					await applyAction(result);
				}
			};
		}}
	>
		<div class="p-4 flex flex-col">
			<label for="name" class="text-sm text-slate-800">Názov</label>
			<TextInput name="name" id="name" />
			<div class="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
				<div class="flex flex-col gap-2">
					<p class="text-sm text-slate-800">Plán sály</p>
					<div class="flex flex-row w-full gap-2">
						<button
							class="flex flex-row justify-center gap-2 items-center hover:bg-slate-200/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm border border-slate-400/30 w-full"
						>
							<p>Použiť existujúci</p>
						</button>
						<button
							class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm w-full"
						>
							<Icon scale="small">
								<Plus />
							</Icon>
							<p>Vytvoriť nový</p>
						</button>
					</div>
					<img src="https://placehold.co/1080x1080" class="rounded-md" alt="Plán sály" />
				</div>

				<div class="flex flex-col gap-2">
					<label for="color" class="text-sm text-slate-800 flex flex-row gap-2"
						>Farba v grafoch <Tooltip>
							<p>
								Táto farba bude použitá v grafoch a prezentáciách, kde sa zobrazujú informácie o
								sále.
							</p>
						</Tooltip></label
					>
					<div class="flex flex-row flex-nowrap gap-2">
						<div
							class="border border-slate-400/30 aspect-square rounded"
							style="background: {colorValue};"
						></div>
						<Combobox
							id="color"
							bind:value={colorValue}
							placeholder="Názov farby / HEX kód"
							options={[
								{ value: '#3b82f6', name: 'Modrá' },
								{ value: '#8b5cf6', name: 'Fialová' }
							]}
						/>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="allow_reservations" id="allow_reservations" checked={true} />
						<label for="allow_reservations" class="text-sm text-slate-800"
							>Povoliť rezervácie v sále</label
						>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="custom_layouts" id="custom_layouts" />
						<label
							for="custom_layouts"
							class="text-sm text-slate-800 flex flex-row items-center gap-2"
							>Povoliť vlastné rozloženia
							<Tooltip>
								<p>
									Zapnutím tejto možnosti si uživatelia môžu vytvárať vlastné rozloženia stolov vo
									vašej sále. Ak je táto možnosť vypnutá, používatelia si môžu vyberať iba z vašich
									predom vytvorených rozložení.
								</p>
							</Tooltip>
						</label>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="force_layouts" id="force_layouts" />
						<label
							for="force_layouts"
							class="text-sm text-slate-800 flex flex-row items-center gap-2"
						>
							Vynútiť rozloženie sály
							<Tooltip>
								<p>
									Ak je táto možnosť vypnutá, uživatelia si môžu rozloženie stolov dodatočne vyplniť
									neskôr, po vytvorení rezervácie.
								</p>
							</Tooltip>
						</label>
					</div>
				</div>
			</div>
			{#if hallCreateError}
				<p in:fly={{ x: 10, duration: 600 }} class="text-red-500 mt-4">{hallCreateError}</p>
			{/if}
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
				on:click={closeEventDialog}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<button
				on:click={openEventDialog}
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</button>
		</div>
	</form>
</Dialog>

<style lang="postcss">
	.color-picker-radio {
		@apply w-full h-full rounded block p-1 border border-slate-400/30 cursor-pointer relative hover:bg-slate-200;
	}
	.color-picker-radio div {
		@apply w-full h-full rounded block;
	}
	:global(input[type='radio'] + .color-picker-radio svg) {
		@apply hidden;
	}
	:global(input[type='radio']:checked + .color-picker-radio svg) {
		@apply block absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white;
	}
	.event-table-row {
		@apply border-t border-slate-400/30 hover:bg-slate-200;
	}
	.event-table-row-modify {
		@apply mx-2 border-slate-400/30 border w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-slate-300;
	}
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-slate-600 max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
