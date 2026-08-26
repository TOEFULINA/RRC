import { CONTACT_FORM_CONTENT, PALETTE } from "./data.js?v=2026-08-08ap";
import { createInteractiveScreen } from "./screenCanvas.js?v=2026-08-08av";

// The phone's screen mesh gets a mockup of the real "Commission
// Application" form from toefu888.com/contact. There's no real text-input
// system anywhere in this scene, so every field renders as a plain preview
// (not editable) — tapping anywhere on the form, or the Submit button
// specifically, opens the actual contact page in a new tab, same as tapping
// a link. See js/screenCanvas.js for why draws go through
// beginFrame()/commit() and clicks through pickHitbox() — this mesh is
// assumed to share the desk computer screen's transposed UV convention.
const WIDTH = 480; // portrait, like a real phone screen
const HEIGHT = 800;

const screen = createInteractiveScreen(WIDTH, HEIGHT);
const ctx = screen.ctx;

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStatusBar() {
  ctx.fillStyle = "#2b2430";
  ctx.font = "600 15px 'Archivo', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("9:41", 24, 18);
  // signal / wifi / battery glyphs — plain decorative shapes, just enough
  // to read as "phone status bar" at a glance
  ctx.fillRect(WIDTH - 46, 22, 3, 8);
  ctx.fillRect(WIDTH - 40, 19, 3, 11);
  ctx.fillRect(WIDTH - 34, 16, 3, 14);
  roundRect(WIDTH - 26, 19, 18, 10, 2);
  ctx.fill();
}

function drawField(label, x, y, w) {
  ctx.fillStyle = "#5a5348";
  ctx.font = "600 12px 'Archivo', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(label.toUpperCase(), x, y);
  const boxY = y + 20;
  const boxH = 38;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1.5;
  roundRect(x, boxY, w, boxH, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#b6ada0";
  ctx.font = "italic 13px 'Archivo', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("tap to fill out on the real site", x + 12, boxY + boxH / 2 + 1);
  return boxY + boxH;
}

function drawSocialIcon(cx, cy, label, bg) {
  ctx.beginPath();
  ctx.fillStyle = bg;
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 13px 'Archivo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function draw() {
  screen.beginFrame();

  // background
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, "#fbf7ee");
  g.addColorStop(1, "#f0e9da");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawStatusBar();

  const padX = 28;
  const fieldW = WIDTH - padX * 2;
  let y = 56;

  ctx.fillStyle = PALETTE.accentWarm;
  ctx.fillRect(0, y, WIDTH, 4);
  y += 22;

  ctx.fillStyle = "#2b2430";
  ctx.font = "700 22px 'Space Grotesk', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(CONTACT_FORM_CONTENT.heading, padX, y);
  y += 40;

  const formTop = y;
  CONTACT_FORM_CONTENT.fields.forEach((label) => {
    y = drawField(label, padX, y, fieldW) + 18;
  });

  // Submit button
  const btnH = 46;
  ctx.fillStyle = "#2b2430";
  roundRect(padX, y, fieldW, btnH, 23);
  ctx.fill();
  ctx.fillStyle = "#f5f0e6";
  ctx.font = "700 15px 'Archivo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(CONTACT_FORM_CONTENT.submitLabel, padX + fieldW / 2, y + btnH / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  screen.addHitbox(padX, y, fieldW, btnH, { openUrl: CONTACT_FORM_CONTENT.formUrl });
  const formBottom = y + btnH;
  y += btnH + 16;

  // the whole field block also opens the real form — a tap anywhere on the
  // preview should "just work" the same as the button itself, not only the
  // one exact button rect
  screen.addHitbox(padX, formTop, fieldW, formBottom - formTop, { openUrl: CONTACT_FORM_CONTENT.formUrl });

  ctx.fillStyle = "#5a5348";
  ctx.font = "italic 13px 'Archivo', sans-serif";
  ctx.fillText(CONTACT_FORM_CONTENT.footnote, padX, y);
  y += 34;

  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(padX + fieldW, y);
  ctx.stroke();
  y += 26;

  ctx.fillStyle = "#2b2430";
  ctx.font = "700 14px 'Archivo', sans-serif";
  ctx.fillText(CONTACT_FORM_CONTENT.otherInquiries.toUpperCase(), padX, y);
  y += 34;

  let sx = padX + 22;
  const socialColors = { Instagram: "#c23fa8", Twitter: "#111111" };
  const socialInitials = { Instagram: "IG", Twitter: "X" };
  CONTACT_FORM_CONTENT.links.forEach((link) => {
    drawSocialIcon(sx, y, socialInitials[link.label] || link.label[0], socialColors[link.label] || "#333");
    screen.addHitbox(sx - 22, y - 22, 44, 44, { openUrl: link.url });
    sx += 58;
  });

  screen.commit();
}

draw();

/**
 * Runs a raycast UV hit against whatever hitbox the last draw() actually
 * produced there (screenCanvas.js handles the UV -> logical-pixel
 * conversion). Returns true if the tap hit something, so main.js knows
 * whether to treat this as "handled" instead of exiting focus.
 */
export function handlePhoneScreenClick(u, v) {
  const hit = screen.pickHitbox(u, v);
  if (!hit) return false;
  if (hit.action && hit.action.openUrl) {
    window.open(hit.action.openUrl, "_blank", "noopener");
    return true;
  }
  return false;
}

export function getPhoneScreenTexture() {
  return screen.texture;
}
