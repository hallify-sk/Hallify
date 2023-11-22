//Canvas setup
var canvasWidth = 751;
var canvasHeight = 751;
var tween = null;
var blockSnapSize = 30;

//Stage
const stage = new Konva.Stage({
  container: "container",
  width: canvasWidth,
  height: canvasHeight,
  draggable: true,
});

//Layers
const objectLayer = new Konva.Layer(),
  previewLayer = new Konva.Layer(),
  collisionLayer = new Konva.Layer(),
  gridLayer = new Konva.Layer();

  stage.add(gridLayer);
  stage.add(previewLayer);
  stage.add(collisionLayer);
  stage.add(objectLayer);

//Width/height of one square in grid
const gridSize = 30

//Array of all objects and its hitboxes
const objects = [];
//[ {rect: rectangleRef, points: [ [0, 0], [2, 0], [2, 1], [0, 1] ] } ]

let snapCoefficient = 1;

const gridWidth = 30;
const gridHeight = 20;

let isIntersecting = false;
let shadowRectPos = [0,0];
let lastRotation = 0;

stage.container().style.backgroundColor = "#383838";

const square = createRect(0,0,5,4,true,"table", 1, "#fff");
const square3 = createRect(8,0,5,4,true,"table", 1, "#fff");
const square2 = createRect(6,7,1,5,true,"hi", 1, "#fff");
const previewRectangle = createRect(0,0,0,0, false, "placePreview", 0.6, "#FF7B17", "#CF6412", 3, [16, 2], true);

previewLayer.add(previewRectangle);
objectLayer.add(square);
objectLayer.add(square3);
objectLayer.add(square2);

for(let i =0; i < 0; i++){
  let s = createRect(Math.floor(Math.random()*30)+1,Math.floor(Math.random()*30)+1,Math.floor(Math.random()*30),Math.floor(Math.random()*30),true,"hi", 1, "#fff");
  objectLayer.add(s);
}

//Functions;
//Finds the closest distance between two objects' corners
function getDistance(rect1, rect2){
  const cornersOne = objects.find(i => i.rect == rect1).corners;
  const cornersTwo = objects.find(i => i.rect == rect2).corners;
  let distances = [];
  for(const point1 of cornersOne){
    for(const point2 of cornersTwo){
      //Get absolute difference between positions
      const xDif = point1.x() - point2.x();
      const yDif = point1.y() - point2.y();
      const absHypotenuseDif = Math.sqrt(xDif*xDif + yDif*yDif);
      distances.push(absHypotenuseDif);
    }
  };
  return Math.min(...distances);
}

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

function createRect(x, y, width, height, draggable, name, opacity, fill, stroke, strokeWidth, dash, noCollision){
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
    name: `transformable ${name}`,
    dash
  });

  if(!noCollision) createCorners(rectangle);
  drawCorners(rectangle, rectangle.rotation());

  //EVENTS
  if(!draggable) return rectangle;

  rectangle.on("dragstart", dragStart);
  rectangle.on("dragend", dragEnd);
  rectangle.on("dragmove", dragMove);
  
  rectangle.on("transform", function(e) {
    setPreviewRect(rectangle, true);
    drawCorners(rectangle, rectangle.rotation());
  });

  rectangle.on("transformend", function (e) {
    //rotation = Math.round(target.rotation());
    rectangle.position({
      x: clamp(Math.round(rectangle.x() / snapVal()) * snapVal(), 0, toGridUnits(gridWidth) - rectangle.width()),
      y: clamp(Math.round(rectangle.y() / snapVal()) * snapVal(), 0, toGridUnits(gridHeight)- rectangle.height()),
    });
    setPreviewRect(rectangle, false);
    drawCorners(rectangle, rectangle.rotation());
  });

  //END EVENTS

  return rectangle;
};

function setPreviewRect(rectangle, visible){
  previewRectangle.width(rectangle.width());
  previewRectangle.height(rectangle.height());
  previewRectangle.rotation(rectangle.rotation());
  previewRectangle.position({
    x: clamp(Math.round(rectangle.x() / snapVal()) * snapVal(), 0, toGridUnits(gridWidth) - rectangle.width()),
    y: clamp(Math.round(rectangle.y() / snapVal()) * snapVal(), 0, toGridUnits(gridHeight) - rectangle.height())
  });
  if(visible){
    previewRectangle.show();
    previewRectangle.moveToTop();
    rectangle.moveToTop();
  }else{
    previewRectangle.hide();
  };
  stage.batchDraw();
  return;
};

//http://www.jeffreythompson.org/collision-detection <33333

function PolyColliding(rect1, rect2) {
  const cornersOne = objects.find(i => i.rect == rect1).corners;
  const cornersTwo = objects.find(i => i.rect == rect2).corners;
  let next = 0;
  for (let current = 0; current < cornersOne.length; current++){
    next = current+1;
    if(next == cornersOne.length) next = 0;
    const vc = cornersOne[current];
    const vn = cornersOne[next];

    collision = PolyLine(cornersTwo, vc.x(), vc.y(), vn.x(), vn.y());
    if(collision) return true;
  };
  return false;
};

function PolyLine(corners, x1, y1, x2, y2){
  let next = 0;
  for (let current = 0; current < corners.length; current++){
    next = current+1;
    if(next == corners.length) next = 0;
    x3 = corners[current].x();
    y3 = corners[current].y();
    x4 = corners[next].x();
    y4 = corners[next].y();

    hit = LineLine(x1,y1,x2,y2,x3,y3,x4,y4);
    if(hit) return true;
  }
  return false;
}

/*

boolean polyLine(PVector[] vertices, float x1, float y1, float x2, float y2) {

  // go through each of the vertices, plus the next
  // vertex in the list
  int next = 0;
  for (int current=0; current<vertices.length; current++) {

    // get next vertex in list
    // if we've hit the end, wrap around to 0
    next = current+1;
    if (next == vertices.length) next = 0;

    // get the PVectors at our current position
    // extract X/Y coordinates from each
    float x3 = vertices[current].x;
    float y3 = vertices[current].y;
    float x4 = vertices[next].x;
    float y4 = vertices[next].y;

    // do a Line/Line comparison
    // if true, return 'true' immediately and
    // stop testing (faster)
    boolean hit = lineLine(x1, y1, x2, y2, x3, y3, x4, y4);
    if (hit) {
      return true;
    }
  }

  // never got a hit
  return false;
}

*/

function LineLine(x1, y1, x2, y2, x3, y3, x4, y4){
  let uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
  let uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));

  if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
    return true;
  }
  return false;
};

function dragStart(e){
  const rect = e.target;
  setPreviewRect(rect, true);
  tr.nodes([]);
}

function dragEnd(e){
  const rect = e.target;
  rect.position({
    x: Math.round(previewRectangle.x() / snapVal()) * snapVal(),
    y: Math.round(previewRectangle.y() / snapVal()) * snapVal(),
  });
  drawCorners(rect, rect.rotation());
  setPreviewRect(rect, false);
  stage.batchDraw();
}

function dragMove(e){
  const rect = e.target;
  snapCoefficient = parseInt(document.querySelector("#snapCoefficient").value) || 1;
  setPreviewRect(rect, true);
  //Check collisions for every object
  const minDistance = Math.max(e.target.height(), e.target.width()) / 2 + 1; //+1 to create intersect
  const collisions = [];
  for(let i = 0; i < objects.length; i++){
    let next = i+1;
    if(next == objects.length){
      next = 0;
    };
    //Don't check for collision on items that are too far away from our object! (Use a less computing expensive function to check)
    if(getDistance(objects[i].rect, objects[next].rect) < minDistance){
      collisions.push(PolyColliding(objects[i].rect, objects[next].rect));
    };
  };
  let isColliding = collisions.some(i => i == true);
  console.log(isColliding);
  //console.log(PolyColliding(square, square2));
  //console.log(getDistance(square, square2));
  //shadowRectPos = [Math.round(rect.x() / blockSnapSize) * blockSnapSize, Math.round(rect.y() / blockSnapSize) * blockSnapSize];
  drawCorners(rect, rect.rotation());
  stage.batchDraw();
}

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

    objects.find(object => object.rect == rect)?.corners[i]?.position(pt);

  }
 }

function createCorners(rect){
  const circles = [];
  circles[0] = new Konva.Circle({x: 0, y: 0, radius: 5, fill: 'magenta'});
  circles[1] = new Konva.Circle({x: 0, y: 0, radius: 5, fill: 'lime'});
  circles[2] = new Konva.Circle({x: 0, y: 0, radius: 5, fill: 'blue'});
  circles[3] = new Konva.Circle({x: 0, y: 0, radius: 5, fill: 'darkviolet'});
  objects.push({rect: rect, corners: circles});
  collisionLayer.add(circles[0]);
  collisionLayer.add(circles[1]);
  collisionLayer.add(circles[2]);
  collisionLayer.add(circles[3]);
}

function rotatePoint(pt, o, a){

  var angle = a * (Math.PI/180); // Convert to radians

  var rotatedX = Math.cos(angle) * (pt.x - o.x) - Math.sin(angle) * (pt.y - o.y) + o.x;

  var rotatedY = Math.sin(angle) * (pt.x - o.x) + Math.cos(angle) * (pt.y - o.y) + o.y;  

  return {x: rotatedX, y: rotatedY};

}

//Stopped here
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
createGrid();

var tr = new Konva.Transformer({
  resizeEnabled: false,
  rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
  rotationSnapTolerance: 30
});
/*
let rect1 = newRectangle(1, 3, 4, 2, layer, stage);
let rect2 = newRectangle(10, 3, 1, 5, layer, stage)
let rect3 = newRectangle(8, 8, 2, 1, layer, stage)

layer.add(rect1);
layer.add(rect2);
layer.add(rect3);
Cyril je slepý
*/
objectLayer.add(tr);
/*
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
*/
function haveIntersection(r1, r2) {
  return !(
    r2.x > r1.x + r1.width ||
    r2.x + r2.width < r1.x ||
    r2.y > r1.y + r1.height ||
    r2.y + r2.height < r1.y
  );
}

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
  if (!e.target.hasName('transformable')) return;

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
/*
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
/*
circles = [];
newPos = {x: 80, y: 100};
let circle = new Konva.Circle({x: newPos.x, y: newPos.y, radius: 10, fill: 'magenta'}) 
circles[0] = circle.clone();
circles[0].fill('lime')
collisionLayer.add(circles[0]);
circles[1] = circle.clone();
circles[1].fill('gold')
collisionLayer.add(circles[1]);
circles[2] = circle.clone();
circles[2].fill('blue')
collisionLayer.add(circles[2]);
circles[3] = circle.clone();
circles[3].fill('darkviolet')

collisionLayer.add(circles[3]);
*/