import Konva from 'konva';

export function registerWheelEvent(stage: Konva.Stage, options: {minScale: number, maxScale: number, invert?: boolean, scaleBy?: number} = {minScale: 0.5, maxScale: 3, invert: false, scaleBy: 1.01}) {
    stage.on('wheel', (e) => {
        e.evt.preventDefault();
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        if(!pointer) return;
        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };
        const newScale = e.evt.deltaY > 0 ? options.invert ? oldScale / 1.1 : oldScale * 1.1 : options.invert ? oldScale * 1.1 : oldScale / 1.1;
        if(newScale < options.minScale || newScale > options.maxScale) return;
        stage.scale({ x: newScale, y: newScale });
        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        stage.position(newPos);
    });
}