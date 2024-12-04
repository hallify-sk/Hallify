<script lang="ts">
	import {
		Stage,
		Layer,
		Rect,
		Line,
		Group,
		type KonvaDragTransformEvent,
		Transformer
	} from 'svelte-konva';
	import Konva from 'konva';
	import { registerWheelEvent } from './editor/events/wheel';
	import type { Vector2d } from 'konva/lib/types';
	import { constraintNumber, snapToGrid } from './editor/lib';
	import type { KonvaEventObject, Node, NodeConfig } from 'konva/lib/Node';

	let stage: Konva.Stage | null = $state(null);

	let tr: Konva.Transformer | undefined = $state(undefined);

	let uiLayer: Konva.Layer | undefined = $state(undefined);
	let collisionLayer: Konva.Layer | undefined = $state(undefined);

	let currentTween: Konva.Tween | undefined = $state(undefined);

	const {
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
			registerWheelEvent(stage);
			stage.on('click tap', function (e) {
				//Default brush behaviour
				if (!tr) return;
				if (e.target === stage) {
					tr.nodes([]);
					return;
				}

				const isSelected = tr.nodes().indexOf(e.target) >= 0;

				if (!isSelected) {
					if (e.target.parent?.draggable()) {
						tr.nodes([e.target.parent]);
					} else {
						tr.nodes([e.target]);
					}
				} else if (isSelected) {
					const nodes = tr.nodes().slice();
					nodes.splice(nodes.indexOf(e.target), 1);
					tr.nodes(nodes);
				}
			});
		}
	});

	function stageDragConstraint(pos: Vector2d) {
		let scale = stage?.scaleX() || 1;
		let newX = constraintNumber(
			pos.x,
			-gridWidth * gridSize * scale + windowWidth - 5 * gridSize * scale,
			5 * gridSize * scale
		);
		let newY = constraintNumber(
			pos.y,
			-gridHeight * gridSize * scale + windowHeight - 5 * gridSize * scale,
			5 * gridSize * scale
		);
		return {
			x: newX,
			y: newY
		};
	}

	const dragStart = async (e: KonvaDragTransformEvent) => {
		const target = e.detail.target;
        console.log(e, target);
		target.moveTo(uiLayer);
		const tween = new Konva.Tween({
			node: target,
			scaleX: 0.8,
			scaleY: 0.8,
			duration: 0.1,
			easing: Konva.Easings.BackEaseOut
		});

		currentTween = tween;

		//tween.play();

		const clone = target.clone() as Konva.Group;
        target.moveToTop();
		clone.name('DragPreview');
		clone.position({
			x: target.x(),
			y: target.y()
		});
		clone.draggable(false);
		clone.opacity(0.5);
		uiLayer?.add(clone);
		clone.draw();
		collisionLayer?.moveToTop();
		return;
	};

	const dragMove = async (e: KonvaDragTransformEvent) => {
		const target = e.detail.target;
        target.moveToTop();
        console.log(target);
        console.log(target.width());
		const clone = uiLayer?.findOne('.DragPreview');
		if (!clone) return;
		clone.position({
			x: snapToGrid(target.x(), gridSize),
			y: snapToGrid(target.y(), gridSize)
		});
		return;
	};

	const dragEnd = async (e: KonvaDragTransformEvent) => {
		const target = e.detail.target;
        target.moveToTop();
		const clone = uiLayer?.findOne('.DragPreview');
		currentTween?.reverse();
		setTimeout(() => {
			target.position(clone?.position() ?? { x: 0, y: 0 });
		}, 0);
		target.moveTo(collisionLayer);
		clone?.destroy();
		return;
	};

    function drawCorners(){
        const group = tr?.nodes()[0];
        if (group && group instanceof Konva.Group) {
            const box = group.getClientRect({ relativeTo: group });
            console.log(box);
            console.log(group.x());
            console.log('Group width:', box.width);
        }
    }
</script>
<button onclick={drawCorners}>Draw corners</button>
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
	<Layer>
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
	<Layer config={{ name: 'uiLayer' }} bind:handle={uiLayer} />
	<Layer bind:handle={collisionLayer}>
		<Transformer
			bind:handle={tr}
			config={{
				resizeEnabled: false,
				rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
				rotationSnapTolerance: 30
			}}
		/>
		<Group
			config={{
				rotation: 0,
				x: 0,
				y: 0,
				draggable: true,
				rotatable: true
			}}
			on:dragstart={dragStart}
			on:dragmove={dragMove}
			on:dragend={dragEnd}
		>
            {#each Array(3) as _, i}
            <Rect
				config={{
					x: gridSize * 0.1,
                    y: i * gridSize + gridSize * 0.1,
					width: 0.8 * gridSize,
					height: 0.8 * gridSize,
					fill: '#64748b',
					cornerRadius: 4,
                    perfectDrawEnabled: false,
                    isChair: true,
				}}
			/>
            {/each}
			<Rect
				config={{
					x: gridSize,
					width: 2 * gridSize,
					height: 4 * gridSize,
					fill: '#334155',
					cornerRadius: 4,
                    draggable: false,
                    perfectDrawEnabled: false,
				}}
			/>
            {#each Array(4) as _, i}
            <Rect
				config={{
					x: gridSize * 2 + gridSize + gridSize * 0.1,
                    y: i * gridSize + gridSize * 0.1,
					width: 0.8 * gridSize,
					height: 0.8 * gridSize,
					fill: '#64748b',
					cornerRadius: 4,
                    perfectDrawEnabled: false,
                    isChair: true,
				}}
			/>
            {/each}
		</Group>
	</Layer>
</Stage>
