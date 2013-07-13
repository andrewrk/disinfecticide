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
    var x = 0, y = 0;
    for (var i = 0; i < cells.length; ++i) {
      cells[i] = new Cell();
      renderCell(cells[i], x, y);
      x += 1;
      if (x >= engine.size.x) {
        x = 0;
        y += 1;
      }
    }
    return cells;
  }

  function renderCell(cell, x, y) {
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
  var f = 1 - radius;
  var ddF_x = 1;
  var ddF_y = -2 * radius;
  var x = 0;
  var y = radius;

  cb(x0, y0 + radius);
  cb(x0, y0 - radius);
  cb(x0 + radius, y0);
  cb(x0 - radius, y0);

  while(x < y) {
    // ddF_x == 2 * x + 1;
    // ddF_y == -2 * y;
    // f == x*x + y*y - radius*radius + 2*x - y + 1;
    if(f >= 0) {
      y--;
      ddF_y += 2;
      f += ddF_y;
    }
    x++;
    ddF_x += 2;
    f += ddF_x;
    cb(x0 + x, y0 + y);
    cb(x0 - x, y0 + y);
    cb(x0 + x, y0 - y);
    cb(x0 - x, y0 - y);
    cb(x0 + y, y0 + x);
    cb(x0 - y, y0 + x);
    cb(x0 + y, y0 - x);
    cb(x0 - y, y0 - x);
  }
}
