// ---------------------------------------------------------------------------
// Magic section content — real portfolio pieces, pulled in from the user's
// own project folders (illustration / 3d portfolio / graphic design /
// dynamic / merchandise) as a first working set. These five will likely be
// renamed/reorganized later per the user, but the data shape below is meant
// to stay stable through that: each category is a list of "projects", and
// every category (plus the top-level view) gets an synthesized "All" entry
// prepended by the view logic — see magicView.js — rather than stored here.
//
// "dynamic" is video (kind: "video"); everything else is a still image
// (kind: "image"). Both carry a full-size asset for the detail pane and a
// smaller thumb for the "All" gallery grid / list rows.
// ---------------------------------------------------------------------------

function roman(n) {
  const table = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return table[n - 1] || String(n);
}

function image(catName, n, id, w, h) {
  return {
    id: `${catName}-${id}`,
    name: `${catName} ${roman(n)}`,
    kind: "image",
    category: catName,
    full: `/menu/magic/${slugOf(catName)}/${id}.jpg`,
    thumb: `/menu/magic/thumbs/${slugOf(catName)}/${id}.jpg`,
    stats: [{ label: "Year", value: "2026" }],
    description: "",
  };
}

function video(catName, n, id) {
  return {
    id: `${catName}-${id}`,
    name: `${catName} ${roman(n)}`,
    kind: "video",
    category: catName,
    full: `/menu/magic/${slugOf(catName)}/${id}.mp4`,
    thumb: `/menu/magic/thumbs/${slugOf(catName)}/${id}.jpg`,
    stats: [{ label: "Year", value: "2026" }],
    description: "",
  };
}

const SLUGS = {
  Illustration: "illustration",
  "3D Portfolio": "3d-portfolio",
  "Graphic Design": "graphic-design",
  Dynamic: "dynamic",
  Merchandise: "merchandise",
};
function slugOf(catName) {
  return SLUGS[catName];
}

export const portfolioCategories = [
  {
    name: "Illustration",
    projects: [
      image("Illustration", 1, "01-bairi", 640, 640),
      image("Illustration", 2, "02", 1600, 1600),
      image("Illustration", 3, "03", 1295, 1600),
      image("Illustration", 4, "04", 1600, 1600),
      image("Illustration", 5, "05", 1422, 1600),
      image("Illustration", 6, "06", 1237, 1600),
      image("Illustration", 7, "07", 1600, 1600),
      image("Illustration", 8, "08", 1102, 1600),
    ],
  },
  {
    name: "3D Portfolio",
    projects: [
      image("3D Portfolio", 1, "01", 900, 1600),
      image("3D Portfolio", 2, "02", 1408, 1600),
      image("3D Portfolio", 3, "03", 1287, 576),
      image("3D Portfolio", 4, "04", 1292, 1410),
      image("3D Portfolio", 5, "05", 1600, 783),
      image("3D Portfolio", 6, "06-skateboard", 1600, 1560),
      image("3D Portfolio", 7, "07", 999, 1514),
      image("3D Portfolio", 8, "08", 1102, 1600),
    ],
  },
  {
    name: "Graphic Design",
    projects: [
      image("Graphic Design", 1, "01", 1408, 1600),
      image("Graphic Design", 2, "02", 1408, 1600),
      image("Graphic Design", 3, "03", 1508, 1599),
      image("Graphic Design", 4, "04", 1600, 448),
      image("Graphic Design", 5, "05", 1600, 1600),
      image("Graphic Design", 6, "06", 1500, 500),
      image("Graphic Design", 7, "07", 1600, 1162),
      image("Graphic Design", 8, "08", 1600, 1600),
    ],
  },
  {
    name: "Dynamic",
    projects: [
      video("Dynamic", 1, "01"),
      video("Dynamic", 2, "02"),
      video("Dynamic", 3, "03"),
      video("Dynamic", 4, "04"),
    ],
  },
  {
    name: "Merchandise",
    projects: [
      image("Merchandise", 1, "01", 1568, 1600),
      image("Merchandise", 2, "02", 1280, 1600),
      image("Merchandise", 3, "03", 896, 896),
      image("Merchandise", 4, "04", 1066, 1600),
      image("Merchandise", 5, "05", 1066, 1600),
      image("Merchandise", 6, "06", 1600, 1600),
      image("Merchandise", 7, "07", 1066, 1600),
      image("Merchandise", 8, "08-sticker", 1600, 1600),
    ],
  },
];
