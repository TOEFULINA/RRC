import { ABOUT_ME_CONTENT, PALETTE } from "./data.js?v=2026-08-08ap";
import { createInteractiveScreen } from "./screenCanvas.js?v=2026-08-08av";

// The desk computer's screen mesh gets its OWN CanvasTexture (built here)
// instead of showing whatever blank/placeholder material the model came
// with — same "draw a 2D scene onto a canvas, hand it to a texture" trick
// textures.js already uses for posters/vinyl, just interactive this time.
//
// See js/screenCanvas.js for why every draw pass goes through
// beginFrame()/commit() and why clicks get converted through pickHitbox()
// instead of straight UV math. The screen mesh's UVs were retopo'd in
// Blender to map this texture cleanly (no rotation needed), but the UV
// island runs edge-to-edge on this texture — texture filtering can sample
// a hair past that edge and pick up whatever's at the opposite edge, which
// reads as a thin distorted/bleeding line right at the screen's border.
// BORDER below insets all real content by a safe margin filled with a
// solid bezel color, so any of that edge-sampling bleed lands on a flat
// color instead of on drawn detail.
const WIDTH = 1024;
const HEIGHT = 640;
const BORDER = 14;

const screen = createInteractiveScreen(WIDTH, HEIGHT);
const ctx = screen.ctx;

let windowOpen = false;

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Same wrapping approach as textures.js's wrapText, but returns the lines
// (and how tall they ended up) instead of immediately drawing — the window
// layout below needs to know a paragraph's real height BEFORE it can decide
// where the next element starts.
function wrapLines(text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trim());
      line = w + " ";
    } else {
      line = test;
    }
  }
  lines.push(line.trim());
  return lines;
}

function drawWallpaper() {
  const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  g.addColorStop(0, "#5d7a9c");
  g.addColorStop(0.55, "#8ea9c9");
  g.addColorStop(1, PALETTE.accentCool);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // a few soft, low-opacity circles — quick "this is a wallpaper, not a
  // solid fill" cue, matching the abstract-shapes trick textures.js uses on
  // the placeholder album covers
  const blobs = [
    { x: 0.15, y: 0.2, r: 120 },
    { x: 0.82, y: 0.15, r: 90 },
    { x: 0.7, y: 0.78, r: 150 },
    { x: 0.25, y: 0.85, r: 100 },
  ];
  blobs.forEach((b) => {
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.arc(b.x * WIDTH, b.y * HEIGHT, b.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTaskbar() {
  const barH = 40;
  ctx.fillStyle = "rgba(20,18,26,0.55)";
  ctx.fillRect(0, HEIGHT - barH, WIDTH, barH);
  ctx.fillStyle = "#f5f0e6";
  ctx.font = "600 18px 'Space Grotesk', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("toefu_OS", 18, HEIGHT - barH / 2);
}

function drawDesktopIcon() {
  const iconX = 44;
  const iconY = 40;
  const iconSize = 84;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  roundRect(iconX, iconY, iconSize, iconSize, 16);
  ctx.fill();

  // simple globe glyph — circle + one vertical + one horizontal ellipse,
  // reads as "browser" at a glance without needing a real icon asset
  const cx = iconX + iconSize / 2;
  const cy = iconY + iconSize / 2 - 4;
  const r = 24;
  ctx.strokeStyle = "#2b2430";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.42, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#f5f0e6";
  ctx.font = "600 16px 'Archivo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Browser", iconX + iconSize / 2, iconY + iconSize + 8);
  ctx.textAlign = "left";

  screen.addHitbox(iconX - 8, iconY - 8, iconSize + 16, iconSize + 40, "openBrowser");
}

function drawTrafficLights(x, y) {
  const colors = ["#ff5f57", "#febc2e", "#28c840"];
  colors.forEach((c, i) => {
    ctx.beginPath();
    ctx.fillStyle = c;
    ctx.arc(x + i * 22, y, 7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBrowserWindow() {
  const margin = 36;
  const winX = margin;
  const winY = margin;
  const winW = WIDTH - margin * 2;
  const winH = HEIGHT - margin * 2;
  const titleH = 48;
  const addressH = 40;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#f5f0e6";
  roundRect(winX, winY, winW, winH, 14);
  ctx.fill();
  ctx.restore();

  // title bar
  ctx.save();
  ctx.beginPath();
  roundRect(winX, winY, winW, titleH, 14);
  ctx.clip();
  ctx.fillStyle = "#2b2430";
  ctx.fillRect(winX, winY, winW, titleH);
  ctx.restore();
  drawTrafficLights(winX + 22, winY + titleH / 2);
  ctx.fillStyle = "#e9e3d6";
  ctx.font = "600 16px 'Archivo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("About Me", winX + winW / 2, winY + titleH / 2);
  ctx.textAlign = "left";

  // the leftmost traffic-light dot (red) doubles as the real close button —
  // matches the mac-style chrome look while staying obvious to tap
  screen.addHitbox(winX + 14, winY + titleH / 2 - 12, 24, 24, "closeBrowser");

  // address bar
  const addrY = winY + titleH;
  ctx.fillStyle = "#d8d2c4";
  ctx.fillRect(winX, addrY, winW, addressH);
  ctx.fillStyle = "#ffffff";
  const pillX = winX + 20;
  const pillY = addrY + 7;
  const pillW = winW - 40;
  const pillH = addressH - 14;
  roundRect(pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = "#5a5348";
  ctx.font = "14px 'Archivo', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`🔒  ${ABOUT_ME_CONTENT.addressBar}`, pillX + 14, pillY + pillH / 2 + 1);

  // content
  const padX = winX + 40;
  let cy = addrY + addressH + 40;
  const contentW = winW - 80;

  // avatar + name/tagline row
  const avatarR = 34;
  ctx.beginPath();
  ctx.fillStyle = PALETTE.accentWarm;
  ctx.arc(padX + avatarR, cy + avatarR, avatarR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b2430";
  ctx.font = "700 30px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("L", padX + avatarR, cy + avatarR + 11);
  ctx.textAlign = "left";

  ctx.fillStyle = "#2b2430";
  ctx.font = "700 26px 'Space Grotesk', sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(ABOUT_ME_CONTENT.name, padX + avatarR * 2 + 18, cy + avatarR - 2);
  ctx.font = "500 16px 'Archivo', sans-serif";
  ctx.fillStyle = "#5a5348";
  ctx.fillText(
    `${ABOUT_ME_CONTENT.tagline} · ${ABOUT_ME_CONTENT.location}`,
    padX + avatarR * 2 + 18,
    cy + avatarR + 22
  );

  cy += avatarR * 2 + 26;

  // bio paragraphs
  ctx.font = "15px 'Archivo', sans-serif";
  ctx.fillStyle = "#332e28";
  const lineHeight = 22;
  ABOUT_ME_CONTENT.bio.forEach((para) => {
    const lines = wrapLines(para, contentW, "15px 'Archivo', sans-serif");
    lines.forEach((line) => {
      ctx.fillText(line, padX, cy);
      cy += lineHeight;
    });
    cy += 10;
  });

  cy += 6;
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.moveTo(padX, cy);
  ctx.lineTo(padX + contentW, cy);
  ctx.stroke();
  cy += 28;

  // link pills — hitboxes recorded at their exact drawn position/size
  let lx = padX;
  const pillHeight = 34;
  ABOUT_ME_CONTENT.links.forEach((link) => {
    ctx.font = "600 14px 'Archivo', sans-serif";
    const textW = ctx.measureText(link.label).width;
    const w = textW + 34;
    if (lx + w > padX + contentW) {
      lx = padX;
      cy += pillHeight + 12;
    }
    ctx.fillStyle = "#2b2430";
    roundRect(lx, cy, w, pillHeight, pillHeight / 2);
    ctx.fill();
    ctx.fillStyle = "#f5f0e6";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(link.label, lx + w / 2, cy + pillHeight / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    screen.addHitbox(lx, cy, w, pillHeight, { openUrl: link.url });
    lx += w + 12;
  });
}

function draw() {
  screen.beginFrame();

  // full-bleed bezel-safe fill first, THEN everything real gets drawn
  // inset by BORDER on every side — see the BORDER comment above. The
  // inset content is proportionally scaled to still fill exactly
  // WIDTH x HEIGHT of virtual space, so every drawing function below
  // (and every screen.addHitbox() call inside them) needs no changes —
  // addHitbox() reads the active transform itself, so clicks still line
  // up with whatever actually ends up on screen.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#14121a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.beginPath();
  ctx.rect(BORDER, BORDER, WIDTH - BORDER * 2, HEIGHT - BORDER * 2);
  ctx.clip();
  ctx.translate(BORDER, BORDER);
  ctx.scale((WIDTH - BORDER * 2) / WIDTH, (HEIGHT - BORDER * 2) / HEIGHT);

  drawWallpaper();
  if (windowOpen) {
    drawBrowserWindow();
  } else {
    drawDesktopIcon();
  }
  drawTaskbar();

  ctx.restore();
  screen.commit();
}

draw();

/**
 * Runs a raycast UV hit against whatever hitbox the last draw() actually
 * produced there (screenCanvas.js handles the UV -> logical-pixel
 * conversion, including this model's transposed screen UVs). Returns true
 * if the click hit something and changed the screen's state, so main.js
 * knows whether to treat this as "handled" (vs. falling through to the
 * normal exit-focus click).
 */
export function handleDesktopScreenClick(u, v) {
  const hit = screen.pickHitbox(u, v);
  if (!hit) return false;

  if (hit.action === "openBrowser") {
    windowOpen = true;
    draw();
    return true;
  }
  if (hit.action === "closeBrowser") {
    windowOpen = false;
    draw();
    return true;
  }
  if (hit.action && hit.action.openUrl) {
    // a real link tap — opens the actual site/resume/social in a new tab,
    // same as clicking a normal <a target="_blank">. Doesn't change what's
    // drawn, so no redraw needed.
    window.open(hit.action.openUrl, "_blank", "noopener");
    return true;
  }
  return false;
}

export function getDesktopScreenTexture() {
  return screen.texture;
}
