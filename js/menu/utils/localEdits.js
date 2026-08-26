// Lightweight, no-backend "editor" for item stats/description.
//
// There's no server behind this site (static build on Vercel), so there's
// nowhere to actually persist an edit for every visitor. Instead: edits
// made in edit mode are saved to *your own browser's* localStorage and
// override the shipped data.js values only for you, on that device. When
// you're happy with what you've typed, hit "Copy changes" (or the C
// hotkey) to grab a plain-text summary of everything you've changed and
// paste it back into chat — from there it gets baked into items.js for
// real, for every visitor.
//
// Edit mode itself is toggled with the E key (see itemsView.js) — not
// hidden exactly, just not surfaced as a button, since it only ever
// affects the toggling browser's own local storage either way.

const EDITS_KEY = "skyrim-portfolio:item-edits:v1";
const EDIT_MODE_KEY = "skyrim-portfolio:edit-mode:v1";

const FIELD_LABELS = { year: "Year", value: "Value", weight: "Weight", description: "Description" };

function loadEdits() {
  try {
    return JSON.parse(localStorage.getItem(EDITS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveEdits(edits) {
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
  } catch {
    // localStorage unavailable (private mode, storage full, etc.) — edits
    // just won't persist across a refresh; not worth surfacing an error
    // for what's already a local-only convenience feature.
  }
}

export function isEditModeOn() {
  try {
    return localStorage.getItem(EDIT_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setEditModeStored(on) {
  try {
    localStorage.setItem(EDIT_MODE_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

// Reads the current value for one of an item's editable fields — your
// local override if you've typed one, otherwise whatever ships in
// items.js.
export function getFieldValue(item, field) {
  const edits = loadEdits();
  const itemEdits = edits[item.id];
  if (itemEdits && itemEdits[field] !== undefined) return itemEdits[field];
  if (field === "description") return item.description || "";
  const stat = (item.stats || []).find((s) => s.label.toLowerCase() === field);
  return stat ? stat.value : "";
}

export function setFieldValue(itemId, field, value) {
  const edits = loadEdits();
  if (!edits[itemId]) edits[itemId] = {};
  edits[itemId][field] = value;
  saveEdits(edits);
}

export function hasAnyEdits() {
  const edits = loadEdits();
  return Object.keys(edits).length > 0;
}

// Plain-text dump of everything currently overridden locally, meant to be
// copied and pasted back into chat so the edits can be applied to the
// real data file.
export function exportEditsText(items) {
  const edits = loadEdits();
  const ids = Object.keys(edits);
  if (!ids.length) return "";
  return ids
    .map((id) => {
      const item = items.find((i) => i.id === id);
      const name = item ? item.name : id;
      const fields = edits[id];
      const parts = Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${v}`);
      return `${name} (${id})\n  ${parts.join("\n  ")}`;
    })
    .join("\n\n");
}

export function clearAllEdits() {
  try {
    localStorage.removeItem(EDITS_KEY);
  } catch {
    // ignore
  }
}
