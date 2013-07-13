var chem = require("chem");
var Vec2d = chem.vec2d;
var perlin = require('./perlin');

chem.onReady(function () {
  var canvas = document.getElementById("game");
  var engine = new chem.Engine(canvas);
  var imageData = engine.context.getImageData(0, 0, engine.size.x, engine.size.y);
  var cells = initializeCells();
  renderAllCells();
  var brushRadius = 6;
  engine.on('update', function (dt, dx) {
    if (engine.buttonState(chem.button.MouseLeft)) {
      rasterCircle(engine.mousePos.x, engine.mousePos.y, brushRadius, function(x, y) {
        var cell = cellAt(x, y);
        if (cell == null) return;
        cell.population += dx * 0.1;
        renderCell(y * engine.size.x + x);
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
    context.fillStyle = '#000000'
    engine.drawFps();
  });
  engine.start();
  canvas.focus();
  canvas.style.cursor = "none";

  function initializeCells() {
    var noise = perlin.generatePerlinNoise(engine.size.x, engine.size.y, {
      octaveCount: 6,
      amplitude: 0.2,
      persistence: 0.24,
    });
    var cells = new Array(engine.size.x * engine.size.y);
    for (var i = 0; i < cells.length; ++i) {
      cells[i] = new Cell();
      var n = noise[i];
      if (n > 0.50) {
        cells[i].population = (n - 0.50) / 0.50;
      } else {
        cells[i].population = 0;
      }
    }
    return cells;
  }

  function renderAllCells() {
    for (var i = 0; i < cells.length; ++i) {
      renderCell(i);
    }
  }

  function renderCell(i) {
    var cell = cells[i];
    var index = i * 4;
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
  var xChange = 1 - (radius * 2);
  var yChange = 0;
  var radiusError = 0;

  var i;
  while(x >= y) {
    for (i = x0 - x; i <= x0 + x; ++i) {
      cb(i,  y + y0);
      cb(i, -y + y0);
    }
    for (i = x0 - y; i <= x0 + y; ++i) {
      cb(i,  x + y0);
      cb(i, -x + y0);
    }

    y++;
    radiusError += yChange;
    yChange += 2;
    if (radiusError * 2 + xChange > 0) {
      x--;
      radiusError += xChange;
      xChange += 2;
    }
  }
}

