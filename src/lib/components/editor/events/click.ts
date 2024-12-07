import Konva from "konva";

export function registerClickEvent(stage: Konva.Stage, tr: Konva.Transformer | undefined, layers: { [key: string]: Konva.Layer | undefined }) {
    stage.on('click tap', function (e) {
        if(!tr) return;
        //Default brush behaviour
        if (e.target === stage || e.target.getLayer() == layers?.gridLayer) return deselectNodes(tr);

        if(e.target.getLayer() == layers?.uiLayer) return;
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

function deselectNodes(tr: Konva.Transformer){
    tr.nodes([]);
    return;
};