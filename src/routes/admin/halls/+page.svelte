<script lang="ts">
	//Icons
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	//Svelte
	import { applyAction, enhance } from '$app/forms';
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
	import Button from '$lib/components/Button.svelte';
	import NumberInput from '$lib/components/inputs/NumberInput.svelte';

	const { data } = $props();

	let colorValue: string = $state('');
	let colorName: string = $state(''); // Add this for the display text

	let showHall = $state(false);

	let showEditHall = $state(false);
	let showPlansDialog = $state(false);
	let editingId: number = $state(0);

	$effect(() => {
		if (editingId) {
			// Fix: Access hall data correctly for Drizzle join result and initialize both values
			const hallData = data.halls.find((h) => h.hall.id == editingId);
			if (hallData?.hall.color) {
				colorValue = hallData.hall.color; // Set the hex value
				// Try to find matching color name from options
				const matchingOption = [
					{ value: '#3b82f6', name: 'Modrá' },
					{ value: '#8b5cf6', name: 'Fialová' },
					{ value: '#10b981', name: 'Zelená' },
					{ value: '#f59e0b', name: 'Oranžová' },
					{ value: '#ef4444', name: 'Červená' },
					{ value: '#06b6d4', name: 'Tyrkysová' },
					{ value: '#f97316', name: 'Oranžová' },
					{ value: '#84cc16', name: 'Limetková' }
				].find(option => option.value === hallData.hall.color);
				
				colorName = matchingOption ? matchingOption.name : hallData.hall.color;
			}
		}
	});

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
					// Fix: Update for Drizzle join structure
					const hallData = data.halls.map((hallItem) => {
						const hall = hallItem.hall;
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

					const styleOptions = barGraphStyle(months, 'light');

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

					// Fix: Update for Drizzle join structure
					const hallData = data.halls.map((hallItem) => {
						const hall = hallItem.hall;
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

					const styleOptions = barGraphStyle(months, 'light');

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

					// Fix: Update for Drizzle join structure
					const hallData = data.halls.map((hallItem) => {
						const hall = hallItem.hall;
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

					const styleOptions = barGraphStyle(days, 'light');

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

	async function handleEditSubmit(event: SubmitEvent) {
		event.preventDefault();
		const target = event.target as HTMLFormElement;
		const formData = new FormData();
		
		formData.set('name', (target.name as unknown as HTMLInputElement).value);
		formData.set('capacity', (target.capacity as unknown as HTMLInputElement).value);
		formData.set('color', colorValue);
		
		const hallData = data.halls.find((h) => h.hall.id == editingId);
		formData.set('plan', `${hallData?.hall.plan || ''}`);
		formData.set('allow_reservations', target.allow_reservations?.checked);
		formData.set('custom_layouts', target.custom_layouts?.checked);
		formData.set('force_layouts', target.force_layouts?.checked);
		formData.set('allow_feedback', target.allow_feedback?.checked);

		const res = await fetch(`/admin/halls/${editingId}`, {
			method: 'PUT',
			body: formData
		});
		
		if (res.status == 400 || res.status == 403 || res.status == 404) {
			const body = await res.json();
			hallCreateError = body.message;
			if (Array.isArray(body.validate)) validate = body.validate;
			console.error(res);
		} else {
			await invalidateAll();
			showEditHall = false;
		}
		
		return res;
	}

	// Add function to reset form state
	function resetCreateHallForm() {
		colorValue = '';
		colorName = ''; // Reset both values
		hallCreateError = '';
		validate = [];
	}
</script>

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
	<div class="flex flex-row flex-wrap items-center justify-between w-full mx-auto max-w-7xl">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-text-1">Prehľad</p>
			<p class="text-text-main">Manažment sál</p>
		</div>
		<div class="flex flex-row items-center flex-nowrap">
			<Button
				color="primary"
				onclick={() => {
					resetCreateHallForm(); // This will clear both colorValue and colorName
					showHall = true;
				}}
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</Button>
		</div>
	</div>
	<div class="flex flex-col items-start w-full gap-4 mx-auto mt-4 max-w-7xl">
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative w-full overflow-y-auto border rounded border-border-main/30 max-h-96 bg-background-1"
			>
				<div class="sticky top-0 p-4 border-b border-border-main/30 bg-background-1">
					<h2 class="text-text-main">Prehľad sál</h2>
				</div>
				<div class="overflow-y-auto">
					<table class="w-full border-collapse">
						<colgroup>
							<col span="1" style="width: 20%; min-width:150px;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 5%;" />
							<col span="1" style="width: 5%;" />
							<col span="1" style="width: 5%;" />
							<col span="1" style="width: 10%; min-width:130px;" />
							<col span="1" style="width: 10%; min-width:130px;" />
						</colgroup>
						<thead>
							<tr class="bg-background-2">
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Názov</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Kapacita</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Plan sály</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Farba</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Povoliť rezervácie</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Vlastné rozloženia</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Vynútiť rozloženia</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Vytvorené</th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Naposledy zmenené</th>
							</tr>
						</thead>
						<tbody>
							<!-- Fix: Update for Drizzle join structure -->
							{#each data.halls as hallItem}
								{@const hall = hallItem.hall}
								<tr
									class="event-table-row"
									onclick={() => {
										editingId = hall.id;
										colorValue = hall.color;
										showEditHall = true;
									}}
								>
									<td class="event-table-long-text">{hall.name}</td>
									<td class="px-4 py-3 text-sm text-text-main">{hall.capacity} ľudí</td>
									<td class="px-4 py-3 text-sm">
										{#if hall.plan}
											<span class="px-2 py-1 rounded text-success bg-success/40">Nastavený</span>
										{:else}
											<span class="px-2 py-1 rounded text-danger bg-danger/40">Nenastavený</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<div class="flex flex-row items-center gap-2 text-text-main">
											<div
												class="w-5 border rounded border-border-main/30 aspect-square"
												style="background: {hall.color};"
											></div>
											<p>{hall.color}</p>
										</div>
									</td>
									<td class="px-4 py-3 text-sm text-text-main">
										{hall.allow_reservations ? 'Áno' : 'Nie'}
									</td>
									<td class="px-4 py-3 text-sm text-text-main">
										{hall.custom_layouts ? 'Áno' : 'Nie'}
									</td>
									<td class="px-4 py-3 text-sm text-text-main">
										{hall.force_layouts ? 'Áno' : 'Nie'}
									</td>
									<td class="px-4 py-3 text-sm text-text-main">
										<span class="flex flex-col">
											<p>{new Date(hall.createdAt).toLocaleDateString('sk')}</p>
											<p class="text-xs text-text-1">
												{new Date(hall.createdAt).toLocaleTimeString('sk')}
											</p>
										</span>
									</td>
									<td class="px-4 py-3 text-sm text-text-main">
										<span class="flex flex-col">
											<p>{new Date(hall.updatedAt).toLocaleDateString('sk')}</p>
											<p class="text-xs text-text-1">
												{new Date(hall.updatedAt).toLocaleTimeString('sk')}
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
				class="relative flex flex-col w-full overflow-y-auto border rounded border-border-main/30 h-96 bg-background-1"
			>
				<div
					class="flex flex-row items-center justify-between p-4 border-b border-border-main/30 bg-background-1"
				>
					<h2 class="text-text-main">Prehľad udalostí v sálach</h2>
					<div class="flex flex-row items-center gap-2 justify-evenly">
						<p class="text-sm text-text-main">Obdobie:</p>
						<button
							onclick={() => {
								timeFrame = 0;
							}}
							class="{timeFrame == 0 ? 'text-primary' : 'text-text-1'} text-sm hover:underline"
							>30 dni</button
						>
						<button
							onclick={() => {
								timeFrame = 1;
							}}
							class="{timeFrame == 1 ? 'text-primary' : 'text-text-1'} text-sm hover:underline"
							>Polrok</button
						>
						<button
							onclick={() => {
								timeFrame = 2;
							}}
							class="{timeFrame == 2 ? 'text-primary' : 'text-text-1'} text-sm hover:underline"
							>Rok</button
						>
					</div>
				</div>
				<div class="h-full overflow-y-auto" id="chartWrapper"></div>
			</div>
			<div
				class="flex flex-col w-full border rounded border-border-main/30 min-w-72 sm:w-72 sm:h-96 bg-background-1"
			>
				<div class="p-4 border-b border-border-main/30">
					<h2 class="text-text-main">Naplánované udalosti</h2>
				</div>
				<div class="block h-full">
					<Calendar/>
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

<Dialog bind:open={showHall}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Icon scale="small">
                <Plus />
            </Icon>
            <p class="text-text-main">Vytvoriť novú sálu</p>
        </div>
    {/snippet}
    <form
        class="flex flex-col w-full"
        action="/admin/halls/?/create"
        method="post"
        use:enhance={() => {
            return async ({ result }) => {
                if (result.type === 'failure') {
                    hallCreateError = result.data?.message;
                    if (Array.isArray(result.data?.validate)) validate = result.data.validate;
                    console.error(result);
                } else {
                    await invalidateAll();
                    resetCreateHallForm(); // Reset form after successful creation
                    showHall = false;
                    await applyAction(result);
                }
            };
        }}
    >
        <div class="flex flex-col p-6 space-y-6">
            <!-- Step indicator -->
            <div class="flex items-center gap-2 text-xs text-text-2 mb-2">
                <span class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">1</span>
                <span class="flex-1 h-px bg-border-main/30"></span>
                <span class="w-6 h-6 bg-border-main/30 text-text-2 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                <span class="flex-1 h-px bg-border-main/30"></span>
                <span class="w-6 h-6 bg-border-main/30 text-text-2 rounded-full flex items-center justify-center text-xs font-medium">3</span>
            </div>

            <!-- Step 1: Basic Information -->
            <div class="space-y-4">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">1</div>
                    <h3 class="text-lg font-medium text-text-main">Základné informácie</h3>
                </div>
                
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <label for="name" class="text-sm font-medium text-text-main">
                            Názov sály <span class="text-red-500">*</span>
                        </label>
                        <TextInput 
                            name="name" 
                            id="name" 
                            placeholder="napr. Hlavná sála, Konferenčná miestnosť A"
                            error={validate.includes('name') ? 'Názov je povinný' : ''}

                        />
                        <p class="text-xs text-text-2">Názov, ktorý budú vidieť používatelia pri rezervácii</p>
                    </div>
                    
                    <div class="space-y-2">
                        <label for="capacity" class="text-sm font-medium text-text-main">
                            Kapacita <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <NumberInput 
                                name="capacity" 
                                id="capacity" 
                                placeholder="50"
                                min={1}
                                max={10000}
                                error={validate.includes('capacity') ? 'Kapacita musí byť číslo väčšie ako 0' : ''}

                            />
                            <span class="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-2 text-sm">ľudí</span>
                        </div>
                        <p class="text-xs text-text-2">Maximálny počet osôb, ktoré sa zmestia do sály</p>
                    </div>
                </div>
            </div>

            <!-- Step 2: Visual Settings -->
            <div class="space-y-4">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-6 h-6 bg-border-main/30 text-text-2 rounded-full flex items-center justify-center text-xs font-medium">2</div>
                    <h3 class="text-lg font-medium text-text-main">Vizuálne nastavenia</h3>
                </div>

                <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <!-- Color Selection -->
                    <div class="space-y-3">
                        <label for="color" class="flex items-center gap-2 text-sm font-medium text-text-main">
                            Farba sály <span class="text-red-500">*</span>
                            <Tooltip>
                                <p class="text-text-main">
                                    Táto farba bude použitá v grafoch a prezentáciách na identifikáciu sály
                                </p>
                            </Tooltip>
                        </label>
                        <div class="flex items-center gap-3">
                            <div class="flex-1">
                                <Combobox
                                    id="color"
                                    bind:name={colorName}
                                    bind:value={colorValue}
                                    placeholder="Vyberte farbu alebo zadajte HEX kód"
                                    error={validate.includes('color') ? 'Farba je povinná' : ''}
                                    options={[
                                        { value: '#3b82f6', name: 'Modrá' },
                                        { value: '#8b5cf6', name: 'Fialová' },
                                        { value: '#10b981', name: 'Zelená' },
                                        { value: '#f59e0b', name: 'Oranžová' },
                                        { value: '#ef4444', name: 'Červená' },
                                        { value: '#06b6d4', name: 'Tyrkysová' },
                                        { value: '#f97316', name: 'Oranžová' },
                                        { value: '#84cc16', name: 'Limetková' }
                                    ]}
                                />
                            </div>
							<input type="hidden" name="color_value" bind:value={colorValue} />
                        </div>
                        <p class="text-xs text-text-2">Farba pre rozlíšenie sály v grafoch a zoznamoch</p>
                    </div>

                    <!-- Hall Plan -->
                    <div class="space-y-3">
                        <p class="text-sm font-medium text-text-main">Plán sály</p>
                        <div class="border-2 border-dashed border-border-main/30 rounded-lg p-6 text-center bg-background-2/50">
                            <div class="flex flex-col items-center gap-3">
                                <div class="w-12 h-12 bg-background-4 rounded-lg flex items-center justify-center">
                                    <Icon scale="medium">
                                        <Plus />
                                    </Icon>
                                </div>
                                <div class="space-y-1">
                                    <p class="text-sm text-text-main">Plán sa nastaví neskôr</p>
                                    <p class="text-xs text-text-2">Plán môžete vytvoriť po vytvorení sály</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 3: Permissions & Settings -->
            <div class="space-y-4">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-6 h-6 bg-border-main/30 text-text-2 rounded-full flex items-center justify-center text-xs font-medium">3</div>
                    <h3 class="text-lg font-medium text-text-main">Oprávnenia a nastavenia</h3>
                </div>

                <div class="space-y-4">
                    <!-- Main Settings Grid -->
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div class="space-y-4 p-4 bg-background-2/50 rounded-lg">
                            <h4 class="text-sm font-medium text-text-main">Rezervácie</h4>
                            <div class="space-y-3">
                                <div class="flex items-start gap-3">
                                    <Switch name="allow_reservations" id="allow_reservations" checked={true} />
                                    <div class="space-y-1">
                                        <label for="allow_reservations" class="text-sm text-text-main font-medium cursor-pointer">
                                            Povoliť rezervácie
                                        </label>
                                        <p class="text-xs text-text-2">Používatelia si môžu rezervovať túto sálu</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-4 p-4 bg-background-2/50 rounded-lg">
                            <h4 class="text-sm font-medium text-text-main">Rozloženia</h4>
                            <div class="space-y-3">
                                <div class="flex items-start gap-3">
                                    <Switch name="custom_layouts" id="custom_layouts" />
                                    <div class="space-y-1">
                                        <label for="custom_layouts" class="text-sm text-text-main font-medium cursor-pointer">
                                            Vlastné rozloženia
                                        </label>
                                        <p class="text-xs text-text-2">Používatelia si môžu vytvárať vlastné rozloženia stolov</p>
                                    </div>
                                </div>
                                
                                <div class="flex items-start gap-3">
                                    <Switch name="force_layouts" id="force_layouts" />
                                    <div class="space-y-1">
                                        <label for="force_layouts" class="text-sm text-text-main font-medium cursor-pointer">
                                            Vynútiť rozloženie
                                        </label>
                                        <p class="text-xs text-text-2">Rozloženie musí byť nastavené pri rezervácii</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Feedback Setting -->
                    <div class="p-4 bg-background-2/50 rounded-lg">
                        <div class="flex items-start gap-3">
                            <Switch name="allow_feedback" id="allow_feedback" />
                            <div class="space-y-1">
                                <label for="allow_feedback" class="text-sm text-text-main font-medium cursor-pointer">
                                    Povoliť spätnú väzbu
                                </label>
                                <p class="text-xs text-text-2">Po udalosti môžu používatelia nechať hodnotenie a komentáre</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Error Display -->
            {#if hallCreateError}
                <div class="p-4 bg-red-50 border border-red-200 rounded-lg" in:fly={{ x: 10, duration: 600 }}>
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                        </svg>
                        <p class="text-sm text-red-800 font-medium">Chyba pri vytváraní sály</p>
                    </div>
                    <p class="text-sm text-red-700 mt-1">{hallCreateError}</p>
                </div>
            {/if}
        </div>

        <!-- Footer Actions -->
        <div class="flex justify-between items-center p-4 border-t border-border-main/30 bg-background-2">
            <Button type="button" color="transparent" onclick={() => (showHall = false)}>
                Zrušiť
            </Button>
            <Button type="submit" color="primary">
                <Icon scale="small">
                    <Plus />
                </Icon>
                <span>Vytvoriť sálu</span>
            </Button>
        </div>
    </form>
</Dialog>

<Dialog bind:open={showEditHall}>
    {@const currentHall = data.halls.find((h) => h.hall.id == editingId)?.hall}
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Icon scale="small">
                <Plus />
            </Icon>
            <p class="text-text-main">Upraviť sálu</p>
        </div>
    {/snippet}
    <form class="flex flex-col w-full" onsubmit={handleEditSubmit}>
        <div class="flex flex-col p-6 space-y-6">
            <!-- Step indicator -->
            <div class="flex items-center gap-2 text-xs text-text-2 mb-2">
                <span class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">1</span>
                <span class="flex-1 h-px bg-primary"></span>
                <span class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">2</span>
                <span class="flex-1 h-px bg-primary"></span>
                <span class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">3</span>
            </div>

            <!-- Step 1: Basic Information -->
            <div class="space-y-4">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">1</div>
                    <h3 class="text-lg font-medium text-text-main">Základné informácie</h3>
                </div>
                
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <label for="edit-name" class="text-sm font-medium text-text-main">
                            Názov sály <span class="text-red-500">*</span>
                        </label>
                        <TextInput
                            name="name"
                            id="edit-name"
                            value={currentHall?.name || ''}
                            placeholder="napr. Hlavná sála, Konferenčná miestnosť A"
                            error={validate.includes('name') ? 'Názov je povinný' : ''}
                        />
                        <p class="text-xs text-text-2">Názov, ktorý budú vidieť používatelia pri rezervácii</p>
                    </div>
                    
                    <div class="space-y-2">
                        <label for="edit-capacity" class="text-sm font-medium text-text-main">
                            Kapacita <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <NumberInput
                                name="capacity"
                                id="edit-capacity"
                                value={currentHall?.capacity || 0}
                                placeholder="50"
                                min={1}
                                max={10000}
                                error={validate.includes('capacity') ? 'Kapacita musí byť číslo väčšie ako 0' : ''}
                            />
                            <span class="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-2 text-sm">ľudí</span>
                        </div>
                        <p class="text-xs text-text-2">Maximálny počet osôb, ktoré sa zmestia do sály</p>
                    </div>
                </div>
            </div>

            <!-- Step 2: Visual Settings -->
            <div class="space-y-4">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">2</div>
                    <h3 class="text-lg font-medium text-text-main">Vizuálne nastavenia</h3>
                </div>

                <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <!-- Color Selection -->
                    <div class="space-y-3">
                        <label for="edit-color" class="flex items-center gap-2 text-sm font-medium text-text-main">
                            Farba sály <span class="text-red-500">*</span>
                            <Tooltip>
                                <p class="text-text-main">
                                    Táto farba bude použitá v grafoch a prezentáciách na identifikáciu sály
                                </p>
                            </Tooltip>
                        </label>
                        <div class="flex items-center gap-3">
                            <div class="flex-1">
                                <Combobox
                                    id="edit-color"
                                    bind:name={colorName}
                                    bind:value={colorValue}
                                    placeholder="Vyberte farbu alebo zadajte HEX kód"
                                    error={validate.includes('color') ? 'Farba je povinná' : ''}
                                    options={[
                                        { value: '#3b82f6', name: 'Modrá' },
                                        { value: '#8b5cf6', name: 'Fialová' },
                                        { value: '#10b981', name: 'Zelená' },
                                        { value: '#f59e0b', name: 'Oranžová' },
                                        { value: '#ef4444', name: 'Červená' },
                                        { value: '#8b5cf6', name: 'Fialová' },
                                        { value: '#f97316', name: 'Oranžová' },
                                        { value: '#84cc16', name: 'Limetková' }
                                    ]}
                                />
                            </div>
                        </div>
                        <p class="text-xs text-text-2">Farba pre rozlíšenie sály v grafoch a zoznamoch</p>
                    </div>

                    <!-- Hall Plan -->
                    <div class="space-y-3">
                        <p class="text-sm font-medium text-text-main">Plán sály</p>
                        
                        {#if currentHall?.plan}
                            {@const hallData = data.halls.find((h) => h.hall.id == editingId)}
                            <div class="relative rounded-lg overflow-hidden border-2 border-border-main/30">
                                {#if hallData?.plan}
                                    <img src={hallData.plan.preview} class="w-full h-40 object-cover" alt="Plán sály" />
                                {:else}
                                    <div class="w-full h-40 bg-background-2 flex items-center justify-center">
                                        <p class="text-text-2">Náhľad nie je dostupný</p>
                                    </div>
                                {/if}
                                <div class="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                                    <Button
                                        type="button"
                                        onclick={() => { showPlansDialog = true; }}
                                        color="secondary"
                                    >
                                        <Icon scale="small">
                                            <Plus />
                                        </Icon>
                                        <span>Zmeniť</span>
                                    </Button>
                                    <a href="/admin/halls/{editingId}/editor">
                                        <Button color="primary">
                                            <Icon scale="small">
                                                <Plus />
                                            </Icon>
                                            <span>Upraviť</span>
                                        </Button>
                                    </a>
                                </div>
                            </div>
                        {:else}
                            <div class="border-2 border-dashed border-border-main/30 rounded-lg p-6 text-center bg-background-2/50">
                                <div class="flex flex-col items-center gap-3">
                                    <div class="w-12 h-12 bg-background-4 rounded-lg flex items-center justify-center">
                                        <Icon scale="medium">
                                            <Plus />
                                        </Icon>
                                    </div>
                                    <div class="space-y-1">
                                        <p class="text-sm text-text-main">Žiadny plán</p>
                                        <p class="text-xs text-text-2">Vytvorte alebo vyberte plán sály</p>
                                    </div>
                                    <div class="flex gap-2">
                                        <Button 
                                            type="button" 
                                            onclick={() => { showPlansDialog = true; }}
                                            color="secondary" 
                                            
                                        >
                                            <Icon scale="small">
                                                <Plus />
                                            </Icon>
                                            <span>Vybrať existujúci</span>
                                        </Button>
                                        <a href="/admin/halls/{editingId}/editor">
                                            <Button color="primary">
                                                <Icon scale="small">
                                                    <Plus />
                                                </Icon>
                                                <span>Vytvoriť nový</span>
                                            </Button>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        {/if}
                        <p class="text-xs text-text-2">Plán ukazuje rozloženie stolov a sedadiel v sále</p>
                    </div>
                </div>
            </div>

            <!-- Step 3: Permissions & Settings -->
            <div class="space-y-4">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">3</div>
                    <h3 class="text-lg font-medium text-text-main">Oprávnenia a nastavenia</h3>
                </div>

                <div class="space-y-4">
                    <!-- Main Settings Grid -->
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div class="space-y-4 p-4 bg-background-2/50 rounded-lg">
                            <h4 class="text-sm font-medium text-text-main">Rezervácie</h4>
                            <div class="space-y-3">
                                <div class="flex items-start gap-3">
                                    <Switch
                                        name="allow_reservations"
                                        id="edit_allow_reservations"
                                        checked={currentHall?.allow_reservations}
                                    />
                                    <div class="space-y-1">
                                        <label for="edit_allow_reservations" class="text-sm text-text-main font-medium cursor-pointer">
                                            Povoliť rezervácie
                                        </label>
                                        <p class="text-xs text-text-2">Používatelia si môžu rezervovať túto sálu</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-4 p-4 bg-background-2/50 rounded-lg">
                            <h4 class="text-sm font-medium text-text-main">Rozloženia</h4>
                            <div class="space-y-3">
                                <div class="flex items-start gap-3">
                                    <Switch
                                        name="custom_layouts"
                                        id="edit_custom_layouts"
                                        checked={currentHall?.custom_layouts}
                                    />
                                    <div class="space-y-1">
                                        <label for="edit_custom_layouts" class="text-sm text-text-main font-medium cursor-pointer">
                                            Vlastné rozloženia
                                        </label>
                                        <p class="text-xs text-text-2">Používatelia si môžu vytvárať vlastné rozloženia stolov</p>
                                    </div>
                                </div>
                                
                                <div class="flex items-start gap-3">
                                    <Switch 
                                        name="force_layouts" 
                                        id="edit_force_layouts" 
                                        checked={currentHall?.force_layouts} 
                                    />
                                    <div class="space-y-1">
                                        <label for="edit_force_layouts" class="text-sm text-text-main font-medium cursor-pointer">
                                            Vynútiť rozloženie
                                        </label>
                                        <p class="text-xs text-text-2">Rozloženie musí byť nastavené pri rezervácii</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Feedback Setting -->
                    <div class="p-4 bg-background-2/50 rounded-lg">
                        <div class="flex items-start gap-3">
                            <Switch
                                name="allow_feedback"
                                id="edit_allow_feedback"
                                checked={currentHall?.allow_feedback}
                            />
                            <div class="space-y-1">
                                <label for="edit_allow_feedback" class="text-sm text-text-main font-medium cursor-pointer">
                                    Povoliť spätnú väzbu
                                </label>
                                <p class="text-xs text-text-2">Po udalosti môžu používatelia nechať hodnotenie a komentáre</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Error Display -->
            {#if hallCreateError}
                <div class="p-4 bg-red-50 border border-red-200 rounded-lg" in:fly={{ x: 10, duration: 600 }}>
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                        </svg>
                        <p class="text-sm text-red-800 font-medium">Chyba pri úprave sály</p>
                    </div>
                    <p class="text-sm text-red-700 mt-1">{hallCreateError}</p>
                </div>
            {/if}
        </div>

        <!-- Footer Actions -->
        <div class="flex justify-between w-full p-4 border-t bg-slate-200 border-border-main/30">
            <button
                type="reset"
                onclick={() => (showEditHall = false)}
                class="flex flex-row items-center gap-2 px-4 py-2 text-sm duration-150 rounded hover:bg-slate-100/50 text-slate-500"
            >
                <p>Zrušiť</p>
            </button>
            <button
                type="submit"
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

<Dialog bind:open={showPlansDialog}>
	{#snippet header()}
		<p>Vybrať plan</p>
	{/snippet}
	<div class="flex flex-col w-full">
		<form
			class="flex flex-col w-full"
			action="/admin/halls/{editingId}?/changePlan"
			method="post"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'failure') {
						hallCreateError = result.data?.message;
						if (Array.isArray(result.data?.validate)) validate = result.data.validate;
						console.error(result);
					} else {
						await invalidateAll();
						showPlansDialog = false;
						await applyAction(result);
					}
				};
			}}
		>
			<div class="grid grid-cols-3 gap-4 p-4 auto-rows-fr">
				{#each data.plans as plan}
					<fieldset>
						<input
							type="radio"
							name="planId"
							id={plan.id.toString()}
							value={plan.id}
							class="hidden peer"
						/>
						<label
							class="block p-2 rounded cursor-pointer hover:bg-background-4 peer-checked:bg-background-4"
							for={plan.id.toString()}
						>
							<img src={plan.preview} class="rounded-md" alt="Plán sály" />
						</label>
					</fieldset>
				{/each}
			</div>
			<div class="flex justify-between w-full p-4 border-t bg-slate-200 border-border-main/30">
				<button
					type="reset"
					onclick={() => (showPlansDialog = false)}
					class="flex flex-row items-center gap-2 px-4 py-2 text-sm duration-150 rounded hover:bg-slate-100/50 text-slate-500"
				>
					<p>Zrušiť</p>
				</button>
				<Button type="submit" onclick={() => (showPlansDialog = true)} color="primary">
					<Icon scale="small">
						<Plus />
					</Icon>
					<p>Nastaviť plan</p>
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
		@apply border-t border-border-main/30 hover:bg-background-4 cursor-pointer;
	}
	/*
    .event-table-row-modify {
        @apply mx-2 border-border-main/30 border w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-slate-300;
    }*/
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-text-main max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
