import { COMPASS_DIRECTIONS } from "../config.js";
import { navigate } from "../router.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// "Tuesday, 12:43, 25th of August" — mirrors the in-game date/time
// overlay from the reference screenshots (weekday, time, day-of-month).
function formatGameClock(date) {
  const weekday = WEEKDAYS[date.getDay()];
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const day = ordinal(date.getDate());
  const month = MONTHS[date.getMonth()];
  return `${weekday}, ${hh}:${mm}, ${day} of ${month}`;
}

// Slim persistent nav shown on every section screen so you can jump
// directly between Skills / Items / Map / Magic without going back
// through the compass every time.
export function renderTopNav(activeKey) {
  const nav = document.createElement("nav");
  nav.className = "top-nav";

  const home = document.createElement("button");
  home.className = "home-glyph";
  home.innerHTML = "&#10022;"; // small compass-ish glyph
  home.title = "Back to compass";
  home.addEventListener("click", () => navigate("home"));
  nav.appendChild(home);

  Object.values(COMPASS_DIRECTIONS).forEach((dir) => {
    const btn = document.createElement("button");
    btn.className = "rune" + (dir.key === activeKey ? " active" : "");
    btn.textContent = dir.label;
    btn.addEventListener("click", () => navigate(dir.key));
    nav.appendChild(btn);
  });

  const clock = document.createElement("div");
  clock.className = "nav-clock";
  nav.appendChild(clock);

  // Set the initial text right away — at this point `nav` hasn't been
  // attached to the document yet (the caller appends it after this
  // function returns), so isConnected would read false here.
  clock.textContent = formatGameClock(new Date());

  // Self-cleaning tick: each view mounts a fresh <nav>, so rather than
  // threading a destroy() call through every caller, the interval just
  // checks whether its own element is still in the document (true from
  // the second tick onward) and clears itself the first tick after it
  // isn't (at most ~1s of lingering timer per view switch).
  const timer = setInterval(() => {
    if (!nav.isConnected) {
      clearInterval(timer);
      return;
    }
    clock.textContent = formatGameClock(new Date());
  }, 1000);

  return nav;
}
