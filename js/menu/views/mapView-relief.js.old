import { renderTopNav } from "./topNav.js";
import { mountUsMap, PLACES } from "../three/usMap.js";

// The Map direction: a tilted 3D relief of the US with the places I've lived
// marked on it, the same shape as Skyrim's world map. Full-screen like Items
// and Skills — the top nav overlays it and RESUME sits in its usual corner,
// so this screen only owns the map itself and the readout under it.
export function renderMapView(container) {
  const el = document.createElement("div");
  el.className = "map-fullscreen";
  el.appendChild(renderTopNav("map"));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="map-stage"></div>
    <div class="map-readout">
      <div class="map-place rune">United States</div>
      <div class="map-hint">Drag to pan &middot; scroll to zoom &middot; click a marker</div>
    </div>
  `
  );

  container.appendChild(el);

  const stage = el.querySelector(".map-stage");
  const placeEl = el.querySelector(".map-place");
  const hintEl = el.querySelector(".map-hint");

  // mountUsMap measures its container, so it can only run once the element is
  // in the document AND has been laid out. A single requestAnimationFrame
  // wasn't enough — depending on how the router swaps screens, the stage can
  // still measure 0 on the next frame and the map silently never mounts.
  // Waiting for a real size is the reliable version.
  let disposeMap = () => {};
  let cancelled = false;
  (function mountWhenSized(tries = 0) {
    if (cancelled) return;
    if (stage.clientWidth > 1 && stage.clientHeight > 1) {
      disposeMap = mountUsMap(stage, {
      onSelect(place) {
        placeEl.textContent = place.name;
        // Travel isn't wired up yet — the other four rooms don't exist. Saying
        // so is better than a marker that silently does nothing.
        hintEl.textContent = `${place.region} · Travel unavailable`;
      },
      });
      return;
    }
    if (tries > 120) { // ~2s at 60fps; something else is wrong by then
      console.warn("map: stage never got a size, not mounting");
      return;
    }
    requestAnimationFrame(() => mountWhenSized(tries + 1));
  })();

  console.info(`map: ${PLACES.length} locations`);

  return () => { cancelled = true; disposeMap(); };
}
