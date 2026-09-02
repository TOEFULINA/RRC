import { portfolioCategories } from "../data/portfolio.js";
import { renderTopNav } from "./topNav.js";
import { navigate } from "../router.js";
import { fitTextToOneLine } from "../utils/fitTextToOneLine.js";

// TWO panes, not three: a category rail and the work itself.
//
//   compass --(<-)--> categories --> [ collage ] --(click)--> [ one piece ]
//                 (->)<--                          (right/esc)<--
//
// Items needs its middle column because you pick a garment by name. Magic
// doesn't — you pick a picture by looking at it. The old middle pane listed
// "Illustration I, Illustration II, Illustration III", which is no
// information at all, and it cost roughly a third of the screen that the
// work could have been using. So picking a category now goes straight to
// that category's collage, and a thumbnail opens the piece full size.
//
// Left/right stay swapped from Items: this menu is reached from the compass's
// LEFT point and is mirrored, so right steps back out toward the compass.

function getCategories() {
  return ["All", ...portfolioCategories.map((c) => c.name)];
}

function projectsInCategory(cat) {
  if (cat === "All") return portfolioCategories.flatMap((c) => c.projects);
  const found = portfolioCategories.find((c) => c.name === cat);
  return found ? found.projects : [];
}

export function renderMagicView(container) {
  const categories = getCategories();

  const el = document.createElement("div");
  el.className = "items-fullscreen mirrored";
  el.appendChild(renderTopNav("magic"));
  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="category-col">
      <div class="category-rows-viewport"><div class="category-rows"></div></div>
    </div>
    <div class="detail-col"></div>
  `
  );

  const categoryCol = el.querySelector(".category-col");
  const categoryRowsViewport = el.querySelector(".category-rows-viewport");
  const categoryRowsEl = el.querySelector(".category-rows");
  const detailCol = el.querySelector(".detail-col");

  let categoryIndex = 0;
  // null = showing the category's collage; a project = showing that one piece.
  let openPiece = null;
  let lastRenderedKey = null;

  function renderCategoryRows() {
    categoryRowsEl.innerHTML = "";
    categories.forEach((cat, i) => {
      const row = document.createElement("button");
      row.className = "col-row rune" + (i === categoryIndex ? " active" : "");
      row.textContent = cat;
      row.addEventListener("click", () => {
        categoryIndex = i;
        openPiece = null;
        render();
      });
      categoryRowsEl.appendChild(row);
    });
  }

  function mediaTag(item) {
    return item.kind === "video"
      ? `<video class="magic-media" src="${item.full}" poster="${item.thumb}" controls loop muted playsinline></video>`
      : `<img class="magic-media" src="${item.full}" alt="${item.name}" />`;
  }

  function renderGallery(catName) {
    const pieces = projectsInCategory(catName);
    detailCol.classList.add("gallery-mode");
    detailCol.innerHTML = `
      <div class="gallery-heading rune">${catName === "All" ? "All Work" : catName} <span class="gallery-count">${pieces.length}</span></div>
      <div class="gallery-grid"></div>
    `;
    const grid = detailCol.querySelector(".gallery-grid");
    pieces.forEach((piece) => {
      const thumb = document.createElement("button");
      thumb.className = "gallery-thumb";
      thumb.dataset.kind = piece.kind;
      // A real <img> rather than a background-image — lets each tile keep
      // its source image's own width/height instead of being forced into
      // a uniform square crop, for the collage layout in .gallery-grid.
      thumb.innerHTML = `<img src="${piece.thumb}" alt="" loading="lazy" />`;
      thumb.setAttribute("aria-label", piece.name);
      thumb.addEventListener("click", () => {
        openPiece = piece;
        render();
      });
      grid.appendChild(thumb);
    });
  }

  function renderSingle(item) {
    detailCol.classList.remove("gallery-mode");
    detailCol.innerHTML = `
      <button class="gallery-back rune">&lsaquo; ${item.category}</button>
      <div class="item-viewer">${mediaTag(item)}</div>
      <div class="info-card">
        <div class="info-card-inner">
          <div class="info-name rune">${item.name}</div>
          <div class="info-divider"></div>
          <div class="info-body">
            <ul class="stat-list">
              ${item.stats.map((s) => `<li><span class="stat-label">${s.label}</span><span>${s.value}</span></li>`).join("")}
            </ul>
            <p class="item-description">${item.description || ""}</p>
          </div>
        </div>
      </div>
    `;
    fitTextToOneLine(detailCol.querySelector(".info-name"));
    detailCol.querySelector(".gallery-back").addEventListener("click", () => {
      openPiece = null;
      render();
    });
  }

  function renderDetail() {
    const catName = categories[categoryIndex];
    const key = openPiece ? `piece:${openPiece.id}` : `gallery:${catName}`;
    if (key === lastRenderedKey) return; // don't rebuild + restart a video for nothing
    lastRenderedKey = key;
    if (openPiece) renderSingle(openPiece);
    else renderGallery(catName);
  }

  // Identical fixed-glyph/sliding-list carousel as Items — see itemsView.js.
  function centerActiveRow(viewportEl, rowsEl) {
    const active = rowsEl.querySelector(".col-row.active");
    if (!active) return;
    const viewportHeight = viewportEl.clientHeight;
    if (viewportHeight === 0) return; // not laid out yet
    const translate = viewportHeight / 2 - (active.offsetTop + active.offsetHeight / 2);
    rowsEl.style.transform = `translateY(${translate}px)`;
  }

  function render() {
    renderCategoryRows();
    renderDetail();
    categoryCol.classList.add("focused");
    centerActiveRow(categoryRowsViewport, categoryRowsEl);
  }

  function moveSelection(delta) {
    const next = Math.min(categories.length - 1, Math.max(0, categoryIndex + delta));
    if (next === categoryIndex) return;
    categoryIndex = next;
    openPiece = null;
    render();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && openPiece) {
      e.preventDefault();
      openPiece = null;
      render();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    // This view owns arrow keys fully while mounted — stop the global
    // handler in main.js from also seeing this same keypress. See the
    // matching comment in itemsView.js for why this matters on a direct
    // load/refresh into this route.
    e.stopImmediatePropagation();
    switch (e.key) {
      case "ArrowDown":
        moveSelection(1);
        break;
      case "ArrowUp":
        moveSelection(-1);
        break;
      // Left/right are swapped from Items: this menu is mirrored, so
      // stepping further left continues into it (matching the direction
      // you entered from), and right steps back out toward the compass.
      case "ArrowLeft":
        break;
      case "ArrowRight":
        // One piece open -> back to its collage; collage -> out to the compass.
        if (openPiece) {
          openPiece = null;
          render();
        } else {
          navigate("home");
        }
        break;
    }
  }
  document.addEventListener("keydown", onKeyDown);

  function onResize() {
    centerActiveRow(categoryRowsViewport, categoryRowsEl);
  }
  window.addEventListener("resize", onResize);

  container.appendChild(el);
  render();

  // See the matching comment in itemsView.js: on a full page load straight
  // into this route, layout can still be mid-settle at the instant render()
  // above measures it, silently skipping centering. Re-run it after the
  // next paint and once fonts finish loading.
  requestAnimationFrame(() => centerActiveRow(categoryRowsViewport, categoryRowsEl));
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => centerActiveRow(categoryRowsViewport, categoryRowsEl));
  }

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
  };
}
