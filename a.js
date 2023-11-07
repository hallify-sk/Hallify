var width = window.innerWidth;
var height = window.innerHeight;

var stage = new Konva.Stage({
  container: "container",
  width: width,
  height: height,
});

var layer = new Konva.Layer();
stage.add(layer);

function createShape() {
  var group = new Konva.Group({
    x: Math.random() * width,
    y: Math.random() * height,
    draggable: true,
  });
  var shape = new Konva.Rect({
    width: 30 + Math.random() * 30,
    height: 30 + Math.random() * 30,
    fill: "grey",
    rotation: 360 * Math.random(),
    name: "fillShape",
  });
  group.add(shape);

  var boundingBox = shape.getClientRect({ relativeTo: group });

  var box = new Konva.Rect({
    x: boundingBox.x,
    y: boundingBox.y,
    width: boundingBox.width,
    height: boundingBox.height,
    stroke: "red",
    strokeWidth: 1,
  });
  group.add(box);
  return group;
}

for (var i = 0; i < 10; i++) {
  layer.add(createShape());
}
layer.on("dragmove", function (e) {
  var target = e.target;
  var targetRect = e.target.getClientRect();
  layer.children.forEach(function (group) {
    // do not check intersection with itself
    if (group === target) {
      return;
    }
    if (haveIntersection(group.getClientRect(), targetRect)) {
      group.findOne(".fillShape").fill("red");
    } else {
      group.findOne(".fillShape").fill("grey");
    }
  });
});

function haveIntersection(r1, r2) {
  return !(
    r2.x > r1.x + r1.width ||
    r2.x + r2.width < r1.x ||
    r2.y > r1.y + r1.height ||
    r2.y + r2.height < r1.y
  );
}
