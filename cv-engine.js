(function (root) {
  'use strict';

  let cvReadyPromise = null;

  function loadOpenCVScript() {
    if (root.cv) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-opencv-loader]');
      if (existing) { existing.addEventListener('load', resolve, { once:true }); existing.addEventListener('error', reject, { once:true }); return; }
      const script = document.createElement('script');
      script.src = 'opencv.js'; script.async = true; script.dataset.opencvLoader = 'true';
      script.onload = resolve; script.onerror = () => reject(new Error('opencv.jsを読み込めませんでした'));
      document.head.appendChild(script);
    });
  }

  function ready() {
    if (!cvReadyPromise) {
      cvReadyPromise = (async () => {
        await loadOpenCVScript();
        let instance = root.cv;
        if (instance && typeof instance.then === 'function') {
          instance = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('OpenCV.jsの初期化がタイムアウトしました')), 60000);
            try { instance.then(value => { clearTimeout(timer); resolve(value); }); }
            catch (error) { clearTimeout(timer); reject(error); }
          });
        } else if (instance && !instance.Mat) {
          instance = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('OpenCV.jsの初期化がタイムアウトしました')), 60000);
            instance.onRuntimeInitialized = () => { clearTimeout(timer); resolve(instance); };
          });
        }
        if (!instance || !instance.Mat) throw new Error('OpenCV.jsを初期化できませんでした');
        root.cv = instance;
        return instance;
      })();
    }
    return cvReadyPromise;
  }

  function maskFromMat(mat) {
    const out = new Uint8Array(mat.rows * mat.cols);
    for (let i = 0; i < out.length; i++) out[i] = mat.data[i] ? 1 : 0;
    return out;
  }

  function rgbaMat(cv, rgba, width, height) {
    const mat = new cv.Mat(height, width, cv.CV_8UC4);
    mat.data.set(rgba);
    return mat;
  }

  function binaryMat(cv, binary, width, height) {
    const mat = new cv.Mat(height, width, cv.CV_8UC1);
    for (let i = 0; i < binary.length; i++) mat.data[i] = binary[i] ? 255 : 0;
    return mat;
  }

  async function adjacentColor(rgba, width, height, start, tolerance) {
    const cv = await ready();
    if (start < 0 || start >= width * height || rgba[start * 4 + 3] === 0) return new Uint8Array(width * height);
    const p = start * 4;
    const values = [rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3]];
    const lowValues = values.map((v, i) => i === 3 ? Math.max(1, v - tolerance) : Math.max(0, v - tolerance));
    const highValues = values.map(v => Math.min(255, v + tolerance));
    const mats = [];
    try {
      const src = rgbaMat(cv, rgba, width, height); mats.push(src);
      const low = new cv.Mat(height, width, cv.CV_8UC4, new cv.Scalar(...lowValues)); mats.push(low);
      const high = new cv.Mat(height, width, cv.CV_8UC4, new cv.Scalar(...highValues)); mats.push(high);
      const candidate = new cv.Mat(); mats.push(candidate);
      cv.inRange(src, low, high, candidate);
      const labels = new cv.Mat(), stats = new cv.Mat(), centroids = new cv.Mat(); mats.push(labels, stats, centroids);
      cv.connectedComponentsWithStats(candidate, labels, stats, centroids, 4, cv.CV_32S);
      const targetLabel = labels.data32S[start];
      const out = new Uint8Array(width * height);
      if (targetLabel > 0) for (let i = 0; i < out.length; i++) out[i] = labels.data32S[i] === targetLabel ? 1 : 0;
      return out;
    } finally {
      for (const mat of mats) mat.delete();
    }
  }

  async function orphanRegions(assignments, width, height, part, maxArea) {
    const cv = await ready();
    const input = new Uint8Array(width * height);
    for (let i = 0; i < input.length; i++) input[i] = assignments[i] === part ? 1 : 0;
    const mats = [];
    try {
      const binary = binaryMat(cv, input, width, height); mats.push(binary);
      const labels = new cv.Mat(), stats = new cv.Mat(), centroids = new cv.Mat(); mats.push(labels, stats, centroids);
      const count = cv.connectedComponentsWithStats(binary, labels, stats, centroids, 4, cv.CV_32S);
      const small = new Uint8Array(count);
      for (let label = 1; label < count; label++) {
        const area = stats.data32S[label * 5 + cv.CC_STAT_AREA];
        if (area <= maxArea) small[label] = 1;
      }
      const out = new Uint8Array(width * height);
      for (let i = 0; i < out.length; i++) out[i] = small[labels.data32S[i]] ? 1 : 0;
      return out;
    } finally {
      for (const mat of mats) mat.delete();
    }
  }

  async function contour(assignments, width, height, part) {
    const cv = await ready();
    const input = new Uint8Array(width * height);
    for (let i = 0; i < input.length; i++) input[i] = assignments[i] === part ? 1 : 0;
    const mats = [];
    let contours = null;
    try {
      const binary = binaryMat(cv, input, width, height); mats.push(binary);
      contours = new cv.MatVector();
      const hierarchy = new cv.Mat(); mats.push(hierarchy);
      cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
      const output = cv.Mat.zeros(height, width, cv.CV_8UC1); mats.push(output);
      for (let i = 0; i < contours.size(); i++) cv.drawContours(output, contours, i, new cv.Scalar(255), 1, cv.LINE_8);
      return maskFromMat(output);
    } finally {
      if (contours) contours.delete();
      for (const mat of mats) mat.delete();
    }
  }

  async function morphology(assignments, width, height, part, operation) {
    const cv = await ready();
    const input = new Uint8Array(width * height);
    for (let i = 0; i < input.length; i++) input[i] = assignments[i] === part ? 1 : 0;
    const mats = [];
    try {
      const binary = binaryMat(cv, input, width, height); mats.push(binary);
      const output = new cv.Mat(); mats.push(output);
      const kernel = cv.getStructuringElement(cv.MORPH_CROSS, new cv.Size(3, 3)); mats.push(kernel);
      const op = operation === 'open' ? cv.MORPH_OPEN : cv.MORPH_CLOSE;
      cv.morphologyEx(binary, output, op, kernel);
      const result = maskFromMat(output);
      const add = new Uint8Array(result.length), remove = new Uint8Array(result.length);
      for (let i = 0; i < result.length; i++) {
        if (result[i] && !input[i] && assignments[i] === -1) add[i] = 1;
        if (!result[i] && input[i]) remove[i] = 1;
      }
      return { add, remove };
    } finally {
      for (const mat of mats) mat.delete();
    }
  }

  root.PixelMaskCV = { ready, adjacentColor, orphanRegions, contour, morphology };
})(typeof window !== 'undefined' ? window : globalThis);
