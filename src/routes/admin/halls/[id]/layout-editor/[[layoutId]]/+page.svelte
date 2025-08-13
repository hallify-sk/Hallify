<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import ArrowRight from '$lib/icons/ArrowRight.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let { data } = $props();

	let gridSize = $state(30);
	let gridWidth = $state(20);
	let gridHeight = $state(20);
	let windowWidth = $state(800);
	let windowHeight = $state(800);
    
	let MyCanvas: typeof Editor | null = $state(null);

    onMount(async () => {
		// Dynamically import your canvas component encapsulating all svelte-konva functionality inside onMount()
		MyCanvas = (await import('$lib/components/Editor.svelte')).default;


	});

	// Initialize grid from existing layout data
	if (data.layout && data.layout.layoutData) {
		gridWidth = data.layout.layoutData.gridWidth || 20;
		gridHeight = data.layout.layoutData.gridHeight || 20;
	}

	async function handleSave(layoutData: any, thumbnail: string) {
		const isEditing = !!data.layout;
		const url = isEditing 
			? `/api/hall-layouts/${data.layout.id}`
			: `/api/halls/${data.hall.id}/layouts`;

		const payload = {
			name: data.initialName || data.layout?.name || 'Nové rozloženie',
			description: data.initialDescription || data.layout?.description || '',
			layoutData,
			thumbnail
		};

		const response = await fetch(url, {
			method: isEditing ? 'PUT' : 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(error);
		}

		// Redirect back to hall management page
		goto(`/admin/halls/${data.hall.id}`);
	}
</script>

<svelte:head>
	<title>Editor rozloženia - {data.hall.name}</title>
</svelte:head>

<div class="w-full min-h-screen bg-background-main">
	<!-- Header -->
	<div class="border-b border-border-main/30 bg-background-1">
		<div class="max-w-7xl mx-auto px-4 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 text-sm text-text-2">
					<a href="/admin/halls" class="hover:text-text-1">Sály</a>
					<Icon scale="small"><ArrowRight /></Icon>
					<a href="/admin/halls/{data.hall.id}" class="hover:text-text-1">{data.hall.name}</a>
					<Icon scale="small"><ArrowRight /></Icon>
					<span class="text-text-main">
						{data.layout ? 'Upraviť rozloženie' : 'Nové rozloženie'}
					</span>
				</div>
				<Button color="secondary" onclick={() => goto(`/admin/halls/${data.hall.id}`)}>
					Späť
				</Button>
			</div>
		</div>
	</div>

	<!-- Editor -->
    <svelte:component
        this={MyCanvas}
        bind:gridSize
		bind:gridWidth
		bind:gridHeight
		bind:windowWidth
		bind:windowHeight
		mode="layout"
		onSave={handleSave}
		initialData={data.layout?.layoutData}
    ></svelte:component>
</div>
