<script lang="ts">
    import Button from '$lib/components/Button.svelte';
    import Calendar from '$lib/components/Calendar.svelte';
    import Dialog from '$lib/components/Dialog.svelte';
    import TextInput from '$lib/components/inputs/TextInput.svelte';
    import Textarea from '$lib/components/inputs/Textarea.svelte';
    import Select from '$lib/components/inputs/Select.svelte';
    import NumberInput from '$lib/components/inputs/NumberInput.svelte';
    import Switch from '$lib/components/inputs/Switch.svelte';
    import Navbar from '$lib/components/Navbar.svelte';
    import Adjustments from '$lib/icons/Adjustments.svelte';
    import Icon from '$lib/icons/Icon.svelte';
    import Plus from '$lib/icons/Plus.svelte';
    import CalendarIcon from '$lib/icons/CalendarIcon.svelte';
    import Users from '$lib/icons/Users.svelte';
    import Clock from '$lib/icons/Clock.svelte';
    
    import { applyAction, enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { fly } from 'svelte/transition';

    let { data } = $props();

    let showEventDialog = $state(false);
    let eventCreateError = $state('');
    let validate: string[] = $state([]);

    // Form state - Make sure these are properly initialized
    let eventName = $state('');
    let eventDescription = $state('');
    let selectedHallId = $state('');
    let startDate = $state('');
    let endDate = $state('');
    let startTime = $state('');
    let endTime = $state('');
    let maxParticipants = $state(0); // Change to string for NumberInput
    let isPublic = $state(true);
    let allowRegistration = $state(true);

    // Reset form function
    function resetEventForm() {
        eventName = '';
        eventDescription = '';
        selectedHallId = '';
        startDate = '';
        endDate = '';
        startTime = '';
        endTime = '';
        maxParticipants = 0; // Reset to empty string
        isPublic = true;
        allowRegistration = true;
        eventCreateError = '';
        validate = [];
    }

    // Helper function to get today's date in YYYY-MM-DD format
    function getTodayDate() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    // Helper function to get current time in HH:MM format
    function getCurrentTime() {
        const now = new Date();
        return now.toTimeString().slice(0, 5);
    }

    // Initialize dates when dialog opens
    $effect(() => {
        if (showEventDialog && !startDate) {
            const today = getTodayDate();
            const currentTime = getCurrentTime();
            
            startDate = today;
            endDate = today;
            startTime = currentTime;
            
            // Set end time 2 hours later
            const endTimeDate = new Date();
            endTimeDate.setHours(endTimeDate.getHours() + 2);
            endTime = endTimeDate.toTimeString().slice(0, 5);
        }
    });
</script>

<Navbar user={data.user} permission={data.permission} />

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
    <div class="flex flex-row flex-wrap items-center justify-between w-full mx-auto max-w-7xl">
        <div class="flex flex-col flex-nowrap">
            <p class="uppercase text-[0.65rem] text-text-1">Prehľad</p>
            <p class="text-text-main">Panel informácií</p>
        </div>
        <div class="flex flex-row items-center flex-nowrap">
            <Button 
                color="primary" 
                onclick={() => {
                    resetEventForm();
                    showEventDialog = true;
                }}
            >
                <Icon scale="small">
                    <Plus />
                </Icon>
                <p>Vytvoriť udalosť</p>
            </Button>
        </div>
    </div>
    
    <div class="flex flex-col items-start w-full gap-4 mx-auto mt-4 max-w-7xl">
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative w-full overflow-y-auto border rounded border-border-main/30 h-96 bg-background-1"
			>
				<div class="sticky top-0 p-4 border-b border-border-main/30 bg-background-1">
					<h2 class="text-text-main">Prehľad udalostí</h2>
				</div>
				<div class="overflow-y-auto">
					<table class="w-full border-b border-collapse border-border-main/30">
						<colgroup>
							<col span="1" style="width: 5%;" />
							<col span="2" style="width: 70%;" />
							<col span="1" style="width: 15%;" />
							<col span="1" style="width: 10%;" />
						</colgroup>
						<thead>
							<tr class="bg-background-2">
								<th></th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Názov</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Dátum</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Stav</th
								>
							</tr>
						</thead>
						<tbody>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 rounded text-primary bg-primary-4/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.A</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-black rounded bg-black/30">Ukončená</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
			<div
				class="flex flex-col w-full border rounded border-border-main/30 min-w-72 sm:w-72 sm:h-96 bg-background-1"
			>
				<div class="p-4 border-b border-border-main/30">
					<h2 class="text-text-main">Naplánované udalosti</h2>
				</div>
				<div class="block h-full">
					<Calendar />
				</div>
			</div>
		</div>
		<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Naplánované udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
		</div>
	</div>
</div>

<Dialog bind:open={showEventDialog}>
	{#snippet header()}
		<div class="flex items-center gap-2">
			<Icon scale="small">
				<CalendarIcon />
			</Icon>
			<p class="text-text-main">Vytvoriť novú udalosť</p>
		</div>
	{/snippet}
	
	<form
		class="flex flex-col w-full"
		action="?/createEvent"
		method="post"
		use:enhance={() => {
			return async ({ result }) => {
				if (result.type === 'failure') {
					eventCreateError = result.data?.message as string;
					if (Array.isArray(result.data?.validate)) validate = result.data.validate;
					console.error(result);
				} else if (result.type === 'success') {
					await invalidateAll();
					showEventDialog = false;
					resetEventForm();
					await applyAction(result);
				}
			};
		}}
	>
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
				
				<div class="grid grid-cols-1 gap-4">
					<div class="space-y-2">
						<label for="event-name" class="text-sm font-medium text-text-main">
							Názov udalosti <span class="text-red-500">*</span>
						</label>
						<TextInput
							id="event-name"
							name="name"
							bind:value={eventName}
							placeholder="napr. Maturitný ples, Konferencia, Koncert..."
							error={validate.includes('name') ? 'Názov musí mať aspoň 3 znaky' : ''}
						/>
						<p class="text-xs text-text-2">Názov, ktorý budú vidieť účastníci</p>
					</div>
					
					<div class="space-y-2">
						<label for="event-description" class="text-sm font-medium text-text-main">
							Popis udalosti <span class="text-red-500">*</span>
						</label>
						<Textarea
							id="event-description"
							name="description"
							bind:value={eventDescription}
							placeholder="Opíšte vašu udalosť, program, čo môžu účastníci očakávať..."
							rows={4}
							error={validate.includes('description') ? 'Popis musí mať aspoň 10 znakov' : ''}
						/>
						<p class="text-xs text-text-2">Detailný popis pre účastníkov</p>
					</div>
				</div>
			</div>

			<!-- Step 2: Location & Time -->
			<div class="space-y-4">
				<div class="flex items-center gap-2 mb-4">
					<div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">2</div>
					<h3 class="text-lg font-medium text-text-main">Miesto a čas</h3>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<!-- Hall Selection -->
					<div class="space-y-2">
						<label for="event-hall" class="text-sm font-medium text-text-main">
							Sála <span class="text-red-500">*</span>
						</label>
						<Select
							options={data.halls?.map(hall => ({
								value: hall.id.toString(),
								label: `${hall.name} (kapacita: ${hall.capacity})`
							})) || []}
							bind:value={selectedHallId}
							placeholder="Vyberte sálu"
							error={validate.includes('hallId') ? 'Vyberte sálu' : ''}
							onchange={(event) => {
								selectedHallId = event.value;
								// Reset max participants when hall changes
								maxParticipants = 0;
							}}
						/>
						<input type="hidden" name="hallId" value={selectedHallId} />
						<p class="text-xs text-text-2">Kde sa bude udalosť konať</p>
					</div>

					<!-- Max Participants -->
					{#if selectedHallId && data.halls}
						{@const selectedHall = data.halls.find(h => h.id.toString() === selectedHallId)}
						{#if selectedHall}
							<div class="space-y-2">
								<label for="event-participants" class="text-sm font-medium text-text-main">
									Maximálny počet účastníkov
								</label>
								<NumberInput
									id="event-participants"
									name="maxParticipants"
									bind:value={maxParticipants}
									min={1}
									max={selectedHall.capacity || 1000}
									placeholder={selectedHall.capacity?.toString() || ''}
									
								/>
								<p class="text-xs text-text-2">
									Kapacita sály: {selectedHall.capacity || 0} osôb
								</p>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Date & Time -->
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<label for="event-start-date" class="text-sm font-medium text-text-main">
							Dátum začiatku <span class="text-red-500">*</span>
						</label>
						<TextInput
							id="event-start-date"
							name="startDate"
							type="date"
							bind:value={startDate}
							min={getTodayDate()}
							error={validate.includes('startDate') ? 'Dátum začiatku je povinný' : ''}
						/>
					</div>
					
					<div class="space-y-2">
						<label for="event-start-time" class="text-sm font-medium text-text-main">
							Čas začiatku <span class="text-red-500">*</span>
						</label>
						<TextInput
							id="event-start-time"
							name="startTime"
							type="time"
							bind:value={startTime}
							error={validate.includes('startTime') ? 'Čas začiatku je povinný' : ''}
						/>
					</div>
					
					<div class="space-y-2">
						<label for="event-end-date" class="text-sm font-medium text-text-main">
							Dátum konca <span class="text-red-500">*</span>
						</label>
						<TextInput
							id="event-end-date"
							name="endDate"
							type="date"
							bind:value={endDate}
							min={startDate || getTodayDate()}
							error={validate.includes('endDate') ? 'Dátum konca je povinný' : ''}
						/>
					</div>
					
					<div class="space-y-2">
						<label for="event-end-time" class="text-sm font-medium text-text-main">
							Čas konca <span class="text-red-500">*</span>
						</label>
						<TextInput
							id="event-end-time"
							name="endTime"
							type="time"
							bind:value={endTime}
							error={validate.includes('endTime') ? 'Čas konca je povinný' : ''}
						/>
					</div>
				</div>
			</div>

			<!-- Step 3: Settings -->
			<div class="space-y-4">
				<div class="flex items-center gap-2 mb-4">
					<div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">3</div>
					<h3 class="text-lg font-medium text-text-main">Nastavenia</h3>
				</div>

				<div class="space-y-4">
					<div class="p-4 bg-background-2/50 rounded-lg space-y-4">
						<div class="flex items-start gap-3">
							<Switch
								name="isPublic"
								id="event-public"
								bind:checked={isPublic}
							/>
							<div class="space-y-1">
								<label for="event-public" class="text-sm text-text-main font-medium cursor-pointer">
									Verejná udalosť
								</label>
								<p class="text-xs text-text-2">Udalosť bude viditeľná všetkým používateľom</p>
							</div>
						</div>
						
						<div class="flex items-start gap-3">
							<Switch
								name="allowRegistration"
								id="event-registration"
								bind:checked={allowRegistration}
							/>
							<div class="space-y-1">
								<label for="event-registration" class="text-sm text-text-main font-medium cursor-pointer">
									Povoliť registrácie
								</label>
								<p class="text-xs text-text-2">Používatelia sa môžu registrovať na udalosť</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Error Display -->
			{#if eventCreateError}
				<div class="p-4 bg-red-50 border border-red-200 rounded-lg" in:fly={{ x: 10, duration: 600 }}>
					<div class="flex items-center gap-2">
						<svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
						</svg>
						<p class="text-sm text-red-800 font-medium">Chyba pri vytváraní udalosti</p>
					</div>
					<p class="text-sm text-red-700 mt-1">{eventCreateError}</p>
				</div>
			{/if}
		</div>

		<!-- Footer Actions -->
		<div class="flex justify-between items-center p-4 border-t border-border-main/30 bg-background-2">
			<Button 
				type="button" 
				color="transparent" 
				onclick={() => {
					showEventDialog = false;
					resetEventForm();
				}}
			>
				Zrušiť
			</Button>
			<Button type="submit" color="primary">
				<Icon scale="small">
					<CalendarIcon />
				</Icon>
				<span>Vytvoriť udalosť</span>
			</Button>
		</div>
	</form>
</Dialog>

<style lang="postcss">
	.event-table-row {
		@apply border-t border-border-main/30 hover:bg-background-4;
	}
	.event-table-row-modify {
		@apply mx-2 border-border-main/30 border text-text-4 w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-background-5;
	}
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-text-4 max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
