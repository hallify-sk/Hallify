//Canvas setup
var canvasWidth = 751;
var canvasHeight = 751;
var tween = null;
var blockSnapSize = 30;

//Width/height of one square in grid
const gridSize = 30

//Array of all objects and its hitboxes
const objects = [];
//[ {rect: rectangleRef, points: [ [0, 0], [2, 0], [2, 1], [0, 1] ] } ]

let snapCoefficient = document.querySelector("#snapCoefficient").value || 1;

const gridWidth = 15;
const gridHeight = 20;

let isIntersecting = false;
let shadowRectPos = [0,0];
let lastRotation = 0;

const stage = new Konva.Stage({
  container: "container",
  width: canvasWidth,
  height: canvasHeight,
  draggable: true,
});

stage.container().style.backgroundColor = "#383838";

const square = createRect(0,0,5,4,layer,true,"hi");

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}
//Multiplies number by gridSize
function toGridUnits(n){
  return n * gridSize;
};

function snapVal(){
  return gridSize / snapCoefficient;
};

function createRect(x, y, width, height, draggable, name, opacity, fill, stroke, strokeWidth, dash){
  const rectangle = new Konva.Rect({
    x: toGridUnits(x),
    y: toGridUnits(y),
    draggable,
    width: toGridUnits(width),
    height: toGridUnits(height),
    stroke,
    strokeWidth,
    opacity,
    fill,
    name,
    dash
  });
  return rectangle;
};

const shadowRectangle = createRect(0,0,0,0, false, "placePreview", 0.6, "#FF7B17", "#CF6412", 3, [16, 2]);

//Stopped here

function newRectangle(x, y, width, height, layer, stage) {
  const rectangle = new Konva.Rect({
    x: blockSnapSize * x,
    y: blockSnapSize * y,
    draggable: true,
    width: blockSnapSize * width,
    height: blockSnapSize * height,
    stroke: "#000",
    strokeWidth: 1,
    fill: "#fff",
    name: 'rect'
  });

  rectangle.on("dragstart", (e) => {
    rotation = rectangle.rotation();
    shadowRectangle.width(width * blockSnapSize);
    shadowRectangle.height(height * blockSnapSize);
    shadowRectangle.rotation(e.target.rotation());
    shadowRectPos = [Math.round(rectangle.x() / blockSnapSize) * blockSnapSize, Math.round(rectangle.y() / blockSnapSize) * blockSnapSize];
    shadowRectangle.show();
    shadowRectangle.moveToTop();
    rectangle.moveToTop();
    tr.nodes([]);
  });
  rectangle.on("dragend", (e) => {
    rectangle.position({
      x: Math.round(shadowRectangle.x() / (blockSnapSize / snapCoefficient)) * (blockSnapSize / snapCoefficient),
      y: Math.round(shadowRectangle.y() / (blockSnapSize / snapCoefficient)) * (blockSnapSize / snapCoefficient),
    });
    layer.children.forEach((rectangle) => {
      if(rectangle !== tr) rectangle.fill('white');
    })
    shadowRectangle.hide();
    stage.batchDraw();
  });
  rectangle.on("dragmove", (e) => {
    snapCoefficient = document.querySelector("#snapCoefficient").value
    console.log(rotation);
    if(isIntersecting) return;
      shadowRectangle.position({
        x: clamp(Math.round(rectangle.x() / (blockSnapSize / snapCoefficient)) * (blockSnapSize / snapCoefficient), rotation == 180 ? blockSnapSize * width : Math.abs(rotation) == 90 ? blockSnapSize * height : 0, gridWidth * blockSnapSize - (Math.abs(rotation) == 90 || rotation == 180 ? 0 : blockSnapSize * width)),
        y: clamp(Math.round(rectangle.y() / (blockSnapSize / snapCoefficient)) * (blockSnapSize / snapCoefficient), rotation == 180 ? blockSnapSize * height : 0, gridHeight * blockSnapSize - (rotation == 180 ? 0 : rotation == 90 ? blockSnapSize * width : blockSnapSize * height)),
      });
      shadowRectPos = [Math.round(rectangle.x() / blockSnapSize) * blockSnapSize, Math.round(rectangle.y() / blockSnapSize) * blockSnapSize];
    stage.batchDraw();
  });
  rectangle.on("transformend", function (e) {
    var target = e.target;
    rotation = Math.round(target.rotation());
    rectangle.position({
      x: clamp(Math.round(target.x() / (blockSnapSize / snapCoefficient)) * (blockSnapSize / snapCoefficient), 0, gridWidth * blockSnapSize - blockSnapSize * width),
      y: clamp(Math.round(target.y() / (blockSnapSize / snapCoefficient)) * (blockSnapSize / snapCoefficient), 0, gridHeight * blockSnapSize - blockSnapSize * height),
    });
    drawCorners(rectangle, rotation);
  });
  return rectangle;
}

const gridLayer = new Konva.Layer();
const padding = blockSnapSize;

function createGrid() {
  for (var i = 0; i < gridWidth + 1; i++) {
    const line = new Konva.Line({
      points: [
        Math.round(i * padding) + 0.5,
        0,
        Math.round(i * padding) + 0.5,
        gridHeight * padding,
      ],
      stroke: "#ddd",
      strokeWidth: 1,
    });
    line.cache();
    gridLayer.add(line);
  }
  gridLayer.add(new Konva.Line({ points: [0, 0, 10, 10] }));
  for (var j = 0; j < gridHeight + 1; j++) {
    const line = new Konva.Line({
      points: [
        0,
        Math.round(j * padding),
        gridWidth * padding,
        Math.round(j * padding),
      ],
      stroke: "#ddd",
      strokeWidth: 1,
    });
    line.cache();
    gridLayer.add(line);
  }
}

var layer = new Konva.Layer();
var shadowLayer = new Konva.Layer();
shadowRectangle.hide();
shadowLayer.add(shadowRectangle);
createGrid();

var tr = new Konva.Transformer({
  resizeEnabled: false,
  rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
  rotationSnapTolerance: 30
});
let rect1 = newRectangle(1, 3, 4, 2, layer, stage);
let rect2 = newRectangle(10, 3, 1, 5, layer, stage)
let rect3 = newRectangle(8, 8, 2, 1, layer, stage)
layer.add(rect1);
layer.add(rect2);
layer.add(rect3);

layer.add(tr);

layer.on('dragmove', function (e) {
  var target = e.target;
  console.log(target.intersects({x: 0, y: 0}));
  var targetRect = e.target.getClientRect();
  isIntersecting = layer.children.some((rectangle) => {
    if(rectangle == target) return false;
    if(rectangle == tr) return false;
    if(target == tr) return false;
    if (haveIntersection(rectangle.getClientRect(), targetRect)) {
      console.log(rectangle);
      console.log(target);
      shadowRectangle.position({
        x: shadowRectPos[0],
        y: shadowRectPos[1],
      });
      if(rectangle !== tr) rectangle.fill('red');
      stage.batchDraw();
      return true;
    }else{
      if(rectangle !== tr) rectangle?.fill('white');
      return false;
    };
  })
});

function haveIntersection(r1, r2) {
  return !(
    r2.x > r1.x + r1.width ||
    r2.x + r2.width < r1.x ||
    r2.y > r1.y + r1.height ||
    r2.y + r2.height < r1.y
  );
}

stage.add(gridLayer);
stage.add(shadowLayer);
stage.add(layer);

const scaleBy = 1.2;

//SCALE
stage.on("wheel", (e) => {
  // stop default scrolling
  e.evt.preventDefault();
  const oldScale = stage.scaleX();

  var pointer = stage.getPointerPosition();

  var mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };

  // how to scale? Zoom in? Or zoom out?
  let direction = e.evt.deltaY > 0 ? -1 : 1;

  // when we zoom on trackpad, e.evt.ctrlKey is true
  // in that case lets revert direction
  if (e.evt.ctrlKey) {
    direction = -direction;
  }

  var newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

  newScale = clamp(newScale, 1, 3);

  stage.scale({ x: newScale, y: newScale });

  var newPos = {
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  };
  stage.position(newPos);
});

//RESPONZIVITA
window.addEventListener("resize", () => {
  stage.width(clamp(window.innerWidth, 0, 751));
  stage.height(clamp(window.innerHeight, 0, 751));
});

stage.on('click tap', function (e) {

  // if click on empty area - remove all selections
  if (e.target === stage) {
    tr.nodes([]);
    return;
  }

  // do nothing if clicked NOT on our rectangles
  if (!e.target.hasName('rect')) {
    return;
  }

  // do we pressed shift or ctrl?
  const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
  const isSelected = tr.nodes().indexOf(e.target) >= 0;

  if (!metaPressed && !isSelected) {
    // if no key pressed and the node is not selected
    // select just one
    tr.nodes([e.target]);
  } else if (metaPressed && isSelected) {
    // if we pressed keys and node was selected
    // we need to remove it from selection:
    const nodes = tr.nodes().slice(); // use slice to have new copy of array
    // remove node from array
    nodes.splice(nodes.indexOf(e.target), 1);
    tr.nodes(nodes);
  } else if (metaPressed && !isSelected) {
    // add the node into selection
    const nodes = tr.nodes().concat([e.target]);
    tr.nodes(nodes);
  }
});

function drawCorners(rect, angle){

  var rectPos = rect.position();
  
  var x = 0, y = 0;
  for (var i = 0; i < 4; i = i + 1){

  switch (i){
    
    case 0: 
      x = rectPos.x; y = rectPos.y;
      break;

    case 1: 
      x = rectPos.x + rect.width(); y = rectPos.y;
      break;

    case 2: 
      x = rectPos.x + rect.width(); y = rectPos.y + rect.height();
      break;

    case 3: 
      x = rectPos.x; y = rectPos.y + rect.height();
      break;
     }

    var pt = rotatePoint({x: x, y: y}, {x: rectPos.x, y: rectPos.y}, angle)

    circles[i].position(pt)
    console.log(x, y);

  }
 }

 function rotatePoint(pt, o, a){

  var angle = a * (Math.PI/180); // Convert to radians

  var rotatedX = Math.cos(angle) * (pt.x - o.x) - Math.sin(angle) * (pt.y - o.y) + o.x;

  var rotatedY = Math.sin(angle) * (pt.x - o.x) + Math.cos(angle) * (pt.y - o.y) + o.y;  

  return {x: rotatedX, y: rotatedY};

}

circles = [];
newPos = {x: 80, y: 100};
let circle = new Konva.Circle({x: newPos.x, y: newPos.y, radius: 10, fill: 'magenta'}) 
circles[0] = circle.clone();
circles[0].fill('lime')
layer.add(circles[0]);
circles[1] = circle.clone();
circles[1].fill('gold')
layer.add(circles[1]);
circles[2] = circle.clone();
circles[2].fill('blue')
layer.add(circles[2]);
circles[3] = circle.clone();
circles[3].fill('darkviolet')

layer.add(circles[3]);
