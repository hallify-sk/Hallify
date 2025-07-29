<!-- eslint-disable-file -->
<script lang="ts">
	import { Stage, Layer, Rect, Line, Group, Transformer, Circle } from 'svelte-konva';
	import { registerWheelEvent } from './editor/events/wheel';
	import type { Vector2d } from 'konva/lib/types';
	import {
		constraintNumber,
		gridData,
		plugins,
		registerPlugin,
		setStage,
		tables,
		type StageAttrs
	} from './editor/lib';
	import {
		brushes,
		dragEnd,
		dragMove,
		dragStart,
		transformRotate,
		transformRotateEnd,
		transformRotateStart
	} from './editor/brushes';
	import Brushes from './editor/plugins/Brushes.svelte';
	import { currentColor, points, walls, zonePoints, zones } from '$lib/util';
	import { onMount } from 'svelte';
	import colors from 'tailwindcss/colors';
	import { v4 as uuidv4 } from 'uuid';
	import Accordion from './Accordion.svelte';
	import NumberInput from './inputs/NumberInput.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	let openConfirmDeleteDialog = $state(false);

	let stage: ReturnType<typeof Stage> | undefined = $state();

	let tr: ReturnType<typeof Transformer> | undefined = $state(undefined);

	let gridLayer: ReturnType<typeof Layer> | undefined = $state(undefined);
	let uiLayer: ReturnType<typeof Layer> | undefined = $state(undefined);
	let collisionLayer: ReturnType<typeof Layer> | undefined = $state(undefined);

	let {
		gridSize = $bindable(30),
		gridWidth = $bindable(20),
		gridHeight = $bindable(20),
		windowWidth = $bindable(800),
		windowHeight = $bindable(800),
		data
	}: {
		gridSize?: number;
		gridWidth?: number;
		gridHeight?: number;
		windowWidth?: number;
		windowHeight?: number;
		zoomBy?: number;
		data?: any;
	} = $props();

	// Track if initialization is complete to avoid re-registering events
	let isInitialized = $state(false);

	$effect(() => {
		if (stage) {
			const stageHandle = stage?.node;
			setStage(stage);
			if (!stageHandle) return;
			windowWidth = window.innerWidth;
			windowHeight = window.innerHeight;
			stageHandle.size({ width: windowWidth, height: windowHeight });
			window.onresize = () => {
				windowWidth = window.innerWidth;
				windowHeight = window.innerHeight;
				stageHandle.size({ width: windowWidth, height: windowHeight });
				
				// Re-center when window is resized
				if (isInitialized) {
					centerStage();
				}
			};
			//Register things to be used by other plugins;
			const attributes = stageHandle.attrs as StageAttrs;
			attributes.tr = tr?.node;
			attributes.layers = {
				uiLayer: uiLayer?.node,
				gridLayer: gridLayer?.node,
				collisionLayer: collisionLayer?.node
			};
			stageHandle.attrs.grid = {
				gridSize,
				gridWidth,
				gridHeight
			};
			// Only register events once during initial setup
			if (tr && !isInitialized) {
				registerWheelEvent(stageHandle);
				registerPlugin(brushes, stageHandle, 'brushes');
				
				// Center the stage on initial load
				centerStage();
				
				isInitialized = true;
			}
		}
	});

	onMount(async () => {
		if (stage) {
			const stageHandle = stage?.node;
			if (!stageHandle) return;
		}
	});

	function stageDragConstraint(pos: Vector2d) {
		let scale = stage?.node?.scaleX() || 1;

		let newX = constraintNumber(
			pos.x,
			-gridWidth * gridSize * scale + windowWidth / 2,
			windowWidth / 2
		);
		let newY = constraintNumber(
			pos.y,
			-gridHeight * gridSize * scale + windowHeight / 2,
			windowHeight / 2
		);

		return {
			x: newX,
			y: newY
		};
	}

	function centerStage() {
		if (!stage?.node) return;
		
		const stageHandle = stage.node;
		const scale = stageHandle.scaleX() || 1;
		
		// Calculate center position
		const centerX = (windowWidth - gridWidth * gridSize * scale) / 2;
		const centerY = (windowHeight - gridHeight * gridSize * scale) / 2;
		
		// Set the stage position to center the grid
		stageHandle.position({
			x: centerX,
			y: centerY
		});
		
		stageHandle.draw();
	}

	$effect(() => {
		if (gridWidth || gridHeight) {
			gridData.set({
				width: gridWidth,
				height: gridHeight
			});
			
			// Re-center when grid dimensions change
			if (isInitialized) {
				centerStage();
			}
		}
	});

	let stageKey = $state(0);
</script>

{#if $plugins.find((p) => p.name == 'brushes')}
	<Brushes {data} />
{/if}
<div class="fixed top-0 left-0">
	{#key stageKey}
		<Stage
			key={stageKey}
			bind:this={stage}
			width={windowWidth}
			height={windowHeight}
			pixelRatio={1}
			draggable={true}
			dragBoundFunc={stageDragConstraint}
		>
			<!--Griddy-->
			<Layer bind:this={gridLayer}>
				<Rect
					x={0}
					y={0}
					width={gridWidth * gridSize}
					height={gridHeight * gridSize}
					fill={colors.slate[100]}
				/>
				{#each Array(gridWidth + 1), index}
					<Line
						points={[index * gridSize, 0, index * gridSize, gridHeight * gridSize]}
						stroke={colors.slate[200]}
						strokeWidth={1}
						listening={false}
						perfectDrawEnabled={false}
					/>
				{/each}
				{#each Array(gridHeight + 1), index}
					<Line
						points={[0, index * gridSize, gridWidth * gridSize, index * gridSize]}
						stroke={colors.slate[200]}
						strokeWidth={1}
						listening={false}
						perfectDrawEnabled={false}
					/>
				{/each}
			</Layer>
			<Layer>
				{#each $zones as zone}
					{@render zonePoly(zone.name, zone.points, zone.color)}
				{/each}
			</Layer>
			<Layer bind:this={collisionLayer}>
				{#each $tables as table}
					{@render tableRect(table.name, table.rotation, table.x, table.y, table.chairs)}
				{/each}
				{#each $walls as wall}
					{@render wallPoly(wall.name, wall.points)}
				{/each}
				{#if $points.length}
					<Line
						points={$points.flatMap((point) => [point.x, point.y])}
						stroke={colors.slate[800]}
						strokeWidth={2}
						closed={true}
						fill={colors.slate[800]}
						physics={true}
					/>
				{/if}
			</Layer>
			<Layer name="uiLayer" bind:this={uiLayer}>
				<Transformer
					bind:this={tr}
					resizeEnabled={false}
					rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
					rotationSnapTolerance={30}
				/>
				{#each $points as point}
					<Circle
						x={point.x}
						y={point.y}
						radius={5}
						fill={colors.blue[500]}
						draggable={true}
						name={point.name}
						physics={false}
						keepInBounds={true}
						ondragstart={$plugins.find((p) => p.name == 'brushes') ? dragStart : undefined}
						ondragmove={$plugins.find((p) => p.name == 'brushes') ? dragMove : undefined}
						ondragend={$plugins.find((p) => p.name == 'brushes') ? dragEnd : undefined}
					/>
				{/each}
				{#each $zonePoints as point}
					<Circle
						x={point.x}
						y={point.y}
						radius={5}
						fill={colors.pink[500]}
						draggable={true}
						name={point.name}
						physics={false}
						keepInBounds={true}
						ondragstart={$plugins.find((p) => p.name == 'brushes') ? dragStart : undefined}
						ondragmove={$plugins.find((p) => p.name == 'brushes') ? dragMove : undefined}
						ondragend={$plugins.find((p) => p.name == 'brushes') ? dragEnd : undefined}
					/>
				{/each}
				{#if $zonePoints.length}
					<Line
						points={$zonePoints.flatMap((point) => [point.x, point.y])}
						stroke={$currentColor}
						opacity={0.5}
						strokeWidth={2}
						closed={true}
						fill={$currentColor}
						physics={false}
					/>
				{/if}
			</Layer>
		</Stage>
	{/key}
</div>
<div
	class="fixed top-0 right-0 block h-screen pt-40 border-l border-solid w-96 bg-background-1 border-border-main/40"
>
	<Accordion open={true} text="Sála">
		<div class="flex flex-col p-1">
			<div class="grid grid-cols-2 gap-2 p-1">
				<div class="flex flex-col w-full">
					<label class="text-sm text-text-2" for="">Šírka</label>
					<NumberInput bind:value={gridWidth} name="width" placeholder="30" id="width" />
				</div>
				<div class="flex flex-col w-full">
					<label class="text-sm text-text-2" for="">Výška</label>
					<NumberInput bind:value={gridHeight} name="height" placeholder="20" id="height" />
				</div>
			</div>
		</div>
		<hr class="border-solid bg-none border-background-4" />
	</Accordion>
	<Accordion open={true} text="Plan">
		<Button
			color="danger"
			onclick={() => {
				openConfirmDeleteDialog = true;
			}}
		>
			Vymazať plan
		</Button>
		<div class="mb-2"></div>
		<hr class="border-solid bg-none border-background-4" />
	</Accordion>
</div>

<Dialog open={openConfirmDeleteDialog}>
	{#snippet header()}
		<p>Vymazať plan</p>
	{/snippet}
	<div class="flex flex-col gap-2 p-4">
		<p class="text-text-main">Táto akcia je nevratná. Všetky údaje budú stratené.</p>
	</div>
	<div
		class="flex justify-between w-full p-4 border-t rounded-b bg-background-2 border-slate-400/30"
	>
		<Button
			onclick={() => {
				openConfirmDeleteDialog = false;
			}}
			color="transparent"
		>
			<p>Zrušiť</p>
		</Button>
		<div class="flex flex-row gap-2">
			<Button
				type="button"
				color="danger"
				onclick={() => {
					gridData.set({
						width: 20,
						height: 20
					});
					gridWidth = 20;
					gridHeight = 20;
					$tables = [];
					$walls = [];
					$points = [];
					$zones = [];
					$zonePoints = [];
					openConfirmDeleteDialog = false;
				}}
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Vymazať plan</p>
			</Button>
		</div>
	</div>
</Dialog>

{#snippet tableRect(
	name: string,
	rotation: number,
	x: number,
	y: number,
	chairs: { left: string[]; right: string[] }
)}
	<Group
		{name}
		{rotation}
		{x}
		{y}
		draggable={true}
		physics={true}
		keepInBounds={true}
		rotateEnabled={true}
		ondragstart={$plugins.find((p) => p.name == 'brushes') ? dragStart : undefined}
		ondragmove={$plugins.find((p) => p.name == 'brushes') ? dragMove : undefined}
		ondragend={$plugins.find((p) => p.name == 'brushes') ? dragEnd : undefined}
		ontransformstart={$plugins.find((p) => p.name == 'brushes') ? transformRotateStart : undefined}
		ontransform={$plugins.find((p) => p.name == 'brushes') ? transformRotate : undefined}
		ontransformend={$plugins.find((p) => p.name == 'brushes') ? transformRotateEnd : undefined}
	>
		{#each chairs.left as chair, i}
			<Rect
				name={chair}
				x={gridSize * 0.1}
				y={(4 * gridSize - chairs.left.length * gridSize) / 2 + i * gridSize + gridSize * 0.1}
				width={0.8 * gridSize}
				height={0.8 * gridSize}
				fill={colors.slate[500]}
				defaultFill={colors.slate[500]}
				cornerRadius={4}
				perfectDrawEnabled={false}
				isChair={true}
				rotateEnabled={false}
			/>
		{/each}
		<Rect
			x={gridSize}
			selectDisabled={true}
			width={2 * gridSize}
			height={4 * gridSize}
			fill={colors.slate[700]}
			defaultFill={colors.slate[700]}
			cornerRadius={4}
			draggable={false}
			perfectDrawEnabled={false}
		/>
		{#each chairs.right as chair, i}
			<Rect
				name={chair}
				x={gridSize * 2 + gridSize + gridSize * 0.1}
				y={(4 * gridSize - chairs.right.length * gridSize) / 2 + i * gridSize + gridSize * 0.1}
				width={0.8 * gridSize}
				height={0.8 * gridSize}
				fill={colors.slate[500]}
				defaultFill={colors.slate[500]}
				cornerRadius={4}
				perfectDrawEnabled={false}
				isChair={true}
				rotateEnabled={false}
			/>
		{/each}
	</Group>
{/snippet}
{#snippet wallPoly(name: string, points: number[])}
	<Line
		{points}
		{name}
		closed={true}
		fill={colors.slate[800]}
		physics={true}
		disableSelect={true}
	/>
{/snippet}
{#snippet zonePoly(name: string, points: number[], fill: string)}
	<Line {points} {name} closed={true} {fill} opacity={0.5} physics={false} disableSelect={true} />
{/snippet}
