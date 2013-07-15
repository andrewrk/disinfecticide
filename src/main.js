var chem = require("chem");
var Vec2d = chem.vec2d.Vec2d;
var perlin = require('./perlin');
var Color = require('./color');
var commaIt = require('comma-it').commaIt;
var STREAMER_SPEED = 0.40;
var STREAMER_ARRIVE_THRESHOLD = 1;
var STREAMER_RADIUS = 12;
var STREAMER_MAX_PEOPLE = 1000;
var STREAMER_MIN_RESPAWN_TIME = 0.5; // min time between streamer events
var streamer_time_counter = 0;
var MAX_CONCURRENT_STREAMERS = 25;
var MAX_CELL_POPULATION = 10000;
var PLAGUE_KILL_RATE = 0.0025;
var PLAGUE_KILL_CONSTANT = 0.005;
var STREAMER_SCHEDULE_PROBABILITY = 0.00025;
var INFECT_CONSTANT = 0.000004;
var NUM_INITIAL_INFECTIONS = 4;

var GUN_RADIUS = 6;
var GUN_INFECT_KILL_RATE = 0.20;
var GUN_INFECT_KILL_CONSTANT = 20;
var GUN_HEALTHY_KILL_RATE = 0.04;
var GUN_HEALTHY_KILL_CONSTANT = 4;

var populationCenters = [];

var worldSize = new Vec2d(480, 480);
var worldPos = new Vec2d(240, 0);

var uiWeapons = [
  {
    name: "gun",
    crosshair: "crosshair",
    radius: GUN_RADIUS,
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
var selectedWeapon = null;

var stepCounter = 0;
var stepThreshold = 10;

var colorUninhabited   = new Color("#ffffff");
var colorHealthyAlive  = new Color("#ff83e9");
var colorInfectedAlive = new Color("#e13e3a");
var colorInfectedDead  = new Color("#008817");
var colorHealthyDead   = new Color("#585858");
var colorCasualties    = new Color("#ECBD1C");

var PIE_STAT_HEALTHY = 0;
var PIE_STAT_INFECTED = 1;
var PIE_STAT_DEAD = 2;
var PIE_STAT_CASUALTIES = 3;
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
  {
    name: "Casualties",
    color: colorCasualties.toString(),
    stat: 0,
  },
];

chem.onReady(function () {
  var canvas = document.getElementById("game");
  var engine = new chem.Engine(canvas);
  var batch = new chem.Batch();
  var streamers = [];
  var selectionSprite = new chem.Sprite('selection', {batch: batch, zOrder: 1});

  var screamingSound = new chem.Sound('sfx/screaming.ogg');
  var gunSound = new chem.Sound('sfx/gun.ogg');
  var explosionSound = new chem.Sound('sfx/boom.ogg');

  var imageData = engine.context.getImageData(worldPos.x, worldPos.x, worldSize.x, worldSize.y);
  var cells = initializeCells();

  initializeInfections();

  var currentCrosshair = null;
  var pieMargin = 10;
  var pieRadius = (worldPos.x - pieMargin * 2) / 2;
  var pieLoc = new Vec2d(pieMargin + pieRadius, engine.size.y - pieRadius - pieMargin);

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
    if (engine.buttonJustPressed(chem.button.MouseLeft)) {
      handleMouseLeft();
    }

    streamer_time_counter += dt;

    streamers.forEach(function(streamer) {
      if (streamer.deleted) return;
      streamer.pos.add(streamer.dir.scaled(STREAMER_SPEED));
      streamer.sprite.pos = streamer.pos.plus(worldPos);
      if (streamer.pos.distance(streamer.dest) < STREAMER_ARRIVE_THRESHOLD) {
        
        if (streamer.populationInfectedAlive > 0) {
          streamer.sprite.setAnimationName('biohazard');
          streamer.sprite.setFrameIndex(0);
        } else {
          // TODO: set a different, benign animation
          streamer.sprite.delete();
        }

        //streamer.dest.x, streamer.dest.y
        var destCell = cellAt(streamer.dest.x, streamer.dest.y);
        if (destCell.canInfect()) {
          destCell.addInfected(streamer.populationInfectedAlive);
          destCell.populationHealthyAlive += streamer.populationHealthyAlive;
          renderCell(destCell.index);
        }

        streamer.deleted = true;
        streamer.sprite.on('animationend', function() {
          streamer.sprite.delete();
        });
      }
    });

    stepCounter += 1;
    if (stepCounter > stepThreshold) {
      computePlagueSpread();
      updateCells();
      cullDeletedStreamers();

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

    drawStatsPieChart(context, pieLoc.x, pieLoc.y, pieRadius);

    var spotInfoSize = new Vec2d(pieRadius * 2, 90);
    var spotInfoLoc = pieLoc.offset(-pieRadius, -pieRadius - pieMargin - spotInfoSize.y);
    drawSpotInfo(context, spotInfoLoc, spotInfoSize);

    // draw a little fps counter in the corner
    context.fillStyle = '#000000'
    engine.drawFps();
  });
  engine.start();
  canvas.focus();

  function handleMouseLeft() {
    // selecting a weapon
    for (var i = 0; i < uiWeapons.length; ++i) {
      var uiWeapon = uiWeapons[i];
      if (uiWeapon.sprite.hitTest(engine.mousePos)) {
        selectWeapon(uiWeapon);
        return;
      }
    }
    if (selectedWeapon === 'gun') {
      shootGun();
    } else if (selectedWeapon === 'bomb') {
      shootBomb();
    }
  }

  function shootBomb() {
    var targetPos = engine.mousePos.minus(worldPos);

    var sprite = new chem.Sprite('drop-bomb', {
      batch: batch,
      pos: engine.mousePos.clone(),
    });
    sprite.once('animationend', function() {
      sprite.setAnimationName('hbombexplode');
      sprite.setFrameIndex(0);
      sprite.once('animationend', function() {
        sprite.delete();
      });
    });
  }

  function shootGun() {
    var targetPos = engine.mousePos.minus(worldPos);

    var casualties = 0;
    rasterCircle(targetPos.x, targetPos.y, GUN_RADIUS, function(x, y) {
      if (!inBounds(new Vec2d(x, y))) return;
      var cell = cellAt(x, y);

      var infectedKillAmt = Math.min(cell.populationInfectedAlive,
        cell.populationInfectedAlive * GUN_INFECT_KILL_RATE + GUN_INFECT_KILL_CONSTANT);
      cell.populationInfectedAlive -= infectedKillAmt;
      cell.populationHealthyDead += infectedKillAmt;
      pie[PIE_STAT_CASUALTIES].stat += infectedKillAmt;
      casualties += infectedKillAmt;

      var healthyKillAmt = Math.min(cell.populationHealthyAlive,
        cell.populationHealthyAlive * GUN_HEALTHY_KILL_RATE + GUN_HEALTHY_KILL_CONSTANT);
      cell.populationHealthyAlive -= healthyKillAmt;
      cell.populationHealthyDead += healthyKillAmt;
      pie[PIE_STAT_CASUALTIES].stat += healthyKillAmt;
      casualties += healthyKillAmt;

      renderCell(cellIndex(x, y));
    });

    // check if we killed any streamers
    var streamerKillCount = 0;
    streamers.forEach(function(streamer) {
      if (streamer.deleted) return;
      if (targetPos.distance(streamer.pos) < STREAMER_RADIUS) {
        streamerKillCount += 1;
        streamer.deleted = true;
        streamer.sprite.setAnimationName('explosion');
        streamer.sprite.setFrameIndex(0);
        streamer.sprite.on('animationend', function() {
          streamer.sprite.delete();
        });

        var streamerCell = cellAt(Math.floor(streamer.pos.x), Math.floor(streamer.pos.y));
        streamerCell.populationHealthyDead += (streamer.populationHealthyAlive + streamer.populationInfectedAlive);
        renderCell(streamerCell.index);
        casualties += streamer.populationHealthyAlive;
      }

      pie[PIE_STAT_CASUALTIES].stat += (streamer.populationHealthyAlive + streamer.populationInfectedAlive);
    });

    gunSound.play();
    if (casualties >= 1e-5) screamingSound.play();
  }

  function cullDeletedStreamers() {
    for (var i = 0; i < streamers.length; ++i) {
      if (streamers[i].deleted) {
        streamers.splice(i, 1);
        i -= 1;
      }
    }
  }

  function drawSpotInfo(context, pos, size) {
    var items = [];
    if (engine.mousePos.distance(pieLoc) < pieRadius) {
      pie.forEach(function(pieItem) {
        if (pieItem.stat >= 1) {
          items.push({
            color: pieItem.color,
            caption: pieItem.name + ": " + displayNumber(pieItem.stat),
          });
        }
      });
    } else {
      var relMousePos = engine.mousePos.minus(worldPos);
      if (! inBounds(relMousePos)) return;
      var cell = cellAt(relMousePos.x, relMousePos.y);
      if (cell.totalPopulation() === 0) {
        items.push({
          color: colorUninhabited.toString(),
          caption: "Uninhabited",
        });
      }
      if (cell.populationHealthyAlive >= 1) {
        items.push({
          color: colorHealthyAlive.toString(),
          caption: "Healthy: " + displayNumber(cell.populationHealthyAlive),
        });
      }
      if (cell.populationInfectedAlive >= 1) {
        items.push({
          color: colorInfectedAlive.toString(),
          caption: "Infected: " + displayNumber(cell.populationInfectedAlive),
        });
      }
      if (cell.populationHealthyDead >= 1) {
        items.push({
          color: colorHealthyDead.toString(),
          caption: "Dead: " + displayNumber(cell.populationHealthyDead),
        });
      }
      if (cell.populationInfectedDead >= 1) {
        items.push({
          color: colorInfectedDead.toString(),
          caption: "Rotting Corpses: " + displayNumber(cell.populationInfectedDead),
        });
      }
    }
    if (items.length === 0) return;
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
    return cells;
  }
  function renderAllCells() {
    for (var i = 0; i < cells.length; ++i) {
      renderCell(i);
    }
  }

  function initializeInfections() {
    centers = findHealthyPopulationCenters(10,10);
    
    // choose random centers to infect;
    var infectedIdx = new Array(NUM_INITIAL_INFECTIONS);
    for (var i=0; i<infectedIdx.length; i++) {
      infectedIdx[i] = Math.floor( Math.random() * centers.length );
      cells[centers[infectedIdx[i]]].infect(1);
    }

  }

  function findHealthyPopulationCenters(nx, ny) {
    // split into a grid, search maxes in each GridCell

    var gridWidth  = worldSize.x / nx;
    var gridHeight = worldSize.y / ny;

    var populationCenters = [];
    for (var i=0; i < nx; i++) {
      for (var j=0; j < ny; j++) {
        var maxHealthy = 0;
        var maxHealthyIdx = -1;

        for (var kx = Math.floor(gridWidth*i); kx < gridWidth*i + gridWidth-1; kx++) {
          for (var ky = Math.floor(gridHeight*j); ky < gridHeight*j + gridHeight-1; ky++) {
            var c = cellAt(kx,ky);
            if (c.populationHealthyAlive > maxHealthy && c.populationInfectedAlive <= 0) {
              maxHealthy = c.populationHealthyAlive;
              maxHealthyIdx = c.index;
            }
          }
        }

        if (maxHealthyIdx > 0) {
          populationCenters.push(maxHealthyIdx);
        }
      }
    }
    return populationCenters;
  }

  function renderCell(i) {
    var cell = cells[i];
    var index = i * 4;
    var density = 255 - (cell.density() * 255);
    var blendConstant = 0.2;

    if (cell.populationInfectedAlive >= 1) {
      imageData.data[index + 0] = Math.floor(density*blendConstant + colorInfectedAlive.red  *(1-blendConstant));
      imageData.data[index + 1] = Math.floor(density*blendConstant + colorInfectedAlive.green*(1-blendConstant));
      imageData.data[index + 2] = Math.floor(density*blendConstant + colorInfectedAlive.blue *(1-blendConstant));
    } else if (cell.populationInfectedDead >= 1) {
      imageData.data[index + 0] = Math.floor(density*blendConstant + colorInfectedDead.red*(1-blendConstant));
      imageData.data[index + 1] = Math.floor(density*blendConstant + colorInfectedDead.green*(1-blendConstant));
      imageData.data[index + 2] = Math.floor(density*blendConstant + colorInfectedDead.blue*(1-blendConstant));
    } else if (cell.populationHealthyAlive >= 1) {
      imageData.data[index + 0] = Math.floor(density*blendConstant + colorHealthyAlive.red  *(1-blendConstant));
      imageData.data[index + 1] = Math.floor(density*blendConstant + colorHealthyAlive.green*(1-blendConstant));
      imageData.data[index + 2] = Math.floor(density*blendConstant + colorHealthyAlive.blue *(1-blendConstant));
    } else if (cell.populationHealthyDead >= 1) {
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
    return cells[cellIndex(x, y)];
  }

  function cellIndex(x, y) {
    return y * worldSize.x + x;
  }

  function inBounds(v) {
    return v.x >= 0 && v.y >= 0 && v.x < worldSize.x && v.y < worldSize.y;
  }

  function setUpUi() {
    var margin = 10;
    var pos = new Vec2d(margin, margin);
    var right = worldPos.x - 2 * margin;
    for (var i = 0; i < uiWeapons.length; ++i) {
      var uiWeapon = uiWeapons[i];
      uiWeapon.sprite = new chem.Sprite(uiWeapon.name, {
        batch: batch,
        pos: pos.clone(),
      });
      pos.x += uiWeapon.sprite.size.x;

      if (pos.x + uiWeapon.sprite.size.x >= right) {
        pos.x = margin;
        pos.y += uiWeapon.sprite.size.y;
      }

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
    selectedWeapon = target.name;
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
    var i = 0;
    for (var y = 0; y < worldSize.y; ++y) {
      for (var x = 0; x < worldSize.x; ++x) {
        cells[i].justInfected = false;
        if (cells[i].computeUpdate()) renderCell(i);

        // Infected streamers
        if (streamer_time_counter > STREAMER_MIN_RESPAWN_TIME &&
            cells[i].populationInfectedAlive > 0.3 * cells[i].totalPopulation() &&
             Math.random() < STREAMER_SCHEDULE_PROBABILITY &&
             streamers.length < MAX_CONCURRENT_STREAMERS)
        {
          var healthyCenters = findHealthyPopulationCenters(50,50);
          var destIdx;
          if (healthyCenters.length > 0)
            destIdx = healthyCenters[ Math.floor( Math.random() * healthyCenters.length ) ];
          else { // no more healthy places? go to places that used to be... 
            var populationCenterIdx = Math.floor( Math.random() * populationCenters.length );
            destIdx = populationCenters[populationCenterIdx]
          }

          var destLoc = new Vec2d(destIdx%worldSize.x, Math.floor(destIdx/worldSize.x));
          var srcLoc = new Vec2d(x, y);

          var isHealthy = Math.random() < (cells[i].populationHealthyAlive / cells[i].totalPopulation());
          if (isHealthy) {
            var numHealthy = Math.min( cells[i].populationHealthyAlive, STREAMER_MAX_PEOPLE );
            cells[i].populationHealthyAlive -= numHealthy;
            var sprite = new chem.Sprite("car", { batch: batch });
            streamers.push(new Streamer(srcLoc, destLoc, sprite, numHealthy, 0.0));
          } else {
            var numInfected = Math.min( cells[i].populationInfectedAlive, STREAMER_MAX_PEOPLE );
            cells[i].populationInfectedAlive -= numInfected;
            var sprite = new chem.Sprite("infected-car", { batch: batch });
            streamers.push(new Streamer(srcLoc, destLoc, sprite, 0.0, numInfected));
          }

          renderCell(i);
          streamer_time_counter = 0;
        }

        i += 1;
      }
    }
  }

  function numHealthyInStreamers() {
    var totalHealthy = 0;
    for (var i=0; i<streamers.length; i++) {
      totalHealthy += streamers[i].populationHealthyAlive;
    }
    return totalHealthy;
  }

  function numInfectedInStreamers() {
    var totalInfected = 0;
    for (var i=0; i<streamers.length; i++) {
      totalInfected += streamers[i].populationInfectedAlive;
    }
    return totalInfected;
  }

  function computePlagueSpread() {
    pie[PIE_STAT_HEALTHY].stat = numHealthyInStreamers();
    pie[PIE_STAT_INFECTED].stat = numInfectedInStreamers();
    pie[PIE_STAT_DEAD].stat = -pie[PIE_STAT_CASUALTIES].stat;

    var i = 0;
    for (var y = 0; y < worldSize.y; ++y) {
      for (var x = 0; x < worldSize.x; ++x, ++i) {
        var cell = cells[i];
        pie[PIE_STAT_HEALTHY].stat += cell.populationHealthyAlive;
        pie[PIE_STAT_INFECTED].stat += cell.populationInfectedAlive;
        pie[PIE_STAT_DEAD].stat += cell.populationHealthyDead + cell.populationInfectedDead;

        if (!cell.isInfected()) continue;

        // so that we don't double count infections
        if (cell.justInfected) continue;

        // infect neighbors
        for (var dy = -1; dy <= 1; ++dy) {
          for (var dx = -1; dx <= 1; ++dx) {
            if (dx === 0 && dy === 0) continue;
            if (!inBounds(new Vec2d(x+dx, y+dy))) continue;
            var neighbor = cellAt(x+dx, y+dy);
            if (!neighbor.canInfect()) continue;

            neighbor.justInfected = neighbor.populationInfectedAlive === 0 && neighbor.populationInfectedDead === 0;
            var amount = Math.min(neighbor.populationHealthyAlive,
                (cell.populationInfectedAlive + cell.populationInfectedDead) * neighbor.populationHealthyAlive * INFECT_CONSTANT);
            neighbor.populationHealthyAlive -= amount;
            neighbor.populationInfectedAlive += amount;

            renderCell(cellIndex(x+dx, y+dy));
          }
        }
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
  var amountToKill = Math.min(PLAGUE_KILL_CONSTANT + PLAGUE_KILL_RATE * this.populationInfectedAlive, this.populationInfectedAlive);
  this.populationInfectedAlive -= amountToKill;
  this.populationHealthyDead += amountToKill;

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

Cell.prototype.addInfected = function(amount) {
  if (amount <= 0) return;
  this.populationInfectedAlive += amount;
  this.justInfected = true;
}

Cell.prototype.infect = function(amount) {
  var trueAmount = Math.min(amount, this.populationHealthyAlive);
  this.populationHealthyAlive -= trueAmount;
  this.populationInfectedAlive += trueAmount;
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

function Streamer(pos, dest, sprite, num_healthy, num_infected) {
  this.pos = pos;
  this.dest = dest;
  this.dir = this.dest.minus(this.pos).normalize();
  this.sprite = sprite;
  this.sprite.pos = pos.plus(worldPos);
  this.sprite.rotation = this.dir.angle();
  this.deleted = false;
  this.populationHealthyAlive = num_healthy;
  this.populationInfectedAlive = num_infected;
}

function displayNumber(n) {
  return commaIt(Math.floor(n), {thousandSeperator: ','});
}

