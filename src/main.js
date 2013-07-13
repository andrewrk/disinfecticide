var chem = require("chem");
var Vec2d = chem.vec2d;

chem.onReady(function () {
  var canvas = document.getElementById("game");
  var engine = new chem.Engine(canvas);
  var imageData = engine.context.getImageData(0, 0, engine.size.x, engine.size.y);
  var cells = initializeCells();
  var brushRadius = 6;
  engine.on('update', function (dt, dx) {
    if (engine.buttonState(chem.button.MouseLeft)) {
      rasterCircle(engine.mousePos.x, engine.mousePos.y, brushRadius, function(x, y) {
        var cell = cellAt(x, y);
        cell.population += dx * 0.1;
        renderCell(cell, x, y);
      });
    }
  });
  engine.on('draw', function (context) {
    // clear canvas to black
    context.fillStyle = '#000000'
    context.fillRect(0, 0, engine.size.x, engine.size.y);

    context.putImageData(imageData, 0, 0);

    // draw circle where mouse is
    context.strokeStyle = '#000000';
    context.beginPath();
    context.arc(engine.mousePos.x, engine.mousePos.y, brushRadius, 0, 2 * Math.PI, false);
    context.closePath();
    context.stroke();

    // draw a little fps counter in the corner
    context.fillStyle = '#ffffff'
    engine.drawFps();
  });
  engine.start();
  canvas.focus();
  canvas.style.cursor = "none";

  function initializeCells() {
    var cells = new Array(engine.size.x * engine.size.y);
    for (var i = 0; i < cells.length; ++i) {
      cells[i] = new Cell();
    }
    return cells;
  }

  function renderCell(cell, x, y) {
    debugger
    var index = (imageData.width * y + x) * 4;
    var value = 255 - (cell.population * 255);
    imageData.data[index + 0] = value; // red
    imageData.data[index + 1] = value; // green
    imageData.data[index + 2] = value; // blue
    imageData.data[index + 3] = 255;   // alpha
  }

  function cellAt(x, y) {
    return cells[y * engine.size.x + x];
  }
});

function Cell() {
  this.population = 0;
}

function rasterCircle(x0, y0, radius, cb) {
  var x = radius;
  var y = 0;
  var radiusError = 1 - x;

  while (x >= y) {
    cb( x + x0,  y + y0);
    cb( y + x0,  x + y0);
    cb(-x + x0,  y + y0);
    cb(-y + x0,  x + y0);
    cb(-x + x0, -y + y0);
    cb(-y + x0, -x + y0);
    cb( x + x0, -y + y0);
    cb( y + x0, -x + y0);

    y += 1;
    if (radiusError < 0) {
      radiusError += 2 * y + 1;
    } else {
      x -= 1;
      radiusError += 2 * (y - x + 1);
    }
  }
}
