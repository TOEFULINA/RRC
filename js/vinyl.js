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
const RISE_LERP = 0.14;    // per-frame approach to the target height
const DRAG_SLOP = 6;       // px of movement before a pointer counts as a look-drag

const records = [];
let raycaster = null;
let pointer = null;
let hovered = null;
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
  const targets = [];
  const byMover = new Map();

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    // A glTF node with several primitives arrives as a Group of Meshes, so the
    // name can be on the mesh itself or on its parent.
    const onSelf = VINYL_PATTERN.test(obj.name || "");
    if (!onSelf && !VINYL_PATTERN.test(obj.parent?.name || "")) return;
    const mover = onSelf ? obj : obj.parent;
    obj.userData.vinylMover = mover;
    targets.push(obj);
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
    const hits = raycaster.intersectObjects(targets, false);
    setHovered(hits.length ? hits[0].object.userData.vinylMover : null);
  });

  canvas.addEventListener("pointerleave", () => setHovered(null));

  console.info(`vinyl hover: ${records.length} record(s) wired.`);
}

function setHovered(mover) {
  if (mover === hovered) return;
  hovered = mover;
  for (const r of records) {
    // position is in the PARENT's space, so a world-space rise converts
    // through the PARENT's world scale, not the record's own.
    const s = new THREE.Vector3();
    (r.mover.parent || r.mover).getWorldScale(s);
    const rise = r.mover === hovered ? HOVER_RISE / (s.y || 1) : 0;
    r.targetY = r.baseY + rise;
  }
  cnv?.classList.toggle("hovering", !!hovered);
}

export function updateVinyl() {
  for (const r of records) {
    const dy = r.targetY - r.mover.position.y;
    if (Math.abs(dy) < 1e-5) { r.mover.position.y = r.targetY; continue; }
    r.mover.position.y += dy * RISE_LERP;
  }
}
