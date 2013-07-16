// the main source file which depends on the rest of your source files.
exports.main = 'src/main';

exports.spritesheet = {
  defaults: {
    delay: 0.05,
    loop: true,
    // possible values: a Vec2d instance, or one of:
    // ["center", "topleft", "topright", "bottomleft", "bottomright",
    //  "top", "right", "bottom", "left"]
    anchor: "center"
  },
  animations: {
    explosion: {
      loop: false,
    },
    car: {},
    'infected-car': {
      delay: 0.1,
    },
    x: {},
    bomb: {
      frames: "bomb.png",
      anchor: "topleft",
    },
    'drop-bomb': {
      loop: false,
    },
    'hbombexplode': {
      anchor: 'bottom',
      loop: false,
      delay: 0.1,
    },
    wall: {
      anchor: "topleft",
    },
    gun: {
      anchor: "topleft",
    },
    disinfecticide: {
      anchor: "topleft",
    },
    curebomb: {
      anchor: "topleft",
    },
    selection: {
      anchor: "topleft",
      loop: true,
      delay: 0.1,
    },
    crosshair: {},
    'bomb-crosshair': {},
    'ch-disinfecticide': {},
    biohazard: {
      loop: false,
    },
    capital: {
    },
  }
};
