import { about } from "../data/about.js";
import { renderTopNav } from "./topNav.js";

// ---------------------------------------------------------------------------
// About Me — the Map direction.
//
// This screen used to be a 3D relief of the US with the places I've lived
// marked on it. That was biography: it looked good and told a visitor nothing
// they could hire on. The old file is kept beside this one as
// mapView-relief.js.old if it's ever wanted back; usMap.js is untouched.
//
// What replaced it is the /about page from the night-market site, which is a
// social-profile layout: a header row (portrait left, name and intro right),
// then two columns — a static left rail of links, client photos and tag boxes,
// and a right column that reads as a feed of dated update cards. Same sections
// and the same copy, redrawn in the menu's own pixel type and panel chrome
// instead of Helvetica on black.
//
// All content lives in ../data/about.js. Nothing below needs editing to change
// a job, a rate sheet or a client photo.
// ---------------------------------------------------------------------------

// Hand-rolled, single-colour, stroke-based glyphs — same set and same style as
// the ones on the night-market page, so the two sites keep one icon language.
// They inherit currentColor, so the link's own colour is all that's needed.
const ICONS = {
  pin: `<path d="M12 22s7-7.4 7-13a7 7 0 1 0-14 0c0 5.6 7 13 7 13z" /><circle cx="12" cy="9" r="2.4" />`,
  doc: `<path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5" /><path d="M9 13h6M9 16.5h6" />`,
  instagram: `<rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />`,
  twitter: `<path d="M23 4.9c-.8.4-1.7.6-2.6.8a4.5 4.5 0 0 0 2-2.5c-.9.5-1.9.9-2.9 1.1A4.5 4.5 0 0 0 11.9 8c0 .3 0 .7.1 1A12.7 12.7 0 0 1 2.7 3.9a4.5 4.5 0 0 0 1.4 6 4.4 4.4 0 0 1-2-.6v.1a4.5 4.5 0 0 0 3.6 4.4 4.5 4.5 0 0 1-2 .1 4.5 4.5 0 0 0 4.2 3.1A9 9 0 0 1 1 19.5 12.7 12.7 0 0 0 7.9 21.5c8.3 0 12.8-6.9 12.8-12.8v-.6c.9-.6 1.6-1.4 2.3-2.2z" fill="currentColor" stroke="none" />`,
  linkedin: `<rect x="2" y="2" width="20" height="20" rx="4" /><circle cx="7.5" cy="8" r="1.4" fill="currentColor" stroke="none" /><rect x="6.3" y="10.5" width="2.4" height="7.5" fill="currentColor" stroke="none" /><path d="M11.5 10.5h2.3v1.1c.4-.7 1.3-1.3 2.6-1.3 2.1 0 3 1.3 3 3.7v4h-2.4v-3.6c0-1-.4-1.7-1.3-1.7-.9 0-1.4.6-1.4 1.7v3.6h-2.4v-7.5z" fill="currentColor" stroke="none" />`,
  mail: `<rect x="2.5" y="4.5" width="19" height="15" rx="1.5" /><path d="M3 6l9 6.5L21 6" />`,
  // The letter-in-a-box mark the compass row used, kept as-is so the link
  // still reads the same way it did there.
  nova: `<rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M8.6 16.2 V7.8 L15.4 16.2 V7.8" />`,
};

function icon(name) {
  return `<svg class="about-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" aria-hidden="true">${ICONS[name] || ICONS.doc}</svg>`;
}

// Text from the data file goes through here on its way into innerHTML. It is
// all copy I wrote, not user input, but a stray & or < in a job description
// would silently mangle the markup around it.
function esc(str) {
  return String(str).replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])
  );
}

function renderBox(box) {
  const paras = (box.body || []).map((t) => `<p>${esc(t)}</p>`).join("");
  const jobs = (box.jobs || [])
    .map(
      (j) => `
      <div class="about-job">
        <p class="about-job-role">${esc(j.role)}</p>
        <p class="about-job-dates">${esc(j.dates)}</p>
        <p>${esc(j.body)}</p>
      </div>`
    )
    .join("");
  const button = box.button
    ? `<a class="about-button" href="${esc(box.button.href)}" target="_blank"
         rel="noopener noreferrer">${esc(box.button.label)}</a>`
    : "";
  return `
    <section class="about-box">
      <h3 class="rune">${esc(box.title)}</h3>
      <p class="about-updated">${esc(box.updated)}</p>
      ${paras}${jobs}${button}
    </section>`;
}

function tagBox(title, items) {
  return `
    <div class="about-tag-box">
      <h4 class="rune">${esc(title)}</h4>
      <ul class="about-tag-list">
        ${items.map((t) => `<li>${esc(t)}</li>`).join("")}
      </ul>
    </div>`;
}

export function renderMapView(container) {
  const el = document.createElement("div");
  el.className = "about-fullscreen";
  el.appendChild(renderTopNav("map"));

  const links = about.links
    .map(
      (l) => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">
        ${icon(l.icon)}<span>${esc(l.label)}</span></a></li>`
    )
    .join("");

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="about-scroll">
      <div class="about-content">
        <div class="about-columns">
          <div class="about-col-left">
            <div class="about-photo-frame">
              <img class="about-photo about-mark" src="${esc(about.logo)}" alt="" />
            </div>

            <ul class="about-contact-list">
              <li class="about-contact-place">${icon("pin")}<span>${esc(about.location)}</span></li>
              ${links}
            </ul>

            <h3 class="about-rail-label rune">Clients</h3>
            <div class="about-clients-grid">
              ${about.clients
                .map((src) => `<img class="about-photo about-client-tile" src="${esc(src)}" alt="" />`)
                .join("")}
            </div>

            ${tagBox("Skills", about.skills)}
            ${tagBox("Applications", about.applications)}
          </div>

          <div class="about-col-right">
            <div class="about-header">
              <h1 class="rune">${esc(about.heading)}</h1>
              <h2 class="rune">${esc(about.name)}</h2>
              ${about.intro.map((t) => `<p>${esc(t)}</p>`).join("")}
            </div>
            ${about.boxes.map(renderBox).join("")}
          </div>
        </div>

        <footer class="about-footer">
          ${about.footer.map((t) => `<p>${esc(t)}</p>`).join("")}
        </footer>
      </div>
    </div>
  `
  );

  container.appendChild(el);

  // The scroller, not the window, is what moves — the top nav and RESUME are
  // pinned over it. Arrow keys are already claimed by the menu's global
  // direction handling, so scrolling is wheel/touch/PageUp-PageDown only.
  const scroll = el.querySelector(".about-scroll");
  function onKey(e) {
    if (e.key !== "PageDown" && e.key !== "PageUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const page = scroll.clientHeight * 0.85;
    if (e.key === "Home") scroll.scrollTo({ top: 0, behavior: "smooth" });
    else if (e.key === "End") scroll.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" });
    else scroll.scrollBy({ top: e.key === "PageDown" ? page : -page, behavior: "smooth" });
  }
  window.addEventListener("keydown", onKey);

  return () => window.removeEventListener("keydown", onKey);
}
