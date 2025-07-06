<script lang="ts">
    import Button from '$lib/components/Button.svelte';
    import Dialog from '$lib/components/Dialog.svelte';
    import Navbar from '$lib/components/Navbar.svelte';
    import Icon from '$lib/icons/Icon.svelte';
    import Plus from '$lib/icons/Plus.svelte';
    import Adjustments from '$lib/icons/Adjustments.svelte';
    import Save from '$lib/icons/Save.svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    
    let { data } = $props();
    
    let showCreateLayoutDialog = $state(false);
    let showTableLayoutsDialog = $state(false);
    let createLayoutLoading = $state(false);
    let createLayoutError = $state('');
    
    // Create layout form
    let layoutName = $state('');
    let layoutDescription = $state('');
    
    // Reset form
    function resetCreateLayoutForm() {
        layoutName = '';
        layoutDescription = '';
        createLayoutError = '';
    }
    
    // Handle create new layout
    function handleCreateLayout() {
        if (!layoutName.trim()) {
            createLayoutError = 'Názov rozloženia je povinný';
            return;
        }
        
        // Redirect to layout editor
        goto(`/admin/halls/${data.hall.id}/layout-editor?name=${encodeURIComponent(layoutName.trim())}&description=${encodeURIComponent(layoutDescription.trim())}`);
    }
    
    // Handle edit layout
    function handleEditLayout(layoutId: number) {
        goto(`/admin/halls/${data.hall.id}/layout-editor/${layoutId}`);
    }
    
    // Handle create table layout
    function handleCreateTableLayout(layoutId: number) {
        goto(`/admin/halls/${data.hall.id}/layouts/${layoutId}/table-editor`);
    }
    
    // Handle edit table layout
    function handleEditTableLayout(layoutId: number, tablePlacementId: number) {
        goto(`/admin/halls/${data.hall.id}/layouts/${layoutId}/table-editor/${tablePlacementId}`);
    }
</script>

<svelte:head>
    <title>Správa sály - {data.hall.name}</title>
</svelte:head>

<Navbar user={data.user} permission={data.permission} />

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
    <div class="w-full mx-auto max-w-7xl">
        <!-- Header -->
        <div class="flex flex-col items-start justify-between w-full mb-6 gap-4 sm:flex-row sm:items-center">
            <div class="flex flex-col">
                <p class="uppercase text-[0.65rem] text-text-1">Správa sály</p>
                <h1 class="text-2xl font-bold text-text-main">{data.hall.name}</h1>
                <p class="text-sm text-text-2">Kapacita: {data.hall.capacity} osôb</p>
            </div>
            <div class="flex gap-2">
                <Button color="secondary" onclick={() => goto('/admin/halls')}>
                    Späť na sály
                </Button>
                <Button color="primary" onclick={() => showCreateLayoutDialog = true}>
                    <Icon scale="small">
                        <Plus />
                    </Icon>
                    Nové rozloženie
                </Button>
            </div>
        </div>

        <!-- Hall Info -->
        <div class="bg-background-1 border border-border-main/30 rounded-lg p-6 mb-6">
            <div class="flex items-center gap-3 mb-4">
                <div 
                    class="w-4 h-4 rounded-full" 
                    style="background-color: {data.hall.color}"
                ></div>
                <h2 class="text-lg font-semibold text-text-main">Informácie o sále</h2>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <p class="text-sm text-text-2">Kapacita</p>
                    <p class="text-lg font-medium text-text-main">{data.hall.capacity} osôb</p>
                </div>
                <div>
                    <p class="text-sm text-text-2">Rozloženia</p>
                    <p class="text-lg font-medium text-text-main">{data.layouts?.length || 0}</p>
                </div>
                <div>
                    <p class="text-sm text-text-2">Rozloženia stolov</p>
                    <p class="text-lg font-medium text-text-main">{data.tablePlacements?.length || 0}</p>
                </div>
            </div>
        </div>

        <!-- Hall Layouts -->
        <div class="bg-background-1 border border-border-main/30 rounded-lg p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold text-text-main">Rozloženia sály</h2>
                <Button color="primary" onclick={() => showCreateLayoutDialog = true}>
                    <Icon scale="small">
                        <Plus />
                    </Icon>
                    Nové rozloženie
                </Button>
            </div>
            
            {#if data.layouts && data.layouts.length > 0}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each data.layouts as layout}
                        <div class="border border-border-main/30 rounded-lg overflow-hidden">
                            <!-- Layout Thumbnail -->
                            <div class="h-48 bg-background-2 relative">
                                {#if layout.thumbnail}
                                    <img src={layout.thumbnail} alt="Náhľad rozloženia" class="w-full h-full object-cover" />
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center">
                                        <p class="text-text-3 text-sm">Náhľad nie je dostupný</p>
                                    </div>
                                {/if}
                                <div class="absolute top-2 right-2">
                                    {#if layout.isDefault}
                                        <span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Predvolené</span>
                                    {/if}
                                </div>
                            </div>
                            
                            <!-- Layout Info -->
                            <div class="p-4">
                                <h3 class="font-medium text-text-main mb-2">{layout.name}</h3>
                                <p class="text-sm text-text-2 mb-3">
                                    Vytvorené: {new Date(layout.createdAt).toLocaleDateString('sk-SK')}
                                </p>
                                
                                <!-- Actions -->
                                <div class="flex gap-2">
                                    <Button color="secondary" onclick={() => handleEditLayout(layout.id)}>
                                        <Icon scale="small">
                                            <Adjustments />
                                        </Icon>
                                        Upraviť
                                    </Button>
                                    <Button color="primary" onclick={() => handleCreateTableLayout(layout.id)}>
                                        <Icon scale="small">
                                            <Plus />
                                        </Icon>
                                        Stoly
                                    </Button>
                                </div>
                                
                                <!-- Table Layouts -->
                                {#if data.tablePlacements}
                                    {@const layoutTablePlacements = data.tablePlacements.filter(tp => tp.hallLayoutId === layout.id)}
                                    {#if layoutTablePlacements.length > 0}
                                        <div class="mt-3 pt-3 border-t border-border-main/30">
                                            <p class="text-xs text-text-2 mb-2">Rozloženia stolov ({layoutTablePlacements.length})</p>
                                            <div class="flex flex-wrap gap-1">
                                                {#each layoutTablePlacements as tablePlacement}
                                                    <button
                                                        onclick={() => handleEditTableLayout(layout.id, tablePlacement.id)}
                                                        class="text-xs px-2 py-1 bg-background-2 hover:bg-background-3 rounded border border-border-main/30 transition-colors"
                                                        title={tablePlacement.name}
                                                    >
                                                        {tablePlacement.name}
                                                        {#if tablePlacement.isDefault}
                                                            <span class="text-green-600">★</span>
                                                        {/if}
                                                    </button>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="text-center py-8">
                    <div class="w-16 h-16 bg-background-2 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Icon scale="large">
                            <Plus />
                        </Icon>
                    </div>
                    <p class="text-text-2 mb-2">Žiadne rozloženia</p>
                    <p class="text-sm text-text-3 mb-4">Vytvorte prvé rozloženie pre túto sálu</p>
                    <Button color="primary" onclick={() => showCreateLayoutDialog = true}>
                        <Icon scale="small">
                            <Plus />
                        </Icon>
                        Vytvoriť rozloženie
                    </Button>
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Create Layout Dialog -->
<Dialog bind:open={showCreateLayoutDialog}>
    {#snippet header()}
        <p>Vytvoriť nové rozloženie sály</p>
    {/snippet}
    
    <div class="p-6">
        {#if createLayoutError}
            <div class="p-3 mb-4 text-sm text-red-600 bg-red-100 border border-red-300 rounded">
                {createLayoutError}
            </div>
        {/if}
        
        <div class="space-y-4">
            <div>
                <label for="layout-name" class="block text-sm font-medium text-text-main mb-2">
                    Názov rozloženia
                </label>
                <input
                    id="layout-name"
                    type="text"
                    bind:value={layoutName}
                    placeholder="Napr. Základné rozloženie, Konferenčné usporiadanie..."
                    class="w-full px-3 py-2 border border-border-main/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
            </div>
            
            <div>
                <label for="layout-description" class="block text-sm font-medium text-text-main mb-2">
                    Popis (voliteľné)
                </label>
                <textarea
                    id="layout-description"
                    bind:value={layoutDescription}
                    placeholder="Stručný popis rozloženia..."
                    rows="3"
                    class="w-full px-3 py-2 border border-border-main/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                ></textarea>
            </div>
        </div>
    </div>
    
    <div class="flex justify-between p-4 border-t border-border-main/30 bg-background-2">
        <Button 
            color="transparent" 
            onclick={() => {
                showCreateLayoutDialog = false;
                resetCreateLayoutForm();
            }}
        >
            Zrušiť
        </Button>
        <Button 
            color="primary" 
            onclick={handleCreateLayout}
            disabled={createLayoutLoading}
        >
            <Icon scale="small">
                <Save />
            </Icon>
            {createLayoutLoading ? 'Vytvára sa...' : 'Vytvoriť a upraviť'}
        </Button>
    </div>
</Dialog>
