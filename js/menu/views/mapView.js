import { renderTopNav } from "./topNav.js";

// Placeholder — content for this direction isn't decided yet.
export function renderMapView(container) {
  const el = document.createElement("div");
  el.className = "section-screen";
  el.appendChild(renderTopNav("map"));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="section-content">
      <h1 class="section-title rune">Map</h1>
      <div class="placeholder-panel panel">
        <p>Not decided yet. Could become a literal site map/contact page, a timeline
        of work, or something more literal (an actual illustrated map). Ready for
        content whenever you land on an idea.</p>
      </div>
    </div>
  `
  );

  container.appendChild(el);
  return () => {};
}
