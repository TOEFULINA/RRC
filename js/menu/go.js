import { navigate } from "./router.js";
import { setPauseMenuOpen } from "../pauseState.js";

// One place that turns a compass direction's `key` into an action.
//
// Three of the four keys are routes and just navigate. "explore" is not a
// screen at all — it is the way back into the room, so it closes the pause
// menu instead. Every entry point that can act on a direction (the compass
// points, the nav bar, the global arrow keys) goes through here, so there is
// no fourth place to forget when a direction changes what it does.
export function go(key) {
  if (key === "explore") {
    // Reset the route first: reopening the menu should land on the compass,
    // not on whatever screen happened to be up when you left.
    navigate("home");
    setPauseMenuOpen(false);
    return;
  }
  navigate(key);
}
