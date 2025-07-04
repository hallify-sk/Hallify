<script lang="ts">
    import Dialog from '$lib/components/Dialog.svelte';
    import Button from '$lib/components/Button.svelte';
    import TextInput from '$lib/components/inputs/TextInput.svelte';
    import Textarea from '$lib/components/inputs/Textarea.svelte';
    import NumberInput from '$lib/components/inputs/NumberInput.svelte';
    import Switch from '$lib/components/inputs/Switch.svelte';
    import DatePicker from '$lib/components/DatePicker.svelte';
    import Icon from '$lib/icons/Icon.svelte';
    import Save from '$lib/icons/Save.svelte';
    import Cross from '$lib/icons/Cross.svelte';

    type Props = {
        open?: boolean;
        eventId?: number;
        onClose?: () => void;
        onUpdate?: () => void;
    };

    let {
        open = $bindable(false),
        eventId,
        onClose = () => {},
        onUpdate = () => {}
    }: Props = $props();

    let loading = $state(false);
    let loadingEvent = $state(false);
    let loadingDates = $state(false);
    let error = $state('');
    let validate = $state<string[]>([]);

    // Event form data
    let eventData = $state<any>({});
    let eventName = $state('');
    let eventDescription = $state('');
    let eventDate = $state('');
    let maxParticipants = $state(0);
    let isPublic = $state(true);
    let allowRegistration = $state(true);
    let notes = $state('');

    // Date picker data
    let availableDates = $state<string[]>([]);
    let unavailableDates = $state<string[]>([]);

    // Load event data when eventId changes
    $effect(() => {
        if (open && eventId) {
            loadEvent();
        }
    });

    async function loadEvent() {
        if (!eventId) return;
        
        loadingEvent = true;
        error = '';

        try {
            const response = await fetch(`/api/events/${eventId}`);
            const result = await response.json();

            if (response.ok) {
                eventData = result.event;
                eventName = eventData.name;
                eventDescription = eventData.description;
                maxParticipants = eventData.maxParticipants || 0;
                isPublic = eventData.isPublic;
                allowRegistration = eventData.allowRegistration;
                notes = eventData.notes || '';
                
                // Extract date from startDate
                const startDate = new Date(eventData.startDate);
                const year = startDate.getFullYear();
                const month = String(startDate.getMonth() + 1).padStart(2, '0');
                const day = String(startDate.getDate()).padStart(2, '0');
                eventDate = `${year}-${month}-${day}`;

                // Load available dates for the hall
                await fetchAvailableDates(eventData.hallId);
            } else {
                error = result.error || 'Chyba pri načítaní udalosti';
            }
        } catch (err) {
            error = 'Chyba pri načítaní udalosti';
            console.error('Error loading event:', err);
        } finally {
            loadingEvent = false;
        }
    }

    async function fetchAvailableDates(hallId: number) {
        if (!hallId) return;

        loadingDates = true;
        try {
            const response = await fetch(`/api/halls/${hallId}/available-dates`);
            if (response.ok) {
                const data = await response.json();
                availableDates = data.availableDates || [];
                unavailableDates = data.unavailableDates || [];
                
                // Add current event date to available dates if it's not already there
                if (eventDate && !availableDates.includes(eventDate) && !unavailableDates.includes(eventDate)) {
                    availableDates.push(eventDate);
                }
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

    function handleDateSelect(date: string) {
        eventDate = date;
    }

    function validateForm() {
        validate = [];
        
        if (!eventName.trim()) validate.push('eventName');
        if (!eventDescription.trim()) validate.push('eventDescription');
        if (!eventDate) validate.push('eventDate');
        
        return validate.length === 0;
    }

    async function handleSubmit() {
        if (!validateForm() || !eventId) return;

        loading = true;
        error = '';

        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: eventName.trim(),
                    description: eventDescription.trim(),
                    eventDate,
                    maxParticipants: maxParticipants || null,
                    isPublic,
                    allowRegistration,
                    notes: notes.trim() || null
                })
            });

            const result = await response.json();

            if (response.ok) {
                onUpdate();
                handleClose();
            } else {
                error = result.error || 'Chyba pri aktualizácii udalosti';
            }
        } catch (err) {
            error = 'Chyba pri aktualizácii udalosti';
            console.error('Error updating event:', err);
        } finally {
            loading = false;
        }
    }

    async function handleDelete() {
        if (!eventId || !confirm('Naozaj chcete zmazať túto udalosť?')) return;

        loading = true;
        error = '';

        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                onUpdate();
                handleClose();
            } else {
                error = result.error || 'Chyba pri mazaní udalosti';
            }
        } catch (err) {
            error = 'Chyba pri mazaní udalosti';
            console.error('Error deleting event:', err);
        } finally {
            loading = false;
        }
    }

    function handleClose() {
        open = false;
        onClose();
        // Reset form
        eventData = {};
        eventName = '';
        eventDescription = '';
        eventDate = '';
        maxParticipants = 0;
        isPublic = true;
        allowRegistration = true;
        notes = '';
        error = '';
        validate = [];
    }
</script>

<Dialog bind:open>
    {#snippet header()}
        Upraviť udalosť
    {/snippet}
    
    {#snippet children()}
        <div class="p-6">
            {#if loadingEvent}
                <div class="flex items-center justify-center py-8">
                    <div class="text-sm text-text-2">Načítavam udalosť...</div>
                </div>
            {:else if error}
                <div class="p-4 mb-4 text-sm text-red-600 bg-red-100 border border-red-300 rounded">
                    {error}
                </div>
            {:else}
                <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
                    <!-- Event Info Section -->
                    <div class="space-y-4">
                        <h3 class="text-lg font-medium text-text-main">Informácie o udalosti</h3>
                        
                        {#if eventData.hallName}
                            <div class="p-3 rounded-lg bg-background-2">
                                <div class="flex items-center gap-2">
                                    <div 
                                        class="w-3 h-3 rounded-full" 
                                        style="background-color: {eventData.hallColor}"
                                    ></div>
                                    <span class="text-sm font-medium text-text-main">{eventData.hallName}</span>
                                </div>
                            </div>
                        {/if}

                        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div class="sm:col-span-2">
                                <label for="edit-event-name" class="block text-sm font-medium text-text-main mb-2">
                                    Názov udalosti
                                </label>
                                <TextInput
                                    id="edit-event-name"
                                    bind:value={eventName}
                                    placeholder="Zadajte názov udalosti"
                                    error={validate.includes('eventName') ? 'Názov udalosti je povinný' : ''}
                                />
                            </div>

                            <div class="sm:col-span-2">
                                <label for="edit-event-description" class="block text-sm font-medium text-text-main mb-2">
                                    Popis udalosti
                                </label>
                                <Textarea
                                    id="edit-event-description"
                                    bind:value={eventDescription}
                                    placeholder="Zadajte popis udalosti"
                                    error={validate.includes('eventDescription') ? 'Popis udalosti je povinný' : ''}
                                />
                            </div>

                            <div>
                                <label class="text-sm font-medium text-text-main" for="max-participants">
                                    Maximálny počet účastníkov
                                </label>
                                <NumberInput
                                    id="max-participants"
                                    name="maxParticipants"
                                    bind:value={maxParticipants}
                                    placeholder="Neobmedzené"
                                    min={1}
                                />
                            </div>

                            <div class="flex flex-col gap-2">
                                <span class="text-sm font-medium text-text-main">Nastavenia</span>
                                <div class="space-y-3">
                                    <div class="flex items-center gap-3">
                                        <Switch 
                                            id="edit-is-public"
                                            name="isPublic"
                                            bind:checked={isPublic}
                                        />
                                        <label for="edit-is-public" class="text-sm text-text-main cursor-pointer">
                                            Verejná udalosť
                                        </label>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <Switch 
                                            id="edit-allow-registration"
                                            name="allowRegistration"
                                            bind:checked={allowRegistration}
                                        />
                                        <label for="edit-allow-registration" class="text-sm text-text-main cursor-pointer">
                                            Povoliť registráciu
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div class="sm:col-span-2">
                                <label for="edit-event-notes" class="block text-sm font-medium text-text-main mb-2">
                                    Poznámky (voliteľné)
                                </label>
                                <Textarea
                                    id="edit-event-notes"
                                    bind:value={notes}
                                    placeholder="Dodatočné informácie..."
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Date Selection -->
                    <div class="space-y-4">
                        <h3 class="text-lg font-medium text-text-main">Dátum udalosti</h3>
                        
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
                            {#if validate.includes('eventDate')}
                                <p class="text-xs text-red-600">Vyberte dátum udalosti</p>
                            {/if}
                        {/if}
                    </div>

                    <!-- Actions -->
                    <div class="flex justify-between pt-4 border-t border-border-main/30">
                        <Button 
                            color="danger" 
                            onclick={handleDelete}
                            disabled={loading}
                        >
                            <Icon scale="small">
                                <Cross />
                            </Icon>
                            <span>Zmazať</span>
                        </Button>
                        
                        <div class="flex gap-2">
                            <Button 
                                color="transparent" 
                                onclick={handleClose}
                                disabled={loading}
                            >
                                Zrušiť
                            </Button>
                            <Button 
                                color="primary" 
                                type="submit"
                                disabled={loading}
                            >
                                <Icon scale="small">
                                    <Save />
                                </Icon>
                                <span>{loading ? 'Ukladám...' : 'Uložiť'}</span>
                            </Button>
                        </div>
                    </div>
                </form>
            {/if}
        </div>
    {/snippet}
</Dialog>
