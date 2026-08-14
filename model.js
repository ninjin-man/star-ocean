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
  function recommendedZoom(width, height) {
    const longest = Math.max(width, height);
    return Math.max(4, Math.min(16, Math.floor(512 / Math.max(1, longest))));
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
  const clamp01 = value => Math.max(0, Math.min(1, value));
  function rgbToLab(r, g, b) {
    const linear = value => {
      value /= 255;
      return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
    };
    r = linear(r); g = linear(g); b = linear(b);
    let x = (r * .4124564 + g * .3575761 + b * .1804375) / .95047;
    let y = (r * .2126729 + g * .7151522 + b * .0721750);
    let z = (r * .0193339 + g * .1191920 + b * .9503041) / 1.08883;
    const f = value => value > .008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function isSkinColor(r, g, b, lab) {
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const rgbRule = r > 58 && g > 30 && b > 18 && r >= g * .94 && r > b * 1.06 && spread > 12;
    const labRule = lab[0] > 22 && lab[1] > 5 && lab[2] > 8 && lab[2] < 55;
    return rgbRule || labRule;
  }
  function inferLandmarks(alpha, width, height) {
    let minX = width, minY = height, maxX = -1, maxY = -1, sumX = 0, visible = 0;
    const rowWidth = new Int16Array(height), rowRuns = new Int16Array(height);
    for (let y = 0; y < height; y++) {
      let left = width, right = -1, runs = 0, inside = false;
      for (let x = 0; x < width; x++) {
        const on = alpha[y * width + x] > 0;
        if (on) {
          if (!inside) runs++;
          inside = true; left = Math.min(left, x); right = x; sumX += x; visible++;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        } else inside = false;
      }
      rowWidth[y] = right >= left ? right - left + 1 : 0;
      rowRuns[y] = runs;
    }
    if (!visible) return null;
    const boxH = Math.max(1, maxY - minY + 1), boxW = Math.max(1, maxX - minX + 1);
    const smooth = y => (rowWidth[Math.max(minY, y - 1)] + rowWidth[y] * 2 + rowWidth[Math.min(maxY, y + 1)]) / 4;
    let maxWidth = 1;
    for (let y = minY; y <= maxY; y++) maxWidth = Math.max(maxWidth, smooth(y));
    const choose = (fromRatio, toRatio, mode, preferred) => {
      const from = Math.max(minY, Math.round(minY + boxH * fromRatio));
      const to = Math.min(maxY, Math.round(minY + boxH * toRatio));
      let best = from, bestScore = mode === 'max' ? -Infinity : Infinity;
      for (let y = from; y <= to; y++) {
        const ratio = (y - minY) / boxH;
        const value = smooth(y) / maxWidth;
        const score = mode === 'max' ? value - Math.abs(ratio - preferred) * .18 : value + Math.abs(ratio - preferred) * .34;
        if ((mode === 'max' && score > bestScore) || (mode !== 'max' && score < bestScore)) { best = y; bestScore = score; }
      }
      return best;
    };
    const headEnd = choose(.24, .48, 'min', .36);
    const shoulderY = choose(Math.max(.28, (headEnd - minY) / boxH), .60, 'max', .45);
    const waistY = choose(Math.max(.48, (shoulderY - minY) / boxH + .05), .73, 'min', .60);
    let legStart = Math.round(minY + boxH * .69);
    for (let y = Math.round(minY + boxH * .58); y <= Math.round(minY + boxH * .82); y++) {
      if (rowRuns[y] >= 2 && rowRuns[Math.min(maxY, y + 1)] >= 2) { legStart = y; break; }
    }
    return { minX, minY, maxX, maxY, boxW, boxH, centerX: sumX / visible, headEnd, shoulderY, waistY, legStart, rowWidth: Array.from(rowWidth), visible };
  }
  function buildColorRegions(rgba, alpha, width, height, labs) {
    const length = width * height, keys = new Int32Array(length), regionAt = new Int16Array(length); regionAt.fill(-1);
    for (let i = 0; i < length; i++) {
      if (!alpha[i]) { keys[i] = -1; continue; }
      const p = i * 3;
      const qL = Math.floor(labs[p] / 11), qa = Math.floor((labs[p + 1] + 128) / 18), qb = Math.floor((labs[p + 2] + 128) / 18);
      keys[i] = qL * 256 + qa * 16 + qb;
    }
    const regions = [];
    for (let start = 0; start < length; start++) {
      if (!alpha[start] || regionAt[start] >= 0) continue;
      const id = regions.length, queue = [start], pixels = [];
      let sumX = 0, sumY = 0, sumL = 0, sumA = 0, sumB = 0, skin = 0, boundary = 0;
      let minX = width, minY = height, maxX = -1, maxY = -1;
      regionAt[start] = id;
      while (queue.length) {
        const i = queue.pop(), x = i % width, y = (i / width) | 0, p = i * 3, q = i * 4;
        pixels.push(i); sumX += x; sumY += y; sumL += labs[p]; sumA += labs[p + 1]; sumB += labs[p + 2];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (isSkinColor(rgba[q], rgba[q + 1], rgba[q + 2], [labs[p], labs[p + 1], labs[p + 2]])) skin++;
        const neighbors = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1];
        if (neighbors.some(n => n < 0 || !alpha[n])) boundary++;
        for (const n of neighbors) if (n >= 0 && alpha[n] && regionAt[n] < 0 && keys[n] === keys[start]) { regionAt[n] = id; queue.push(n); }
      }
      const area = pixels.length;
      regions.push({ id, pixels, area, cx: sumX / area, cy: sumY / area, meanLab: [sumL / area, sumA / area, sumB / area], skinRatio: skin / area, boundaryRatio: boundary / area, minX, minY, maxX, maxY, adjacent: new Set() });
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, a = regionAt[i]; if (a < 0) continue;
      if (x + 1 < width) { const b = regionAt[i + 1]; if (b >= 0 && a !== b) { regions[a].adjacent.add(b); regions[b].adjacent.add(a); } }
      if (y + 1 < height) { const b = regionAt[i + width]; if (b >= 0 && a !== b) { regions[a].adjacent.add(b); regions[b].adjacent.add(a); } }
    }
    return { regions, regionAt };
  }
  function inferAdaptiveSkin(regions, landmarks) {
    let seed = null, seedScore = -Infinity;
    for (const region of regions) {
      if (region.cy > landmarks.headEnd + landmarks.boxH * .08) continue;
      const side = clamp01(Math.abs(region.cx - landmarks.centerX) / Math.max(1, landmarks.boxW * .5));
      const [light, a, b] = region.meanLab;
      const warm = clamp01((a + b - 10) / 55), central = 1 - side;
      const area = clamp01(region.area / Math.max(1, landmarks.visible * .08));
      const score = central * .22 + warm * .34 + clamp01(light / 92) * .40 + area * .05 - region.boundaryRatio * .08;
      if (warm > .12 && score > seedScore) { seed = region; seedScore = score; }
    }
    if (!seed) return null;
    for (const region of regions) {
      const dL = (region.meanLab[0] - seed.meanLab[0]) * .65;
      const da = region.meanLab[1] - seed.meanLab[1], db = region.meanLab[2] - seed.meanLab[2];
      const distance = Math.hypot(dL, da, db);
      region.skinRatio = clamp01(1 - distance / 34);
    }
    return { regionId: seed.id, lab: seed.meanLab.slice(), score: seedScore };
  }
  function scoreRegion(region, landmarks) {
    const { minY, boxH, boxW, centerX, headEnd, waistY, legStart } = landmarks;
    const ny = (region.cy - minY) / boxH, sideSigned = (region.cx - centerX) / Math.max(1, boxW * .5);
    const side = clamp01((Math.abs(sideSigned) - .22) / .7), central = 1 - side;
    const head = region.cy <= headEnd ? 1 : clamp01(1 - (region.cy - headEnd) / Math.max(1, boxH * .16));
    const torso = region.cy > headEnd && region.cy < legStart ? 1 : 0;
    const lower = region.cy >= legStart ? 1 : clamp01((ny - .55) / .18);
    const skin = region.skinRatio, boundary = region.boundaryRatio;
    const regionW = region.maxX - region.minX + 1, regionH = region.maxY - region.minY + 1;
    const elongation = clamp01((Math.max(regionW / Math.max(1, regionH), regionH / Math.max(1, regionW)) - 1.35) / 3.2);
    const chroma = clamp01(Math.hypot(region.meanLab[1], region.meanLab[2]) / 65);
    const area = clamp01(region.area / Math.max(1, landmarks.visible * .16));
    const scores = new Float32Array(8); scores.fill(-1);
    scores[1] = head * .78 + (1 - skin) * .30 + boundary * .16 + chroma * .08;
    scores[2] = head * .66 + central * .27 + skin * .56 + (1 - boundary) * .10;
    scores[3] = torso * .66 + central * .39 + area * .14 + (1 - skin) * .08;
    scores[4] = torso * .60 + (sideSigned < 0 ? side * .44 : 0) + boundary * .10 + skin * .08;
    scores[5] = torso * .60 + (sideSigned > 0 ? side * .44 : 0) + boundary * .10 + skin * .08;
    scores[6] = lower * .83 + area * .15 + (1 - skin) * .06;
    const equipmentEligible = side > .65 && (elongation > .34 || region.cy < waistY) && skin < .45;
    scores[7] = equipmentEligible ? side * .31 + elongation * .31 + boundary * .20 + chroma * .12 + (1 - skin) * .15 : -.5;
    return scores;
  }
  function autoClassify(rgba, alpha, width, height) {
    const assignments = createAssignments(alpha), candidateAssignments = createAssignments(alpha), confidenceMap = new Uint8Array(alpha.length);
    const landmarks = inferLandmarks(alpha, width, height), counts = Array(8).fill(0);
    if (!landmarks) return { assignments, candidateAssignments, confidenceMap, counts, confidence: 'none', coverage: 0, highCount: 0, uncertainCount: 0, regions: 0, landmarks: null };
    const labs = new Float32Array(alpha.length * 3), lightness = [];
    for (let i = 0; i < alpha.length; i++) if (alpha[i]) {
      const q = i * 4, p = i * 3, lab = rgbToLab(rgba[q], rgba[q + 1], rgba[q + 2]);
      labs[p] = lab[0]; labs[p + 1] = lab[1]; labs[p + 2] = lab[2]; lightness.push(lab[0]);
    }
    lightness.sort((a, b) => a - b);
    const darkLimit = Math.min(44, lightness[Math.floor(lightness.length * .20)] + 5);
    const { regions } = buildColorRegions(rgba, alpha, width, height, labs), skinSeed = inferAdaptiveSkin(regions, landmarks);
    const isBoundary = index => {
      const x = index % width, y = (index / width) | 0;
      return x === 0 || y === 0 || x + 1 === width || y + 1 === height || !alpha[index - 1] || !alpha[index + 1] || !alpha[index - width] || !alpha[index + width];
    };
    for (const region of regions) {
      const scores = scoreRegion(region, landmarks), ranked = [];
      for (let part = 1; part < scores.length; part++) ranked.push({ part, score: scores[part] });
      ranked.sort((a, b) => b.score - a.score);
      const best = ranked[0], second = ranked[1], threshold = best.part === 2 || best.part === 1 ? 1.02 : best.part === 7 ? 1.05 : .92;
      const high = best.score >= threshold && best.score - second.score >= .14 && (region.area > 1 || best.score >= threshold + .12);
      for (const index of region.pixels) {
        const light = labs[index * 3];
        if (isBoundary(index) && light <= darkLimit) {
          assignments[index] = 0; candidateAssignments[index] = 0; confidenceMap[index] = 3; counts[0]++;
        } else {
          candidateAssignments[index] = best.part;
          if (high) { assignments[index] = best.part; confidenceMap[index] = 3; counts[best.part]++; }
          else confidenceMap[index] = best.score >= threshold - .18 ? 2 : 1;
        }
      }
    }
    let highCount = 0, uncertainCount = 0;
    for (let i = 0; i < assignments.length; i++) if (alpha[i]) { if (assignments[i] >= 0) highCount++; else uncertainCount++; }
    return { assignments, candidateAssignments, confidenceMap, counts, confidence: 'region-v1', coverage: landmarks.visible ? highCount / landmarks.visible : 0, highCount, uncertainCount, regions: regions.length, landmarks, skinSeed, darkLimit };
  }
  function validate(assignments) {
    const s = stats(assignments);
    return { ...s, exportReady: s.unassigned === 0 && s.overlap === 0 && s.diff === 0 };
  }
  return { createAssignments, assign, brushIndices, brushAssign, recommendedZoom, encodeAssignmentsRLE, decodeAssignmentsRLE, stats, floodSameColor, eyedropAdjacentSameColor, adjacentColorMask, rectVisibleMask, polygonVisibleMask, autoClassify, validate };
});
