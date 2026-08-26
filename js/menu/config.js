// ---------------------------------------------------------------------------
// Central config — edit this file to reskin/relabel the site without
// touching any of the view logic.
// ---------------------------------------------------------------------------

export const SITE_NAME = "YOUR NAME";

// Path to the single background image shown behind every screen.
// Drop your file in /public/background.jpg (or change this path).
// It gets blurred + darkened via CSS — use a fairly high-res image
// (1920px wide or more) so the blur looks smooth instead of blocky.
export const BACKGROUND_IMAGE = "/menu/background.jpg";

// Skills is the one screen with its own backdrop instead of the shared
// one above (a nebula/constellation-map feel instead of the moodier
// default) — set while that screen is mounted, restored on the way out.
// Leave null to fall back to a plain placeholder space gradient (see
// skillsView.js) until you drop a real nebula/space image in and point
// this at it, e.g. "/menu/hdri/nebula.jpg".
export const SKILLS_BACKGROUND_IMAGE = "/menu/images/skills-background.webp";

// The four compass directions. `key` must match the route used in
// src/views + src/router.js. Position matches the reference art:
// SKILLS on top, ITEMS on the right, MAP on the bottom, MAGIC on the left.
export const COMPASS_DIRECTIONS = {
  top: { key: "skills", label: "Skills" },
  right: { key: "items", label: "Items" },
  bottom: { key: "map", label: "Map" },
  left: { key: "magic", label: "Magic" },
};

// Map doesn't route to an internal view — it sends visitors out to the
// real shop site in a new tab instead. Checked by key (COMPASS_DIRECTIONS.bottom.key)
// wherever compass navigation is handled, so it stays correct even if the
// directions above are ever reassigned.
export const MAP_EXTERNAL_URL = "https://www.toefulina.com/archive-shop";
