<script lang="ts">
	import { Stage, Layer, Rect, Line, Group, Transformer, Circle } from 'svelte-konva';
	import { registerWheelEvent } from './editor/events/wheel';
	import type { Vector2d } from 'konva/lib/types';
	import { constraintNumber, registerPlugin, type StageAttrs } from './editor/lib';
	import { brushes } from './editor/brushes';
	import Brushes from './editor/plugins/Brushes.svelte';
	import { v4 as uuidv4 } from 'uuid';
	import { points, walls } from '$lib/util';

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
			registerWheelEvent(stageHandle);
			registerPlugin(brushes, stageHandle);
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

	const tables = [
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
	];
</script>

{#if stage?.handle()?.attrs.plugins.includes('brushes')}
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
				fill="#f1f5f9"
			/>
			{#each Array(gridWidth + 1), index}
				<Line
					points={[index * gridSize, 0, index * gridSize, gridHeight * gridSize]}
					stroke="#e2e8f0"
					strokeWidth={1}
					listening={false}
					perfectDrawEnabled={false}
					id={`leftChair_${index}`}
				/>
			{/each}
			{#each Array(gridHeight + 1), index}
				<Line
					points={[0, index * gridSize, gridWidth * gridSize, index * gridSize]}
					stroke="#e2e8f0"
					strokeWidth={1}
					listening={false}
					perfectDrawEnabled={false}
				/>
			{/each}
		</Layer>
		<Layer bind:this={collisionLayer}>
			{#each tables as table}
				{@render tableRect(table.name, table.rotation, table.x, table.y, table.chairs)}
			{/each}
			{#each $walls as wall}
				{@render wallPoly(wall.name, wall.points)}
			{/each}
			{#if $points.length}
				<Line
					points={$points.flatMap((point) => [point.x, point.y])}
					stroke="black"
					strokeWidth={2}
					closed={true}
					fill="black"
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
					fill="blue"
					draggable={true}
					name={point.name}
					physics={false}
					keepInBounds={true}
					ondragstart={stage?.handle()?.attrs.plugins?.includes('brushes')
						? stage?.handle()?.attrs.brushes.dragStart
						: undefined}
					ondragmove={stage?.handle()?.attrs.plugins?.includes('brushes')
						? stage?.handle()?.attrs.brushes.dragMove
						: undefined}
					ondragend={stage?.handle()?.attrs.plugins?.includes('brushes')
						? stage?.handle()?.attrs.brushes.dragEnd
						: undefined}
				/>
			{/each}
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
		draggable={stage?.handle()?.attrs.plugins?.includes('brushes')}
		physics={true}
		keepInBounds={true}
		rotateEnabled={true}
		ondragstart={stage?.handle()?.attrs.plugins?.includes('brushes')
			? stage?.handle()?.attrs.brushes.dragStart
			: undefined}
		ondragmove={stage?.handle()?.attrs.plugins?.includes('brushes')
			? stage?.handle()?.attrs.brushes.dragMove
			: undefined}
		ondragend={stage?.handle()?.attrs.plugins?.includes('brushes')
			? stage?.handle()?.attrs.brushes.dragEnd
			: undefined}
		ontransformstart={stage?.handle()?.attrs.plugins?.includes('brushes')
			? stage?.handle()?.attrs.brushes.transformRotateStart
			: undefined}
		ontransform={stage?.handle()?.attrs.plugins?.includes('brushes')
			? stage?.handle()?.attrs.brushes.transformRotate
			: undefined}
		ontransformend={stage?.handle()?.attrs.plugins?.includes('brushes')
			? stage?.handle()?.attrs.brushes.transformRotateEnd
			: undefined}
	>
		{#each chairs.left as chair, i}
			<Rect
				name={chair}
				x={gridSize * 0.1}
				y={(4 * gridSize - chairs.left.length * gridSize) / 2 + i * gridSize + gridSize * 0.1}
				width={0.8 * gridSize}
				height={0.8 * gridSize}
				fill="#64748b"
				defaultFill="#64748b"
				cornerRadius={4}
				perfectDrawEnabled={false}
				isChair={true}
				rotateEnabled={false}
			/>
		{/each}
		<Rect
			x={gridSize}
			width={2 * gridSize}
			height={4 * gridSize}
			fill="#334155"
			defaultFill="#334155"
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
				fill="#64748b"
				defaultFill="#64748b"
				cornerRadius={4}
				perfectDrawEnabled={false}
				isChair={true}
				rotateEnabled={false}
			/>
		{/each}
	</Group>
{/snippet}
{#snippet wallPoly(name: string, points: number[])}
	<Line {points} {name} closed={true} fill="black" physics={true} />
{/snippet}
