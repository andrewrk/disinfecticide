var chem = require("chem");
var Vec2d = chem.vec2d;
var perlin = require('./perlin');
var STREAMER_SPEED = 0.001;
var BRUSH_RADIUS = 6;
var STREAMER_ARRIVE_THRESHOLD = 1;

var worldSize = chem.vec2d(480, 480);
var worldPos = chem.vec2d(240, 0);

var weapons = [
  { name: "gun"},
  { name: "bomb"},
  { name: "wall"},
  { name: "disinfecticide"},
  { name: "curebomb"},
];

chem.onReady(function () {
  var canvas = document.getElementById("game");
  var engine = new chem.Engine(canvas);
  var batch = new chem.Batch();
  var streamers = [];

  var imageData = engine.context.getImageData(worldPos.x, worldPos.x, worldSize.x, worldSize.y);
  var cells = initializeCells();
  renderAllCells();
  setUpUi();
  engine.on('mousemove', function() {
    var showCursor = engine.mousePos.x < worldPos.x;
    canvas.style.cursor = showCursor ? "default" : "none";
  });
  engine.on('update', function (dt, dx) {
    if (engine.buttonState(chem.button.MouseLeft)) {
      rasterCircle(engine.mousePos.x - worldPos.x, engine.mousePos.y - worldPos.y, BRUSH_RADIUS, function(x, y) {
        if (inBounds(x, y)) {
          var cell = cellAt(x, y);
          cell.population += dx * 0.1;
          renderCell(y * worldSize.x + x);
        }
      });
    }
    if (engine.buttonJustPressed(chem.button.MouseRight)) {
      var sprite = new chem.Sprite("car", { batch: batch });
      var xSprite = new chem.Sprite("x", { batch: batch });
      streamers.push(new Streamer(engine.mousePos.minus(worldPos), engine.mousePos.minus(worldPos).offset(200, 200), sprite, xSprite));
    }
    streamers.forEach(function(streamer) {
      if (streamer.deleted) return;
      streamer.pos.add(streamer.dir.scaled(STREAMER_SPEED));
      if (streamer.pos.distance(streamer.dest) < STREAMER_ARRIVE_THRESHOLD) {
        streamer.xSprite.delete();
        streamer.sprite.setAnimationName('explosion');
        streamer.sprite.setFrameIndex(0);
        streamer.sprite.on('animationend', function() {
          streamer.deleted = true;
          streamer.sprite.delete();
        });
      }
    });
  });
  engine.on('draw', function (context) {
    // clear the part that isn't covered by putImageData
    context.fillStyle = "#e6e6e6";
    context.fillRect(0, 0, worldPos.x, engine.size.y);

    context.putImageData(imageData, worldPos.x, worldPos.y);

    // draw lines from streamers to their destinations
    context.strokeStyle = "#ff0000";
    streamers.forEach(function(streamer) {
      if (streamer.deleted) return;
      context.beginPath()
      context.moveTo(streamer.pos.x, streamer.pos.y);
      context.lineTo(streamer.dest.x, streamer.dest.y);
      context.closePath()
      context.stroke();
    });

    // draw sprites
    engine.draw(batch);

    if (engine.mousePos.x > worldPos.x) {
      // draw circle where mouse is
      context.strokeStyle = '#000000';
      context.beginPath();
      context.arc(engine.mousePos.x, engine.mousePos.y, BRUSH_RADIUS, 0, 2 * Math.PI, false);
      context.closePath();
      context.stroke();
    }

    // draw a little fps counter in the corner
    context.fillStyle = '#000000'
    engine.drawFps();
  });
  engine.start();
  canvas.focus();

  function initializeCells() {
    var noise = perlin.generatePerlinNoise(worldSize.x, worldSize.y, {
      octaveCount: 6,
      amplitude: 0.2,
      persistence: 0.24,
    });
    var cells = new Array(worldSize.x * worldSize.y);
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
    return cells[y * worldSize.x + x];
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < worldSize.x && y < worldSize.y;
  }

  function setUpUi() {
    var pos = chem.vec2d(10, 10);
    for (var i = 0; i < weapons.length; ++i) {
      weapons[i].sprite = new chem.Sprite(weapons[i].name, {
        batch: batch,
        pos: pos.clone(),
      });
      pos.y += weapons[i].sprite.size.y;
    }
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

function Streamer(pos, dest, sprite, xSprite) {
  this.pos = pos;
  this.dest = dest;
  this.dir = this.dest.minus(this.pos);
  this.sprite = sprite;
  this.sprite.pos = pos;
  this.sprite.rotation = this.dir.angle();
  this.deleted = false;
  this.xSprite = xSprite;
  this.xSprite.pos = dest;
  this.xSprite.rotation = this.dir.angle();
}
