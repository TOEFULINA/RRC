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

// Printed first thing so there is never any doubt about which build a page is
// actually running. If this line is missing from the console, the browser is
// serving cached or different files and nothing below has taken effect.
console.info("%cBUILD rain-c3 — green-grey rain",
  "background:#123;color:#8fd;padding:2px 6px;border-radius:3px");

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

import { isPauseMenuOpen, setPauseMenuOpen, onPauseMenuChange } from "./pauseState.js";
import { navigate, getCurrentRoute } from "./menu/router.js";
import { initAmbient, updateAmbient } from "./ambient.js?v=2026-09-01c3";
import { initVinyl, updateVinyl, pickVinyl, setVinylSelected, vinylFocusBox } from "./vinyl.js?v=3";
import { startLoaderSpin, stopLoaderSpin } from "./loaderSpin.js";

// Bumped whenever the .glb changes. The browser will happily keep serving a
// cached 16MB model even through a hard refresh, so the URL itself has to
// change — that's the only thing it can't ignore.
const MODEL_VERSION = 12;
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
const LIT_PATTERN = /^(hair\d*|shirts)$/i;

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

// Nothing is hidden right now. (The windowpane used to be — see GLASS_PATTERN.)
const HIDE_PATTERN = /(?!)/;

// The windowpane. It is NOT a pane: it's an 8-vertex box, 12 triangles, with
// no UVs and — the important part — no NORMAL attribute at all. That's why it
// showed up as a black slab the first time round: PBR shading with no normals
// has nothing to reflect with, so every pixel comes out black. flatShading
// fixes it by deriving the normal per-face in the shader instead of reading it
// from the geometry.
const GLASS_PATTERN = /window\s*pane|windowpane/i;

// Reflective.
const MIRROR_PATTERN = /^mirror$|\bmirror\b/i;

// Eye height, calibrated to a real 5'0".
//
// The model isn't authored in metres, so the scale was pinned using two things
// in the room whose real size is known: the door (standard interior, 80" tall,
// 1.536 units here) and the Poang chair (100cm, 0.771 units). They agree to
// within 2%, giving 1 unit = 1.31 m — which also puts the ceiling at 2.28 m
// and the mattress at 1.81 m, both sane, so the number is trustworthy.
//
// Floor plane is y = 0.317. Eye height runs ~93.5% of stature, so 5'0" (1.524 m)
// sees from 1.425 m = 1.088 units up, i.e. 1.405 — but 1.375 read better
// in practice, which is about 4'11".
//
// Both y values match so the opening gaze is level; move them together or the
// view starts tilted. Rough feel for the dial: 1.37 reads as 4'10", 1.44 as 5'2".
const CAMERA_EYE = new THREE.Vector3(0.3262, 1.375, -1.21);
const CAMERA_TARGET = new THREE.Vector3(-0.4828, 1.375, 0.106);
// 75 was very wide. A wide lens exaggerates near-field scale, which is what
// makes you feel like you fill the room — the walls bow away and everything
// close looms. Narrowing it makes the room read bigger and you smaller, which
// is the actual complaint. 62 is still roomy; 55 is cinematic, 70 is back
// toward fisheye.
const CAMERA_FOV = 62;

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
const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.1);
keyLight.position.set(2.5, 4, 1.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xcfd8e8, 0.45);
fillLight.position.set(-2.5, 1.5, -2);
scene.add(fillLight);

// ---------------------------------------------------------------- materials
// Global white balance. The lighting is baked into the textures, so there is no
// light to re-colour — the only lever is the material colour each map gets
// multiplied by. Pulling red down and blue up cools the whole room without
// touching a single texture file.
//
// Deliberately gentle, and roughly luminance-neutral so it cools rather than
// darkens. Bigger gaps between the first and last number = cooler.
//   [1, 1, 1]              off
//   [0.97, 0.995, 1.045]   current — takes the edge off
//   [0.93, 0.99, 1.09]     clearly cool
const WHITE_BALANCE = [0.97, 0.995, 1.045];

// Overall brightness, same lever. 1 = the bake as authored; lower dims the
// whole room. This multiplies the baked texture rather than dimming a light,
// so it darkens evenly and never flattens contrast the way a light change or
// an exposure tweak would.
//   1.0   as baked
//   0.82  current
//   0.7   properly dim, evening
const ROOM_BRIGHTNESS = 0.82;

function balance(color) {
  color.setRGB(
    color.r * WHITE_BALANCE[0] * ROOM_BRIGHTNESS,
    color.g * WHITE_BALANCE[1] * ROOM_BRIGHTNESS,
    color.b * WHITE_BALANCE[2] * ROOM_BRIGHTNESS
  );
  return color;
}

// Anisotropic filtering. THIS is what fixes textures looking smeared: without
// it, any surface seen at a shallow angle — the floor ahead of you, a wall you
// walk along — gets sampled from a far too small mipmap and turns to mush.
// It costs nothing meaningful, changes no resolution, and doesn't touch the
// retro look (that's RENDER_SCALE, which is a separate knob).
const MAX_ANISOTROPY = renderer.capabilities.getMaxAnisotropy();

// Nearest-neighbour magnification: up close you see hard texels instead of a
// smeared gradient. This is the "pixely" look — and it's also what kills the
// blur, since blur up close is just linear filtering interpolating between
// texels.
//
// magFilter is Nearest but minFilter keeps its mipmaps. Turning mipmaps off
// too would be the full crunch, but then every distant surface crawls and
// fizzes as you walk, which reads as broken rather than retro. Mipmaps at
// distance + hard texels up close is the combination that actually looks like
// an old game instead of a bug.
//
// Press P in the scene to flip it live and compare.
let PIXEL_TEXTURES = true;
const allTextures = new Set();

function applyFiltering(tex) {
  tex.magFilter = PIXEL_TEXTURES ? THREE.NearestFilter : THREE.LinearFilter;
  tex.minFilter = PIXEL_TEXTURES
    ? THREE.NearestMipmapLinearFilter
    : THREE.LinearMipmapLinearFilter;
  tex.anisotropy = MAX_ANISOTROPY;
  tex.needsUpdate = true;
}

function sharpen(tex) {
  if (!tex || allTextures.has(tex)) return tex;
  allTextures.add(tex);
  applyFiltering(tex);
  return tex;
}

function setPixelTextures(on) {
  PIXEL_TEXTURES = on;
  for (const t of allTextures) applyFiltering(t);
  // The canvas renders below native (RENDER_SCALE) and the browser stretches
  // it back up. Smooth stretching is the other half of the blur; pixelated
  // stretching keeps the edges hard.
  canvas.style.imageRendering = on ? "pixelated" : "auto";
  console.info(`pixel textures: ${on ? "on" : "off"}`);
}
// Every map slot a material might carry.
const MAP_SLOTS = [
  "map", "alphaMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap",
  "emissiveMap", "specularColorMap", "specularIntensityMap", "clearcoatMap",
  "clearcoatNormalMap", "clearcoatRoughnessMap", "sheenColorMap", "bumpMap",
];
function sharpenAll(mat) {
  if (!mat) return mat;
  for (const slot of MAP_SLOTS) if (mat[slot]) sharpen(mat[slot]);
  return mat;
}

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
    // The wallpaper and the rug must occlude what's behind them, so they keep
    // depth writing. But a BLENDED surface writes depth even where it is fully
    // transparent — which meant the window cut-out in the wallpaper was still
    // laying down depth across the whole opening and culling anything outside.
    // alphaTest discards those fragments outright, so the hole is a real hole.
    const solidish = /smallwall|rug/i.test(src.name || "");
    m.depthWrite = solidish;
    if (solidish) m.alphaTest = Math.max(m.alphaTest || 0, 0.5);
  } else {
    // Forced opaque — see NEEDS_ALPHA above.
    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
  }
  m.name = src.name;
  balance(m.color);
  return sharpenAll(m);
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
  return sharpenAll(m);
}

// Faint, reflective, and never occluding: depthWrite is off so the rain and
// the view behind it always come through, and the render order sits above the
// rain (3) but below the curtains (20).
function toGlass() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xdce7f2,
    metalness: 0,
    roughness: 0.06,
    transparent: true,
    opacity: 0.11,
    envMapIntensity: 1.6,
    flatShading: true,   // the geometry carries no normals — see GLASS_PATTERN
    side: THREE.DoubleSide,
    depthWrite: false,
  });
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
let dragDistance = 0;
canvas.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  dragDistance = 0;
});
canvas.addEventListener("pointermove", (e) => {
  // Hover cue on the chair, same idea as the records. Only while idle: mid-drag
  // you are looking around, not pointing at anything.
  if (SEAT_ENABLED && !pointerDownPos && !seated && !camTween && !isPauseMenuOpen() && e.pointerType !== "touch") {
    setSeatHover(pickSeat(e));
  }
  if (!pointerDownPos || isPauseMenuOpen()) return;
  dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
  // Touch expects the opposite convention: drag right and the ROOM follows
  // your finger, like panning a photo.
  const invert = e.pointerType === "touch" ? -1 : 1;
  applyLookDelta(e.movementX * invert, e.movementY * invert);
});
canvas.addEventListener("pointerup", (e) => {
  const wasClick = pointerDownPos && dragDistance < 6;
  pointerDownPos = null;
  if (!wasClick || isPauseMenuOpen() || camTween) return;
  if (focusedVinyl) { unfocusVinyl(); return; }
  if (seated) { standUp(); return; }
  const record = pickVinyl(e.clientX, e.clientY);
  if (record) { focusVinyl(record); return; }
  if (pickSeat(e)) sitDown();
});
canvas.addEventListener("pointercancel", () => { pointerDownPos = null; });
window.addEventListener("blur", () => { pointerDownPos = null; });

// ---------------------------------------------------------------- sitting
// Click the Poang and the camera drops into it and looks OUT into the room —
// the opposite of every "focus on an object" view. Ported from the published
// version's computeSeatTransform, rebuilt for this scene's camera (the old one
// leaned on OrbitControls, a tween helper and a viewState machine that don't
// exist here any more).
//
// There is no reliable way to read "which way does this chair face" off the
// geometry — a Poang's footprint is nearly symmetric — so it faces whichever
// way points toward the room's open interior, which is how a chair would
// actually be arranged to sit in.
// OFF. Sitting is disabled — it was costing frames on mobile and isn't worth
// it. Flipping this back to true restores the whole feature; everything below
// is intact and gated on it, nothing was deleted.
//
// If you ever want it back on desktop only, the condition to use is
// `!matchMedia("(hover: none) and (pointer: coarse)").matches` rather than a
// screen-width check — it's the touch-ness that costs, not the size.
const SEAT_ENABLED = false;
const SEAT_PATTERN = /^poang$/i;
const SEAT_FOV = 58;             // slightly tighter than standing; not a zoom
const SEAT_FORWARD_NUDGE = 0.12; // off dead-centre so you aren't inside the backrest
const SEAT_LOOK_DISTANCE = 3;
const SEAT_LOOK_UP = 0.55;       // raises the look-at, tilting the view up off the floor
const SEAT_TWEEN_SECONDS = 0.75;
const SEAT_HOVER_SCALE = 1.03;
// Where the eyes sit up the chair's own height. Measured rather than guessed:
// the Poang spans y 0.331 to 1.102, and a seated eye lands around y 1.04 —
// just under the top of the backrest. That is 0.92 of the way up.
const SEAT_HEIGHT_FRACTION = 0.92;

const seatMeshes = [];
let seatGroup = null;
let seatBaseScale = null;
let seated = false;
let seatHovered = false;
let preSeat = null;
let camTween = null;

const seatRay = new THREE.Raycaster();
const seatPointer = new THREE.Vector2();

function initSeat(model) {
  seatMeshes.length = 0;
  if (!SEAT_ENABLED) return 0;
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!SEAT_PATTERN.test(obj.name || "") && !SEAT_PATTERN.test(obj.parent?.name || "")) return;
    seatMeshes.push(obj);
    if (!seatGroup) {
      seatGroup = SEAT_PATTERN.test(obj.name || "") ? obj : obj.parent;
      seatBaseScale = seatGroup.scale.clone();
    }
  });
  if (!seatMeshes.length) console.warn(`seat: nothing matched ${SEAT_PATTERN} — sitting is off.`);
  return seatMeshes.length;
}

function computeSeatPose() {
  seatGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(seatGroup);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());

  const roomCentre = new THREE.Vector3(
    (BOUNDS.minX + BOUNDS.maxX) / 2, centre.y, (BOUNDS.minZ + BOUNDS.maxZ) / 2
  );
  const face = new THREE.Vector3().subVectors(roomCentre, centre);
  face.y = 0;
  if (face.lengthSq() < 1e-6) face.set(0, 0, 1);
  face.normalize();

  const eyeY = box.min.y + size.y * SEAT_HEIGHT_FRACTION;
  const pos = new THREE.Vector3(centre.x, eyeY, centre.z).addScaledVector(face, SEAT_FORWARD_NUDGE);
  const look = pos.clone().addScaledVector(face, SEAT_LOOK_DISTANCE);
  look.y = eyeY + SEAT_LOOK_UP;

  const dir = look.sub(pos).normalize();
  return {
    pos,
    yaw: Math.atan2(dir.x, dir.z),
    pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)),
  };
}

// Shortest way round the circle, so standing up never spins the long way.
function shortestAngle(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function startCamTween(to, onDone) {
  camTween = {
    fromPos: camera.position.clone(), toPos: to.pos.clone(),
    fromYaw: lookYaw, dYaw: shortestAngle(lookYaw, to.yaw),
    fromPitch: lookPitch, dPitch: to.pitch - lookPitch,
    fromFov: camera.fov, toFov: to.fov,
    t: 0, onDone,
  };
}

function updateCamTween(delta) {
  if (!camTween) return false;
  camTween.t = Math.min(1, camTween.t + delta / SEAT_TWEEN_SECONDS);
  // smoothstep — no abrupt start or stop
  const k = camTween.t * camTween.t * (3 - 2 * camTween.t);
  camera.position.lerpVectors(camTween.fromPos, camTween.toPos, k);
  lookYaw = camTween.fromYaw + camTween.dYaw * k;
  lookPitch = camTween.fromPitch + camTween.dPitch * k;
  camera.fov = camTween.fromFov + (camTween.toFov - camTween.fromFov) * k;
  camera.updateProjectionMatrix();
  if (camTween.t >= 1) {
    const done = camTween.onDone;
    camTween = null;
    done?.();
  }
  return true;
}

function sitDown() {
  if (seated || camTween || !seatGroup) return;
  preSeat = { pos: camera.position.clone(), yaw: lookYaw, pitch: lookPitch, fov: camera.fov };
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  setSeatHover(false);
  const pose = computeSeatPose();
  pose.fov = SEAT_FOV;
  startCamTween(pose, () => { seated = true; });
}

function standUp() {
  if (!seated || camTween || !preSeat) return;
  seated = false;
  const back = { pos: preSeat.pos, yaw: preSeat.yaw, pitch: preSeat.pitch, fov: preSeat.fov };
  preSeat = null;
  startCamTween(back, null);
}

// ---------------------------------------------------------------- vinyl focus
// Click a raised record and the camera snaps round to look at its cover.
// Same tween as the chair, opposite intent: the chair puts you INSIDE the
// object looking out, this puts you in front of it looking in.
//
// Which way does a cover face? Same trick the published version used for this:
// there is nothing in the geometry that says, so it faces whichever way points
// toward the room's open interior — a record in a crate against a wall is only
// ever viewable from the room side.
const VINYL_FOCUS_FOV = 34;
const VINYL_FOCUS_FILL = 0.82;   // fraction of frame height the cover fills
let focusedVinyl = null;

function focusVinyl(mover) {
  if (focusedVinyl || seated || camTween) return;
  mover.updateMatrixWorld(true);
  // The RISEN centre, not the current one — see vinylFocusBox.
  const { centre, size } = vinylFocusBox(mover);

  const roomCentre = new THREE.Vector3(
    (BOUNDS.minX + BOUNDS.maxX) / 2, centre.y, (BOUNDS.minZ + BOUNDS.maxZ) / 2
  );
  const face = new THREE.Vector3().subVectors(roomCentre, centre);
  face.y = 0;
  if (face.lengthSq() < 1e-6) face.set(0, 0, 1);
  face.normalize();

  // Back off far enough that the cover fills VINYL_FOCUS_FILL of the frame.
  const half = Math.max(size.x, size.y, size.z) * 0.5;
  const dist = (half / VINYL_FOCUS_FILL) / Math.tan(THREE.MathUtils.degToRad(VINYL_FOCUS_FOV) / 2);
  const pos = centre.clone().addScaledVector(face, dist);

  const dir = centre.clone().sub(pos).normalize();
  preSeat = { pos: camera.position.clone(), yaw: lookYaw, pitch: lookPitch, fov: camera.fov };
  focusedVinyl = mover;
  setVinylSelected(mover);          // hold it fully out of the crate
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  startCamTween({
    pos,
    yaw: Math.atan2(dir.x, dir.z),
    pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)),
    fov: VINYL_FOCUS_FOV,
  }, null);
}

function unfocusVinyl() {
  if (!focusedVinyl || camTween || !preSeat) return;
  focusedVinyl = null;
  setVinylSelected(null);
  const back = { pos: preSeat.pos, yaw: preSeat.yaw, pitch: preSeat.pitch, fov: preSeat.fov };
  preSeat = null;
  startCamTween(back, null);
}

function setSeatHover(on) {
  if (on === seatHovered || !seatGroup) return;
  seatHovered = on;
  seatGroup.scale.copy(seatBaseScale).multiplyScalar(on ? SEAT_HOVER_SCALE : 1);
  // Its own class rather than the vinyl's "hovering": both systems raycast
  // independently, so sharing one class would let whichever ran last clear it.
  canvas.classList.toggle("hovering-seat", on);
}

function pickSeat(e) {
  if (!SEAT_ENABLED || !seatMeshes.length) return false;
  const rect = canvas.getBoundingClientRect();
  seatPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  seatPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  seatRay.setFromCamera(seatPointer, camera);
  return seatRay.intersectObjects(seatMeshes, false).length > 0;
}

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
  if (!(k in moveKeys)) return;
  // Trying to walk is the natural way to say "I'm done looking at this".
  if (focusedVinyl) { unfocusVinyl(); return; }
  if (seated) { standUp(); return; }
  moveKeys[k] = true;
}
function releaseKey(k) {
  if (k in moveKeys) moveKeys[k] = false;
}
window.addEventListener("keydown", (e) => pressKey(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => releaseKey(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
});

// On-screen d-pad (touch only — see #mobile-controls). Each button just holds
// the matching key down, so it goes through exactly the same movement path as
// a real keyboard rather than being a second implementation that can drift.
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
  if (e.key.toLowerCase() !== "p" || isPauseMenuOpen()) return;
  setPixelTextures(!PIXEL_TEXTURES);
});

// Press I to invert the menu's colours. See pause-bridge.css.
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "i") return;
  const root = document.getElementById("pause-menu-root");
  const on = root?.classList.toggle("menu-inverted");
  console.info(`menu inverted: ${on ? "on" : "off"}`);
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (isPauseMenuOpen()) {
    if (getCurrentRoute() !== "home") navigate("home");
    else setPauseMenuOpen(false);
  } else {
    setPauseMenuOpen(true);
  }
});

// The last frame the player actually saw, kept so it can be put back. Skills
// swaps #bg-layer to its own sky and restores what it found — but anything
// that leaves the layer holding another screen's image means the compass shows
// that instead of the room. Re-applying on every return to the compass makes
// the POV backdrop the one guaranteed state rather than the default one.
let pauseShot = null;

function applyPauseShot() {
  const layer = document.getElementById("bg-layer");
  if (!layer || !pauseShot) return;
  layer.classList.remove("bg-panning");
  layer.style.backgroundPosition = "";
  layer.style.setProperty("--bg-image", `url(${pauseShot})`);
}

window.addEventListener("hashchange", () => {
  if (isPauseMenuOpen() && getCurrentRoute() === "home") applyPauseShot();
});

onPauseMenuChange((open) => {
  if (open) {
    renderer.render(scene, camera);
    try {
      pauseShot = canvas.toDataURL("image/jpeg", 0.82);
      applyPauseShot();
    } catch (err) {
      console.error("pause menu: couldn't snapshot the canvas —", err);
    }
    pointerDownPos = null;
    moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  }
});

document.getElementById("pause-open-btn")?.addEventListener("click", () => {
  if (isPauseMenuOpen()) return;
  // Always land on the compass. The route lives in the URL hash, so without
  // this you reopen wherever you last were — usually Items.
  navigate("home");
  setPauseMenuOpen(true);
});
document.getElementById("pause-close-btn")?.addEventListener("click", () => {
  setPauseMenuOpen(false);
});

// ---------------------------------------------------------------- load
const loadingScreen = document.getElementById("loading-screen");
const loadingSub = document.querySelector("#loading-screen .loading-sub");

// Spin something on the loading screen while the room downloads.
startLoaderSpin();

const draco = new DRACOLoader();
draco.setDecoderPath("menu/draco/");
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;
    const cache = new Map();
    let unlit = 0, lit = 0, mirrors = 0, hidden = 0, glass = 0;

    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const name = obj.name || "";
      const parentName = obj.parent?.name || "";

      if (HIDE_PATTERN.test(name) || HIDE_PATTERN.test(parentName)) {
        obj.visible = false;
        hidden++;
        return;
      }

      if (GLASS_PATTERN.test(name) || GLASS_PATTERN.test(parentName)) {
        obj.material = toGlass();
        obj.renderOrder = 10;
        glass++;
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
      //
      // MATCH ON MATERIAL NAME, NOT JUST OBJECT NAME. The wallpaper lives on a
      // multi-material node, so the object carrying it is called "FLOOR_3" —
      // a name-only test never matched it and its renderOrder silently stayed
      // at 0. That is why it drew before everything else and why the rain
      // behind the window was being depth-culled by it.
      const matNames = (Array.isArray(obj.material) ? obj.material : [obj.material])
        .map((m) => m?.name || "").join(" ");
      const tag = `${name} ${parentName} ${matNames}`;
      if (/\brug\b/i.test(tag)) obj.renderOrder = 1;
      if (/smallwall/i.test(tag)) obj.renderOrder = 5;
      if (/curtain/i.test(tag)) obj.renderOrder = 20;
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
    const seats = initSeat(model);
    console.info(seats ? `seat: ${seats} mesh(es) — click the chair to sit.` : "seat: disabled.");

    scene.environment = pmrem.fromScene(model, 0.02, 0.1, 40).texture;

    setPixelTextures(PIXEL_TEXTURES);


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

    console.info(`room: ${unlit} unlit, ${lit} lit, ${mirrors} mirror, ${glass} glass, ${hidden} hidden.`);
  },
  // No progress readout by design — the spinning shoe is the loading state.
  // The handler stays so the loader still has a progress callback attached.
  undefined,
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
    // While a sit/stand tween is running it owns the camera outright.
    if (!updateCamTween(delta) && !seated && !focusedVinyl) applyWalk(delta);
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
