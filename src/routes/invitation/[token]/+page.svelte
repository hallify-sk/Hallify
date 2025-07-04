<script lang="ts">
    import Button from '$lib/components/Button.svelte';
    import TextInput from '$lib/components/inputs/TextInput.svelte';
    import CalendarIcon from '$lib/icons/CalendarIcon.svelte';
    import Icon from '$lib/icons/Icon.svelte';
    import Users from '$lib/icons/Users.svelte';
    import Clock from '$lib/icons/Clock.svelte';
    import { enhance } from '$app/forms';
    import { fly } from 'svelte/transition';

    let { data, form } = $props();
    
    let name = $state('');
    let email = $state('');
    let phone = $state('');
    let isSubmitting = $state(false);

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

    // Calculate available spots
    const availableSpots = $derived(() => {
        if (!data.event.maxParticipants) return null;
        return data.event.maxParticipants - (data.event.currentParticipants || 0);
    });
</script>

<svelte:head>
    <title>Pozvánka na udalosť - {data.event.name}</title>
    <meta name="description" content="Potvrdenie účasti na udalosti {data.event.name}">
</svelte:head>

<div class="min-h-screen bg-background-main">
    <div class="container mx-auto px-4 py-8 max-w-2xl">
        <!-- Header -->
        <div class="text-center mb-8">
            <div class="flex justify-center mb-4">
                <div class="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                    <Icon scale="big">
                        <CalendarIcon />
                    </Icon>
                </div>
            </div>
            <h1 class="text-2xl font-bold text-text-main mb-2">Pozvánka na udalosť</h1>
            <p class="text-text-2">Boli ste pozvaní na nasledujúcu udalosť</p>
        </div>

        <!-- Event Details Card -->
        <div class="bg-background-1 border border-border-main/30 rounded-lg p-6 mb-6">
            <h2 class="text-xl font-semibold text-text-main mb-4">{data.event.name}</h2>
            
            <div class="space-y-4 mb-6">
                <div class="flex items-start gap-3">
                    <Icon scale="small">
                        <CalendarIcon />
                    </Icon>
                    <div>
                        <p class="text-sm font-medium text-text-main">Dátum a čas</p>
                        <p class="text-sm text-text-2">
                            {formatEventDate(data.event.startDate)}
                        </p>
                        <p class="text-xs text-text-3">
                            {formatEventTime(data.event.startDate)} - {formatEventTime(data.event.endDate)}
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

                {#if data.event.maxParticipants}
                    <div class="flex items-start gap-3">
                        <Icon scale="small">
                            <Users />
                        </Icon>
                        <div>
                            <p class="text-sm font-medium text-text-main">Účastníci</p>
                            <p class="text-sm text-text-2">
                                {data.event.currentParticipants || 0} / {data.event.maxParticipants} potvrdených
                            </p>
                            {#if availableSpots() !== null}
                                <p class="text-xs text-text-3">
                                    {#if availableSpots() > 0}
                                        Zostáva {availableSpots()} voľných miest
                                    {:else}
                                        Udalosť je plne obsadená
                                    {/if}
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <div class="border-t border-border-main/30 pt-4">
                <h3 class="text-sm font-medium text-text-main mb-2">Popis udalosti</h3>
                <p class="text-sm text-text-2 whitespace-pre-wrap">{data.event.description}</p>
            </div>
        </div>

        <!-- Success Message -->
        {#if form?.success}
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6" in:fly={{ y: -10, duration: 300 }}>
                <div class="flex items-center gap-2">
                    <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                    </svg>
                    <p class="text-sm text-green-800 font-medium">Úspešne potvrdené!</p>
                </div>
                <p class="text-sm text-green-700 mt-1">{form.message}</p>
            </div>
        {:else if availableSpots() === 0}
            <!-- Event Full -->
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div class="flex items-center gap-2">
                    <svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                    </svg>
                    <p class="text-sm text-yellow-800 font-medium">Udalosť je plne obsadená</p>
                </div>
                <p class="text-sm text-yellow-700 mt-1">Bohužiaľ, všetky miesta sú už obsadené.</p>
            </div>
        {:else}
            <!-- Confirmation Form -->
            <div class="bg-background-1 border border-border-main/30 rounded-lg p-6">
                <h3 class="text-lg font-medium text-text-main mb-4">Potvrdiť účasť</h3>
                
                <form 
                    action="?/confirmInvitation" 
                    method="post"
                    use:enhance={() => {
                        isSubmitting = true;
                        return async ({ update }) => {
                            await update();
                            isSubmitting = false;
                        };
                    }}
                >
                    <div class="space-y-4">
                        <div>
                            <label for="name" class="text-sm font-medium text-text-main block mb-1">
                                Meno a priezvisko <span class="text-red-500">*</span>
                            </label>
                            <TextInput
                                id="name"
                                name="name"
                                bind:value={name}
                                placeholder="Vaše celé meno"
                                required
                                error={form?.errors?.includes('name') ? 'Meno musí mať aspoň 2 znaky' : ''}
                            />
                        </div>

                        <div>
                            <label for="email" class="text-sm font-medium text-text-main block mb-1">
                                Email (voliteľné)
                            </label>
                            <TextInput
                                id="email"
                                name="email"
                                type="email"
                                bind:value={email}
                                placeholder="vase@email.sk"
                            />
                            <p class="text-xs text-text-3 mt-1">
                                Pre prípadné komunikácie ohľadom udalosti
                            </p>
                        </div>

                        <div>
                            <label for="phone" class="text-sm font-medium text-text-main block mb-1">
                                Telefón (voliteľné)
                            </label>
                            <TextInput
                                id="phone"
                                name="phone"
                                type="tel"
                                bind:value={phone}
                                placeholder="+421 900 000 000"
                            />
                        </div>
                    </div>

                    <!-- Error Message -->
                    {#if form?.message && !form.success}
                        <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg" in:fly={{ x: 10, duration: 300 }}>
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                                </svg>
                                <p class="text-sm text-red-800">{form.message}</p>
                            </div>
                        </div>
                    {/if}

                    <div class="flex justify-end mt-6">
                        <Button 
                            type="submit" 
                            color="primary"
                            disabled={isSubmitting || !name.trim()}
                        >
                            {#if isSubmitting}
                                Potvrdzujem...
                            {:else}
                                <Icon scale="small">
                                    <Users />
                                </Icon>
                                Potvrdiť účasť
                            {/if}
                        </Button>
                    </div>
                </form>
            </div>
        {/if}

        <!-- Footer -->
        <div class="text-center mt-8 pt-6 border-t border-border-main/30">
            <p class="text-xs text-text-3">
                Powered by <span class="font-medium">Hallify</span>
            </p>
        </div>
    </div>
</div>
