// ---------------------------------------------------------------------------
// Studio environment for the item viewer.
//
// This replaces three's RoomEnvironment, which is a small bright interior box —
// even light from everywhere, no real direction, and (the part that mattered
// here) nothing dark for a clear material to sit against. Clear acrylic only
// reads as clear when it has BOTH bright shapes to catch and dark gaps between
// them; lit by an evenly bright room it goes flat and slightly milky, because
// every ray it refracts lands on the same brightness.
//
// So this is an actual photography setup, built as geometry rather than loaded
// as a .hdr: a mid-grey cyclorama with four emissive panels — key softbox,
// cooler fill on the opposite side, a broad overhead strip, and a hot rim panel
// behind the subject. PMREM blurs the whole thing into the cubemap the
// materials sample, which is exactly what an HDRI is, minus a several-megabyte
// download on a page that's already carrying a 16MB room.
//
// Panel colours are deliberately > 1. MeshBasicMaterial writes them straight
// out and PMREM renders into a half-float target, so they stay above white
// through the blur instead of clipping — that's what gives glossy items a
// highlight with a falloff rather than a flat white patch. Same trick
// RoomEnvironment itself uses for its area lights.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// The surround. Not black: a fully dark studio would kill the diffuse fill the
// old RoomEnvironment was quietly providing and every item would come out
// murkier than it was before. This is the compromise — dark enough to give the
// glass contrast, light enough to keep the fill.
const SURROUND = 0x44484f;
const FLOOR = 0x8d939b;      // bounce card under the subject
const FLOOR_INTENSITY = 0.55;

// [w, h, position, intensity, colour]
const PANELS = [
  // Key: big, high, front-left. The main event.
  { w: 5.0, h: 3.6, pos: [-2.4, 3.2, 2.8], intensity: 3.6, color: 0xffffff },
  // Fill: opposite side, softer and cooler, so the shadow side isn't dead.
  { w: 4.2, h: 3.2, pos: [3.4, 1.1, 2.2], intensity: 1.25, color: 0xeef4ff },
  // Overhead strip: the long horizontal highlight that runs across anything
  // glossy and reads instantly as "studio".
  { w: 6.5, h: 2.4, pos: [0, 4.6, 0.2], intensity: 1.9, color: 0xfffaf2 },
  // Rim: behind and low, hottest of the lot. This is what lights the EDGES of
  // clear parts and separates them from the background.
  { w: 5.0, h: 2.6, pos: [0, 1.5, -3.8], intensity: 2.6, color: 0xfff4e6 },
];

// Builds the scene. The caller runs it through PMREMGenerator and disposes it —
// nothing here is kept alive after that.
export function createStudioEnvironment() {
  const scene = new THREE.Scene();

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(14, 10, 14),
    new THREE.MeshBasicMaterial({ color: SURROUND, side: THREE.BackSide })
  );
  scene.add(room);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(FLOOR).multiplyScalar(FLOOR_INTENSITY),
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.4;
  scene.add(floor);

  for (const p of PANELS) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w, p.h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(p.color).multiplyScalar(p.intensity),
        side: THREE.DoubleSide,
      })
    );
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  }

  return scene;
}
