<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import ArrowRight from '$lib/icons/ArrowRight.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	let gridSize = $state(30);
	let gridWidth = $state(20);
	let gridHeight = $state(20);
	let windowWidth = $state(800);
	let windowHeight = $state(800);

	// Initialize grid from layout data
	if (data.layout && data.layout.layoutData) {
		gridWidth = data.layout.layoutData.gridWidth || 20;
		gridHeight = data.layout.layoutData.gridHeight || 20;
	}

	// Initialize from existing table placement data
	let initialData = null;
	if (data.tablePlacement && data.tablePlacement.tableData) {
		initialData = data.tablePlacement.tableData;
		gridWidth = initialData.gridWidth || gridWidth;
		gridHeight = initialData.gridHeight || gridHeight;
	}

	async function handleSave(tableData: any, thumbnail: string) {
		const isEditing = !!data.tablePlacement;
		const url = isEditing 
			? `/api/table-placements/${data.tablePlacement.id}`
			: `/api/hall-layouts/${data.layout.id}/table-placements`;

		const payload = {
			name: data.tablePlacement?.name || 'Nové rozloženie stolov',
			description: data.tablePlacement?.description || '',
			tableData,
			thumbnail,
			isPublic: true // Admin-created layouts are public by default
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
	<title>Editor rozloženia stolov - {data.hall.name}</title>
</svelte:head>

<Navbar user={data.user} permission={data.permission} />

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
						{data.tablePlacement ? 'Upraviť rozloženie stolov' : 'Nové rozloženie stolov'}
					</span>
				</div>
				<Button color="secondary" onclick={() => goto(`/admin/halls/${data.hall.id}`)}>
					Späť
				</Button>
			</div>
		</div>
	</div>

	<!-- Show layout preview/background -->
	<div class="relative">
		<!-- Background layout (walls/zones) - read-only -->
		<div class="absolute inset-0 opacity-30 pointer-events-none">
			<Editor
				bind:gridSize
				bind:gridWidth
				bind:gridHeight
				bind:windowWidth
				bind:windowHeight
				mode="layout"
				onSave={() => {}}
				initialData={data.layout.layoutData}
			/>
		</div>

		<!-- Foreground table editor -->
		<div class="relative z-10">
			<Editor
				bind:gridSize
				bind:gridWidth
				bind:gridHeight
				bind:windowWidth
				bind:windowHeight
				mode="table-placement"
				onSave={handleSave}
				{initialData}
			/>
		</div>
	</div>
</div>
