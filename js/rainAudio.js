// ---------------------------------------------------------------------------
// Rain, heard.
//
// Synthesised rather than a sample: filtered noise IS rain, acoustically, and
// generating it costs no download, never loops audibly, and can't be the wrong
// length. A loop point is the thing that gives cheap ambience away, and there
// isn't one here — the noise buffer is long and prime-ish against the gust
// modulation, so nothing lines back up in any span you'd sit through.
//
// Two bands, because real rain is two sounds: a low wash (the body of it, the
// part you feel through a window) and a high hiss (drops landing). Mixed and
// slowly swelled by a gust envelope so it breathes instead of sitting there.
//
// Browsers won't let audio start without a user gesture, so nothing is even
// constructed until the first click or keypress — before that this module is
// inert and silent, which is also the correct behaviour for someone who opened
// the page and hasn't decided to walk into the room yet.
// ---------------------------------------------------------------------------

const VOLUME = 0.055;      // master. Deliberately low — this is weather behind
                           // glass, not a rainstorm in the room.
const FADE_IN = 3.0;       // seconds to reach full volume, so it arrives
                           // rather than switching on
const NOISE_SECONDS = 7;   // buffer length

const LOW_CUTOFF = 520;    // Hz — the wash
const LOW_GAIN = 0.85;
const HISS_CENTRE = 2100;  // Hz — drops landing
const HISS_Q = 0.55;
const HISS_GAIN = 0.5;

// Gusts: a slow wander over the master gain. Two detuned LFOs rather than one,
// so the swell never settles into an obvious pulse.
const GUST_DEPTH = 0.34;
const GUST_HZ_A = 0.041;
const GUST_HZ_B = 0.017;

let ctx = null;
let master = null;
let started = false;
let muted = false;

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();

  const frames = ctx.sampleRate * NOISE_SECONDS;
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown-ish noise: white noise integrated with leak. Pure white is a hiss
  // with no weight to it; the low end here is what makes it read as water
  // rather than static.
  let last = 0;
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.022 * white) / 1.022;
    data[i] = last * 3.2 + white * 0.35;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = LOW_CUTOFF;
  const lowGain = ctx.createGain();
  lowGain.gain.value = LOW_GAIN;

  const hiss = ctx.createBiquadFilter();
  hiss.type = "bandpass";
  hiss.frequency.value = HISS_CENTRE;
  hiss.Q.value = HISS_Q;
  const hissGain = ctx.createGain();
  hissGain.gain.value = HISS_GAIN;

  // Gusts get their own stage BEFORE the master. Modulating the master
  // directly would mean a muted mix still wobbling either side of zero — an
  // LFO summed onto an AudioParam doesn't care that the param was ramped to
  // silence.
  const gust = ctx.createGain();
  gust.gain.value = 1;

  master = ctx.createGain();
  master.gain.value = 0;

  src.connect(low).connect(lowGain).connect(gust);
  src.connect(hiss).connect(hissGain).connect(gust);
  gust.connect(master);
  master.connect(ctx.destination);

  for (const [hz, depth] of [[GUST_HZ_A, GUST_DEPTH], [GUST_HZ_B, GUST_DEPTH * 0.6]]) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = hz;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    lfo.connect(amt).connect(gust.gain);
    lfo.start();
  }

  src.start();
  master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + FADE_IN);
  return true;
}

// Call once at startup. Arms a one-shot listener; the audio graph is built the
// first time the visitor touches anything.
export function initRainAudio() {
  const arm = () => {
    if (started) return;
    started = true;
    try {
      if (!build()) return;
      // Safari in particular can hand back a context that's already suspended.
      if (ctx.state === "suspended") ctx.resume();
      console.info("rain audio: on");
    } catch (err) {
      console.warn("rain audio: unavailable —", err);
    }
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(ev, arm, { once: true, passive: true });
  }
}

// Press M to silence it. Some people are listening to their own music, and a
// portfolio that talks over that is a portfolio you close.
export function toggleRainAudio() {
  if (!ctx || !master) return null;
  muted = !muted;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(muted ? 0 : VOLUME, ctx.currentTime + 0.35);
  return !muted;
}
