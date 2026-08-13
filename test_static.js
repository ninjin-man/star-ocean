const fs = require('fs');
const assert = require('assert');
const { PNG } = require('pngjs');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const image = PNG.sync.read(fs.readFileSync('assets/bartz_battle_native_16x24.png'));

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const referencedIds = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
for (const id of referencedIds) assert(htmlIds.has(id), `missing element #${id}`);

let opaque = 0;
for (let i = 3; i < image.data.length; i += 4) if (image.data[i]) opaque++;
assert.strictEqual(image.width, 16);
assert.strictEqual(image.height, 24);
assert.strictEqual(opaque, 269);
assert(html.includes('<title>Pixel Mask Part Editor</title>'));
assert(css.includes('env(safe-area-inset-bottom)'));
assert(js.includes("localStorage.setItem(STORAGE_KEY"));
assert(js.includes("a.download='character_parts.zip'"));
assert(html.includes('data-tool="eyedrop"'));
assert(js.includes('eyedropAdjacentSameColor'));
console.log(`static tests: pass (${referencedIds.size} UI bindings, ${opaque} source pixels)`);
