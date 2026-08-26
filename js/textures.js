import * as THREE from "three";

// Went to ImageBitmapLoader earlier today to get poster decoding off the
// main thread (avoids fighting the WebGL render loop for a turn), then
// through two rounds of trying to patch createImageBitmap-specific quirks
// (its resizeWidth/resizeHeight options, then the bitmap decode itself) —
// each attempt "fixed" one symptom but poster art ended up permanently
// stuck on the gray placeholder on BOTH mobile and desktop, which means the
// problem was never actually isolated to one browser's createImageBitmap
// support, it was the whole approach. Reverting all the way back to plain
// THREE.TextureLoader — the original, boring, universally-supported
// <img>-based loader this project used before any of today's ImageBitmap
// detour — trading back "might briefly contend with the render loop on a
// slow device" for "actually works everywhere," which is the right side of
// that trade after real devices kept disagreeing with the fancier version.
const isCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches;
const DECODE_SIZE = isCoarsePointer ? 768 : 1024;

const loader = new THREE.TextureLoader();

// Still resize down after loading — this is what keeps repeated taps
// through a canvas's design list from stacking up multiple full 2048x2048
// decodes in memory, independent of which loader fetched the image.
function resizeImageToCanvas(imgOrCanvas, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(imgOrCanvas, 0, 0, w, h);
  return c;
}

// The resize fix above capped the cost of any ONE decode, but the cache
// itself never forgot anything — browse all ~8 designs on all 4 canvases
// in one session (plus every vinyl cover) and every single decoded bitmap
// stayed pinned in memory forever, since nothing ever removed them from
// this Map. That's what kept crashing mobile after "enough taps": it's
// cumulative across the whole session, not any single image. Capping the
// cache size and dropping the oldest entry once full fixes that — safe to
// just drop the Map entry (not call .dispose()/.close()) because if that
// texture is still someone's current material.map, it keeps rendering
// fine; we're only forgetting how to instantly re-hand it out next time,
// not destroying anything still on screen.
const CACHE_LIMIT = 16;
const cache = new Map();
function cacheSet(key, texture) {
  cache.set(key, texture);
  if (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

/**
 * Loads a real image if entry.image is set, otherwise generates a placeholder
 * canvas texture (square, for album covers) with the title on it.
 */
export function getArtTexture(entry, kind = "cover") {
  const key = entry.image || `${kind}-${entry.title}`;
  if (cache.has(key)) return cache.get(key);

  let texture;
  if (entry.image) {
    // .load() returns the Texture object immediately, but its .image stays
    // empty until the fetch + off-thread decode actually finish — an empty
    // texture samples as solid BLACK in WebGL, which read as "the click did
    // nothing" even though it's just normal async loading latency. A
    // neutral gray placeholder here makes that brief gap look like it's
    // doing something instead of looking broken.
    texture = new THREE.Texture(drawLoadingSwatch());
    texture.needsUpdate = true;
    loader.load(
      entry.image,
      (loadedTexture) => {
        // TextureLoader hands back a whole Texture wrapping an <img>, not a
        // raw bitmap — .image is the actual <img> element to draw from.
        texture.image = resizeImageToCanvas(loadedTexture.image, DECODE_SIZE, DECODE_SIZE);
        loadedTexture.dispose();
        texture.needsUpdate = true;
      },
      undefined,
      // onError — a failed fetch/decode used to just leave the texture
      // empty, which WebGL then samples as solid black (indistinguishable
      // from "loaded fine, but the art itself is mostly black"). Swapping
      // in a loud red swatch on failure makes a load error obvious at a
      // glance in the 3D view instead of looking identical to a real bug.
      (err) => {
        console.error(`getArtTexture: failed to load "${entry.image}" —`, err);
        texture.image = drawLoadErrorSwatch(entry.image);
        texture.needsUpdate = true;
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
  } else {
    const canvas =
      kind === "cover"
        ? drawPlaceholderCover(entry)
        : drawPlaceholderGarment(entry);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.needsUpdate = true;
  cacheSet(key, texture);
  return texture;
}

// Both swatches below used to be their own fixed sizes (64px, 512px) —
// completely unrelated to DECODE_SIZE, the size the REAL image eventually
// lands at. That mismatch is what was actually breaking every poster load,
// on every platform, this whole time: swapping a texture's .image from a
// small placeholder to a much bigger real image made the browser's fast
// GPU texture-update path try to copy the new (bigger) pixels into the
// old (smaller) texture's already-allocated GPU memory — which is exactly
// what "GL_INVALID_VALUE: glCopySubTextureCHROMIUM: Offset overflows
// texture dimensions" in the console means. No loader change was ever
// going to fix this, because the bug wasn't in how the image got fetched —
// it was in these two functions handing back the wrong size. Now every
// stage (loading placeholder, real image, error swatch) is the exact same
// DECODE_SIZE, so the GPU texture is allocated once, correctly, up front.

/** Neutral placeholder shown for the brief moment before a real image finishes loading. */
function drawLoadingSwatch() {
  const c = document.createElement("canvas");
  c.width = c.height = DECODE_SIZE;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, DECODE_SIZE, DECODE_SIZE);
  return c;
}

/** Bright, unmissable fallback shown when a real image fails to load. */
function drawLoadErrorSwatch(path) {
  const c = document.createElement("canvas");
  c.width = c.height = DECODE_SIZE;
  const ctx = c.getContext("2d");
  const cx = DECODE_SIZE / 2;
  ctx.fillStyle = "#ff1744";
  ctx.fillRect(0, 0, DECODE_SIZE, DECODE_SIZE);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const scale = DECODE_SIZE / 512;
  ctx.font = `bold ${Math.round(32 * scale)}px sans-serif`;
  ctx.fillText("IMAGE FAILED", cx, 210 * scale);
  ctx.fillText("TO LOAD", cx, 250 * scale);
  ctx.textAlign = "left";
  wrapText(ctx, path || "(no path)", 40 * scale, 320 * scale, 432 * scale, 20 * scale, `${Math.round(14 * scale)}px monospace`);
  return c;
}

/** Returns a plain <canvas> (for drawing straight into the lightbox too) */
export function getArtCanvas(entry, kind = "cover") {
  return kind === "cover"
    ? drawPlaceholderCover(entry)
    : drawPlaceholderGarment(entry);
}

function seedFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawPlaceholderCover(entry) {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const rand = mulberry32(seedFromString(entry.title));
  const accent = entry.accent || "#ffce6b";

  // background gradient
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, shade(accent, -55));
  g.addColorStop(0.5, shade(accent, -20));
  g.addColorStop(1, shade(accent, 10));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // abstract shapes
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 80 + rand() * 260;
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.08})`;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(60, size - 60);
  for (let x = 60; x <= size - 60; x += 24) {
    const y = size - 60 - Math.abs(Math.sin((x + rand() * 40) * 0.02)) * 140 * rand();
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // border
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, size - 14, size - 14);

  // title
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.font = "600 40px 'Archivo', sans-serif";
  ctx.fillText((entry.kicker || "").toUpperCase(), 64, 110);

  ctx.fillStyle = "#f5f0e6";
  wrapText(ctx, entry.title, 64, size - 140, size - 128, 76, "700 76px 'Space Grotesk', sans-serif");

  return c;
}

function drawPlaceholderGarment(entry) {
  const w = 900,
    h = 1150;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const rand = mulberry32(seedFromString(entry.title + "g"));
  const accent = entry.accent || "#e07a5f";

  ctx.fillStyle = shade(accent, -45);
  ctx.fillRect(0, 0, w, h);

  // simple garment silhouette (jacket-ish shape) built from primitives
  ctx.save();
  ctx.translate(w / 2, h / 2 - 40);
  ctx.fillStyle = shade(accent, 0);
  ctx.strokeStyle = shade(accent, -60);
  ctx.lineWidth = 8;

  // body
  roundRect(ctx, -180, -260, 360, 480, 40);
  ctx.fill();
  ctx.stroke();
  // sleeves
  roundRect(ctx, -320, -240, 130, 340, 30);
  ctx.fill();
  ctx.stroke();
  roundRect(ctx, 190, -240, 130, 340, 30);
  ctx.fill();
  ctx.stroke();
  // collar
  ctx.beginPath();
  ctx.moveTo(-70, -260);
  ctx.lineTo(0, -190);
  ctx.lineTo(70, -260);
  ctx.closePath();
  ctx.fillStyle = shade(accent, -25);
  ctx.fill();

  // scribble texture / patches for the "handmade" feel
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.08})`;
    ctx.arc(-150 + rand() * 300, -220 + rand() * 420, 10 + rand() * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 30px 'Archivo', sans-serif";
  ctx.fillText((entry.kicker || "").toUpperCase(), 44, 70);
  ctx.font = "700 46px 'Space Grotesk', sans-serif";
  wrapText(ctx, entry.title, 44, h - 70, w - 88, 50, "700 46px 'Space Grotesk', sans-serif");

  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, font) {
  ctx.font = font;
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w + " ";
    } else {
      line = test;
    }
  }
  lines.push(line);
  const startY = y - (lines.length - 1) * lineHeight;
  lines.forEach((l, i) => ctx.fillText(l.trim(), x, startY + i * lineHeight));
}

function shade(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + Math.round((percent / 100) * 255);
  let g = ((num >> 8) & 0x00ff) + Math.round((percent / 100) * 255);
  let b = (num & 0x0000ff) + Math.round((percent / 100) * 255);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Procedural material textures (wood grain, fabric weave, rug fuzz, wall)
// ---------------------------------------------------------------------------

export function makeWoodTexture(base = "#6b4226", grain = "#4a2c18") {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    const y = Math.random() * 512;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 6);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeFabricTexture(base = "#d97757") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeRugTexture(base = "#f2ece2") {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 200 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v | 0},${v | 0},${(v - 15) | 0},${0.15 + Math.random() * 0.25})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWallTexture(base = "#2b2430") {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Carpet color + normal + height (displacement) maps, generated from one
 * shared set of "tuft" points so the color flecks, the normal-map bumps,
 * and the actual geometry displacement all line up in the same spots —
 * a normal map alone on a flat plane reads as flat from most angles, so
 * the height map is what gives the carpet real, viewable depth.
 */
export function makeCarpetTextureSet(base = "#f0dd8c") {
  const SIZE = 512;
  const rand = mulberry32(seedFromString(base + "-carpet"));
  const TUFT_COUNT = 9000;
  const tufts = [];
  for (let i = 0; i < TUFT_COUNT; i++) {
    tufts.push({
      x: rand() * SIZE,
      y: rand() * SIZE,
      len: 1.5 + rand() * 3,
      ang: rand() * Math.PI * 2,
      tint: (rand() - 0.5) * 60,
      height: rand(),
    });
  }

  // ---- color ----
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = SIZE;
  const cctx = colorCanvas.getContext("2d");
  cctx.fillStyle = base;
  cctx.fillRect(0, 0, SIZE, SIZE);
  tufts.forEach((t) => {
    cctx.fillStyle = shade(base, t.tint);
    cctx.globalAlpha = 0.3 + t.height * 0.45;
    cctx.save();
    cctx.translate(t.x, t.y);
    cctx.rotate(t.ang);
    cctx.fillRect(-t.len / 2, -0.6, t.len, 1.2);
    cctx.restore();
  });
  cctx.globalAlpha = 1;

  // ---- height (grayscale, used as a real vertex displacement map) ----
  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = heightCanvas.height = SIZE;
  const hctx = heightCanvas.getContext("2d");
  hctx.fillStyle = "#808080";
  hctx.fillRect(0, 0, SIZE, SIZE);
  tufts.forEach((t) => {
    const v = Math.round(128 + t.height * 110);
    const grad = hctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.len * 1.4);
    grad.addColorStop(0, `rgb(${v},${v},${v})`);
    grad.addColorStop(1, "rgba(128,128,128,0)");
    hctx.fillStyle = grad;
    hctx.beginPath();
    hctx.arc(t.x, t.y, t.len * 1.4, 0, Math.PI * 2);
    hctx.fill();
  });

  // ---- normal (matches the same bump positions) ----
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = normalCanvas.height = SIZE;
  const nctx = normalCanvas.getContext("2d");
  nctx.fillStyle = "rgb(128,128,255)";
  nctx.fillRect(0, 0, SIZE, SIZE);
  tufts.forEach((t) => {
    const dx = Math.cos(t.ang) * 70 * t.height;
    const dy = Math.sin(t.ang) * 70 * t.height;
    const grad = nctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.len * 1.4);
    grad.addColorStop(0, `rgb(${128 + dx},${128 + dy},255)`);
    grad.addColorStop(1, "rgba(128,128,255,0)");
    nctx.fillStyle = grad;
    nctx.beginPath();
    nctx.arc(t.x, t.y, t.len * 1.4, 0, Math.PI * 2);
    nctx.fill();
  });

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.colorSpace = THREE.SRGBColorSpace;

  const heightTex = new THREE.CanvasTexture(heightCanvas);
  heightTex.wrapS = heightTex.wrapT = THREE.RepeatWrapping;

  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  // normal maps are non-color data — leave color space as default (linear)

  return { colorTex, heightTex, normalTex };
}

// Single soft round puff for the joint's smoke wisp (see main.js's ambient
// smoke system) — a few overlapping soft-edged blobs rather than one clean
// circle, so a single sprite already reads as "wisp of smoke" instead of
// "glowing dot" before any per-particle animation even starts.
export function makeSmokeSpriteTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const blobs = [
    { x: 0.5, y: 0.5, r: 0.42 },
    { x: 0.34, y: 0.56, r: 0.28 },
    { x: 0.64, y: 0.42, r: 0.26 },
    { x: 0.52, y: 0.7, r: 0.22 },
  ];
  blobs.forEach((b) => {
    const cx = b.x * size;
    const cy = b.y * size;
    const r = b.r * size;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(214,212,204,0.9)");
    grad.addColorStop(0.6, "rgba(214,212,204,0.45)");
    grad.addColorStop(1, "rgba(214,212,204,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A single tiny soft speck, not the multi-blob wisp shape above — dust
// motes read as small bright points caught in a light shaft, not a cloud.
// Warm/golden tint (vs. the smoke's neutral grey) since these are meant to
// look sunlit.
export function makeDustMoteTexture() {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,244,214,0.95)");
  grad.addColorStop(0.5, "rgba(255,238,190,0.5)");
  grad.addColorStop(1, "rgba(255,238,190,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeVinylLabelTexture(accent = "#ffce6b") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 90, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(128, 128, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
