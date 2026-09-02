// ---------------------------------------------------------------------------
// Magic section content — real portfolio pieces, ingested from the source
// folders in ~/skyrim/{illustration, 3d portfolio, graphic design, dynamic,
// merchandise}.
//
// THIS FILE IS GENERATED. The first pass only picked up lowercase .jpg and so
// carried 36 of the 192 pieces actually in those folders; the rest were .JPG,
// .jpeg, .png, .webp, .heic, .gif, .mov.
//
// Seven were then dropped: a file named "X" is skipped when an "X copy"
// exists beside it, and byte-identical files collapse to one (preferring the
// copy). Only the gallery drops them — the source folders are untouched.
// Everything kept is normalised on the
// way in — stills to jpg at 1600px long edge with a 480px thumb, video to
// h264/mp4 at 1280px long edge with a poster frame pulled at one second — so
// nothing here depends on a format a browser might refuse.
//
// The data shape is unchanged: each category is a list of "projects", and
// every category (plus the top-level view) gets an synthesized "All" entry
// prepended by the view logic — see magicView.js — rather than stored here.
//
// "dynamic" is video (kind: "video"); everything else is a still image
// (kind: "image"). Both carry a full-size asset for the detail pane and a
// smaller thumb for the "All" gallery grid / list rows.
// ---------------------------------------------------------------------------

// Roman numerals proper, not a ten-entry lookup. The old table ran out at X
// and fell back to Arabic, which was invisible while each category held eight
// pieces and is not now that the largest holds sixty.
function roman(n) {
  const table = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
                 [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let out = "";
  for (const [v, sym] of table) while (n >= v) { out += sym; n -= v; }
  return out || "I";
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
    image("Illustration", 1, "01-bairi"),
    image("Illustration", 2, "02-confirmedfinal"),
    image("Illustration", 3, "03-img-0374"),
    image("Illustration", 4, "04-img-0682"),
    image("Illustration", 5, "05-img-0933"),
    image("Illustration", 6, "06-img-1917"),
    image("Illustration", 7, "07-img-1919"),
    image("Illustration", 8, "08-img-1920"),
    image("Illustration", 9, "09-img-1921"),
    image("Illustration", 10, "10-img-1922"),
    image("Illustration", 11, "11-img-1923"),
    image("Illustration", 12, "12-img-1924"),
    image("Illustration", 13, "13-img-1925"),
    image("Illustration", 14, "14-img-1929"),
    image("Illustration", 15, "15-img-1932"),
    image("Illustration", 16, "16-img-1933"),
    image("Illustration", 17, "17-img-1934"),
    image("Illustration", 18, "18-img-1994-edited"),
    image("Illustration", 19, "19-img-1994"),
    image("Illustration", 20, "20-img-1997"),
    image("Illustration", 21, "21-img-2006"),
    image("Illustration", 22, "22-img-2007"),
    image("Illustration", 23, "23-img-2026"),
    image("Illustration", 24, "24-img-2027"),
    image("Illustration", 25, "25-img-2032"),
    image("Illustration", 26, "26-img-2033"),
    image("Illustration", 27, "27-img-7027"),
    image("Illustration", 28, "28-img-7030"),
    image("Illustration", 29, "29-img-7031"),
    image("Illustration", 30, "30-img-7038"),
    image("Illustration", 31, "31-img-7048"),
    image("Illustration", 32, "32-img-8427"),
    image("Illustration", 33, "33-img-8607"),
    image("Illustration", 34, "34-untitled-artwork-1-copy-2"),
    image("Illustration", 35, "35-untitled-artwork-1-copy-3"),
    image("Illustration", 36, "36-untitled-artwork-1-copy-4"),
    image("Illustration", 37, "37-untitled-artwork-1-copy-5"),
    image("Illustration", 38, "38-untitled-artwork-1-copy-6"),
    image("Illustration", 39, "39-untitled-artwork-1-copy"),
    image("Illustration", 40, "40-untitled-artwork-2"),
    image("Illustration", 41, "41-untitled-artwork-2"),
    image("Illustration", 42, "42-untitled-artwork-1"),
    image("Illustration", 43, "43-untitled-artwork-48-edited"),
    image("Illustration", 44, "44-untitled-artwork-48"),
    image("Illustration", 45, "45-untitled-artwork-52"),
    image("Illustration", 46, "46-untitled-artwork-56"),
    image("Illustration", 47, "47-untitled-artwork-58"),
    image("Illustration", 48, "48-untitled-artwork-63"),
    ],
  },
  {
    name: "3D Portfolio",
    projects: [
    image("3D Portfolio", 1, "01-10801920text"),
    image("3D Portfolio", 2, "02-c061ade6-4781-4294-bd67-fe8e"),
    image("3D Portfolio", 3, "03-erisfinalps-2"),
    image("3D Portfolio", 4, "04-img-1767-edited"),
    image("3D Portfolio", 5, "05-img-2803"),
    image("3D Portfolio", 6, "06-img-5074"),
    image("3D Portfolio", 7, "07-img-5075"),
    image("3D Portfolio", 8, "08-img-5144"),
    image("3D Portfolio", 9, "09-img-8601-edited"),
    image("3D Portfolio", 10, "10-img-9012"),
    image("3D Portfolio", 11, "11-img-9457-edited"),
    image("3D Portfolio", 12, "12-playstation-eris-poster6-cam"),
    image("3D Portfolio", 13, "13-playstation-eris-poster6-cam"),
    image("3D Portfolio", 14, "14-skateboard-edited"),
    image("3D Portfolio", 15, "15-untitled-artwork-1-copy-3"),
    image("3D Portfolio", 16, "16-untitled-artwork-1-copy-4"),
    image("3D Portfolio", 17, "17-untitled-artwork-1-copy-5"),
    image("3D Portfolio", 18, "18-untitled-artwork-3-edited-ed"),
    image("3D Portfolio", 19, "19-untitled-artwork-3"),
    image("3D Portfolio", 20, "20-untitled-artwork-6"),
    image("3D Portfolio", 21, "21-untitled-artwork-8"),
    image("3D Portfolio", 22, "22-untitled-artwork-30"),
    image("3D Portfolio", 23, "23-untitled-artwork-46-edited"),
    image("3D Portfolio", 24, "24-untitled-artwork-49"),
    image("3D Portfolio", 25, "25-untitled-artwork-50-edited"),
    image("3D Portfolio", 26, "26-untitled-artwork-51-edited"),
    image("3D Portfolio", 27, "27-untitled-artwork-53-edited"),
    image("3D Portfolio", 28, "28-untitled-artwork-57"),
    image("3D Portfolio", 29, "29-untitled-artwork-copy-6"),
    ],
  },
  {
    name: "Graphic Design",
    projects: [
    image("Graphic Design", 1, "01-00-cover-final"),
    image("Graphic Design", 2, "02-02-mag-page-2-final"),
    image("Graphic Design", 3, "03-8e31fca4-e705-4951-bf07-3bc9"),
    image("Graphic Design", 4, "04-actionnnnn-snapshot"),
    image("Graphic Design", 5, "05-c8761438-61a0-4722-9079-986a"),
    image("Graphic Design", 6, "06-img-0319"),
    image("Graphic Design", 7, "07-img-0321"),
    image("Graphic Design", 8, "08-img-0366"),
    image("Graphic Design", 9, "09-img-0936"),
    image("Graphic Design", 10, "10-img-0956"),
    image("Graphic Design", 11, "11-img-0959"),
    image("Graphic Design", 12, "12-img-1205"),
    image("Graphic Design", 13, "13-img-1324"),
    image("Graphic Design", 14, "14-img-1538"),
    image("Graphic Design", 15, "15-img-1598"),
    image("Graphic Design", 16, "16-img-1604"),
    image("Graphic Design", 17, "17-img-1741"),
    image("Graphic Design", 18, "18-img-1760"),
    image("Graphic Design", 19, "19-img-1762"),
    image("Graphic Design", 20, "20-img-1769"),
    image("Graphic Design", 21, "21-img-1771"),
    image("Graphic Design", 22, "22-img-1780"),
    image("Graphic Design", 23, "23-img-1784"),
    image("Graphic Design", 24, "24-img-1802"),
    image("Graphic Design", 25, "25-img-1827"),
    image("Graphic Design", 26, "26-img-1828"),
    image("Graphic Design", 27, "27-img-1829"),
    image("Graphic Design", 28, "28-img-1884"),
    image("Graphic Design", 29, "29-img-1984"),
    image("Graphic Design", 30, "30-img-1988"),
    image("Graphic Design", 31, "31-img-1990"),
    image("Graphic Design", 32, "32-img-1991"),
    image("Graphic Design", 33, "33-img-1992"),
    image("Graphic Design", 34, "34-img-1995"),
    image("Graphic Design", 35, "35-img-2001"),
    image("Graphic Design", 36, "36-img-2002"),
    image("Graphic Design", 37, "37-img-2004"),
    image("Graphic Design", 38, "38-img-2010"),
    image("Graphic Design", 39, "39-img-2011"),
    image("Graphic Design", 40, "40-img-2015"),
    image("Graphic Design", 41, "41-img-3180"),
    image("Graphic Design", 42, "42-img-5547"),
    image("Graphic Design", 43, "43-img-7046"),
    image("Graphic Design", 44, "44-img-7346"),
    image("Graphic Design", 45, "45-img-8330"),
    image("Graphic Design", 46, "46-img-8606"),
    image("Graphic Design", 47, "47-img-8719"),
    image("Graphic Design", 48, "48-img-9157"),
    image("Graphic Design", 49, "49-img-9242"),
    image("Graphic Design", 50, "50-img-9674"),
    image("Graphic Design", 51, "51-untitled-artwork-1"),
    image("Graphic Design", 52, "52-untitled-artwork-59"),
    image("Graphic Design", 53, "53-untitled-artwork-60"),
    image("Graphic Design", 54, "54-untitled-artwork-61"),
    image("Graphic Design", 55, "55-untitled-artwork-62"),
    image("Graphic Design", 56, "56-untitled-artwork"),
    image("Graphic Design", 57, "57-untitled-artwork-1"),
    image("Graphic Design", 58, "58-untitled-artwork-2"),
    image("Graphic Design", 59, "59-untitled-artwork-3"),
    ],
  },
  {
    name: "Dynamic",
    projects: [
    video("Dynamic", 1, "01-dream-17"),
    video("Dynamic", 2, "02-highresnospin"),
    video("Dynamic", 3, "03-keep"),
    video("Dynamic", 4, "04-no-background-noise"),
    video("Dynamic", 5, "05-raytracing-camera"),
    video("Dynamic", 6, "06-rpreplay-final1656383625-1"),
    video("Dynamic", 7, "07-rpreplay-final1657590491"),
    video("Dynamic", 8, "08-rpreplay-final1665419974"),
    video("Dynamic", 9, "09-rpreplay-final1667234670-cop"),
    video("Dynamic", 10, "10-rpreplay-final1667853982"),
    video("Dynamic", 11, "11-rpreplay-final1687195293-e72"),
    video("Dynamic", 12, "12-u-stupid-fool-its-this-fomo-"),
    video("Dynamic", 13, "13-untitled-artwork-copy-882926"),
    ],
  },
  {
    name: "Merchandise",
    projects: [
    image("Merchandise", 1, "01-5-1-1-b239238a-4b95-468d-ac5"),
    image("Merchandise", 2, "02-97f9054d-6f3d-491c-b15d-112e"),
    image("Merchandise", 3, "03-9853-1600x-png"),
    image("Merchandise", 4, "04-35159d6a-0ac2-4294-8f44-0ef6"),
    image("Merchandise", 5, "05-98932-1600x-png"),
    image("Merchandise", 6, "06-from-selection"),
    image("Merchandise", 7, "07-img-1632"),
    image("Merchandise", 8, "08-img-1697"),
    image("Merchandise", 9, "09-img-2766-2"),
    image("Merchandise", 10, "10-img-2766"),
    image("Merchandise", 11, "11-img-2786-2"),
    image("Merchandise", 12, "12-img-2786"),
    image("Merchandise", 13, "13-img-6780-1600x"),
    image("Merchandise", 14, "14-img-8293-edited-edited"),
    image("Merchandise", 15, "15-img-4991-1600x-edited"),
    image("Merchandise", 16, "16-img-4991-1600x-png"),
    image("Merchandise", 17, "17-mg-2412-edited"),
    image("Merchandise", 18, "18-mg-2412-jpg"),
    image("Merchandise", 19, "19-mg-2687-edited"),
    image("Merchandise", 20, "20-mg-2687-jpg"),
    image("Merchandise", 21, "21-sticker-jorts-black-front-2-"),
    image("Merchandise", 22, "22-sticker-jorts-black-front-2-"),
    image("Merchandise", 23, "23-untitled-artwork-29"),
    image("Merchandise", 24, "24-untitled-artwork-42-edited"),
    image("Merchandise", 25, "25-untitled-artwork-42"),
    image("Merchandise", 26, "26-untitled-artwork-43-edited"),
    image("Merchandise", 27, "27-untitled-artwork-43"),
    image("Merchandise", 28, "28-untitled-artwork-44"),
    image("Merchandise", 29, "29-untitled-artwork-45-edited"),
    image("Merchandise", 30, "30-untitled-artwork-45"),
    image("Merchandise", 31, "31-untitled-artwork-54"),
    image("Merchandise", 32, "32-untitled-artwork-55"),
    image("Merchandise", 33, "33-untitled-artwork-56-edited"),
    image("Merchandise", 34, "34-untitled-artwork-64-edited"),
    image("Merchandise", 35, "35-untitled-artwork-64"),
    image("Merchandise", 36, "36-untitled-artwork-3"),
    image("Merchandise", 37, "37-untitled-artwork-4"),
    ],
  },
];
