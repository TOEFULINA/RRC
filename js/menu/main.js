import { BACKGROUND_IMAGE, COMPASS_DIRECTIONS, MAP_EXTERNAL_URL } from "./config.js";
import { initRouter, onRouteChange, navigate, getInitialRoute, getCurrentRoute } from "./router.js";
import { isPauseMenuOpen, setPauseMenuOpen } from "../pauseState.js";
import { renderCompassHome } from "./views/compassHome.js";
import { renderItemsView } from "./views/itemsView.js";
import { renderSkillsView } from "./views/skillsView.js";
import { renderMagicView } from "./views/magicView.js";
import { renderMapView } from "./views/mapView.js";

// bg-layer's --bg-image isn't set here anymore - the standalone
// compass site used a fixed BACKGROUND_IMAGE, but this ported copy
// sits behind the room instead: room's js/main.js sets --bg-image to
// a live snapshot of the room each time the pause menu opens (see
// pauseState.js's onPauseMenuChange subscriber there). Skills still
// swaps in its own nebula backdrop and restores whatever was here
// before, unchanged - see skillsView.js.

const routes = {
  home: renderCompassHome,
  items: renderItemsView,
  skills: renderSkillsView,
  magic: renderMagicView,
  map: renderMapView,
};

const app = document.getElementById("app");
let cleanup = () => {};

function render(route) {
  cleanup();
  app.innerHTML = "";
  const renderFn = routes[route] || routes.home;
  cleanup = renderFn(app) || (() => {});
}

initRouter();
onRouteChange(render);
render(getInitialRoute());

// ---------------------------------------------------------------------
// Global arrow-key navigation — the whole site is "direction oriented":
// from the compass, an arrow steps you out to that direction's section;
// from inside a section, the opposite arrow steps you back to the
// compass, same as walking out and back. This listener lives for the
// whole page (not per-view) so it works no matter where you are.
// ---------------------------------------------------------------------

const KEY_TO_DIR = {
  ArrowUp: "top",
  ArrowRight: "right",
  ArrowDown: "bottom",
  ArrowLeft: "left",
};
const OPPOSITE_DIR = { top: "bottom", bottom: "top", left: "right", right: "left" };

// route -> the compass direction that leads to it (e.g. "items" -> "right")
const ROUTE_TO_DIR = {};
Object.entries(COMPASS_DIRECTIONS).forEach(([dir, { key }]) => {
  ROUTE_TO_DIR[key] = dir;
});

document.addEventListener("keydown", (e) => {
  // This listener is always attached (module-level, like the
  // standalone compass site it was ported from) but only makes sense
  // while the pause menu is actually visible - otherwise arrow keys
  // would silently drive the compass around underneath the room.
  if (!isPauseMenuOpen()) return;
  const dir = KEY_TO_DIR[e.key];
  if (!dir) return;

  const current = getCurrentRoute();
  if (current === "home") {
    const targetKey = COMPASS_DIRECTIONS[dir].key;
    // Map returns you to the room instead of leaving the site (was:
    // an external link, in the standalone compass site this was
    // ported from - see compassHome.js's click handler for the same
    // change on click).
    if (targetKey === COMPASS_DIRECTIONS.bottom.key) {
      setPauseMenuOpen(false);
      return;
    }
    navigate(targetKey);
    return;
  }

  // Items and Magic each have their own internal panes (categories ->
  // list) and own their full arrow-key handling, including their own way
  // back to the compass — don't double-handle it here.
  if (current === "items" || current === "magic") return;

  const currentDir = ROUTE_TO_DIR[current];
  if (currentDir && OPPOSITE_DIR[currentDir] === dir) {
    navigate("home");
  }
});
