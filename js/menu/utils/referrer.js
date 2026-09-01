// Captured once at module load (this module is imported once, at app
// startup) rather than read fresh from document.referrer wherever it's
// needed — document.referrer reflects whichever page originally linked
// here and never changes as the hash router navigates between sections,
// but pinning it into a constant up front means the Back button below
// still targets that real inbound link even after the visitor has
// clicked around the site for a while.
const REFERRER = document.referrer;

// The site this room is linked from. Used to be derived from config's
// MAP_EXTERNAL_URL, which went away when the compass's Map point stopped being
// an external shop link and became the actual map screen.
const TOEFULINA_HOST = "toefulina.com";

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// True only if this visit was actually linked in from toefulina.com (or a
// subdomain of it) — not merely if their site happens to be mentioned
// somewhere in the referrer string.
export function cameFromToefulina() {
  const host = hostOf(REFERRER);
  return host === TOEFULINA_HOST || host.endsWith(`.${TOEFULINA_HOST}`);
}

export function goBackToReferrer() {
  if (REFERRER) window.location.href = REFERRER;
}
