import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// Path to your real room model. Drop a new .glb here (same filename) to swap it out.
// The "?v=" is the same manual cache-bust used on the JS files (see main.js's
// imports) — a 58MB file is exactly the kind of asset a CDN/browser caches
// the LONGEST, so without this, geometry/position fixes inside the glb
// itself (like the hair nudge) can keep showing the old version on a phone
// or a fresh CDN edge even after a real, successful push. Bump this same
// tag whenever room.glb's actual content changes.
export const MODEL_PATH = "models/room.glb?v=2026-08-08au";

// Used to ship as two files (room.glb + room-extras.glb) because GitHub
// hard-rejects any single file over 100MB, and the uncompressed geometry
// alone was pushing past that. Draco-compressing the geometry (see
// DRACOLoader below) shrank things enough that it's back to one file again —
// nothing about how the room behaves changed, this was purely a "how many
// files the bytes come from" split.

// The fake-outside-the-window backdrop (see WINDOW_BACKDROP_MESH_PATTERN in
// main.js) sits deliberately OUTSIDE the room's real footprint — that's the
// whole point of it. But it's still part of the same glTF, so a plain
// "bounding box of everything" swallows it too, which blows out the box
// used for EVERY room-relative measurement (camera start height/position,
// ceiling size, carpet size, WASD walk bounds) — explains starting position
// landing inside a wall and the camera reading "too short" right after the
// backdrop was added. Excluded here so the room's own footprint stays the
// actual room's footprint regardless of how far out the backdrop reaches.
//
// "Plane" (exact name, from the Draco re-export) is a stray leftover helper
// object — no baked material, sits well outside the real room extents, and
// blew the measured room height from ~2.15m up to ~3.24m, which is what was
// causing the standing eye-height to read short and the chair's stand-up
// camera to end up clipped near the loft bed (both derive their position as
// a FRACTION of this box, so an inflated box throws every fraction off).
// Excluded the same way as the window backdrop, for the same reason.
const ROOM_BOUNDS_EXCLUDE_PATTERN = /^WindowBackdrop|^Plane$/i;

/**
 * Loads the room .glb, sets up shadows on every mesh inside it, and reports
 * progress (0-1) via onProgress so the loading screen can show a percentage.
 * Resolves with { model, box } where box is the model's world-space bounding box.
 */
export function loadRoomModel(onProgress) {
  const loader = new GLTFLoader();

  // Only kicks in for meshes that actually contain Draco-compressed geometry
  // (KHR_draco_mesh_compression) — harmless to leave wired up regardless.
  // Decoder files are loaded from Google's official CDN, not bundled here.
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
  loader.setDRACOLoader(dracoLoader);

  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_PATH,
      (gltfMain) => resolve(finishLoad(gltfMain)),
      (evt) => {
        // Some servers (GitHub Pages' CDN included) don't always send a
        // Content-Length, so evt.total can come back 0/undefined — guard
        // against dividing by that instead of showing a broken percentage.
        if (onProgress && evt.total) onProgress(Math.min(1, evt.loaded / evt.total));
      },
      reject
    );
  });

  function finishLoad(gltfMain) {
      const model = gltfMain.scene;

      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material) {
            // metalness/roughness/normal maps are non-color data —
            // make sure three.js doesn't sRGB-decode them.
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            });
          }
        }
      });
      function computeRoomBox(root) {
        // THREE.Box3().setFromObject() normally does this internally
        // (a full top-down refresh of every matrixWorld in the
        // hierarchy) before reading any geometry — expandByObject on its
        // own does NOT do that full refresh, so skipping this meant the
        // box was being computed off stale/default matrices instead of
        // real world-space transforms. That's what was actually causing
        // the black screen (a badly wrong box → a broken camera position),
        // not the backdrop object itself.
        root.updateMatrixWorld(true);
        const b = new THREE.Box3();
        let any = false;
        root.traverse((obj) => {
          if (!obj.isMesh || ROOM_BOUNDS_EXCLUDE_PATTERN.test(obj.name)) return;
          b.expandByObject(obj);
          any = true;
        });
        // fallback: if somehow nothing matched (unexpected model structure),
        // don't return an empty/invalid box — use the whole model instead
        return any ? b : new THREE.Box3().setFromObject(root);
      }

      let box = computeRoomBox(model);
      let size = box.getSize(new THREE.Vector3());

      // Some exports come in at the wrong real-world scale — this can
      // happen if an object's scale wasn't "applied" in Blender before
      // export (or a remesh/edit reset it). A real bedroom ceiling is
      // roughly 2.2-2.8m; if the loaded model comes in far smaller than
      // that, every one of our absolute-meter constants elsewhere (carpet
      // displacement, ceiling fixture drop, obstacle collision margins,
      // shadow bias) would be wildly out of proportion to the actual
      // geometry — that's what causes the carpet/ceiling to visibly
      // clip through walls and furniture. Auto-correct by rescaling the
      // whole model uniformly so it's back to a believable real-world size.
      const TARGET_HEIGHT = 2.4;
      if (size.y > 0 && size.y < 1) {
        const factor = TARGET_HEIGHT / size.y;
        model.scale.multiplyScalar(factor);
        model.updateMatrixWorld(true);
        box = computeRoomBox(model);
        size = box.getSize(new THREE.Vector3());
        console.warn(
          `loadRoomModel: model loaded at an unrealistic scale (${size.y.toFixed(3)}m tall after auto-correct, ` +
          `was ${(size.y / factor).toFixed(3)}m) — auto-rescaled ${factor.toFixed(2)}x. ` +
          `Check the object's scale was applied before export in Blender if this looks off.`
        );
      }

      return { model, box };
  }
}
