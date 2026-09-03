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

// Which meshes are clickable, and what opens when they are. The desk is
// several meshes (the top, the boot on it, the drawers), so the pattern
// deliberately matches all of them and they collapse into one station.
const STATIONS = [
  { id: "speaker", pattern: /^speaker/i, label: "play something" },
  {
    id: "desk",
    // The boot and the markers standing on the desk are their own meshes, so
    // they can be matched by name. The DESK ITSELF is not — it was modelled as
    // part of the loft bed, so BEDRAME is one mesh covering the bed, the
    // ladder and the desk together.
    pattern: /^sticker[ _]boot[ _]desk|^posca/i,
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
  speaker: { back: 0.62, rise: 0.06, fov: 40 },
  // Measured, not derived. Deriving it from the clickable meshes put the
  // camera among the ladder rails, because the only things on the desk with
  // names of their own sit at opposite ends of it. This stands you at the
  // desk looking down its length, which is the POV she asked for.
  desk: { eye: [-0.55, 1.32, -0.98], look: [-1.20, 0.86, -1.42], fov: 58 },
};

const TWEEN_HOLD = 0.18;   // beat between the camera arriving and the panel

let camera = null;
let canvasEl = null;
let onTween = null;        // (pose, done) => void   — main.js's startCamTween
let onFreeze = null;       // (dataUrl) => void      — stop the loop, show still
let onThaw = null;         // ()       => void       — resume the loop

const found = new Map();   // id -> { meshes: [], box: Box3 }
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

  found.clear();
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const name = obj.name || "";
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
  return [...found.keys()];
}

export function isStationOpen() { return openId !== null || opening; }

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
  if (openId || opening || !found.has(id)) return false;
  opening = true;
  restorePose = current;
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
  if (!openId) return false;
  const id = openId;
  hidePanel(id);
  openId = null;
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
  root.classList.remove("is-open");
  if (id === "speaker" && audio) audio.pause();
  setTimeout(() => { if (!openId) root.hidden = true; }, 320);
}

export function setStill(dataUrl) {
  const img = root?.querySelector(".station-still");
  if (img) img.src = dataUrl;
}

// ---- speaker: the player -------------------------------------------------
let playerEls = null;

function buildPlayer(parent) {
  const pod = el("div", "ipod", parent);
  const screen = el("div", "ipod-screen", pod);
  const art = el("img", "ipod-art", screen);
  art.alt = "";
  const meta = el("div", "ipod-meta", screen);
  const title = el("div", "ipod-title", meta);
  const artist = el("div", "ipod-artist", meta);
  const bar = el("div", "ipod-bar", screen);
  const fill = el("div", "ipod-fill", bar);
  bar.addEventListener("pointerdown", (e) => {
    if (!audio || !audio.duration) return;
    const r = bar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
  });

  const list = el("ol", "ipod-list", screen);

  const wheel = el("div", "ipod-wheel", pod);
  const prev = el("button", "ipod-btn prev", wheel); prev.textContent = "◀◀";
  const play = el("button", "ipod-btn play", wheel); play.textContent = "▶";
  const next = el("button", "ipod-btn next", wheel); next.textContent = "▶▶";
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  play.addEventListener("click", togglePlay);

  playerEls = { pod, art, title, artist, fill, list, play };
}

async function loadTracks() {
  if (tracks.length) return;
  try {
    tracks = await fetch("audio/tracks.json").then((r) => r.json());
  } catch (err) {
    console.error("player: couldn't load the track list —", err);
    return;
  }
  const { list } = playerEls;
  list.textContent = "";
  tracks.forEach((t, i) => {
    const li = el("li", "ipod-row", list);
    el("span", "ipod-row-title", li).textContent = t.title;
    el("span", "ipod-row-artist", li).textContent = t.artist;
    li.addEventListener("click", () => playTrack(i));
  });
  showTrack(0);
}

function showTrack(i) {
  const t = tracks[i];
  if (!t) return;
  playerEls.art.src = t.cover;
  playerEls.title.textContent = t.title;
  playerEls.artist.textContent = t.artist;
  [...playerEls.list.children].forEach((li, k) => li.classList.toggle("is-current", k === i));
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
    audio.addEventListener("timeupdate", () => {
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      playerEls.fill.style.width = `${pct}%`;
    });
    audio.addEventListener("ended", () => step(1));
    audio.addEventListener("play", () => { playerEls.play.textContent = "❚❚"; });
    audio.addEventListener("pause", () => { playerEls.play.textContent = "▶"; });
  }
  audio.src = tracks[i].src;
  audio.play().catch((err) => console.warn("player: playback blocked —", err));
}

function togglePlay() {
  if (nowPlaying < 0) { playTrack(0); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

function step(dir) {
  if (!tracks.length) return;
  const i = nowPlaying < 0 ? 0 : (nowPlaying + dir + tracks.length) % tracks.length;
  playTrack(i);
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
    // Fanned out from the middle with a little rotation, the way a pile of
    // prints actually lands on a table.
    const spreadX = (i % 5 - 2) * 15 + (Math.random() - 0.5) * 8;
    const spreadY = (Math.floor(i / 5) - 1) * 18 + (Math.random() - 0.5) * 8;
    const tilt = (Math.random() - 0.5) * 22;
    card.style.left = `calc(50% + ${spreadX}%)`;
    card.style.top = `calc(50% + ${spreadY}%)`;
    card.style.setProperty("--tilt", `${tilt}deg`);
    card.style.zIndex = ++topZ;
    makeDraggable(card);
  });
}

// Pointer-events drag: works the same for mouse and touch, and because the
// board is plain DOM there is no raycasting and no render loop behind it.
function makeDraggable(node) {
  let grab = null;
  node.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    node.setPointerCapture(e.pointerId);
    node.style.zIndex = ++topZ;
    node.classList.add("is-held");
    const r = node.getBoundingClientRect();
    const b = deskEls.board.getBoundingClientRect();
    grab = { dx: e.clientX - r.left - r.width / 2, dy: e.clientY - r.top - r.height / 2, b };
    deskEls.hint.classList.add("is-gone");
  });
  node.addEventListener("pointermove", (e) => {
    if (!grab) return;
    const x = ((e.clientX - grab.dx - grab.b.left) / grab.b.width) * 100;
    const y = ((e.clientY - grab.dy - grab.b.top) / grab.b.height) * 100;
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
  });
  const drop = (e) => {
    if (!grab) return;
    grab = null;
    node.classList.remove("is-held");
    try { node.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  };
  node.addEventListener("pointerup", drop);
  node.addEventListener("pointercancel", drop);
}
