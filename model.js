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
    if (assignments[index] === -2 || assignments[index] === part) return false;
    assignments[index] = part;
    return true;
  }
  function brushIndices(width, height, start, size) {
    const indices = [];
    if (start < 0 || start >= width * height) return indices;
    const diameter = Math.max(1, Math.min(15, Math.round(size) | 1));
    const radius = (diameter - 1) / 2, cx = start % width, cy = (start / width) | 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > (radius + .35) * (radius + .35)) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      indices.push(y * width + x);
    }
    return indices;
  }
  function brushAssign(assignments, width, height, start, part, size) {
    if (start < 0 || start >= assignments.length || assignments[start] === -2) return 0;
    let changed = 0;
    for (const index of brushIndices(width, height, start, size)) {
      if (assignments[index] === -2 || assignments[index] === part) continue;
      assignments[index] = part; changed++;
    }
    return changed;
  }
  function encodeAssignmentsRLE(assignments) {
    if (!assignments?.length) return [];
    const out = []; let value = assignments[0], count = 1;
    for (let i = 1; i < assignments.length; i++) {
      if (assignments[i] === value && count < 65535) count++;
      else { out.push(value, count); value = assignments[i]; count = 1; }
    }
    out.push(value, count); return out;
  }
  function decodeAssignmentsRLE(data, length) {
    if (!Array.isArray(data) || data.length % 2) return null;
    const out = new Int16Array(length); let cursor = 0;
    for (let i = 0; i < data.length; i += 2) {
      const value = data[i], count = data[i + 1];
      if (!Number.isInteger(value) || !Number.isInteger(count) || count < 1 || cursor + count > length) return null;
      out.fill(value, cursor, cursor + count); cursor += count;
    }
    return cursor === length ? out : null;
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
  function rectVisibleMask(alpha, width, height, start, end) {
    const out = new Uint8Array(width * height);
    if (start < 0 || end < 0 || start >= out.length || end >= out.length) return out;
    const x0 = Math.min(start % width, end % width), x1 = Math.max(start % width, end % width);
    const y0 = Math.min((start / width) | 0, (end / width) | 0), y1 = Math.max((start / width) | 0, (end / width) | 0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * width + x; if (alpha[i]) out[i] = 1; }
    return out;
  }
  function pointOnSegment(px, py, ax, ay, bx, by) {
    const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    if (Math.abs(cross) > 1e-7) return false;
    return px >= Math.min(ax,bx) && px <= Math.max(ax,bx) && py >= Math.min(ay,by) && py <= Math.max(ay,by);
  }
  function polygonVisibleMask(alpha, width, height, points) {
    const out = new Uint8Array(width * height);
    if (!Array.isArray(points) || points.length < 3) return out;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x; if (!alpha[index]) continue;
      const px = x + .5, py = y + .5; let inside = false, boundary = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const ax = points[j].x + .5, ay = points[j].y + .5, bx = points[i].x + .5, by = points[i].y + .5;
        if (pointOnSegment(px,py,ax,ay,bx,by)) { boundary = true; break; }
        if ((by > py) !== (ay > py) && px < (ax - bx) * (py - by) / (ay - by) + bx) inside = !inside;
      }
      if (inside || boundary) out[index] = 1;
    }
    return out;
  }
  function autoClassify(rgba, alpha, width, height) {
    const assignments = createAssignments(alpha);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    const luminances = [];
    for (let i = 0; i < alpha.length; i++) {
      if (!alpha[i]) continue;
      const x = i % width, y = (i / width) | 0, p = i * 4;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      luminances.push((rgba[p] * 54 + rgba[p + 1] * 183 + rgba[p + 2] * 19) >> 8);
    }
    if (maxX < minX || maxY < minY) return { assignments, counts: Array(8).fill(0), confidence: 'none' };
    luminances.sort((a, b) => a - b);
    const darkLimit = Math.min(92, luminances[Math.floor(luminances.length * .18)] + 10);
    const boxW = Math.max(1, maxX - minX + 1), boxH = Math.max(1, maxY - minY + 1);
    const headEnd = minY + boxH * .39, legStart = minY + boxH * .68;
    const faceLeft = minX + boxW * .24, faceRight = minX + boxW * .76;
    const faceTop = minY + boxH * .08, faceBottom = minY + boxH * .39;
    const sideLeft = minX + boxW * .25, sideRight = minX + boxW * .75;
    const counts = Array(8).fill(0);
    const isVisible = (x, y) => x >= 0 && x < width && y >= 0 && y < height && alpha[y * width + x] > 0;
    for (let i = 0; i < alpha.length; i++) {
      if (!alpha[i]) continue;
      const x = i % width, y = (i / width) | 0, p = i * 4;
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      const lum = (r * 54 + g * 183 + b * 19) >> 8;
      const edge = !isVisible(x - 1, y) || !isVisible(x + 1, y) || !isVisible(x, y - 1) || !isVisible(x, y + 1);
      const skin = r > 58 && g > 30 && b > 18 && r >= g * .94 && r > b * 1.06 && Math.max(r, g, b) - Math.min(r, g, b) > 12;
      let part;
      if (edge && lum <= darkLimit) part = 0;
      else if (y <= headEnd) {
        const centralFace = x >= faceLeft && x <= faceRight && y >= faceTop && y <= faceBottom;
        part = centralFace && (skin || y > minY + boxH * .22) ? 2 : 1;
      } else if (y < legStart) {
        if (x < sideLeft) part = 4;
        else if (x > sideRight) part = 5;
        else part = 3;
      } else part = 6;
      assignments[i] = part;
      counts[part]++;
    }
    return { assignments, counts, confidence: 'rough' };
  }
  function validate(assignments) {
    const s = stats(assignments);
    return { ...s, exportReady: s.unassigned === 0 && s.overlap === 0 && s.diff === 0 };
  }
  return { createAssignments, assign, brushIndices, brushAssign, encodeAssignmentsRLE, decodeAssignmentsRLE, stats, floodSameColor, eyedropAdjacentSameColor, adjacentColorMask, rectVisibleMask, polygonVisibleMask, autoClassify, validate };
});
