<script lang="ts">
    import Button from '$lib/components/Button.svelte';
    import Calendar from '$lib/components/Calendar.svelte';
    import Dialog from '$lib/components/Dialog.svelte';
    import DatePicker from '$lib/components/DatePicker.svelte';
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
    let eventDate = $state('');
    let maxParticipants = $state(0);
    let isPublic = $state(true);
    let allowRegistration = $state(true);
    let allowInvitations = $state(false);

    // Calendar state
    let availableDates = $state<string[]>([]);
    let unavailableDates = $state<string[]>([]);
    let loadingDates = $state(false);

    // Reset form function
    function resetEventForm() {
        eventName = '';
        eventDescription = '';
        selectedHallId = '';
        eventDate = '';
        maxParticipants = 0;
        isPublic = true;
        allowRegistration = true;
        allowInvitations = false;
        eventCreateError = '';
        validate = [];
        availableDates = [];
        unavailableDates = [];
    }

    // Helper function to get today's date in YYYY-MM-DD format
    function getTodayDate() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    // Helper function to format date for display
    function formatEventDate(dateString: string | Date) {
        const date = new Date(dateString);
        return date.toLocaleDateString('sk-SK', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    // Helper function to get status display text and styles
    function getEventStatus(status: string, startDate: string | Date) {
        const eventDate = new Date(startDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);
        
        if (eventDate < today) {
            return {
                text: 'Ukončená',
                class: 'px-2 py-1 text-text-3 rounded bg-text-3/20'
            };
        } else if (eventDate.getTime() === today.getTime()) {
            return {
                text: 'Dnes',
                class: 'px-2 py-1 text-primary rounded bg-primary/20 font-medium'
            };
        } else {
            switch (status) {
                case 'planned':
                    return {
                        text: 'Plánovaná',
                        class: 'px-2 py-1 text-blue-600 rounded bg-blue-300/40'
                    };
                case 'confirmed':
                    return {
                        text: 'Potvrdená',
                        class: 'px-2 py-1 text-green-600 rounded bg-green-300/40'
                    };
                case 'cancelled':
                    return {
                        text: 'Zrušená',
                        class: 'px-2 py-1 text-red-600 rounded bg-red-300/40'
                    };
                default:
                    return {
                        text: 'Plánovaná',
                        class: 'px-2 py-1 text-blue-600 rounded bg-blue-300/40'
                    };
            }
        }
    }

    // Fetch available dates for selected hall
    async function fetchAvailableDates(hallId: string) {
        if (!hallId) {
            availableDates = [];
            unavailableDates = [];
            return;
        }

        loadingDates = true;
        try {
            const response = await fetch(`/api/halls/${hallId}/available-dates`);
            if (response.ok) {
                const data = await response.json();
                availableDates = data.availableDates || [];
                unavailableDates = data.unavailableDates || [];
            } else {
                console.error('Failed to fetch available dates');
                availableDates = [];
                unavailableDates = [];
            }
        } catch (error) {
            console.error('Error fetching available dates:', error);
            availableDates = [];
            unavailableDates = [];
        } finally {
            loadingDates = false;
        }
    }

    // Handle date selection
    function handleDateSelect(date: string) {
        eventDate = date;
    }

    // Calculate statistics
    const stats = $derived(() => {
        const events = data.events || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const totalEvents = events.length;
        const upcomingEvents = events.filter(event => {
            const eventDate = new Date(event.startDate);
            eventDate.setHours(0, 0, 0, 0);
            return eventDate >= today;
        }).length;
        
        const completedEvents = events.filter(event => {
            const eventDate = new Date(event.startDate);
            eventDate.setHours(0, 0, 0, 0);
            return eventDate < today;
        }).length;
        
        const availableHalls = data.halls?.filter(hall => hall.allow_reservations).length || 0;
        
        return {
            totalEvents,
            upcomingEvents,
            completedEvents,
            availableHalls
        };
    });

    // Watch for hall changes to fetch available dates
    $effect(() => {
        if (selectedHallId) {
            fetchAvailableDates(selectedHallId);
            // Reset selected date when hall changes
            eventDate = '';
        } else {
            availableDates = [];
            unavailableDates = [];
            eventDate = '';
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
							<col span="1" style="width: 8%;" />
							<col span="1" style="width: 40%;" />
							<col span="1" style="width: 22%;" />
							<col span="1" style="width: 18%;" />
							<col span="1" style="width: 12%;" />
						</colgroup>
						<thead>
							<tr class="bg-background-2">
								<th></th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Názov</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Sála</th
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
							{#if data.events && data.events.length > 0}
								{#each data.events as event}
								{@const eventStatus = getEventStatus(event.status || 'planned', event.startDate)}
								<tr class="event-table-row">
									<td class="px-2">
										<div class="flex gap-1">
											<a 
												href="/events/{event.id}"
												class="event-table-row-modify"
												title="Správa udalosti"
											>
												<Icon scale="small">
													<Adjustments />
												</Icon>
											</a>
										</div>
									</td>
									<td class="px-4 py-3 text-sm text-text-main font-medium" title={event.name}>
										<div class="max-w-none overflow-hidden text-ellipsis whitespace-nowrap">
											{event.name}
										</div>
									</td>
									<td class="px-4 py-3 text-sm text-text-2">
										<div class="flex items-center gap-2">
											{#if event.hallColor}
												<div class="w-3 h-3 rounded-full" style="background-color: {event.hallColor}"></div>
											{/if}
											{event.hallName || 'Neznáma sála'}
										</div>
									</td>
									<td class="px-4 py-3 text-sm text-text-4">
										{formatEventDate(event.startDate)}
									</td>
									<td class="px-4 py-3 text-sm">
										<span class={eventStatus.class}>
											{eventStatus.text}
										</span>
									</td>
								</tr>
								{/each}
							{:else}
								<tr>
									<td colspan="5" class="px-4 py-12 text-center text-text-3">
										<div class="flex flex-col items-center gap-3">
											<Icon scale="big">
												<CalendarIcon />
											</Icon>
											<div class="space-y-1">
												<p class="text-sm font-medium">Zatiaľ nemáte žiadne udalosti</p>
												<p class="text-xs text-text-4">Vytvorte svoju prvú udalosť a začnite organizovať</p>
											</div>
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
												Vytvoriť prvú udalosť
											</Button>
										</div>
									</td>
								</tr>
							{/if}
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
				<h2 class="text-sm text-text-1">Celkový počet udalostí</h2>
				<p class="text-3xl font-bold text-text-main">{stats().totalEvents}</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Nadchádzajúce udalosti</h2>
				<p class="text-3xl font-bold text-text-main">{stats().upcomingEvents}</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Ukončené udalosti</h2>
				<p class="text-3xl font-bold text-text-main">{stats().completedEvents}</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Dostupné sály</h2>
				<p class="text-3xl font-bold text-text-main">{stats().availableHalls}</p>
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

			<!-- Step 2: Location & Date -->
			<div class="space-y-4">
				<div class="flex items-center gap-2 mb-4">
					<div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">2</div>
					<h3 class="text-lg font-medium text-text-main">Miesto a dátum</h3>
				</div>

				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
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

						<!-- Max Participants -->
						{#if selectedHallId && data.halls}
							{@const selectedHall = data.halls.find(h => h.id.toString() === selectedHallId)}
							{#if selectedHall}
								<div class="space-y-2 mt-4">
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

					<!-- Date Selection -->
					<div class="space-y-2">
						<div class="text-sm font-medium text-text-main">
							Dátum udalosti <span class="text-red-500">*</span>
						</div>
						{#if selectedHallId}
							{#if loadingDates}
								<div class="flex items-center justify-center py-8">
									<div class="text-sm text-text-2">Načítavam dostupné dátumy...</div>
								</div>
							{:else}
								<DatePicker
									selectedDate={eventDate}
									{availableDates}
									{unavailableDates}
									onDateSelect={handleDateSelect}
								/>
								<input type="hidden" name="eventDate" value={eventDate} />
								{#if validate.includes('eventDate')}
									<p class="text-xs text-red-600">Vyberte dátum udalosti</p>
								{/if}
							{/if}
						{:else}
							<div class="flex items-center justify-center py-8 border border-border-main/30 rounded-lg bg-background-2">
								<p class="text-sm text-text-3">Najprv vyberte sálu</p>
							</div>
						{/if}
						<p class="text-xs text-text-2">Vyberte dostupný dátum pre vašu udalosť</p>
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
						
						<div class="flex items-start gap-3">
							<Switch
								name="allowInvitations"
								id="event-invitations"
								bind:checked={allowInvitations}
							/>
							<div class="space-y-1">
								<label for="event-invitations" class="text-sm text-text-main font-medium cursor-pointer">
									Povoliť správu pozvánie
								</label>
								<p class="text-xs text-text-2">Vytvorí sa odkaz pre pozývanie hostí bez registrácie</p>
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
