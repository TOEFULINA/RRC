// ---------------------------------------------------------------------------
// Ambient decoration. Nothing here is interactive and nothing here is
// load-bearing — if any of it fails it disables itself and the scene carries
// on. All of it is cheap sprite/transform work, no per-pixel GPU cost.
//
//   - smoke wisp off the joint
//   - dust motes drifting in the window light
//   - lamp flicker on the emissive lamps
//   - curtain sway, which picks up when you walk near it
//   - camera breathing, so standing still doesn't feel frozen
//
// This is also the only module that cares what objects are CALLED, which is
// deliberate: keeping the name-dependence in one file makes it obvious what
// needs revisiting whenever the model is re-exported and renamed again.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// =========================================================== shared textures
// Soft multi-blob wisp, drawn once and shared by every smoke sprite.
function makeSmokeSpriteTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  [
    { x: 0.5, y: 0.5, r: 0.42 },
    { x: 0.34, y: 0.56, r: 0.28 },
    { x: 0.64, y: 0.42, r: 0.26 },
    { x: 0.52, y: 0.7, r: 0.22 },
  ].forEach((b) => {
    const cx = b.x * size, cy = b.y * size, r = b.r * size;
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

// A single tiny warm speck — dust reads as sunlit points, not a grey cloud.
function makeDustMoteTexture() {
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

// =========================================================== smoke
const SMOKE_RISE = 0.16;       // metres over one particle's lifetime
const SMOKE_DRIFT = 0.03;      // metres of side-to-side wander at peak
const SMOKE_BASE_SIZE = 0.035; // metres, sprite width at spawn
const SMOKE_PEAK_OPACITY = 0.3;
const SMOKE_COUNT = 6;

// Where the smoke comes from, in world space.
//
// The original scene derived this: "joint" was a rigging pivot with the
// cylinder as a CHILD, and the burning tip was the child mesh's bounding-box
// end nearest that pivot. The new export collapsed that — "joint" IS the mesh
// now — so the same derivation lands somewhere else. Since every export has
// been 1:1 in world space, this is simply the exact point the old scene
// resolved to, measured out of the old room.glb.
const SMOKE_ORIGIN = new THREE.Vector3(-0.4266, 1.5886, -0.6048);

const smokeParticles = [];

function initSmoke(scene) {
  const smokeTexture = makeSmokeSpriteTexture();
  smokeParticles.length = 0;
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTexture, transparent: true, depthWrite: false, opacity: 0,
    }));
    sprite.renderOrder = 5;
    scene.add(sprite);
    const life = 2.6 + Math.random() * 1.6;
    smokeParticles.push({
      sprite,
      origin: SMOKE_ORIGIN,
      life,
      age: Math.random() * life, // staggered so they don't pulse in sync
      wobblePhase: Math.random() * Math.PI * 2,
      driftAngle: Math.random() * Math.PI * 2,
    });
  }
  return SMOKE_COUNT;
}

// =========================================================== dust motes
const DUST_DRIFT = 0.05;       // metres of wander over a lifetime
const DUST_BASE_SIZE = 0.02;   // metres
const DUST_PEAK_OPACITY = 0.22; // dimmer than smoke — a half-noticed detail
const DUST_COUNT = 14;

const dustMotes = [];

// The windowpane is removed from the scene, so the light shaft is anchored to
// whatever window geometry remains — the OUTSIDE backdrop or the curtains.
function initDust(model, scene) {
  let anchor = null;
  model.traverse((obj) => {
    if (obj.isMesh && /^outside$/i.test(obj.name || "") && !anchor) anchor = obj;
  });
  if (!anchor) {
    model.traverse((obj) => {
      if (obj.isMesh && /curtain/i.test(obj.name || "") && !anchor) anchor = obj;
    });
  }
  if (!anchor) {
    console.warn("dust motes: no window anchor found.");
    return 0;
  }

  const box = new THREE.Box3().setFromObject(anchor);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // The window is thin in one axis; the other two are its width/height. Motes
  // spread over those and drift a little way into the room.
  const halfW = Math.max(size.x, size.z) / 2 * 0.85;
  const halfH = size.y / 2 * 0.85;
  const roomward = 0.5; // metres the shaft reaches into the room

  const dustTexture = makeDustMoteTexture();
  dustMotes.length = 0;
  for (let i = 0; i < DUST_COUNT; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dustTexture, transparent: true, depthWrite: false, opacity: 0,
    }));
    const s = DUST_BASE_SIZE * (0.7 + Math.random() * 0.6);
    sprite.scale.set(s, s, 1);
    sprite.renderOrder = 5;
    scene.add(sprite);
    const life = 6 + Math.random() * 5; // slow — these should barely seem to move
    dustMotes.push({
      sprite,
      basePos: new THREE.Vector3(
        center.x + (Math.random() * 2 - 1) * halfW,
        center.y + (Math.random() * 2 - 1) * halfH,
        center.z + Math.random() * roomward
      ),
      driftPhase: Math.random() * Math.PI * 2,
      driftAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      life,
      age: Math.random() * life,
    });
  }
  return DUST_COUNT;
}

// =========================================================== lamp flicker
// Each lamp gets its own phase and speed so they don't pulse together, which
// would read as the whole room dimming rather than individual bulbs.
const LAMP_PATTERN = /lamp/i;
const lamps = [];

function initLamps(model) {
  lamps.length = 0;
  model.traverse((obj) => {
    if (!obj.isMesh || !LAMP_PATTERN.test(obj.name || "")) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (!m || !("emissive" in m)) return;
      // Unlit materials have no emissive channel, so the flicker rides on
      // overall colour instead — same visible result on a baked lamp.
      lamps.push({
        material: m,
        base: m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1,
        baseColor: m.color ? m.color.clone() : null,
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 1.6,
        // a second, much faster wobble gives the uneven buzz of a real bulb
        jitterPhase: Math.random() * Math.PI * 2,
        jitterSpeed: 7 + Math.random() * 6,
      });
    });
  });
  return lamps.length;
}

// Baked lamps are MeshBasicMaterial, which has no emissive — so the flicker is
// applied to the material colour, scaling the baked glow up and down.
const unlitLamps = [];

function initUnlitLamps(model) {
  unlitLamps.length = 0;
  model.traverse((obj) => {
    if (!obj.isMesh || !LAMP_PATTERN.test(obj.name || "")) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (!m || !m.isMeshBasicMaterial || !m.color) return;
      unlitLamps.push({
        material: m,
        baseColor: m.color.clone(),
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 1.6,
        jitterPhase: Math.random() * Math.PI * 2,
        jitterSpeed: 7 + Math.random() * 6,
      });
    });
  });
  return unlitLamps.length;
}

const LAMP_FLICKER_DEPTH = 0.06;  // how far the glow swings, 0..1
const LAMP_JITTER_DEPTH = 0.025;  // the faster buzz on top
// The flicker only ever DIMS. Letting k rise above 1 multiplies a baked lamp's
// colour past white, which clips — and clipped white spreading over the bulb is
// exactly what reads as a fake glow when you're standing next to it.
const LAMP_FLICKER_CEILING = 1.0;

// =========================================================== curtain
const CURTAIN_MESH_PATTERN = /curtain/i;
// Toned down: the curtain hangs close to the wall, the window frame and the
// bookshelf, so there's very little room to swing before it pushes through
// them. Amplitude is what drives that, so it's kept small — the motion reads
// through the slow wander and the phase offset rather than through distance
// travelled.
const CURTAIN_SWAY_AMPLITUDE = 0.022; // radians (was 0.055 - clipped)
const CURTAIN_SWAY_SPEED = 0.45;
const CURTAIN_DRIFT_AMPLITUDE = 0.010;
const CURTAIN_DRIFT_SPEED = 0.19;
// Walking up to it stirs it, but only slightly now — a big proximity gain was
// the other half of the clipping.
const CURTAIN_PROXIMITY_GAIN = 0.7;
const CURTAIN_PROXIMITY_RANGE = 1.4; // metres

let curtainPivot = null;
let curtainAnchor = new THREE.Vector3();
let curtainGust = 0; // eased proximity response, so it swells instead of snapping

function initCurtain(model, scene) {
  let curtainMesh = null;
  model.traverse((obj) => {
    if (obj.isMesh && CURTAIN_MESH_PATTERN.test(obj.name || "") && !curtainMesh) curtainMesh = obj;
  });
  if (!curtainMesh) {
    console.warn("curtain sway: no curtain mesh found.");
    return false;
  }

  // Rotating the mesh directly swings it around ITS OWN local origin, which
  // sits wherever the exporter left it — nowhere near where the curtain hangs.
  // attach() reparents while preserving the world transform, so an empty pivot
  // built at the curtain's top-centre (where it meets the rod) swings it from
  // the right point.
  const box = new THREE.Box3().setFromObject(curtainMesh);
  curtainAnchor.set(
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2
  );
  curtainPivot = new THREE.Group();
  curtainPivot.position.set(
    (box.min.x + box.max.x) / 2,
    box.max.y,
    (box.min.z + box.max.z) / 2
  );
  scene.add(curtainPivot);
  curtainPivot.attach(curtainMesh);
  return true;
}

// =========================================================== camera breathing
// A very small idle bob. Enough that standing still doesn't feel like a
// screenshot, small enough that you don't consciously notice it.
const BREATH_AMPLITUDE = 0.0028; // metres
const BREATH_SPEED = 0.62;       // roughly a slow resting breath

// =========================================================== rain
// Rain seen THROUGH the window.
//
// This is the third attempt and the first correct one. The first two scrolled a
// streak texture across flat planes, which cannot work here: the plane is small
// on screen and heavily minified, so with mipmaps ON the thin streaks average
// into flat colour, and with mipmaps OFF they get point-sampled and mostly
// missed entirely. Close up you saw a little, from across the room you saw
// none. There is no filter setting that fixes both.
//
// So the drops are real objects now — sprites. A sprite is billboarded and
// sized in world units, so it covers a sensible number of pixels at any
// distance and never depends on texture filtering to survive. It also means
// the motion is genuine per-drop movement rather than a sliding texture.
//
// They live in the 15mm slot between the wall's outer face (z = -1.872) and
// the OUTSIDE backdrop (z = -1.887), so the wall occludes them and you only
// ever see them through the window opening.
const RAIN_ENABLED = true;
const RAIN_COUNT = 220;          // drops. This is "pouring".
const RAIN_FALL_MIN = 1.9;       // metres/sec
const RAIN_FALL_MAX = 3.4;
const RAIN_LEN_MIN = 0.055;      // metres — a drop is a motion-blurred streak
const RAIN_LEN_MAX = 0.135;
const RAIN_WIDTH_MIN = 0.0045;
const RAIN_WIDTH_MAX = 0.0085;
const RAIN_OPACITY = 0.85;
// Drop colour. The streak texture is drawn pure white so this multiplies it
// cleanly — change this one value and nothing else needs touching. A cool
// green-grey sits close to the wet-foliage backdrop instead of punching out of
// it the way near-white did.
const RAIN_COLOR = 0x7c8b81;

// The OUTSIDE bake is a bright sunny afternoon, which fights the rain harder
// than any amount of drop contrast can win. Knocking it down and cooling it
// off is what actually sells the weather. Runtime tint on the material only —
// the baked texture is untouched, and 1.0 disables it.
const OVERCAST_STRENGTH = 0.45;   // 1 = leave the bake alone
const OVERCAST_TINT = [0.86, 0.93, 1.06];

// The window opening measures x[-0.712, 0.056], y[0.717, 1.827]. Drops spawn
// across a slightly wider box so the edges never look like a cut-off curtain.
const RAIN_X = [-0.76, 0.10];
const RAIN_TOP = 1.95;
const RAIN_BOTTOM = 0.62;
const RAIN_Z = [-1.886, -1.874];

const rainDrops = [];

// One soft vertical streak, drawn once and shared by every drop.
function makeDropTexture() {
  const W = 16, H = 64;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, H);
  // Pure white on purpose — RAIN_COLOR does the tinting.
  grad.addColorStop(0.0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,1)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  // rounded-ish column: fade the sides too so it isn't a hard rectangle
  for (let x = 0; x < W; x++) {
    const t = 1 - Math.abs((x + 0.5) / W - 0.5) * 2;
    g.globalAlpha = Math.pow(Math.max(t, 0), 0.7);
    g.fillRect(x, 0, 1, H);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function applyOvercast(model) {
  if (OVERCAST_STRENGTH >= 1) return;
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (!m || !/outside/i.test(m.name || "") || m.userData.overcast) return;
      m.userData.overcast = true;
      m.color.setRGB(
        m.color.r * OVERCAST_STRENGTH * OVERCAST_TINT[0],
        m.color.g * OVERCAST_STRENGTH * OVERCAST_TINT[1],
        m.color.b * OVERCAST_STRENGTH * OVERCAST_TINT[2]
      );
    });
  });
}

function seedDrop(d, atTop) {
  d.sprite.position.set(
    RAIN_X[0] + Math.random() * (RAIN_X[1] - RAIN_X[0]),
    atTop ? RAIN_TOP : RAIN_BOTTOM + Math.random() * (RAIN_TOP - RAIN_BOTTOM),
    RAIN_Z[0] + Math.random() * (RAIN_Z[1] - RAIN_Z[0])
  );
  d.speed = RAIN_FALL_MIN + Math.random() * (RAIN_FALL_MAX - RAIN_FALL_MIN);
  const len = RAIN_LEN_MIN + Math.random() * (RAIN_LEN_MAX - RAIN_LEN_MIN);
  const wid = RAIN_WIDTH_MIN + Math.random() * (RAIN_WIDTH_MAX - RAIN_WIDTH_MIN);
  d.sprite.scale.set(wid, len, 1);
  d.sprite.material.opacity = RAIN_OPACITY * (0.45 + Math.random() * 0.55);
}

function initRain(scene, model) {
  rainDrops.length = 0;
  if (!RAIN_ENABLED) return 0;
  applyOvercast(model);

  const tex = makeDropTexture();
  for (let i = 0; i < RAIN_COUNT; i++) {
    // Per-drop material so each can carry its own opacity; they all share the
    // one texture, so this stays cheap.
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,     // never occludes the view behind it
      depthTest: true,       // but the wall still hides it outside the opening
      opacity: RAIN_OPACITY,
      color: new THREE.Color(RAIN_COLOR),
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 4;  // above the backdrop, below glass (10) and curtains (20)
    sprite.name = `__raindrop${i}`;
    const d = { sprite, speed: 0 };
    seedDrop(d, false);
    scene.add(sprite);
    rainDrops.push(d);
  }
  return rainDrops.length;
}

let breathOffset = 0;

// =========================================================== public
export function initAmbient(model, scene) {
  const s = initSmoke(scene);
  const d = initDust(model, scene);
  const l = initLamps(model) + initUnlitLamps(model);
  const c = initCurtain(model, scene);
  const r = initRain(scene, model);
  console.info(
    `ambient: ${s} smoke, ${d} dust, ${l} lamp material(s), curtain ${c ? "on" : "off"}, ${r} rain layer(s).`
  );
}

// Called once per frame. Every section is wrapped separately, because this
// runs unguarded every frame — an uncaught throw would kill every subsequent
// frame, not just the one feature. Each failure disables only itself.
export function updateAmbient(delta, elapsed, camera) {
  // ---- smoke ----
  try {
    smokeParticles.forEach((p) => {
      p.age += delta;
      if (p.age >= p.life) {
        p.age = 0;
        p.life = 2.6 + Math.random() * 1.6;
        p.wobblePhase = Math.random() * Math.PI * 2;
        p.driftAngle = Math.random() * Math.PI * 2;
      }
      const frac = p.age / p.life;
      const wobble = Math.sin(p.wobblePhase + frac * Math.PI * 3) * SMOKE_DRIFT * frac;
      p.sprite.position.set(
        p.origin.x + Math.cos(p.driftAngle) * wobble,
        p.origin.y + SMOKE_RISE * frac,
        p.origin.z + Math.sin(p.driftAngle) * wobble
      );
      const scale = SMOKE_BASE_SIZE * (0.6 + frac * 1.8);
      p.sprite.scale.set(scale, scale, 1);
      // fades in, holds, fades out rather than popping
      p.sprite.material.opacity = Math.sin(Math.PI * Math.min(1, frac * 1.15)) * SMOKE_PEAK_OPACITY;
    });
  } catch (err) {
    console.error("smoke: disabled —", err);
    smokeParticles.length = 0;
  }

  // ---- dust ----
  try {
    dustMotes.forEach((p) => {
      p.age += delta;
      if (p.age >= p.life) p.age = 0;
      const frac = p.age / p.life;
      const wobble = Math.sin(frac * Math.PI * 2 + p.driftPhase) * DUST_DRIFT;
      p.sprite.position.set(
        p.basePos.x + p.driftAxis.x * wobble,
        p.basePos.y + p.driftAxis.y * wobble,
        p.basePos.z + p.driftAxis.z * wobble
      );
      p.sprite.material.opacity = Math.sin(Math.PI * frac) * DUST_PEAK_OPACITY;
    });
  } catch (err) {
    console.error("dust motes: disabled —", err);
    dustMotes.length = 0;
  }

  // ---- lamps ----
  try {
    lamps.forEach((l) => {
      const slow = Math.sin(elapsed * l.speed + l.phase);
      const fast = Math.sin(elapsed * l.jitterSpeed + l.jitterPhase);
      const k = Math.min(LAMP_FLICKER_CEILING, 1 + slow * LAMP_FLICKER_DEPTH + fast * LAMP_JITTER_DEPTH);
      if (l.material.emissiveIntensity !== undefined) {
        l.material.emissiveIntensity = l.base * k;
      }
    });
    unlitLamps.forEach((l) => {
      const slow = Math.sin(elapsed * l.speed + l.phase);
      const fast = Math.sin(elapsed * l.jitterSpeed + l.jitterPhase);
      const k = Math.min(LAMP_FLICKER_CEILING, 1 + slow * LAMP_FLICKER_DEPTH + fast * LAMP_JITTER_DEPTH);
      l.material.color.copy(l.baseColor).multiplyScalar(k);
    });
  } catch (err) {
    console.error("lamp flicker: disabled —", err);
    lamps.length = 0;
    unlitLamps.length = 0;
  }

  // ---- curtain ----
  try {
    if (curtainPivot) {
      // Walking up to the curtain stirs it. Eased both ways so it swells and
      // settles rather than snapping the moment you cross a threshold.
      let want = 0;
      if (camera) {
        const dist = camera.position.distanceTo(curtainAnchor);
        want = Math.max(0, 1 - dist / CURTAIN_PROXIMITY_RANGE);
      }
      curtainGust += (want - curtainGust) * Math.min(1, delta * 1.8);
      const gain = 1 + curtainGust * CURTAIN_PROXIMITY_GAIN;

      curtainPivot.rotation.x =
        (Math.sin(elapsed * CURTAIN_SWAY_SPEED) * CURTAIN_SWAY_AMPLITUDE +
         Math.sin(elapsed * CURTAIN_DRIFT_SPEED) * CURTAIN_DRIFT_AMPLITUDE) * gain;
      // A little sideways billow too, offset in phase so it doesn't read as
      // one rigid panel pivoting.
      // Sideways billow is the axis that pushed it into the wall and the
      // frame, so it's much smaller than the front-to-back sway.
      curtainPivot.rotation.z =
        Math.sin(elapsed * CURTAIN_SWAY_SPEED * 0.7 + 1.1) * CURTAIN_SWAY_AMPLITUDE * 0.15 * gain;
    }
  } catch (err) {
    console.error("curtain sway: disabled —", err);
    curtainPivot = null;
  }

  // ---- rain ----
  try {
    for (const d of rainDrops) {
      d.sprite.position.y -= d.speed * delta;
      if (d.sprite.position.y < RAIN_BOTTOM) seedDrop(d, true);
    }
  } catch (err) {
    console.error("rain: disabled —", err);
    rainDrops.length = 0;
  }

  // ---- camera breathing ----
  // Returns the offset rather than moving the camera, so main.js stays the
  // only thing that writes camera.position and the walk clamp can't fight it.
  try {
    breathOffset = Math.sin(elapsed * BREATH_SPEED) * BREATH_AMPLITUDE;
  } catch (err) {
    breathOffset = 0;
  }
  return breathOffset;
}

export function getBreathOffset() {
  return breathOffset;
}
