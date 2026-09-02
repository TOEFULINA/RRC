// ---------------------------------------------------------------------------
// Vinyl hover.
//
// The records sit in the crate; putting the pointer over one lifts it a little
// so it peeks out, and it settles back when the pointer leaves. That's the
// whole feature — this is the hover from the published room, brought over
// without the click-to-focus camera rig that used to come with it.
//
// Ported from the published version's setVinylRise/setActiveVinyl, simplified
// for the current model. Two things that were load-bearing there and are gone
// here, both because the new export is 1:1 in world space:
//   - the old records carried a ~20x scale baked onto themselves, so a
//     world-space rise had to be divided by the parent's world scale to come
//     out right. The parent scale is 1 now, but the division is kept because
//     it costs nothing and silently does the right thing if that ever changes.
//   - the old code worked out which way each cover faced so the camera could
//     fly to it. Nothing rotates or flies here, so that's all dropped.
//
// The rise is straight up, never a spin: these records lean in the crate at
// real 3D tilts and their pivots aren't centred on the disc, so rotating one
// drags it sideways through the crate instead of gliding out of it.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { isPauseMenuOpen } from "./pauseState.js";

// Matches the model's record meshes. Kept as a pattern rather than a list so
// adding records to the crate in Blender needs no change here.
const VINYL_PATTERN = /^vinyl[ _]?\d+$/i;

const HOVER_RISE = 0.085;  // metres the record lifts out of the crate
// A clicked record comes all the way out, so the camera has a clear cover to
// frame rather than something still half-buried in the crate.
const SELECT_RISE = 0.26;
const RISE_LERP = 0.14;    // per-frame approach to the target height
const DRAG_SLOP = 6;       // px of movement before a pointer counts as a look-drag

const records = [];
const hitTargets = [];
let raycaster = null;
let pointer = null;
let hovered = null;
let selected = null;
let dragging = false;
let downAt = null;
let cam = null;
let cnv = null;

export function initVinyl(model, camera, canvas) {
  cam = camera;
  cnv = canvas;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // Every mesh belonging to a record is raycastable, but they all lift the one
  // object that carries the transform — moving a single primitive out of a
  // multi-primitive record would tear it in half.
  const byMover = new Map();

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    // A glTF node with several primitives arrives as a Group of Meshes, so the
    // name can be on the mesh itself or on its parent.
    const onSelf = VINYL_PATTERN.test(obj.name || "");
    if (!onSelf && !VINYL_PATTERN.test(obj.parent?.name || "")) return;
    const mover = onSelf ? obj : obj.parent;
    obj.userData.vinylMover = mover;
    hitTargets.push(obj);
    if (!byMover.has(mover)) {
      byMover.set(mover, { mover, baseY: mover.position.y, targetY: mover.position.y });
      records.push(byMover.get(mover));
    }
  });

  if (!records.length) {
    console.warn(`vinyl hover: nothing matched ${VINYL_PATTERN} — hover is off.`);
    return;
  }

  canvas.addEventListener("pointerdown", (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    dragging = false;
  });
  const endDrag = () => { downAt = null; dragging = false; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  window.addEventListener("blur", endDrag);

  canvas.addEventListener("pointermove", (e) => {
    if (downAt && !dragging && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > DRAG_SLOP) {
      dragging = true;
    }
    // Mid-drag you're looking around, not pointing at anything — and a touch
    // pointer is always dragging, so it never hovers at all.
    if (dragging || isPauseMenuOpen() || e.pointerType === "touch") {
      setHovered(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, cam);
    const hits = raycaster.intersectObjects(hitTargets, false);
    setHovered(hits.length ? hits[0].object.userData.vinylMover : null);
  });

  canvas.addEventListener("pointerleave", () => setHovered(null));

  console.info(`vinyl hover: ${records.length} record(s) wired.`);
}

// A selected record outranks hover: it stays fully out until it is deselected,
// wherever the pointer goes.
export function setVinylSelected(mover) {
  selected = mover || null;
  applyRise();
}

// Where a record WILL be once it has finished rising, not where it is now.
// The rise is animated over ~20 frames, so a camera pose computed from the
// live position frames the empty slot in the crate and the record then lifts
// straight out of shot. This returns the settled centre so the snap lands on
// the cover.
export function vinylFocusBox(mover) {
  const box = new THREE.Box3().setFromObject(mover);
  const centre = box.getCenter(new THREE.Vector3());
  const rec = records.find((r) => r.mover === mover);
  if (rec) {
    const s = new THREE.Vector3();
    (mover.parent || mover).getWorldScale(s);
    const risenLocal = rec.baseY + SELECT_RISE / (s.y || 1);
    centre.y += (risenLocal - mover.position.y) * (s.y || 1);
  }
  return { centre, size: box.getSize(new THREE.Vector3()) };
}

// Step to the record `dir` slots along the crate from `mover`, wrapping round
// at the ends so you can keep flipping in one direction forever.
//
// Ordered by the number in the node name (Vinyl 1, Vinyl 2, ...) rather than
// by traverse order, which is whatever the exporter happened to write. The
// numbering follows the crate left to right, so "next" moves the way your hand
// would — flipping through them, not jumping around the box.
export function vinylNeighbour(mover, dir) {
  if (records.length < 2) return null;
  const order = orderedRecords();
  const i = order.findIndex((r) => r.mover === mover);
  if (i === -1) return order[0].mover;
  return order[(i + dir + order.length) % order.length].mover;
}

export function vinylCount() {
  return records.length;
}

// Position in the crate, 1-based, for the "3 / 20" readout.
export function vinylIndexOf(mover) {
  return orderedRecords().findIndex((r) => r.mover === mover) + 1;
}

let ordered = null;
function orderedRecords() {
  if (ordered && ordered.length === records.length) return ordered;
  const numberOf = (r) => {
    const m = (r.mover.name || "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  ordered = records.slice().sort((a, b) => numberOf(a) - numberOf(b));
  return ordered;
}

// Hit-test at a screen point. Exported so main.js can decide what a click
// means without duplicating the raycast.
export function pickVinyl(clientX, clientY) {
  if (!raycaster || !cnv) return null;
  const rect = cnv.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, cam);
  const hits = raycaster.intersectObjects(hitTargets, false);
  return hits.length ? hits[0].object.userData.vinylMover : null;
}

function applyRise() {
  for (const r of records) {
    // position is in the PARENT's space, so a world-space rise converts
    // through the PARENT's world scale, not the record's own.
    const s = new THREE.Vector3();
    (r.mover.parent || r.mover).getWorldScale(s);
    const want =
      r.mover === selected ? SELECT_RISE :
      r.mover === hovered ? HOVER_RISE : 0;
    r.targetY = r.baseY + want / (s.y || 1);
  }
  cnv?.classList.toggle("hovering", !!hovered);
}

function setHovered(mover) {
  if (mover === hovered) return;
  hovered = mover;
  applyRise();
}

export function updateVinyl() {
  for (const r of records) {
    const dy = r.targetY - r.mover.position.y;
    if (Math.abs(dy) < 1e-5) { r.mover.position.y = r.targetY; continue; }
    r.mover.position.y += dy * RISE_LERP;
  }
}
