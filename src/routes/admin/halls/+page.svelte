<script lang="ts">
	//Icons
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';
	import Adjustments from '$lib/icons/Adjustments.svelte';

	//Svelte
	import { onDestroy, onMount } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { writable, type Writable } from 'svelte/store';
	import { invalidateAll } from '$app/navigation';
	import { fly } from 'svelte/transition';

	//Internal Libraries
	import { barGraphStyle } from '$lib/charts';
	import Dialog from '$lib/components/Dialog.svelte';
	import TextInput from '$lib/components/inputs/TextInput.svelte';

	//External Libraries
	import * as echarts from 'echarts';

	//Components
	import Switch from '$lib/components/inputs/Switch.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import Combobox from '$lib/components/inputs/ComboboxColor.svelte';
	import Calendar from '$lib/components/Calendar.svelte';

	const { data } = $props();

	let colorValue: string = $state('');
	let colorName: string = $state('');

	let showHall = $state(false);

	let showEditHall = $state(false);
	let editingId: number = $state(0);

	$effect(() => {
		if(editingId) {
			colorName = data.halls.find(i => i.id == editingId)?.color ?? '';
			colorValue = colorName;
		}
	})

	let hallCreateError: string | unknown = $state('');
	let validate: string[] = $state([]);

	$effect(() => {
		validate.forEach((i) => {
			(document.getElementById(i) as HTMLInputElement).setCustomValidity('Chybné pole');
		});
	});

	let timeFrame: 0 | 1 | 2 = $state(0);

	$effect(() => {
		const myChart = echarts.init(document.getElementById('chartWrapper'));

		switch (timeFrame) {
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
		new ResizeObserver(() => myChart.resize()).observe(
			document.getElementById('chartWrapper') as HTMLElement
		);
	});

	async function handleEditSubmit(event: SubmitEvent){
		event.preventDefault();
		const target = event.target as HTMLFormElement;
		const formData = new FormData();
		formData.set('name', (target.name as unknown as HTMLInputElement).value);
		formData.set('color', colorValue);
		formData.set('allow_reservations', target.allow_reservations?.checked);
		formData.set('custom_layouts', target.custom_layouts?.checked);
		formData.set('force_layouts', target.force_layouts?.checked);
		formData.set('allow_feedback', target.allow_feedback?.checked);

		const res = await fetch(`/admin/halls/${editingId}`, {
			method: 'PUT',
			body: formData
		});
		if(res.status == 400 || res.status == 403 || res.status == 404){
			const body = await res.json();
			hallCreateError = body.message;
			if(Array.isArray(body.validate)) validate = body.validate;
			console.error(res);
		}

		await invalidateAll();
		showEditHall = false;
		return res;
	}
</script>

<div class="w-full min-h-screen px-4 py-6 bg-slate-200 md:px-24">
	<div class="flex flex-row flex-wrap items-center justify-between w-full mx-auto max-w-7xl">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-slate-400">Prehľad</p>
			<p class="text-slate-700">Manažment sál</p>
		</div>
		<div class="flex flex-row items-center flex-nowrap">
			<button
				onclick={() => (showHall = true)}
				class="flex flex-row items-center gap-2 px-4 py-2 text-sm duration-150 bg-blue-500 border rounded hover:bg-blue-400 text-slate-100 border-blue-600/30"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</button>
		</div>
	</div>
	<div class="flex flex-col items-start w-full gap-4 mx-auto mt-4 max-w-7xl">
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative w-full overflow-y-auto border rounded border-slate-400/30 max-h-96 bg-slate-100"
			>
				<div class="sticky top-0 p-4 border-b border-slate-400/30 bg-slate-100">
					<h2>Prehľad sál</h2>
				</div>
				<div class="overflow-y-auto">
					<table class="w-full border-collapse">
						<colgroup>
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
								<tr class="event-table-row" onclick={() => {editingId = hall.id;showEditHall = true}}>
									<td class="event-table-long-text">{hall.name}</td>
									<td class="px-4 py-3 text-sm">
										{#if hall.plan}
											<span class="px-2 py-1 text-green-600 rounded bg-green-300/40">Nastavený</span
											>
										{:else}
											<span class="px-2 py-1 text-red-600 rounded bg-red-300/40">Nenastavený</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<div class="flex flex-row items-center gap-2">
											<div
												class="w-5 border rounded border-slate-400/30 aspect-square"
												style="background: {hall.color};"
											></div>
											<p>{hall.color}</p>
										</div>
									</td>
									<td class="px-4 py-3 text-sm">
										{hall.allow_reservations ? 'Áno' : 'Nie'}
									</td>
									<td class="px-4 py-3 text-sm">
										{hall.custom_layouts ? 'Áno' : 'Nie'}
									</td>
									<td class="px-4 py-3 text-sm">
										{hall.force_layouts ? 'Áno' : 'Nie'}
									</td>
									<td class="px-4 py-3 text-sm">
										<span class="flex flex-col">
											<p>{new Date(hall.created_at).toLocaleDateString('sk')}</p>
											<p class="text-xs text-slate-400">
												{new Date(hall.created_at).toLocaleTimeString('sk')}
											</p>
										</span>
									</td>
									<td class="px-4 py-3 text-sm">
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
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative flex flex-col w-full overflow-y-auto border rounded border-slate-400/30 h-96 bg-slate-100"
			>
				<div
					class="flex flex-row items-center justify-between p-4 border-b border-slate-400/30 bg-slate-100"
				>
					<h2>Prehľad udalostí v sálach</h2>
					<div class="flex flex-row items-center gap-2 justify-evenly">
						<p class="text-sm text-slate-400">Obdobie:</p>
						<button
							onclick={() => {
								timeFrame = 0;
							}}
							class="{timeFrame == 0
								? 'text-slate-800'
								: 'text-slate-400'} text-sm hover:underline">30 dni</button
						>
						<button
							onclick={() => {
								timeFrame = 1;
							}}
							class="{timeFrame == 1
								? 'text-slate-800'
								: 'text-slate-400'} text-sm text-slate-400 hover:underline">Polrok</button
						>
						<button
							onclick={() => {
								timeFrame = 2;
							}}
							class="{timeFrame == 2
								? 'text-slate-800'
								: 'text-slate-400'} text-sm text-slate-400 hover:underline">Rok</button
						>
					</div>
				</div>
				<div class="h-full overflow-y-auto" id="chartWrapper"></div>
			</div>
			<div
				class="flex flex-col w-full border rounded border-slate-400/30 min-w-72 sm:w-72 sm:h-96 bg-slate-100"
			>
				<div class="p-4 border-b border-slate-400/30">
					<h2>Naplánované udalosti</h2>
				</div>
				<div class="block h-full">
					<Calendar />
				</div>
			</div>
		</div>
		<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="flex flex-col w-full p-4 border border-slate-400/30 bg-slate-100">
				<h2 class="text-sm text-slate-500">Počet sál</h2>
				<p class="text-3xl font-bold">{data?.halls?.length ?? 0}</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-slate-400/30 bg-slate-100">
				<h2 class="text-sm text-slate-500">Naplánované udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-slate-400/30 bg-slate-100">
				<h2 class="text-sm text-slate-500">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-slate-400/30 bg-slate-100">
				<h2 class="text-sm text-slate-500">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
		</div>
	</div>
</div>

<Dialog bind:open={showHall}>
	{#snippet header()}
		<p>Nová sála</p>
	{/snippet}
	<form
		class="flex flex-col w-full"
		action="/admin/halls/?/create"
		method="post"
		use:enhance={({formData}) => {
			formData.append("color", colorValue);
			return async ({ result, update }) => {
				if (result.type === 'failure') {
					hallCreateError = result.data?.message;
					if(Array.isArray(result.data?.validate)) validate = result.data.validate;
					console.error(result);
				} else {
					await invalidateAll();
					showHall = false;
					await applyAction(result);
				}
			};
		}}
	>
		<div class="flex flex-col p-4">
			<label for="name" class="text-sm text-slate-800">Názov</label>
			<TextInput name="name" id="name" />
			<div class="grid w-full grid-cols-1 gap-4 mt-2 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<p class="text-sm text-slate-800">Plán sály</p>
					<div class="flex flex-row w-full gap-2">
						<button
							class="flex flex-row items-center justify-center w-full gap-2 px-4 py-2 text-sm duration-150 border rounded hover:bg-slate-200/50 text-slate-500 border-slate-400/30"
						>
							<p>Použiť existujúci</p>
						</button>
						<button
							class="flex flex-row items-center w-full gap-2 px-4 py-2 text-sm duration-150 bg-blue-500 border rounded hover:bg-blue-400 text-slate-100 border-blue-600/30"
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
					<label for="color" class="flex flex-row gap-2 text-sm text-slate-800"
						>Farba v grafoch <Tooltip>
							<p>
								Táto farba bude použitá v grafoch a prezentáciách, kde sa zobrazujú informácie o
								sále.
							</p>
						</Tooltip></label
					>
					<div class="flex flex-row gap-2 flex-nowrap">
						<div
							class="border rounded border-slate-400/30 aspect-square"
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
					<div class="flex flex-row items-center gap-2">
						<Switch name="allow_reservations" id="allow_reservations" checked={true} />
						<label for="allow_reservations" class="text-sm text-slate-800"
							>Povoliť rezervácie v sále</label
						>
					</div>
					<div class="flex flex-row items-center gap-2">
						<Switch name="custom_layouts" id="custom_layouts" />
						<label
							for="custom_layouts"
							class="flex flex-row items-center gap-2 text-sm text-slate-800"
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
					<div class="flex flex-row items-center gap-2">
						<Switch name="force_layouts" id="force_layouts" />
						<label
							for="force_layouts"
							class="flex flex-row items-center gap-2 text-sm text-slate-800"
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
					<div class="flex flex-row items-center gap-2">
						<Switch name="allow_feedback" id="allow_feedback" />
						<label
							for="allow_feedback"
							class="flex flex-row items-center gap-2 text-sm text-slate-800"
						>
							Povoliť spätnú väzbu
							<Tooltip>
								<p>
									Ak je táto možnosť zapnutá, po udalosti môžu používatelia nechať spätnú väzbu pre personál alebo pre sálu.
								</p>
							</Tooltip>
						</label>
					</div>
				</div>
			</div>
			{#if hallCreateError}
				<p in:fly={{ x: 10, duration: 600 }} class="mt-4 text-red-500">{hallCreateError}</p>
			{/if}
		</div>
		<div class="flex justify-between w-full p-4 border-t bg-slate-200 border-slate-400/30">
			<button
				onclick={() => (showHall = false)}
				class="flex flex-row items-center gap-2 px-4 py-2 text-sm duration-150 rounded hover:bg-slate-100/50 text-slate-500"
			>
				<p>Zrušiť</p>
			</button>
			<button
				onclick={() => (showHall = true)}
				class="flex flex-row items-center gap-2 px-4 py-2 text-sm duration-150 bg-blue-500 border rounded hover:bg-blue-400 text-slate-100 border-blue-600/30"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</button>
		</div>
	</form>
</Dialog>

<Dialog bind:open={showEditHall}>
	{#snippet header()}
		<p>Upraviť sálu</p>
	{/snippet}
	<form
		class="flex flex-col w-full"
		onsubmit={handleEditSubmit}
	>
		<div class="flex flex-col p-4">
			<label for="name" class="text-sm text-slate-800">Názov</label>
			<TextInput name="name" id="name" value={data.halls.find(i => i.id == editingId)?.name} />
			<div class="grid w-full grid-cols-1 gap-4 mt-2 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<p class="text-sm text-slate-800">Plán sály</p>
					<div class="flex flex-row w-full gap-2">
						<button
							class="flex flex-row items-center justify-center w-full gap-2 px-4 py-2 text-sm duration-150 border rounded hover:bg-slate-200/50 text-slate-500 border-slate-400/30"
						>
							<p>Použiť existujúci</p>
						</button>
						<button
							class="flex flex-row items-center w-full gap-2 px-4 py-2 text-sm duration-150 bg-blue-500 border rounded hover:bg-blue-400 text-slate-100 border-blue-600/30"
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
					<label for="color" class="flex flex-row gap-2 text-sm text-slate-800"
						>Farba v grafoch <Tooltip>
							<p>
								Táto farba bude použitá v grafoch a prezentáciách, kde sa zobrazujú informácie o
								sále.
							</p>
						</Tooltip></label
					>
					<div class="flex flex-row gap-2 flex-nowrap">
						<div
							class="border rounded border-slate-400/30 aspect-square"
							style="background: {colorValue};"
						></div>
						<Combobox
							id="color"
							name={colorName}
							bind:value={colorValue}
							placeholder="Názov farby / HEX kód"
							options={[
								{ value: '#3b82f6', name: 'Modrá' },
								{ value: '#8b5cf6', name: 'Fialová' }
							]}
						/>
					</div>
					<div class="flex flex-row items-center gap-2">
						<Switch name="allow_reservations" id="allow_reservations" checked={data.halls.find(i => i.id == editingId)?.allow_reservations} />
						<label for="allow_reservations" class="text-sm text-slate-800"
							>Povoliť rezervácie v sále</label
						>
					</div>
					<div class="flex flex-row items-center gap-2">
						<Switch name="custom_layouts" id="custom_layouts" checked={data.halls.find(i => i.id == editingId)?.custom_layouts} />
						<label
							for="custom_layouts"
							class="flex flex-row items-center gap-2 text-sm text-slate-800"
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
					<div class="flex flex-row items-center gap-2">
						<Switch name="force_layouts" id="force_layouts" checked={data.halls.find(i => i.id == editingId)?.force_layouts} />
						<label
							for="force_layouts"
							class="flex flex-row items-center gap-2 text-sm text-slate-800"
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
					<div class="flex flex-row items-center gap-2">
						<Switch name="allow_feedback" id="allow_feedback" checked={data.halls.find(i => i.id == editingId)?.allow_feedback} />
						<label
							for="allow_feedback"
							class="flex flex-row items-center gap-2 text-sm text-slate-800"
						>
							Povoliť spätnú väzbu
							<Tooltip>
								<p>
									Ak je táto možnosť zapnutá, po udalosti môžu používatelia nechať spätnú väzbu pre personál alebo pre sálu.
								</p>
							</Tooltip>
						</label>
					</div>
				</div>
			</div>
			{#if hallCreateError}
				<p in:fly={{ x: 10, duration: 600 }} class="mt-4 text-red-500">{hallCreateError}</p>
			{/if}
		</div>
		<div class="flex justify-between w-full p-4 border-t bg-slate-200 border-slate-400/30">
			<button
				type="reset"
				onclick={() => (showEditHall = false)}
				class="flex flex-row items-center gap-2 px-4 py-2 text-sm duration-150 rounded hover:bg-slate-100/50 text-slate-500"
			>
				<p>Zrušiť</p>
			</button>
			<button
				type="submit"
				onclick={() => {showEditHall = true}}
				class="flex flex-row items-center gap-2 px-4 py-2 text-sm duration-150 bg-blue-500 border rounded hover:bg-blue-400 text-slate-100 border-blue-600/30"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Upraviť sálu</p>
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
		@apply border-t border-slate-400/30 hover:bg-slate-200 cursor-pointer;
	}
	.event-table-row-modify {
		@apply mx-2 border-slate-400/30 border w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-slate-300;
	}
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-slate-600 max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
