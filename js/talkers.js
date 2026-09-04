import * as THREE from "three";

// ---------------------------------------------------------------------------
// Talkers — things in the room you can click that aren't stations or pickups.
// They have no camera move and no panel: clicking one says a line, and some of
// them do one extra thing on top (a screen effect, or an offer to open the
// matching portfolio category).
//
// Mesh names are matched against the actual node names in room.glb, read off
// the file rather than guessed at.
// ---------------------------------------------------------------------------

export const TALKERS = [
  { key: "joint", mesh: /^joint$/i, effect: "high" },
  { key: "cardboard", mesh: /^CARDBOARD/i },
  {
    key: "canvases",
    mesh: /^(CANVASES|SUNFLOWER CANVAS)$/i,
    ask: { label: "Open Graphic Design", menu: "portfolio", category: "Graphic Design" },
  },
  {
    key: "sketchbooks",
    // Two separate nodes hold sketchbooks — the pile on the shelf and the ones
    // on the table. Both should answer the same way.
    mesh: /^(sketchbooks|TABLE SKETCHBOOKS)\s*$/i,
    ask: { label: "Open Illustration", menu: "portfolio", category: "Illustration" },
  },
  {
    key: "shirts",
    mesh: /^SHIRTS$/i,
    // The one ask that opens Items rather than Portfolio — `menu` says which.
    ask: { label: "Open Tops", menu: "items", category: "Tops" },
  },
  { key: "dresser", mesh: /^MOMDRESSER$/i },
];

// The window is not clicked — it is looked at. Kept here so every "thing in
// the room that talks" is described in one file.
export const WINDOW_MESH = /^(WINDOWPANE|OUTSIDE)$/i;

const meshes = [];        // { mesh, spec }
const windowMeshes = [];
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let camera = null;
let canvasEl = null;

export function initTalkers(model, cam, canvas) {
  camera = cam;
  canvasEl = canvas;
  meshes.length = 0;
  windowMeshes.length = 0;

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const name = obj.name || "";
    if (WINDOW_MESH.test(name)) windowMeshes.push(obj);
    const spec = TALKERS.find((t) => t.mesh.test(name));
    if (spec) meshes.push({ mesh: obj, spec });
  });

  console.info(
    `talkers: ${meshes.length} clickable, ${windowMeshes.length} window mesh(es)`
  );
  return meshes.length;
}

function castFrom(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  ptr.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ptr.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
}

/** The talker under the pointer, or null. Returns the spec, not just a key. */
export function pickTalker(clientX, clientY) {
  if (!camera || !meshes.length) return null;
  castFrom(clientX, clientY);
  let best = null;
  for (const entry of meshes) {
    const hit = ray.intersectObject(entry.mesh, false)[0];
    if (hit && (!best || hit.distance < best.distance)) {
      best = { spec: entry.spec, distance: hit.distance };
    }
  }
  return best?.spec ?? null;
}

/**
 * Is the middle of the screen pointing out of the window? Used for the dwell
 * timer in main.js rather than a click.
 */
export function lookingOutside() {
  if (!camera || !windowMeshes.length) return false;
  ptr.set(0, 0);
  ray.setFromCamera(ptr, camera);
  return ray.intersectObjects(windowMeshes, false).length > 0;
}
