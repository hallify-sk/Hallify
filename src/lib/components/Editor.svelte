<script lang="ts">
	import { Stage, Layer, Rect, Line, Group, Transformer, Circle } from 'svelte-konva';
	import { registerWheelEvent } from './editor/events/wheel';
	import type { Vector2d } from 'konva/lib/types';
	import { constraintNumber, plugins, registerPlugin, tables, type StageAttrs } from './editor/lib';
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
		windowHeight = $bindable(800)
	}: {
		gridSize?: number;
		gridWidth?: number;
		gridHeight?: number;
		windowWidth?: number;
		windowHeight?: number;
		zoomBy?: number;
	} = $props();

	$effect(() => {
		if ($plugins) {
			console.log($plugins);
		}
	});

	$effect(() => {
		if (stage) {
			const stageHandle = stage?.handle();
			if (!stageHandle) return;
			windowWidth = window.innerWidth;
			windowHeight = window.innerHeight;
			stageHandle.size({ width: windowWidth, height: windowHeight });
			window.onresize = () => {
				windowWidth = window.innerWidth;
				windowHeight = window.innerHeight;
				stageHandle.size({ width: windowWidth, height: windowHeight });
			};
			//Register things to be used by other plugins;
			const attributes = stageHandle.attrs as StageAttrs;
			attributes.tr = tr?.handle;
			attributes.layers = {
				uiLayer: uiLayer?.handle,
				gridLayer: gridLayer?.handle,
				collisionLayer: collisionLayer?.handle
			};
			stageHandle.attrs.grid = {
				gridSize,
				gridWidth,
				gridHeight
			};
			if (tr) {
				registerWheelEvent(stageHandle);
				registerPlugin(brushes, stageHandle, 'brushes');
				tables.set([
					{
						shape: 'rect',
						name: uuidv4(),
						rotation: 0,
						x: 0,
						y: 0,
						chairs: {
							left: [uuidv4(), uuidv4(), uuidv4(), uuidv4()],
							right: [uuidv4(), uuidv4(), uuidv4(), uuidv4()]
						}
					},
					{
						shape: 'rect',
						name: uuidv4(),
						rotation: 0,
						x: 120,
						y: 120,
						chairs: {
							left: [uuidv4(), uuidv4()],
							right: [uuidv4(), uuidv4(), uuidv4()]
						}
					}
				]);
			}
		}
	});

	onMount(async () => {
		if (stage) {
			const stageHandle = stage?.handle();
			if (!stageHandle) return;
		}
	});

	function stageDragConstraint(pos: Vector2d) {
		let scale = stage?.handle()?.scaleX() || 1;

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
</script>

{#if $plugins.find((p) => p.name == 'brushes')}
	<Brushes />
{/if}
<div class="fixed top-0 left-0">
	<Stage
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
</div>
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
	<Line
		{points}
		{name}
		closed={true}
		{fill}
		opacity={0.5}
		physics={false}
		disableSelect={true}
	/>
{/snippet}
