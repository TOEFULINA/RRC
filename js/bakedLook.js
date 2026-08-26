import * as THREE from "three";

// Companion to blender/bake_lighting.py + BAKING_GUIDE.md.
//
// The bake script names every material it produces "<object>_<slot>_baked"
// and rewires it to show the baked texture. That "_baked" suffix is the
// signal this file looks for — nothing else in your current room.glb is
// named that way, so this is a no-op (falls straight through, model looks
// exactly like it does today) until you've actually run the bake and
// dropped in the new room.glb. No flag to flip, no half-migrated state to
// worry about — it just upgrades itself the moment real baked textures
// show up.
const BAKED_MATERIAL_SUFFIX = "_baked";

// Temporary: set to true to bring back the ORIGINAL pre-fix hair render
// (plain alpha blend, no alphaTest/alphaToCoverage cutout, no soft-edge
// overlay pass) so it can be compared side by side with the fixed version
// below. This is exactly what hair looked like before the streaking fix —
// flip back to false to restore the fix.
const HAIR_USE_ORIGINAL_STREAKY_LOOK = true;

/**
 * Swaps every "_baked" material in the model for an unlit MeshBasicMaterial
 * showing the same baked texture — the actual "unlit, lighting is printed
 * onto the texture" look the reference site uses. Everything else (glass,
 * water, the video screen, anything not yet baked) is left completely
 * alone, so this only ever adds the new look, never breaks what's already
 * working.
 *
 * Call this once, right after the model loads and before any of the
 * existing per-mesh material special-casing in main.js — it only touches
 * materials that end in "_baked", so it can't step on that later logic.
 */
export function applyBakedLook(model) {
  let convertedCount = 0;
  const seen = new Map(); // material -> converted material, so shared "_baked" materials aren't rebuilt per-mesh
  const hairCardMeshes = []; // gets a soft-edge overlay pass added after the traverse below finishes

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];

    const nextMaterials = materials.map((mat) => {
      if (!mat || !mat.name || !mat.name.endsWith(BAKED_MATERIAL_SUFFIX)) return mat;

      if (seen.has(mat)) return seen.get(mat);

      // most "_baked" materials carry a real baked texture, but a flat,
      // untextured object (e.g. the lashes — just a solid color, no map)
      // can be "baked" too in the sense that it should always show its
      // authored color regardless of scene lighting. MeshBasicMaterial's
      // `color` already defaults from the glTF material's baseColorFactor,
      // so this works with or without a map.
      // a bake is a single unique UV-mapped snapshot of one object — it
      // should never tile. Some meshes (e.g. "Main wall 1_n3d") have UVs
      // that run outside the normal 0-1 range (down to about -1.04), and
      // the glTF/three.js default wrap mode is REPEAT, so that extra range
      // was showing the whole texture a second time smeared across the
      // wall (the doubled floral/dot pattern + repeated black poster-cutout
      // rectangles). Clamping stops it from tiling — anything past the
      // texture's real 0-1 edge just holds that edge pixel instead.
      if (mat.map) {
        mat.map.wrapS = THREE.ClampToEdgeWrapping;
        mat.map.wrapT = THREE.ClampToEdgeWrapping;
        mat.map.needsUpdate = true;
      }

      // Hair is modeled as several overlapping alpha strand cards in ONE
      // mesh — glTF exported it as alphaMode BLEND, which three.js renders
      // by soft-blending triangles in whatever order they happen to be
      // stored in, NOT sorted correctly against each other. Overlapping
      // semi-transparent edges compositing in the wrong order is exactly
      // what reads as pale, nonsensical streaks cutting across the strands
      // (confirmed against a Blender viewport render showing none of this —
      // Blender's transparency handling doesn't have this limitation, so it
      // never shows up there). Plain alpha-testing fixes the streaking (each
      // pixel is either fully opaque or fully discarded, nothing left to
      // blend in the wrong order) but trades it for hard, jagged strand
      // edges. alphaToCoverage keeps the cutout (so still no blend-order
      // artifacts) but resolves the cutout using MSAA sub-pixel coverage
      // instead of a hard yes/no per pixel — that's what gets the soft edge
      // back without reopening the streaking. Needs the renderer's
      // antialias:true (already on) to actually do anything.
      const isHairCard = !HAIR_USE_ORIGINAL_STREAKY_LOOK && /hair/i.test(obj.name);

      // Lowered from 0.5, then again from 0.32 — still reading "too light
      // and too crispy" on mobile at 0.32, so down again. A high alphaTest
      // throws away more of the strand's naturally feathered/thin pixels,
      // which is what reads as a harsher, more solid-looking cutoff.
      // Letting more of those thin pixels survive (then blended softly by
      // the overlay pass below) is what makes the edges look finer and
      // more see-through instead of a flat, bright-edged silhouette.
      const baked = new THREE.MeshBasicMaterial({
        name: mat.name,
        map: mat.map || null,
        color: mat.color,
        transparent: isHairCard ? false : mat.transparent,
        alphaTest: isHairCard ? 0.2 : mat.alphaTest,
        alphaToCoverage: isHairCard ? true : false,
        side: mat.side,
      });
      // the whole point of a bake is "show exactly what's in the texture" --
      // the renderer's ACES tone mapping + exposure curve (see main.js) is
      // meant for real-time lit surfaces and otherwise uniformly darkens/
      // recompresses every color, baked or not. Opting out here is what
      // was actually causing baked objects to read darker than their source
      // texture, not a normal map (MeshBasicMaterial doesn't use one at all).
      baked.toneMapped = false;
      // the bake already includes real, direction-correct shading — a
      // basic material can't receive/cast dynamic shadows, which is
      // exactly right here (a second dynamic shadow on top of a baked one
      // would double up and look wrong)
      seen.set(mat, baked);
      convertedCount++;
      return baked;
    });

    if (nextMaterials.some((m, i) => m !== materials[i])) {
      obj.material = Array.isArray(obj.material) ? nextMaterials : nextMaterials[0];
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (!HAIR_USE_ORIGINAL_STREAKY_LOOK && /hair/i.test(obj.name)) hairCardMeshes.push(obj);
    }
  });

  // alphaToCoverage alone (see isHairCard above) fixed the streaking but
  // still reads as fairly hard-edged — coverage sampling only gives you as
  // many soft steps as the renderer's MSAA sample count, which isn't a true
  // soft blend. This adds a second, IDENTICAL mesh right on top of each
  // hair mesh, sharing its geometry, but rendered with real alpha blending
  // (depthWrite off, depthTest on). The first (alphaTest) pass already
  // wrote the CORRECT depth for every strand, so this second pass's blended
  // edges are now tested against real, already-resolved depth instead of
  // against each other — that's what was causing the original streaking
  // (blending triangles in storage order, not visibility order). Same
  // trick real-time games use for hair cards: an opaque-ish depth pass plus
  // a blended color pass on top, instead of trying to make one pass do both.
  hairCardMeshes.forEach((obj) => {
    const primary = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const softEdge = new THREE.MeshBasicMaterial({
      name: `${primary.name}_softedge`,
      map: primary.map || null,
      color: primary.color,
      side: primary.side,
      transparent: true,
      // Was fully opaque (1), then 0.72 — still reading "too light and too
      // crispy" on mobile, so down again. Pulling this lower lets the
      // thin, wispy edge pixels genuinely show more background through
      // them instead of covering it, which is the actual "translucent
      // hair" look rather than "hard edge with nicer antialiasing."
      opacity: 0.55,
      depthWrite: false,
      depthTest: true,
    });
    softEdge.toneMapped = false;
    const overlay = new THREE.Mesh(obj.geometry, softEdge);
    overlay.position.copy(obj.position);
    overlay.quaternion.copy(obj.quaternion);
    overlay.scale.copy(obj.scale);
    overlay.renderOrder = (obj.renderOrder || 0) + 1;
    overlay.castShadow = false;
    overlay.receiveShadow = false;
    obj.parent.add(overlay);
  });

  if (convertedCount > 0) {
    console.info(`bakedLook: switched ${convertedCount} baked material(s) to unlit.`);
  }

  return convertedCount;
}
