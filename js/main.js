// ---------------------------------------------------------------------------
// The room — walkaround scene.
//
// Plain render: no post-processing, no look presets, no retro filters. The
// model is baked, so it renders unlit and shows exactly the lighting that was
// baked into its textures.
//
// A few exceptions to "unlit", all name-matched, all deliberate:
//   - the hair keeps real PBR shading, so its normal map and alpha cutout
//     actually do something. The rest of the character is baked like the room.
//   - the mirror gets a reflective surface
//   - the joint smokes and the curtains sway (see ambient.js)
//   - the windowpane is removed from the scene
//
// The camera start, FOV and walk bounds are HARDCODED to values measured off
// the earlier model, since every export has been 1:1 in world space.
//
// The Skyrim compass menu (js/menu/) is untouched; this file only talks to it
// through pauseState.js.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

import { isPauseMenuOpen, setPauseMenuOpen, onPauseMenuChange } from "./pauseState.js";
import { navigate, getCurrentRoute } from "./menu/router.js";
import { initAmbient, updateAmbient } from "./ambient.js?v=2026-09-01a4";
import { initVinyl, updateVinyl } from "./vinyl.js";
import { startLoaderSpin, stopLoaderSpin } from "./loaderSpin.js";

// Bumped whenever the .glb changes. The browser will happily keep serving a
// cached 16MB model even through a hard refresh, so the URL itself has to
// change — that's the only thing it can't ignore.
const MODEL_VERSION = 10;
const MODEL_URL = `models/room.glb?v=${MODEL_VERSION}`;

// A trace of the retro look — deliberately subtle, not the full pixel crunch.
//
// Renders slightly below native and lets the browser scale it back up, with
// antialiasing off so polygon edges keep a little stair-stepping. 0.85 reads
// as "not quite clean" rather than "low-res": you notice it on the ladder
// rails and window frame, not on the room as a whole.
//
// 1 = fully clean, 0.85 = current, 0.6 = obviously retro, 0.4 = crunchy.
const RENDER_SCALE = 0.85;

// Hair only. It's the one thing with a normal map worth resolving, and the
// one thing that reads wrong when it's flat. Everything else is baked and
// renders unlit — including the rest of the character.
const LIT_PATTERN = /^hair\d*$/i;

// Which materials genuinely need alpha blending. Everything else is forced
// opaque, even if the exporter marked it BLEND.
//
// This matters: transparent objects are sorted per-OBJECT by distance, not
// per-pixel, so any two of them can resolve in the wrong order depending on
// where you stand. MOON LAMP and BELT came through as BLEND without needing
// it; forcing them opaque takes them out of the sorted pass.
//
// SMALLWALLS keeps its alpha, so instead of removing it from that pass its
// draw order is pinned below the curtains (see renderOrder below) — that is
// what stops it punching through them at certain angles.
const NEEDS_ALPHA = /^(curtains|hair\d*|smallwalls|rug)$/i;

// Windowpane is removed from the scene entirely.
const HIDE_PATTERN = /window\s*pane|windowpane/i;

// Reflective.
const MIRROR_PATTERN = /^mirror$|\bmirror\b/i;

const CAMERA_EYE = new THREE.Vector3(0.3262, 1.04, -1.21);
const CAMERA_TARGET = new THREE.Vector3(-0.4828, 1.04, 0.106);
const CAMERA_FOV = 75;

// Measured off the model in world space rather than guessed:
//   FLOOR      x[-1.449, 0.705]  z[-1.872, 1.400]
//   MAINWALL   plane at x = 0.672
//   WINDOWPANE z = -1.86  (the far wall)
//   CLOSETWALL z[ 0.713, 1.280] (solid volume, not a plane)
// The old box ran ~0.54m past the far wall, which is exactly what let you walk
// out through the window. maxZ stops at the closet's front face so you can't
// walk into the closet either.
const BOUNDS = { minX: -1.449, maxX: 0.672, minZ: -1.872, maxZ: 0.713 };
const WALL_MARGIN = 0.18;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  // Off on purpose — jagged edges are the whole point of RENDER_SCALE above.
  antialias: false,
  preserveDrawingBuffer: true, // the pause menu screenshots this canvas
});
// devicePixelRatio is deliberately ignored: on a retina screen it would
// render at 2x and cancel out RENDER_SCALE entirely.
renderer.setPixelRatio(RENDER_SCALE);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161c);

const camera = new THREE.PerspectiveCamera(
  CAMERA_FOV, window.innerWidth / window.innerHeight, 0.05, 200
);
camera.position.copy(CAMERA_EYE);

// Reflection/lighting source for the few lit objects. Built from the room
// itself once it's loaded, so the character and the mirror pick up the actual
// room rather than a stock studio HDRI.
const pmrem = new THREE.PMREMGenerator(renderer);

// Only the character and the mirror see these; the baked room ignores them.
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const keyLight = new THREE.DirectionalLight(0xfff4e2, 1.1);
keyLight.position.set(2.5, 4, 1.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xcfd8e8, 0.45);
fillLight.position.set(-2.5, 1.5, -2);
scene.add(fillLight);

// ---------------------------------------------------------------- materials
// Unlit: the texture already contains the lighting.
function toUnlit(src) {
  const m = new THREE.MeshBasicMaterial({
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    map: src.map || null,
    side: src.side,
  });
  if (src.alphaMap) m.alphaMap = src.alphaMap;

  const wantsAlpha = NEEDS_ALPHA.test(src.name || "");
  if (wantsAlpha) {
    m.transparent = !!src.transparent;
    m.opacity = src.opacity !== undefined ? src.opacity : 1;
    if (src.alphaTest > 0) m.alphaTest = src.alphaTest;
    // Sheer fabric shouldn't occlude what's behind it, but flat surfaces
    // lying against other geometry should — without depth, the bookshelf and
    // bed read through the wallpaper, and the floor reads through the rug.
    m.depthWrite = /smallwall|rug/i.test(src.name || "");
  } else {
    // Forced opaque — see NEEDS_ALPHA above.
    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
  }
  m.name = src.name;
  return m;
}

// Lit: the hair. Deliberately does NOT rebuild the material — GLTFLoader
// already produced a MeshPhysicalMaterial with every map and extension wired
// up (base colour, normal, specular colour via KHR_materials_specular,
// clearcoat via KHR_materials_clearcoat). Rebuilding it as a MeshStandard
// silently dropped specular and clearcoat, because that class has no slot for
// them. So the source material is kept as-is and only the transparency
// behaviour is adjusted.
function toLit(src) {
  const m = src;
  m.envMapIntensity = 0.9;
  // Blended hair sorts per-object against itself, so strands drawn later can
  // erase strands drawn earlier. Not writing depth is what prevents that —
  // the cost is hair never occluding hair, which reads fine on soft strands.
  if (m.transparent) m.depthWrite = false;
  return m;
}

function toMirror() {
  return new THREE.MeshStandardMaterial({
    color: 0xf4f6f9,
    metalness: 1.0,   // fully metal = pure reflection, no diffuse
    roughness: 0.05,  // near-perfect; raise for an older, foggier mirror
    envMapIntensity: 2.2,
  });
}

// ---------------------------------------------------------------- mouse-look
// Lifted verbatim from the published version.
const target = new THREE.Vector3().copy(CAMERA_TARGET);
let lookYaw = 0;
let lookPitch = 0;

function syncLookAnglesFromTarget() {
  const dir = new THREE.Vector3().subVectors(target, camera.position);
  if (dir.lengthSq() < 1e-8) return;
  dir.normalize();
  lookYaw = Math.atan2(dir.x, dir.z);
  lookPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
}
syncLookAnglesFromTarget();
camera.lookAt(target);

const LOOK_SENSITIVITY = 0.0025;
const LOOK_PITCH_MAX = THREE.MathUtils.degToRad(80);
const LOOK_PITCH_MIN = THREE.MathUtils.degToRad(-60);
const LOOK_TARGET_DISTANCE = 2;

function applyLookDelta(dx, dy) {
  lookYaw -= dx * LOOK_SENSITIVITY;
  lookPitch = THREE.MathUtils.clamp(lookPitch - dy * LOOK_SENSITIVITY, LOOK_PITCH_MIN, LOOK_PITCH_MAX);
  const dir = new THREE.Vector3(
    Math.sin(lookYaw) * Math.cos(lookPitch),
    Math.sin(lookPitch),
    Math.cos(lookYaw) * Math.cos(lookPitch)
  );
  target.copy(camera.position).addScaledVector(dir, LOOK_TARGET_DISTANCE);
  camera.lookAt(target);
}

let pointerDownPos = null;
canvas.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointerDownPos || isPauseMenuOpen()) return;
  // Touch expects the opposite convention: drag right and the ROOM follows
  // your finger, like panning a photo.
  const invert = e.pointerType === "touch" ? -1 : 1;
  applyLookDelta(e.movementX * invert, e.movementY * invert);
});
canvas.addEventListener("pointerup", () => { pointerDownPos = null; });
canvas.addEventListener("pointercancel", () => { pointerDownPos = null; });
window.addEventListener("blur", () => { pointerDownPos = null; });

// ---------------------------------------------------------------- walking
const MOVE_SPEED = 1.9;
const moveKeys = { w: false, a: false, s: false, d: false };
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

// Head bob. The phase advances with distance travelled rather than with time,
// so the step rate is tied to how far you actually move and stays in sync no
// matter the frame rate. Two footfalls per stride, hence the doubled sine on
// the vertical; the roll runs at half that so the lean alternates left/right
// across the pair.
const BOB_STEPS_PER_METRE = 1.55;
const BOB_RISE = 0.0065;  // metres of vertical travel
const BOB_ROLL = 0.0028;  // radians of side-to-side lean
const BOB_EASE = 3.5;     // how fast the bob fades in when you start walking
let bobPhase = 0;
let bobBlend = 0;

// Called every frame, walking or not, so the bob can ease back out instead of
// snapping to level the instant you release the key.
function updateBob(delta, distance) {
  bobPhase += distance * BOB_STEPS_PER_METRE * Math.PI * 2;
  const wanted = distance > 0 ? 1 : 0;
  bobBlend += (wanted - bobBlend) * Math.min(1, delta * BOB_EASE);
  if (bobBlend < 0.0005) bobBlend = 0;
}

function bobRise() {
  // A plain sine, one cycle per stride. abs(sin) reads as a hop because it
  // spikes on every footfall and spends most of its time near the bottom;
  // this just sways through the resting height instead.
  return bobBlend * BOB_RISE * Math.sin(bobPhase);
}
function bobRoll() {
  return bobBlend * BOB_ROLL * Math.sin(bobPhase * 0.5 + Math.PI * 0.5);
}

function applyWalk(delta) {
  if (isPauseMenuOpen()) return;
  if (!moveKeys.w && !moveKeys.a && !moveKeys.s && !moveKeys.d) {
    updateBob(delta, 0);
    return;
  }

  camera.getWorldDirection(_forward);
  _forward.y = 0;
  if (_forward.lengthSq() === 0) { updateBob(delta, 0); return; }
  _forward.normalize();
  _right.crossVectors(_forward, camera.up).normalize();

  _move.set(0, 0, 0);
  if (moveKeys.w) _move.add(_forward);
  if (moveKeys.s) _move.sub(_forward);
  if (moveKeys.d) _move.add(_right);
  if (moveKeys.a) _move.sub(_right);
  if (_move.lengthSq() === 0) { updateBob(delta, 0); return; }
  _move.normalize().multiplyScalar(MOVE_SPEED * delta);

  const beforeX = camera.position.x;
  const beforeZ = camera.position.z;
  camera.position.x = THREE.MathUtils.clamp(
    camera.position.x + _move.x, BOUNDS.minX + WALL_MARGIN, BOUNDS.maxX - WALL_MARGIN
  );
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z + _move.z, BOUNDS.minZ + WALL_MARGIN, BOUNDS.maxZ - WALL_MARGIN
  );
  // Distance ACTUALLY covered, measured after the clamp — walk into a wall and
  // the bob stops rather than jogging on the spot.
  updateBob(delta, Math.hypot(camera.position.x - beforeX, camera.position.z - beforeZ));
}

function pressKey(k) {
  if (isPauseMenuOpen()) return;
  if (k in moveKeys) moveKeys[k] = true;
}
function releaseKey(k) {
  if (k in moveKeys) moveKeys[k] = false;
}
window.addEventListener("keydown", (e) => pressKey(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => releaseKey(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
});

Object.entries({ "mc-w": "w", "mc-a": "a", "mc-s": "s", "mc-d": "d" }).forEach(([id, key]) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  const down = (e) => { e.preventDefault(); pressKey(key); };
  const up = (e) => { e.preventDefault(); releaseKey(key); };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});

// ---------------------------------------------------------------- pause menu
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (isPauseMenuOpen()) {
    if (getCurrentRoute() !== "home") navigate("home");
    else setPauseMenuOpen(false);
  } else {
    setPauseMenuOpen(true);
  }
});

onPauseMenuChange((open) => {
  if (open) {
    renderer.render(scene, camera);
    try {
      const shot = canvas.toDataURL("image/jpeg", 0.82);
      document.getElementById("bg-layer")?.style.setProperty("--bg-image", `url(${shot})`);
    } catch (err) {
      console.error("pause menu: couldn't snapshot the canvas —", err);
    }
    pointerDownPos = null;
    moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  }
});

document.getElementById("pause-open-btn")?.addEventListener("click", () => {
  if (!isPauseMenuOpen()) setPauseMenuOpen(true);
});
document.getElementById("pause-close-btn")?.addEventListener("click", () => {
  setPauseMenuOpen(false);
});

// ---------------------------------------------------------------- load
const loadingScreen = document.getElementById("loading-screen");
const loadingSub = document.querySelector("#loading-screen .loading-sub");

// Spin something on the loading screen while the room downloads.
startLoaderSpin();
if (loadingSub) loadingSub.textContent = "0%"; // so it never sits blank

const draco = new DRACOLoader();
draco.setDecoderPath("menu/draco/");
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;
    const cache = new Map();
    let unlit = 0, lit = 0, mirrors = 0, hidden = 0;

    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const name = obj.name || "";
      const parentName = obj.parent?.name || "";

      if (HIDE_PATTERN.test(name) || HIDE_PATTERN.test(parentName)) {
        obj.visible = false;
        hidden++;
        return;
      }

      if (MIRROR_PATTERN.test(name) || MIRROR_PATTERN.test(parentName)) {
        obj.material = toMirror();
        mirrors++;
        return;
      }

      const isLit = LIT_PATTERN.test(name) || LIT_PATTERN.test(parentName);

      // Explicit order for the transparent surfaces so they can never resolve
      // against each other by accident: walls first, then curtains, which hang
      // in front of them and must always win.
      // The rug sits on the floor, under everything, so it draws first.
      if (/^rug$/i.test(name) || /^rug$/i.test(parentName)) obj.renderOrder = 1;
      if (/smallwall/i.test(name) || /smallwall/i.test(parentName)) obj.renderOrder = 5;
      if (/curtain/i.test(name) || /curtain/i.test(parentName)) obj.renderOrder = 20;
      const swap = (src) => {
        if (!src) return src;
        const key = `${isLit ? "L" : "U"}:${src.uuid}`;
        if (!cache.has(key)) cache.set(key, isLit ? toLit(src) : toUnlit(src));
        return cache.get(key);
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material);
      if (isLit) lit++; else unlit++;
    });

    scene.add(model);

    // Smoke off the joint + the curtain sway. After scene.add, since both
    // need world transforms resolved.
    initAmbient(model, scene);

    // Hover-to-peek on the records in the crate. Also after scene.add — it
    // raycasts, which needs resolved world matrices.
    initVinyl(model, camera, canvas);

    scene.environment = pmrem.fromScene(model, 0.02, 0.1, 40).texture;

    camera.position.copy(CAMERA_EYE);
    target.copy(CAMERA_TARGET);
    syncLookAnglesFromTarget();
    camera.lookAt(target);

    loadingScreen?.classList.add("hidden");
    // Kept spinning through the fade, then torn down — a second live WebGL
    // context is a real cost and it has no reason to exist after this.
    setTimeout(stopLoaderSpin, 700);
    document.getElementById("mobile-controls")?.classList.add("show");
    document.getElementById("pause-open-btn")?.classList.add("show");

    setPauseMenuOpen(true);

    console.info(`room: ${unlit} unlit, ${lit} lit, ${mirrors} mirror, ${hidden} hidden.`);
  },
  (evt) => {
    if (loadingSub && evt.total) {
      loadingSub.textContent = `${Math.round((evt.loaded / evt.total) * 100)}%`;
    }
  },
  (err) => {
    console.error("failed to load the room model —", err);
    if (loadingSub) loadingSub.textContent = "couldn't load the room";
  }
);

// ---------------------------------------------------------------- resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(RENDER_SCALE);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  if (!isPauseMenuOpen()) {
    applyWalk(delta);
    applyLookDelta(0, 0); // re-derive target from the new position
    // Ambient returns the camera-breathing offset rather than moving the
    // camera itself, so this stays the only place camera.position is written
    // and the walk clamp can't fight it.
    updateVinyl();
    const breath = updateAmbient(delta, clock.elapsedTime, camera);
    const restY = camera.position.y;
    const restRoll = camera.rotation.z;
    camera.position.y += breath + bobRise();
    camera.rotation.z += bobRoll();
    renderer.render(scene, camera);
    camera.position.y = restY;
    camera.rotation.z = restRoll;
  }
}
animate();
