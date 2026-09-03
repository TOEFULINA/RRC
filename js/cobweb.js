import * as THREE from "three";

// ---------------------------------------------------------------- cobweb
// The ceiling corner above the door is the one genuinely bare patch in the
// room, and in the real one there is always dust in it. So: a cobweb, drawn
// as lines rather than modelled, because a web IS lines — a GL line is
// already a hairline, and the whole thing is one draw call.
//
// Not a tidy orb-weaver wheel; the dusty half-collapsed kind. Anchors are
// scattered across the three surfaces that meet at the corner, guy-lines run
// from the corner out to each anchor, sagging threads are strung between
// neighbouring guy-lines, and a few loose ends hang down and drift.
//
// The corner was measured, not guessed — raycast through the closet wall's
// end face, the back wall and the ceiling where they meet.
const WEB_CORNER = new THREE.Vector3(-0.938, 2.052, 1.29);
// Signs pointing away from the corner, into the room, on each axis.
const WEB_DIR = { x: -1, y: -1, z: -1 };
const WEB_NEAR = 0.07;        // closest an anchor sits to the corner, metres
const WEB_FAR = 0.34;         // furthest
const WEB_ANCHORS = 15;       // guy-lines
const WEB_RINGS = 5;          // sagging threads strung across them
const WEB_SAG = 0.05;
const WEB_DANGLES = 5;
// Dusty grey rather than fresh silk — a web that has been there a while and
// caught the room. Darker means the opacity can come up, so the strands read
// as threads instead of a faint haze.
// A 1px line covers a fraction of the pixel it lands on, so a translucent
// dark thread over a bright cream wall washes out to pale grey — which is
// exactly what happened at 0.55. Nearly opaque and properly dark is what
// actually reads as a dusty thread.
const WEB_COLOR = 0x4f4d47;
const WEB_OPACITY = 0.88;

// The whole sheet breathes, not just the loose ends: real webs move as one
// piece because every strand is under tension. Amounts are in metres, and
// they are tiny on purpose — you should notice it only if you stop and look.
const WEB_SWAY = 0.0055;      // how far the outer edge travels
const WEB_SWAY_SPEED = 0.42;  // slow — a draught through a doorway

let webGroup = null;
let webRest = null;
let webWeight = null;
const webDangles = [];

// One anchor, sitting ON one of the three faces. Which face is chosen by
// weight, so the sheet spans the two walls more than the ceiling — which is
// how they actually hang.
function webAnchor() {
  const face = Math.random();
  const a = WEB_NEAR + Math.random() * (WEB_FAR - WEB_NEAR);
  const b = WEB_NEAR + Math.random() * (WEB_FAR - WEB_NEAR);
  if (face < 0.3) {
    // on the ceiling: y fixed at the corner, spread in x and z
    return new THREE.Vector3(
      WEB_CORNER.x + WEB_DIR.x * a, WEB_CORNER.y, WEB_CORNER.z + WEB_DIR.z * b
    );
  }
  if (face < 0.65) {
    // on the back wall: z fixed, spread in x and down
    return new THREE.Vector3(
      WEB_CORNER.x + WEB_DIR.x * a, WEB_CORNER.y + WEB_DIR.y * b, WEB_CORNER.z
    );
  }
  // on the side wall: x fixed, spread in z and down
  return new THREE.Vector3(
    WEB_CORNER.x, WEB_CORNER.y + WEB_DIR.y * b, WEB_CORNER.z + WEB_DIR.z * a
  );
}

export function initCobweb(scene) {
  // Order the anchors cyclically around the corner's diagonal, so
  // "neighbouring" means neighbouring on the web rather than in the array.
  const axis = new THREE.Vector3(WEB_DIR.x, WEB_DIR.y, WEB_DIR.z).normalize();
  const ref = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
  const ref2 = new THREE.Vector3().crossVectors(axis, ref).normalize();

  const anchors = [];
  for (let i = 0; i < WEB_ANCHORS; i++) {
    const p = webAnchor();
    const rel = p.clone().sub(WEB_CORNER);
    anchors.push({ p, angle: Math.atan2(rel.dot(ref2), rel.dot(ref)) });
  }
  anchors.sort((m, n) => m.angle - n.angle);

  const pts = [];
  const push = (a, b) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const start = WEB_CORNER.clone();

  // Guy-lines, corner to anchor, bowed slightly so none is dead straight.
  for (const { p } of anchors) {
    const STEPS = 3;
    let prev = start;
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const q = start.clone().lerp(p, t);
      q.y -= Math.sin(t * Math.PI) * 0.008;
      push(prev, q);
      prev = q;
    }
  }

  // Cross-threads between neighbouring guy-lines, at a few distances out.
  for (let ring = 1; ring <= WEB_RINGS; ring++) {
    const base = ring / (WEB_RINGS + 0.5);
    for (let i = 0; i < anchors.length; i++) {
      const j = (i + 1) % anchors.length;
      if (Math.random() < 0.12) continue;        // gaps — it's a ruined web
      const t = base * (0.78 + Math.random() * 0.42);
      const p0 = start.clone().lerp(anchors[i].p, Math.min(1, t));
      const p1 = start.clone().lerp(anchors[j].p, Math.min(1, t));
      const mid = p0.clone().lerp(p1, 0.5);
      mid.y -= WEB_SAG * t * (0.6 + Math.random() * 0.7);
      push(p0, mid);
      push(mid, p1);
    }
  }

  // Loose ends, left mutable so the update pass can drift them.
  for (let d = 0; d < WEB_DANGLES; d++) {
    const a = anchors[Math.floor(Math.random() * anchors.length)].p;
    const top = start.clone().lerp(a, 0.45 + Math.random() * 0.5);
    const drop = 0.06 + Math.random() * 0.16;
    const knee = top.clone(); knee.y -= drop * 0.55;
    const tip = top.clone(); tip.y -= drop;
    const i0 = pts.length / 3;
    push(top, knee);
    push(knee, tip);
    webDangles.push({
      i0, knee: knee.clone(), tip: tip.clone(), phase: Math.random() * Math.PI * 2,
    });
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  // The rest shape, kept so every frame can be solved from it rather than
  // drifting cumulatively. Each vertex also stores how far out from the
  // corner it sits, because the sway has to be zero at the anchors and
  // largest in the middle — a strand pinned at both ends bows, it doesn't
  // slide.
  webRest = Float32Array.from(pts);
  webWeight = new Float32Array(pts.length / 3);
  for (let i = 0; i < webWeight.length; i++) {
    const dx = pts[i * 3] - WEB_CORNER.x;
    const dy = pts[i * 3 + 1] - WEB_CORNER.y;
    const dz = pts[i * 3 + 2] - WEB_CORNER.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / WEB_FAR;
    // sin() so it is pinned at the corner AND at the far anchors, bowing between
    webWeight[i] = Math.sin(Math.min(1, d) * Math.PI);
  }
  const mat = new THREE.LineBasicMaterial({
    color: WEB_COLOR,
    transparent: true,
    opacity: WEB_OPACITY,
    // Overlapping strands would punch holes in each other if the nearer one
    // happened to draw first.
    depthWrite: false,
  });
  webGroup = new THREE.LineSegments(geom, mat);
  webGroup.name = "COBWEB";
  webGroup.renderOrder = 22;
  scene.add(webGroup);
  return (pts.length / 3) / 2;
}

// Solved from the rest shape every frame, so nothing accumulates drift.
// Two waves at different speeds crossing the sheet, plus a slower breath on
// the whole thing — enough to look alive, nowhere near enough to look like
// it is flapping.
export function updateCobweb(elapsed) {
  if (!webGroup || !webRest) return;
  const attr = webGroup.geometry.getAttribute("position");
  const arr = attr.array;
  const t = elapsed * WEB_SWAY_SPEED;
  const breath = 0.65 + 0.35 * Math.sin(t * 0.6);

  for (let i = 0; i < webWeight.length; i++) {
    const k = i * 3;
    const rx = webRest[k], ry = webRest[k + 1], rz = webRest[k + 2];
    const w = webWeight[i] * WEB_SWAY * breath;
    // phase varies along the sheet, so it ripples rather than sliding rigidly
    const p = (rx - rz) * 9.0;
    arr[k]     = rx + Math.sin(t + p) * w;
    arr[k + 1] = ry + Math.sin(t * 1.31 + p * 0.7) * w * 0.45;
    arr[k + 2] = rz + Math.cos(t * 0.87 + p) * w * 0.8;
  }

  // The loose ends get the same wave plus a bigger swing of their own.
  for (const d of webDangles) {
    const sx = Math.sin(elapsed * 0.66 + d.phase) * 0.006;
    const sz = Math.cos(elapsed * 0.49 + d.phase * 1.7) * 0.004;
    const k = (d.i0 + 3) * 3;
    arr[k] += sx;
    arr[k + 2] += sz;
    const kk = (d.i0 + 1) * 3;
    arr[kk] += sx * 0.5;
    arr[kk + 2] += sz * 0.5;
    const kk2 = (d.i0 + 2) * 3;
    arr[kk2] += sx * 0.5;
    arr[kk2 + 2] += sz * 0.5;
  }
  attr.needsUpdate = true;
}
