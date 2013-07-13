var chem = require("chem");
var Vec2d = chem.vec2d;

chem.onReady(function () {
    var canvas = document.getElementById("game");
    var engine = new chem.Engine(canvas);
    engine.on('update', function (dt, dx) {

    });
    engine.on('draw', function (context) {
        // clear canvas to black
        context.fillStyle = '#000000'
        context.fillRect(0, 0, engine.size.x, engine.size.y);

        // draw a little fps counter in the corner
        context.fillStyle = '#ffffff'
        engine.drawFps();
    });
    engine.start();
    canvas.focus();
});

