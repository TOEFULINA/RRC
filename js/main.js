import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// The "?v=" on every local import below is a manual cache-bust — GitHub
// Pages doesn't send headers that make phones reliably re-fetch a changed
// module file, so a phone that already visited once can keep running an
// OLD cached copy of textures.js/room.js/etc even after a fresh push,
// with zero indication anything's stale. Bump this same tag on every
// local import (and on the <script src="js/main.js"> tag in index.html)
// whenever you push a real change, so phones are forced to re-fetch
// instead of serving what they already have cached.
import { buildCeiling, buildCarpet, ROOM, CAMERA_START } from "./room.js?v=2026-08-08ap";
import { loadRoomModel } from "./loadModel.js?v=2026-08-08au";
import { getArtCanvas, getArtTexture, makeSmokeSpriteTexture, makeDustMoteTexture } from "./textures.js?v=2026-08-08ap";
import { CLOTHING, CANVAS_DESIGNS, PAPER_ILLUSTRATIONS } from "./data.js?v=2026-08-08ap";
import { applyBakedLook } from "./bakedLook.js?v=2026-08-08ar";
import { getDesktopScreenTexture, handleDesktopScreenClick } from "./desktopScreen.js?v=2026-08-08av";
import { getPhoneScreenTexture, handlePhoneScreenClick } from "./phoneScreen.js?v=2026-08-08av";
import { isPauseMenuOpen, setPauseMenuOpen, onPauseMenuChange } from "./pauseState.js";
import { navigate, getCurrentRoute } from "./menu/router.js";

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  // Needed so the pause-menu snapshot below (canvas.toDataURL) can
  // reliably read back whatever was just rendered — without this the
  // browser is free to clear the buffer right after compositing and
  // the snapshot can come back blank.
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// Shadows are off — once your room is baked (see BAKING_GUIDE.md) its
// shading and shadows are printed straight into the textures, so a dynamic
// shadow-casting light would just double them up and look wrong. If you
// haven't baked yet, the room currently has no shadow-casting light either
// (the old "sun" was removed for this reason), so there's nothing for this
// to do until/unless you add one back.
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

// A neutral (non-tinted) environment map for real specular reflections on
// metallic/glossy surfaces (the vinyl sleeves, window glass, drawer
// hardware) — without this, metals only catch light directly from the sun
// and read flat/dull everywhere else. This is a plain vertical gradient,
// not three.js's RoomEnvironment (that one's colored panels are what
// caused the purple tint we removed earlier), so it can't reintroduce a
// color cast — just soft neutral sky-to-floor light.
function buildNeutralEnvironment(rendererInstance) {
  const pmrem = new THREE.PMREMGenerator(rendererInstance);
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(40, 24, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color("#eae4d6") },
        bottomColor: { value: new THREE.Color("#332e26") },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y * 0.5 + 0.5;
          gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        }
      `,
    })
  );
  envScene.add(sky);
  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- scene / camera
const scene = new THREE.Scene();
const bgColor = 0x121212; // neutral near-black, no color tint
scene.background = new THREE.Color(bgColor);
scene.fog = new THREE.FogExp2(bgColor, 0.025);
scene.environment = buildNeutralEnvironment(renderer);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
// Placeholder position/target — replaced with a proper frame around your
// model's actual bounding box once room.glb finishes loading (see below).
// Wide FOV for free-roam walking — wants a lot of peripheral vision, more
// like actually standing in the room. (Focus/zoom shots on props, vinyl,
// and the rack use their own much narrower FOV constants further down —
// this only affects the walk-around view.)
const target = new THREE.Vector3(0, 1.2, 0);
camera.position.set(0, 1.4, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
// OrbitControls itself is kept around only as a shared state container
// (controls.target / controls.enabled), since a lot of code below already
// reads/writes those. Its own rotate/zoom/pan/update() machinery is fully
// disabled and never called — that machinery moves the CAMERA based on a
// clamped spherical angle measured from (camera position − target), and it
// turns out that clamp runs unconditionally on every update() regardless of
// enableRotate. Once the target started orbiting the camera instead of the
// other way around, that offset pointed backwards relative to what the
// clamp expected, and it would immediately yank the camera to a clamped
// extreme — that's the "drags straight to the top" bug. Simplest fix:
// stop calling controls.update() anywhere and drive the camera ourselves.
controls.enableRotate = false;
controls.enableZoom = false; // moving the camera is WASD-only now, mouse never does it
controls.enablePan = false;

// ---------------------------------------------------------------- mouse-look
// Plain first-person look: dragging only ever changes which way the camera
// faces (yaw/pitch), set directly via camera.lookAt — it never touches
// camera.position. `target` is kept in sync purely so the rest of the code
// (focus-view tweens, camera framing, WASD below) that already reads/writes
// controls.target as "the point being looked at" keeps working unchanged.
let lookYaw = 0;
let lookPitch = 0;
function syncLookAnglesFromTarget() {
  const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
  if (dir.lengthSq() < 1e-8) return; // camera and target coincide — nothing to derive, keep current angles
  dir.normalize();
  lookYaw = Math.atan2(dir.x, dir.z);
  lookPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
}
syncLookAnglesFromTarget();
camera.lookAt(controls.target);

const LOOK_SENSITIVITY = 0.0025; // radians per pixel of drag
const LOOK_PITCH_MAX = THREE.MathUtils.degToRad(80); // look up toward the ceiling
const LOOK_PITCH_MIN = THREE.MathUtils.degToRad(-60); // look down without pointing straight at the floor
const LOOK_TARGET_DISTANCE = 2; // meters — arbitrary, just how far out "target" sits so the room-clamp/tween code has a real point to work with

function applyLookDelta(dx, dy) {
  lookYaw -= dx * LOOK_SENSITIVITY;
  lookPitch = THREE.MathUtils.clamp(lookPitch - dy * LOOK_SENSITIVITY, LOOK_PITCH_MIN, LOOK_PITCH_MAX);
  const dir = new THREE.Vector3(
    Math.sin(lookYaw) * Math.cos(lookPitch),
    Math.sin(lookPitch),
    Math.cos(lookYaw) * Math.cos(lookPitch)
  );
  controls.target.copy(camera.position).addScaledVector(dir, LOOK_TARGET_DISTANCE);
  camera.lookAt(controls.target);
}

// ---------------------------------------------------------------- lighting
// Note: intensities are tuned high because three.js (r155+) uses physically-based
// photometric light units, where point-light intensity needs to be much larger
// than pre-r155 versions to read as "bright" at room scale.
// All colors below are neutral/warm-white on purpose — no tinted environment
// map, so your model's real material colors (and the carpet especially)
// read true instead of getting washed with a color cast.
// Positions/ranges below are placeholders — repositioned around the model's
// real bounding box once room.glb loads (see loadRoomModel(...).then(...)).
// Once your room is baked, none of this lights the room itself anymore —
// the baked meshes are unlit (see js/bakedLook.js) and get their shading
// straight from their own textures. What's left here is just soft fill for
// the still-real-time-lit extras: the closet rod/hangers (room.js) and the
// generated fallback carpet, if you haven't baked a real floor yet.
scene.add(new THREE.AmbientLight("#ffffff", 0.15));

const hemi = new THREE.HemisphereLight("#dfe6f0", "#2a2620", 0.25);
scene.add(hemi);

// warm accent point light, parked at the ceiling fixture once the model
// loads (see below) — reads as "the room's own lamp is casting a bit of
// warm glow nearby," on top of the baked textures rather than instead of
// them
const keyLight = new THREE.PointLight("#ffe3b0", 6, 20, 2);
keyLight.position.set(0, 2.4, 2);
scene.add(keyLight);

// ---------------------------------------------------------------- room model
const allInteractiveObjects = [];
const modelVinyls = []; // { title, texture } for the real Vinyl_N meshes baked into your model
const loadingSub = document.querySelector("#loading-screen .loading-sub");

// Matches the vinyl record meshes directly by name, anywhere in the model —
// "Box_n3d"/"Box_n3d2".."Box_n3d16" in your current export (redone with
// correct UVs), or the older "Vinyl_1".."Vinyl_20" naming, whichever shows
// up. Deliberately NOT gated behind first finding a parent group by exact
// name (e.g. "vinyl new") — that was a single point of failure where one
// unexpected name meant every record silently got skipped with nothing to
// fall back on.
const VINYL_MESH_PATTERN = /^(Box_n3d|Vinyl[ _]\d+)/i;

// the window glass ("WINDOWPANE" material) is a near-black metallic/glass
// material with no environment map to reflect, and there's no exterior sky
// geometry behind it — so with nothing but the room's dark background color
// showing through, it reads as pitch black night outside. Tagging it with a
// soft daylight emissive fixes that without needing a full skybox.
const WINDOW_MESH_PATTERN = /window\s*pane/i;
// Now that there's a real WindowBackdrop object outside (see below), the
// glass should actually be see-through instead of faked with an emissive
// tint — GLASS_OPACITY is how much of the room's own reflection/tint stays
// on top of the backdrop showing through (0 = fully clear, 1 = opaque).
const GLASS_OPACITY = 0.35;

// The fake-exterior backdrop (big cylinder/box outside the window, modeled
// in Blender) — name that object "WindowBackdrop" (anything starting with
// it) and it'll automatically get two fixes applied here, so there's no
// need to fight normals direction in Blender at all:
//   1. Forced to render double-sided, so it shows up correctly whichever
//      way its normals happen to face.
//   2. Swapped to an unlit material (same texture, just not affected by
//      the room's interior lights) — a distant exterior shouldn't visibly
//      dim/brighten when the room's lamp does.
const WINDOW_BACKDROP_MESH_PATTERN = /^WindowBackdrop/i;

// the crate sits close enough to the bed that the "back of the record" shot
// looks straight into the bedframe — we hide it for the duration of the
// zoomed-in focus view instead of trying to dodge it with camera placement
const BEDFRAME_MESH_PATTERN = /bedframe/i;

// the standalone bookshelf's normal map is reading as way too bumpy/noisy
// (not the closet one, which is fine) — anchored so it only matches
// "Bookshelf_1..." and not "Closet_Bookshelf..."
const BOOKSHELF_MESH_PATTERN = /^Bookshelf[ _]1/i;

// walking WASD shouldn't let you clip straight through furniture — the
// drawers, the closet wall, and the ladder get the same hard-stop
// treatment as the outer room walls
const OBSTACLE_MESH_PATTERN = /^(Drawers|Closet_wall|Ladder)/i;

// nudges the stool a bit further toward the window/sunlight — direction
const OBSTACLE_MARGIN = 0.15; // meters — gives the camera a little "body" so it can't hug the exact edge
const obstacleBoxes = []; // { minX, maxX, minZ, maxZ }
const bedframeMeshes = [];

// the shirts actually hanging on the closet rod get their own "browse the
// rack" interaction (see the rack focus system below) instead of the
// generic per-item zoom — camera holds one fixed view of the closet and the
// shirts themselves slide along the rod. The crumpled tee sits on a shelf,
// not the rod, so it keeps the plain per-item zoom below.
const RACK_SHIRT_PATTERN = /^hanging_tee_shirt/i;
// getLocalFrontAxis (below) just picks whichever axis is thinner and always
// assumes the POSITIVE direction along it is the decorated/front side — true
// for the original shirt exports, but the two shorts items (a different
// source file entirely) turned out modeled with that convention backwards,
// so the "turn to face camera" rotation was swinging their back/inside
// toward the viewer instead. Resting/unselected view was never affected —
// only the deliberate turn-to-face-camera math, which is exactly why this
// only needed a sign flip for these two items rather than any change to
// their actual geometry or rest position.
const FRONT_AXIS_FLIP_PATTERN = /^hanging_tee_shirt_shorts/i;
// the button-down long-sleeve shirt on its own hook — hidden per explicit
// request now that the rack is the condensed-mesh multi-design tee system;
// dropped from RACK_SHIRT_PATTERN above too so it doesn't take up a rack
// browsing slot while invisible.
const BUTTON_DOWN_SHIRT_PATTERN = /^men-long-sleeve-shirt-on-hook/i;
const modelRackShirts = []; // { title, group, baseScale, restLocalPos, axisValue } — sorted in rack order
let rackAxisKey = "x"; // which world axis the rod runs along — figured out from real positions at load time

// the crumpled tee (on a shelf, not the rod) — same "whole group is one
// clickable piece" treatment as the shoe/desk/phone/paper-stack below
const SHIRT_ROOT_PATTERN = /^crumpled_tee_shirt/i;

// the closet merch shoe — was force-hidden here because its placement
// wasn't fixable in code on the old model. Left visible now that the room's
// been rebuilt; if it's still sitting in a bad spot, re-enable the "hide
// shoe" step below (or nudge its position the same way the stool used to
// be nudged, if you'd rather reposition than hide).
const SHOE_MESH_PATTERN = /^clayshoe/i;

// standalone portfolio prop groups that are each already exactly one
// self-contained clickable unit (several mesh parts, one item) — the desk
// computer (chassis+screen) and the phone (metal+screen+glass+case). The
// paper stack USED to be lumped in here too, but it needs its own dedicated
// wiring (see "paper stack wiring" below) so each loose sheet can be tracked
// individually for the rise/turn + sift-through-the-stack interaction.
const WHOLE_GROUP_NAMES = ["desk computer - about me", "phone-contact me"];

// the paper stack on the bookshelf — 5 individual loose sheets
// (paper_001_mesh_n3d .. paper_005_mesh_n3d) sit on top of one base mesh
// (paper_stack_mesh_n3d), all under one group. Tapping the group zooms in
// like any other prop; the top sheet then flips up on its hinge to face the
// camera. Each further tap fakes "the next page" by dipping that SAME sheet
// back down, swapping its texture, then bringing it back up — see
// revealActivePaperSheet/cyclePaperDesign below.
const PAPER_STACK_GROUP_NAME = "paper stack - illustrations";
const PAPER_SHEET_MESH_PATTERN = /^paper_\d+_mesh/i;
const modelPaperSheets = []; // { mesh, originalMap, restPos, restQuat, designs } — sorted top-of-stack first, only index 0 is interactive
let paperStackGroup = null; // set once during wiring, read by the rise/turn math below

// the computer and phone each have their own actual screen mesh inside the
// group (confirmed in the model: "Screen_Screen_0_n3d" under the computer,
// "phone_screen_n3d" under the phone) — clicking either one should snap the
// camera dead-on to THAT screen specifically (tight, flat, near-orthographic
// via the same narrow FOCUS_FOV the vinyl covers use), not just center on
// the whole chassis/case bounding box the way the paper stack does.
const SCREEN_MESH_PATTERNS = {
  "desk computer - about me": /^Screen/i,
  "phone-contact me": /^phone_screen/i,
};

// the graphic design posters are several canvases under one group — clicking
// any of them frames the WHOLE wall (one shared modelProps entry, flagged
// isPosterWall so the click/step handlers can recognize it). Once that
// whole-wall view is focused, clicking an individual canvas doesn't exit or
// re-zoom — it just cycles THAT canvas to its next design from its own
// CANVAS_DESIGNS (data.js) list, collage-style, leaving the other 3 exactly
// as they were (see modelCanvasSwatches + the pointerup "focused" handler).
const POSTER_GROUP_PATTERN = /^posters - graphic design$/i;
const modelCanvasSwatches = []; // { mesh, designs, designIndex, originalMap } — one per canvas, independent of the shared wall focus

// the chair gets its own "sit down" camera snap instead of the generic
// prop zoom (see computeSeatTransform) — camera goes to roughly seated eye
// height and looks OUT into the room like you're actually sitting in it,
// rather than the camera looking AT the chair from outside
const CHAIR_MESH_PATTERN = /^Poang chair/i;
const modelSeats = []; // { title, group }

const modelSmokeParticles = []; // { sprite, origin, life, age, wobblePhase, driftAngle } — see "ambient smoke wisp" wiring
const SMOKE_RISE = 0.16; // meters over one particle's lifetime
const SMOKE_DRIFT = 0.03; // meters of side-to-side wander at peak
const SMOKE_BASE_SIZE = 0.035; // meters, sprite width at spawn
const SMOKE_PEAK_OPACITY = 0.3;

// the curtain hanging from its rod — a slow, tiny billow (front-to-back,
// like it's breathing) rather than a side-to-side swing, since there's no
// implied wind/draft anywhere else in the room; a wide side-sway would
// read as "there's a breeze" when nothing else in the scene suggests one.
const CURTAIN_MESH_PATTERN = /^curtain_01/i;
let curtainPivot = null; // THREE.Group, set once during wiring, animated in animate()
const CURTAIN_SWAY_AMPLITUDE = 0.018; // radians — small; a real gust would be much more than this
const CURTAIN_SWAY_SPEED = 0.35; // radians/sec through the sine, i.e. a slow multi-second cycle

// dust motes drifting through the window light — same sprite-particle
// family as the smoke wisp, but smaller, dimmer, far slower, and spawned
// across a volume (the window's own footprint, projected a little way into
// the room) instead of rising from one fixed point.
const modelDustMotes = []; // { sprite, basePos, driftPhase, driftAxis, life, age }
const DUST_DRIFT = 0.05; // meters of wander over a particle's lifetime
const DUST_BASE_SIZE = 0.02; // meters
const DUST_PEAK_OPACITY = 0.22; // dimmer than smoke — these are meant to be a subtle, half-noticed detail

// GLTFLoader replaces spaces in every node name with underscores when it
// builds the scene graph (three.js's own PropertyBinding.sanitizeNodeName,
// used to keep names animation-safe) — so "desk computer - about me" shows
// up at runtime as "desk_computer_-_about_me", "Poang chair_n3d" as
// "Poang_chair_n3d", etc. That's why VINYL/RACK/SHIRT matching (names that
// were already all-underscore in Blender) worked while chair/computer/
// phone/poster matching (named with spaces in Blender) silently matched
// nothing. The original, unmodified name is still saved by GLTFLoader on
// node.userData.name — this reads that back so patterns can match against
// the REAL name regardless of the runtime substitution.
function rawName(obj) {
  return (obj.userData && obj.userData.name) || obj.name || "";
}

function cleanTitle(raw) {
  return raw
    .replace(/_n3d\d*$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const modelProps = []; // { title, group } — shirts, the shoe, posters, and the desk/phone/paper-stack props

// Each model-wiring step below runs in isolation now — a bug in ANY one of
// them (a bad name pattern, an empty group, whatever) used to be able to
// throw and silently abort every step after it in the same .then(), which
// meant the CRITICAL last step — collecting allInteractiveObjects, the
// thing that actually makes anything clickable at all — would never run.
// That would look exactly like "nothing responds to hover," for reasons
// completely unrelated to whatever step actually broke. Wrapping each step
// means one broken step just logs an error and everything else (including
// the interactivity collection) still runs.
function safeStep(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`model wiring step failed: "${label}" —`, err);
  }
}

loadRoomModel((progress) => {
  if (loadingSub) loadingSub.textContent = `loading your room... ${Math.round(progress * 100)}%`;
})
  .then(({ model, box }) => {
    scene.add(model);

    // Swap in unlit baked materials wherever your Blender bake has actually
    // been run (see BAKING_GUIDE.md) — a no-op today, on your current
    // room.glb, since nothing in it is baked yet. Runs first so the AO/env
    // map step right below doesn't waste time touching materials that are
    // about to be replaced anyway.
    safeStep("baked look", () => {
      applyBakedLook(model);
    });

    // Fix ambient occlusion + tune the new environment reflections across
    // every material in the model. Your model bakes real AO into 38 of its
    // 67 materials (occlusionTexture), but glTF's AO always needs a SECOND
    // uv channel and this export only has one — three.js was silently
    // ignoring every one of those AO maps because of that missing uv2.
    // Duplicating uv into uv2 makes that baked shadowing actually render
    // for the first time. envMapIntensity is dialed down from the default
    // (1.0) so the new neutral reflections add real depth to metal/glossy
    // surfaces without overpowering the existing direct lighting balance.
    safeStep("ambient occlusion / env map fix", () => {
      model.traverse((obj) => {
        if (!obj.isMesh) return;
        const geo = obj.geometry;
        if (geo?.attributes?.uv && !geo.attributes.uv2) {
          geo.setAttribute("uv2", geo.attributes.uv);
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          if (!mat || !mat.isMeshStandardMaterial) return;
          mat.envMapIntensity = 0.25;
          mat.needsUpdate = true;
        });
      });
    });

    // frame the camera around the model's real bounding box
    safeStep("camera framing + ceiling/carpet/lights", () => {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.z, 1) * 0.5;

      ROOM.minX = box.min.x;
      ROOM.maxX = box.max.x;
      ROOM.minZ = box.min.z;
      ROOM.maxZ = box.max.z;
      ROOM.minY = box.min.y;
      ROOM.maxY = box.max.y;
      ROOM.height = size.y;

      // Start in the open rug/chair floor area (clear of the ladder in the
      // middle of the room and the bed on the left) — see CAMERA_START in
      // room.js. Narrower FOV + a shorter starting eye height makes the room
      // read as a bigger, grander space and the viewer feel smaller in it.
      camera.position.set(
        box.min.x + size.x * CAMERA_START.eyeXFrac,
        box.min.y + size.y * CAMERA_START.eyeYFrac,
        box.min.z + size.z * CAMERA_START.eyeZFrac
      );
      target.set(
        box.min.x + size.x * CAMERA_START.targetXFrac,
        box.min.y + size.y * CAMERA_START.targetYFrac,
        box.min.z + size.z * CAMERA_START.targetZFrac
      );
      controls.target.copy(target);
      controls.minDistance = radius * 0.15;
      controls.maxDistance = radius * 3.2;
      camera.lookAt(target);
      syncLookAnglesFromTarget(); // match mouse-look yaw/pitch to the real starting view direction

      // roof + ceiling light fixture (the model itself has no ceiling)
      const fixture = buildCeiling(scene, box);

      // the model's floor has no color/normal texture baked in, and a normal
      // map alone reads flat — build a real displaced carpet mesh instead
      buildCarpet(scene, model, box);

      // reposition the fill light around the real room now that we know its
      // size — the warm point light lives at the ceiling fixture
      const lightReach = Math.max(size.x, size.y, size.z) * 2.2;
      keyLight.position.set(fixture.x, fixture.y, fixture.z);
      keyLight.distance = lightReach;
    });

    // wire up the model's own vinyl records as the interactive pieces.
    // Rebuilt from scratch: find every mesh whose name matches the record
    // pattern ANYWHERE in the model — not gated behind first finding a
    // "vinyl new" parent group, which was a single point of failure (if
    // that name ever doesn't match exactly, EVERY record silently gets
    // skipped with no fallback). Group membership is now just used to sort
    // them for arrow-key stepping, not to decide whether they're clickable.
    safeStep("vinyl wiring", () => {
      const candidates = [];
      model.traverse((obj) => {
        if (obj.isMesh && VINYL_MESH_PATTERN.test(obj.name)) candidates.push(obj);
      });
      console.info(`vinyl wiring: ${candidates.length} mesh(es) matched ${VINYL_MESH_PATTERN} in the whole model.`);

      candidates.forEach((obj) => {
        // the baked normal maps on these records render as if the cover is
        // facing away from every light (near-black, "outside in the dark"
        // look) — stripping them is much more reliable than chasing the
        // tangent-space/orientation bug, and the base color art still reads fine
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (mat) {
          mat.normalMap = null;
          mat.needsUpdate = true;
        }

        // texture is purely cosmetic (used for a title/lightbox label) and
        // never gates clickability — a missing/late texture must never be
        // able to silently kill hover/click on a record again
        const tex = mat?.map;
        const idx = modelVinyls.length;
        const title = (mat?.name || `Vinyl ${idx + 1}`).replace(/[_-]+/g, " ").trim();
        modelVinyls.push({ title, texture: tex, mesh: obj });
        obj.userData = { interactive: true, kind: "vinylModel", index: idx };
      });

      if (modelVinyls.length === 0) {
        console.warn(`vinyl wiring: found NOTHING matching ${VINYL_MESH_PATTERN}. Dumping every mesh name in the model so we can see what it's actually called:`);
        const allNames = [];
        model.traverse((obj) => {
          if (obj.isMesh) allNames.push(obj.name);
        });
        console.warn(allNames);
      }
    });

    // wire up the rack shirts — figure out which real-world axis the rod
    // runs along from the actual spread of these items (more reliable than
    // guessing, since every export so far has laid the room out differently),
    // sort them into rack order along that axis, and cache each one's
    // resting local position/scale so the slide animation below can offset
    // from a known rest state.
    safeStep("rack shirt wiring", () => {
      const rackRoots = [];
      (function collectRackRoots(obj) {
        if (RACK_SHIRT_PATTERN.test(obj.name)) {
          rackRoots.push(obj);
          return;
        }
        obj.children.forEach(collectRackRoots);
      })(model);

      if (rackRoots.length) {
        const items = rackRoots.map((root) => ({
          root,
          center: new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()),
        }));
        const xs = items.map((it) => it.center.x);
        const zs = items.map((it) => it.center.z);
        const spreadX = Math.max(...xs) - Math.min(...xs);
        const spreadZ = Math.max(...zs) - Math.min(...zs);
        rackAxisKey = spreadX >= spreadZ ? "x" : "z";
        items.sort((a, b) => a.center[rackAxisKey] - b.center[rackAxisKey]);

        items.forEach(({ root, center }) => {
          const meshes = [];
          root.traverse((child) => {
            if (child.isMesh) meshes.push(child);
          });
          if (!meshes.length) return;
          const idx = modelRackShirts.length;
          const restBox = new THREE.Box3().setFromObject(root);
          const restHalfWidth = (rackAxisKey === "x" ? restBox.max.x - restBox.min.x : restBox.max.z - restBox.min.z) / 2;
          modelRackShirts.push({
            title: cleanTitle(root.name),
            group: root,
            baseScale: root.scale.clone(),
            baseQuat: root.quaternion.clone(),
            restLocalPos: root.position.clone(),
            axisValue: center[rackAxisKey],
            restHalfWidth, // resting world-space half-extent along the rack axis — used to size the neighbor-clearance push below
            rotBlend: 0, // 0 = resting orientation, 1 = fully turned to face the camera
            neighborPushBlend: 0, // eased world-space nudge away from whichever shirt is selected, so the enlarged/turned selection doesn't overlap its neighbors
          });
          meshes.forEach((m) => {
            m.userData = { interactive: true, kind: "rackShirt", index: idx };
          });
        });

        // Lock in the rack's one fixed camera view right away, using the
        // room's actual starting camera position — this also doubles as the
        // direction each shirt should turn to face once it slides to center
        // and gets selected. Computing it lazily on first click would
        // instead use wherever the player had wandered off to by then,
        // which could point "face the camera" the wrong way.
        const rackView = computeRackViewTransform();
        if (rackView) {
          const frontWorldDir = new THREE.Vector3().subVectors(rackView.pos, rackView.target);
          frontWorldDir.y = 0;
          frontWorldDir.normalize();
          const yAxis = new THREE.Vector3(0, 1, 0);
          modelRackShirts.forEach((entry) => {
            const localAxis = getLocalFrontAxis(entry.group).clone();
            if (FRONT_AXIS_FLIP_PATTERN.test(entry.group.name)) localAxis.negate();
            const restWorldDir = localAxis.clone().applyQuaternion(entry.baseQuat).normalize();
            // signed yaw between where the shirt currently faces and where
            // it needs to face, measured in the horizontal (XZ) plane
            const currentAngle = Math.atan2(restWorldDir.x, restWorldDir.z);
            const targetAngle = Math.atan2(frontWorldDir.x, frontWorldDir.z);
            let deltaYaw = targetAngle - currentAngle;
            deltaYaw = ((deltaYaw + Math.PI) % (Math.PI * 2)) - Math.PI; // normalize to [-PI, PI]
            // extra world-Y rotation applied on top of the resting pose —
            // assumes the shirt's own parent carries no rotation of its
            // own (same assumption already relied on for the parent-scale
            // fix elsewhere in this file)
            const deltaQuat = new THREE.Quaternion().setFromAxisAngle(yAxis, deltaYaw);
            entry.targetQuat = deltaQuat.multiply(entry.baseQuat);
          });
        }
      }
      console.info(`rack wiring: wired ${modelRackShirts.length} hanging shirt(s), axis="${rackAxisKey}".`);
      if (modelRackShirts.length === 0) {
        console.warn("rack wiring: no hanging shirt groups found in the model.");
      }
    });

    // remember the bedframe mesh(es) so they can be hidden during the vinyl
    // focus zoom — see BEDFRAME_MESH_PATTERN above
    safeStep("bedframe collection", () => {
      model.traverse((obj) => {
        if (obj.isMesh && BEDFRAME_MESH_PATTERN.test(obj.name)) bedframeMeshes.push(obj);
      });
    });

    // strip ONLY the normal map off the standalone bookshelf (not the
    // closet one) — that's what was reading as way too noisy/bumpy. Color
    // and ambient occlusion stay real, stripping those looked much worse.
    safeStep("bookshelf normal map strip", () => {
      model.traverse((obj) => {
        if (!obj.isMesh || !BOOKSHELF_MESH_PATTERN.test(obj.name)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          if (!mat) return;
          mat.normalMap = null;
          mat.needsUpdate = true;
        });
      });
    });

    // build hard collision boxes for furniture WASD shouldn't walk through
    safeStep("obstacle collision boxes", () => {
      model.traverse((obj) => {
        if (!obj.isMesh || !OBSTACLE_MESH_PATTERN.test(obj.name)) return;
        const b = new THREE.Box3().setFromObject(obj);
        obstacleBoxes.push({
          minX: b.min.x - OBSTACLE_MARGIN,
          maxX: b.max.x + OBSTACLE_MARGIN,
          minZ: b.min.z - OBSTACLE_MARGIN,
          maxZ: b.max.z + OBSTACLE_MARGIN,
        });
      });
    });

// wire up every "whole group is one clickable piece" prop: the crumpled
    // tee, the closet shoe, and the standalone desk/phone/paper-stack
    // groups — hover/click scales the whole group, not just the individual
    // mesh piece the pointer happened to hit.
    // walked manually (not model.traverse) so that once a root matches, we
    // don't keep descending into its children — the shoe's nested rig
    // ("clayshoe 2_n3d2" > "clayshoe 2_n3d" > mesh) reuses the same name
    // prefix at every level, so a flat traverse would double/triple-match it
    safeStep("prop wiring (shirt/desk/phone/paper-stack)", () => {
      const propRoots = [];
      const isPropRoot = (name) =>
        SHIRT_ROOT_PATTERN.test(name) || WHOLE_GROUP_NAMES.includes(name);
      (function collectPropRoots(obj) {
        if (isPropRoot(rawName(obj))) {
          propRoots.push(obj);
          return;
        }
        obj.children.forEach(collectPropRoots);
      })(model);
      propRoots.forEach((root) => {
        const meshes = [];
        root.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });
        if (!meshes.length) return;
        const idx = modelProps.length;

        // if this root has a known screen sub-mesh (computer/phone), find it
        // so the focus zoom can frame that specific mesh instead of the
        // whole group's bounding box
        const screenPattern = SCREEN_MESH_PATTERNS[rawName(root)];
        const screenMesh = screenPattern ? meshes.find((m) => screenPattern.test(rawName(m))) : null;
        if (screenPattern && !screenMesh) {
          console.warn(`prop wiring: "${rawName(root)}" expected a screen mesh matching ${screenPattern} but found none — falling back to whole-group framing.`);
        }

        // the desk computer's screen gets a live CanvasTexture (the fake
        // desktop, see js/desktopScreen.js) and the phone's screen gets a
        // mockup of the real contact form (see js/phoneScreen.js), instead
        // of whatever plain material each shipped with — swapping the map
        // here, once, at wiring time, rather than every time the screen is
        // focused.
        const isComputerScreen = rawName(root) === "desk computer - about me" && !!screenMesh;
        const isPhoneScreen = rawName(root) === "phone-contact me" && !!screenMesh;
        if (isComputerScreen || isPhoneScreen) {
          const screenMat = new THREE.MeshBasicMaterial({
            map: isComputerScreen ? getDesktopScreenTexture() : getPhoneScreenTexture(),
          });
          screenMat.toneMapped = false; // it's a screen — it emits its own light, scene lighting shouldn't touch it
          screenMesh.material = Array.isArray(screenMesh.material)
            ? screenMesh.material.map(() => screenMat)
            : screenMat;
        }

        modelProps.push({
          title: cleanTitle(rawName(root)),
          group: root,
          screenMesh,
          isComputerScreen,
          isPhoneScreen,
        });
        meshes.forEach((m) => {
          m.userData = { interactive: true, kind: "groupModel", index: idx };
        });
      });
      if (propRoots.length === 0) {
        console.warn("prop wiring: no shirt/shoe/desk/phone/paper-stack groups found in the model.");
      }
    });

    // Shoe is left visible now (see SHOE_MESH_PATTERN comment above). To go
    // back to hiding it, uncomment this block:
    //
    // safeStep("hide shoe", () => {
    //   let hiddenCount = 0;
    //   (function hideShoeRoots(obj) {
    //     if (SHOE_MESH_PATTERN.test(obj.name)) {
    //       obj.visible = false;
    //       hiddenCount++;
    //       return;
    //     }
    //     obj.children.forEach(hideShoeRoots);
    //   })(model);
    //   console.info(`hide shoe: hid ${hiddenCount} shoe root(s).`);
    // });

    safeStep("hide button-down shirt", () => {
      let hiddenCount = 0;
      (function hideButtonDownRoots(obj) {
        if (BUTTON_DOWN_SHIRT_PATTERN.test(rawName(obj))) {
          obj.visible = false;
          hiddenCount++;
          return;
        }
        obj.children.forEach(hideButtonDownRoots);
      })(model);
      console.info(`hide button-down shirt: hid ${hiddenCount} root(s).`);
    });

    // the chair — its own "sit down" camera snap (see computeSeatTransform),
    // not the generic prop zoom
    safeStep("chair wiring", () => {
      const chairRoots = [];
      (function collectChairRoots(obj) {
        if (CHAIR_MESH_PATTERN.test(rawName(obj))) {
          chairRoots.push(obj);
          return;
        }
        obj.children.forEach(collectChairRoots);
      })(model);
      chairRoots.forEach((root) => {
        const meshes = [];
        root.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });
        if (!meshes.length) return;
        const idx = modelSeats.length;
        modelSeats.push({ title: cleanTitle(rawName(root)), group: root });
        meshes.forEach((m) => {
          m.userData = { interactive: true, kind: "seatModel", index: idx };
        });
      });
      if (chairRoots.length === 0) {
        console.warn("chair wiring: no chair group found in the model.");
      }
    });

    // the graphic design posters — several canvases under one wall group.
    // ONE shared modelProps entry (flagged isPosterWall) frames the WHOLE
    // wall on click, same as any other prop. Each canvas mesh ALSO gets its
    // own "canvasSwatch" entry in modelCanvasSwatches — once the whole-wall
    // view is focused, clicking an individual canvas cycles just that one
    // (see the pointerup "focused" handler + stepCanvasSwatchDesign below)
    // instead of re-zooming, so you can build a collage across all 4.
    safeStep("poster wiring", () => {
      let posterGroup = null;
      model.traverse((obj) => {
        if (!posterGroup && POSTER_GROUP_PATTERN.test(rawName(obj))) posterGroup = obj;
      });
      if (posterGroup) {
        const canvases = [];
        posterGroup.traverse((child) => {
          if (child.isMesh) canvases.push(child);
        });
        if (canvases.length) {
          const groupPropIndex = modelProps.length;
          // focusTarget: frame the box3 around just the canvas meshes, not
          // the whole group subtree — the group can include frame/backing
          // geometry or a hung ornament that sticks out further, which was
          // inflating the bounding box and pushing the focus camera way too
          // far back (ending up outside the room entirely).
          modelProps.push({
            title: cleanTitle(rawName(posterGroup)),
            group: posterGroup,
            focusTarget: canvases,
            focusFov: POSTER_FOCUS_FOV,
            isPosterWall: true,
          });
          canvases.forEach((canvasMesh) => {
            const swatchIndex = modelCanvasSwatches.length;
            modelCanvasSwatches.push({
              mesh: canvasMesh,
              designs: CANVAS_DESIGNS[rawName(canvasMesh)] || null,
              designIndex: 0,
              // the exact original baked texture — swapping designs only
              // ever changes THIS one property on the mesh's real material,
              // never the material instance and never the geometry's uv, so
              // whatever alignment the bake already had is fully preserved
              originalMap: canvasMesh.material.map,
            });
            canvasMesh.userData = {
              interactive: true,
              kind: "canvasSwatch",
              index: swatchIndex,
              groupPropIndex,
            };
          });
        } else {
          console.warn('poster wiring: "posters - graphic design" group found but it has no canvas meshes.');
        }
      } else {
        console.warn('poster wiring: no "posters - graphic design" group found in the model.');
      }
    });

    // the paper stack — one modelProps entry for the whole group (so a tap
    // zooms in exactly like any other prop), plus each of the 5 loose sheet
    // meshes tracked individually in modelPaperSheets so the rise/turn
    // interaction can animate exactly one at a time. Sorted top-of-stack
    // first by each sheet's own local geometry height, so revealing "the
    // next one" always matches which sheet is actually physically
    // underneath the one currently showing.
    safeStep("paper stack wiring", () => {
      let stackGroup = null;
      model.traverse((obj) => {
        if (!stackGroup && rawName(obj) === PAPER_STACK_GROUP_NAME) stackGroup = obj;
      });
      if (!stackGroup) {
        console.warn(`paper stack wiring: no "${PAPER_STACK_GROUP_NAME}" group found in the model.`);
        return;
      }
      const allMeshes = [];
      stackGroup.traverse((child) => {
        if (child.isMesh) allMeshes.push(child);
      });
      const sheetMeshes = allMeshes.filter((m) => PAPER_SHEET_MESH_PATTERN.test(rawName(m)));
      if (!sheetMeshes.length) {
        console.warn(`paper stack wiring: "${PAPER_STACK_GROUP_NAME}" found but no sheet meshes matched ${PAPER_SHEET_MESH_PATTERN}.`);
        return;
      }
      sheetMeshes.forEach((m) => {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      });
      sheetMeshes.sort((a, b) => b.geometry.boundingBox.max.y - a.geometry.boundingBox.max.y);

      paperStackGroup = stackGroup;
      const groupPropIndex = modelProps.length;
      modelProps.push({
        title: cleanTitle(rawName(stackGroup)),
        group: stackGroup,
        isPaperStack: true,
      });
      // every mesh in the group (sheets + the base) is the "tap to zoom in"
      // target while in free-roam, same as any other whole-group prop
      allMeshes.forEach((m) => {
        m.userData = { interactive: true, kind: "groupModel", index: groupPropIndex };
      });
      // sheets ALSO get a paperSheetIndex — read only once already focused,
      // to tell "tap the currently-risen sheet" apart from "tap anything
      // else" (see the pointerup focused-state handler)
      // only the topmost sheet (index 0) actually animates/swaps textures —
      // the rest stay flat and untouched, purely there so the stack still
      // reads as a stack. They're still tracked here (in stacked order) in
      // case a future pass wants a sheet other than the top one interactive.
      sheetMeshes.forEach((mesh, i) => {
        const designs = i === 0 ? (PAPER_ILLUSTRATIONS[rawName(mesh)] || null) : null;
        modelPaperSheets.push({
          mesh,
          originalMap: mesh.material.map, // the true baked-blank texture — kept around so it's still reachable by cycling all the way around, just no longer the default shown
          restPos: mesh.position.clone(),
          restQuat: mesh.quaternion.clone(),
          designs,
        });
        if (i === 0) {
          mesh.userData.paperSheetIndex = 0;
          // shows a real illustration from the moment the page loads
          // (flat, resting in the stack — same texture whether risen or
          // not) instead of the blank bake, per explicit request
          if (designs && designs.length) {
            mesh.material.map = getArtTexture(designs[0], "cover");
            mesh.material.needsUpdate = true;
          }
        }
      });
      console.info(`paper stack wiring: ${sheetMeshes.length} sheet(s) wired, top-of-stack first.`);
    });

    // tint the window glass with a soft daylight emissive so it doesn't
    // read as a black void at night — see WINDOW_MESH_PATTERN above. Now
    // that a real WindowBackdrop object exists just outside, the glass is
    // made properly see-through instead of tinted with a fake emissive
    // glow, so the backdrop actually shows through it.
    safeStep("window glass transparency", () => {
      let windowCount = 0;
      model.traverse((obj) => {
        if (!obj.isMesh) return;
        if (!WINDOW_MESH_PATTERN.test(obj.name)) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((mat) => {
          if (!mat) return;
          mat.emissiveIntensity = 0;
          mat.transparent = true;
          mat.opacity = GLASS_OPACITY;
          // a dark near-opaque glass material (the metallic look it had
          // for the old fake-glow approach) reads as a black smear once
          // it's actually transparent — dial that back so it looks like
          // clear glass with a bit of tint/reflection, not a dark filter
          mat.metalness = Math.min(mat.metalness ?? 0, 0.2);
          mat.depthWrite = false; // avoids the backdrop being sorted/hidden behind the glass
          mat.needsUpdate = true;
        });
        windowCount++;
      });
      if (windowCount === 0) {
        console.warn('window glass transparency: no mesh matching "Windowpane" found in the model.');
      }
    });

    // fake exterior backdrop visible through the window — see
    // WINDOW_BACKDROP_MESH_PATTERN above for the naming convention
    safeStep("window backdrop unlit + double-sided", () => {
      let backdropCount = 0;
      model.traverse((obj) => {
        if (!obj.isMesh || !WINDOW_BACKDROP_MESH_PATTERN.test(obj.name)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const newMats = mats.map((mat) => {
          if (!mat) return mat;
          const unlit = new THREE.MeshBasicMaterial({
            name: mat.name,
            map: mat.map || null,
            // Same "emissive map = the base color map" idea as a real
            // emissive texture, just via the tools MeshBasicMaterial
            // actually has: no lighting to be dimmed BY in the first
            // place, toneMapped:false skips the renderer's ACES curve
            // (the same fix that made the "_baked" materials read at
            // their real brightness instead of darkened), and a
            // brighter-than-neutral color multiplier pushes it past
            // "just as bright as the texture" into an actual glow —
            // this is the one mesh in the room that's SUPPOSED to look
            // like a bright sky/exterior view, not a lit surface.
            color: mat.map ? new THREE.Color(1.35, 1.32, 1.22) : mat.color,
            side: THREE.DoubleSide,
          });
          unlit.toneMapped = false;
          return unlit;
        });
        obj.material = Array.isArray(obj.material) ? newMats : newMats[0];
        obj.castShadow = false;
        obj.receiveShadow = false;
        backdropCount++;
      });
      if (backdropCount > 0) {
        console.info(`window backdrop: ${backdropCount} mesh(es) made unlit + double-sided.`);
      }
    });

    // ambient smoke wisp off the joint on the loft bed — purely decorative,
    // never interactive, always playing. A handful of soft alpha-blended
    // sprites (not real volumetric raymarching, which is exactly the kind
    // of per-pixel GPU cost the mobile-lag fixes above were about removing)
    // drift up from the joint's position, spread, and fade out on a loop.
    // Cheap enough that it isn't worth gating behind viewState at all.
    safeStep("ambient smoke wisp", () => {
      const jointNode = model.getObjectByName("joint");
      if (!jointNode) {
        console.warn('ambient smoke wisp: no "joint" node found in the model.');
        return;
      }
      jointNode.updateWorldMatrix(true, false);
      const pivot = jointNode.getWorldPosition(new THREE.Vector3());

      // "joint" itself is just a rigging pivot and doesn't sit on the mesh
      // at all — its world position is off to the side of the cylinder by
      // roughly the cylinder's own length. Confirmed (via two debug marker
      // spheres, since removed) that the mesh's NEAREST bounding-box end to
      // that pivot is the correct burning-tip origin here — "farther"
      // looked right on paper but landed at the hand; "nearer" is what's
      // actually confirmed correct on screen.
      let jointMesh = null;
      jointNode.traverse((obj) => {
        if (obj.isMesh && !jointMesh) jointMesh = obj;
      });
      const origin = pivot.clone();
      if (jointMesh) {
        jointMesh.geometry.computeBoundingBox();
        const box = jointMesh.geometry.boundingBox;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // the longest local axis is the cylinder's length (filter-to-tip);
        // the other two are just its thin radius
        const axisKey = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
        const endA = center.clone();
        const endB = center.clone();
        endA[axisKey] = box.min[axisKey];
        endB[axisKey] = box.max[axisKey];
        jointMesh.updateWorldMatrix(true, false);
        endA.applyMatrix4(jointMesh.matrixWorld);
        endB.applyMatrix4(jointMesh.matrixWorld);
        origin.copy(endA.distanceTo(pivot) <= endB.distanceTo(pivot) ? endA : endB);
      } else {
        console.warn("ambient smoke wisp: no mesh found under \"joint\" — falling back to its own pivot position.");
      }
      origin.y += 0.02; // starts just above the joint's own geometry, not inside it

      const smokeTexture = makeSmokeSpriteTexture();
      const SMOKE_COUNT = 6;

      modelSmokeParticles.length = 0;
      for (let i = 0; i < SMOKE_COUNT; i++) {
        const material = new THREE.SpriteMaterial({
          map: smokeTexture,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        });
        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 5;
        scene.add(sprite);
        const life = 2.6 + Math.random() * 1.6;
        modelSmokeParticles.push({
          sprite,
          origin,
          life,
          age: Math.random() * life, // stagger so they don't all pulse in sync
          wobblePhase: Math.random() * Math.PI * 2,
          driftAngle: Math.random() * Math.PI * 2,
        });
      }
      console.info(`ambient smoke wisp: ${SMOKE_COUNT} particle(s) started at the joint.`);
    });

    // curtain sway — a tiny ambient billow, always playing, purely
    // decorative like the smoke above.
    safeStep("curtain sway", () => {
      let curtainMesh = null;
      model.traverse((obj) => {
        if (obj.isMesh && CURTAIN_MESH_PATTERN.test(rawName(obj)) && !curtainMesh) curtainMesh = obj;
      });
      if (!curtainMesh) {
        console.warn(`curtain sway: no mesh matching ${CURTAIN_MESH_PATTERN} found in the model.`);
        return;
      }

      // Rotating the curtain mesh directly would swing it around ITS OWN
      // local origin — which, like the joint prop earlier, sits wherever
      // the exporter happened to put it, nowhere near the curtain's actual
      // visual position (that bug already cost real time once this
      // session; not repeating it here). Object3D.attach() reparents a
      // child while preserving its current WORLD transform, so building an
      // empty pivot group at the curtain's own top-center (where it
      // actually hangs from the rod) and attaching the mesh to THAT means
      // rotating the pivot swings the curtain from the right point, not
      // from some arbitrary export-time origin.
      const box = new THREE.Box3().setFromObject(curtainMesh);
      const pivotPos = new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.max.y, // top of the curtain, right where it meets the rod
        (box.min.z + box.max.z) / 2
      );
      curtainPivot = new THREE.Group();
      curtainPivot.position.copy(pivotPos);
      scene.add(curtainPivot);
      curtainPivot.attach(curtainMesh);
      console.info("curtain sway: pivot attached at the rod, ready to animate.");
    });

    // dust motes drifting through the window light — purely decorative,
    // same "cheap sprites, no shading limitations to fight" family as the
    // smoke wisp, just slower/dimmer/spread over a volume instead of
    // rising from one point.
    safeStep("window dust motes", () => {
      let windowMesh = null;
      model.traverse((obj) => {
        if (obj.isMesh && /^Windowpane/i.test(rawName(obj)) && !windowMesh) windowMesh = obj;
      });
      if (!windowMesh) {
        console.warn("window dust motes: no \"Windowpane\" mesh found in the model.");
        return;
      }
      const box = new THREE.Box3().setFromObject(windowMesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      // window is thin in Z (it's a flat pane) — that's the "into the
      // room" direction motes should drift across, using X/Y for the
      // pane's actual width/height instead of guessing a fixed spread.
      const spawnHalfWidth = Math.max(size.x, size.z) / 2 * 0.85; // stay a bit inside the pane's edges
      const spawnHalfHeight = size.y / 2 * 0.85;
      const roomwardDepth = 0.45; // meters the light shaft extends into the room from the pane

      const dustTexture = makeDustMoteTexture();
      const DUST_COUNT = 10;
      modelDustMotes.length = 0;
      for (let i = 0; i < DUST_COUNT; i++) {
        const material = new THREE.SpriteMaterial({
          map: dustTexture,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        });
        const sprite = new THREE.Sprite(material);
        const s = DUST_BASE_SIZE * (0.7 + Math.random() * 0.6);
        sprite.scale.set(s, s, 1);
        sprite.renderOrder = 5;
        scene.add(sprite);
        const basePos = new THREE.Vector3(
          center.x + (Math.random() * 2 - 1) * spawnHalfWidth,
          center.y + (Math.random() * 2 - 1) * spawnHalfHeight,
          // window's own bbox sits at the very negative end of the room's Z
          // range (it's mounted on the far wall) — increasing Z from there
          // is "into the room," which is the direction the light shaft
          // should extend rather than drifting motes into the wall behind it
          center.z + Math.random() * roomwardDepth
        );
        const life = 6 + Math.random() * 5; // slow — these should barely seem to move
        modelDustMotes.push({
          sprite,
          basePos,
          driftPhase: Math.random() * Math.PI * 2,
          driftAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
          life,
          age: Math.random() * life,
        });
      }
      console.info(`window dust motes: ${DUST_COUNT} particle(s) started at the window.`);
    });

    // THIS is the step that actually makes anything clickable — it must
    // run no matter what happened above, which is the entire point of
    // wrapping every step above in safeStep().
    safeStep("interactive object collection", () => {
      scene.traverse((obj) => {
        if (obj.userData && obj.userData.interactive && !allInteractiveObjects.includes(obj)) {
          allInteractiveObjects.push(obj);
        }
      });
      console.info(`interactivity: ${allInteractiveObjects.length} clickable mesh(es) total (${modelVinyls.length} vinyl, ${modelRackShirts.length} rack shirt, ${modelProps.length} other props, ${modelSeats.length} seat).`);
    });

    // "slow the first few seconds, then fine" is the classic symptom of
    // lazy GPU work: three.js doesn't actually compile a material's shader
    // or upload its textures to the GPU until the FIRST frame that
    // material is actually drawn. With 140+ materials in this room, that
    // means the initial look-around was the thing triggering all of that
    // compile/upload cost, spread across whichever frames happened to
    // first see each object — hence the stutter fading as you look around
    // and "use up" the backlog. Forcing it all up front here, while the
    // loading screen is still covering the canvas, moves that one-time
    // cost off the first few seconds of actual gameplay.
    safeStep("precompile shaders / upload textures", () => {
      // renderer.compile() only compiles materials for objects that pass
      // frustum culling against the camera passed in — and at this point
      // camera is still sitting at the free-roam start position/orientation
      // from way earlier (startSeatedIntro hasn't repositioned it yet, see
      // below). Shirts on the rack, the poster canvases, and the vinyl crate
      // aren't necessarily inside that frustum, so they were skipped here
      // and paid their shader-compile/texture-upload cost later, on
      // whichever frame first turned to actually look at them — which is
      // exactly "sitting still, not interacting yet, and it still stutters."
      // Temporarily disabling frustum culling for the compile call forces
      // every material in the room through it up front, no matter where the
      // camera happens to be looking.
      const culledMeshes = [];
      scene.traverse((obj) => {
        if (obj.isMesh && obj.frustumCulled) {
          culledMeshes.push(obj);
          obj.frustumCulled = false;
        }
      });
      renderer.compile(scene, camera);
      culledMeshes.forEach((obj) => { obj.frustumCulled = true; });

      // Tried also forcing every material's texture through
      // renderer.initTexture() here, to get the GPU upload (not just the
      // shader compile) done ahead of time too — reverted. Uploading 150+
      // textures to the GPU synchronously, all at once, right as the
      // loading screen finishes is exactly the kind of thing that can blow
      // past a mobile GPU's memory budget and crash the tab, which lines up
      // with the "loads to 100%, then errors out" report on mobile right
      // after this shipped. Back to just the shader precompile above, which
      // was confirmed safe before this was added.
    });

    // Camera needs to be in its REAL starting position before the texture
    // preload just below can know what's actually about to be on screen —
    // run this before hiding the loading screen (not after), so there's no
    // gap where the room is visible with the wrong pre-intro camera framing.
    safeStep("seated intro", () => {
      if (!tryRestoreViewState()) startSeatedIntro();
    });

    // The shader precompile above only forces GPU *program* compilation —
    // actual texture uploads stay lazy (see the comment above it: forcing
    // every texture up front blew past mobile GPU memory budgets and
    // crashed the tab). That means whatever's on screen the instant the
    // loading screen lifts still pays a real one-time upload cost per
    // texture the first time it's actually drawn — on a mobile GPU that's
    // the "laggy first few seconds," as the backlog for the STARTING view
    // gets paid off in real time. Scoped here strictly to what the real,
    // final camera frustum can currently see — a small fraction of the
    // room's 150+ textures, not "every mesh" like the reverted attempt —
    // so it shouldn't reintroduce that memory-budget crash while still
    // eliminating the stutter for exactly what's visible on first paint.
    safeStep("preload starting-view textures", () => {
      camera.updateMatrixWorld();
      const frustum = new THREE.Frustum();
      const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      frustum.setFromProjectionMatrix(projScreenMatrix);

      const seenTextures = new Set();
      const mapSlots = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap"];
      scene.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
        if (!obj.geometry.boundingSphere) return;
        const sphere = obj.geometry.boundingSphere.clone().applyMatrix4(obj.matrixWorld);
        if (!frustum.intersectsSphere(sphere)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (!m) return;
          mapSlots.forEach((slot) => {
            const tex = m[slot];
            if (tex && !seenTextures.has(tex)) {
              seenTextures.add(tex);
              renderer.initTexture(tex);
            }
          });
        });
      });
    });

    document.getElementById("loading-screen").classList.add("hidden");

    // Only start saving once the model has actually finished loading and
    // a real (restored-or-fresh) view is in place — registering this at
    // module top-level instead would let the 2s timer fire on whatever
    // junk camera position exists before the model/intro even set up a
    // real one, and that junk could then get "restored" on the next reload.
    safeStep("view persistence", () => {
      setInterval(saveViewState, 2000);
      window.addEventListener("pagehide", saveViewState);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") saveViewState();
      });
    });
  })
  .catch((err) => {
    console.error("Failed to load models/room.glb:", err);
    if (loadingSub) loadingSub.textContent = "couldn't load the room model — check the console";
  });

// ---------------------------------------------------------------- raycasting / hover
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

function setPointerFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickIntersect() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(allInteractiveObjects, false);
  return hits.length ? hits[0].object : null;
}

let dragDistance = 0;
let pointerDownPos = null;

canvas.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  dragDistance = 0;
});
function setHoverScale(obj, factor) {
  if (!obj) return;
  // lazily capture each object's real starting scale the first time it's
  // touched, so this works for both our own props (scale 1,1,1) and the
  // model's own meshes (which may already have a non-uniform scale)
  if (!obj.userData.baseScaleVec) obj.userData.baseScaleVec = obj.scale.clone();
  obj.scale.copy(obj.userData.baseScaleVec).multiplyScalar(factor);
}

// hover on/off for whatever's currently under the pointer — routes to the
// right treatment per kind: vinyl gets the rise, shirts get a group-wide
// scale pop (scaling the individual mesh piece that got hit would look
// broken since a shirt is several parts), anything else falls back to a
// plain scale-hover.
function deactivateHover(obj) {
  if (!obj) return;
  if (obj.userData.kind === "vinylModel") {
    if (activeVinylMesh === obj) setActiveVinyl(null);
  } else if (obj.userData.kind === "groupModel") {
    setHoverScale(modelProps[obj.userData.index]?.group, 1);
  } else if (obj.userData.kind === "seatModel") {
    setHoverScale(modelSeats[obj.userData.index]?.group, 1);
  } else if (obj.userData.kind === "rackShirt") {
    // scale is driven entirely by the per-frame rack lerp in animate() (it
    // also has to handle the "selected" scale-up), so hover just flags
    // intent rather than touching .scale directly — two systems fighting
    // over the same scale each frame would fight/flicker
    const entry = modelRackShirts[obj.userData.index];
    if (entry) entry.group.userData.rackHovered = false;
  } else if (obj.userData.kind === "canvasSwatch") {
    // these meshes use an extreme 999999x compensating scale (see the
    // door/lathe comment elsewhere) to cancel out a parent's tiny scale —
    // a small, deliberate bump here is fine, but this is exactly why
    // "enter focus" must always reset whatever's hovered before losing
    // track of it (see enterPropFocus) rather than leaving it stuck
    setHoverScale(obj, 1);
  } else {
    setHoverScale(obj, 1);
  }
}
function activateHover(obj) {
  if (!obj) return;
  if (obj.userData.kind === "vinylModel") {
    setActiveVinyl(obj);
  } else if (obj.userData.kind === "groupModel") {
    setHoverScale(modelProps[obj.userData.index]?.group, 1.06);
  } else if (obj.userData.kind === "seatModel") {
    setHoverScale(modelSeats[obj.userData.index]?.group, 1.03);
  } else if (obj.userData.kind === "rackShirt") {
    const entry = modelRackShirts[obj.userData.index];
    if (entry) entry.group.userData.rackHovered = true;
  } else if (obj.userData.kind === "canvasSwatch") {
    // a subtler bump than the default 1.08 — these are big flat wall
    // pieces, an 8% grow reads as janky at that size, and it's a much
    // wider margin around whatever precision the 999999x scale needs
    setHoverScale(obj, 1.015);
  } else {
    setHoverScale(obj, 1.08);
  }
}

canvas.addEventListener("pointermove", (e) => {
  if (pointerDownPos) {
    dragDistance += Math.abs(e.clientX - pointerDownPos.x) + Math.abs(e.clientY - pointerDownPos.y);
    // stand-in-place mouse-look — see applyLookDelta above. Free-roam gets
    // it, and so does sitting in the chair (position stays put, only the
    // view direction changes — WASD is what stands you up, see
    // pressMoveKey). Every OTHER focused view (props, vinyl, rack) keeps
    // the camera fully locked, so it can't fight a focus-view tween.
    if (viewState === "free" || (viewState === "focused" && focusedKind === "seat")) {
      // Touch drag feels backwards using the same convention as mouse-look:
      // mouse-look treats the drag as steering the CAMERA (drag right, camera
      // turns right, the room slides left under it — standard FPS mouselook).
      // On a touchscreen people expect the opposite: drag right and the ROOM
      // should slide right with your finger, like panning a photo. That's
      // just the camera turning the other way, so touch input gets its delta
      // negated before it ever reaches applyLookDelta; mouse/pen are untouched.
      const invert = e.pointerType === "touch" ? -1 : 1;
      applyLookDelta(e.movementX * invert, e.movementY * invert);
    }
  }
  if (viewState !== "free") return; // no hover effects while zoomed in or mid-transition
  setPointerFromEvent(e);
  const obj = pickIntersect();
  if (obj !== hovered) {
    deactivateHover(hovered);
    hovered = obj;
    activateHover(hovered);
    canvas.classList.toggle("hovering", !!hovered);
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (dragDistance >= 6) {
    pointerDownPos = null;
    return;
  }
  if (viewState === "focused") {
    // while browsing the rack, clicking a DIFFERENT shirt re-slides to it
    // instead of exiting — the camera's already parked at the closet view,
    // only the rack needs to move. Clicking the selected shirt again (or
    // anything else) falls through to the normal exit below.
    if (focusedKind === "rack") {
      setPointerFromEvent(e);
      const obj = pickIntersect();
      if (obj && obj.userData.kind === "rackShirt" && obj.userData.index !== selectedRackIndex) {
        enterRackFocus(obj.userData.index);
        pointerDownPos = null;
        return;
      }
    }
    // while framing the whole poster wall, clicking one of the 4 canvases
    // doesn't exit or re-zoom — it just cycles THAT canvas to its next
    // design (collage-style), camera stays put so you can click through
    // each canvas independently. Clicking anything else still exits.
    if (focusedKind === "prop" && modelProps[focusedPropIndex]?.isPosterWall) {
      setPointerFromEvent(e);
      const obj = pickIntersect();
      if (obj && obj.userData.kind === "canvasSwatch") {
        activePosterCanvasIndex = obj.userData.index;
        stepCanvasSwatchDesign(obj.userData.index, 1);
        pointerDownPos = null;
        return;
      }
    }
    // while the paper stack is focused, tapping the risen sheet dips it,
    // swaps its texture, and brings it back up (fake page-flip) instead of
    // exiting — tapping anything else still exits normally below.
    if (focusedKind === "prop" && modelProps[focusedPropIndex]?.isPaperStack) {
      setPointerFromEvent(e);
      const obj = pickIntersect();
      if (obj && obj.userData.paperSheetIndex === 0) {
        cyclePaperDesign(1);
        pointerDownPos = null;
        return;
      }
    }
    // while the desk computer screen is focused, route the tap to the fake
    // desktop instead of exiting — raycasting against the screen mesh
    // directly (not the shared allInteractiveObjects list) is what actually
    // gets a .uv back, since that's the one piece of info the fake desktop
    // needs to know WHERE on its own canvas got tapped. A tap that misses
    // every hitbox (background, taskbar, etc) still falls through to the
    // normal exit below, same as tapping "nothing" anywhere else.
    if (focusedKind === "prop" && modelProps[focusedPropIndex]?.isComputerScreen) {
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(modelProps[focusedPropIndex].screenMesh, false);
      if (hits.length && hits[0].uv && handleDesktopScreenClick(hits[0].uv.x, hits[0].uv.y)) {
        pointerDownPos = null;
        return;
      }
    }
    // same idea, but for the phone's contact-form mockup (see
    // js/phoneScreen.js) — tapping a field/Submit/social icon opens the
    // real contact page or social link instead of exiting focus.
    if (focusedKind === "prop" && modelProps[focusedPropIndex]?.isPhoneScreen) {
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(modelProps[focusedPropIndex].screenMesh, false);
      if (hits.length && hits[0].uv && handlePhoneScreenClick(hits[0].uv.x, hits[0].uv.y)) {
        pointerDownPos = null;
        return;
      }
    }
    exitFocus();
    pointerDownPos = null;
    return;
  }
  if (viewState === "free") {
    setPointerFromEvent(e);
    const obj = pickIntersect();
    if (obj) {
      // wrapped so a bug in any one focus system logs to console instead of
      // just silently doing nothing — makes "I clicked X and nothing
      // happened" reports actually diagnosable from the browser console
      try {
        if (obj.userData.kind === "vinylModel") {
          enterVinylFocus(obj.userData.index);
          showOneShotSubtitle("vinyl-click", "These are the cover arts I've made!", 2900);
        } else if (obj.userData.kind === "groupModel") {
          enterPropFocus(obj.userData.index);
        } else if (obj.userData.kind === "seatModel") {
          enterSeatFocus(obj.userData.index);
        } else if (obj.userData.kind === "rackShirt") {
          enterRackFocus(obj.userData.index);
          showOneShotSubtitle("shirts-click", "I'm gonna put merch designs up here. It's not ready yet though", 3600);
        } else if (obj.userData.kind === "canvasSwatch") {
          enterPropFocus(obj.userData.groupPropIndex);
          showOneShotSubtitle("posters-click", "These are some posters I've made. Tap the canvas to switch through them!", 3400);
        } else {
          openLightbox(obj.userData.kind, obj.userData.index);
        }
      } catch (err) {
        console.error(`click handler failed for kind="${obj.userData.kind}" —`, err);
      }
    } else {
      console.debug("click: raycast hit nothing interactive at this point");
    }
  }
  pointerDownPos = null;
});

// ---------------------------------------------------------------- lightbox (clothing only)
const lightbox = document.getElementById("lightbox");
const lbCanvas = document.getElementById("lightbox-canvas");
const lbKicker = document.getElementById("lightbox-kicker");
const lbTitle = document.getElementById("lightbox-title");
const lbDesc = document.getElementById("lightbox-desc");
let lbIndex = 0;

function renderLightboxEntry() {
  const entry = CLOTHING[lbIndex];
  if (!entry) return;
  const artCanvas = getArtCanvas(entry, "clothing");
  lbCanvas.width = artCanvas.width;
  lbCanvas.height = artCanvas.height;
  const ctx = lbCanvas.getContext("2d");
  ctx.drawImage(artCanvas, 0, 0);
  lbKicker.textContent = entry.kicker || "";
  lbTitle.textContent = entry.title;
  lbDesc.textContent = entry.desc || "";
}

function openLightbox(kind, index) {
  lbIndex = index;
  renderLightboxEntry();
  lightbox.classList.remove("hidden");
}
function closeLightbox() {
  lightbox.classList.add("hidden");
}
function stepLightbox(dir) {
  lbIndex = (lbIndex + dir + CLOTHING.length) % CLOTHING.length;
  renderLightboxEntry();
}

document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
document.getElementById("lightbox-backdrop").addEventListener("click", closeLightbox);
document.getElementById("lightbox-prev").addEventListener("click", () => stepLightbox(-1));
document.getElementById("lightbox-next").addEventListener("click", () => stepLightbox(1));
window.addEventListener("keydown", (e) => {
  // The pause menu (js/menu/) claims Escape first, whether that means
  // opening it, stepping back a level within it, or closing it. Only
  // reachable once you're up and free-roaming — viewState is "focused"
  // during the seated intro, so this can't fire underneath the black
  // wake-up screen.
  if (e.key === "Escape" && isPauseMenuOpen()) {
    if (getCurrentRoute() !== "home") navigate("home");
    else setPauseMenuOpen(false);
    return;
  }
  if (!lightbox.classList.contains("hidden")) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
    return;
  }
  if (viewState === "focused") {
    if (e.key === "Escape") exitFocus();
    if (e.key === "ArrowLeft") stepFocus(-1);
    if (e.key === "ArrowRight") stepFocus(1);
    return;
  }
  if (e.key === "Escape" && viewState === "free") {
    setPauseMenuOpen(true);
  }
});

// ---------------------------------------------------------------- vinyl: rise + camera-zoom focus
// Vinyl_N meshes live inside the model's root group, which is scaled way up
// (the model was authored at a tiny local scale) — so a small local Y move
// translates into a big world-space move. We measure the mesh's actual
// world scale and work backwards to get a consistent rise regardless of
// that scale factor. This is deliberately taller than the crate so the
// record clears it completely instead of poking halfway out.
const RISE_WORLD_DISTANCE = 1.0;
let activeVinylMesh = null;

// The record's flat cover face is normal to whichever LOCAL horizontal axis
// (x or z) is thinnest in the mesh's own geometry — y is skipped since a
// record standing upright is tall (its diameter), which tells us nothing
// about which way the cover faces. This is deliberately a rougher heuristic
// than trying to sum triangle normals (which cancels out on a closed sleeve
// mesh, front vs back).
function getLocalCoverAxis(mesh) {
  if (mesh.userData.localCoverAxis) return mesh.userData.localCoverAxis;
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const axis = size.x <= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  mesh.userData.localCoverAxis = axis;
  return axis;
}

// Disambiguates which of the two opposite directions along that axis is
// actually the front of the cover, using wherever the camera happens to be
// the room's open interior rather than wherever the camera happens to be
// standing the first time this record is clicked — using live camera
// position was flipping seemingly at random depending on where you clicked
// from, and could just as easily point the camera straight into the wall
// the crate sits against as out into the room. The room's center is a
// stable, sensible stand-in for "the side someone would actually be
// looking at it from." Computed once and cached, so it's a fixed
// world-space direction (the record no longer spins to chase the camera —
// see note on RISE-only behavior below).
function getSignedCoverAxis(mesh) {
  if (mesh.userData.signedCoverAxis) return mesh.userData.signedCoverAxis;
  const axis = getLocalCoverAxis(mesh).clone();
  // full world rotation, not just yaw — this model's records lean in the
  // crate at real 3D tilts (rolled/pitched, not just spun flat), so a
  // Y-only rotation badly misjudges which way the cover actually faces
  const worldQuat = mesh.getWorldQuaternion(new THREE.Quaternion());
  const worldDir = axis.clone().applyQuaternion(worldQuat);
  const meshPos = mesh.getWorldPosition(new THREE.Vector3());
  const roomCenter = new THREE.Vector3((ROOM.minX + ROOM.maxX) / 2, meshPos.y, (ROOM.minZ + ROOM.maxZ) / 2);
  const towardRoom = new THREE.Vector3().subVectors(roomCenter, meshPos);
  towardRoom.y = 0;
  if (worldDir.dot(towardRoom) < 0) axis.negate();
  mesh.userData.signedCoverAxis = axis;
  return axis;
}

// Rise only — no spin. Spinning the record to face the camera caused it to
// sweep diagonally instead of gliding straight up, because the mesh's local
// pivot isn't centered on the disc, so rotating around Y also drags it
// sideways through world space. Straight vertical rise reads clean and the
// focus camera positions itself in front of the cover instead (see
// computeFocusTransform), so nothing needs to visually re-orient.
//
// Three rise levels: "rest" (in the crate), "hover" (mouse over it — just
// barely peeks up out of the crate, a small nudge not a real lift),
// "selected" (actually clicked/focused — rises the rest of the way to the
// height the focus camera frames it at). Hover alone should never fully
// deploy the record; only a real click does.
const HOVER_RISE_FRACTION = 0.1;
let selectedVinylMesh = null; // clicked/focused record — takes priority over hover

function setVinylRise(mesh, level) {
  if (!mesh) return;
  if (mesh.userData.baseLocalY === undefined) mesh.userData.baseLocalY = mesh.position.y;
  // position is expressed in the PARENT's space, so the conversion factor
  // from a world-space rise to a local one is the PARENT's world scale —
  // using the mesh's OWN world scale here was the actual bug: these records
  // carry their own ~20x scale baked directly onto themselves (not
  // inherited from an unscaled parent), so dividing by it was shrinking a
  // intended 1m rise down to about 5cm, which read as "barely moving"
  const worldScale = new THREE.Vector3();
  (mesh.parent || mesh).getWorldScale(worldScale);
  const fraction = level === "selected" ? 1 : level === "hover" ? HOVER_RISE_FRACTION : 0;
  const localRise = (RISE_WORLD_DISTANCE * fraction) / (worldScale.y || 1);
  mesh.userData.riseTargetY = mesh.userData.baseLocalY + localRise;
}

// mouse hover only — never overrides a record that's actually selected
// (clicked into focus), which always stays fully risen regardless of
// where the mouse is
function setActiveVinyl(mesh) {
  if (activeVinylMesh && activeVinylMesh !== mesh && activeVinylMesh !== selectedVinylMesh) {
    setVinylRise(activeVinylMesh, "rest");
  }
  activeVinylMesh = mesh || null;
  if (mesh && mesh !== selectedVinylMesh) setVinylRise(mesh, "hover");
}

// click/focus — always drives the record fully out, independent of hover
function setSelectedVinyl(mesh) {
  if (selectedVinylMesh && selectedVinylMesh !== mesh) {
    // drop the old selection back to hover height if the mouse is still
    // over it, otherwise all the way to rest
    setVinylRise(selectedVinylMesh, selectedVinylMesh === activeVinylMesh ? "hover" : "rest");
  }
  selectedVinylMesh = mesh || null;
  if (mesh) setVinylRise(mesh, "selected");
}

// "free" = normal walk-around mode. "tweening" = camera animating in/out/between
// records. "focused" = camera locked on a record's cover, waiting for a click/
// Escape/arrow key.
let viewState = "free";
let focusedVinylIndex = -1;
let focusedKind = null; // "vinyl" | "prop" — which focus system is currently active
let preFocusCam = null; // { pos, target, fov } to restore when leaving focus

const FOCUS_FOV = 15; // narrow "telephoto" FOV flattens perspective for a near-orthographic look
const FOCUS_FRAME_FRACTION = 0.95; // how much of the frame height the cover fills — higher = camera sits closer
const FOCUS_DURATION = 1.3; // seconds
// The poster wall spans ~1m across (4 canvases side by side) — at the
// telephoto FOCUS_FOV, framing that whole width pushes the camera back
// ~4x the object size, which is far enough to clip through the opposite
// wall and land outside the room. A wider, more "normal" lens keeps the
// same wide-board framing at a much shorter, room-safe distance.
const POSTER_FOCUS_FOV = 40;

// Framing math shared by every zoomed-in focus view (vinyl covers, props,
// screens). The naive version of this only checked the object against the
// VERTICAL fov, which works fine on a landscape screen (the wider
// horizontal fov always shows more around the object than the vertical
// fit needs) but crops hard on a narrow/portrait phone screen, where the
// horizontal fov is actually the tighter of the two — a poster/phone/
// computer screen wider than it is tall got its edges cut off there.
//
// The first fix for that backed the camera further away to fit the width
// too (same trick the closet rack view uses) — but several of these props
// (the desk computer especially) sit close to a wall, and a phone's much
// narrower horizontal fov needed enough EXTRA distance to fit that it
// pushed the camera clean through the wall and out of the room. Distance
// is the wrong knob to turn here. Instead, distance is always computed
// the same aspect-independent way this code used before that first fix
// (so it can never move the camera any further than it already safely
// did), and the FOV widens instead whenever a narrow screen would
// otherwise crop the width — a little extra margin around the object
// instead of a camera stuck outside the room.
function computeThinAxis(size) {
  if (size.x <= size.y && size.x <= size.z) return "x";
  if (size.z <= size.x && size.z <= size.y) return "z";
  return "y";
}
function computeFramedView(size, thinAxis, baseFov, frameFraction) {
  // "thinAxis" is whichever local axis is the object's face normal (its
  // depth) — the other two box dimensions are what's actually visible.
  // World "up" (y) reads as screen-vertical unless y itself IS the thin
  // axis (an object lying flat, screen facing straight up/down) — that
  // case falls back to using the larger of the remaining two for both,
  // a safe overestimate rather than a crop.
  let visibleHeight, visibleWidth;
  if (thinAxis === "y") {
    visibleHeight = visibleWidth = Math.max(size.x, size.z);
  } else {
    visibleHeight = size.y;
    visibleWidth = thinAxis === "x" ? size.z : size.x;
  }

  const primary = Math.max(visibleHeight, visibleWidth);
  const baseFovHalf = THREE.MathUtils.degToRad(baseFov) / 2;
  const distance = primary / 2 / (Math.tan(baseFovHalf) * frameFraction);

  // Would baseFov's implied horizontal fov actually fit visibleWidth at
  // this distance? Always yes on a landscape screen; on a narrow/portrait
  // one the horizontal fov can be tighter than the vertical one, so widen
  // the fov (never the distance) enough to cover it.
  const requiredHFovHalf = Math.atan(visibleWidth / 2 / (distance * frameFraction));
  const requiredVFovHalfForWidth = Math.atan(Math.tan(requiredHFovHalf) / camera.aspect);
  const finalFovHalf = Math.max(baseFovHalf, requiredVFovHalfForWidth);
  const fov = THREE.MathUtils.radToDeg(finalFovHalf) * 2;

  return { distance, fov };
}

function computeFocusTransform(mesh) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // frame the record's fully-risen resting spot, not wherever it happens to
  // be mid-glide right when focus is entered (hover may have only just
  // started the rise) — walk the box center up/down by however far it still
  // has left to rise, in world units. Same parent-space conversion as
  // setVinylRise above — must match or this box-center correction and
  // the actual rise disagree on how far "the rest of the way up" is.
  const worldScale = new THREE.Vector3();
  (mesh.parent || mesh).getWorldScale(worldScale);
  const targetLocalY = mesh.userData.riseTargetY ?? mesh.position.y;
  center.y += (targetLocalY - mesh.position.y) * (worldScale.y || 1);

  const { distance, fov } = computeFramedView(size, computeThinAxis(size), FOCUS_FOV, FOCUS_FRAME_FRACTION);

  // camera sits directly in front of the cover's face (see
  // getSignedCoverAxis) rather than riding whatever angle it happened to
  // already be at
  const axis = getSignedCoverAxis(mesh);
  const worldQuat = mesh.getWorldQuaternion(new THREE.Quaternion());
  const worldNormal = axis.clone().applyQuaternion(worldQuat).normalize();
  const pos = center.clone().addScaledVector(worldNormal, distance);
  return { pos, target: center, fov };
}

function enterVinylFocus(index) {
  const entry = modelVinyls[index];
  if (!entry || viewState !== "free") return;

  preFocusCam = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  hovered = entry.mesh;
  setSelectedVinyl(entry.mesh);
  focusedVinylIndex = index;
  focusedKind = "vinyl";
  setMobileCycleControlsVisible(true);
  setMobileMoveControlsVisible(false);
  controls.enabled = false;
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  canvas.classList.remove("hovering");
  viewState = "tweening";
  bedframeMeshes.forEach((m) => (m.visible = false));

  const { pos, target, fov } = computeFocusTransform(entry.mesh);
  startCameraTween(pos, target, fov, FOCUS_DURATION, () => {
    viewState = "focused";
  });
}

function exitVinylFocus() {
  if (!preFocusCam) return;
  viewState = "tweening";
  setSelectedVinyl(null);
  hovered = null;
  focusedVinylIndex = -1;
  focusedKind = null;
  setMobileCycleControlsVisible(false);
  setMobileMoveControlsVisible(true);

  const { pos, target, fov } = preFocusCam;
  startCameraTween(pos, target, fov, FOCUS_DURATION, () => {
    viewState = "free";
    controls.enabled = true;
    // camera orientation is already correct here (the tween that just
    // finished kept calling camera.lookAt(controls.target) every frame) —
    // this just resyncs mouse-look's own yaw/pitch bookkeeping to match, so
    // the next drag starts from the right place instead of jumping.
    syncLookAnglesFromTarget();
    bedframeMeshes.forEach((m) => (m.visible = true));
  });
}

function stepVinylFocus(dir) {
  if (viewState !== "focused" || !modelVinyls.length) return;
  const nextIndex = (focusedVinylIndex + dir + modelVinyls.length) % modelVinyls.length;
  const entry = modelVinyls[nextIndex];
  hovered = entry.mesh;
  setSelectedVinyl(entry.mesh);
  focusedVinylIndex = nextIndex;
  viewState = "tweening";

  const { pos, target, fov } = computeFocusTransform(entry.mesh);
  startCameraTween(pos, target, fov, 0.9, () => {
    viewState = "focused";
  });
}

// ---------------------------------------------------------------- props (shirts, shoe, posters, desk/phone/paper-stack): camera-zoom focus (same language as vinyl, no rise)
// A prop group's front isn't guaranteed by rotation composition the way a
// single mesh's is, so this works entirely in world space off the group's
// combined bounding box — simpler, and works whether the "group" is several
// mesh parts (a shirt, the phone) or just a single mesh (a poster canvas).
let focusedPropIndex = -1;

// Builds the bounding box from a specific list of meshes instead of an
// object's whole subtree — needed for props like the poster wall, where the
// "group" contains extra depth (frame/backing geometry, a hung ornament)
// that would otherwise blow up the box size and push the focus camera way
// too far back (even outside the room). Falls back to the plain subtree box
// when no override list is given.
function computeFocusBox(target) {
  const objs = Array.isArray(target) ? target : [target];
  const box = new THREE.Box3();
  objs.forEach((o) => {
    o.updateMatrixWorld(true);
    box.expandByObject(o);
  });
  return box;
}

function computePropFrontAxis(cacheObj, viewerPos, boxTarget = cacheObj) {
  if (cacheObj.userData.frontAxis) return cacheObj.userData.frontAxis;
  const box = computeFocusBox(boxTarget);
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x <= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const center = box.getCenter(new THREE.Vector3());
  const towardCam = new THREE.Vector3().subVectors(viewerPos, center);
  towardCam.y = 0;
  if (axis.dot(towardCam) < 0) axis.negate();
  cacheObj.userData.frontAxis = axis;
  return axis;
}

function computePropFocusTransform(group, boxTarget = group, baseFov = FOCUS_FOV) {
  group.updateMatrixWorld(true);
  const box = computeFocusBox(boxTarget);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const { distance, fov } = computeFramedView(size, computeThinAxis(size), baseFov, FOCUS_FRAME_FRACTION);
  const axis = computePropFrontAxis(group, camera.position, boxTarget);
  const pos = center.clone().addScaledVector(axis, distance);
  return { pos, target: center, fov };
}

// Same "thin local axis = face normal" trick as the vinyl covers
// (getLocalCoverAxis/getSignedCoverAxis), generalized to any single flat
// mesh — used here for the computer/phone screens. Whichever of x/y/z is
// thinnest in the mesh's OWN geometry bounding box is its face normal;
// disambiguated by whichever side currently faces the camera, since a
// screen has no other reliable "front" signal.
function getMeshFrontAxis(mesh, viewerPos) {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  let axis;
  if (size.x <= size.y && size.x <= size.z) axis = new THREE.Vector3(1, 0, 0);
  else if (size.z <= size.x && size.z <= size.y) axis = new THREE.Vector3(0, 0, 1);
  else axis = new THREE.Vector3(0, 1, 0);

  const worldQuat = mesh.getWorldQuaternion(new THREE.Quaternion());
  const worldDir = axis.applyQuaternion(worldQuat).normalize();

  // A near-vertical face normal (a phone/screen resting flat on a desk,
  // screen facing up) always gets viewed from above — disambiguating that
  // case by "whichever way the player's camera happens to be standing"
  // (like the horizontal case below) was flipping it downward depending on
  // where you clicked from, landing the focus camera BELOW the screen
  // looking up through the desk/floor instead of down at it.
  if (Math.abs(worldDir.y) > 0.7) {
    if (worldDir.y < 0) worldDir.negate();
    return worldDir;
  }

  // Mostly-horizontal face (an upright/propped screen) — disambiguate by
  // whichever side is currently facing the camera, same as the whole-group
  // prop framing above.
  const meshPos = mesh.getWorldPosition(new THREE.Vector3());
  const towardViewer = new THREE.Vector3().subVectors(viewerPos, meshPos);
  if (worldDir.dot(towardViewer) < 0) worldDir.negate();
  return worldDir;
}

// Frames the actual screen mesh dead-on and tight, instead of the whole
// chassis/case bounding box — same near-orthographic FOCUS_FOV as everything
// else, just aimed at a smaller, more specific target.
function computeScreenFocusTransform(mesh) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const { distance, fov } = computeFramedView(size, computeThinAxis(size), FOCUS_FOV, FOCUS_FRAME_FRACTION);
  const axis = getMeshFrontAxis(mesh, camera.position);
  const pos = center.clone().addScaledVector(axis, distance);
  return { pos, target: center, fov };
}

// Which canvas the mobile prev/next arrows act on while the poster wall is
// focused — there's no hover state on touch to imply "which one," so this
// just tracks whichever canvas was tapped most recently (see the
// canvasSwatch branch in the pointerup handler), defaulting to the first.
let activePosterCanvasIndex = 0;

// ---------------------------------------------------------------- paper stack: rise/turn + fake page-flip reveal
// Only the physically topmost sheet (modelPaperSheets[0]) ever actually
// moves — the other 4 stay flat and untouched, purely there so the stack
// still looks like a stack. Each tap fakes "the next page" by dipping THAT
// SAME sheet back down, swapping its texture at the bottom (out of frame,
// same trick a real page flip uses to hide the swap), then bringing it back
// up already showing the new one. designIndex 0 is always whatever's
// already baked onto it in the model; indices 1+ come from its own
// PAPER_ILLUSTRATIONS (data.js) list once those exist.
// starts on the first real illustration (designIndex 1, since 0 is the
// blank bake) to match the wiring step's initial texture swap above — kept
// in sync so the first cyclePaperDesign() call computes the next step off
// the right baseline
let activePaperDesignIndex = 1;

const PAPER_RISE_LIFT = 0.16; // meters, local Y — clears the ~2.5cm stack height with room to spare
const PAPER_RISE_PUSH = 0.05; // meters, local — nudges the risen sheet along the front axis so it doesn't clip the sheets still underneath it
const PAPER_TWEEN_DURATION = 0.5; // seconds — the rise/turn itself
const PAPER_LOWER_DURATION = 0.3; // seconds — dipping back down for a swap, a bit snappier than the rise

// The front axis (computePropFrontAxis) gets cached on the group's own
// userData the FIRST time it's computed — which happens inside
// computePaperStackFocusTransform, called by enterPropFocus just before
// this ever runs — so this always finds a real cached value in practice.
// The recompute here is just a defensive fallback.
function computePaperRiseTransform(entry, group) {
  const frontAxis = group.userData.frontAxis || computePropFrontAxis(group, camera.position, group);
  const groupWorldQuat = group.getWorldQuaternion(new THREE.Quaternion());
  // frontAxis is world-space (always exactly world X or Z, see
  // computePropFrontAxis) — convert it into the group's LOCAL space so it
  // can be compared against the sheet's own local "lying flat" +Y normal
  const localDir = frontAxis.clone().applyQuaternion(groupWorldQuat.clone().invert());
  // A plain setFromUnitVectors(localUp, localDir) here technically DOES tip
  // the sheet to a horizontal-facing normal, but leaves an uncontrolled
  // "roll" around that new facing direction — since this group itself sits
  // rotated ~97° off the world axes, that roll wasn't zero, and the sheet
  // came up looking like a diagonal, rolled card instead of standing up
  // straight. Building an explicit look-basis instead — face normal along
  // localDir, "up" locked to true vertical, the sheet's own longer edge
  // (local Z, its 35cm depth vs. 30cm width) assigned to that up direction
  // so it stands portrait — guarantees no roll, however the group happens
  // to be rotated.
  const localUp = new THREE.Vector3(0, 1, 0); // group only rotates about Y, so world up IS local up here
  const localRight = new THREE.Vector3().crossVectors(localDir, localUp).normalize();
  const basis = new THREE.Matrix4().makeBasis(localRight, localDir, localUp);
  const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
  const pos = entry.restPos
    .clone()
    .addScaledVector(new THREE.Vector3(0, 1, 0), PAPER_RISE_LIFT)
    .addScaledVector(localDir, PAPER_RISE_PUSH);
  return { pos, quat };
}

// Frames the camera around where the sheet will END UP once risen, not its
// current flat resting box — computed BEFORE the rise tween starts, off a
// projected world matrix, so the camera arrives already correctly framed
// instead of tight on the small flat stack and then getting its own tenant
// grow past the top of frame. Also primes group.userData.frontAxis (used by
// computePaperRiseTransform above) as a side effect of the first call.
function computePaperStackFocusTransform(entry, group) {
  group.updateMatrixWorld(true);
  const frontAxis = computePropFrontAxis(group, camera.position, group);
  const { pos: risePos, quat: riseQuat } = computePaperRiseTransform(entry, group);
  const localMatrix = new THREE.Matrix4().compose(risePos, riseQuat, entry.mesh.scale);
  const worldMatrix = new THREE.Matrix4().multiplyMatrices(group.matrixWorld, localMatrix);
  const box = entry.mesh.geometry.boundingBox.clone().applyMatrix4(worldMatrix);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const { distance, fov } = computeFramedView(size, computeThinAxis(size), FOCUS_FOV, FOCUS_FRAME_FRACTION);
  const pos = center.clone().addScaledVector(frontAxis, distance);
  return { pos, target: center, fov };
}

function revealActivePaperSheet() {
  const entry = modelPaperSheets[0];
  if (!entry || !paperStackGroup) return;
  const { pos, quat } = computePaperRiseTransform(entry, paperStackGroup);
  startObjectTween(entry.mesh, pos, quat, PAPER_TWEEN_DURATION);
}

// backing out of focus entirely — snap the sheet back flat and reset to the
// original baked texture, so coming back later always starts from the top
function resetPaperStack() {
  const entry = modelPaperSheets[0];
  if (!entry) return;
  startObjectTween(entry.mesh, entry.restPos, entry.restQuat, PAPER_LOWER_DURATION);
  // "default" is the first real illustration (designIndex 1), matching the
  // wiring step's starting texture — same fallback-to-blank-bake logic as
  // cyclePaperDesign for the (currently hypothetical) no-designs case
  const defaultIndex = entry.designs && entry.designs.length ? 1 : 0;
  if (activePaperDesignIndex !== defaultIndex) {
    entry.mesh.material.map = defaultIndex === 0 ? entry.originalMap : getArtTexture(entry.designs[defaultIndex - 1], "cover");
    entry.mesh.material.needsUpdate = true;
  }
  activePaperDesignIndex = defaultIndex;
}

// tapping the risen sheet — dips it back down, swaps to the next
// illustration once it's out of frame, then rises back up already showing
// it. Looping back to the original bake once you run out of illustrations
// feels better than stopping dead with nothing left to tap.
function cyclePaperDesign(dir) {
  const entry = modelPaperSheets[0];
  if (!entry || !paperStackGroup) return;
  const total = (entry.designs?.length || 0) + 1;
  if (total <= 1) return; // no illustrations added yet — nothing to cycle to
  const now = performance.now();
  if (entry.nextStepAllowedAt && now < entry.nextStepAllowedAt) return;
  entry.nextStepAllowedAt = now + CANVAS_STEP_COOLDOWN_MS;
  const nextIndex = ((activePaperDesignIndex + dir) % total + total) % total;
  startObjectTween(entry.mesh, entry.restPos, entry.restQuat, PAPER_LOWER_DURATION, () => {
    entry.mesh.material.map = nextIndex === 0 ? entry.originalMap : getArtTexture(entry.designs[nextIndex - 1], "cover");
    entry.mesh.material.needsUpdate = true;
    activePaperDesignIndex = nextIndex;
    const { pos, quat } = computePaperRiseTransform(entry, paperStackGroup);
    startObjectTween(entry.mesh, pos, quat, PAPER_TWEEN_DURATION);
  });
}

function enterPropFocus(index) {
  const entry = modelProps[index];
  if (!entry || viewState !== "free") return;

  if (entry.isPosterWall) {
    activePosterCanvasIndex = 0;
    setMobileCycleControlsVisible(true);
  }

  preFocusCam = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  // whatever's currently hovered (e.g. the exact canvas you just clicked)
  // needs its hover visual explicitly reset here — just nulling the
  // tracking variable left it permanently scaled up at its hover size,
  // since pointermove's hover system stops running the instant viewState
  // leaves "free" a few lines down, so nothing else was ever going to
  // reset it. For these canvas meshes specifically (999999x compensating
  // scale, see the door/lathe comment elsewhere), even the 8% hover bump
  // was enough to break that scale trick and render solid black.
  deactivateHover(hovered);
  hovered = null;
  focusedPropIndex = index;
  focusedKind = "prop";
  setMobileMoveControlsVisible(false);
  controls.enabled = false;
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  canvas.classList.remove("hovering");
  viewState = "tweening";

  const baseFov = entry.focusFov || FOCUS_FOV;
  let pos, target, fov;
  if (entry.screenMesh) {
    ({ pos, target, fov } = computeScreenFocusTransform(entry.screenMesh));
  } else if (entry.isPaperStack) {
    // frames around where the top sheet will END UP once risen, not its
    // current flat resting box — see computePaperStackFocusTransform
    ({ pos, target, fov } = computePaperStackFocusTransform(modelPaperSheets[0], entry.group));
  } else {
    ({ pos, target, fov } = computePropFocusTransform(entry.group, entry.focusTarget, baseFov));
  }
  startCameraTween(pos, target, fov, FOCUS_DURATION, () => {
    viewState = "focused";
  });

  // runs in parallel with the camera tween that just started, not after it
  // — same tap triggers both the zoom AND the sheet rising to face it
  if (entry.isPaperStack) {
    setMobileCycleControlsVisible(true);
    revealActivePaperSheet();
  }
}

function exitPropFocus() {
  if (!preFocusCam) return;
  viewState = "tweening";
  if (focusedPropIndex >= 0) setHoverScale(modelProps[focusedPropIndex]?.group, 1);
  if (modelProps[focusedPropIndex]?.isPosterWall) setMobileCycleControlsVisible(false);
  if (modelProps[focusedPropIndex]?.isPaperStack) {
    setMobileCycleControlsVisible(false);
    resetPaperStack();
  }
  focusedPropIndex = -1;
  focusedKind = null;
  setMobileMoveControlsVisible(true);

  const { pos, target, fov } = preFocusCam;
  startCameraTween(pos, target, fov, FOCUS_DURATION, () => {
    viewState = "free";
    controls.enabled = true;
    // camera orientation is already correct here (the tween that just
    // finished kept calling camera.lookAt(controls.target) every frame) —
    // this just resyncs mouse-look's own yaw/pitch bookkeeping to match, so
    // the next drag starts from the right place instead of jumping.
    syncLookAnglesFromTarget();
  });
}

function stepPropFocus(dir) {
  if (viewState !== "focused" || !modelProps.length) return;
  const nextIndex = (focusedPropIndex + dir + modelProps.length) % modelProps.length;
  focusedPropIndex = nextIndex;
  viewState = "tweening";

  const entry = modelProps[nextIndex];
  const baseFov = entry.focusFov || FOCUS_FOV;
  const { pos, target, fov } = entry.screenMesh
    ? computeScreenFocusTransform(entry.screenMesh)
    : computePropFocusTransform(entry.group, entry.focusTarget, baseFov);
  startCameraTween(pos, target, fov, 0.9, () => {
    viewState = "focused";
  });
}

// ---------------------------------------------------------------- poster wall: per-canvas swatch cycling
// Your uploaded designs are ALREADY aligned to each canvas's real UVs (not
// generic full-bleed images) — so cycling a design never touches the mesh,
// its material instance, or its geometry/uv in any way. It only ever swaps
// one property: material.map. Index 0 is the original baked texture
// (entry.originalMap, captured once at wiring time); indices 1+ come from
// that canvas's own CANVAS_DESIGNS (data.js) list. Every canvas keeps its
// own index (modelCanvasSwatches[i].designIndex), so cycling one canvas
// never touches any other, even though the camera stays framed on the whole
// wall.
// Rapid-fire tapping used to be able to kick off several full image decodes
// on the SAME canvas at once (tap 5 times fast on designs you've never
// viewed yet = 5 concurrent decodes in flight) — the cache cap only frees
// memory once a decode finishes and lands in the cache, it can't stop
// several from being mid-flight simultaneously, which is what was still
// showing as "stuck gray, refreshes if you tap enough times fast enough."
// This cooldown just ignores taps on a given canvas that land too soon
// after the last one, so at most one new decode per canvas is ever
// actually in flight — normal browsing speed is well under this, so it
// shouldn't feel throttled in practice.
const CANVAS_STEP_COOLDOWN_MS = 350;

function setCanvasSwatchDesign(swatchIndex, index) {
  const entry = modelCanvasSwatches[swatchIndex];
  if (!entry || !entry.designs) return;
  const now = performance.now();
  if (entry.nextStepAllowedAt && now < entry.nextStepAllowedAt) return;
  entry.nextStepAllowedAt = now + CANVAS_STEP_COOLDOWN_MS;
  const total = entry.designs.length + 1;
  entry.designIndex = ((index % total) + total) % total;
  const mat = entry.mesh.material;
  mat.map =
    entry.designIndex === 0
      ? entry.originalMap
      : getArtTexture(entry.designs[entry.designIndex - 1], "cover");
  mat.needsUpdate = true;
}

function stepCanvasSwatchDesign(swatchIndex, dir) {
  const entry = modelCanvasSwatches[swatchIndex];
  if (!entry) return;
  setCanvasSwatchDesign(swatchIndex, (entry.designIndex || 0) + dir);
}

// ---------------------------------------------------------------- chair: "sit down" camera snap
// Every other focus system points the camera AT the object from outside.
// This one is the opposite — the camera goes roughly where a seated
// person's eyes would be and looks OUT into the room, like you're actually
// sitting in the chair. There's no reliable way to read "which way does
// this chair face" off the raw geometry (a Poäng chair's footprint is
// close to symmetric), so this uses the same disambiguation trick as the
// vinyl covers: face whichever way points toward the room's open interior,
// since that's how the chair would actually be arranged to sit in.
let focusedSeatIndex = -1;
const SEAT_FOV = 46; // wider than the prop/vinyl zoom — this is a "look around the room" view, not a close-up
const SEAT_HEIGHT_FRACTION = 0.55; // how far up the chair's own bounding height the eyes sit — low/reclined like a Poäng
const SEAT_FORWARD_NUDGE = 0.12; // meters forward off dead-center, so the view isn't buried in the backrest
const SEAT_LOOK_DISTANCE = 3; // meters out along faceDir the look-at target sits
const SEAT_LOOK_UP = 1.0; // meters the look-at target is raised above eye level — tilts the view up toward the loft/self-portrait instead of dead-level at the wall (was 1.6, brought down some)

function computeSeatTransform(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const roomCenter = new THREE.Vector3((ROOM.minX + ROOM.maxX) / 2, center.y, (ROOM.minZ + ROOM.maxZ) / 2);
  const faceDir = new THREE.Vector3().subVectors(roomCenter, center);
  faceDir.y = 0;
  if (faceDir.lengthSq() < 1e-6) faceDir.set(0, 0, 1);
  faceDir.normalize();

  const eyeY = box.min.y + size.y * SEAT_HEIGHT_FRACTION;
  const pos = new THREE.Vector3(center.x, eyeY, center.z).addScaledVector(faceDir, SEAT_FORWARD_NUDGE);
  const target = pos.clone().addScaledVector(faceDir, SEAT_LOOK_DISTANCE);
  target.y = eyeY + SEAT_LOOK_UP; // high-angled look up toward the loft, instead of dead-level at the wall
  return { pos, target };
}

function enterSeatFocus(index) {
  const entry = modelSeats[index];
  if (!entry || viewState !== "free") return;

  preFocusCam = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  deactivateHover(hovered);
  hovered = null;
  setHoverScale(entry.group, 1);
  focusedSeatIndex = index;
  focusedKind = "seat";
  setMobileMoveControlsVisible(false);
  controls.enabled = false;
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  canvas.classList.remove("hovering");
  viewState = "tweening";

  const { pos, target } = computeSeatTransform(entry.group);
  startCameraTween(pos, target, SEAT_FOV, FOCUS_DURATION, () => {
    viewState = "focused";
    // resync lookYaw/lookPitch to the seat's actual look direction — without
    // this, the first mouse-move while seated would snap the view toward
    // whatever stale angle free-roam left behind before you sat down
    syncLookAnglesFromTarget();
  });
}

function exitSeatFocus() {
  if (!preFocusCam) return;
  viewState = "tweening";
  focusedSeatIndex = -1;
  focusedKind = null;
  setMobileMoveControlsVisible(true);

  // if the black-screen menu (see startSeatedIntro / get-up-btn below) is
  // still up, clear it — covers standing up via WASD/Escape before ever
  // clicking a menu button, so it never gets stuck showing over a
  // free-roam view
  document.getElementById("intro-overlay").classList.add("hidden");
  // in case WASD/Escape fired before the "get up" button ever opened the
  // eyelids (menu's shown on the still-closed black screen — see
  // startSeatedIntro), make sure they're open so standing up doesn't leave
  // you staring at black; a no-op if openEyesReveal() already ran
  ensureEyesOpen();

  const { pos, target, fov } = preFocusCam;
  startCameraTween(pos, target, fov, FOCUS_DURATION, () => {
    viewState = "free";
    controls.enabled = true;
    // camera orientation is already correct here (the tween that just
    // finished kept calling camera.lookAt(controls.target) every frame) —
    // this just resyncs mouse-look's own yaw/pitch bookkeeping to match, so
    // the next drag starts from the right place instead of jumping.
    syncLookAnglesFromTarget();
    showStandUpSubtitle();
  });
}

// ---------------------------------------------------------------- closet rack: fixed camera, shirts slide to you
// Instead of the camera moving to each shirt, the camera holds ONE fixed
// view of the whole rack and the shirts themselves slide along the rod —
// whichever one you click glides to the center and pops slightly forward,
// like flipping through a real rack, while the camera stays put. Only
// re-tweens the camera on the very first click (entering the closet view);
// clicking a different shirt after that just re-slides.
let selectedRackIndex = -1;
let rackSlideOffset = 0; // current, lerped each frame — world units along rackAxisKey
let rackSlideTarget = 0; // where it's headed
let rackViewTransform = null; // cached — the one fixed camera spot for the whole rack
const RACK_FOV = 34; // wide enough to see the whole rack, not just one item
const RACK_SELECTED_SCALE = 1.18;
const RACK_ROT_RATE = 0.08; // how fast a shirt turns to face the camera as it's selected/deselected

// Same idea as getLocalCoverAxis for the vinyl covers, but a shirt group is
// several mesh parts rather than one mesh with its own geometry bounding
// box, so this walks every child mesh's geometry bbox through its transform
// relative to the group root and unions them into one LOCAL (not world)
// bounding box. Whichever horizontal axis is thinner is the garment's flat
// front/back normal — same "flat object, thin axis is the face normal"
// logic used for the vinyl covers.
function getLocalFrontAxis(root) {
  if (root.userData.localFrontAxis) return root.userData.localFrontAxis;
  root.updateWorldMatrix(true, false);
  const rootInvMatrix = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const localBox = new THREE.Box3();
  const tmpBox = new THREE.Box3();
  const relMatrix = new THREE.Matrix4();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const geo = child.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    tmpBox.copy(geo.boundingBox);
    relMatrix.multiplyMatrices(rootInvMatrix, child.matrixWorld);
    tmpBox.applyMatrix4(relMatrix);
    localBox.union(tmpBox);
  });
  const size = localBox.getSize(new THREE.Vector3());
  const axis = size.x <= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  root.userData.localFrontAxis = axis;
  return axis;
}

function computeRackViewTransform() {
  if (rackViewTransform) return rackViewTransform;
  if (!modelRackShirts.length) return null;
  const box = new THREE.Box3();
  modelRackShirts.forEach((entry) => box.union(new THREE.Box3().setFromObject(entry.group)));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const rackWidth = Math.max(rackAxisKey === "x" ? size.x : size.z, 0.2);
  const rackHeight = Math.max(size.y, 0.2);

  // RACK_FOV is three.js's VERTICAL fov convention. The old calc fit
  // rackWidth against that same vertical fov directly and never looked at
  // shirt HEIGHT at all — wrong on both counts, and exactly why tall shirts
  // were getting cropped ("its kind of cutting it off"). Derive the real
  // horizontal fov from vertical fov + camera.aspect, find the distance
  // that fits each axis independently, and back off to whichever is
  // farther so both width and height are fully in frame with real margin.
  const RACK_FRAME_FRACTION = 0.78; // fill less of the frame — more breathing room around the rack
  const vFovRad = THREE.MathUtils.degToRad(RACK_FOV);
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * camera.aspect);
  const distanceForHeight = rackHeight / 2 / (Math.tan(vFovRad / 2) * RACK_FRAME_FRACTION);
  const distanceForWidth = rackWidth / 2 / (Math.tan(hFovRad / 2) * RACK_FRAME_FRACTION);
  const distance = Math.max(distanceForHeight, distanceForWidth);

  // view from along whichever horizontal axis ISN'T the rack's own axis —
  // that's the direction you'd actually be standing to look at the rod
  const frontAxisKey = rackAxisKey === "x" ? "z" : "x";
  const axisVec = frontAxisKey === "x" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const towardCam = new THREE.Vector3().subVectors(camera.position, center);
  towardCam.y = 0;
  if (axisVec.dot(towardCam) < 0) axisVec.negate();

  const pos = center.clone().addScaledVector(axisVec, distance);
  rackViewTransform = { pos, target: center, centerAxisValue: center[rackAxisKey] };
  return rackViewTransform;
}

function enterRackFocus(index) {
  const entry = modelRackShirts[index];
  const view = computeRackViewTransform();
  if (!entry || !view) return;

  const alreadyBrowsingRack = viewState === "focused" && focusedKind === "rack";
  if (!alreadyBrowsingRack) {
    if (viewState !== "free") return;
    preFocusCam = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
    // see enterPropFocus's comment — reset whatever's hovered before losing
    // track of it, or it stays stuck at its hover-scaled size forever
    deactivateHover(hovered);
    hovered = null;
    controls.enabled = false;
    moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
    canvas.classList.remove("hovering");
    focusedKind = "rack";
    setMobileCycleControlsVisible(true);
    setMobileMoveControlsVisible(false);
  }

  selectedRackIndex = index;
  rackSlideTarget = view.centerAxisValue - entry.axisValue;

  if (!alreadyBrowsingRack) {
    viewState = "tweening";
    startCameraTween(view.pos, view.target, RACK_FOV, FOCUS_DURATION, () => {
      viewState = "focused";
    });
  }
}

function exitRackFocus() {
  if (!preFocusCam) return;
  viewState = "tweening";
  selectedRackIndex = -1;
  rackSlideTarget = 0;
  focusedKind = null;
  setMobileCycleControlsVisible(false);
  setMobileMoveControlsVisible(true);

  const { pos, target, fov } = preFocusCam;
  startCameraTween(pos, target, fov, FOCUS_DURATION, () => {
    viewState = "free";
    controls.enabled = true;
    // camera orientation is already correct here (the tween that just
    // finished kept calling camera.lookAt(controls.target) every frame) —
    // this just resyncs mouse-look's own yaw/pitch bookkeeping to match, so
    // the next drag starts from the right place instead of jumping.
    syncLookAnglesFromTarget();
  });
}

function stepRackFocus(dir) {
  if (viewState !== "focused" || !modelRackShirts.length) return;
  const nextIndex = (selectedRackIndex + dir + modelRackShirts.length) % modelRackShirts.length;
  enterRackFocus(nextIndex);
}

// dispatches Escape/click-out and arrow-key stepping to whichever focus
// system is currently active
function exitFocus() {
  if (focusedKind === "vinyl") exitVinylFocus();
  else if (focusedKind === "prop") exitPropFocus();
  else if (focusedKind === "seat") exitSeatFocus();
  else if (focusedKind === "rack") exitRackFocus();
}
function stepFocus(dir) {
  if (focusedKind === "vinyl") stepVinylFocus(dir);
  else if (focusedKind === "prop") {
    const entry = modelProps[focusedPropIndex];
    // On the poster wall, arrows/mobile buttons step whichever canvas was
    // tapped most recently (activePosterCanvasIndex, defaults to the first)
    // instead of jumping to the next prop — direct clicks on a canvas still
    // work exactly as before, this is just an additional way to trigger the
    // same per-canvas cycle without having to land a tap on the 3D mesh
    // itself (that raycasted tap is what's been unreliable on mobile).
    if (entry?.isPosterWall) stepCanvasSwatchDesign(activePosterCanvasIndex, dir);
    // same forward/back language as the poster wall's arrows, cycling the
    // paper stack's illustrations instead of re-zooming to a different prop
    else if (entry?.isPaperStack) cyclePaperDesign(dir);
    else stepPropFocus(dir);
  }
  // no stepSeatFocus — there's only one chair right now, arrow keys are a
  // no-op while sitting rather than cycling to nothing
  else if (focusedKind === "rack") stepRackFocus(dir);
}

// ---------------------------------------------------------------- camera tween helper
let camTween = null;
function startCameraTween(toPos, toTarget, toFov, duration, onDone) {
  camTween = {
    fromPos: camera.position.clone(),
    toPos: toPos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: toTarget.clone(),
    fromFov: camera.fov,
    toFov,
    duration,
    elapsed: 0,
    onDone,
  };
}
function easeInOutCubic(x) {
  // quintic ease — gentler ramp in/out than cubic, reads as a smoother glide
  // rather than a snap (name kept as-is so call sites don't need touching)
  return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

// ---------------------------------------------------------------- generic object tween helper (position + quaternion)
// Same glide as camTween above, just for an arbitrary mesh's local
// position/quaternion instead of the camera — used by the paper stack's
// rise/turn. Multiple can run at once (the old sheet lowering while the new
// one rises), keyed by object so re-tweening the same mesh mid-flight
// replaces its tween instead of fighting an old one for control of it.
const objectTweens = [];
function startObjectTween(obj, toPos, toQuat, duration, onDone) {
  const existingIdx = objectTweens.findIndex((tw) => tw.obj === obj);
  if (existingIdx >= 0) objectTweens.splice(existingIdx, 1);
  objectTweens.push({
    obj,
    fromPos: obj.position.clone(),
    toPos: toPos.clone(),
    fromQuat: obj.quaternion.clone(),
    toQuat: toQuat.clone(),
    duration,
    elapsed: 0,
    onDone,
  });
}

// ---------------------------------------------------------------- view persistence (survive an accidental reload)
// A page reload — mobile browsers reloading a backgrounded tab, someone
// bumping F5, whatever — used to always dump you back into the chair with
// the whole wake-up sequence again, even if you'd been up and walking
// around for 10 minutes. sessionStorage survives a reload of the SAME tab
// (it only clears when the tab/window is actually closed), so saving the
// live camera position there and checking for it before running
// startSeatedIntro means a reload picks up exactly where you left off
// instead of restarting. Closing the tab and opening a fresh one still
// starts the intro from scratch, same as visiting for the first time.
const VIEW_STATE_KEY = "toefu-room-view-v1";

function saveViewState() {
  // only free-roam is meaningful to restore into — mid-tween, mid-focus
  // (a shirt pulled forward, the vinyl crate open, etc.) has no sensible
  // "resume exactly here" state, so those are just skipped rather than
  // saved half-finished.
  if (viewState !== "free") return;
  try {
    sessionStorage.setItem(
      VIEW_STATE_KEY,
      JSON.stringify({
        px: camera.position.x,
        py: camera.position.y,
        pz: camera.position.z,
        tx: controls.target.x,
        ty: controls.target.y,
        tz: controls.target.z,
        fov: camera.fov,
      })
    );
  } catch (err) {
    // sessionStorage can throw in locked-down/private-browsing contexts —
    // resuming exactly where you left off just isn't available there, the
    // normal wake-up intro still works fine as a fallback
    console.warn("view persistence: couldn't save —", err);
  }
}

// Returns true if a saved view was found and restored (caller should skip
// startSeatedIntro entirely in that case), false if there was nothing to
// restore (first visit, a new tab, private browsing, etc.) — normal
// wake-up intro runs exactly as before.
function tryRestoreViewState() {
  let saved;
  try {
    const raw = sessionStorage.getItem(VIEW_STATE_KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
  } catch (err) {
    return false;
  }
  if (!saved || typeof saved.px !== "number") return false;

  camera.position.set(saved.px, saved.py, saved.pz);
  controls.target.set(saved.tx, saved.ty, saved.tz);
  camera.fov = saved.fov || camera.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  syncLookAnglesFromTarget();

  viewState = "free";
  controls.enabled = true;
  // skip the wake-up/stand-up one-shot subtitles too — replaying "hey you,
  // you're finally awake" after a reload mid-session would be strange when
  // nothing about being newly awake is actually true anymore
  wakeSubtitlesShown = true;
  standUpSubtitleShown = true;
  ensureEyesOpen();
  document.getElementById("intro-overlay").classList.add("hidden");
  setMobileMoveControlsVisible(true);
  document.getElementById("pause-open-btn").classList.add("show");
  // this only ever runs on the "resumed from a reload" path — a fresh
  // visit or new tab has nothing to restore and goes through
  // startSeatedIntro instead — so this is specifically the "you didn't
  // mean to reload, and you're right back where you were" moment.
  showOneShotSubtitle("welcome-back-reload", "Welcome back. Thought I lost you there for a sec. Lol.", 3400);
  return true;
}

// ---------------------------------------------------------------- intro / start menu
// The site starts already seated — no separate "wake up" choice, and no
// blur. As soon as the model + chair are ready (see startSeatedIntro,
// called right after the loading screen hides), the camera snaps straight
// into the chair with no visible tween (the eyelids' default CSS state
// already fully covers the screen, so the snap itself is invisible), and
// the "flat portfolio" / "get up" menu comes up immediately, sitting on
// that same still-closed black screen. Only once you actually click
// "get up" do the eyelids blink a few times and part to reveal the seated
// view underneath (see openEyesReveal).
function startSeatedIntro() {
  if (!modelSeats.length) return; // no chair found in this export — stay in free-roam, nothing to seat into

  // this is the normal free-roam start (camera.position/controls.target/fov
  // set by the "camera framing" step above) — kept so "get up" has a real
  // place to tween back out to, via the same exitSeatFocus() the chair's
  // own click-to-sit uses
  preFocusCam = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };

  const entry = modelSeats[0];
  hovered = null;
  controls.enabled = false;
  canvas.classList.remove("hovering");

  const { pos, target } = computeSeatTransform(entry.group);
  camera.position.copy(pos);
  controls.target.copy(target);
  camera.fov = SEAT_FOV;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  syncLookAnglesFromTarget();

  focusedSeatIndex = 0;
  focusedKind = "seat";
  viewState = "focused";

  document.getElementById("intro-overlay").classList.remove("hidden");
}

// Skyrim-style wake-up subtitles — two lines, shown once ever (not replayed
// on later sit-downs), timed to start right as the eyelids begin their real
// reveal. See #wake-subtitle in style.css for the look.
let wakeSubtitlesShown = false;
function showWakeSubtitles() {
  if (wakeSubtitlesShown) return;
  wakeSubtitlesShown = true;
  const el = document.getElementById("wake-subtitle");
  if (!el) return;

  const LINE1_MS = 2900; // first line — trimmed down slightly from the second
  const LINE2_MS = 3200;
  const GAP_MS = 350; // beat of blank between the two lines

  // "Toefu:" renders in the dimmer grey (see .wake-name in style.css),
  // the actual dialogue after it stays pure white — same two-tone look
  // as the Skyrim subtitle reference.
  function showLine(rest, delay) {
    setTimeout(() => {
      el.innerHTML = `<span class="wake-name">Toefu:</span> ${rest}`;
      el.classList.add("show");
    }, delay);
  }
  function hideLine(delay) {
    setTimeout(() => el.classList.remove("show"), delay);
  }

  showLine("Hey you. You're finally awake.", 300);
  hideLine(300 + LINE1_MS);
  showLine("Use WASD to get up and look around", 300 + LINE1_MS + GAP_MS);
  hideLine(300 + LINE1_MS + GAP_MS + LINE2_MS);
}

// One-shot subtitle for the first successful stand-up (see exitSeatFocus
// below) — same #wake-subtitle element/style, just a single short line
// instead of the two-line wake-up sequence above.
let standUpSubtitleShown = false;
function showStandUpSubtitle() {
  if (standUpSubtitleShown) return;
  standUpSubtitleShown = true;
  const el = document.getElementById("wake-subtitle");
  if (!el) return;

  const LINE1_MS = 1800; // short — it's just "Nice."
  const LINE2_MS = 3200;
  const LINE3_MS = 3600;
  const GAP_MS = 350;
  const LONG_GAP_MS = 2500; // "a few seconds" pause before the 3rd line

  function showLine(rest, delay) {
    setTimeout(() => {
      el.innerHTML = `<span class="wake-name">Toefu:</span> ${rest}`;
      el.classList.add("show");
    }, delay);
  }
  function hideLine(delay) {
    setTimeout(() => el.classList.remove("show"), delay);
  }

  let t = 150;
  showLine("Nice.", t);
  t += LINE1_MS;
  hideLine(t);
  t += GAP_MS;
  showLine("Sorry about the lag give it a second. I'm not from here.", t);
  t += LINE2_MS;
  hideLine(t);
  t += LONG_GAP_MS;
  showLine("I'd come down and say hi, but unfortunately i am tethered to this polygonal form. Sry!", t);
  t += LINE3_MS;
  hideLine(t);
}

// Generic one-shot subtitle — reuses #wake-subtitle, fires a given line
// exactly once per unique `key` for the life of the page, then never again.
// This is the one to reach for when adding more moment-triggered subtitles
// (poster wall, vinyl hover, shirts, etc.) — pass a unique key per moment.
const shownOneShotSubtitles = new Set();
function showOneShotSubtitle(key, rest, durationMs = 2600, delay = 150) {
  if (shownOneShotSubtitles.has(key)) return;
  shownOneShotSubtitles.add(key);
  const el = document.getElementById("wake-subtitle");
  if (!el) return;
  setTimeout(() => {
    el.innerHTML = `<span class="wake-name">Toefu:</span> ${rest}`;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), durationMs);
  }, delay);
}

// parts the eyelids (a few quick partial-open/close blinks via .blink,
// then the real slow reveal via .slow-open — see style.css) to uncover the
// already-seated view. Safe to call more than once — bails out if the
// eyelids are already open (or mid-opening) so exitSeatFocus can also call
// this defensively without double-triggering the animation.
function openEyesReveal() {
  const eyeTop = document.getElementById("eyelid-top");
  const eyeBottom = document.getElementById("eyelid-bottom");
  if (eyeTop.classList.contains("open")) return;

  const BLINK_COUNT = 3;
  const BLINK_OPEN_MS = 220; // must match .blink's transition duration
  const BLINK_GAP_MS = 180; // beat of "closed" between blinks
  function blinkThenWake(blinksLeft) {
    if (blinksLeft <= 0) {
      eyeTop.classList.add("slow-open");
      eyeBottom.classList.add("slow-open");
      eyeTop.classList.add("open");
      eyeBottom.classList.add("open");
      document.getElementById("mobile-controls").classList.add("show");
      document.getElementById("pause-open-btn").classList.add("show");
      showWakeSubtitles();
      setTimeout(() => {
        eyeTop.classList.add("done");
        eyeBottom.classList.add("done");
      }, 1200);
      return;
    }
    eyeTop.classList.add("blink");
    eyeBottom.classList.add("blink");
    setTimeout(() => {
      eyeTop.classList.remove("blink");
      eyeBottom.classList.remove("blink");
      setTimeout(() => blinkThenWake(blinksLeft - 1), BLINK_GAP_MS);
    }, BLINK_OPEN_MS);
  }
  blinkThenWake(BLINK_COUNT);
}

// ensures the eyelids end up open+done immediately, no blink flourish —
// used only as a fallback (see exitSeatFocus) for someone who presses
// WASD/Escape straight off the black menu without ever clicking "get up"
function ensureEyesOpen() {
  const eyeTop = document.getElementById("eyelid-top");
  const eyeBottom = document.getElementById("eyelid-bottom");
  if (eyeTop.classList.contains("open")) return;
  eyeTop.classList.add("slow-open", "open", "done");
  eyeBottom.classList.add("slow-open", "open", "done");
  document.getElementById("mobile-controls").classList.add("show");
  document.getElementById("pause-open-btn").classList.add("show");
  showWakeSubtitles();
}

document.getElementById("get-up-btn").addEventListener("click", () => {
  document.getElementById("intro-overlay").classList.add("hidden");
  openEyesReveal();
});

// "flat portfolio" isn't built yet — just a placeholder note for now, the
// menu stays up (still on the black screen) so "get up" is still available.
document.getElementById("flat-portfolio-btn").addEventListener("click", () => {
  document.getElementById("menu-note").classList.remove("hidden");
});

// ---------------------------------------------------------------- resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- walk-around movement (WASD)
// Mouse-drag still rotates the view (OrbitControls); WASD translates the
// camera+target rig through the room so you can actually walk around
// instead of just orbiting a fixed point. Arrow keys are left alone since
// they're used to step through the lightbox.
const moveKeys = { w: false, a: false, s: false, d: false };
const MOVE_SPEED = 1.8; // meters/second, roughly a walking pace

// Shared by the keyboard and the on-screen mobile buttons below, so every
// rule (can't walk while viewing a lightbox piece, standing up out of the
// seat, ignored while zoomed into an item) applies identically no matter
// where the "press" came from.
function pressMoveKey(k) {
  if (isPauseMenuOpen()) return; // don't walk while the pause menu is up
  if (!lightbox.classList.contains("hidden")) return; // don't walk while viewing a piece
  if (!(k in moveKeys)) return;

  // pressing a movement key while sitting in the chair stands you up and
  // straight into free-roam, continuing in whichever direction you
  // pressed — this is also how the seated start view breaks out into WASD,
  // since that's entered through this same seat-focus system.
  // (Safe to set moveKeys here even mid-tween: the animate loop only reads
  // it once viewState is back to "free", which is exactly when the
  // stand-up tween finishes.)
  if (viewState === "focused" && focusedKind === "seat") {
    exitSeatFocus();
    moveKeys[k] = true;
    return;
  }

  if (viewState !== "free") return;
  moveKeys[k] = true;
}
function releaseMoveKey(k) {
  if (k in moveKeys) moveKeys[k] = false;
}

window.addEventListener("keydown", (e) => {
  pressMoveKey(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => {
  releaseMoveKey(e.key.toLowerCase());
});
window.addEventListener("blur", () => {
  moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
});
// if the lightbox opens mid-stride, stop moving so the camera doesn't drift
new MutationObserver(() => {
  if (!lightbox.classList.contains("hidden")) {
    moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  }
}).observe(lightbox, { attributes: true, attributeFilter: ["class"] });

// ---------------------------------------------------------------- pause menu (js/menu/)
// Reacts to pauseState.js's open/close flag, whichever side triggered it
// (Escape, #pause-open-btn/#pause-close-btn, or the compass's own Map
// point closing it). Room-specific side effects live here rather than
// in pauseState.js so that tiny shared module stays a dumb pub/sub and
// doesn't need to know about controls/moveKeys/the renderer at all.
onPauseMenuChange((open) => {
  if (open) {
    // Freeze the room exactly as it looked the instant you paused — a
    // still frame of the actual scene/angle, not a fixed backdrop
    // image. Re-render once first in case the last committed frame is
    // stale (e.g. renderer.render was skipped last tick for some
    // reason), then read it back synchronously in the same tick so the
    // browser has no chance to clear the buffer first.
    renderer.render(scene, camera);
    try {
      const snapshot = canvas.toDataURL("image/jpeg", 0.82);
      const bgLayer = document.getElementById("bg-layer");
      if (bgLayer) bgLayer.style.setProperty("--bg-image", `url(${snapshot})`);
    } catch (err) {
      // toDataURL can throw on a tainted canvas (e.g. a texture loaded
      // without CORS headers) — the menu still opens fine, just over
      // its plain fallback backdrop instead of a room snapshot.
      console.error("pause menu: couldn't snapshot the room canvas —", err);
    }
    controls.enabled = false;
    moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = false;
  } else {
    // Pause can only ever be opened from viewState === "free" (see the
    // Escape handler above), so controls.enabled === true is always
    // the correct thing to restore back to here.
    controls.enabled = true;
  }
});

function openPauseMenuFromUI() {
  // Same gate the Escape handler uses — ignore the on-screen button if
  // it somehow got clicked mid-lightbox/mid-focus/mid-tween instead of
  // during ordinary free-roam.
  if (isPauseMenuOpen()) return;
  if (!lightbox.classList.contains("hidden")) return;
  if (viewState !== "free") return;
  setPauseMenuOpen(true);
}
document.getElementById("pause-open-btn").addEventListener("click", openPauseMenuFromUI);
document.getElementById("pause-close-btn").addEventListener("click", () => setPauseMenuOpen(false));

// ---------------------------------------------------------------- on-screen mobile move buttons
// Touch devices don't have a keyboard, so a small WASD-style d-pad
// (#mobile-controls in index.html, only shown via CSS on coarse-pointer/
// no-hover screens) drives the exact same moveKeys state through
// pressMoveKey/releaseMoveKey. Pointer events (not touch/click) so this
// works the same whether it's a finger or a mouse, and pointercancel/
// pointerleave make sure a key doesn't get stuck "down" if a finger slides
// off the button instead of lifting cleanly.
const MOBILE_MOVE_BUTTON_KEYS = { "mc-w": "w", "mc-a": "a", "mc-s": "s", "mc-d": "d" };
Object.entries(MOBILE_MOVE_BUTTON_KEYS).forEach(([id, key]) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  const press = (e) => {
    e.preventDefault();
    pressMoveKey(key);
  };
  const release = (e) => {
    e.preventDefault();
    releaseMoveKey(key);
  };
  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});

// ---------------------------------------------------------------- on-screen mobile prev/next
// Touch equivalent of the ArrowLeft/ArrowRight keys — same stepFocus(dir)
// call either way. Unlike the WASD d-pad (always visible once the eyes
// open), these only show up while something arrow-cycleable is actually
// focused (vinyl crate or closet rack — see setMobileCycleControlsVisible
// calls in enter/exitVinylFocus and enter/exitRackFocus), so they don't
// clutter the screen during ordinary free-roam.
const mobileCycleControls = document.getElementById("mobile-cycle-controls");
function setMobileCycleControlsVisible(visible) {
  if (mobileCycleControls) mobileCycleControls.classList.toggle("show", visible);
}

// The WASD d-pad only makes sense while actually free-roaming — hidden the
// instant any camera-focus mode kicks in (vinyl, props/canvases, seat,
// rack) and brought back once you're back in walkable free-roam, mirroring
// setMobileCycleControlsVisible above.
const mobileMoveControls = document.getElementById("mobile-controls");
// #pause-open-btn rides along with the WASD d-pad for the same reason -
// opening the pause menu mid-focus (zoomed into a record, a shirt, the
// seat) is not a state the Escape handler allows either, so there is no
// point leaving the button visible then.
const pauseOpenBtn = document.getElementById("pause-open-btn");
function setMobileMoveControlsVisible(visible) {
  if (mobileMoveControls) mobileMoveControls.classList.toggle("show", visible);
  if (pauseOpenBtn) pauseOpenBtn.classList.toggle("show", visible);
}
document.getElementById("mc-cycle-prev")?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  stepFocus(-1);
});
document.getElementById("mc-cycle-next")?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  stepFocus(1);
});

const _moveForward = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
function applyWalkMovement(delta) {
  if (!moveKeys.w && !moveKeys.a && !moveKeys.s && !moveKeys.d) return;

  camera.getWorldDirection(_moveForward);
  _moveForward.y = 0;
  _moveForward.normalize();
  _moveRight.crossVectors(_moveForward, camera.up).normalize();

  _moveVec.set(0, 0, 0);
  if (moveKeys.w) _moveVec.add(_moveForward);
  if (moveKeys.s) _moveVec.sub(_moveForward);
  if (moveKeys.d) _moveVec.add(_moveRight);
  if (moveKeys.a) _moveVec.sub(_moveRight);
  if (_moveVec.lengthSq() === 0) return;
  _moveVec.normalize().multiplyScalar(MOVE_SPEED * delta);

  // resolve against furniture per-axis so you slide along an obstacle's
  // edge instead of a full hard stop the instant you brush it
  let dx = _moveVec.x;
  let dz = _moveVec.z;
  if (collidesWithObstacle(camera.position.x + dx, camera.position.z)) dx = 0;
  if (collidesWithObstacle(camera.position.x, camera.position.z + dz)) dz = 0;
  if (dx === 0 && dz === 0) return;

  camera.position.x += dx;
  camera.position.z += dz;
  controls.target.x += dx;
  controls.target.z += dz;
}

function collidesWithObstacle(x, z) {
  for (const b of obstacleBoxes) {
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  }
  return false;
}

// ---------------------------------------------------------------- bounds clamp (keep camera & target inside the room)
function clampToRoom(vec, minYFrac, maxYFrac) {
  const marginX = Math.min(0.4, (ROOM.maxX - ROOM.minX) * 0.15);
  const marginZ = Math.min(0.4, (ROOM.maxZ - ROOM.minZ) * 0.15);
  vec.x = Math.max(ROOM.minX + marginX, Math.min(ROOM.maxX - marginX, vec.x));
  vec.z = Math.max(ROOM.minZ + marginZ, Math.min(ROOM.maxZ - marginZ, vec.z));
  const minY = ROOM.minY + (ROOM.maxY - ROOM.minY) * minYFrac;
  const maxY = ROOM.minY + (ROOM.maxY - ROOM.minY) * maxYFrac;
  vec.y = Math.max(minY, Math.min(maxY, vec.y));
}

// ---------------------------------------------------------------- animate
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = clock.elapsedTime;

  // runs independently of camTween below — the paper stack's sheet rise/
  // turn needs to animate at the same time the camera is still tweening
  // into focus (same tap triggers both)
  if (objectTweens.length) {
    for (let i = objectTweens.length - 1; i >= 0; i--) {
      const tw = objectTweens[i];
      tw.elapsed += delta;
      const p = Math.min(1, tw.elapsed / tw.duration);
      const e = easeInOutCubic(p);
      tw.obj.position.lerpVectors(tw.fromPos, tw.toPos, e);
      tw.obj.quaternion.slerpQuaternions(tw.fromQuat, tw.toQuat, e);
      if (p >= 1) {
        objectTweens.splice(i, 1);
        if (tw.onDone) tw.onDone();
      }
    }
  }

  // ambient smoke wisp — always running, no gating on viewState, since it's
  // just a handful of sprites and cheap regardless of what else the camera
  // is doing (see "ambient smoke wisp" wiring for the particle shape).
  // Wrapped in try/catch because this runs unguarded every single frame —
  // unlike the load-time setup (wrapped in safeStep), a throw in here isn't
  // caught by anything and would kill every frame after it, not just this
  // one feature.
  try {
    modelSmokeParticles.forEach((p) => {
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
      p.sprite.material.opacity = Math.sin(Math.PI * Math.min(1, frac * 1.15)) * SMOKE_PEAK_OPACITY;
    });
  } catch (err) {
    console.error("ambient smoke wisp: per-frame update failed, disabling —", err);
    modelSmokeParticles.length = 0;
  }

  // curtain sway — unguarded per-frame code, same reasoning as the smoke
  // try/catch above: this has no safeStep protection once it's running.
  try {
    if (curtainPivot) {
      curtainPivot.rotation.x = Math.sin(t * CURTAIN_SWAY_SPEED) * CURTAIN_SWAY_AMPLITUDE;
    }
  } catch (err) {
    console.error("curtain sway: per-frame update failed, disabling —", err);
    curtainPivot = null;
  }

  // window dust motes — same family as the smoke wisp above, just drifting
  // in a slow wobble around a fixed base position instead of rising.
  try {
    modelDustMotes.forEach((p) => {
      p.age += delta;
      if (p.age >= p.life) p.age = 0;
      const frac = p.age / p.life;
      const wobble = Math.sin(frac * Math.PI * 2 + p.driftPhase) * DUST_DRIFT;
      p.sprite.position.set(
        p.basePos.x + p.driftAxis.x * wobble,
        p.basePos.y + p.driftAxis.y * wobble,
        p.basePos.z + p.driftAxis.z * wobble
      );
      // fades in, holds, fades out over the loop rather than popping —
      // sin(0..PI) over the fraction gives that shape for free
      p.sprite.material.opacity = Math.sin(Math.PI * frac) * DUST_PEAK_OPACITY;
    });
  } catch (err) {
    console.error("window dust motes: per-frame update failed, disabling —", err);
    modelDustMotes.length = 0;
  }

  if (camTween) {
    // camera is fully hand-driven during a zoom transition — OrbitControls
    // is left alone so it doesn't fight the tween or clamp it back
    camTween.elapsed += delta;
    const p = Math.min(1, camTween.elapsed / camTween.duration);
    const e = easeInOutCubic(p);
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
    controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
    camera.fov = THREE.MathUtils.lerp(camTween.fromFov, camTween.toFov, e);
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    if (p >= 1) {
      const done = camTween.onDone;
      camTween = null;
      if (done) done();
    }
  } else if (viewState === "free") {
    applyWalkMovement(delta);
    clampToRoom(camera.position, 0.13, 0.9);
    // camera.position may have just been clamped/moved by WASD — target
    // isn't an independent point anymore, it's purely "wherever the camera
    // is currently facing," so it gets re-derived from the (possibly just
    // clamped) position rather than clamped separately in its own right.
    const dir = new THREE.Vector3(
      Math.sin(lookYaw) * Math.cos(lookPitch),
      Math.sin(lookPitch),
      Math.cos(lookYaw) * Math.cos(lookPitch)
    );
    controls.target.copy(camera.position).addScaledVector(dir, LOOK_TARGET_DISTANCE);
  }
  // viewState === "focused" with no tween running: camera stays exactly
  // where the tween left it, nothing to update

  // ease any clicked/hovered vinyl record straight up toward its risen
  // (or back down to its resting) position — no rotation, see setVinylRise
  modelVinyls.forEach((v) => {
    const mesh = v.mesh;
    if (mesh.userData.riseTargetY !== undefined) {
      mesh.position.y += (mesh.userData.riseTargetY - mesh.position.y) * 0.055;
    }
  });

  // slide the whole rack toward wherever the selected shirt needs to be to
  // sit centered in the fixed closet view — every shirt moves together
  // (same offset), like sliding hangers along the rod, and the selected one
  // also eases up to a slightly bigger scale so it reads as "pulled forward"
  if (modelRackShirts.length) {
    rackSlideOffset += (rackSlideTarget - rackSlideOffset) * 0.08;

    // pass 1: scale + rotation first, for every shirt. The selected one's
    // silhouette along the rack axis depends on both (it grows AND turns to
    // face the camera), so its real current width has to be known before
    // pass 2 can figure out how far neighbors need to clear out of its way.
    modelRackShirts.forEach((entry, i) => {
      const isSelected = i === selectedRackIndex;
      const isHovered = entry.group.userData.rackHovered && viewState === "free";
      const targetFactor = isSelected ? RACK_SELECTED_SCALE : isHovered ? 1.06 : 1;
      const currentFactor = entry.group.userData.rackScaleFactor ?? 1;
      const nextFactor = currentFactor + (targetFactor - currentFactor) * 0.08;
      entry.group.userData.rackScaleFactor = nextFactor;
      entry.group.scale.copy(entry.baseScale).multiplyScalar(nextFactor);

      // only the actually-selected shirt turns to face the camera — sliding
      // toward center and turning together reads like flipping through a
      // real rack, rather than every shirt on the rod spinning at once
      if (entry.targetQuat) {
        const rotTarget = isSelected ? 1 : 0;
        entry.rotBlend += (rotTarget - entry.rotBlend) * RACK_ROT_RATE;
        entry.group.quaternion.slerpQuaternions(entry.baseQuat, entry.targetQuat, entry.rotBlend);
      }
    });

    // measure the selected shirt's ACTUAL current half-width along the rack
    // axis (post scale+rotation, pre position) rather than guessing at a
    // fraction of the rack's spacing — a shirt turned to face the camera can
    // be much wider along the rod than it is hanging flat, so a fixed nudge
    // undershoots exactly like the collision in the screenshot.
    let selectedHalfWidth = 0;
    if (selectedRackIndex >= 0) {
      const selectedEntry = modelRackShirts[selectedRackIndex];
      selectedEntry.group.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(selectedEntry.group);
      selectedHalfWidth = (rackAxisKey === "x" ? box.max.x - box.min.x : box.max.z - box.min.z) / 2;
    }

    // pass 2: position everyone. Immediate neighbors clear exactly enough
    // to not overlap the selected shirt's real measured width (plus a small
    // margin); shirts one slot further out cascade a fraction of that same
    // push so the whole rack fans out smoothly instead of a hard cutoff.
    const NEIGHBOR_MARGIN = 0.03;
    modelRackShirts.forEach((entry, i) => {
      // parent's world scale, not the group's own — see setVinylRise for
      // why: these shirt groups can carry their own baked-in scale too
      const worldScale = new THREE.Vector3();
      (entry.group.parent || entry.group).getWorldScale(worldScale);
      const localDelta = rackSlideOffset / (worldScale[rackAxisKey] || 1);

      let neighborPushTarget = 0;
      if (selectedRackIndex >= 0 && i !== selectedRackIndex) {
        const dist = Math.abs(i - selectedRackIndex);
        const dir = i > selectedRackIndex ? 1 : -1;
        const selectedEntry = modelRackShirts[selectedRackIndex];
        const restGap = Math.abs(entry.axisValue - selectedEntry.axisValue);
        const requiredGap = selectedHalfWidth + entry.restHalfWidth + NEIGHBOR_MARGIN;
        const immediatePush = Math.max(0, requiredGap - restGap);
        // dist 1 gets the full push; farther ones cascade a shrinking
        // fraction of it so the whole rack fans out smoothly. This used to
        // hit exactly zero at dist 3 and stay there — fine back when the
        // rack only had 5 items (nothing was ever more than 2 slots from
        // the middle), but with 7 items now, an end item's immediate
        // neighbors could still be sitting with NO clearance at all,
        // letting the enlarged/turned selection visually overlap them —
        // which is exactly what reads as "the highlighted one jumping to
        // the wrong item," since a click landing on that overlapped
        // neighbor selects IT, not whatever's visually on top. Scaling the
        // falloff to the actual rack length instead of a fixed cutoff means
        // every item gets at least some clearance, however far out it is.
        const maxDist = Math.max(1, modelRackShirts.length - 1);
        const falloff = Math.max(0, 1 - (dist - 1) / maxDist);
        neighborPushTarget = dir * immediatePush * falloff;
      }
      entry.neighborPushBlend += (neighborPushTarget - entry.neighborPushBlend) * 0.08;
      const localPush = entry.neighborPushBlend / (worldScale[rackAxisKey] || 1);
      entry.group.position[rackAxisKey] = entry.restLocalPos[rackAxisKey] + localDelta + localPush;
    });
  }

  keyLight.intensity = 0.6 + Math.sin(t * 2.1) * 0.02;

  // Paused: leave the canvas exactly as it was at the moment of the
  // snapshot above instead of continuing to draw underneath the menu.
  if (!isPauseMenuOpen()) {
    renderer.render(scene, camera);
  }
}
animate();
