// ---------------------------------------------------------------------------
// The caption line along the bottom of explore mode.
//
// One line at a time, in the shape TOEFU: the line. It fires when you first walk
// into the room and again on every clickable thing, so the room explains
// itself as you poke at it instead of relying on you guessing what is live.
//
// EVERY WORD IS IN THIS FILE. `LINES` below is the whole script — rewrite the
// quotes and nothing else needs touching. A key with no entry simply says
// nothing, so deleting a line you don't want is safe.
// ---------------------------------------------------------------------------

export const SPEAKER = "TOEFU";

export const LINES = {
  // Said once, the first time you leave the compass for the room, then
  // followed a beat later by intro2 (see FOLLOWS below).
  intro: "Hiiii! Welcome to my room! Take a look around if you feel so inclined :).",
  intro2: "I'd come down to say hi but unfortunately I am tethered to this polygonal form",

  vinyl: "These are some of the cover arts I've made! If you want to hear any of them, just use the speaker next to my chair.",
  speaker: "I made a convenient playlist of the songs I made covers for and worked on! I love my job and I love my friends :) they are so talented.",
  desk: "I do all my work at home at this desk! Here's some of my favorite sketches. Tap them to zoom in.",

  // Room pickups — keyed by the id the picker returns, so adding a pickup in
  // stations.js and a line here is all it takes.
  "item:item-19": "One of my first ever customized shoes! Drew on these when I lived in the forest in Bellingham. Sold them a few years ago but I think of them often.",
  "item:item-11": "Just made this actually! I bought a pin maker and printed custom pins for an old telfar bag. I bring it to work every day :)",

  "item:item-22": "I got to design this product from start to finish. One of my proudest projects :)",

  // Talkers — things you click that have no panel of their own.
  joint: "You don't wanna ask first? Lol",
  cardboard: "My friends came over when I lived in the forest and we all drew on this :)",
  canvases: "Want to see more Graphic Design?",
  sketchbooks: "Want to see more Illustration?",
  shirts: "Want to see more merch?",
  dresser: "Maybe don't look in there. Lol",

  // Not clicked — said once you have been staring out of the window a while.
  window: "It's rainy out right now! Very nice right?",

  // --- NOT YOURS YET ---------------------------------------------------
  // Still clickable, still in my words rather than yours. Rewrite or delete.
  "item:item-10": "Half charm bracelet, half belt. Fully impractical.",
  chair: "Sit down, it's a better view from here.",
};

// Said from the second time onward. The first click gets the line in LINES,
// every one after that gets this — so a thing you keep clicking stops
// repeating its introduction at you.
export const REPEATS = {
  joint: "Yeah yeah go ahead.",
};

// A line that answers itself. `after` is milliseconds from when the first one
// appears, timed to land just after it has faded rather than cutting it off.
const FOLLOWS = {
  intro: { key: "intro2", after: 6200 },
};

// How long a line stays up before it fades on its own.
const HOLD_MS = 5200;

let el = null;
let quoteEl = null;
let timer = 0;
let followTimer = 0;
// The tallest the line has ever been this session. On touch the d-pad is
// stacked on top of the footer by this much, so it has to account for a line
// that wraps to two or three rows — a fixed 2.5rem band left the longest lines
// growing up into the arrows. It only ever grows, so the pad settles once and
// then stays put instead of hopping every time a shorter line appears.
let footerPx = 0;
const said = new Set();   // keys asked for with { once: true }
const heard = new Set();  // every key that has been said at least once

function ensure() {
  if (el) return el;
  el = document.createElement("div");
  el.className = "toefu-line";
  el.setAttribute("aria-live", "polite");
  el.innerHTML =
    `<span class="toefu-line-inner">` +
    `<span class="toefu-line-name"></span><span class="toefu-line-quote"></span>` +
    `</span>`;
  el.querySelector(".toefu-line-name").textContent = `${SPEAKER}:`;
  quoteEl = el.querySelector(".toefu-line-quote");
  document.body.appendChild(el);
  return el;
}

/**
 * Show the line for `key`. Unknown keys are ignored, so callers never have to
 * check whether a line exists first.
 *
 * @param {string} key                a key in LINES
 * @param {{once?: boolean}} [opts]   once: only ever say this one time
 */
export function sayLine(key, opts = {}) {
  if (!LINES[key]) return;
  if (opts.once) {
    if (said.has(key)) return;
    said.add(key);
  }
  // Second time onward, if there's a comeback for this one.
  const text = (heard.has(key) && REPEATS[key]) || LINES[key];
  heard.add(key);
  ensure();
  quoteEl.textContent = text;
  el.classList.add("is-on");
  measureFooter();
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove("is-on"), HOLD_MS);

  // Anything you click cancels a pending follow-up — the second half of the
  // intro shouldn't interrupt a line you asked for.
  clearTimeout(followTimer);
  const follow = FOLLOWS[key];
  if (follow) {
    followTimer = setTimeout(() => sayLine(follow.key, opts), follow.after);
  }
}

// Height has to be read after the browser has laid the new text out, and only
// ever raised — see footerPx above.
function measureFooter() {
  requestAnimationFrame(() => {
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    if (h <= footerPx) return;
    footerPx = h;
    document.documentElement.style.setProperty("--room-footer", `${h}px`);
  });
}

// Used when something takes over the screen — the pause menu. The line belongs
// to the room, not to whatever is on top of it.
export function hideLine() {
  closeAsk();
  if (!el) return;
  clearTimeout(timer);
  clearTimeout(followTimer);
  el.classList.remove("is-on");
}

// ---------------------------------------------------------------------------
// The rest of the room's HUD: the item toast, the yes/no prompt, and the
// screen effect the joint sets off. All of it lives here because it is all the
// same thing — the room reacting to you — and it all disappears together when
// the pause menu opens.
// ---------------------------------------------------------------------------

let toastEl = null;
let toastTimer = 0;

/** Skyrim's corner pickup notice: "Joint (0.5g) Added". */
export function showToast(text, ms = 2200) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toefu-toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), ms);
}

let askEl = null;
let askCleanup = null;

/**
 * A two-button prompt under the line — "Open Graphic Design" / "Not now".
 * Only one can be up at a time; asking again replaces it.
 *
 * @param {string} label     the affirmative button's text
 * @param {() => void} onYes runs if they take it
 */
export function askLine(label, onYes) {
  closeAsk();
  askEl = document.createElement("div");
  askEl.className = "toefu-ask";
  askEl.innerHTML = `<button class="toefu-ask-yes"></button><button class="toefu-ask-no">Not now</button>`;
  askEl.querySelector(".toefu-ask-yes").textContent = label;
  askEl.querySelector(".toefu-ask-yes").addEventListener("click", () => {
    closeAsk();
    onYes();
  });
  askEl.querySelector(".toefu-ask-no").addEventListener("click", closeAsk);
  document.body.appendChild(askEl);
  requestAnimationFrame(() => askEl && askEl.classList.add("is-on"));

  // It expires with the line it belongs to, so an unanswered question doesn't
  // sit on screen for the rest of the visit.
  const t = setTimeout(closeAsk, HOLD_MS + 1200);
  askCleanup = () => clearTimeout(t);
}

export function closeAsk() {
  askCleanup?.();
  askCleanup = null;
  askEl?.remove();
  askEl = null;
}

let highTimer = 0;
let highEl = null;

/**
 * A few seconds of soft glow and drifting sparkle over everything. Pure CSS on
 * one overlay plus a filter on the canvas — nothing touches the render loop,
 * and both come off again when it ends.
 */
export function runHighEffect(ms = 7000) {
  if (!highEl) {
    highEl = document.createElement("div");
    highEl.className = "high-fx";
    // Twelve drifting motes, each on its own timing, seeded here so the
    // markup is written once and reused on every toke.
    let dots = "";
    for (let i = 0; i < 14; i++) {
      dots += `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;` +
        `--d:${(2 + Math.random() * 3).toFixed(2)}s;--o:${(Math.random() * 3).toFixed(2)}s;` +
        `--s:${(3 + Math.round(Math.random() * 3))}px"></i>`;
    }
    highEl.innerHTML = dots;
    document.body.appendChild(highEl);
  }
  document.body.classList.add("is-high");
  highEl.classList.add("is-on");
  clearTimeout(highTimer);
  highTimer = setTimeout(() => {
    document.body.classList.remove("is-high");
    highEl.classList.remove("is-on");
  }, ms);
}
