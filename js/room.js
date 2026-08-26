import * as THREE from "three";
import { getArtTexture } from "./textures.js";
import { CLOTHING } from "./data.js";

// ============================================================================
// Room bounds used for camera clamping. main.js overwrites these with the
// real .glb's bounding box once it loads — the numbers here are just a
// fallback before the model is in.
// ============================================================================
export const ROOM = {
  minX: -5,
  maxX: 5,
  minZ: -5,
  maxZ: 5,
  minY: 0,
  maxY: 3.2,
  height: 3.2,
};

// ============================================================================
// HOTSPOTS — where the clickable closet garments float in the scene. (Your
// vinyl crate is already part of your model — see main.js, which wires up
// the real Vinyl_1..Vinyl_20 meshes directly instead of building a fake one
// here.) This is NOT tied to your model's geometry, so once your real room
// is in and you can see it, tweak these x/y/z numbers to line the rod up
// with the actual closet in your model.
// ============================================================================
export const HOTSPOTS = {
  closetRod: { x: -1.6, y: 1.5, z: -1 },
};

// ============================================================================
// LAYOUT — fractional positions (0 = min edge, 1 = max edge) within your
// room's real bounding box, worked out from your model's actual furniture
// placement (ladder ~center, bed on the left, rug/chair open floor on the
// right-front, door+closet along the back). Tweak these fractions if you
// rearrange furniture in the model.
// ============================================================================
export const CAMERA_START = {
  // starting eye position: the open rug/chair floor, clear of the ladder and bed
  eyeXFrac: 0.8,
  eyeZFrac: 0.2,
  eyeYFrac: 0.49, // nudged down slightly from 0.52
  // looking back toward the center/back of the room
  targetXFrac: 0.45,
  targetZFrac: 0.55,
  targetYFrac: 0.49,
};

// Tried lining up a visible ceiling-light fixture with the baked glow spot
// (fraction-based, then closet-anchored) — kept landing wrong or getting
// swallowed by the closet cabinet's geometry, and it wasn't worth chasing
// further. The fixture mesh is removed entirely now (see buildCeiling);
// the room relies on the baked textures for that look instead. Only the
// runtime fill light's position still reads from this (dead center,
// ceiling height) — cosmetic-only, safe to ignore.
export const CEILING_LIGHT = {
  xFrac: 0.5,
  zFrac: 0.5,
};

/**
 * Builds the clickable hanging garments and adds them to the scene. Call
 * this after your room model is in the scene so you can see where to
 * position HOTSPOTS.
 */
export function buildHotspots(scene) {
  const interactive = { garments: [] };
  const group = new THREE.Group();

  buildClosetRod(group, interactive);

  scene.add(group);
  return interactive;
}

// ============================================================================
// CEILING — your model doesn't include a roof (it was built/scanned without
// one so you could see inside), so we cap the room with a flat ceiling plane
// sized to its real footprint, plus a simple flush-mount ceiling light
// fixture. Returns the fixture mesh so main.js can co-locate a real light
// there.
//
// ============================================================================
export function buildCeiling(scene, box) {
  const size = box.getSize(new THREE.Vector3());
  const ceilingY = box.max.y;

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x, size.z),
    // sampled directly from your wall textures' base color so the roof
    // matches the walls' pale yellow instead of a made-up color
    new THREE.MeshStandardMaterial({ color: "#efeed2", roughness: 0.95, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(box.min.x + size.x / 2, ceilingY, box.min.z + size.z / 2);
  scene.add(ceiling);

  // No visible fixture mesh anymore (see CEILING_LIGHT comment above) —
  // just a position for main.js's runtime fill light, dead center of the
  // ceiling.
  const fixtureX = box.min.x + size.x * CEILING_LIGHT.xFrac;
  const fixtureZ = box.min.z + size.z * CEILING_LIGHT.zFrac;
  const fixtureY = ceilingY - 0.127;

  return { fixture: null, x: fixtureX, y: fixtureY, z: fixtureZ };
}

// ============================================================================
// FLOOR — your real baked maps (color, normal, displacement), pulled from
// the PNGs you dropped straight into the project folder. These are a single
// UV bake across the whole floor, NOT a small tileable swatch — so no
// repeat/tiling here, just a straight 1:1 map across the plane, same as the
// mesh's own UVs. We still hide the model's original flat floor mesh and
// build a separate subdivided plane, since the real displacement data needs
// real subdivided geometry to actually push vertices around.
// ============================================================================
const FLOOR_MESH_PATTERN = /^Floor/i;
const CARPET_DISPLACEMENT = 0.115; // meters of real vertex bump height — matches the chunky, high-contrast look of the real bake in Blender's viewport
const REAL_FLOOR_COLOR_MAP = "textures/floor_color.webp";
const REAL_FLOOR_NORMAL_MAP = "textures/floor_normal.webp";
const REAL_FLOOR_DISPLACEMENT_MAP = "textures/floor_displacement.webp";

export function buildCarpet(scene, model, box) {
  // If you've re-baked in Blender (see BAKING_GUIDE.md), your model's own
  // Floor mesh now has real lighting baked into it — don't hide it behind
  // this stand-in carpet plane (built from a separate floor photo, for a
  // model whose floor material had no texture at all), just leave your
  // real one showing.
  let hasRealBakedFloor = false;
  model.traverse((obj) => {
    if (obj.isMesh && FLOOR_MESH_PATTERN.test(obj.name) && obj.material?.isMeshBasicMaterial && obj.material.map) {
      hasRealBakedFloor = true;
    }
  });
  if (hasRealBakedFloor) {
    console.info("buildCarpet: model's own Floor mesh is already baked — skipping the generated carpet plane.");
    return null;
  }

  // hide the model's original flat floor so it doesn't z-fight/show through
  let hiddenCount = 0;
  model.traverse((obj) => {
    if (obj.isMesh && FLOOR_MESH_PATTERN.test(obj.name)) {
      obj.visible = false;
      hiddenCount++;
    }
  });
  if (hiddenCount === 0) {
    console.warn('buildCarpet: no mesh matching "Floor" found in the model — the original floor is still showing underneath the new carpet.');
  }

  const size = box.getSize(new THREE.Vector3());
  const loader = new THREE.TextureLoader();
  const colorTex = loader.load(REAL_FLOOR_COLOR_MAP);
  const normalTex = loader.load(REAL_FLOOR_NORMAL_MAP);
  const heightTex = loader.load(REAL_FLOOR_DISPLACEMENT_MAP);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  // single UV bake across the whole floor, rotated 90° to match the bake's
  // actual orientation — plus a small zoom (repeat slightly above 1) so the
  // weave reads a bit larger/closer instead of spread thin across the room.
  const FLOOR_MAP_ROTATION = Math.PI / 2;
  // repeat < 1 shows a smaller crop of the bake stretched across the same
  // floor area, which is what actually zooms the pattern IN (repeat > 1
  // tiles the image more times across the surface, making it read smaller —
  // backwards from what we want)
  const FLOOR_MAP_ZOOM = 0.62;
  [colorTex, normalTex, heightTex].forEach((t) => {
    t.center.set(0.5, 0.5);
    t.rotation = FLOOR_MAP_ROTATION;
    t.repeat.set(FLOOR_MAP_ZOOM, FLOOR_MAP_ZOOM);
  });

  // enough segments that the displacement map actually has vertices to move
  const segX = Math.min(220, Math.max(60, Math.round(size.x * 24)));
  const segZ = Math.min(220, Math.max(60, Math.round(size.z * 24)));
  const geo = new THREE.PlaneGeometry(size.x, size.z, segX, segZ);

  const mat = new THREE.MeshStandardMaterial({
    map: colorTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(3.4, 3.4),
    displacementMap: heightTex,
    displacementScale: CARPET_DISPLACEMENT,
    displacementBias: -CARPET_DISPLACEMENT / 2,
    roughness: 0.95,
    metalness: 0,
  });

  const carpet = new THREE.Mesh(geo, mat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(box.min.x + size.x / 2, box.min.y + 0.004, box.min.z + size.z / 2);
  carpet.receiveShadow = true;
  carpet.name = "GeneratedCarpet";
  scene.add(carpet);
  console.info(`buildCarpet: added ${segX}x${segZ}-segment carpet mesh (${size.x.toFixed(2)}m x ${size.z.toFixed(2)}m), hid ${hiddenCount} original floor mesh(es).`);
  return carpet;
}

// ============================================================================
// CLOSET ROD (interactive garments)
// ============================================================================
function buildClosetRod(group, interactive) {
  const { x: rx, y: ry, z: rz } = HOTSPOTS.closetRod;
  const rodLength = 1.7;

  const rodMat = new THREE.MeshStandardMaterial({ color: "#c9c2b4", metalness: 0.6, roughness: 0.3 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, rodLength, 12), rodMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(rx, ry, rz);
  group.add(rod);

  const n = CLOTHING.length;
  for (let i = 0; i < n; i++) {
    const entry = CLOTHING[i];
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = rx - rodLength / 2 + 0.15 + t * (rodLength - 0.3);
    const garment = buildGarment(entry, i);
    garment.position.set(x, ry - 0.35, rz);
    garment.rotation.y = (Math.random() - 0.5) * 0.5;
    group.add(garment);
    interactive.garments.push(garment);
  }
}

function buildGarment(entry, index) {
  const g = new THREE.Group();
  const tex = getArtTexture(entry, "clothing");

  const hangerMat = new THREE.MeshStandardMaterial({ color: "#8a8378", metalness: 0.6, roughness: 0.35 });
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16, Math.PI * 1.4), hangerMat);
  hook.position.set(0, 0.28, 0);
  hook.rotation.z = Math.PI * 0.6;
  g.add(hook);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.015), hangerMat);
  bar.position.set(0, 0.2, 0);
  g.add(bar);

  const cardMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.46), cardMat);
  card.position.set(0, -0.08, 0);
  card.castShadow = true;
  card.userData = {
    interactive: true,
    kind: "clothing",
    index,
    entry,
  };
  g.add(card);
  return g;
}
