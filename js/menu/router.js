// Tiny hash router. No dependencies, no build config — just enough to
// switch between the compass home screen and the four section views,
// and to make the browser back/forward buttons behave.

const listeners = new Set();

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash === "" ? "home" : hash;
}

export function initRouter() {
  window.addEventListener("hashchange", () => {
    const route = currentRoute();
    listeners.forEach((fn) => fn(route));
  });
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function navigate(route) {
  const target = route === "home" ? "" : route;
  if (currentRoute() === (target || "home")) {
    // Already there — fire manually since hashchange won't.
    listeners.forEach((fn) => fn(currentRoute()));
    return;
  }
  window.location.hash = target;
}

export function getInitialRoute() {
  return currentRoute();
}

// Same as getInitialRoute — separate name so call sites that just want
// "what route am I on right now" (e.g. the global arrow-key handler)
// read clearly regardless of when they're called.
export function getCurrentRoute() {
  return currentRoute();
}
