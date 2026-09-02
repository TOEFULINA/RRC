import { skills } from "../data/skills.js";
import { renderTopNav } from "./topNav.js";
import { navigate } from "../router.js";
import { SITE_NAME, SKILLS_BACKGROUND_IMAGE } from "../config.js";

// ---------------------------------------------------------------------------
// Skills — a constellation map you circle through, mirroring the reference
// screenshots: one skill's constellation centered on screen, its neighbors
// peeking in from the sides, </> (and Left/Right arrow keys) rotating the
// ring. A character-stat-style bar sits on top (reinterpreted for a
// portfolio — see the comment above renderStatsBar below); the same bottom
// nav every other screen uses sits underneath, untouched.
//
// PLACEHOLDER NOTICE — two things here are intentionally stand-ins until
// real assets are ready:
//   1. Each skill's "constellation" is a procedurally-drawn star cluster
//      (see buildConstellationSVG), not real line art. It's seeded off the
//      skill's id, so it's stable across re-renders/refreshes — swap in
//      real art per skill whenever it exists (see the comment there).
//   2. The backdrop falls back to a plain placeholder space gradient
//      (see the CSS) until SKILLS_BACKGROUND_IMAGE in config.js points at
//      a real nebula/space image.
// ---------------------------------------------------------------------------

// Simple seeded RNG (mulberry32) so each skill's constellation is stable
// across re-renders instead of reshuffling on every visit — seeded from a
// hash of the skill's own id.
function seededRandom(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

// Draws a small irregular cluster of connected "stars" — a placeholder
// stand-in for real hand-drawn constellation art (see the file-level
// comment above). Point count/spread vary per skill (seeded, so stable)
// so the five placeholders don't all look identical.
function buildConstellationSVG(skillId) {
  const rand = seededRandom(hashString(skillId));
  const pointCount = 6 + Math.floor(rand() * 4); // 6-9 points
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2 + rand() * 0.6;
    const radius = size * (0.18 + rand() * 0.32);
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  // Connect each point to the next 1-2 points (by index, not nearest-
  // neighbor) so the lines cross through the middle sometimes, the way a
  // real constellation's connecting lines usually do.
  let lines = "";
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    lines += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${next.x.toFixed(1)}" y2="${next.y.toFixed(
      1
    )}" />`;
    if (rand() > 0.55) {
      const skip = points[(i + 2) % points.length];
      lines += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${skip.x.toFixed(1)}" y2="${skip.y.toFixed(
        1
      )}" />`;
    }
  });
  const stars = points
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${2 + rand() * 2.2}" />`)
    .join("");
  return `<svg class="constellation-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <g class="constellation-lines">${lines}</g>
    <g class="constellation-stars">${stars}</g>
  </svg>`;
}

// The reference art's top bar shows an actual game character's stats
// (Name/Level/Race). A portfolio doesn't have those — this reinterprets
// the same three-field bar shape for what's actually useful here: your
// site name, a ring-position readout with a small progress bar (the
// "little bar" from the reference) showing where the centered skill sits
// among the others, and the currently-centered skill's own title as a
// live-updating third field.
function renderStatsBar() {
  const bar = document.createElement("div");
  bar.className = "skills-stats-bar";
  bar.innerHTML = `
    <span class="stats-field">
      <span class="stats-label">Name</span>
      <span class="stats-value stats-name">${SITE_NAME}</span>
    </span>
    <span class="stats-field stats-section">
      <span class="stats-label">Section</span>
      <span class="stats-value stats-position">01 / 0${skills.length}</span>
      <span class="stats-progress"><span class="stats-progress-fill"></span></span>
    </span>
    <span class="stats-field">
      <span class="stats-label">Discipline</span>
      <span class="stats-value stats-discipline"></span>
    </span>
  `;
  return bar;
}

export function renderSkillsView(container) {
  const el = document.createElement("div");
  el.className = "skills-fullscreen";
  el.appendChild(renderTopNav("skills"));

  const statsBar = renderStatsBar();
  el.appendChild(statsBar);

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="skills-carousel">
      <button class="skills-arrow left rune" aria-label="Previous skill">&lsaquo;</button>
      <div class="skills-track"></div>
      <button class="skills-arrow right rune" aria-label="Next skill">&rsaquo;</button>
    </div>
  `
  );

  const track = el.querySelector(".skills-track");
  const arrowLeft = el.querySelector(".skills-arrow.left");
  const arrowRight = el.querySelector(".skills-arrow.right");
  const posEl = statsBar.querySelector(".stats-position");
  const progressFill = statsBar.querySelector(".stats-progress-fill");
  const disciplineEl = statsBar.querySelector(".stats-discipline");

  let active = 0;

  // Shortest signed distance from `active` to `i` around the ring, so the
  // carousel always rotates the short way and neighbors on both sides peek
  // in symmetrically (rather than every node piling up on one side once
  // you've wrapped past the end).
  function ringOffset(i) {
    const n = skills.length;
    let raw = i - active;
    if (raw > n / 2) raw -= n;
    if (raw < -n / 2) raw += n;
    return raw;
  }

  const nodeEls = skills.map((skill, i) => {
    const node = document.createElement("div");
    node.className = "skill-node";
    node.innerHTML = `
      <div class="skill-constellation">${buildConstellationSVG(skill.id)}</div>
      <div class="skill-card">
        <h3 class="rune">${skill.title}</h3>
        <img class="skill-divider" src="/menu/ui/skill-divider.png" alt="" />
        ${
          skill.level != null
            ? `<div class="skill-dots">${Array.from({ length: 5 })
                .map((_, d) => `<span class="${d < skill.level ? "filled" : ""}"></span>`)
                .join("")}</div>`
            : ""
        }
        <p class="item-description">${skill.description}</p>
      </div>
    `;
    node.addEventListener("click", () => {
      if (i !== active) {
        active = i;
        render();
      }
    });
    track.appendChild(node);
    return node;
  });

  // Per-ring-step spacing/scale/opacity — computed in JS rather than via
  // CSS calc()/abs() so this doesn't depend on newer CSS math-function
  // support that isn't universal yet.
  const SPACING_PX = 400;
  const SCALE_BY_DIST = [1, 0.82];
  const OPACITY_BY_DIST = [1, 0.85];

  function render() {
    const n = skills.length;
    nodeEls.forEach((node, i) => {
      const offset = ringOffset(i);
      const dist = Math.abs(offset);
      const visible = dist < SCALE_BY_DIST.length;
      const scale = SCALE_BY_DIST[Math.min(dist, SCALE_BY_DIST.length - 1)];
      node.style.transform = `translate(-50%, -50%) translateX(${offset * SPACING_PX}px) scale(${scale})`;
      node.style.opacity = visible ? String(OPACITY_BY_DIST[Math.min(dist, OPACITY_BY_DIST.length - 1)]) : "0";
      node.style.pointerEvents = visible ? "auto" : "none";
      node.style.zIndex = String(10 - dist);
      node.classList.toggle("is-active", offset === 0);
    });
    posEl.textContent = `${String(active + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
    progressFill.style.width = `${((active + 0.5) / n) * 100}%`;
    disciplineEl.textContent = skills[active]?.title ?? "";
    updateBgPan();
  }

  function rotate(delta) {
    const n = skills.length;
    active = ((active + delta) % n + n) % n;
    render();
  }

  arrowLeft.addEventListener("click", () => rotate(-1));
  arrowRight.addEventListener("click", () => rotate(1));

  // Left/Right rotate the ring. Up/Down are intentionally left alone here
  // — the global handler in main.js already returns Down to the compass
  // (skills is the "top" direction), and nothing here needs Up/Down for
  // anything else, so there's no conflict to guard against the way
  // items/portfolio have to for their own Up/Down-driven row navigation.
  function onKeyDown(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    rotate(e.key === "ArrowRight" ? 1 : -1);
  }
  document.addEventListener("keydown", onKeyDown);

  // Skills gets its own backdrop instead of the shared one every other
  // screen uses (see SKILLS_BACKGROUND_IMAGE in config.js) — swapped in on
  // mount, restored on the way out. The image is a wide panorama, and it
  // pans horizontally as you rotate through the ring (see updateBgPan,
  // called from render()) instead of sitting static — a real nebula/space
  // image slides by like a skybox as you move between skills.
  const bgLayer = document.getElementById("bg-layer");
  const previousBg = bgLayer ? bgLayer.style.getPropertyValue("--bg-image") : null;
  const previousBgPosition = bgLayer ? bgLayer.style.backgroundPosition : "";
  if (bgLayer) {
    if (SKILLS_BACKGROUND_IMAGE) {
      bgLayer.style.setProperty("--bg-image", `url(${SKILLS_BACKGROUND_IMAGE})`);
      el.classList.remove("skills-fallback-bg");
      bgLayer.classList.add("bg-panning");
    } else {
      // No real nebula/space image set yet — fall back to a plain CSS
      // starfield placeholder (see .skills-fullscreen.skills-fallback-bg)
      // instead of showing the wrong (default site) backdrop underneath.
      bgLayer.style.setProperty("--bg-image", "none");
      el.classList.add("skills-fallback-bg");
    }
  }

  // Slides the backdrop's background-position from its left edge (skill 0)
  // to its right edge (the last skill) as `active` moves through the ring,
  // so the panorama scrolls by in sync with </>. No-ops without a real
  // background image (nothing to pan).
  function updateBgPan() {
    if (!bgLayer || !SKILLS_BACKGROUND_IMAGE) return;
    const n = skills.length;
    const pct = n > 1 ? (active / (n - 1)) * 100 : 50;
    bgLayer.style.backgroundPosition = `${pct}% center`;
  }

  render();
  container.appendChild(el);

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    if (bgLayer) {
      bgLayer.classList.remove("bg-panning");
      if (previousBg) bgLayer.style.setProperty("--bg-image", previousBg);
      else bgLayer.style.removeProperty("--bg-image");
      if (previousBgPosition) bgLayer.style.backgroundPosition = previousBgPosition;
      else bgLayer.style.removeProperty("background-position");
    }
  };
}
