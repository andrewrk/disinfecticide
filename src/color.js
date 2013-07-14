var zfill = require('zfill');

module.exports = Color;

function Color(nameOrRed, green, blue) {
  if (green != null) {
    this.red = nameOrRed;
    this.green = green;
    this.blue = blue;
  } else {
    if (nameOrRed[0] === "#") nameOrRed = nameOrRed.substring(1);
    this.red   = parseInt(nameOrRed.substring(0, 2), 16);
    this.green = parseInt(nameOrRed.substring(2, 4), 16);
    this.blue  = parseInt(nameOrRed.substring(4, 6), 16);
  }
}

Color.prototype.toString = function() {
  return "#" + zfill(this.red.toString(16), 2) +
    zfill(this.green.toString(16), 2) +
    zfill(this.blue.toString(16), 2);
};
