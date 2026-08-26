// ============================================================================
// THIS IS THE FILE YOU EDIT TO ADD YOUR OWN WORK.
// ============================================================================
//
// CLOTHING (fashion pieces, shown hanging on the closet rod) is the one list
// that's actually used — edit it to add real pieces.
//
// VINYL_COVERS below is unused now: your vinyl crate is real geometry inside
// models/room.glb (the Vinyl_1..Vinyl_20 meshes), with real cover art baked
// on as textures, so main.js reads the art straight from the model instead
// of from this file. Left here in case you want a data-driven fallback again.
//
// For each CLOTHING entry you can EITHER:
//   1) leave "image: null"  -> a generated placeholder is used automatically
//   2) set "image: 'images/clothing/my-piece.jpg'" -> put a real image file
//      in that folder and it will be used instead. Portrait images work
//      best (e.g. 800x1000).
//
// You can add as many entries as you want, the closet rod will lay them out
// automatically. Just copy a block below and change the values.
// ============================================================================

export const VINYL_COVERS = [
  {
    title: "Late Night Drive",
    kicker: "Album cover",
    desc: "Cover art for a late-night synth record. Swap this text and image for your real release.",
    image: null,
    accent: "#ff6b6b",
  },
  {
    title: "Static Bloom",
    kicker: "Single artwork",
    desc: "Single cover, mixed-media collage style.",
    image: null,
    accent: "#5bc0be",
  },
  {
    title: "Neon Interior",
    kicker: "EP artwork",
    desc: "3-track EP cover, gradient + type experiment.",
    image: null,
    accent: "#ffce6b",
  },
  {
    title: "Paper Moon",
    kicker: "Album cover",
    desc: "Full-length cover, illustration-based.",
    image: null,
    accent: "#c792ea",
  },
  {
    title: "Slow Static",
    kicker: "Single artwork",
    desc: "Minimal type-driven cover for a stripped-back single.",
    image: null,
    accent: "#8ecae6",
  },
  {
    title: "Field Notes",
    kicker: "Mixtape cover",
    desc: "Scrapbook-style mixtape art, torn paper texture.",
    image: null,
    accent: "#ffb4a2",
  },
];

// CANVAS_DESIGNS: real design options for each canvas on the graphic-design
// wall — clicking a canvas focuses just that one canvas, and arrow keys
// cycle through ITS OWN list below (each canvas has its own independent
// stack, not a shared "whole wall" set). Index 0 while browsing is always
// whatever's already baked onto that canvas in the model itself (not listed
// here); everything below is layered on top of that.
//
// Keyed by the canvas mesh's exact name in models/room.glb. Each entry is
// just { image: "images/posters/..." } — title/accent aren't used for these
// (unlike CLOTHING), so they're omitted.
export const CANVAS_DESIGNS = {
  "Canvas_n3d": [
    { image: "images/posters/canvas-0/1.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-0/2.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-0/3.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-0/4.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-0/5.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-0/6.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-0/7.jpg?v=2026-08-07s" },
  ],
  "Canvas 2_n3d": [
    { image: "images/posters/canvas-2/1.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-2/2.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-2/3.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-2/4.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-2/5.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-2/6.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-2/7.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-2/8.jpg?v=2026-08-07s" },
  ],
  "Canvas 3_n3d": [
    { image: "images/posters/canvas-3/1.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-3/2.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-3/3.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-3/4.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-3/5.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-3/6.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-3/7.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-3/8.jpg?v=2026-08-07s" },
  ],
  "Canvas 4_n3d": [
    { image: "images/posters/canvas-4/1.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-4/2.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-4/3.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-4/4.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-4/5.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-4/6.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-4/7.jpg?v=2026-08-07s" },
    { image: "images/posters/canvas-4/8.jpg?v=2026-08-07s" },
  ],
};

// PAPER_ILLUSTRATIONS: illustrations shown one at a time on the top sheet of
// the paper stack on the bookshelf. Only the physically topmost sheet
// (paper_001_mesh_n3d) is interactive — each tap dips it down, swaps to the
// next image here, then brings it back up. Same rules as CANVAS_DESIGNS:
// index 0 while browsing is whatever's already baked onto that sheet in the
// model itself (not listed here); everything below is layered on top of
// that. Drop your illustration files in images/illustrations/ and list them
// here in the order you want them to appear.
export const PAPER_ILLUSTRATIONS = {
  "paper_001_mesh_n3d": [
    { image: "images/illustrations/1.jpg?v=2026-08-08al" },
    { image: "images/illustrations/2.jpg?v=2026-08-08al" },
    { image: "images/illustrations/3.jpg?v=2026-08-08al" },
    { image: "images/illustrations/4.jpg?v=2026-08-08al" },
    { image: "images/illustrations/5.jpg?v=2026-08-08al" },
    { image: "images/illustrations/6.jpg?v=2026-08-08al" },
    { image: "images/illustrations/7.jpg?v=2026-08-08al" },
    { image: "images/illustrations/8.jpg?v=2026-08-08al" },
    { image: "images/illustrations/9.jpg?v=2026-08-08al" },
    { image: "images/illustrations/10.jpg?v=2026-08-08al" },
    { image: "images/illustrations/11.jpg?v=2026-08-08al" },
    { image: "images/illustrations/12.jpg?v=2026-08-08al" },
    { image: "images/illustrations/13.jpg?v=2026-08-08al" },
  ],
};

export const CLOTHING = [
  {
    title: "Reworked Denim Jacket",
    kicker: "Fashion piece",
    desc: "Hand-painted and patched denim jacket, one-of-one.",
    image: null,
    accent: "#e07a5f",
  },
  {
    title: "Tour Tee Concept",
    kicker: "Merch design",
    desc: "Graphic concept for a band's tour merch run.",
    image: null,
    accent: "#3d5a80",
  },
  {
    title: "Patchwork Flare",
    kicker: "Fashion piece",
    desc: "Upcycled patchwork trousers, mixed fabric scraps.",
    image: null,
    accent: "#ee9b00",
  },
  {
    title: "Studio Hoodie",
    kicker: "Merch design",
    desc: "Embroidered hoodie design for the studio drop.",
    image: null,
    accent: "#94d2bd",
  },
  {
    title: "Silk Scarf Print",
    kicker: "Textile design",
    desc: "Printed scarf pattern, hand-drawn repeat motif.",
    image: null,
    accent: "#bb9af7",
  },
];

// Room mood / color palette — tweak these to re-theme the whole room quickly.
export const PALETTE = {
  wall: "#2b2430",
  wallShadow: "#211b26",
  floor: "#8a5a3b",
  wood: "#6b4226",
  woodLight: "#8a6240",
  fabric: "#d97757",
  accentWarm: "#ffce6b",
  accentCool: "#8ecae6",
  rug: "#f2ece2",
};

// Content shown on the desk computer's screen (see js/desktopScreen.js) —
// a fake desktop with one clickable icon that opens a browser-styled window
// mirroring the real "About Me" page on toefu888.com. Edit this to keep the
// two in sync whenever the real site's about-me copy changes.
export const ABOUT_ME_CONTENT = {
  name: "LINA (TOEFU)",
  tagline: "NYC-based visual artist",
  location: "Manhattan, NY",
  addressBar: "toefu888.com/about-me",
  bio: [
    "Hello! I am Lina, a NYC-based visual artist with almost 10 years of experience. I specialize in all things graphic — anywhere from illustration to action figures (and anything in between).",
    "I am available for hire on a project-to-project basis or monthly contract.",
    "Contact me for any business inquiries! Price and structure are negotiable per client. :)",
  ],
  links: [
    { label: "Resume", url: "https://www.toefu888.com/_files/ugd/4ddd2b_957e41760be544e493c53f524993f088.pdf" },
    { label: "Instagram", url: "http://instagram.com/toefulina" },
    { label: "Twitter", url: "https://x.com/LUVsicHEXALOGY" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/miuppa/" },
    { label: "Full Site", url: "https://www.toefu888.com/about-me" },
  ],
};

// Content shown on the phone's screen (see js/phoneScreen.js) — a mockup of
// the real "Commission Application" form on toefu888.com/contact. There's
// no real text-input system in this scene, so the fields render as a
// preview only; tapping the form (or the Submit button) opens the actual
// contact page in a new tab so someone can fill it out for real. Edit this
// to keep it in sync whenever the real form's fields change.
export const CONTACT_FORM_CONTENT = {
  formUrl: "https://www.toefu888.com/contact",
  heading: "COMMISSION APPLICATION",
  fields: ["First Name", "Last Name", "Email", "Describe Your Commission", "Commission Type", "Ideal Due Date"],
  submitLabel: "SUBMIT",
  footnote: "I will get back 2 u ASAP!",
  otherInquiries: "For other inquiries",
  links: [
    { label: "Instagram", url: "http://instagram.com/toefulina" },
    { label: "Twitter", url: "https://x.com/LUVsicHEXALOGY" },
  ],
};
