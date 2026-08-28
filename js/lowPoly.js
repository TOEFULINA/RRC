// ---------------------------------------------------------------------------
// PS1/DS-era mesh look.
//
// The giveaway of that hardware wasn't low polygon COUNT so much as low
// vertex PRECISION: those consoles had no sub-pixel accuracy, so vertices
// snapped to a coarse grid and geometry visibly wobbled and popped as the
// camera moved. That's what this reproduces — it's a vertex-position effect,
// so it works regardless of lighting (important here: the room is baked and
// unlit, so anything that relies on shading — flat/faceted normals — would be
// invisible).
//
// Nothing here touches the geometry itself. It's injected into each
// material's existing shader at compile time, so it's fully reversible:
// set SNAP_ENABLED to false and the look is gone.
// ---------------------------------------------------------------------------

export const SNAP_ENABLED = true;

// Lower = chunkier/wobblier. Roughly "what resolution did this console
// rasterize at": 160x120 is aggressive PS1, 320x240 is a clear DS-ish
// wobble, 640x480 is a subtle shimmer you notice mainly while walking.
export const SNAP_RESOLUTION = [320, 240];

// Applies the snap to every material in the model. Safe to call once, after
// the model is loaded and after any material swapping (e.g. applyBakedLook)
// has already run — otherwise a later swap would replace the patched
// material with a fresh unpatched one.
export function applyLowPolyLook(root) {
  if (!SNAP_ENABLED) return 0;

  const patched = new Set();
  let count = 0;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    mats.forEach((mat) => {
      // Materials are shared between meshes all over this model — patching
      // the same one twice would inject the snap code twice and fail to
      // compile, so each material is only ever touched once.
      if (!mat || patched.has(mat)) return;
      patched.add(mat);

      const prevOnBeforeCompile = mat.onBeforeCompile;

      mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);

        shader.uniforms.uSnapResolution = {
          value: { x: SNAP_RESOLUTION[0], y: SNAP_RESOLUTION[1] },
        };

        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          "#include <common>\nuniform vec2 uSnapResolution;"
        );

        // project_vertex is the chunk that actually writes gl_Position, so
        // this has to come after it. Perspective divide down to normalized
        // device coords, quantize X/Y onto the grid, then multiply back —
        // that's the whole trick.
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          {
            vec4 snapPos = gl_Position;
            snapPos.xyz /= snapPos.w;
            snapPos.xy = floor(uSnapResolution * snapPos.xy) / uSnapResolution;
            snapPos.xyz *= snapPos.w;
            gl_Position = snapPos;
          }`
        );
      };

      // Force three.js to recompile this material with the injected code —
      // without this, anything already compiled keeps its old shader.
      mat.needsUpdate = true;
      count++;
    });
  });

  return count;
}
