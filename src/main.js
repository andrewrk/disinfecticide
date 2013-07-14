var chem = require("chem");
var Vec2d = chem.vec2d;
var perlin = require('./perlin');
var STREAMER_SPEED = 0.001;
var STREAMER_ARRIVE_THRESHOLD = 1;
var MAX_POPULATION = 10000;

var worldSize = chem.vec2d(480, 480);
var worldPos = chem.vec2d(240, 0);

var uiWeapons = [
  {
    name: "gun",
    crosshair: "crosshair",
    radius: 6,
  },
  {
    name: "bomb",
    crosshair: "bomb-crosshair",
    radius: 30,
  },
  {
    name: "wall",
    crosshair: null,
  },
  {
    name: "disinfecticide",
    crosshair: 'ch-disinfecticide',
    radius: 30,
  },
  {
    name: "curebomb",
    crosshair: null,
  },
];

var timeCounter = 0;
var timeThresh  = 0.001;

chem.onReady(function () {
  var canvas = document.getElementById("game");
  var engine = new chem.Engine(canvas);
  var batch = new chem.Batch();
  var streamers = [];
  var selectionSprite = new chem.Sprite('selection', {batch: batch, zOrder: 1});

  var imageData = engine.context.getImageData(worldPos.x, worldPos.x, worldSize.x, worldSize.y);
  var cells = initializeCells();
  var currentCrosshair = null;
  renderAllCells();
  setUpUi();
  selectWeapon(uiWeapons[0]);
  engine.on('mousemove', function() {
    var showCursor = engine.mousePos.x < worldPos.x || currentCrosshair == null;
    canvas.style.cursor = showCursor ? "default" : "none";
    if (currentCrosshair != null) {
      currentCrosshair.pos = engine.mousePos;
      currentCrosshair.setVisible(!showCursor);
    }
  });
  engine.on('update', function (dt, dx) {
    if (engine.buttonState(chem.button.MouseLeft)) {
      rasterCircle(engine.mousePos.x - worldPos.x, engine.mousePos.y - worldPos.y, 30, function(x, y) {
        if (inBounds(chem.vec2d(x, y))) {
          var cell = cellAt(x, y);
          //cell.population += dx * 0.1;
          cell.addHealthyPopulation( dx*0.1*MAX_POPULATION );
          renderCell(y * worldSize.x + x);
        }
      });
    }
    if (engine.buttonJustPressed(chem.button.MouseRight)) {
      var relPos = engine.mousePos.minus(worldPos);
      if (inBounds(relPos)) {
        var sprite = new chem.Sprite("car", { batch: batch });
        var xSprite = new chem.Sprite("x", { batch: batch });
        streamers.push(new Streamer(relPos, relPos.offset(200, 200), sprite, xSprite));
      }
    }
    if (engine.buttonJustPressed(chem.button.MouseLeft)) {
      for (var i = 0; i < uiWeapons.length; ++i) {
        var uiWeapon = uiWeapons[i];
        if (uiWeapon.sprite.hitTest(engine.mousePos)) {
          selectWeapon(uiWeapon);
          break;
        }
      }
    }
    streamers.forEach(function(streamer) {
      if (streamer.deleted) return;
      streamer.pos.add(streamer.dir.scaled(STREAMER_SPEED));
      streamer.sprite.pos = streamer.pos.plus(worldPos);
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

    timeCounter += dt;
    if (timeCounter > timeThresh) {
      computePlagueSpread();
      timeCounter = 0;
    }

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
      context.moveTo(streamer.sprite.pos.x, streamer.sprite.pos.y);
      context.lineTo(streamer.xSprite.pos.x, streamer.xSprite.pos.y);
      context.closePath()
      context.stroke();
    });

    // draw sprites
    engine.draw(batch);

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
      if (n > 0.70) {
        cells[i].addHealthyPopulation( ((n-0.7)/0.3)*MAX_POPULATION );
      } 
    }

    // infect a pixel near the center to start us off
    var searchIdx = Math.floor(worldSize.y/2) * worldSize.x + Math.floor(worldSize.x/2);
    while (searchIdx < cells.length && !cells[searchIdx].canInfect()) {
      searchIdx++;
      continue;
    }
    cells[searchIdx].infect();

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
    var value = 255 - (cell.populationHealthyAlive / MAX_POPULATION)*255;

    if (cell.isInfected()) {
      var blendConstant = 0.5;
      imageData.data[index + 0] = Math.floor(value*blendConstant + 255*(1-blendConstant));
      imageData.data[index + 1] = Math.floor(value*blendConstant);
      imageData.data[index + 2] = Math.floor(value*blendConstant);
    } else {
      imageData.data[index + 0] = value; // red
      imageData.data[index + 1] = value; // green
      imageData.data[index + 2] = value; // blue
    }
    imageData.data[index + 3] = 255;   // alpha
  }

  function cellAt(x, y) {
    return cells[y * worldSize.x + x];
  }

  function inBounds(v) {
    return v.x >= 0 && v.y >= 0 && v.x < worldSize.x && v.y < worldSize.y;
  }

  function setUpUi() {
    var pos = chem.vec2d(10, 10);
    for (var i = 0; i < uiWeapons.length; ++i) {
      var uiWeapon = uiWeapons[i];
      uiWeapon.sprite = new chem.Sprite(uiWeapon.name, {
        batch: batch,
        pos: pos.clone(),
      });
      pos.y += uiWeapon.sprite.size.y;

      if (uiWeapon.crosshair) {
        uiWeapon.crosshairSprite = new chem.Sprite(uiWeapon.crosshair, {
          batch: batch,
          zOrder: 1,
          visible: false,
        });
      }
    }
  }
  function selectWeapon(target) {
    uiWeapons.forEach(function(uiWeapon) {
      uiWeapon.selected = false;
    });
    target.selected = true;
    selectionSprite.pos = target.sprite.pos;
    selectionSprite.setFrameIndex(0);
    if (currentCrosshair != null) {
      currentCrosshair.setVisible(false);
    }
    currentCrosshair = target.crosshairSprite;
    if (currentCrosshair != null) {
      currentCrosshair.scale.x = (target.radius * 2) / currentCrosshair.size.x;
      currentCrosshair.scale.y = (target.radius * 2) / currentCrosshair.size.y;
    }
  }

  function computePlagueSpread() {

    for (var i = 0; i < cells.length; ++i) {
      var y = Math.floor(i/worldSize.x);
      var x = i%worldSize.x;

      if (!cells[i].isInfected()) continue;

      // hack to not double count
      if (cells[i].justInfected) {
        cells[i].justInfected = false;
        continue;
      }

      if (y > 0 && cellAt(x,y-1).canInfect()) {
        cellAt(x,y-1).infect();
        renderCell(i-worldSize.x);
      }

      if (y < (worldSize.y-1) && cellAt(x,y+1).canInfect()) {
        cellAt(x,y+1).infect();
        renderCell(i+worldSize.x);
      }

      if (x > 0 && cellAt(x-1,y).canInfect()) {
        cellAt(x-1,y).infect();
        renderCell(i-1);
      }

      if (x < (worldSize.x-1) && cellAt(x+1,y).canInfect()) {
        cellAt(x+1,y).infect();
        renderCell(i+1);
      }
    }
  }
});

function Cell() {
  this.population = 0;

  this.populationHealthyAlive = 0;
  this.populationInfectedAlive = 0;
  this.populationHealthyDead = 0;
  this.populationInfectedDead = 0;

  this.justInfected = false;
}

Cell.prototype.addHealthyPopulation = function(population) {
  this.populationHealthyAlive += population;
}

Cell.prototype.canInfect = function() {
  return this.populationHealthyAlive > 0;
}

Cell.prototype.isInfected = function() {
  if (this.populationInfectedAlive > 0) return true;
  else return false;
}

Cell.prototype.infect = function() {
  this.populationInfectedAlive = this.populationHealthyAlive;
  this.populationHealthyAlive = 0;
  this.justInfected = true;
}

Cell.prototype.setPopulation = function(healthy_ppl) {
  this.population = healthy_ppl;
  this.populationHealthyAlive = this.population;
  this.populationInfectedAlive = 0;
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
  this.sprite.pos = pos.plus(worldPos);
  this.sprite.rotation = this.dir.angle();
  this.deleted = false;
  this.xSprite = xSprite;
  this.xSprite.pos = dest.plus(worldPos);
  this.xSprite.rotation = this.dir.angle();
}
