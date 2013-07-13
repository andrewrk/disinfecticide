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
    x: {},
    bomb: {
      anchor: "topleft",
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
  }
};
