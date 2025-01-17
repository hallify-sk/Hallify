<script lang="ts">
	import {
		Stage,
		Layer,
		Rect,
		Line,
		Group,
		Transformer,
		Circle,
		Label,
		Tag,
		Text,
		Image
	} from 'svelte-konva';
	import Konva from 'konva';
	import { registerWheelEvent } from './editor/events/wheel';
	import type { Vector2d } from 'konva/lib/types';
	import { constraintNumber, registerPlugin } from './editor/lib';
	import { brushes } from './editor/brushes';
	import { plugin } from 'postcss';
	import Brushes from './editor/plugins/Brushes.svelte';
	import { onMount } from 'svelte';
	import { v4 as uuidv4 } from 'uuid';
	import { points, walls } from '$lib/util';
	import Check from '$lib/icons/Check.svelte';

	let stage: Konva.Stage | undefined = $state();

	let tr: Konva.Transformer | undefined = $state(undefined);

	let gridLayer: Konva.Layer | undefined = $state(undefined);
	let uiLayer: Konva.Layer | undefined = $state(undefined);
	let collisionLayer: Konva.Layer | undefined = $state(undefined);

	let currentTween: Konva.Tween | undefined = $state(undefined);

	let {
		gridSize = $bindable(30),
		gridWidth = $bindable(20),
		gridHeight = $bindable(20),
		windowWidth = $bindable(800),
		windowHeight = $bindable(800),
		zoomBy = $bindable(1.01)
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
			windowWidth = window.innerWidth;
			windowHeight = window.innerHeight;
			stage?.size({ width: windowWidth, height: windowHeight });
			window.onresize = () => {
				windowWidth = window.innerWidth;
				windowHeight = window.innerHeight;
				stage?.size({ width: windowWidth, height: windowHeight });
			};
			//Register things to be used by other plugins;
			stage.attrs.tr = tr;
			stage.attrs.layers = {
				uiLayer,
				gridLayer,
				collisionLayer
			};
			stage.attrs.grid = {
				gridSize,
				gridWidth,
				gridHeight
			};
			registerWheelEvent(stage);
			registerPlugin(brushes, stage);
		}
	});

	function stageDragConstraint(pos: Vector2d) {
		let scale = stage?.scaleX() || 1;

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
	$effect(() => {
		if (tables) {
			console.log(tables);
		}
	});
</script>

{#if stage?.attrs.plugins.includes('brushes')}
	<Brushes />
{/if}

<div class="fixed top-0 left-0">
	<Stage
		bind:handle={stage}
		config={{
			width: windowWidth,
			height: windowHeight,
			pixelRatio: 1,
			draggable: true,
			dragBoundFunc: stageDragConstraint
		}}
	>
		<!--Griddy-->
		<Layer bind:handle={gridLayer}>
			<Rect
				config={{
					x: 0,
					y: 0,
					width: gridWidth * gridSize,
					height: gridHeight * gridSize,
					fill: '#f1f5f9'
				}}
			/>
			{#each Array(gridWidth + 1) as xGrid, index}
				<Line
					config={{
						points: [index * gridSize, 0, index * gridSize, gridHeight * gridSize],
						stroke: '#e2e8f0',
						strokeWidth: 1,
						listening: false,
						perfectDrawEnabled: false,
						id: `leftChair_${index}`
					}}
				/>
			{/each}
			{#each Array(gridHeight + 1) as yGrid, index}
				<Line
					config={{
						points: [0, index * gridSize, gridWidth * gridSize, index * gridSize],
						stroke: '#e2e8f0',
						strokeWidth: 1,
						listening: false,
						perfectDrawEnabled: false
					}}
				/>
			{/each}
		</Layer>
		<Layer bind:handle={collisionLayer}>
			{#each tables as table}
				{@render tableRect(table.name, table.rotation, table.x, table.y, table.chairs)}
			{/each}
			{#each $walls as wall}
				{@render wallPoly(wall.name, wall.points)}
			{/each}
			<Line
				config={{
					points: [150, 150, 180, 150, 210, 270, 150, 300],
					stroke: 'black',
					strokeWidth: 2,
					closed: true,
					fill: 'black'
				}}
			/>
			{#if $points.length}
				<Line
					config={{
						points: $points.flatMap((point) => [point.x, point.y]),
						stroke: 'black',
						strokeWidth: 2,
						closed: true,
						fill: 'black',
						physics: true
					}}
				/>
			{/if}
		</Layer>
		<Layer config={{ name: 'uiLayer' }} bind:handle={uiLayer}>
			<Transformer
				bind:handle={tr}
				config={{
					resizeEnabled: false,
					rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
					rotationSnapTolerance: 30
				}}
			/>
			{#each $points as point}
				<Circle
					config={{
						x: point.x,
						y: point.y,
						radius: 5,
						fill: 'blue',
						draggable: true,
						name: point.name,
						physics: false,
						keepInBounds: true
					}}
					on:dragstart={stage?.attrs.plugins?.includes('brushes')
						? stage?.attrs.brushes.dragStart
						: undefined}
					on:dragmove={stage?.attrs.plugins?.includes('brushes')
						? stage?.attrs.brushes.dragMove
						: undefined}
					on:dragend={stage?.attrs.plugins?.includes('brushes')
						? stage?.attrs.brushes.dragEnd
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
		config={{
			name,
			rotation,
			x,
			y,
			draggable: stage?.attrs.plugins?.includes('brushes'),
			physics: true,
			keepInBounds: true,
			rotateEnabled: true
		}}
		on:dragstart={stage?.attrs.plugins?.includes('brushes')
			? stage?.attrs.brushes.dragStart
			: undefined}
		on:dragmove={stage?.attrs.plugins?.includes('brushes')
			? stage?.attrs.brushes.dragMove
			: undefined}
		on:dragend={stage?.attrs.plugins?.includes('brushes')
			? stage?.attrs.brushes.dragEnd
			: undefined}
		on:transformstart={stage?.attrs.plugins?.includes('brushes')
			? stage?.attrs.brushes.transformRotateStart
			: undefined}
		on:transform={stage?.attrs.plugins?.includes('brushes')
			? stage?.attrs.brushes.transformRotate
			: undefined}
		on:transformend={stage?.attrs.plugins?.includes('brushes')
			? stage?.attrs.brushes.transformRotateEnd
			: undefined}
	>
		{#each chairs.left as chair, i}
			<Rect
				config={{
					name: chair,
					x: gridSize * 0.1,
					y: (4 * gridSize - chairs.left.length * gridSize) / 2 + i * gridSize + gridSize * 0.1,
					width: 0.8 * gridSize,
					height: 0.8 * gridSize,
					fill: '#64748b',
					defaultFill: '#64748b',
					cornerRadius: 4,
					perfectDrawEnabled: false,
					isChair: true,
					rotateEnabled: false
				}}
			/>
		{/each}
		<Rect
			config={{
				x: gridSize,
				width: 2 * gridSize,
				height: 4 * gridSize,
				fill: '#334155',
				defaultFill: '#334155',
				cornerRadius: 4,
				draggable: false,
				perfectDrawEnabled: false
			}}
		/>
		{#each chairs.right as chair, i}
			<Rect
				config={{
					name: chair,
					x: gridSize * 2 + gridSize + gridSize * 0.1,
					y: (4 * gridSize - chairs.right.length * gridSize) / 2 + i * gridSize + gridSize * 0.1,
					width: 0.8 * gridSize,
					height: 0.8 * gridSize,
					fill: '#64748b',
					defaultFill: '#64748b',
					cornerRadius: 4,
					perfectDrawEnabled: false,
					isChair: true,
					rotateEnabled: false
				}}
			/>
		{/each}
	</Group>
{/snippet}
{#snippet wallPoly(name: string, points: number[])}
	<Line
		config={{
			points,
			name,
			closed: true,
			fill: 'black',
			rotateEnabled: false
		}}
	/>
{/snippet}
