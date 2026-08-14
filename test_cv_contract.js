const assert = require('assert');
require('./cv-engine.js');
const engine = global.PixelMaskCV;
assert(engine, 'PixelMaskCV must be exported');
for (const name of ['ready','adjacentColor','orphanRegions','contour','morphology']) {
  assert.strictEqual(typeof engine[name], 'function', `missing CV engine method: ${name}`);
}
console.log('opencv adapter contract: pass (browser runtime review pending)');
