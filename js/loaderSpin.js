// ---------------------------------------------------------------------------
// Loading screen turntable.
//
// One of the Skyrim-menu models spinning on the black loading screen while the
// room's 16MB .glb comes down. It gets its own tiny renderer rather than
// borrowing the main one, so it can start the instant the page does — the main
// scene isn't ready yet, which is the entire point of a loading screen.
//
// "Pixely" here is done honestly rather than with a CSS filter: the thing
// really is rendered at 72x72 and blown up to 240 by the browser with
// `image-rendering: pixelated`, with nearest-neighbour texture filtering and
// no mipmaps, so the chunk is real geometry and real texels, and the edges
// crawl as it turns the way they should.
//
// The model is small (a few hundred KB) and downloads alongside the room, so
// it costs essentially nothing against the thing it's covering for.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// Swap this for any file in menu/models/ — everything below reframes itself
// around whatever shape turns up.
// A loader-only cut of the Beef Clog: normal maps dropped, textures at 128px,
// geometry at 4%. The full item model is 1.4MB and 308k triangles, which is
// absurd for something drawn into a 72x72 buffer — this is 83KB and 0.6MB of
// GPU. Build a new one with loadermodel.mjs, then swap this line; everything
// below reframes itself around whatever shape turns up.
const SPIN_MODEL = "menu/models/loader-clog.glb";

const SPIN_SPEED = 0.7;      // radians/sec around Y
const TUMBLE = 0.16;         // radians of slow nod, so it isn't a flat turntable
const TUMBLE_SPEED = 0.55;
const FIT = 1.6;             // camera distance as a multiple of the model's radius

let renderer = null;
let raf = 0;
let pivot = null;
let scene = null;
let camera = null;
let clock = null;

export function startLoaderSpin() {
  const canvas = document.getElementById("loading-spin");
  if (!canvas) return;

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  } catch (err) {
    // No WebGL context to spare — the loading screen still reads fine as text.
    console.warn("loader spin: no renderer,", err);
    return;
  }
  // setSize with updateStyle=false: the canvas keeps the CSS size the
  // stylesheet gave it and only the drawing buffer is tiny. That mismatch IS
  // the pixelation.
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);

  // Rebalanced for the off-white screen. The old values were set against a
  // near-black background, where flooding the model with ambient light still
  // left it reading as a bright shape on dark; on a pale ground that same fill
  // washes it out into the background. Less ambient, harder key: the model
  // needs its own shadow side to have a silhouette here.
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
  key.position.set(1.5, 2, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcc9e8, 0.6);
  rim.position.set(-2, 0.5, -1.5);
  scene.add(rim);

  pivot = new THREE.Group();
  scene.add(pivot);

  const draco = new DRACOLoader();
  draco.setDecoderPath("menu/draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  loader.load(
    SPIN_MODEL,
    (gltf) => {
      if (!pivot) return; // loading finished before the toy arrived
      const model = gltf.scene;

      model.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (!m?.map) continue;
          // Nearest + no mipmaps: at this size a filtered texture just turns to
          // grey mush, and hard texels are the look we're after.
          m.map.minFilter = THREE.NearestFilter;
          m.map.magFilter = THREE.NearestFilter;
          m.map.generateMipmaps = false;
          m.map.needsUpdate = true;
        }
      });

      // Recentre on the model's own bounding box and pull the camera back to
      // fit it, so swapping SPIN_MODEL needs no hand-tuned numbers.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      model.position.sub(centre);
      pivot.add(model);

      const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
      camera.position.set(0, radius * 0.35, radius * FIT * 2.2);
      camera.lookAt(0, 0, 0);
      camera.near = radius * 0.05;
      camera.far = radius * 40;
      camera.updateProjectionMatrix();
    },
    undefined,
    (err) => console.warn("loader spin: couldn't load", SPIN_MODEL, err)
  );

  clock = new THREE.Clock();
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (pivot) {
      pivot.rotation.y = t * SPIN_SPEED;
      pivot.rotation.x = Math.sin(t * TUMBLE_SPEED) * TUMBLE;
    }
    renderer.render(scene, camera);
  };
  tick();
}

// Called once the room is up. Frees the second WebGL context and everything it
// holds — two live contexts is a real cost on a laptop GPU, and this one has
// no reason to exist after the loading screen fades.
export function stopLoaderSpin() {
  cancelAnimationFrame(raf);
  raf = 0;
  scene?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      m?.map?.dispose();
      m?.dispose();
    }
  });
  renderer?.dispose();
  renderer?.forceContextLoss?.();
  renderer = null;
  scene = null;
  camera = null;
  pivot = null;
}
