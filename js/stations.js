// ---------------------------------------------------------------------------
// Stations — click an object in the room and the camera locks onto it while a
// flat 2D panel takes over.
//
// Two of them so far: the speaker (a music player) and the desk (illustrations
// you can push around). They share everything except what goes in the panel.
//
// The 3D is FROZEN while a station is open. The last rendered frame is copied
// out of the canvas into an <img> behind the panel and the render loop stops —
// so a phone holding this open is showing a still picture and some DOM, not a
// live WebGL scene. That is the whole reason it can be left open.
//
// This module owns the picking, the pose maths and the panels. It does NOT own
// the camera: main.js hands it a tween function and a freeze/thaw pair, so
// there is still exactly one place in the codebase that writes camera.position.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { items } from "./menu/data/items.js";
import { mountModelViewer } from "./menu/three/modelViewer.js?v=2026-09-03px";

// Which meshes are clickable, and what opens when they are. The desk is
// several meshes (the top, the boot on it, the drawers), so the pattern
// deliberately matches all of them and they collapse into one station.
// ---------------------------------------------------------------- pickups
// Things in the room that are ALSO pieces in the Items menu. Tapping one
// freezes the room where you stand and opens the same 3D viewer the menu
// uses, over the frozen frame. Tapping out puts you back exactly where you
// were — the camera never moved, so there is nothing to restore.
//
// Matching is by mesh name except for the belt, which has no node of its own:
// in room.glb it is a primitive on a multi-material mesh confusingly called
// LADYBUG_LAMP_6, and the only thing identifying it is the BELT material.
const PICKUPS = [
  { itemId: "item-11", mesh: /^PIN_BAG/i },                       // Button Covered Bag
  { itemId: "item-19", mesh: /^STICKER[_ ]BOOT[_ ]DESK/i },       // Sticker Print Boots
  { itemId: "item-22", mesh: /^CLAY[_ ]SHOE[_ ]BOX/i },           // Claymation Shoe Box
  { itemId: "item-10", material: /^BELT$/i },                     // Charm Belt
];

const STATIONS = [
  { id: "speaker", pattern: /^speaker/i, label: "play something" },
  {
    id: "desk",
    // The boot and the markers standing on the desk are their own meshes, so
    // they can be matched by name. The DESK ITSELF is not — it was modelled as
    // part of the loft bed, so BEDRAME is one mesh covering the bed, the
    // ladder and the desk together.
    // The boots that used to trigger this are a pickup now, so the desk is
    // opened by the markers or by the desktop surface itself.
    pattern: /^posca/i,
    // Hence the zone: hits on BEDRAME only count as the desk if they land
    // inside this box, which is the desk surface and the air just above it.
    // Click the bed or the ladder and nothing happens, as it should.
    zonePattern: /^bedrame/i,
    zone: { min: [-1.38, 0.70, -1.72], max: [-0.98, 1.14, -0.52] },
    label: "look at the drawings",
  },
];

// How the camera sits when a station opens. `back` is how far to stand off the
// object, `rise` how far above its centre, `fov` the lens. The panel covers
// most of the screen anyway — this is about the half-second of travel you see
// before it does.
const POSE = {
  // Close enough that the speaker fills the frame behind the nano — at 0.62m
  // it read as a small object across the room.
  speaker: { back: 0.36, rise: 0.02, fov: 36 },
  // Measured, not derived. Deriving it from the clickable meshes put the
  // camera among the ladder rails, because the only things on the desk with
  // names of their own sit at opposite ends of it. This stands you at the
  // desk looking down its length, which is the POV she asked for.
  // Square on to the desk's long side so its edge runs horizontal across the
  // frame, boot at the left, poscas at the right — her Blender reference.
  // Two constraints fix the height: the loft platform is at y=1.31, so the eye
  // has to stay under it AND tilt down far enough that the top of the frame
  // never reaches it either.
  // Just under the loft platform (1.31m) looking down the desk, on as long a
  // lens as the space allows. The narrow field is what flattens the
  // perspective toward orthographic — going higher isn't an option, there is
  // a bed in the way, so the flattening has to come from the lens.
  desk: { eye: [-1.02, 1.295, -1.05], look: [-1.12, 0.80, -1.07], fov: 40 },
};

const TWEEN_HOLD = 0.18;   // beat between the camera arriving and the panel

let camera = null;
let canvasEl = null;
let onTween = null;        // (pose, done) => void   — main.js's startCamTween
let onFreeze = null;       // (dataUrl) => void      — stop the loop, show still
let onThaw = null;         // ()       => void       — resume the loop
let onClip = null;         // (y|null) => void       — cut away above y
let onOpenItems = null;    // (itemId)  => void      — hand off to the menu

const found = new Map();   // id -> { meshes: [], box: Box3 }
const pickupMeshes = [];   // { mesh, itemId }
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();

let openId = null;
let opening = false;
let restorePose = null;

export function initStations(model, cam, canvas, hooks) {
  camera = cam;
  canvasEl = canvas;
  onTween = hooks.tween;
  onFreeze = hooks.freeze;
  onThaw = hooks.thaw;
  onClip = hooks.clip;
  onOpenItems = hooks.openItems;

  found.clear();
  pickupMeshes.length = 0;
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const name = obj.name || "";
    const matNames = (Array.isArray(obj.material) ? obj.material : [obj.material])
      .map((m) => m?.name || "");
    for (const p of PICKUPS) {
      const byName = p.mesh && p.mesh.test(name);
      const byMat = p.material && matNames.some((n) => p.material.test(n));
      if (byName || byMat) pickupMeshes.push({ mesh: obj, itemId: p.itemId });
    }
    for (const st of STATIONS) {
      const direct = st.pattern.test(name);
      const zoned = st.zonePattern?.test(name);
      if (!direct && !zoned) continue;
      if (!found.has(st.id)) {
        found.set(st.id, {
          meshes: [], zoneMeshes: [], box: new THREE.Box3(),
          zone: st.zone
            ? new THREE.Box3(new THREE.Vector3(...st.zone.min), new THREE.Vector3(...st.zone.max))
            : null,
        });
      }
      const entry = found.get(st.id);
      obj.updateMatrixWorld(true);
      if (direct) { entry.meshes.push(obj); entry.box.expandByObject(obj); }
      else entry.zoneMeshes.push(obj);
    }
  });

  buildPanels();
  return [...found.keys(), `${pickupMeshes.length} pickup mesh(es)`];
}

export function isStationOpen() { return openId !== null || opening || itemOpen; }

// ---------------------------------------------------------------- the item
// preview. One viewer at a time, mounted on open and disposed on close, so
// nothing lingers: the room's own context is idle behind it and this is the
// only other one alive.
let itemOpen = false;
let itemRoot = null;
let itemViewerBox = null;
let itemDispose = null;
let itemCurrent = null;

function buildItemOverlay() {
  if (itemRoot) return;
  itemRoot = el("div", "pickup-root", document.body);
  itemRoot.hidden = true;
  el("img", "station-still", itemRoot);
  const scrim = el("div", "pickup-scrim", itemRoot);
  // Tapping the backdrop is the way out, so it must not catch drags on the
  // model — the viewer's own canvas sits above it and swallows those.
  scrim.addEventListener("pointerdown", (e) => {
    if (e.target === scrim) closeStation();
  });
  itemViewerBox = el("div", "pickup-viewer", scrim);
  const card = el("div", "pickup-card", scrim);
  el("div", "pickup-name", card);
  el("div", "pickup-stats", card);
  const toItems = el("button", "pickup-to-items", card);
  toItems.type = "button";
  toItems.textContent = "see it in items";
  toItems.addEventListener("click", () => {
    const id = itemCurrent?.id;
    closeStation();
    if (id) onOpenItems?.(id);
  });
  const close = el("button", "station-close", itemRoot);
  close.type = "button";
  close.setAttribute("aria-label", "close");
  close.textContent = "\u00d7";
  close.addEventListener("click", closeStation);
}

function openItemPreview(itemId) {
  if (openId || opening || itemOpen) return false;
  const item = items.find((i) => i.id === itemId);
  if (!item || !item.model) {
    console.warn("pickup: no model for", itemId);
    return false;
  }
  buildItemOverlay();
  itemCurrent = item;
  onFreeze();
  itemOpen = true;
  itemRoot.hidden = false;
  requestAnimationFrame(() => itemRoot.classList.add("is-open"));

  itemRoot.querySelector(".pickup-name").textContent = item.name;
  itemRoot.querySelector(".pickup-stats").innerHTML = (item.stats || [])
    .map((s2) => `<span><i>${s2.label}</i> ${s2.value}</span>`)
    .join("");

  // The caption line has to clear the card at the bottom of this overlay. The
  // card's height depends on its own copy (stats wrap differently per item),
  // so it is measured after layout rather than guessed at in CSS.
  document.body.classList.add("has-pickup");
  requestAnimationFrame(() => {
    const card = itemRoot.querySelector(".pickup-card");
    if (card) {
      document.documentElement.style.setProperty(
        "--pickup-card-h", `${Math.round(card.getBoundingClientRect().height)}px`
      );
    }
  });

  itemDispose = mountModelViewer(
    itemViewerBox,
    item.model,
    item.viewerFitMargin,
    item.viewerStartOpposite,
    item.viewerStartAngle,
    item.viewerAnimationRange,
    null,
    { pixelated: true }        // match the room, not the menu
  );
  return true;
}

function closeItemPreview() {
  if (!itemOpen) return false;
  itemRoot.classList.remove("is-open");
  try { itemDispose?.(); } catch (err) { console.error("pickup: dispose —", err); }
  itemDispose = null;
  itemCurrent = null;
  itemOpen = false;
  document.body.classList.remove("has-pickup");
  onThaw();
  setTimeout(() => { if (!itemOpen && itemRoot) itemRoot.hidden = true; }, 320);
  return true;
}

// Which station, if any, is under the pointer.
export function pickStation(clientX, clientY) {
  if (!camera || !canvasEl || !found.size) return null;
  const r = canvasEl.getBoundingClientRect();
  ptr.x = ((clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  let best = null;
  const take = (id, hit) => {
    if (hit && (!best || hit.distance < best.distance)) best = { id, distance: hit.distance };
  };
  for (const [id, entry] of found) {
    take(id, ray.intersectObjects(entry.meshes, false)[0]);
    if (!entry.zone || !entry.zoneMeshes.length) continue;
    // A shared mesh only counts where it passes through the station's zone.
    for (const hit of ray.intersectObjects(entry.zoneMeshes, false)) {
      if (!entry.zone.containsPoint(hit.point)) continue;
      take(id, hit);
      break;
    }
  }
  for (const { mesh, itemId } of pickupMeshes) {
    const hit = ray.intersectObject(mesh, false)[0];
    if (hit && (!best || hit.distance < best.distance)) {
      best = { id: `item:${itemId}`, distance: hit.distance };
    }
  }
  return best?.id ?? null;
}

// Stand in front of the station's centre, on the side facing the open room.
function poseFor(id, bounds) {
  const entry = found.get(id);
  const cfg = POSE[id] || POSE.speaker;

  // An explicitly measured pose wins over anything derived from the meshes.
  if (cfg.eye) {
    const pos = new THREE.Vector3(...cfg.eye);
    const dir = new THREE.Vector3(...cfg.look).sub(pos).normalize();
    return {
      pos,
      yaw: Math.atan2(dir.x, dir.z),
      pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)),
      fov: cfg.fov,
    };
  }
  const centre = entry.box.getCenter(new THREE.Vector3());
  const aim = cfg.aimTop
    ? new THREE.Vector3(centre.x, entry.box.max.y, centre.z)
    : centre.clone();

  const roomCentre = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2, aim.y, (bounds.minZ + bounds.maxZ) / 2
  );
  const face = new THREE.Vector3().subVectors(roomCentre, aim);
  face.y = 0;
  if (face.lengthSq() < 1e-6) face.set(0, 0, 1);
  face.normalize();

  const pos = aim.clone()
    .addScaledVector(face, cfg.back)
    .add(new THREE.Vector3(0, cfg.rise, 0));
  // Keep the eye inside the room even if the object sits hard against a wall.
  pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX + 0.12, bounds.maxX - 0.12);
  pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ + 0.12, bounds.maxZ - 0.12);

  const dir = new THREE.Vector3().subVectors(aim, pos).normalize();
  return {
    pos,
    yaw: Math.atan2(dir.x, dir.z),
    pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)),
    fov: cfg.fov,
  };
}

export function openStation(id, bounds, current) {
  if (id.startsWith("item:")) return openItemPreview(id.slice(5));
  if (openId || opening || !found.has(id)) return false;
  opening = true;
  restorePose = current;
  // Clip before the flight starts, so the camera rising through the loft
  // reads as the bed clearing out of the way rather than as a glitch.
  onClip?.(POSE[id]?.clipY ?? null);
  onTween(poseFor(id, bounds), () => {
    // The camera has arrived — take the still, stop the loop, raise the panel.
    setTimeout(() => {
      onFreeze();
      openId = id;
      opening = false;
      showPanel(id);
    }, TWEEN_HOLD * 1000);
  });
  return true;
}

export function closeStation() {
  if (closeItemPreview()) return true;
  if (!openId) return false;
  const id = openId;
  hidePanel(id);
  openId = null;
  onClip?.(null);
  onThaw();
  if (restorePose) {
    const back = restorePose;
    restorePose = null;
    onTween(back, null);
  }
  return true;
}

// ---------------------------------------------------------------- the panels

let root = null;
let tracks = [];
let pieces = [];
let audio = null;
let nowPlaying = -1;

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function buildPanels() {
  if (root) return;
  root = el("div", "station-root", document.body);
  root.hidden = true;

  // the frozen frame sits behind everything
  el("img", "station-still", root);

  const scrim = el("div", "station-scrim", root);
  scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) closeStation(); });

  buildPlayer(scrim);
  buildDesk(scrim);

  const close = el("button", "station-close", root);
  close.type = "button";
  close.setAttribute("aria-label", "close");
  close.textContent = "×";
  close.addEventListener("click", closeStation);
}

function showPanel(id) {
  root.hidden = false;
  root.dataset.station = id;
  // one frame later, so the transition has a from-state to animate out of
  requestAnimationFrame(() => root.classList.add("is-open"));
  if (id === "speaker") loadTracks();
  if (id === "desk") loadPieces();
}

function hidePanel(id) {
  if (zoomed) { zoomed.classList.remove("is-zoomed"); zoomed = null; }
  deskEls?.board.classList.remove("has-zoom");
  root.classList.remove("is-open");
  if (id === "speaker" && audio) audio.pause();
  setTimeout(() => { if (!openId) root.hidden = true; }, 320);
}

export function setStill(dataUrl) {
  for (const host of [root, itemRoot]) {
    const img = host?.querySelector(".station-still");
    if (img) img.src = dataUrl;
  }
}

// ---- speaker: the player -------------------------------------------------
let playerEls = null;

function buildPlayer(parent) {
  // dock wrapper: the thing that travels down, with the pod inside it
  const dock = el("div", "ipod-dock", parent);
  const pod = el("div", "ipod", dock);
  const screen = el("div", "ipod-screen", pod);
  // Laid out like the real Now Playing screen: title bar, art bottom-left,
  // track details up the right, elapsed / bar / remaining across the bottom.
  const chrome = el("div", "ipod-chrome", screen);
  el("span", "ipod-chrome-label", chrome).textContent = "Now Playing";
  el("span", "ipod-battery", chrome);
  const art = el("img", "ipod-art", screen);
  art.alt = "";
  const meta = el("div", "ipod-meta", screen);
  const title = el("div", "ipod-title", meta);
  const artist = el("div", "ipod-artist", meta);
  const album = el("div", "ipod-album", meta);
  const count = el("div", "ipod-count", meta);
  const foot = el("div", "ipod-foot", screen);
  const elapsed = el("span", "ipod-time", foot);
  const bar = el("div", "ipod-bar", foot);
  const fill = el("div", "ipod-fill", bar);
  const remain = el("span", "ipod-time", foot);
  elapsed.textContent = "0:00";
  remain.textContent = "-0:00";
  bar.addEventListener("pointerdown", (e) => {
    if (!audio || !audio.duration) return;
    const r = bar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
  });

  const wheel = el("div", "ipod-wheel", pod);
  // Drawn as SVG rather than typed as characters. The transport glyphs in
  // Unicode (U+23EE and friends) are emoji-presentation by default, so iOS was
  // rendering them as blue rounded emoji regardless of the font stack — a
  // variation selector fixes that on some platforms and not others. A path is
  // a path everywhere, and it inherits the button's colour.
  const TRANSPORT = {
    prev: '<path d="M4 5h2.5v14H4zM20 5v14l-6.5-7zM12.5 5v14L6 12z"/>',
    play: '<path d="M4 5v14l9.5-7zM16.5 5H19v14h-2.5zM20.5 5H23v14h-2.5z"/>',
    next: '<path d="M17.5 5H20v14h-2.5zM4 5l6.5 7L4 19zM10.5 5l6.5 7-6.5 7z"/>',
  };
  const glyph = (k) =>
    `<svg viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${TRANSPORT[k]}</svg>`;

  const prev = el("button", "ipod-btn prev", wheel);
  prev.innerHTML = glyph("prev");
  prev.setAttribute("aria-label", "Previous track");
  const play = el("button", "ipod-btn play", wheel);
  play.innerHTML = glyph("play");
  play.setAttribute("aria-label", "Play or pause");
  const next = el("button", "ipod-btn next", wheel);
  next.innerHTML = glyph("next");
  next.setAttribute("aria-label", "Next track");
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  play.addEventListener("click", togglePlay);

  playerEls = { dock, pod, art, title, artist, album, count, fill, elapsed, remain, play };
}

async function loadTracks() {
  if (tracks.length) return;
  try {
    tracks = await fetch("audio/tracks.json").then((r) => r.json());
  } catch (err) {
    console.error("player: couldn't load the track list —", err);
    return;
  }
  showTrack(0);
}

// One track on screen at a time, the way the real thing works — you move
// through the record with the wheel rather than reading a list.
function showTrack(i) {
  const t = tracks[i];
  if (!t) return;
  playerEls.art.src = t.cover;
  playerEls.title.textContent = t.title;
  playerEls.artist.textContent = t.artist;
  // Only if the record has one of its own — repeating the artist on the
  // album line is what the real thing does not do.
  playerEls.album.textContent = t.album && t.album !== t.artist ? t.album : "";
  playerEls.count.textContent = `${i + 1} of ${tracks.length}`;
  // retrigger the little cross-fade
  playerEls.pod.classList.remove("is-changing");
  void playerEls.pod.offsetWidth;
  playerEls.pod.classList.add("is-changing");
}

function playTrack(i) {
  if (!tracks[i]) return;
  nowPlaying = i;
  showTrack(i);
  // One <audio> reused for every track: nothing is fetched until you press
  // play, so opening the player costs a JSON file and one cover.
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
    const clock = (sec) => {
      if (!isFinite(sec)) return "0:00";
      const m = Math.floor(sec / 60);
      return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    };
    audio.addEventListener("timeupdate", () => {
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      playerEls.fill.style.width = `${pct}%`;
      playerEls.elapsed.textContent = clock(audio.currentTime);
      playerEls.remain.textContent = `-${clock((audio.duration || 0) - audio.currentTime)}`;
    });
    audio.addEventListener("ended", () => step(1));
    audio.addEventListener("play", () => playerEls.pod.classList.add("is-playing"));
    audio.addEventListener("pause", () => playerEls.pod.classList.remove("is-playing"));
  }
  audio.src = tracks[i].src;
  audio.play().catch((err) => console.warn("player: playback blocked —", err));
}

function togglePlay() {
  if (nowPlaying < 0) { playTrack(browsing); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

let browsing = 0;
function step(dir) {
  if (!tracks.length) return;
  browsing = ((nowPlaying < 0 ? browsing : nowPlaying) + dir + tracks.length) % tracks.length;
  // Skipping while it is playing keeps playing; skipping while idle just
  // moves through the sleeve art, same as scrolling a real one.
  if (nowPlaying >= 0) playTrack(browsing);
  else showTrack(browsing);
}

// ---- desk: the illustrations --------------------------------------------
let deskEls = null;
let topZ = 1;

function buildDesk(parent) {
  const board = el("div", "desk-board", parent);
  const hint = el("div", "desk-hint", board);
  hint.textContent = "drag them around";
  deskEls = { board, hint };
}

async function loadPieces() {
  if (pieces.length) return;
  try {
    pieces = await fetch("images/desk/pieces.json").then((r) => r.json());
  } catch (err) {
    console.error("desk: couldn't load the illustrations —", err);
    return;
  }
  const { board } = deskEls;
  pieces.forEach((p, i) => {
    const card = el("img", "desk-piece", board);
    card.src = p.src;
    card.alt = "";
    card.draggable = false;
    // The desk runs diagonally across the still, so the sheets are laid out
    // along that axis rather than in a square block floating over the carpet.
    const AXIS = -32 * (Math.PI / 180);          // desk direction, on screen
    const along = (i % 5 - 2) * 13 + (Math.random() - 0.5) * 5;
    const across = (Math.floor(i / 5) - 1) * 11 + (Math.random() - 0.5) * 5;
    const spreadX = along * Math.cos(AXIS) - across * Math.sin(AXIS);
    const spreadY = along * Math.sin(AXIS) + across * Math.cos(AXIS);
    const tilt = (Math.random() - 0.5) * 18;
    // Pushed down the desk away from the boots at the near end.
    card.style.left = `calc(56% + ${spreadX}%)`;
    card.style.top = `calc(49% + ${spreadY}%)`;
    card.style.setProperty("--tilt", `${tilt}deg`);
    card.style.zIndex = ++topZ;
    makeDraggable(card);
  });
}

// Pointer-events drag: works the same for mouse and touch, and because the
// board is plain DOM there is no raycasting and no render loop behind it.
//
// Drag and tap share one gesture. Whether it was a tap is decided on release
// by how far the pointer travelled — under a few pixels and it is a tap, which
// lifts the sheet off the desk and holds it flat to camera. Tap again and it
// goes back exactly where it was lying.
const TAP_SLOP = 6;           // px of travel still counted as a tap
let zoomed = null;

function makeDraggable(node) {
  let grab = null;
  node.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (zoomed && zoomed !== node) return;     // one at a time
    node.setPointerCapture(e.pointerId);
    const r = node.getBoundingClientRect();
    const b = deskEls.board.getBoundingClientRect();
    grab = {
      dx: e.clientX - r.left - r.width / 2, dy: e.clientY - r.top - r.height / 2, b,
      x0: e.clientX, y0: e.clientY, moved: 0,
    };
    if (zoomed !== node) {
      node.style.zIndex = ++topZ;
      node.classList.add("is-held");
    }
    deskEls.hint.classList.add("is-gone");
  });
  node.addEventListener("pointermove", (e) => {
    if (!grab) return;
    grab.moved = Math.max(grab.moved, Math.hypot(e.clientX - grab.x0, e.clientY - grab.y0));
    // A zoomed sheet doesn't slide around; it's being read, not shuffled.
    if (zoomed === node || grab.moved <= TAP_SLOP) return;
    const x = ((e.clientX - grab.dx - grab.b.left) / grab.b.width) * 100;
    const y = ((e.clientY - grab.dy - grab.b.top) / grab.b.height) * 100;
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
  });
  const drop = (e) => {
    if (!grab) return;
    const wasTap = grab.moved <= TAP_SLOP;
    grab = null;
    node.classList.remove("is-held");
    try { node.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (wasTap) toggleZoom(node);
  };
  node.addEventListener("pointerup", drop);
  node.addEventListener("pointercancel", drop);
}

function toggleZoom(node) {
  if (zoomed === node) {
    node.classList.remove("is-zoomed");
    deskEls.board.classList.remove("has-zoom");
    zoomed = null;
    return;
  }
  if (zoomed) zoomed.classList.remove("is-zoomed");
  zoomed = node;
  node.style.zIndex = ++topZ;
  node.classList.add("is-zoomed");
  deskEls.board.classList.add("has-zoom");
}
