// ---------------------------------------------------------------------------
// Virtual joystick for touch, replacing the old 4-button WASD d-pad.
//
// Unlike the d-pad (which could only say "forward: yes/no"), this reports a
// direction AND a magnitude, so you can ease into a slow walk or push for
// full speed, and move diagonally without pressing two things at once.
//
// It reports state only — it doesn't move the camera. main.js reads
// getJoystickVector() inside its own walk step, so collision handling and
// speed stay in exactly one place regardless of input device.
// ---------------------------------------------------------------------------

// x = strafe (+right), y = forward (+forward). Length 0..1.
const vec = { x: 0, y: 0 };
let active = false;

export function getJoystickVector() {
  return vec;
}
export function isJoystickActive() {
  return active;
}

export function initJoystick({ onStart } = {}) {
  const base = document.getElementById("joystick");
  const knob = document.getElementById("joystick-knob");
  if (!base || !knob) return;

  // How far (px) the knob can travel from centre before clamping. Also the
  // distance that counts as full speed.
  const MAX_RADIUS = 46;
  // Ignore the very centre so resting a thumb doesn't creep the camera.
  const DEAD_ZONE = 6;

  let pointerId = null;
  let originX = 0;
  let originY = 0;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function reset() {
    pointerId = null;
    active = false;
    vec.x = 0;
    vec.y = 0;
    setKnob(0, 0);
    base.classList.remove("active");
  }

  function start(e) {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    base.setPointerCapture(pointerId);
    active = true;
    base.classList.add("active");

    // Anchor to the centre of the base, so the knob tracks the thumb
    // relative to a fixed origin rather than wherever the first touch landed.
    const r = base.getBoundingClientRect();
    originX = r.left + r.width / 2;
    originY = r.top + r.height / 2;

    if (onStart) onStart();
    move(e);
  }

  function move(e) {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();

    let dx = e.clientX - originX;
    let dy = e.clientY - originY;
    const dist = Math.hypot(dx, dy);

    if (dist > MAX_RADIUS) {
      dx = (dx / dist) * MAX_RADIUS;
      dy = (dy / dist) * MAX_RADIUS;
    }
    setKnob(dx, dy);

    if (dist < DEAD_ZONE) {
      vec.x = 0;
      vec.y = 0;
      return;
    }

    // Normalize to 0..1 of MAX_RADIUS. Screen Y grows downward but pushing
    // the stick UP should walk FORWARD, hence the negation.
    vec.x = dx / MAX_RADIUS;
    vec.y = -dy / MAX_RADIUS;
  }

  function end(e) {
    if (e.pointerId !== pointerId) return;
    reset();
  }

  base.addEventListener("pointerdown", start);
  base.addEventListener("pointermove", move);
  base.addEventListener("pointerup", end);
  base.addEventListener("pointercancel", end);
  base.addEventListener("contextmenu", (e) => e.preventDefault());
  // A pointer lost for any other reason (tab hidden, gesture stolen by the
  // browser) would otherwise leave the stick stuck on and the camera drifting.
  window.addEventListener("blur", reset);

  setKnob(0, 0);
}
