import * as THREE from "three";

// Shared plumbing for every interactive "screen" prop that draws a 2D UI
// onto a canvas and routes clicks back into it via the mesh's own raycast
// UV (desk computer, phone).
//
// This used to carry a compensating 90°-rotation transform in commit()/
// pickHitbox() to cancel out a UV quirk on the original screen meshes —
// two rounds of guessing that transform from screenshots both turned out
// wrong (see git history / prior comments if curious). Rather than keep
// guessing in canvas-space, the screen meshes themselves got re-exported
// with corrected UVs (retopo'd in Blender), so this module is back to the
// plain, direct mapping every other canvas-texture asset in this project
// already uses — no rotation, no dimension swap.
export function createInteractiveScreen(logicalWidth, logicalHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth;
  canvas.height = logicalHeight;
  const ctx = canvas.getContext("2d");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  let hitboxes = []; // [{x,y,w,h,action}], in REAL canvas pixel space

  // Records the hitbox through whatever transform is active on `ctx` right
  // now (translate/scale/etc), not just the raw numbers passed in — so a
  // screen that draws its content inset by a border margin (see
  // desktopScreen.js's BORDER) can wrap its whole draw pass in a
  // translate+scale ONCE and every existing addHitbox() call site still
  // lines up with what's actually on screen, with no per-call math needed.
  function addHitbox(x, y, w, h, action) {
    const t = ctx.getTransform();
    const corners = [
      t.transformPoint(new DOMPoint(x, y)),
      t.transformPoint(new DOMPoint(x + w, y)),
      t.transformPoint(new DOMPoint(x, y + h)),
      t.transformPoint(new DOMPoint(x + w, y + h)),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    hitboxes.push({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
      action,
    });
  }

  // Call once at the start of every draw pass — clears the hitbox list so
  // stale regions from the previous frame (e.g. a window that just closed)
  // can never linger and catch a click nothing is drawn over anymore.
  function beginFrame() {
    hitboxes = [];
  }

  // Call once at the end of every draw pass — flags the texture for GPU
  // re-upload. No copying/rotation needed now; the canvas IS the texture.
  function commit() {
    texture.needsUpdate = true;
  }

  // Converts a raycast UV hit into canvas pixel space and returns whatever
  // hitbox (if any) the last commit() produced there. Standard glTF/
  // three.js CanvasTexture convention: u runs left->right, v runs
  // bottom->top — hence the (1 - v) flip to get back to normal top-down
  // pixel rows. If clicks land on the mirror-image spot of what you
  // tapped, flip this back to plain `v * canvas.height` first.
  function pickHitbox(u, v) {
    const logicalX = u * canvas.width;
    const logicalY = (1 - v) * canvas.height;
    return hitboxes.find(
      (h) => logicalX >= h.x && logicalX <= h.x + h.w && logicalY >= h.y && logicalY <= h.y + h.h
    );
  }

  return { canvas, ctx, texture, addHitbox, beginFrame, commit, pickHitbox };
}
