import { points } from '$lib/util';
import Konva from 'konva';
import { selectedBrush } from '../brushes';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { circleBounds, pointsToVector2D, snapToGrid } from '../lib';

export function registerClickEvent(
	stage: Konva.Stage,
	tr: Konva.Transformer | undefined,
	layers: { [key: string]: Konva.Layer | undefined }
) {
	const stageBounds = [
		0,
		0,
		stage.attrs.grid.gridWidth * stage.attrs.grid.gridSize,
		0,
		stage.attrs.grid.gridWidth * stage.attrs.grid.gridSize,
		stage.attrs.grid.gridHeight * stage.attrs.grid.gridSize,
		0,
		stage.attrs.grid.gridHeight * stage.attrs.grid.gridSize
	];

	stage.on('click tap', function (e) {
		switch (get(selectedBrush)) {
			case 'wallPainter':
				{
					const pos = stage.getPointerPosition();
					if (!pos) return;
					if(circleBounds(pos, 0, pointsToVector2D(stageBounds))) return;
					points.update((p) => {
						const transform = stage.getAbsoluteTransform().copy();
						transform.invert();
						const posTransformed = transform.point(pos);
						p.push({
							x: snapToGrid(posTransformed.x, stage.attrs.grid.gridSize),
							y: snapToGrid(posTransformed.y, stage.attrs.grid.gridSize),
							name: uuidv4()
						});
						const uniquePoints = p.filter(
							(point, index, self) =>
								index === self.findIndex((t) => t.x === point.x && t.y === point.y)
						);
						return uniquePoints;
					});
				}
				break;
			default: {
                console.log("tippy tappy");
				if (!tr) return;
				//Default brush behaviour
				if (e.target === stage || e.target.getLayer() == layers?.gridLayer)
					return deselectNodes(tr);

                if(e.target.attrs.disableSelect) return;
				const isSelected = tr.nodes().indexOf(e.target) >= 0;

				if (!isSelected) {
					if (e.target.attrs.isChair) {
						tr.nodes([e.target]);
						tr.rotateEnabled(false);
					} else if (e.target.parent?.draggable()) {
						tr.nodes([e.target.parent]);
						tr.rotateEnabled(true);
					} else {
						tr.nodes([e.target]);
						tr.rotateEnabled(true);
					}
				} else if (isSelected) {
					const nodes = tr.nodes().slice();
					nodes.splice(nodes.indexOf(e.target), 1);
					tr.nodes(nodes);
				}
			}
		}
	});
}

function deselectNodes(tr: Konva.Transformer) {
	tr.nodes([]);
	return;
}
