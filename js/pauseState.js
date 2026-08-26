// ---------------------------------------------------------------------------
// Shared open/closed state for the pause menu (js/menu/, the ported
// Skyrim-compass portfolio) — the one thing both room's js/main.js and the
// menu's js/menu/main.js need to agree on, kept in its own tiny module so
// neither side has to import the other's internals just to check it.
//
// Room's main.js owns *why* the menu opens/closes (Escape, the on-screen
// button, freezing WASD/OrbitControls, snapshotting the canvas) and calls
// setPauseMenuOpen() to make it official. The menu's own code (main.js's
// global arrow-key nav, compassHome.js's Map button) only ever needs to
// ask "am I open?" or say "close me" — isPauseMenuOpen()/setPauseMenuOpen()
// cover both without either side reaching into the other's state machine.
// ---------------------------------------------------------------------------

let open = false;
const listeners = new Set();

export function isPauseMenuOpen() {
  return open;
}

// Toggles the DOM hooks every stylesheet/script keys off of:
//   #pause-menu-root.open  — menu.css fades/reveals the ported compass UI
//   body.paused            — pause-bridge.css blurs #scene, hides the
//                             mobile WASD/cycle controls and the pause-open
//                             button while the menu is up
// then notifies anyone who registered via onPauseMenuChange (room's
// main.js, to freeze/resume movement and controls.enabled).
export function setPauseMenuOpen(next) {
  next = !!next;
  if (next === open) return;
  open = next;

  const root = document.getElementById("pause-menu-root");
  if (root) root.classList.toggle("open", open);
  document.body.classList.toggle("paused", open);

  listeners.forEach((fn) => fn(open));
}

// Returns an unsubscribe function, same convention as menu/router.js's
// onRouteChange, in case a caller ever needs to stop listening.
export function onPauseMenuChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
