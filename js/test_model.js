const assert = require('assert');
const M = require('./model.js');
const alpha = Uint8Array.from([255,255,0,255]);
const a = M.createAssignments(alpha);
assert.deepStrictEqual(Array.from(a),[-1,-1,-2,-1]);
assert.strictEqual(M.assign(a,2,0),false);
assert.strictEqual(M.assign(a,0,1),true);
assert.deepStrictEqual(M.stats(a),{assigned:1,unassigned:2,transparent:1,overlap:0,diff:2});
const rgba=Uint8ClampedArray.from([1,2,3,255,1,2,3,255,0,0,0,0,9,9,9,255]);
assert.strictEqual(M.floodSameColor(a,rgba,2,2,1,2),1);
assert.deepStrictEqual(M.validate(a),{assigned:2,unassigned:1,transparent:1,overlap:0,diff:1,exportReady:false});
M.assign(a,3,0);
assert.strictEqual(M.validate(a).exportReady,true);

// 同色スポイトは既存の割当をまたいで、上下左右につながる完全同色だけを選択パーツへ統一する。
const eyedropAssignments = Int16Array.from([0,1,-1,-1,2,-1,-2,-1,-1]);
const eyedropRgba = Uint8ClampedArray.from([
  7,8,9,255, 7,8,9,255, 1,1,1,255,
  7,8,9,255, 7,8,9,255, 1,1,1,255,
  0,0,0,0,   1,1,1,255, 7,8,9,255
]);
assert.strictEqual(M.eyedropAdjacentSameColor(eyedropAssignments,eyedropRgba,3,3,0,4),4);
assert.deepStrictEqual(Array.from(eyedropAssignments),[4,4,-1,4,4,-1,-2,-1,-1]);
assert.strictEqual(M.eyedropAdjacentSameColor(eyedropAssignments,eyedropRgba,3,3,8,5),1,'離れた同色は別領域');
assert.strictEqual(M.eyedropAdjacentSameColor(eyedropAssignments,eyedropRgba,3,3,6,5),0,'透明部分は対象外');
console.log('model tests: pass');
