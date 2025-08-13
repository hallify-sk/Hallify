<script lang="ts">
	import { tables } from '../lib.js';
	import { onMount } from 'svelte';
	import { v4 as uuidv4 } from 'uuid';

	let { stage }: { stage: any } = $props();

	// Define table type interface
	interface TableType {
		id: string;
		name: string;
		seats: number;
		shape: 'circle' | 'rectangle';
		width: number;
		height: number;
		color: string;
	}

	// Define available table types with their properties
	const tableTypes: TableType[] = [
		{
			id: 'round-4',
			name: 'Okrúhly stôl (4 osoby)',
			seats: 4,
			shape: 'circle',
			width: 2,
			height: 2,
			color: '#8B5CF6'
		},
		{
			id: 'round-6',
			name: 'Okrúhly stôl (6 osôb)',
			seats: 6,
			shape: 'circle',
			width: 3,
			height: 3,
			color: '#8B5CF6'
		},
		{
			id: 'round-8',
			name: 'Okrúhly stôl (8 osôb)',
			seats: 8,
			shape: 'circle',
			width: 4,
			height: 4,
			color: '#8B5CF6'
		},
		{
			id: 'rect-2x4',
			name: 'Obdĺžnikový stôl (2x4)',
			seats: 6,
			shape: 'rectangle',
			width: 4,
			height: 2,
			color: '#10B981'
		},
		{
			id: 'rect-2x6',
			name: 'Obdĺžnikový stôl (2x6)',
			seats: 8,
			shape: 'rectangle',
			width: 6,
			height: 2,
			color: '#10B981'
		},
		{
			id: 'rect-2x8',
			name: 'Obdĺžnikový stôl (2x8)',
			seats: 10,
			shape: 'rectangle',
			width: 8,
			height: 2,
			color: '#10B981'
		}
	];

	let isDragging = false;
	let draggedTable: TableType | null = null;

	// Function to create a table at specified coordinates
	function createTable(tableType: TableType, x: number, y: number) {
		// Snap to grid
		const gridSize = stage?.node?.attrs?.grid?.gridSize || 30;
		const finalX = Math.round(x / gridSize) * gridSize;
		const finalY = Math.round(y / gridSize) * gridSize;
		
		// Create chairs configuration
		const leftChairs = Math.ceil(tableType.seats / 2);
		const rightChairs = Math.floor(tableType.seats / 2);
		
		const chairs = {
			left: Array(leftChairs).fill('').map(() => uuidv4()),
			right: Array(rightChairs).fill('').map(() => uuidv4())
		};
		
		// Create new table matching the expected Table interface
		const newTable = {
			name: uuidv4(),
			x: finalX,
			y: finalY,
			rotation: 0,
			chairs: chairs,
			shape: tableType.shape === 'rectangle' ? 'rect' as const : 'circle' as const
		};
		
		// Add to tables store
		tables.update(current => [...current, newTable]);
	}

	// Handle click to spawn table in center
	function handleTableClick(tableType: TableType) {
		if (!stage?.node) return;
		
		// Get stage center coordinates
		const stageWidth = stage.node.width();
		const stageHeight = stage.node.height();
		const centerX = stageWidth / 2;
		const centerY = stageHeight / 2;
		
		createTable(tableType, centerX, centerY);
	}

	// Handle drag start from the table list
	function handleDragStart(event: DragEvent, tableType: TableType) {
		// Don't prevent default - let the browser handle the drag
		isDragging = true;
		draggedTable = tableType;
		
		// Set drag data
		event.dataTransfer?.setData('application/json', JSON.stringify(tableType));
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'copy';
		}
	}

	// Handle drag over stage
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	// Handle drop on stage
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		
		if (!stage?.node) return;
		
		// Get table type from drag data
		let tableType: TableType;
		try {
			const dragData = event.dataTransfer?.getData('application/json');
			if (!dragData) return;
			tableType = JSON.parse(dragData);
		} catch {
			return;
		}
		
		const stageNode = stage.node;
		const stageRect = stageNode.container().getBoundingClientRect();
		
		// Calculate position relative to stage
		const x = event.clientX - stageRect.left;
		const y = event.clientY - stageRect.top;
		
		// Transform to stage coordinates considering stage position and scale
		const stageTransform = stageNode.getAbsoluteTransform().copy().invert();
		const pos = stageTransform.point({ x, y });
		
		createTable(tableType, pos.x, pos.y);
		
		// Reset drag state
		isDragging = false;
		draggedTable = null;
	}

	// Register stage events when component mounts
	onMount(() => {
		if (stage?.node) {
			const stageContainer = stage.node.container();
			
			stageContainer.addEventListener('dragover', handleDragOver);
			stageContainer.addEventListener('drop', handleDrop);
			
			// Cleanup on destroy
			return () => {
				stageContainer.removeEventListener('dragover', handleDragOver);
				stageContainer.removeEventListener('drop', handleDrop);
			};
		}
	});
</script>

<!-- Table List Sidebar -->
<div class="fixed top-0 right-0 block h-screen pt-40 border-l border-solid w-96 bg-background-1 border-border-main/40 overflow-y-auto">
	<div class="p-4 border-b border-border-main/30">
		<h3 class="font-medium text-text-main">Dostupné stoly</h3>
		<p class="text-sm text-text-2">Kliknite pre umiestnenie do stredu alebo pretiahnite na požadované miesto</p>
	</div>
	
	<div class="p-4 space-y-3">
		{#each tableTypes as tableType}
			<div 
				class="flex items-center gap-3 p-3 bg-background-2 border border-border-main/30 rounded-lg cursor-pointer hover:bg-background-1 hover:shadow-sm transition-all duration-200 active:scale-95"
				draggable="true"
				on:dragstart={(e) => handleDragStart(e, tableType)}
				on:click={() => handleTableClick(tableType)}
				on:keydown={(e) => e.key === 'Enter' && handleTableClick(tableType)}
				role="button"
				tabindex="0"
			>
				<!-- Table Visualization -->
				<div class="flex-shrink-0 w-16 h-16 relative border border-border-main/20 rounded-lg bg-white flex items-center justify-center overflow-hidden">
					{#if tableType.shape === 'circle'}
						<!-- Round table with chairs -->
						<div 
							class="rounded-full border-2 flex items-center justify-center text-xs font-bold text-white"
							style="width: 36px; height: 36px; border-color: {tableType.color}; background-color: {tableType.color}"
						>
							{tableType.seats}
						</div>
						
						<!-- Chairs around circle -->
						{#each Array(Math.min(tableType.seats, 8)) as _, i}
							{@const angle = (i / Math.min(tableType.seats, 8)) * Math.PI * 2 - Math.PI/2}
							{@const chairX = 32 + Math.cos(angle) * 26}
							{@const chairY = 32 + Math.sin(angle) * 26}
							<div 
								class="absolute w-2 h-2 bg-slate-600 rounded-sm"
								style="left: {chairX}px; top: {chairY}px; transform: translate(-50%, -50%)"
							></div>
						{/each}
					{:else}
						<!-- Rectangular table with chairs -->
						<div 
							class="border-2 flex items-center justify-center text-xs font-bold text-white rounded-sm"
							style="width: 40px; height: 24px; border-color: {tableType.color}; background-color: {tableType.color}"
						>
							{tableType.seats}
						</div>
						
						<!-- Chairs on sides -->
						{@const leftChairs = Math.ceil(tableType.seats / 2)}
						{@const rightChairs = Math.floor(tableType.seats / 2)}
						
						{#each Array(leftChairs) as _, i}
							<div 
								class="absolute w-2 h-1.5 bg-slate-600 rounded-sm"
								style="left: 20px; top: {28 + (i * 8)}px; transform: translate(-50%, -50%)"
							></div>
						{/each}
						
						{#each Array(rightChairs) as _, i}
							<div 
								class="absolute w-2 h-1.5 bg-slate-600 rounded-sm"
								style="left: 44px; top: {28 + (i * 8)}px; transform: translate(-50%, -50%)"
							></div>
						{/each}
					{/if}
				</div>
				
				<!-- Table Info -->
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-text-main truncate">{tableType.name}</p>
					<p class="text-xs text-text-2">{tableType.seats} miest</p>
					<p class="text-xs text-text-3">
						{tableType.shape === 'circle' ? 'Okrúhly' : `${tableType.width}×${tableType.height}`}
					</p>
					<p class="text-xs text-blue-600 mt-1">Kliknite alebo pretiahnite</p>
				</div>
				
				<!-- Action Icons -->
				<div class="flex flex-col gap-1 flex-shrink-0 text-text-3">
					<!-- Click icon -->
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path>
					</svg>
					<!-- Drag icon -->
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
					</svg>
				</div>
			</div>
		{/each}
	</div>
	
	<!-- Table Count Display -->
	<div class="p-4 border-t border-border-main/30 bg-background-2">
		<p class="text-sm text-text-2">
			Počet stolov na pláne: <span class="font-medium text-text-main">{$tables.length}</span>
		</p>
	</div>
</div>

<style>
	.cursor-grabbing {
		cursor: grabbing !important;
	}
</style>