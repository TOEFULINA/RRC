// Shrinks an element's font-size (and, as a last resort, letter-spacing)
// just enough that its text content fits on a single line within its own
// box — used for the ornate name plate on item/spell detail cards, where a
// long name (e.g. "Deco Majora's Mask Case") would otherwise wrap to a
// second line and break the panel's fixed layout.
//
// Call this AFTER setting the element's textContent/innerHTML and after
// it's attached to the DOM with real layout (so scrollWidth/clientWidth
// are meaningful). Safe to call every render — it always resets to the
// CSS-authored size first, so it never compounds shrinkage from a
// previously-rendered (longer) name.
export function fitTextToOneLine(el, { minFontSizePx = 9, stepPx = 0.5 } = {}) {
  if (!el) return;

  el.style.fontSize = "";
  el.style.letterSpacing = "";

  let size = parseFloat(getComputedStyle(el).fontSize);
  let guard = 0;
  while (el.scrollWidth > el.clientWidth + 0.5 && size > minFontSizePx && guard < 200) {
    size -= stepPx;
    el.style.fontSize = `${size}px`;
    guard++;
  }

  // Still overflowing at the size floor (an extreme edge case) — squeeze
  // letter-spacing a little rather than let it wrap or spill out.
  guard = 0;
  while (el.scrollWidth > el.clientWidth + 0.5 && guard < 20) {
    const current = parseFloat(getComputedStyle(el).letterSpacing) || 0;
    el.style.letterSpacing = `${current - 0.2}px`;
    guard++;
  }
}
