var chem = require("chem");
var Vec2d = chem.vec2d;
var perlin = require('./perlin');
var Color = require('./color');
var STREAMER_SPEED = 0.20;
var STREAMER_ARRIVE_THRESHOLD = 1;
var MAX_CELL_POPULATION = 10000;
var PLAGUE_KILL_RATE = 5;
var STREAMER_SCHEDULE_PROBABILITY = 0.0005;

var populationCenters = [];

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

var stepCounter = 0;
var stepThreshold = 20;

var colorUninhabited = new Color("#ffffff");
var colorHealthyAlive = new Color("#ff83e9");
var colorInfectedAlive = new Color("#e13e3a");
var colorInfectedDead = new Color("#008817");
var colorHealthyDead = new Color("#585858");

var pie = [
  {
    name: "Healthy",
    color: colorHealthyAlive.toString(),
    stat: 0,
  },
  {
    name: "Infected",
    color: colorInfectedAlive.toString(),
    stat: 0,
  },
  {
    name: "Dead",
    color: colorHealthyDead.toString(),
    stat: 0,
  },
];

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
          cell.addHealthyPopulation( dx*0.1*MAX_CELL_POPULATION );
          renderCell(y * worldSize.x + x);
        }
      });
    }
    if (engine.buttonJustPressed(chem.button.MouseRight)) {
      var relPos = engine.mousePos.minus(worldPos);
      if (inBounds(relPos)) {
        var sprite = new chem.Sprite("car", { batch: batch });
        streamers.push(new Streamer(relPos, relPos.offset(200, 200), sprite));
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
        streamer.sprite.setAnimationName('explosion');
        streamer.sprite.setFrameIndex(0);

        //streamer.dest.x, streamer.dest.y
        var destCell = cellAt(streamer.dest.x, streamer.dest.y);
        if (destCell.canInfect()) {
          destCell.infect();
          renderCell(destCell.index);
          destCell.justInfected = false;
        }

        streamer.sprite.on('animationend', function() {
          streamer.deleted = true;
          streamer.sprite.delete();
        });
      }
    });

    stepCounter += 1;
    if (stepCounter > stepThreshold) {
      computePlagueSpread();
      updateCells();

      stepCounter -= stepThreshold;
    }

  });
  engine.on('draw', function (context) {
    // clear the part that isn't covered by putImageData
    context.fillStyle = "#e6e6e6";
    context.fillRect(0, 0, worldPos.x, engine.size.y);

    context.putImageData(imageData, worldPos.x, worldPos.y);

    // draw sprites
    engine.draw(batch);

    var pieMargin = 10;
    var pieRadius = (worldPos.x - pieMargin * 2) / 2;
    var pieLoc = chem.vec2d(pieMargin + pieRadius, engine.size.y - pieRadius - pieMargin);
    drawStatsPieChart(context, pieLoc.x, pieLoc.y, pieRadius);

    var spotInfoSize = chem.vec2d(pieRadius * 2, 50);
    var spotInfoLoc = pieLoc.offset(-pieRadius, -pieRadius - pieMargin - spotInfoSize.y);
    drawSpotInfo(context, spotInfoLoc, spotInfoSize);

    // draw a little fps counter in the corner
    context.fillStyle = '#000000'
    engine.drawFps();
  });
  engine.start();
  canvas.focus();

  function drawSpotInfo(context, pos, size) {
    var relMousePos = engine.mousePos.minus(worldPos);
    if (! inBounds(relMousePos)) return;
    var cell = cellAt(relMousePos.x, relMousePos.y);
    var items = [];
    if (cell.totalPopulation() === 0) {
      items.push({
        color: colorUninhabited.toString(),
        caption: "Uninhabited",
      });
    }
    if (cell.populationHealthyAlive > 0) {
      items.push({
        color: colorHealthyAlive.toString(),
        caption: "Healthy: " + Math.floor(cell.populationHealthyAlive),
      });
    }
    if (cell.populationInfectedAlive > 0) {
      items.push({
        color: colorInfectedAlive.toString(),
        caption: "Infected: " + Math.floor(cell.populationInfectedAlive),
      });
    }
    if (cell.populationHealthyDead > 0) {
      items.push({
        color: colorHealthyDead.toString(),
        caption: "Dead: " + Math.floor(cell.populationHealthyDead),
      });
    }
    if (cell.populationInfectedDead > 0) {
      items.push({
        color: colorInfectedDead.toString(),
        caption: "Rotting Corpses: " + Math.floor(cell.populationInfectedDead),
      });
    }
    var margin = 4;
    var boxSize = 16;
    var y = pos.y + margin;
    items.forEach(function(item) {
      context.beginPath();
      context.rect(pos.x + margin, y, boxSize, boxSize);
      context.closePath();
      context.fillStyle = item.color;
      context.fill();
      context.strokeStyle = "#000000";
      context.lineWidth = 1;
      context.stroke();

      context.font = "13pt Arial";
      context.textAlign = "left";
      context.fillStyle = "#000000";
      context.fillText(item.caption, pos.x + margin + boxSize + margin, y + boxSize);

      y += boxSize + margin;
    });
    context.beginPath();
    context.rect(pos.x, pos.y, size.x, size.y);
    context.closePath();
    context.strokeStyle = "#000000";
    context.lineWidth = 2;
    context.stroke();
  }

  function drawStatsPieChart(context, x, y, radius) {
    var total = 0;
    var i;
    for (i = 0; i < pie.length; ++i) {
      total += pie[i].stat;
    }
    var r = 0;
    for (i = 0; i < pie.length; ++i) {
      var amt = pie[i].stat / total;
      var newR = r + amt * Math.PI * 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(r) * radius, y + Math.sin(r) * radius);
      context.arc(x, y, radius, r, newR);
      context.lineTo(x, y);
      context.closePath();
      context.fillStyle = pie[i].color;
      context.fill();
      context.strokeStyle = "#000000";
      context.lineWidth = 1;
      context.stroke();
      r = newR;
    }


    // outline
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI, false);
    context.closePath();
    context.strokeStyle = "#000000";
    context.lineWidth = 2;
    context.stroke();
  }

  function initializeCells() {
    var noise = perlin.generatePerlinNoise(worldSize.x, worldSize.y, {
      octaveCount: 6,
      amplitude: 0.2,
      persistence: 0.24,
    });
    var cells = new Array(worldSize.x * worldSize.y);
    for (var i = 0; i < cells.length; ++i) {
      cells[i] = new Cell(i);
      var n = noise[i];
      if (n > 0.70) {
        cells[i].addHealthyPopulation( ((n-0.7)/0.3)*MAX_CELL_POPULATION );
        
        // staticly initialize targets for streamers to try and go to
        if (n > 0.80) {
          populationCenters.push(i);
        }
      }
    }

    // infect some pixels to start with
    var startInfectCount = 2;
    // break the world into startInfectCount chunks and put a random
    // infection in every chunk
    var chunkHeight = worldSize.y / startInfectCount;
    for (i = 0; i < startInfectCount; ++i) {
      var x = Math.floor(chunkHeight*Math.random() + i * chunkHeight);
      var y = Math.floor(worldSize.x*Math.random());
      var searchIdx = x * worldSize.x + y;
      while (!cells[searchIdx].canInfect() || cells[searchIdx].density() < 0.90) {
        searchIdx = (searchIdx + 1) % cells.length;
      }
      cells[searchIdx].infect();
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
    var density = 255 - (cell.density() * 255);
    var blendConstant = 0.5;

    if (cell.populationInfectedAlive > 0) {
      imageData.data[index + 0] = Math.floor(density*blendConstant + colorInfectedAlive.red  *(1-blendConstant));
      imageData.data[index + 1] = Math.floor(density*blendConstant + colorInfectedAlive.green*(1-blendConstant));
      imageData.data[index + 2] = Math.floor(density*blendConstant + colorInfectedAlive.blue *(1-blendConstant));
    } else if (cell.populationInfectedDead > 0) {
      imageData.data[index + 0] = Math.floor(density*blendConstant + colorInfectedDead.red*(1-blendConstant));
      imageData.data[index + 1] = Math.floor(density*blendConstant + colorInfectedDead.green*(1-blendConstant));
      imageData.data[index + 2] = Math.floor(density*blendConstant + colorInfectedDead.blue*(1-blendConstant));
    } else if (cell.populationHealthyAlive > 0) {
      imageData.data[index + 0] = Math.floor(density*blendConstant + colorHealthyAlive.red  *(1-blendConstant));
      imageData.data[index + 1] = Math.floor(density*blendConstant + colorHealthyAlive.green*(1-blendConstant));
      imageData.data[index + 2] = Math.floor(density*blendConstant + colorHealthyAlive.blue *(1-blendConstant));
    } else if (cell.populationHealthyDead > 0) {
      imageData.data[index + 0] = Math.floor(density*blendConstant + colorHealthyDead.red  *(1-blendConstant));
      imageData.data[index + 1] = Math.floor(density*blendConstant + colorHealthyDead.green*(1-blendConstant));
      imageData.data[index + 2] = Math.floor(density*blendConstant + colorHealthyDead.blue *(1-blendConstant));
    } else {
      imageData.data[index + 0] = density; // red
      imageData.data[index + 1] = density; // green
      imageData.data[index + 2] = density; // blue
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

  function updateCells() {
    for (var i = 0; i < cells.length; ++i) {
      cells[i].justInfected = false;
      if (cells[i].computeUpdate()) renderCell(i);

      // Streamer logic
      if (cells[i].populationInfectedDead > 0.2 * cells[i].totalPopulation() &&
          Math.random() < STREAMER_SCHEDULE_PROBABILITY)
      {
        var sprite = new chem.Sprite("car", { batch: batch });

        var populationCenterIdx = Math.floor( Math.random() * populationCenters.length );
        var destIdx = populationCenters[populationCenterIdx]

        // var y = Math.floor(i/worldSize.x);
        // var x = i%worldSize.x;
        var destLoc = new Vec2d(destIdx%worldSize.x, Math.floor(destIdx/worldSize.x));
        var srcLoc = new Vec2d(i%worldSize.x, Math.floor(i/worldSize.x));
        streamers.push(new Streamer(srcLoc, destLoc, sprite));
    }


    }

  }

  function computePlagueSpread() {
    pie[0].stat = 0;
    pie[1].stat = 0;
    pie[2].stat = 0;
    var i;
    for (i = 0; i < cells.length; ++i) {
      var y = Math.floor(i/worldSize.x);
      var x = i%worldSize.x;

      pie[0].stat += cells[i].populationHealthyAlive;
      pie[1].stat += cells[i].populationInfectedAlive;
      pie[2].stat += cells[i].populationHealthyDead + cells[i].populationInfectedDead;

      if (!cells[i].isInfected()) continue;

      // so that we don't double count infections 
      if (cells[i].justInfected) continue;

      // add as a potential source of streamer
      

      // four neighbors
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

      // rest of the "nine" neighbors
      // bottom right
      if (x < (worldSize.x-1) && y < (worldSize.y-1) && cellAt(x+1,y+1).canInfect()) {
        cellAt(x+1,y+1).infect();
        renderCell(i+worldSize.x+1);
      }

      // bottom left
      if (x > 0 && y < (worldSize.y-1) && cellAt(x-1,y+1).canInfect()) {
        cellAt(x-1,y+1).infect();
        renderCell(i+worldSize.x-1);
      }

      // top left
      if (x > 0 && y > 0 && cellAt(x-1,y-1).canInfect()) {
        cellAt(x-1,y-1).infect();
        renderCell(i-worldSize.x-1);
      }

      // top right
      if (x < (worldSize.x-1) && y > 0 && cellAt(x+1,y-1).canInfect()) {
        cellAt(x+1,y-1).infect();
        renderCell(i-worldSize.x+1);
      }
    }
  }
});

function Cell(idx) {
  this.populationHealthyAlive = 0;
  this.populationInfectedAlive = 0;
  this.populationHealthyDead = 0;
  this.populationInfectedDead = 0;
  this.index = idx;

  this.justInfected = false;
}

Cell.prototype.computeUpdate = function() {
  if (!this.isInfected()) return;

  // DIE FATAL LETHAL!!!
  var amountToKill = Math.min(PLAGUE_KILL_RATE, this.populationInfectedAlive);
  this.populationInfectedAlive -= amountToKill;
  this.populationInfectedDead += amountToKill;

  // return true if redraw needed
  return amountToKill > 0;
}

Cell.prototype.density = function() {
  return this.totalPopulation() / MAX_CELL_POPULATION;
};

Cell.prototype.totalPopulation = function() {
  return this.populationHealthyAlive + this.populationInfectedAlive +
    this.populationHealthyDead + this.populationInfectedDead;
};

Cell.prototype.addHealthyPopulation = function(population) {
  this.populationHealthyAlive += population;
  if (this.totalPopulation() > MAX_CELL_POPULATION) {
    this.populationHealthyAlive -= this.totalPopulation() - MAX_CELL_POPULATION;
  }
}

Cell.prototype.canInfect = function() {
  return this.populationHealthyAlive > 0;
}

Cell.prototype.isInfected = function() {
  return this.populationInfectedAlive > 0;
}

Cell.prototype.infect = function() {
  this.populationInfectedAlive = this.populationHealthyAlive;
  this.populationHealthyAlive = 0;
  this.justInfected = true;
}

Cell.prototype.setPopulation = function(healthy_ppl) {
  this.populationHealthyAlive = healthy_ppl;
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

function Streamer(pos, dest, sprite) {
  this.pos = pos;
  this.dest = dest;
  this.dir = this.dest.minus(this.pos).normalize();
  this.sprite = sprite;
  this.sprite.pos = pos.plus(worldPos);
  this.sprite.rotation = this.dir.angle();
  this.deleted = false;
}
