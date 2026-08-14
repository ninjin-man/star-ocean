(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PixelMaskModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createAssignments(alpha) {
    const out = new Int16Array(alpha.length);
    for (let i = 0; i < alpha.length; i++) out[i] = alpha[i] ? -1 : -2;
    return out;
  }
  function assign(assignments, index, part) {
    if (assignments[index] === -2) return false;
    assignments[index] = part;
    return true;
  }
  function stats(assignments) {
    let assigned = 0, unassigned = 0, transparent = 0;
    for (const v of assignments) {
      if (v === -2) transparent++;
      else if (v === -1) unassigned++;
      else assigned++;
    }
    return { assigned, unassigned, transparent, overlap: 0, diff: unassigned };
  }
  function floodSameColor(assignments, rgba, width, height, start, part) {
    if (assignments[start] === -2) return 0;
    const sr = rgba[start * 4], sg = rgba[start * 4 + 1], sb = rgba[start * 4 + 2], sa = rgba[start * 4 + 3];
    const original = assignments[start];
    const seen = new Uint8Array(width * height), queue = [start];
    let changed = 0;
    while (queue.length) {
      const i = queue.pop();
      if (seen[i]) continue; seen[i] = 1;
      if (assignments[i] !== original) continue;
      const p = i * 4;
      if (rgba[p] !== sr || rgba[p + 1] !== sg || rgba[p + 2] !== sb || rgba[p + 3] !== sa) continue;
      assignments[i] = part; changed++;
      const x = i % width, y = (i / width) | 0;
      if (x > 0) queue.push(i - 1); if (x + 1 < width) queue.push(i + 1);
      if (y > 0) queue.push(i - width); if (y + 1 < height) queue.push(i + width);
    }
    return changed;
  }
  function eyedropAdjacentSameColor(assignments, rgba, width, height, start, part) {
    if (start < 0 || start >= assignments.length || assignments[start] === -2) return 0;
    const sr = rgba[start * 4], sg = rgba[start * 4 + 1], sb = rgba[start * 4 + 2], sa = rgba[start * 4 + 3];
    if (sa === 0) return 0;
    const seen = new Uint8Array(width * height), queue = [start];
    let changed = 0;
    while (queue.length) {
      const i = queue.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      const p = i * 4;
      if (rgba[p] !== sr || rgba[p + 1] !== sg || rgba[p + 2] !== sb || rgba[p + 3] !== sa) continue;
      if (assignments[i] !== part) {
        assignments[i] = part;
        changed++;
      }
      const x = i % width, y = (i / width) | 0;
      if (x > 0) queue.push(i - 1);
      if (x + 1 < width) queue.push(i + 1);
      if (y > 0) queue.push(i - width);
      if (y + 1 < height) queue.push(i + width);
    }
    return changed;
  }
  function adjacentColorMask(rgba, width, height, start, tolerance) {
    const out = new Uint8Array(width * height);
    if (start < 0 || start >= out.length || rgba[start * 4 + 3] === 0) return out;
    const p = start * 4, seed = [rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3]];
    const seen = new Uint8Array(out.length), queue = [start];
    while (queue.length) {
      const i = queue.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      const q = i * 4;
      if (rgba[q + 3] === 0 || Math.abs(rgba[q] - seed[0]) > tolerance || Math.abs(rgba[q + 1] - seed[1]) > tolerance || Math.abs(rgba[q + 2] - seed[2]) > tolerance || Math.abs(rgba[q + 3] - seed[3]) > tolerance) continue;
      out[i] = 1;
      const x = i % width, y = (i / width) | 0;
      if (x > 0) queue.push(i - 1);
      if (x + 1 < width) queue.push(i + 1);
      if (y > 0) queue.push(i - width);
      if (y + 1 < height) queue.push(i + width);
    }
    return out;
  }
  function validate(assignments) {
    const s = stats(assignments);
    return { ...s, exportReady: s.unassigned === 0 && s.overlap === 0 && s.diff === 0 };
  }
  return { createAssignments, assign, stats, floodSameColor, eyedropAdjacentSameColor, adjacentColorMask, validate };
});
