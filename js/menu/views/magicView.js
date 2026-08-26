import { portfolioCategories } from "../data/portfolio.js";
import { renderTopNav } from "./topNav.js";
import { navigate } from "../router.js";
import { fitTextToOneLine } from "../utils/fitTextToOneLine.js";

// Same three-pane mechanic as itemsView.js (categories -> list -> detail),
// mirrored to the right side of the screen since Magic is reached from the
// compass's LEFT point:
//
//   compass --(<-)--> categories --(<-)--> project list
//                 (->)<--                (->)<--
//
// i.e. left/right are swapped from Items — the mirrored layout puts
// "deeper" content physically further left on screen, so pressing further
// left keeps going deeper (matching the direction you entered from), and
// right steps back out, eventually leaving to the compass.
//
// Every category (plus a synthetic top-level "All" category) gets an "All"
// entry prepended to its project list. Selecting that "All" entry doesn't
// open a single project — it fills the detail pane with a condensed
// thumbnail gallery of every piece in that list; clicking a thumbnail opens
// it as a normal single item, same as picking it from the list directly.

function getCategories() {
  return ["All", ...portfolioCategories.map((c) => c.name)];
}

function projectsInCategory(cat) {
  if (cat === "All") return portfolioCategories.flatMap((c) => c.projects);
  const found = portfolioCategories.find((c) => c.name === cat);
  return found ? found.projects : [];
}

function itemsInCategory(cat) {
  const gallery = { id: `${cat}::all`, name: "All", isGallery: true, category: cat };
  return [gallery, ...projectsInCategory(cat)];
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
    <div class="list-col">
      <div class="list-rows-viewport"><div class="list-col-inner"></div></div>
    </div>
    <div class="detail-col"></div>
  `
  );

  const categoryCol = el.querySelector(".category-col");
  const categoryRowsViewport = el.querySelector(".category-rows-viewport");
  const categoryRowsEl = el.querySelector(".category-rows");
  const listCol = el.querySelector(".list-col");
  const listRowsViewport = el.querySelector(".list-rows-viewport");
  const listRowsEl = el.querySelector(".list-col-inner");
  const detailCol = el.querySelector(".detail-col");

  let categoryIndex = 0;
  let itemIndex = 0;
  let focusPane = "categories"; // "categories" | "list"
  let currentList = itemsInCategory(categories[categoryIndex]);
  let lastRenderedKey = null;

  function renderCategoryRows() {
    categoryRowsEl.innerHTML = "";
    categories.forEach((cat, i) => {
      const row = document.createElement("button");
      row.className = "col-row rune" + (i === categoryIndex ? " active" : "");
      row.textContent = cat;
      row.addEventListener("click", () => {
        categoryIndex = i;
        currentList = itemsInCategory(categories[categoryIndex]);
        itemIndex = 0;
        focusPane = "list";
        render();
      });
      categoryRowsEl.appendChild(row);
    });
  }

  function renderListRows() {
    listRowsEl.innerHTML = "";
    currentList.forEach((item, i) => {
      const row = document.createElement("button");
      row.className = "col-row" + (i === itemIndex ? " active" : "");
      row.textContent = item.name;
      row.addEventListener("click", () => {
        itemIndex = i;
        focusPane = "list";
        render();
      });
      listRowsEl.appendChild(row);
    });
  }

  function mediaTag(item) {
    return item.kind === "video"
      ? `<video class="magic-media" src="${item.full}" poster="${item.thumb}" controls loop muted playsinline></video>`
      : `<img class="magic-media" src="${item.full}" alt="${item.name}" />`;
  }

  function renderGallery(item) {
    const catName = item.category;
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
        const idx = currentList.findIndex((p) => p.id === piece.id);
        if (idx !== -1) {
          itemIndex = idx;
          render();
        }
      });
      grid.appendChild(thumb);
    });
  }

  function renderSingle(item) {
    detailCol.classList.remove("gallery-mode");
    detailCol.innerHTML = `
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
  }

  function renderDetail() {
    const item = currentList[itemIndex] || null;
    if (!item) return;
    const key = `${item.id}:${item.isGallery ? "gallery" : "single"}`;
    if (key === lastRenderedKey) return; // avoid rebuilding + restarting video for no reason
    lastRenderedKey = key;
    if (item.isGallery) renderGallery(item);
    else renderSingle(item);
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
    renderListRows();
    renderDetail();
    categoryCol.classList.toggle("focused", focusPane === "categories");
    listCol.classList.toggle("focused", focusPane === "list");
    el.classList.toggle("expanded", focusPane === "list");
    centerActiveRow(categoryRowsViewport, categoryRowsEl);
    centerActiveRow(listRowsViewport, listRowsEl);
  }

  function moveSelection(delta) {
    if (focusPane === "categories") {
      const next = Math.min(categories.length - 1, Math.max(0, categoryIndex + delta));
      if (next === categoryIndex) return;
      categoryIndex = next;
      currentList = itemsInCategory(categories[categoryIndex]);
      itemIndex = 0;
    } else {
      const next = Math.min(currentList.length - 1, Math.max(0, itemIndex + delta));
      if (next === itemIndex) return;
      itemIndex = next;
    }
    render();
  }

  function onKeyDown(e) {
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
        if (focusPane === "categories") {
          focusPane = "list";
          render();
        }
        break;
      case "ArrowRight":
        if (focusPane === "list") {
          focusPane = "categories";
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
    centerActiveRow(listRowsViewport, listRowsEl);
  }
  window.addEventListener("resize", onResize);

  container.appendChild(el);
  render();

  // See the matching comment in itemsView.js: on a full page load straight
  // into this route, layout can still be mid-settle at the instant render()
  // above measures it, silently skipping centering. Re-run it after the
  // next paint and once fonts finish loading.
  requestAnimationFrame(() => {
    centerActiveRow(categoryRowsViewport, categoryRowsEl);
    centerActiveRow(listRowsViewport, listRowsEl);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      centerActiveRow(categoryRowsViewport, categoryRowsEl);
      centerActiveRow(listRowsViewport, listRowsEl);
    });
  }

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
  };
}
