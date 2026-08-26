import { items } from "../data/items.js";
import { renderTopNav } from "./topNav.js";
import { mountModelViewer } from "../three/modelViewer.js";
import { navigate } from "../router.js";
import { fitTextToOneLine } from "../utils/fitTextToOneLine.js";
import {
  isEditModeOn,
  setEditModeStored,
  getFieldValue,
  setFieldValue,
  exportEditsText,
  clearAllEdits,
} from "../utils/localEdits.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Full-screen, fully keyboard-navigable menu, mirroring how the game's
// own inventory works:
//
//   compass --(→)--> categories --(→)--> item list
//                (←)<--             (←)<--
//
// Up/Down move the selection within whichever pane currently has focus
// (auto-updating the list / model+card live, same as clicking). Left/Right
// move focus one pane at a time, and Left from the leftmost pane (with
// nothing left to step back into) leaves the screen entirely, back to the
// compass — the reverse of how you arrived. The mouse works the same
// screen: clicking a row also moves keyboard focus there, so the two
// stay in sync.

function getCategories() {
  const unique = [...new Set(items.map((i) => i.category))];
  return ["All", ...unique];
}

// The category rail (first pane) keeps its curated order — Tops, Bottoms,
// Accessories, etc, as defined in items.js. The item list (second pane)
// is sorted alphabetically by name within whichever category is selected,
// "All" included.
function itemsInCategory(cat) {
  const list = cat === "All" ? items : items.filter((i) => i.category === cat);
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderItemsView(container) {
  const categories = getCategories();

  const el = document.createElement("div");
  el.className = "items-fullscreen";
  el.appendChild(renderTopNav("items"));
  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="category-col">
      <div class="category-rows-viewport"><div class="category-rows"></div></div>
    </div>
    <div class="list-col">
      <div class="list-rows-viewport"><div class="list-col-inner"></div></div>
    </div>
    <div class="detail-col">
      <div class="item-viewer"><span class="viewer-hint">Drag to rotate</span></div>
      <div class="info-card">
        <div class="info-card-inner">
          <div class="info-name rune"></div>
          <div class="info-divider"></div>
          <div class="info-body">
            <ul class="stat-list"></ul>
            <p class="item-description"></p>
          </div>
        </div>
      </div>
    </div>
    <div class="edit-mode-bar">
      <span class="edit-mode-label">EDIT MODE — click a value or the description to type. Saved to this browser only.</span>
      <button type="button" class="edit-copy-btn">Copy changes</button>
      <button type="button" class="edit-clear-btn">Clear edits</button>
    </div>
  `
  );

  const categoryCol = el.querySelector(".category-col");
  const categoryRowsViewport = el.querySelector(".category-rows-viewport");
  const categoryRowsEl = el.querySelector(".category-rows");
  const listCol = el.querySelector(".list-col");
  const listRowsViewport = el.querySelector(".list-rows-viewport");
  const listRowsEl = el.querySelector(".list-col-inner");
  const detailCol = el.querySelector(".detail-col");
  const viewerEl = el.querySelector(".item-viewer");
  const viewerHint = el.querySelector(".viewer-hint");
  const infoName = el.querySelector(".info-name");
  const statList = el.querySelector(".stat-list");
  const description = el.querySelector(".item-description");
  const editCopyBtn = el.querySelector(".edit-copy-btn");
  const editClearBtn = el.querySelector(".edit-clear-btn");

  let categoryIndex = 0;
  let itemIndex = 0;
  let focusPane = "categories"; // "categories" | "list"
  let currentList = itemsInCategory(categories[categoryIndex]);
  let disposeViewer = null;
  let lastRenderedItem = null;
  let editMode = isEditModeOn();
  el.classList.toggle("edit-mode-active", editMode);

  const STAT_FIELDS = [
    { field: "year", label: "Year" },
    { field: "value", label: "Value" },
    { field: "weight", label: "Weight" },
  ];

  // Renders the name/stats/description for whichever item is current,
  // independent of mounting the 3D viewer — called both when the
  // selected item changes and when edit mode is toggled on the same item.
  function renderInfoCard(item) {
    if (!item) {
      infoName.textContent = "";
      statList.innerHTML = "";
      description.textContent = "";
      description.removeAttribute("contenteditable");
      return;
    }

    infoName.textContent = item.name;
    fitTextToOneLine(infoName);

    statList.innerHTML = STAT_FIELDS.map(({ field, label }) => {
      const val = getFieldValue(item, field);
      const valueHtml = editMode
        ? `<span class="stat-value-edit" contenteditable="true" spellcheck="false" data-field="${field}">${escapeHtml(val)}</span>`
        : `<span>${escapeHtml(val)}</span>`;
      return `<li><span class="stat-label">${label}</span>${valueHtml}</li>`;
    }).join("");

    const descVal = getFieldValue(item, "description");
    description.textContent = descVal;
    if (editMode) {
      description.setAttribute("contenteditable", "true");
      description.spellcheck = false;
      description.dataset.field = "description";
    } else {
      description.removeAttribute("contenteditable");
      delete description.dataset.field;
    }
  }

  function commitEdit(fieldEl) {
    const field = fieldEl.dataset.field;
    const item = currentList[itemIndex];
    if (!field || !item) return;
    setFieldValue(item.id, field, fieldEl.textContent.trim());
  }

  // Selects the field's whole current value on focus — without this,
  // clicking into a field (e.g. one still showing the "—" placeholder)
  // drops the cursor at the click point and typing inserts instead of
  // replacing, which reads as broken. Click-to-edit should always start
  // from a clean slate.
  function selectAllText(fieldEl) {
    const range = document.createRange();
    range.selectNodeContents(fieldEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // blur/focus don't bubble, but they do still fire capture-phase
  // listeners on ancestors, so a single delegated pair here (rather than
  // per-field listeners re-attached on every render) covers every stat
  // value.
  statList.addEventListener(
    "focus",
    (e) => {
      if (e.target.matches && e.target.matches(".stat-value-edit")) selectAllText(e.target);
    },
    true
  );
  statList.addEventListener(
    "blur",
    (e) => {
      if (e.target.matches && e.target.matches(".stat-value-edit")) commitEdit(e.target);
    },
    true
  );
  statList.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches && e.target.matches(".stat-value-edit")) {
      e.preventDefault();
      e.target.blur();
    }
  });
  description.addEventListener("focus", () => {
    if (description.hasAttribute("contenteditable")) selectAllText(description);
  });
  description.addEventListener("blur", () => {
    if (description.hasAttribute("contenteditable")) commitEdit(description);
  });
  description.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && description.hasAttribute("contenteditable")) {
      e.preventDefault();
      description.blur();
    }
  });

  function toggleEditMode() {
    editMode = !editMode;
    setEditModeStored(editMode);
    el.classList.toggle("edit-mode-active", editMode);
    renderInfoCard(currentList[itemIndex] || null);
  }

  editCopyBtn.addEventListener("click", async () => {
    const text = exportEditsText(items);
    const original = editCopyBtn.textContent;
    if (!text) {
      editCopyBtn.textContent = "No edits yet";
    } else {
      try {
        await navigator.clipboard.writeText(text);
        editCopyBtn.textContent = "Copied!";
      } catch {
        editCopyBtn.textContent = "Copy failed";
      }
    }
    setTimeout(() => {
      editCopyBtn.textContent = original;
    }, 1400);
  });

  editClearBtn.addEventListener("click", () => {
    clearAllEdits();
    renderInfoCard(currentList[itemIndex] || null);
  });

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
        // Clicking a category is the mouse equivalent of pressing the
        // right arrow on it — it reveals that category's item list, same
        // as keyboard focus stepping in one level.
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

  // Click the model once to hide the info card and let the viewer fill
  // that space, with free zoom added on top of the usual rotate; click
  // again to snap back. Lives on detailCol (not per-item) so switching
  // items below always starts back in the normal, non-expanded layout.
  // Also toggles "model-fullscreen" on the outer element — on mobile (see
  // the matching @media block in style.css) that additionally hides the
  // category rail, item list, and bottom nav so the model really takes
  // over the whole screen instead of just the space the info card left;
  // on desktop that class does nothing, there's room for both already.
  function setExpanded(isExpanded) {
    detailCol.classList.toggle("viewer-expanded", isExpanded);
    el.classList.toggle("model-fullscreen", isExpanded);
    viewerHint.textContent = isExpanded ? "Scroll to zoom · Click to exit" : "Drag to rotate";
  }

  function renderDetail() {
    const item = currentList[itemIndex] || null;
    if (item === lastRenderedItem) return; // avoid re-mounting the 3D viewer for no reason
    lastRenderedItem = item;

    if (disposeViewer) {
      disposeViewer();
      disposeViewer = null;
    }
    viewerEl.querySelectorAll("canvas").forEach((c) => c.remove());
    // A new item always starts un-expanded, even if the previous one was
    // mid-zoom when you switched away from it.
    setExpanded(false);

    if (!item) {
      renderInfoCard(null);
      return;
    }

    disposeViewer = mountModelViewer(
      viewerEl,
      item.model,
      item.viewerFitMargin,
      item.viewerStartOpposite,
      item.viewerStartAngle,
      item.viewerAnimationRange,
      setExpanded
    );
    renderInfoCard(item);
  }

  // The connector glyph never moves — it's fixed at the pane's vertical
  // center. Instead, the row stack itself slides under it so the active
  // row's center always lands on that fixed point, same as the game's
  // own list — always centered, even for the first/last row in a long
  // list (that just means blank space shows above/below it).
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
    // Only the category rail is shown at first; stepping right into the
    // item list expands the rest of the screen into view. Stepping back
    // left collapses it again — symmetric with how you got in.
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

  // Scrolling the category rail moves categoryIndex, same as the category
  // branch of moveSelection above — but unlike keyboard Up/Down while
  // categories has focus, this does NOT collapse the list/detail panes
  // back to rail-only. Clicking a category row already keeps them open
  // (jumps straight into "list" focus, previewing that category's items);
  // scrolling through categories should feel the same — a live preview of
  // whatever category you're currently on, not a collapse-then-reopen on
  // every tick.
  function scrollCategory(delta) {
    const next = Math.min(categories.length - 1, Math.max(0, categoryIndex + delta));
    if (next === categoryIndex) return;
    categoryIndex = next;
    currentList = itemsInCategory(categories[categoryIndex]);
    itemIndex = 0;
    focusPane = "list";
    render();
  }

  function scrollList(delta) {
    const next = Math.min(currentList.length - 1, Math.max(0, itemIndex + delta));
    if (next === itemIndex) return;
    itemIndex = next;
    focusPane = "list";
    render();
  }

  // Mouse-wheel / trackpad and touch-swipe scrolling over a pane moves the
  // selection up/down within it — the same effect as pressing Up/Down
  // while that pane has focus, just reachable without a keyboard. This
  // matters most on mobile/touch, where arrow keys aren't available and
  // the rows can look "scrollable" even though clicking was previously
  // the only way to move through them.
  function attachPaneScroll(paneEl, step) {
    let wheelCooldown = false;
    paneEl.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (wheelCooldown) return;
        const delta = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
        if (delta === 0) return;
        step(delta);
        // One step per "tick" of scrolling, rather than one step per pixel
        // of deltaY — a single trackpad/wheel gesture can report dozens of
        // small events, which would otherwise blow straight through the
        // whole list.
        wheelCooldown = true;
        setTimeout(() => {
          wheelCooldown = false;
        }, 120);
      },
      { passive: false }
    );

    let touchStartY = null;
    const TOUCH_STEP = 28; // px of swipe per row-step — tuned to feel like a deliberate flick, not a twitch
    paneEl.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    paneEl.addEventListener(
      "touchmove",
      (e) => {
        if (touchStartY === null) return;
        const y = e.touches[0].clientY;
        const dy = y - touchStartY;
        if (Math.abs(dy) < TOUCH_STEP) return;
        e.preventDefault();
        // Swiping up (finger moves up, dy < 0) reveals rows further down
        // the list, same convention as a native scroll — so that's "next".
        step(dy < 0 ? 1 : -1);
        touchStartY = y; // rebase so one long swipe can step multiple rows
      },
      { passive: false }
    );
    paneEl.addEventListener("touchend", () => {
      touchStartY = null;
    });
  }
  attachPaneScroll(categoryCol, scrollCategory);
  attachPaneScroll(listCol, scrollList);

  function onKeyDown(e) {
    // Let a focused editable field (a stat value or the description, in
    // edit mode) handle its own typing/arrow-key cursor movement — don't
    // let it also drive pane navigation underneath.
    if (e.target && e.target.isContentEditable) return;
    if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      toggleEditMode();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    // This view owns arrow keys fully while mounted — stop the global
    // handler in main.js from also seeing this same keypress. Without
    // this, when Items is the page's *initial* route (e.g. a direct
    // load/refresh on #/items), this listener ends up registered before
    // the global one, so a "step out to home" navigate() below already
    // lands on "home" before the global handler runs, and it then reacts
    // to *that* by navigating again on top of it.
    e.stopImmediatePropagation();
    switch (e.key) {
      case "ArrowDown":
        moveSelection(1);
        break;
      case "ArrowUp":
        moveSelection(-1);
        break;
      case "ArrowRight":
        if (focusPane === "categories") {
          focusPane = "list";
          render();
        }
        break;
      case "ArrowLeft":
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

  // Mount before the first render so glyph alignment can measure real,
  // laid-out row positions instead of a detached (zero-size) element.
  container.appendChild(el);
  render();

  // On a full page load straight into this route (a refresh or bookmark
  // on #/items, rather than clicking in from an already-loaded page),
  // the stylesheet/web fonts can still be mid-load at the instant
  // render() above runs its measurements — clientHeight reads 0 for a
  // moment, which silently skips centering and leaves the list pinned
  // at the top with no error. Re-run it once after the next paint, and
  // again once the custom fonts finish swapping in (row heights depend
  // on them), so it settles centered either way.
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
    if (disposeViewer) disposeViewer();
  };
}
