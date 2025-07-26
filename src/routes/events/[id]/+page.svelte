<script lang="ts">
    import Button from '$lib/components/Button.svelte';
    import Dialog from '$lib/components/Dialog.svelte';
    import Navbar from '$lib/components/Navbar.svelte';
    import TextInput from '$lib/components/inputs/TextInput.svelte';
    import Textarea from '$lib/components/inputs/Textarea.svelte';
    import NumberInput from '$lib/components/inputs/NumberInput.svelte';
    import Switch from '$lib/components/inputs/Switch.svelte';
    import DatePicker from '$lib/components/DatePicker.svelte';
    import CalendarIcon from '$lib/icons/CalendarIcon.svelte';
    import Icon from '$lib/icons/Icon.svelte';
    import Users from '$lib/icons/Users.svelte';
    import Clock from '$lib/icons/Clock.svelte';
    import Copy from '$lib/icons/Square2Stack.svelte';
    import Save from '$lib/icons/Save.svelte';
    import Cross from '$lib/icons/Cross.svelte';
    import Plus from '$lib/icons/Plus.svelte';
    import Adjustments from '$lib/icons/Adjustments.svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    let { data } = $props();
    
    let copySuccess = $state(false);
    
    // Edit dialog state
    let showEditDialog = $state(false);
    let editLoading = $state(false);
    let editError = $state('');
    let editValidate = $state<string[]>([]);
    
    // Edit form data
    let editEventName = $state('');
    let editEventDescription = $state('');
    let editEventDate = $state('');
    let editMaxParticipants = $state(0);
    let editIsPublic = $state(true);
    let editAllowRegistration = $state(true);
    let editNotes = $state('');
    
    // Date picker data for edit
    let editAvailableDates = $state<string[]>([]);
    let editUnavailableDates = $state<string[]>([]);
    let editLoadingDates = $state(false);
    
    // Add guest dialog state
    let showAddGuestDialog = $state(false);
    let addGuestLoading = $state(false);
    let addGuestError = $state('');
    let addGuestValidate = $state<string[]>([]);
    
    // Add guest form data
    let guestName = $state('');
    let guestEmail = $state('');
    let guestPhone = $state('');
    let guestNotes = $state('');

    // Helper function to check if event is in the past
    function isEventInPast(endDate: string | Date) {
        const eventEnd = new Date(endDate);
        const now = new Date();
        return eventEnd < now;
    }

    // Check if current event is in the past
    const isCurrentEventInPast = $derived(() => isEventInPast(data.event.endDate));

    // Format date for display
    function formatEventDate(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleDateString('sk-SK', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    // Format time for display
    function formatEventTime(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleTimeString('sk-SK', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Format datetime for display
    function formatDateTime(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleString('sk-SK', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Copy invitation link to clipboard
    async function copyInvitationLink() {
        if (!data.event.invitationToken) return;
        
        const invitationUrl = `${$page.url.origin}/invitation/${data.event.invitationToken}`;
        
        try {
            await navigator.clipboard.writeText(invitationUrl);
            copySuccess = true;
            setTimeout(() => copySuccess = false, 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    }

    // Get invitation URL
    const invitationUrl = $derived(() => {
        if (!data.event.invitationToken) return '';
        return `${$page.url.origin}/invitation/${data.event.invitationToken}`;
    });

    // Calculate totals
    const totalParticipants = $derived(() => {
        return data.registrations.length + data.invitations.filter(inv => inv.status === 'confirmed').length;
    });

    // Initialize edit form with current event data
    function initializeEditForm() {
        editEventName = data.event.name;
        editEventDescription = data.event.description;
        editMaxParticipants = data.event.maxParticipants || 0;
        editIsPublic = data.event.isPublic ?? true;
        editAllowRegistration = data.event.allowRegistration ?? true;
        editNotes = data.event.notes || '';
        
        // Extract date from startDate
        const startDate = new Date(data.event.startDate);
        const year = startDate.getFullYear();
        const month = String(startDate.getMonth() + 1).padStart(2, '0');
        const day = String(startDate.getDate()).padStart(2, '0');
        editEventDate = `${year}-${month}-${day}`;
    }

    // Load available dates for editing
    async function fetchAvailableDates() {
        if (!data.event.hallId) return;

        editLoadingDates = true;
        try {
            const response = await fetch(`/api/halls/${data.event.hallId}/available-dates`);
            if (response.ok) {
                const result = await response.json();
                editAvailableDates = result.availableDates || [];
                editUnavailableDates = result.unavailableDates || [];
                
                // Add current event date to available dates if it's not already there
                if (editEventDate && !editAvailableDates.includes(editEventDate) && !editUnavailableDates.includes(editEventDate)) {
                    editAvailableDates.push(editEventDate);
                }
            } else {
                console.error('Failed to fetch available dates');
                editAvailableDates = [];
                editUnavailableDates = [];
            }
        } catch (error) {
            console.error('Error fetching available dates:', error);
            editAvailableDates = [];
            editUnavailableDates = [];
        } finally {
            editLoadingDates = false;
        }
    }

    // Handle edit button click
    function handleEditEvent() {
        // Prevent editing past events
        if (isCurrentEventInPast()) {
            return;
        }
        
        initializeEditForm();
        fetchAvailableDates();
        showEditDialog = true;
    }

    // Handle edit date selection
    function handleEditDateSelect(date: string) {
        editEventDate = date;
    }

    // Validate edit form
    function validateEditForm() {
        editValidate = [];
        
        if (!editEventName.trim()) editValidate.push('eventName');
        if (!editEventDescription.trim()) editValidate.push('eventDescription');
        if (!editEventDate) editValidate.push('eventDate');
        
        return editValidate.length === 0;
    }

    // Handle edit form submission
    async function handleEditSubmit() {
        if (!validateEditForm()) return;

        editLoading = true;
        editError = '';

        try {
            const response = await fetch(`/api/events/${data.event.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: editEventName.trim(),
                    description: editEventDescription.trim(),
                    eventDate: editEventDate,
                    maxParticipants: editMaxParticipants || null,
                    isPublic: editIsPublic,
                    allowRegistration: editAllowRegistration,
                    notes: editNotes.trim() || null
                })
            });

            const result = await response.json();

            if (response.ok) {
                // Refresh the page to show updated data
                location.reload();
            } else {
                editError = result.error || 'Chyba pri aktualizácii udalosti';
            }
        } catch (err) {
            editError = 'Chyba pri aktualizácii udalosti';
            console.error('Error updating event:', err);
        } finally {
            editLoading = false;
        }
    }

    // Handle event deletion
    async function handleDeleteEvent() {
        // Prevent deleting past events
        if (isCurrentEventInPast()) {
            return;
        }
        
        if (!confirm('Naozaj chcete zmazať túto udalosť?')) return;

        editLoading = true;
        editError = '';

        try {
            const response = await fetch(`/api/events/${data.event.id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                // Redirect to events list
                goto('/');
            } else {
                editError = result.error || 'Chyba pri mazaní udalosti';
            }
        } catch (err) {
            editError = 'Chyba pri mazaní udalosti';
            console.error('Error deleting event:', err);
        } finally {
            editLoading = false;
        }
    }

    // Handle close edit dialog
    function handleCloseEditDialog() {
        showEditDialog = false;
        editError = '';
        editValidate = [];
    }

    // Validate add guest form
    function validateAddGuestForm() {
        addGuestValidate = [];
        
        if (!guestName.trim()) addGuestValidate.push('guestName');
        
        return addGuestValidate.length === 0;
    }

    // Handle add guest form submission
    async function handleAddGuest() {
        // Prevent adding guests to past events
        if (isCurrentEventInPast()) {
            addGuestError = 'Nemôžete pridať hostí do udalostí, ktoré už prebehli.';
            return;
        }
        
        if (!validateAddGuestForm()) return;

        // Check capacity limits
        if (data.event.maxParticipants && totalParticipants() >= data.event.maxParticipants) {
            addGuestError = `Nemôžete pridať viac hostí. Limit účastníkov (${data.event.maxParticipants}) je už naplnený.`;
            return;
        }

        addGuestLoading = true;
        addGuestError = '';

        try {
            const response = await fetch(`/api/events/${data.event.id}/add-guest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: guestName.trim(),
                    email: guestEmail.trim() || null,
                    phone: guestPhone.trim() || null,
                    notes: guestNotes.trim() || null
                })
            });

            const result = await response.json();

            if (response.ok) {
                // Reset form and close dialog
                guestName = '';
                guestEmail = '';
                guestPhone = '';
                guestNotes = '';
                showAddGuestDialog = false;
                
                // Refresh the page to show updated data
                location.reload();
            } else {
                addGuestError = result.error || 'Chyba pri pridávaní hosťa';
            }
        } catch (err) {
            addGuestError = 'Chyba pri pridávaní hosťa';
            console.error('Error adding guest:', err);
        } finally {
            addGuestLoading = false;
        }
    }

    // Handle removing invitation
    async function handleRemoveInvitation(invitationId: number) {
        // Prevent removing invitations from past events
        if (isCurrentEventInPast()) {
            return;
        }
        
        if (!confirm('Naozaj chcete odstrániť túto pozvánku?')) return;

        try {
            const response = await fetch(`/api/events/${data.event.id}/remove-invitation`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    invitationId
                })
            });

            const result = await response.json();

            if (response.ok) {
                // Refresh the page to show updated data
                location.reload();
            } else {
                alert(result.error || 'Chyba pri odstraňovaní pozvánky');
            }
        } catch (err) {
            alert('Chyba pri odstraňovaní pozvánky');
            console.error('Error removing invitation:', err);
        }
    }

    // Handle close add guest dialog
    function handleCloseAddGuestDialog() {
        showAddGuestDialog = false;
        addGuestError = '';
        addGuestValidate = [];
        guestName = '';
        guestEmail = '';
        guestPhone = '';
        guestNotes = '';
    }
</script>

<svelte:head>
    <title>Správa udalosti - {data.event.name}</title>
</svelte:head>

<Navbar user={data.user} permission={data.permission} />

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
    <div class="w-full mx-auto max-w-7xl">
        <!-- Header -->
        <div class="flex flex-col items-start justify-between w-full mb-6 gap-4 sm:flex-row sm:items-center">
            <div class="flex flex-col">
                <p class="uppercase text-[0.65rem] text-text-1">Správa udalosti</p>
                <h1 class="text-2xl font-bold text-text-main">{data.event.name}</h1>
                {#if isCurrentEventInPast()}
                    <p class="text-sm text-orange-600 font-medium mt-1">
                        <Icon scale="small">
                            <Clock />
                        </Icon>
                        Táto udalosť už prebehla
                    </p>
                {/if}
            </div>
            <div class="flex gap-2">
                <Button 
                    color="secondary"
                    onclick={handleEditEvent}
                    disabled={isCurrentEventInPast()}
                >
                    <Icon scale="small">
                        <Adjustments />
                    </Icon>
                    Upraviť udalosť
                </Button>
                <a href="/" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-main bg-background-1 border border-border-main/30 rounded-lg hover:bg-background-2 transition-colors">
                    Späť na udalosti
                </a>
            </div>
        </div>

        <!-- Event Overview -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <!-- Event Details -->
            <div class="lg:col-span-2 bg-background-1 border border-border-main/30 rounded-lg p-6">
                <h2 class="text-lg font-semibold text-text-main mb-4">Detaily udalosti</h2>
                
                <div class="space-y-4">
                    <div class="flex items-start gap-3">
                        <Icon scale="small">
                            <CalendarIcon />
                        </Icon>
                        <div>
                            <p class="text-sm font-medium text-text-main">Dátum a čas</p>
                            <p class="text-sm text-text-2">
                                {formatEventDate(data.event.startDate.toString())}
                            </p>
                            <p class="text-xs text-text-3">
                                {formatEventTime(data.event.startDate.toString())} - {formatEventTime(data.event.endDate.toString())}
                            </p>
                        </div>
                    </div>

                    <div class="flex items-start gap-3">
                        <div class="w-3 h-3 rounded-full mt-1.5" style="background-color: {data.event.hallColor}"></div>
                        <div>
                            <p class="text-sm font-medium text-text-main">Miesto</p>
                            <p class="text-sm text-text-2">{data.event.hallName}</p>
                            <p class="text-xs text-text-3">Kapacita: {data.event.hallCapacity} osôb</p>
                        </div>
                    </div>

                    <div class="flex items-start gap-3">
                        <Icon scale="small">
                            <Users />
                        </Icon>
                        <div>
                            <p class="text-sm font-medium text-text-main">Účastníci</p>
                            <p class="text-sm text-text-2">
                                {totalParticipants()} / {data.event.maxParticipants || 'Neobmedzené'} potvrdených
                            </p>
                            <div class="flex gap-4 text-xs text-text-3 mt-1">
                                {#if data.event.allowRegistration}
                                    <span>Registrácie: {data.registrations.length}</span>
                                {/if}
                                {#if data.event.allowInvitations}
                                    <span>Pozvánky: {data.invitations.filter(inv => inv.status === 'confirmed').length}</span>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="border-t border-border-main/30 pt-4 mt-4">
                    <h3 class="text-sm font-medium text-text-main mb-2">Popis udalosti</h3>
                    <p class="text-sm text-text-2 whitespace-pre-wrap">{data.event.description}</p>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="space-y-4">
                <div class="bg-background-1 border border-border-main/30 rounded-lg p-4">
                    <h3 class="text-sm font-medium text-text-1 mb-2">Celkový počet účastníkov</h3>
                    <p class="text-2xl font-bold text-text-main">{totalParticipants()}</p>
                    {#if data.event.maxParticipants}
                        <p class="text-xs text-text-3">z {data.event.maxParticipants} miest</p>
                    {/if}
                </div>

                {#if data.event.allowRegistration}
                    <div class="bg-background-1 border border-border-main/30 rounded-lg p-4">
                        <h3 class="text-sm font-medium text-text-1 mb-2">Registrácie</h3>
                        <p class="text-xl font-bold text-text-main">{data.registrations.length}</p>
                    </div>
                {/if}

                {#if data.event.allowInvitations}
                    <div class="bg-background-1 border border-border-main/30 rounded-lg p-4">
                        <h3 class="text-sm font-medium text-text-1 mb-2">Potvrdené pozvánky</h3>
                        <p class="text-xl font-bold text-text-main">
                            {data.invitations.filter(inv => inv.status === 'confirmed').length}
                        </p>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Invitation Management -->
        {#if data.event.allowInvitations && data.event.invitationToken}
            <div class="bg-background-1 border border-border-main/30 rounded-lg p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-semibold text-text-main">Správa pozvánie</h2>
                    <Button 
                        color="primary" 
                        onclick={() => showAddGuestDialog = true}
                        disabled={!!(data.event.maxParticipants && totalParticipants() >= data.event.maxParticipants) || isCurrentEventInPast()}
                    >
                        <Icon scale="small">
                            <Plus />
                        </Icon>
                        Pridať hosťa
                        {#if data.event.maxParticipants}
                            ({totalParticipants()}/{data.event.maxParticipants})
                        {/if}
                    </Button>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label for="invitation-url" class="text-sm font-medium text-text-main block mb-2">
                            Odkaz na pozvánku
                        </label>
                        <div class="flex gap-2">
                            <input 
                                id="invitation-url"
                                type="text" 
                                readonly 
                                value={invitationUrl()}
                                class="flex-1 px-3 py-2 border border-border-main/30 rounded-lg bg-background-2 text-text-2 text-sm"
                            />
                            <Button 
                                color="secondary" 
                                onclick={copyInvitationLink}
                            >
                                <Icon scale="small">
                                    <Copy />
                                </Icon>
                                {copySuccess ? 'Skopírované!' : 'Kopírovať'}
                            </Button>
                        </div>
                        <p class="text-xs text-text-3 mt-1">
                            Zdieľajte tento odkaz s ľuďmi, ktorých chcete pozvať na udalosť
                        </p>
                    </div>
                </div>
            </div>
        {/if}

        <!-- Participants Lists -->
        <div class="grid grid-cols-1 gap-6">
            <!-- Invited Guests -->
            {#if data.event.allowInvitations}
                <div class="bg-background-1 border border-border-main/30 rounded-lg">
                    <div class="p-4 border-b border-border-main/30">
                        <div class="flex items-center justify-between">
                            <div>
                                <h2 class="text-lg font-semibold text-text-main">Pozvaní hostia</h2>
                                <p class="text-sm text-text-2">
                                    {data.invitations.filter(inv => inv.status === 'confirmed').length} potvrdených pozvánie
                                </p>
                            </div>
                            {#if data.event.allowRegistration}
                                <div class="text-right">
                                    <p class="text-sm font-medium text-text-main">Registrovaní používatelia</p>
                                    <p class="text-sm text-text-2">{data.registrations.length} účastníkov</p>
                                </div>
                            {/if}
                        </div>
                    </div>
                    <div class="overflow-y-auto max-h-96">
                        {#if data.invitations.length > 0}
                            {#each data.invitations as invitation}
                                <div class="p-4 border-b border-border-main/30 last:border-b-0">
                                    <div class="flex justify-between items-start">
                                        <div class="flex-1">
                                            <p class="font-medium text-text-main">{invitation.name}</p>
                                            {#if invitation.email}
                                                <p class="text-sm text-text-2">{invitation.email}</p>
                                            {/if}
                                            {#if invitation.phone}
                                                <p class="text-sm text-text-2">{invitation.phone}</p>
                                            {/if}
                                            <p class="text-xs text-text-3">
                                                Potvrdené: {invitation.confirmedAt ? formatDateTime(invitation.confirmedAt.toString()) : 'N/A'}
                                            </p>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span class="px-2 py-1 text-xs rounded-full {
                                                invitation.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                                'bg-gray-100 text-gray-800'
                                            }">
                                                {invitation.status === 'confirmed' ? 'Potvrdené' : 'Zrušené'}
                                            </span>
                                            {#if invitation.status === 'confirmed'}
                                                <button
                                                    type="button"
                                                    onclick={() => handleRemoveInvitation(invitation.id)}
                                                    class="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title={isCurrentEventInPast() ? "Nemôžete odstraňovať pozvánky z udalostí, ktoré už prebehli" : "Odstrániť pozvánku"}
                                                    disabled={isCurrentEventInPast()}
                                                >
                                                    <Icon scale="small">
                                                        <Cross />
                                                    </Icon>
                                                </button>
                                            {/if}
                                        </div>
                                    </div>
                                    {#if invitation.notes}
                                        <p class="text-xs text-text-3 mt-2">{invitation.notes}</p>
                                    {/if}
                                </div>
                            {/each}
                        {:else}
                            <div class="p-8 text-center">
                                <p class="text-text-3">Zatiaľ nikto nepotvrdil pozvánku</p>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if data.event.allowRegistration}
                <div class="bg-background-1 border border-border-main/30 rounded-lg">
                    <div class="p-4 border-b border-border-main/30">
                        <h2 class="text-lg font-semibold text-text-main">Registrovaní používatelia</h2>
                        <p class="text-sm text-text-2">{data.registrations.length} účastníkov</p>
                    </div>
                    <div class="overflow-y-auto max-h-96">
                        {#if data.registrations.length > 0}
                            {#each data.registrations as registration}
                                <div class="p-4 border-b border-border-main/30 last:border-b-0">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <p class="font-medium text-text-main">
                                                {registration.userName} {registration.userLastName}
                                            </p>
                                            <p class="text-sm text-text-2">{registration.userEmail}</p>
                                            <p class="text-xs text-text-3">
                                                Registrovaný: {registration.registeredAt ? formatDateTime(registration.registeredAt.toString()) : 'N/A'}
                                            </p>
                                        </div>
                                        <span class="px-2 py-1 text-xs rounded-full {
                                            registration.status === 'registered' ? 'bg-green-100 text-green-800' :
                                            registration.status === 'attended' ? 'bg-blue-100 text-blue-800' :
                                            'bg-gray-100 text-gray-800'
                                        }">
                                            {
                                                registration.status === 'registered' ? 'Registrovaný' :
                                                registration.status === 'attended' ? 'Zúčastnil sa' :
                                                'Zrušený'
                                            }
                                        </span>
                                    </div>
                                    {#if registration.notes}
                                        <p class="text-xs text-text-3 mt-2">{registration.notes}</p>
                                    {/if}
                                </div>
                            {/each}
                        {:else}
                            <div class="p-8 text-center">
                                <p class="text-text-3">Zatiaľ sa nikto neregistroval</p>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Edit Event Dialog -->
<Dialog bind:open={showEditDialog}>
    {#snippet header()}
        Upraviť udalosť
    {/snippet}
    
    {#snippet children()}
        <div class="p-6">
            {#if editError}
                <div class="p-4 mb-4 text-sm text-red-600 bg-red-100 border border-red-300 rounded">
                    {editError}
                </div>
            {/if}
            
            {#if isCurrentEventInPast()}
                <div class="p-4 mb-4 text-sm text-orange-700 bg-orange-100 border border-orange-300 rounded">
                    <div class="flex items-center gap-2">
                        <Icon scale="small">
                            <Clock />
                        </Icon>
                        <span>Táto udalosť už prebehla a nemôže byť upravovaná ani zmazaná.</span>
                    </div>
                </div>
            {/if}
            
            <form onsubmit={(e) => { e.preventDefault(); handleEditSubmit(); }} class="space-y-4">
                <!-- Event Info Section -->
                <div class="space-y-4">
                    <h3 class="text-lg font-medium text-text-main">Informácie o udalosti</h3>
                    
                    <div class="p-3 rounded-lg bg-background-2">
                        <div class="flex items-center gap-2">
                            <div 
                                class="w-3 h-3 rounded-full" 
                                style="background-color: {data.event.hallColor}"
                            ></div>
                            <span class="text-sm font-medium text-text-main">{data.event.hallName}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div class="sm:col-span-2">
                            <label for="edit-event-name" class="block text-sm font-medium text-text-main mb-2">
                                Názov udalosti
                            </label>
                            <TextInput
                                id="edit-event-name"
                                bind:value={editEventName}
                                placeholder="Zadajte názov udalosti"
                                error={editValidate.includes('eventName') ? 'Názov udalosti je povinný' : ''}
                            />
                        </div>

                        <div class="sm:col-span-2">
                            <label for="edit-event-description" class="block text-sm font-medium text-text-main mb-2">
                                Popis udalosti
                            </label>
                            <Textarea
                                id="edit-event-description"
                                bind:value={editEventDescription}
                                placeholder="Zadajte popis udalosti"
                                error={editValidate.includes('eventDescription') ? 'Popis udalosti je povinný' : ''}
                            />
                        </div>

                        <div>
                            <label class="text-sm font-medium text-text-main" for="edit-max-participants">
                                Maximálny počet účastníkov
                            </label>
                            <NumberInput
                                id="edit-max-participants"
                                name="maxParticipants"
                                bind:value={editMaxParticipants}
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
                                        bind:checked={editIsPublic}
                                    />
                                    <label for="edit-is-public" class="text-sm text-text-main cursor-pointer">
                                        Verejná udalosť
                                    </label>
                                </div>
                                <div class="flex items-center gap-3">
                                    <Switch 
                                        id="edit-allow-registration"
                                        name="allowRegistration"
                                        bind:checked={editAllowRegistration}
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
                                bind:value={editNotes}
                                placeholder="Dodatočné informácie..."
                            />
                        </div>
                    </div>
                </div>

                <!-- Date Selection -->
                <div class="space-y-4">
                    <h3 class="text-lg font-medium text-text-main">Dátum udalosti</h3>
                    
                    {#if editLoadingDates}
                        <div class="flex items-center justify-center py-8">
                            <div class="text-sm text-text-2">Načítavam dostupné dátumy...</div>
                        </div>
                    {:else}
                        <DatePicker
                            selectedDate={editEventDate}
                            availableDates={editAvailableDates}
                            unavailableDates={editUnavailableDates}
                            onDateSelect={handleEditDateSelect}
                        />
                        {#if editValidate.includes('eventDate')}
                            <p class="text-xs text-red-600">Vyberte dátum udalosti</p>
                        {/if}
                    {/if}
                </div>

                <!-- Actions -->
                <div class="flex justify-between pt-4 border-t border-border-main/30">
                    <Button 
                        color="danger" 
                        onclick={handleDeleteEvent}
                        disabled={editLoading || isCurrentEventInPast()}
                    >
                        <Icon scale="small">
                            <Cross />
                        </Icon>
                        <span>Zmazať</span>
                    </Button>
                    
                    <div class="flex gap-2">
                        <Button 
                            color="transparent" 
                            onclick={handleCloseEditDialog}
                            disabled={editLoading}
                        >
                            Zrušiť
                        </Button>
                        <Button 
                            color="primary" 
                            type="submit"
                            disabled={editLoading || isCurrentEventInPast()}
                        >
                            <Icon scale="small">
                                <Save />
                            </Icon>
                            <span>{editLoading ? 'Ukladám...' : 'Uložiť'}</span>
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    {/snippet}
</Dialog>

<!-- Add Guest Dialog -->
<Dialog bind:open={showAddGuestDialog}>
    {#snippet header()}
        Pridať hosťa
    {/snippet}
    
    {#snippet children()}
        <div class="p-6">
            {#if addGuestError}
                <div class="p-4 mb-4 text-sm text-red-600 bg-red-100 border border-red-300 rounded">
                    {addGuestError}
                </div>
            {/if}
            
            <form onsubmit={(e) => { e.preventDefault(); handleAddGuest(); }} class="space-y-4">
                <div class="space-y-4">
                    <div>
                        <label for="guest-name" class="block text-sm font-medium text-text-main mb-2">
                            Meno hosťa *
                        </label>
                        <TextInput
                            id="guest-name"
                            bind:value={guestName}
                            placeholder="Zadajte meno hosťa"
                            error={addGuestValidate.includes('guestName') ? 'Meno hosťa je povinné' : ''}
                        />
                    </div>

                    <div>
                        <label for="guest-email" class="block text-sm font-medium text-text-main mb-2">
                            Email (voliteľné)
                        </label>
                        <TextInput
                            id="guest-email"
                            bind:value={guestEmail}
                            placeholder="Zadajte email hosťa"
                            type="email"
                        />
                    </div>

                    <div>
                        <label for="guest-phone" class="block text-sm font-medium text-text-main mb-2">
                            Telefón (voliteľné)
                        </label>
                        <TextInput
                            id="guest-phone"
                            bind:value={guestPhone}
                            placeholder="Zadajte telefón hosťa"
                            type="tel"
                        />
                    </div>

                    <div>
                        <label for="guest-notes" class="block text-sm font-medium text-text-main mb-2">
                            Poznámky (voliteľné)
                        </label>
                        <Textarea
                            id="guest-notes"
                            bind:value={guestNotes}
                            placeholder="Dodatočné informácie..."
                        />
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex justify-end gap-2 pt-4 border-t border-border-main/30">
                    <Button 
                        color="transparent" 
                        onclick={handleCloseAddGuestDialog}
                        disabled={addGuestLoading}
                    >
                        Zrušiť
                    </Button>
                    <Button 
                        color="primary" 
                        type="submit"
                        disabled={addGuestLoading}
                    >
                        <Icon scale="small">
                            <Plus />
                        </Icon>
                        <span>{addGuestLoading ? 'Pridávam...' : 'Pridať hosťa'}</span>
                    </Button>
                </div>
            </form>
        </div>
    {/snippet}
</Dialog>
