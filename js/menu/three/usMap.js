// ---------------------------------------------------------------------------
// The Map screen: a tilted, top-down 3D relief of the United States with the
// places I've lived marked on it — Skyrim's world map, with the US instead of
// Tamriel.
//
// The terrain comes from menu/map/us-relief.png, baked offline:
//   RGB   = elevation, normalised 0-255
//   alpha = land mask (255 = land, 0 = ocean)
// One texture carries both, so there's no separate mask file and no geometry
// to ship — the mesh is generated here from the pixels. The coastline is real
// (from us-atlas); the elevation is synthesised with the ranges placed from
// actual geography, because this is a stylised map, not a survey.
//
// Everything about the framing is deliberately Skyrim-like: a low tilt so the
// mountains have silhouette, no rotation (the map has a fixed "north up"
// orientation), drag to pan, wheel to zoom, and a marker that names itself
// when you point at it.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const RELIEF_URL = "/menu/map/us-relief.png";

// The lon/lat box the relief was baked against — must match bake-map.mjs.
const LON = [-125.0, -66.9];
const LAT = [24.4, 49.4];

// World units. The map is laid out on the XZ plane with +Y up.
const MAP_W = 58;                 // ~1 unit per degree of longitude
const MAP_H = MAP_W * (LAT[1] - LAT[0]) / (LON[1] - LON[0]) * 1.35;
// 1.35 stretches latitude a little: at these latitudes a degree of longitude
// is much shorter than a degree of latitude, and without it the country reads
// squashed.

const HEIGHT = 6.4;               // peak elevation in world units
const GRID_STEP = 2;              // sample every Nth pixel — 900x420 as-is
                                  // would be 750k triangles for a background
                                  // element. Step 2 gives ~187k, which still
                                  // resolves individual ridges.

const CAM_PITCH = THREE.MathUtils.degToRad(52); // from horizontal
const ZOOM = { min: 22, max: 95, start: 68 };
// Camera distance at or below which place names appear. Between ZOOM.min and
// ZOOM.start, so the map opens as icons only and names fade in as you come
// down toward a region.
const LABEL_ZOOM = 50;

// Skyrim's map is almost monochrome: pale blue-white snow over cold blue-grey
// lowland, everything drained of saturation, with haze swallowing the edges.
// Elevation drives the blend across three stops rather than two — a single
// lerp flattens everything below the peaks into one grey.
const LOW_COLOR = new THREE.Color(0x7c8d9b);
const MID_COLOR = new THREE.Color(0xa8b8c2);
const HIGH_COLOR = new THREE.Color(0xf4f9fb);
// The haze the map sits in. Used for fog AND the background, so terrain
// dissolves into the same air it's surrounded by instead of ending on a
// visible silhouette against the room behind.
const FOG_HEX = 0x8fa0ad;
const FOG_COLOR = new THREE.Color(FOG_HEX);
// The same colour as raw sRGB bytes. The coastal haze below is mixed in AFTER
// the colorspace conversion at the end of the fragment shader, so it has to be
// in screen space, not the linear working space THREE.Color holds. This
// renderer sets no tone mapping, so scene.background comes out as exactly
// these three numbers — which is why the fogged coast matches the surrounding
// air perfectly instead of almost.
const FOG_SRGB = new THREE.Vector3(
  ((FOG_HEX >> 16) & 255) / 255,
  ((FOG_HEX >> 8) & 255) / 255,
  (FOG_HEX & 255) / 255
);

// COASTAL HAZE.
// scene.fog handles distance, but distance fog can't hide a coastline: the
// whole country sits at roughly one depth, so the border stayed a crisp
// cut-out of the United States floating in grey — a map of a country, not a
// piece of land seen through weather. This buries the border instead. A
// distance transform over the land mask gives every vertex its distance to
// the nearest water in grid cells, and the outer band is both drowned in fog
// colour and flattened toward sea level, so the edges just stop existing.
// Tuned against the ZOOMED-IN view, not the whole-country one. A band wide
// enough to look right from orbit swallowed the entire Puget Sound the moment
// you came down over it, and four of the five cities are coastal — the fog has
// to bury the outline without eating the places standing on it.
const COAST_FOG_CELLS = 15;   // how far inland the haze reaches, in grid cells
const COAST_FOG_CORE = 3;     // cells of FULLY fogged coast before it starts
                              // ramping — this is the "crazy thick" part
const COAST_FOG_STRENGTH = 1; // 1 = coastline is pure haze
// The haze is scenery; the five places are the point. Each one keeps a clear
// bubble around it, so a coastal city is never buried in the same weather
// that's hiding the coastline it sits on — the land under a marker stays land.
const PLACE_CLEAR_CELLS = 26;   // radius of fully clear ground, in grid cells
const PLACE_CLEAR_FADE = 16;    // cells the clearing takes to blend back into
                                // the haze, so a bubble has no visible rim

const COAST_FLATTEN = 0.12;   // height multiplier at the very edge, so the
                              // coast sinks into the haze rather than ending
                              // on a lit cliff face poking out of it

// Places, with the marker art each one uses. Bigger cities get the city
// marker, the rest get the settlement one — same convention as the game.
export const PLACES = [
  // `nudge` is [x, z] in world units, added to the true position. Bellingham
  // and Issaquah are 80 miles apart, which on a map of the whole country is
  // less than one marker's width — they sat on top of each other. So they get
  // pushed apart — and pushed INLAND, not out to sea. The first attempt moved
  // Bellingham north-west, which is Bellingham Bay: the marker ended up over
  // open water, where there's no mesh, so no amount of clearing the haze could
  // put ground under it. Issaquah keeps its true position, since that's the
  // room you're standing in. This is a game map, not a survey: readable beats
  // accurate, and the game does the same with its own clusters.
  { id: "bellingham", name: "Bellingham",  region: "Washington", lat: 48.7519, lon: -122.4787, icon: "altar",      nudge: [ 1.5, -1.3] },
  { id: "issaquah",   name: "Issaquah",    region: "Washington", lat: 47.5301, lon: -122.0326, icon: "dragonlair" },
  { id: "sandiego",   name: "San Diego",   region: "California", lat: 32.7157, lon: -117.1611, icon: "college" },
  { id: "nashville",  name: "Nashville",   region: "Tennessee",  lat: 36.1627, lon:  -86.7816, icon: "city" },
  { id: "newyork",    name: "New York",    region: "New York",   lat: 40.7128, lon:  -74.0060, icon: "city" },
];

// Marker art, straight out of the game's Discovered set. Keyed by name so a
// place can be given its own marker without touching anything but its entry
// in PLACES below.
const ICONS = {
  city: "/menu/map/marker-city.png",
  settlement: "/menu/map/marker-settlement.png",
  altar: "/menu/map/marker-altar.png",
  college: "/menu/map/marker-college.png",
  dragonlair: "/menu/map/marker-dragonlair.png",
};

// The player-position marker — the spike the game plants on wherever you are
// standing. It isn't a location, it's you, so it's not in PLACES: no label, no
// click target, no entry in the readout. It just hovers over the room you're
// actually in.
const PLAYER_ICON = "/menu/map/marker-player.png";
const PLAYER_AT = "issaquah";
const PLAYER_SIZE = 3.0;              // world units tall
const PLAYER_ASPECT = 306 / 751;      // the source art's own proportions
const PLAYER_GAP = 0.35;              // clearance between its tip and the top
                                      // of the location marker underneath
const PLAYER_BOB = 0.22;              // how far it drifts up and down
const PLAYER_BOB_HZ = 0.45;

// Where the map opens. The room you're standing in is the Issaquah one, so
// that's where the camera starts — the game opens its map on you, not on the
// whole province, and pulling back to the full country is a thing you do.
// Close enough that the place names are already showing (see LABEL_ZOOM).
const HOME_PLACE = "issaquah";
const HOME_ZOOM = 56;

const MARKER_SIZE = 1.9;
const MARKER_LIFT = 0.9;  // above the terrain, so a marker in the Rockies
                          // isn't buried in a peak

// ---------------------------------------------------------------------------

export function mountUsMap(container, { onSelect } = {}) {
  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;

  // No alpha: this screen is its own world, not an overlay on the room.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = FOG_COLOR;
  // Fog distances are set from the CAMERA DISTANCE, not the map size, and
  // re-derived on every zoom (see placeCamera). Fixed values tuned against
  // MAP_W put the whole country past the far plane the moment the camera
  // pulled back to frame it, and the map vanished into flat haze.
  scene.fog = new THREE.Fog(FOG_COLOR, 1, 2);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 400);

  // Low ambient, strong key: the relief in the reference is carried almost
  // entirely by shadow on the ranges. Flat ambient light erases them.
  scene.add(new THREE.AmbientLight(0xc9d6de, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  // From the north-west and fairly low, so ridges cast their shading along
  // their length and read as ranges rather than flat blobs.
  sun.position.set(-40, 55, -30);
  scene.add(sun);
  const bounce = new THREE.DirectionalLight(0xaebcc6, 0.4);
  bounce.position.set(30, 20, 40);
  scene.add(bounce);

  // ---- camera rig: a target point on the plane, plus a distance ----
  let player = null;
  const target = new THREE.Vector3(0, 0, 0);
  let distance = ZOOM.start;

  // Pull back far enough that the whole country fits, working from whichever
  // of the two axes is the tight one for this container. A fixed start
  // distance only framed correctly at one window shape — on a portrait pane
  // the map ran off both sides.
  function fitToBounds() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const forHeight = (MAP_H / Math.cos(CAM_PITCH)) / (2 * Math.tan(vFov / 2));
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const forWidth = MAP_W / (2 * Math.tan(hFov / 2));
    distance = THREE.MathUtils.clamp(Math.max(forWidth, forHeight) * 1.12, ZOOM.min, ZOOM.max);
  }

  // Centre on the room you're in. The lon/lat maths is inlined rather than
  // using lonToX/latToZ, which aren't declared until further down and would
  // be in the temporal dead zone at the point this first runs.
  function frameHome() {
    const home = PLACES.find((p) => p.id === HOME_PLACE);
    if (!home) { fitToBounds(); return; }
    const [nx, nz] = home.nudge || [0, 0];
    target.x = ((home.lon - LON[0]) / (LON[1] - LON[0]) - 0.5) * MAP_W + nx;
    target.z = ((LAT[1] - home.lat) / (LAT[1] - LAT[0]) - 0.5) * MAP_H + nz;
    distance = THREE.MathUtils.clamp(HOME_ZOOM, ZOOM.min, ZOOM.max);
  }

  function placeCamera() {
    camera.position.set(
      target.x,
      target.y + Math.sin(CAM_PITCH) * distance,
      target.z + Math.cos(CAM_PITCH) * distance
    );
    camera.lookAt(target);
    // Haze starts just past the middle of the view and is total by the far
    // corners — proportional to how far back you are, so zooming in doesn't
    // walk you out of the weather.
    scene.fog.near = distance * 0.75;
    scene.fog.far = distance * 2.15;
  }
  frameHome();
  placeCamera();

  // ---- terrain ----
  const group = new THREE.Group();
  scene.add(group);

  let terrain = null;
  let heights = null;     // Float32Array of sampled elevations, for markers
  let gw = 0, gh = 0;

  const markers = [];
  const labelLayer = document.createElement("div");
  labelLayer.className = "map-labels";
  container.appendChild(labelLayer);

  // lon/lat -> world XZ. Shared by the terrain build and the markers so they
  // can't drift apart.
  const lonToX = (lon) => ((lon - LON[0]) / (LON[1] - LON[0]) - 0.5) * MAP_W;
  const latToZ = (lat) => ((LAT[1] - lat) / (LAT[1] - LAT[0]) - 0.5) * MAP_H;

  function sampleHeight(lon, lat) {
    if (!heights) return 0;
    const u = (lon - LON[0]) / (LON[1] - LON[0]);
    const v = (LAT[1] - lat) / (LAT[1] - LAT[0]);
    const x = Math.round(u * (gw - 1));
    const y = Math.round(v * (gh - 1));
    if (x < 0 || y < 0 || x >= gw || y >= gh) return 0;
    return heights[y * gw + x];
  }

  function buildTerrain(img) {
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, img.height).data;

    gw = Math.floor(img.width / GRID_STEP);
    gh = Math.floor(img.height / GRID_STEP);
    heights = new Float32Array(gw * gh);
    const land = new Uint8Array(gw * gh);

    const pos = [];
    const col = [];
    const haz = [];
    const idx = [];
    const vertexAt = new Int32Array(gw * gh).fill(-1);

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const sx = Math.min(img.width - 1, x * GRID_STEP);
        const sy = Math.min(img.height - 1, y * GRID_STEP);
        const p = (sy * img.width + sx) * 4;
        const isLand = px[p + 3] > 8;
        const h = (px[p] / 255) * HEIGHT;
        heights[y * gw + x] = isLand ? h : 0;
        land[y * gw + x] = isLand ? 1 : 0;
      }
    }

    // Chamfer distance transform: cells to the nearest water, two passes.
    // Water is 0, land counts up from the shore. Cheap, and accurate enough
    // at this grid size that the haze band has no visible stair-stepping.
    const BIG = 1e6;
    const dist = new Float32Array(gw * gh);
    for (let i = 0; i < dist.length; i++) dist[i] = land[i] ? BIG : 0;
    const D1 = 1, D2 = Math.SQRT2;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (!dist[i]) continue;
        let d = dist[i];
        if (x > 0) d = Math.min(d, dist[i - 1] + D1);
        if (y > 0) d = Math.min(d, dist[i - gw] + D1);
        if (x > 0 && y > 0) d = Math.min(d, dist[i - gw - 1] + D2);
        if (x < gw - 1 && y > 0) d = Math.min(d, dist[i - gw + 1] + D2);
        // Off the edge of the grid counts as water too, so the map doesn't
        // end in a hard rectangle where the source image runs out.
        if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) d = Math.min(d, D1);
        dist[i] = d;
      }
    }
    for (let y = gh - 1; y >= 0; y--) {
      for (let x = gw - 1; x >= 0; x--) {
        const i = y * gw + x;
        if (!dist[i]) continue;
        let d = dist[i];
        if (x < gw - 1) d = Math.min(d, dist[i + 1] + D1);
        if (y < gh - 1) d = Math.min(d, dist[i + gw] + D1);
        if (x < gw - 1 && y < gh - 1) d = Math.min(d, dist[i + gw + 1] + D2);
        if (x > 0 && y < gh - 1) d = Math.min(d, dist[i + gw - 1] + D2);
        dist[i] = d;
      }
    }

    // Where each place sits, in grid cells — including its readability nudge,
    // so the bubble is centred under the icon you actually see rather than
    // under the coordinates it was moved off.
    const clearAt = PLACES.map((pl) => {
      const [nx = 0, nz = 0] = pl.nudge || [];
      return {
        cx: ((pl.lon - LON[0]) / (LON[1] - LON[0])) * (gw - 1) + (nx / MAP_W) * (gw - 1),
        cy: ((LAT[1] - pl.lat) / (LAT[1] - LAT[0])) * (gh - 1) + (nz / MAP_H) * (gh - 1),
      };
    });

    // 0 out at the places, 1 everywhere the weather is allowed to be.
    function clearanceAt(x, y) {
      let keep = 1;
      for (const c of clearAt) {
        const d = Math.hypot(x - c.cx, y - c.cy);
        if (d >= PLACE_CLEAR_CELLS + PLACE_CLEAR_FADE) continue;
        const t = THREE.MathUtils.clamp((d - PLACE_CLEAR_CELLS) / PLACE_CLEAR_FADE, 0, 1);
        keep = Math.min(keep, t * t * (3 - 2 * t));
      }
      return keep;
    }

    // 1 at the shore, 0 once you're properly inland. Flat through the core
    // band, then smoothstepped out so there's no line where the fog stops —
    // then held off entirely wherever one of the places is standing.
    function hazeAt(i, x, y) {
      const t = THREE.MathUtils.clamp(
        (dist[i] - COAST_FOG_CORE) / (COAST_FOG_CELLS - COAST_FOG_CORE), 0, 1
      );
      const fog = (1 - t * t * (3 - 2 * t)) * COAST_FOG_STRENGTH;
      return fog * clearanceAt(x, y);
    }

    // Only emit vertices that belong to at least one fully-land cell, so the
    // mesh stops at the coastline instead of draping a skirt over the ocean.
    const used = new Uint8Array(gw * gh);
    for (let y = 0; y < gh - 1; y++) {
      for (let x = 0; x < gw - 1; x++) {
        const a = y * gw + x, b = a + 1, c = a + gw, d = c + 1;
        if (!(land[a] && land[b] && land[c] && land[d])) continue;
        used[a] = used[b] = used[c] = used[d] = 1;
      }
    }

    let n = 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (!used[i]) continue;
        vertexAt[i] = n++;
        const haze = hazeAt(i, x, y);
        haz.push(haze);
        // Sink the coast, but only in the mesh — heights[] stays honest,
        // because sampleHeight() places the markers off it and four of the
        // five cities are on or near a coast.
        const h = heights[i] * (1 - haze * (1 - COAST_FLATTEN));
        pos.push(
          (x / (gw - 1) - 0.5) * MAP_W,
          h,
          (y / (gh - 1) - 0.5) * MAP_H
        );
        // Two-stage ramp: lowland to mid, mid to snow. A single lerp made
        // everything below the peaks one flat grey.
        const t = heights[i] / HEIGHT;
        const c = t < 0.45
          ? LOW_COLOR.clone().lerp(MID_COLOR, t / 0.45)
          : MID_COLOR.clone().lerp(HIGH_COLOR, (t - 0.45) / 0.55);
        col.push(c.r, c.g, c.b);
      }
    }

    for (let y = 0; y < gh - 1; y++) {
      for (let x = 0; x < gw - 1; x++) {
        const a = y * gw + x, b = a + 1, c = a + gw, d = c + 1;
        if (!(land[a] && land[b] && land[c] && land[d])) continue;
        const va = vertexAt[a], vb = vertexAt[b], vc = vertexAt[c], vd = vertexAt[d];
        idx.push(va, vc, vb, vb, vc, vd);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("aHaze", new THREE.Float32BufferAttribute(haz, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: false,
    });
    // The haze has to be applied AFTER lighting, not as a vertex colour: a
    // fog-coloured slope is still a lit slope, so tinting the vertices alone
    // left the coastline visible as shading even once it was the right colour.
    // Mixing at the very end of the fragment shader overwrites the lighting
    // outright, which is what actually makes the border disappear.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.hazeColor = { value: FOG_SRGB };
      shader.vertexShader =
        "attribute float aHaze;\nvarying float vHaze;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  vHaze = aHaze;"
        );
      shader.fragmentShader =
        "varying float vHaze;\nuniform vec3 hazeColor;\n" +
        shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          "gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, clamp(vHaze, 0.0, 1.0));\n#include <dithering_fragment>"
        );
    };
    terrain = new THREE.Mesh(geo, mat);
    group.add(terrain);

    console.info(`map: ${(idx.length / 3) | 0} triangles, ${n} vertices`);
    addMarkers();
  }

  // ---- markers ----
  function addMarkers() {
    const loader = new THREE.TextureLoader();
    const texCache = {};
    for (const place of PLACES) {
      const url = ICONS[place.icon] || ICONS.settlement;
      if (!texCache[url]) {
        texCache[url] = loader.load(url);
        texCache[url].colorSpace = THREE.SRGBColorSpace;
      }
      const mat = new THREE.SpriteMaterial({
        map: texCache[url],
        transparent: true,
        // Markers are UI, not scenery: they should never be hidden behind a
        // mountain the way a real object would be.
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const [nx, nz] = place.nudge || [0, 0];
      const x = lonToX(place.lon) + nx;
      const z = latToZ(place.lat) + nz;
      // Height still sampled at the REAL spot — the nudge is a readability
      // offset, not a claim that the town moved into the next valley.
      const y = sampleHeight(place.lon, place.lat) + MARKER_LIFT;
      sprite.position.set(x, y, z);
      sprite.scale.set(MARKER_SIZE * 0.82, MARKER_SIZE, 1);
      sprite.renderOrder = 10;
      sprite.userData.place = place;
      group.add(sprite);

      const label = document.createElement("div");
      label.className = "map-label";
      label.textContent = place.name;
      labelLayer.appendChild(label);

      markers.push({ place, sprite, label, base: y });

      if (place.id === PLAYER_AT) addPlayerMarker(x, y, z);
    }
  }

  // Sits directly above that location's own marker, tip down, so the two read
  // as one stack rather than two icons fighting for the same spot.
  function addPlayerMarker(x, baseY, z) {
    const tex = new THREE.TextureLoader().load(PLAYER_ICON);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    );
    sprite.scale.set(PLAYER_SIZE * PLAYER_ASPECT, PLAYER_SIZE, 1);
    sprite.renderOrder = 11;
    group.add(sprite);
    // Only the anchor is stored — the actual position is recomputed every
    // frame in tick(), stepped along the CAMERA's up rather than the world's.
    // Sprites are billboarded, so their on-screen height runs along camera-up;
    // a world-Y offset of the same length projects to less than that at a 52°
    // pitch, which is how the first attempt ended up sitting on the location
    // marker instead of above it.
    player = { sprite, anchor: new THREE.Vector3(x, baseY, z) };
  }

  // ---- interaction ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let selected = null;
  let dragging = false;
  let dragFrom = null;

  const canvas = renderer.domElement;

  function pointerToNdc(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markers.map((m) => m.sprite), false);
    return hits.length ? hits[0].object.userData.place : null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragFrom = { x: e.clientX, y: e.clientY, tx: target.x, tz: target.z };
    dragging = false;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (dragFrom) {
      const dx = e.clientX - dragFrom.x;
      const dy = e.clientY - dragFrom.y;
      if (!dragging && Math.hypot(dx, dy) > 4) dragging = true;
      if (dragging) {
        // Pan in world units. Scaling by distance keeps the map moving at the
        // same speed under the cursor whatever the zoom level; without it,
        // panning zoomed-in feels glacial and zoomed-out feels like a flick.
        const k = distance / 620;
        target.x = dragFrom.tx - dx * k;
        target.z = dragFrom.tz - dy * k / Math.cos(CAM_PITCH);
        clampTarget();
        placeCamera();
      }
      return;
    }
    pointerToNdc(e);
    const p = pick();
    if (p !== hovered) {
      hovered = p;
      canvas.style.cursor = p ? "pointer" : "grab";
    }
  });

  const endDrag = (e) => {
    if (dragFrom && !dragging) {
      pointerToNdc(e);
      const p = pick();
      if (p) {
        selected = p;
        onSelect?.(p);
      }
    }
    dragFrom = null;
    dragging = false;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { dragFrom = null; dragging = false; });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    distance = THREE.MathUtils.clamp(distance * (1 + Math.sign(e.deltaY) * 0.12), ZOOM.min, ZOOM.max);
    placeCamera();
  }, { passive: false });

  function clampTarget() {
    // Keep the country from being dragged entirely off screen.
    const mx = MAP_W * 0.42, mz = MAP_H * 0.6;
    target.x = THREE.MathUtils.clamp(target.x, -mx, mx);
    target.z = THREE.MathUtils.clamp(target.z, -mz, mz);
  }

  // ---- labels: HTML, not sprites, so the type stays sharp ----
  const _v = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const LABEL_PAD = 5; // px between the bottom of the icon and the name
  function updateLabels() {
    const r = canvas.getBoundingClientRect();
    // A sprite is billboarded along the CAMERA's up, not the world's, so the
    // bottom edge of an icon is found by stepping down that axis. Offsetting
    // by a fixed pixel count instead (what this did before) only lines up at
    // one zoom level — the icon grows and shrinks in screen space, the 18px
    // didn't, and the name ended up inside the marker when you came in close.
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const m of markers) {
      _v.copy(m.sprite.position).addScaledVector(_up, -m.sprite.scale.y * 0.5).project(camera);
      const on = _v.z < 1;
      const x = (_v.x * 0.5 + 0.5) * r.width;
      const y = (-_v.y * 0.5 + 0.5) * r.height;
      m.label.style.transform = `translate(-50%, 0) translate(${x}px, ${y + LABEL_PAD}px)`;
      const active = hovered === m.place || selected === m.place;
      // Names are a zoomed-in detail. Pulled back to the whole country you get
      // bare icons — five labels floating over the full map is clutter, and
      // the game only names what you're actually looking at. Anything you
      // hover or have selected is named regardless of zoom, so a marker can
      // always tell you what it is without a trip to the readout.
      m.label.classList.toggle("visible", on && (active || distance <= LABEL_ZOOM));
      m.label.classList.toggle("active", active);
      // Selected markers sit slightly higher and larger, the way the game
      // lifts the one you're pointing at.
      const lift = active ? 0.5 : 0;
      m.sprite.position.y = m.base + lift;
      const s = active ? 1.18 : 1;
      m.sprite.scale.set(MARKER_SIZE * 0.82 * s, MARKER_SIZE * s, 1);
    }
  }

  // ---- loop ----
  let raf = 0;
  const clock = new THREE.Clock();
  function tick() {
    raf = requestAnimationFrame(tick);
    // A slow hover, so the one marker that means "you" is the one thing on the
    // map that's alive.
    if (player) {
      const bob = Math.sin(clock.getElapsedTime() * Math.PI * 2 * PLAYER_BOB_HZ) * PLAYER_BOB;
      const lift = MARKER_SIZE * 0.5 + PLAYER_GAP + PLAYER_SIZE * 0.5 + bob;
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      player.sprite.position.copy(player.anchor).addScaledVector(_up, lift);
    }
    updateLabels();
    renderer.render(scene, camera);
  }

  // ---- load ----
  const img = new Image();
  img.onload = () => { buildTerrain(img); tick(); };
  img.onerror = (e) => console.error("map: couldn't load the relief —", e);
  img.src = RELIEF_URL;

  // ---- resize ----
  let framedOnce = false;
  const onResize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    // The first time the container reports a real size, re-fit — mounting can
    // happen before layout, when the element still measures 0 and any framing
    // computed then is meaningless.
    if (!framedOnce && w > 1 && h > 1) {
      framedOnce = true;
      frameHome();
      placeCamera();
    }
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(container);

  return function dispose() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m?.map?.dispose?.(); m?.dispose?.(); });
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    labelLayer.remove();
    canvas.remove();
  };
}
