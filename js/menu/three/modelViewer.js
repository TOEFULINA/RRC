import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { createStudioEnvironment } from "./studioEnv.js";

// Some exported .glb files (anything run through Draco compression to
// shrink file size — Blender's glTF exporter offers this as a checkbox)
// need a separate decoder to even parse, not just render — GLTFLoader
// throws on them without one attached. The decoder files themselves are
// copied from three's own package into /public/draco/ (see that folder's
// origin: node_modules/three/examples/jsm/libs/draco/gltf/) so this stays
// a same-origin asset instead of depending on a CDN.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/menu/draco/");

// Mounts a small self-contained Three.js viewer into `container`.
// Loads `modelPath` (a .glb) if provided; otherwise (or on load failure)
// falls back to a simple rotating placeholder so the page never looks
// broken while you're still producing real models.
//
// `fitMargin` (optional) overrides the default framing tightness for
// this one model — see the comment above the default further down. Set
// it per item (from items.js) rather than globally: a compact/round mesh
// can safely go tighter than a mesh with long/thin extents (a packaging
// box, a slide) without clipping on rotation, and there's no one value
// that's both big and safe for every shape at once.
//
// `startOpposite` (optional) flips the starting camera angle to the far
// side of the model instead of the shared default corner — per item, same
// reasoning as fitMargin: some models just look better greeting you from
// their other side, without changing that default for every other item.
//
// `startAngle` (optional) — { thetaDeg, phiDeg } — sets an exact starting
// camera angle, overriding startOpposite/the shared default entirely.
// Read these two numbers straight off the on-screen coordinate readout
// (see SHOW_ANGLE_READOUT below): drag to the angle you want, screenshot
// it, and the θ/φ shown is exactly what goes here.
//
// `onExpandChange` (optional) — called with `true`/`false` whenever the
// viewer toggles its own "expanded" mode: click the model once to hide
// the surrounding info card and let this viewer grow to fill that space,
// with free scroll-to-zoom added on top of the usual rotate; click again
// to snap back to the normal framed/zoom-locked view. This callback exists
// because the actual hide/grow layout work happens in the caller's DOM
// (the info card lives outside this viewer's own container) — this module
// only owns the 3D/camera side of that mode (unlocking zoom, telling the
// caller when it changed).
//
// Returns a `dispose()` function — call it when the viewer is removed
// from the DOM (e.g. closing the item modal) to free GPU resources.

// TEMP — an on-screen "θ 132.4°  φ 58.1°" readout in the corner of every
// viewer, live-updating while you drag, so you can find and report an
// exact starting angle instead of eyeballing "opposite-ish". Flip this
// back to false (or delete the block below marked TEMP) once you've
// picked your angles and don't need it anymore.
const SHOW_ANGLE_READOUT = true;

// `animationRange` (optional) — { startFrame, endFrame, fps } — plays only
// this slice of the model's baked animation instead of the whole clip.
// Figure out `fps` from the source: check the spacing between consecutive
// keyframe times in the .glb (a uniform delta of 1/24s = 24fps, 1/30s =
// 30fps, etc) — don't guess, since trimming with the wrong fps plays the
// wrong slice.
export function mountModelViewer(
  container,
  modelPath,
  fitMargin,
  startOpposite,
  startAngle,
  animationRange,
  onExpandChange
) {
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 340;

  const scene = new THREE.Scene();
  // A narrow FOV ("telephoto") rather than a true OrthographicCamera —
  // much less perspective distortion/foreshortening than the old 40°
  // wide-angle look, without having to duplicate the whole zoom/framing
  // math for a second camera type. fitCameraToSphere below pushes the
  // camera back proportionally further to compensate, so the subject's
  // size-in-frame (set by `margin` there) is unaffected by this change.
  const camera = new THREE.PerspectiveCamera(12, width / height, 0.1, 100);
  const baseViewDir = new THREE.Vector3(2.2, 1.6, 2.6).normalize();
  let defaultViewDir = startOpposite ? baseViewDir.clone().multiplyScalar(-1) : baseViewDir;
  if (startAngle) {
    defaultViewDir = new THREE.Vector3().setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(startAngle.phiDeg),
      THREE.MathUtils.degToRad(startAngle.thetaDeg)
    );
  }
  camera.position.copy(defaultViewDir);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02; // nudged with the studio env, whose
  // surround is darker than the old room box and pulled the fill down a little.
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Zoom is locked (see fitCameraToSphere) — free scroll-to-zoom let the
  // model get scrolled in far enough to spill outside the viewer's frame
  // and look clipped. Rotate-only avoids that entirely while still
  // feeling interactive.
  controls.enableZoom = false;

  // "Expanded" mode — click the model once to hide the info card (handled
  // by the caller, via onExpandChange below) and unlock zoom; click again
  // to snap back. Rotate is already free in both modes, so this only ever
  // toggles enableZoom + the min/maxDistance range.
  let expanded = false;
  let pointerDownPos = null;
  let pointerDownTime = 0;
  function toggleExpand() {
    expanded = !expanded;
    if (expanded) {
      // camera.position.length() is exactly the locked framed distance
      // here, since zoom was locked (min===max) up until this toggle —
      // use it as the zoomed-out ceiling so "zoom in" never lets the model
      // zoom back out past its normal framed size.
      const framed = camera.position.length();
      controls.enableZoom = true;
      controls.minDistance = framed * 0.3;
      controls.maxDistance = framed;
    } else {
      controls.enableZoom = false;
      // Re-locks min/maxDistance to a single recomputed value — since
      // OrbitControls clamps to that on its very next update() (see
      // animate() below), this alone snaps any zoomed-in view back to the
      // normal framed one.
      fitCameraToSphere(false);
    }
    if (onExpandChange) onExpandChange(expanded);
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    pointerDownTime = performance.now();
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!pointerDownPos) return;
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    const elapsed = performance.now() - pointerDownTime;
    pointerDownPos = null;
    // Only counts as a click-to-toggle if the pointer barely moved and
    // came back up quickly — anything else is a rotate-drag, which
    // OrbitControls is already handling on this same element.
    if (dist < 6 && elapsed < 500) toggleExpand();
  });

  // TEMP — see SHOW_ANGLE_READOUT above.
  let angleReadout = null;
  if (SHOW_ANGLE_READOUT) {
    angleReadout = document.createElement("div");
    angleReadout.style.cssText = [
      "position:absolute",
      "top:6px",
      "left:6px",
      "padding:3px 7px",
      "background:rgba(0,0,0,0.65)",
      "color:#7CFC9A",
      "font-family:monospace",
      "font-size:11px",
      "line-height:1.4",
      "border-radius:4px",
      "pointer-events:none",
      "z-index:5",
      "white-space:pre",
    ].join(";");
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.appendChild(angleReadout);
    const updateReadout = () => {
      const spherical = new THREE.Spherical().setFromVector3(camera.position);
      const thetaDeg = THREE.MathUtils.radToDeg(spherical.theta);
      const phiDeg = THREE.MathUtils.radToDeg(spherical.phi);
      // theta wraps to [-180, 180] from Spherical — normalize to [0, 360)
      // to match what startAngle above expects.
      const thetaNorm = ((thetaDeg % 360) + 360) % 360;
      angleReadout.textContent = `θ ${thetaNorm.toFixed(1)}°  φ ${phiDeg.toFixed(1)}°`;
    };
    controls.addEventListener("change", updateReadout);
    updateReadout();
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  // Studio setup rather than three's RoomEnvironment — see studioEnv.js for
  // why. Lower sigma than the 0.12 the room box needed: these panels are large
  // and soft to begin with, so blurring them as hard as that just mushes the
  // key and the fill into one another and loses the falloff that makes the
  // clear acrylic look like glass. Still soft enough not to throw the small
  // hard-edged hotspots 0.04 used to.
  const studio = createStudioEnvironment();
  const envTexture = pmrem.fromScene(studio, 0.06).texture;
  scene.environment = envTexture;
  // The scene was only ever scaffolding for the cubemap.
  studio.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    o.material?.dispose();
  });

  // More ambient fill relative to the key light narrows the gap between a
  // model's lit and shadowed sides, which reads as softer overall lighting
  // without needing actual shadow-casting.
  scene.add(new THREE.AmbientLight(0xffffff, 0.46));

  // The main light is PARENTED TO THE CAMERA, so it always arrives from
  // wherever you're looking. The world-space key below stays for shape, but on
  // its own it meant the lit side of an object stayed put while the object
  // swung through it as you orbited — half of every turn was spent looking at
  // the model's shadowed side. A camera-mounted light can't go dark on you.
  const headlight = new THREE.DirectionalLight(0xffffff, 0.85);
  headlight.position.set(0, 0, 1); // in camera space: straight down the lens
  camera.add(headlight);
  // A light only contributes if its whole chain is in the scene graph, and the
  // camera normally isn't — this is what actually switches the headlight on.
  scene.add(camera);

  // Kept, but lowered: it's now shaping on top of the headlight rather than
  // doing the lighting by itself, and slightly off-axis so edges still read.
  const key = new THREE.DirectionalLight(0xfff3e0, 0.35);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.3);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  let subject = null;
  let boundingSphere = null;
  // Some models carry their own baked animation (a moving ribbon, a lid
  // popping open, etc) — mixer stays null for
  // models/placeholders that don't have one, so update() below is a no-op.
  let mixer = null;
  const clock = new THREE.Clock();

  // Points the camera at a distance where the subject's bounding sphere
  // fills the frame at a set ratio, for the current camera aspect — then
  // locks min/maxDistance there so it can never be zoomed past that
  // point. Called once after a model loads (subject not yet rotated, so
  // it also sets the starting angle), and again on resize (min/maxDistance
  // change re-clamps the *existing* camera position via OrbitControls, so
  // the user's current rotation is preserved — see onResize below).
  function fitCameraToSphere(resetAngle) {
    if (!boundingSphere) return;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    // 1.0 = the subject's bounding sphere exactly touches the frame edges
    // from every rotation angle — this is the actual size-in-frame lever
    // (the object's own scale/targetSize below cancels out of this math,
    // since distance is derived from the bounding sphere itself). This is
    // also the hard safety floor for any mesh, shape unknown: going below
    // 1.0 only stays uncropped for roughly ball-shaped meshes — anything
    // more elongated (a long packaging box, a slide) swings its corners
    // past the sphere's own silhouette and out of frame on rotation. Callers
    // that know their specific mesh is compact/round can pass a lower
    // fitMargin for a tighter default fill; unset defaults to this safe floor.
    const margin = fitMargin ?? 1.03;
    const distance = (boundingSphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * margin;

    if (resetAngle) {
      camera.position.copy(defaultViewDir).multiplyScalar(distance);
    }
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.minDistance = distance;
    controls.maxDistance = distance;
    controls.update();
  }

  function frameSubject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    // Just normalizes different models' wildly different export scales to
    // one working size — how much of the frame the subject actually fills
    // is controlled by `margin` in fitCameraToSphere above, not this value.
    const targetSize = 2.4;
    const scale = targetSize / maxDim;
    object.scale.setScalar(scale);

    const newBox = new THREE.Box3().setFromObject(object);
    const newCenter = newBox.getCenter(new THREE.Vector3());
    object.position.sub(newCenter);

    const finalBox = new THREE.Box3().setFromObject(object);
    const sphere = new THREE.Sphere();
    finalBox.getBoundingSphere(sphere);
    boundingSphere = sphere;

    controls.target.set(0, 0, 0);
    fitCameraToSphere(true);
  }

  // The nail-set cases export "clear_plastic_material3" with
  // KHR_materials_transmission. GLTFLoader's own interpretation of it reads
  // milky, so this replaces it with a hand-tuned clear acrylic.
  //
  // (Letting the file's native material through — the way three's own
  // transmission example does — was tried and looked worse here, so this
  // override stays. Matched by name prefix so every nail case gets it without
  // a per-item flag in items.js.)
  function upgradeGlassMaterials(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const isGlass = (m) => m && m.name && m.name.startsWith("clear_plastic");
      const apply = (m) => {
        const glass = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.03,
          // FULL transmission. At 0.65 the remaining 35% still rendered as
          // opaque white diffuse, which is what made the case look milky.
          transmission: 1.0,
          // Thin, with attenuation effectively off (white tint, a very long
          // distance). A thicker value with a blue-white attenuationColor was
          // dyeing the case pale blue.
          thickness: 0.04,
          attenuationColor: 0xffffff,
          attenuationDistance: 1000,
          ior: 1.49, // acrylic — real glass is nearer 1.5
          specularIntensity: 1,
          specularColor: 0xffffff,
          // No clearcoat: on top of a fully transmissive surface it only adds
          // a broad white sheen, which reads as haze on the panel faces.
          clearcoat: 0,
          envMapIntensity: 1.0,
          // Transmission renders in its own pass, NOT the transparent queue.
          // GLTFLoader had this material as BLEND with a 0.25 base alpha, so
          // it was ALSO being alpha-blended at 25% opacity — a second layer of
          // white on top of the transmission.
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
        });
        glass.name = m.name;
        m.dispose();
        return glass;
      };
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => (isGlass(m) ? apply(m) : m));
      } else if (isGlass(obj.material)) {
        obj.material = apply(obj.material);
      }
    });
  }

  function addPlaceholder() {
    const geo = new THREE.IcosahedronGeometry(0.9, 0);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x8a7b5c,
      roughness: 0.35,
      metalness: 0.25,
      clearcoat: 0.4,
      clearcoatRoughness: 0.25,
    });
    subject = new THREE.Mesh(geo, mat);
    scene.add(subject);
    frameSubject(subject);
  }

  if (modelPath) {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.load(
      modelPath,
      (gltf) => {
        subject = gltf.scene;
        // Loaded models open facing the same way they were exported,
        // which for this asset put its back toward the camera/key light
        // on load — spin it 180° so the lit front is what greets you.
        subject.rotation.y = Math.PI;
        upgradeGlassMaterials(subject);
        scene.add(subject);

        if (gltf.animations && gltf.animations.length) {
          mixer = new THREE.AnimationMixer(subject);
          gltf.animations.forEach((clip) => {
            const playClip = animationRange
              ? THREE.AnimationUtils.subclip(
                  clip,
                  `${clip.name}-trim`,
                  animationRange.startFrame,
                  animationRange.endFrame,
                  animationRange.fps ?? 30
                )
              : clip;
            mixer.clipAction(playClip).play();
          });
          // Force the pose forward to whatever the (possibly trimmed) clip
          // actually starts on *before* framing/centering below. Without
          // this, frameSubject measures the untouched bind pose (e.g. the
          // packaging box fully closed), then the animation immediately
          // jumps to its real starting frame (e.g. already mid-opening) —
          // the model's visual centroid shifts after that jump, but the
          // rotation pivot stays locked to the stale bind-pose center, so
          // it visibly spins off-axis instead of around its own middle.
          mixer.update(0);
        }

        frameSubject(subject);
      },
      undefined,
      () => {
        // model missing/failed to load — fall back quietly
        addPlaceholder();
      }
    );
  } else {
    addPlaceholder();
  }

  let raf = null;
  function animate() {
    raf = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    // No auto-rotate — the model sits still until dragged, rather than
    // spinning on its own on load.
    if (mixer) mixer.update(delta);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    if (expanded) {
      // Don't touch min/maxDistance here — that's the user's current free
      // zoom level while expanded, not the locked single-distance frame.
      // Just keep the projection matrix in sync with the new aspect.
      camera.updateProjectionMatrix();
    } else {
      // Re-clamp the zoom-locked distance for the new aspect without
      // resetting the camera's current orbit angle.
      fitCameraToSphere(false);
    }
    renderer.setSize(w, h);
  }
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  function dispose() {
    cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    if (mixer) mixer.stopAllAction();
    controls.dispose();
    pmrem.dispose();
    envTexture.dispose();
    renderer.dispose();
    if (angleReadout && angleReadout.parentNode) {
      angleReadout.parentNode.removeChild(angleReadout);
    }
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  return dispose;
}
