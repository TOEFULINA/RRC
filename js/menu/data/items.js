// ---------------------------------------------------------------------------
// One entry per physical item (apparel, action figures, shoes, packaging,
// props, etc). This is the only file you need to touch to add a new piece.
//
// model:     path to a .glb in /public/models/  (leave "" for a placeholder
//            shape while you don't have a model ready yet)
// thumbnail: path to a small preview image in /public/items/ (not wired up
//            in the UI yet — reserved for a future list-row icon)
// stats:     any label/value pairs you want — mirrors a Skyrim item
//            tooltip (Armor / Weight / Value). Use whatever fits the
//            piece: Materials, Year, Edition, Runtime, etc.
// viewerFitMargin: optional — extra breathing room around this one model
//            (1 = touching the frame edge at the start angle, higher = more
//            air). Leave it unset: the viewer now fits the model's real
//            bounding-box corners at its starting angle, so it is already as
//            large as it can be without clipping. Every item used to carry a
//            hand-tuned value under 1 here, which was compensating for the
//            old bounding-sphere fit framing for a diagonal you never see;
//            those are gone. See js/menu/three/modelViewer.js for the math.
// viewerStartOpposite: optional — starts the camera on the far side of
//            the model instead of the shared default corner. Per item,
//            same as viewerFitMargin above.
// viewerStartAngle: optional — { thetaDeg, phiDeg }, an exact starting
//            camera angle, overriding viewerStartOpposite. There's a
//            temporary on-screen θ/φ readout in the viewer (top-left
//            corner) for finding these — drag to the angle you like and
//            read the numbers off straight.
// viewerAnimationRange: optional — { startFrame, endFrame, fps } — plays
//            only this slice of a model's baked animation. Check the
//            .glb's own keyframe spacing for the real fps before setting
//            this (see src/three/modelViewer.js) — don't assume 24 or 30.
//
// Names/stats below are the real, final values — swap in real descriptions
// per piece whenever you're ready; the layout adapts automatically either
// way.
// ---------------------------------------------------------------------------

function placeholder(id, name, category) {
  return {
    id,
    name,
    category,
    model: "",
    thumbnail: "",
    // A single default stat so every card previews populated — swap in
    // real ones (Materials, Edition, whatever fits) per piece as you go.
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
    // Filler flavor-text line (mirrors the small italic blurb under a
    // Skyrim item's stats, e.g. "Increases Disease Resistance by 100%.")
    // — swap in the real line per item whenever you're ready.
    description: "Description coming soon.",
  };
}

export const items = [
  // Tops
  {
    ...placeholder("item-02", "Shitumss Tee", "Tops"),
    model: "/menu/models/shitumss-tee.glb",
    viewerStartAngle: { thetaDeg: 285.5, phiDeg: 83.0 },
    stats: [
      { label: "Year", value: "2023" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "1" },
    ],
    description: "Promotional merch for Joony's 2023 project Shitumss.",
  },
  {
    ...placeholder("item-04", "Stargirl x Sweetly Mesh Tee", "Tops"),
    model: "/menu/models/illustrated-mesh-tee-2.glb",
    viewerStartAngle: { thetaDeg: 189.7, phiDeg: 86.7 },
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "0.1" },
    ],
    description: "Second iteration of mesh tees with Lonelystar to assist Lonelystar x Sweetly collab",
  },
  {
    ...placeholder("item-05", "CXR World Championship Tee", "Tops"),
    model: "/menu/models/cxr-championship-tee.glb",
    viewerStartAngle: { thetaDeg: 279.4, phiDeg: 90.2 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "UNRELEASED" },
      { label: "Weight", value: "1" },
    ],
    description: "Unreleased design by me for CXR",
  },
  {
    ...placeholder("item-37", "Oversized Kid Cudi Tee", "Tops"),
    model: "/menu/models/kid-cudi-tee.glb",
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "LIMITED" },
      { label: "Weight", value: "1" },
    ],
    description: "Shirt design and production file by me for Bravest Studios x Kid Cudi",
  },
  {
    ...placeholder("item-44", "Napoleon Tee", "Tops"),
    model: "/menu/models/band-director-tee.glb",
    viewerStartAngle: { thetaDeg: 279.4, phiDeg: 90.2 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "68" },
      { label: "Weight", value: "1" },
    ],
    description: "Designed for Bravest Studios. Inspired by Sgt. Pepper.",
  },
  {
    ...placeholder("item-45", "X-Files Tee", "Tops"),
    model: "/menu/models/xfiles-tee.glb",
    viewerStartAngle: { thetaDeg: 190.6, phiDeg: 85.8 },
    stats: [
      { label: "Year", value: "2022" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "1" },
    ],
    description: "Merchandise for Chris Patrick's project X-Files.",
  },
  {
    ...placeholder("item-46", "Joony Tee", "Tops"),
    model: "/menu/models/joony-tee.glb",
    viewerStartAngle: { thetaDeg: 279.4, phiDeg: 90.2 },
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "1" },
    ],
    description: "Merchandise for Joony's 2024 project Memento.",
  },
  {
    ...placeholder("item-47", "Fear Of Making Out Tee", "Tops"),
    model: "/menu/models/fearofmakingout-tee.glb",
    viewerStartAngle: { thetaDeg: 279.4, phiDeg: 90.2 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "Unreleased" },
      { label: "Weight", value: "—" },
    ],
    description: "Digitally illustrated design for fearofmakingout.",
  },
  {
    ...placeholder("item-48", "Dess Dior Crop Tee", "Tops"),
    model: "/menu/models/dess-dior-crop-tee.glb",
    viewerStartAngle: { thetaDeg: 179.0, phiDeg: 71.6 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "0.5" },
    ],
    description: "Limited Release for Dess Dior's music video promotional.",
  },
  {
    ...placeholder("item-49", "Stargirl Mesh Tee", "Tops"),
    model: "/menu/models/stargirl-mesh-tee.glb",
    viewerStartAngle: { thetaDeg: 190.7, phiDeg: 81.9 },
    stats: [
      { label: "Year", value: "2023" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "0.1" },
    ],
    description: "Design work for Lonelystar! Limited release.",
  },
  {
    ...placeholder("item-61", "Glo Gang Layered Tee", "Tops"),
    model: "/menu/models/glo-gang-layered-tee.glb",
    viewerStartAngle: { thetaDeg: 176.5, phiDeg: 86.0 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "1" },
    ],
    description: "Description coming soon.",
  },
  {
    ...placeholder("item-51", "New Moon Raglan", "Tops"),
    model: "/menu/models/new-moon-raglan.glb",
    viewerStartAngle: { thetaDeg: 270.6, phiDeg: 99.4 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "888" },
      { label: "Weight", value: "0.8" },
    ],
    description: "Inspired by my family's San Francisco Chinese restaurant from the 70s.",
  },

  // Bottoms
  {
    ...placeholder("item-06", "Sticker Print Jorts", "Bottoms"),
    model: "/menu/models/sticker-print-jorts.glb",
    viewerStartAngle: { thetaDeg: 272.6, phiDeg: 89.4 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "98" },
      { label: "Weight", value: "2" },
    ],
    description: "Designed by me for Bravest Studios!",
  },
  {
    ...placeholder("item-60", "Sapphire Jorts", "Bottoms"),
    model: "/menu/models/sapphire-jorts.glb",
    viewerStartAngle: { thetaDeg: 274.0, phiDeg: 98.0 },
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "2" },
    ],
    description: "Description coming soon.",
  },
  {
    ...placeholder("item-07", "Black Illustrated Shorts", "Bottoms"),
    model: "/menu/models/illustrated-denim-shorts.glb",
    viewerStartAngle: { thetaDeg: 249.0, phiDeg: 93.1 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "PERSONAL" },
      { label: "Weight", value: "1.5" },
    ],
    description: "Baggy shorts illustrated with Posca Paint Marker.",
  },
  {
    ...placeholder("item-53", "Glo Gang Baggy Sweats", "Bottoms"),
    model: "/menu/models/glo-gang-baggy-sweats.glb",
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "1" },
    ],
    description: "Design work for Bravest x Glo Gang collab",
  },
  {
    ...placeholder("item-54", "Black Glo Gang Baggy Sweats", "Bottoms"),
    model: "/menu/models/black-glo-gang-baggy-sweats.glb",
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "ARCHIVE" },
      { label: "Weight", value: "1" },
    ],
    description: "Design work for Bravest x Glo Gang collab",
  },
  {
    ...placeholder("item-55", "Aquarium Jeans", "Bottoms"),
    model: "/menu/models/aquarium-jeans.glb",
    viewerStartAngle: { thetaDeg: 249.0, phiDeg: 93.1 },
  },
  {
    ...placeholder("item-56", "Studded Denim Jorts", "Bottoms"),
    model: "/menu/models/studded-denim-jorts.glb",
    viewerStartAngle: { thetaDeg: 249.0, phiDeg: 93.1 },
  },
  {
    ...placeholder("item-57", "DNI Jeans", "Bottoms"),
    model: "/menu/models/dni-jeans.glb",
    viewerStartAngle: { thetaDeg: 249.0, phiDeg: 93.1 },
    stats: [
      { label: "Year", value: "2023" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },

  // Accessories
  {
    ...placeholder("item-10", "Charm Belt", "Accessories"),
    // Pulled straight out of room.glb rather than exported separately — BELT
    // is a material there, not a node, so it was one primitive on a
    // multi-material mesh. Extracted by material and re-centred on the origin.
    model: "/menu/models/charm-belt.glb",
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "ARCHIVED" },
      { label: "Weight", value: "1" },
    ],
    description: "Inspired by Crocs. Archive design concept by me for Bravest Studios.",
  },
  {
    ...placeholder("item-11", "Button Covered Bag", "Accessories"),
    model: "/menu/models/pins-bag.glb",
    viewerStartAngle: { thetaDeg: 180, phiDeg: 60 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "PERSONAL" },
      { label: "Weight", value: "4" },
    ],
    description: "Custom pins printed and pressed on a hand me down Telfar! My daily work bag.",
  },
  {
    ...placeholder("item-12", "Engraved Headphones", "Accessories"),
    model: "/menu/models/engraved-headphones.glb",
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "PERSONAL" },
      { label: "Weight", value: "3" },
    ],
    description: "Engraved using the xtool engraving pen - custom illustration",
  },
  {
    ...placeholder("item-47", "Deco Self Portrait Case", "Accessories"),
    viewerStartAngle: { thetaDeg: 9.6, phiDeg: 94.1 },
    model: "/menu/models/self-portrait-case.glb",
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "\u2014" },
      { label: "Weight", value: "\u2014" },
    ],
  },
  {
    ...placeholder("item-13", "Deco Majora's Mask Case", "Accessories"),
    viewerFitMargin: 0.8,
    viewerStartAngle: { thetaDeg: 6.7, phiDeg: 84.8 },
    model: "/menu/models/majoras-mask-case.glb",
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "PERSONAL" },
      { label: "Weight", value: "0.5" },
    ],
    description: "Decoden phone case with charms collected through my lifetime :)",
  },
  {
    ...placeholder("item-14", "Steak Ring", "Accessories"),
    model: "/menu/models/steak-ring.glb",
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "MARKET" },
      { label: "Weight", value: "0.1" },
    ],
    description: "Custom hand sculpted polymer clay ring - steak edition.",
  },
  {
    ...placeholder("item-52", "Spaghetti Ring", "Accessories"),
    model: "/menu/models/spaghetti-ring.glb",
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "GIFT" },
      { label: "Weight", value: "0.1" },
    ],
    description: "Custom hand sculpted polymer clay ring - spaghetti edition",
  },
  {
    ...placeholder("item-43", "Steakpods Case", "Accessories"),
    model: "/menu/models/steakpods.glb",
    viewerStartAngle: { thetaDeg: 180, phiDeg: 90 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "PERSONAL" },
      { label: "Weight", value: "0.5" },
    ],
    description: "Steak sculped in Nomad sculpt, printed with Elegoo and hand painted.",
  },

  // Footwear
  {
    ...placeholder("item-15", "Red Claymation Shoe", "Footwear"),
    model: "/menu/models/red-claymation-shoe.glb",
    // Compact/rounded mesh — safe to fill the frame much more tightly
    viewerStartAngle: { thetaDeg: 267.5, phiDeg: 84.4 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "120" },
      { label: "Weight", value: "2" },
    ],
    description: "Hand sculpted, scanned, and cast in EVA for your comfort by me 4 Bravest & u!",
  },
  {
    ...placeholder("item-16", "Black Claymation Shoe", "Footwear"),
    model: "/menu/models/black-claymation-shoe.glb",
    // Same mesh as Red Claymation Shoe (item-15), just a different UV/texture
    viewerStartAngle: { thetaDeg: 267.5, phiDeg: 84.4 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "120" },
      { label: "Weight", value: "2" },
    ],
    description: "Hand sculpted, scanned, and cast in EVA for your comfort by me 4 Bravest & u!",
  },
  {
    ...placeholder("item-17", "Glo Gang Slides", "Footwear"),
    model: "/menu/models/glogang-clog.glb",
    viewerStartAngle: { thetaDeg: 210.0, phiDeg: 72.6 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "110" },
      { label: "Weight", value: "1" },
    ],
    description: "Pattern design for Bravest Studios x Glo Gang Collab",
  },
  {
    ...placeholder("item-18", "Steak Slides", "Footwear"),
    model: "/menu/models/beef-clog.glb",
    viewerStartAngle: { thetaDeg: 12.6, phiDeg: 75.2 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "110" },
      { label: "Weight", value: "1" },
    ],
    description: "Blank slides hand painted to look like raw steak! Yummyyyyy",
  },
  {
    ...placeholder("item-19", "Sticker Print Boots", "Footwear"),
    model: "/menu/models/sticker-docs.glb",
    viewerStartAngle: { thetaDeg: 250.8, phiDeg: 79.4 },
    stats: [
      { label: "Year", value: "2018" },
      { label: "Value", value: "200" },
      { label: "Weight", value: "3" },
    ],
  },
  {
    ...placeholder("item-42", "Brazil Runner", "Footwear"),
    model: "/menu/models/brazil-runner.glb",
    viewerStartAngle: { thetaDeg: 8.0, phiDeg: 79.5 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "125" },
      { label: "Weight", value: "2" },
    ],
    description: "Colorway design for Bravest Studios Kross Kountry Runner.",
  },
  {
    ...placeholder("item-50", "Claymation Slide", "Footwear"),
    model: "/menu/models/clay-slide.glb",
    viewerStartAngle: { thetaDeg: 261.3, phiDeg: 75.7 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "130" },
      { label: "Weight", value: "2" },
    ],
    description: "Second iteration in the Claymation Shoe series :)",
  },

  // Packaging
  {
    ...placeholder("item-20", "Foot Clog Box", "Packaging"),
    model: "/menu/models/hulk-packaging.glb",
    viewerStartAngle: { thetaDeg: 173.9, phiDeg: 89.5 },
    // Source animation is baked at 24fps (confirmed from keyframe spacing)
    // — only play the box-opening portion, not the whole clip. The clip's
    // true last keyframe is frame 179 (7.458333s @ 24fps) — stopping short
    // of that cuts the loop off before it settles on its final pose.
    viewerAnimationRange: { startFrame: 75, endFrame: 179, fps: 24 },
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "1" },
    ],
    description: "Packaging design for Bravest Studios Foot Clog.",
  },
  {
    ...placeholder("item-21", "Kid Cudi x Bravest Foot Clog Box", "Packaging"),
    model: "/menu/models/kid-cudi-clog-box.glb",
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "1" },
    ],
    description: "Packaging design for Kid Cudi x Bravest Studios Foot  Clog.",
  },
  {
    ...placeholder("item-22", "Claymation Shoe Box", "Packaging"),
    model: "/menu/models/clay-shoe.glb",
    viewerStartAngle: { thetaDeg: 301.8, phiDeg: 63.9 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "!" },
      { label: "Weight", value: "2" },
    ],
    description: "Packaging design by me for the Clay shoe! Inspired by Play-doh sets from my childhood.",
  },
  {
    ...placeholder("item-23", "Spike Sandal Box", "Packaging"),
    model: "/menu/models/spike-sandal-box.glb",
    viewerStartAngle: { thetaDeg: 219.8, phiDeg: 71.2 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "1" },
    ],
    description: "Packaging design for Bravest Studios Spike Sandal.",
  },
  {
    ...placeholder("item-24", "Spike Shoe Box", "Packaging"),
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "1" },
    ],
    description: "Packaging design for Bravest Studios Spike Shoe.",
  },
  {
    ...placeholder("item-25", "Bag Clog Box", "Packaging"),
    model: "/menu/models/bag-clog-box.glb",
    viewerStartAngle: { thetaDeg: 47.2, phiDeg: 52.1 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "0.5" },
    ],
    description: "Packaging design for Bravest Studios Bag Clog. Ribbons are printed onto the box.",
  },

  // Action Figures
  {
    ...placeholder("item-26", "Kid Cudi", "Action Figures"),
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },
  {
    ...placeholder("item-27", "Joony", "Action Figures"),
    stats: [
      { label: "Year", value: "2023" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },
  placeholder("item-28", "Eris", "Action Figures"),
  placeholder("item-29", "Me", "Action Figures"),
  placeholder("item-30", "Kanii", "Action Figures"),
  placeholder("item-31", "Drezzdon", "Action Figures"),

  // Nail Sets
  {
    ...placeholder("item-32", "Raw Beef Set", "Nail Sets"),
    model: "/menu/models/beef-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },
  {
    ...placeholder("item-33", "Raw Pork Set", "Nail Sets"),
    model: "/menu/models/pork-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },
  {
    ...placeholder("item-34", "Halloween Animal Crossing Set", "Nail Sets"),
    model: "/menu/models/ac-halloween-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },
  {
    ...placeholder("item-35", "Splatoon Sticker Collage Set", "Nail Sets"),
    model: "/menu/models/splatoon-collage-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },
  {
    ...placeholder("item-36", "Deco Berserk Set", "Nail Sets"),
    model: "/menu/models/berserk-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    description: "Custom",
  },
  {
    ...placeholder("item-38", "Deco Katamari Set", "Nail Sets"),
    model: "/menu/models/katamari-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },
  {
    ...placeholder("item-58", "Plaid Junk Set", "Nail Sets"),
    model: "/menu/models/plaid-junk-nails.glb",
    // Same framing as the other Tripo-scanned nail sets — they're all the
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "\u2014" },
      { label: "Weight", value: "\u2014" },
    ],
  },
  {
    ...placeholder("item-59", "Toefu Lina Squid Set", "Nail Sets"),
    model: "/menu/models/squid-set-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "\u2014" },
      { label: "Weight", value: "\u2014" },
    ],
  },
  {
    ...placeholder("item-39", "Deco Tentacle Set", "Nail Sets"),
    model: "/menu/models/tentacle-nails.glb",
    viewerStartAngle: { thetaDeg: 234.4, phiDeg: 49.3 },
    stats: [
      { label: "Year", value: "2026" },
      { label: "Value", value: "—" },
      { label: "Weight", value: "—" },
    ],
  },

  // Misc
  {
    ...placeholder("item-40", "Memento Deluxe Cassette", "Misc"),
    model: "/menu/models/memento-deluxe.glb",
    stats: [
      { label: "Year", value: "2024" },
      { label: "Value", value: "PRICELESS" },
      { label: "Weight", value: "0.5" },
    ],
    description: "Cassette Tape from Joony's Memento Deluxe - Brought 2 life!",
  },
  {
    ...placeholder("item-41", "Zombie Zip Bag", "Misc"),
    model: "/menu/models/zombie.glb",
    viewerStartAngle: { thetaDeg: 230, phiDeg: 90 },
    stats: [
      { label: "Year", value: "2025" },
      { label: "Value", value: "PRICELESS" },
      { label: "Weight", value: "0.5" },
    ],
    description: "Zip bag from Estelle Allen's Zombie - Brought 2 life!",
  },
];
