/* ══════════════════════════════════════════════════════════════════
   mattOS Apps — the registry and loader for the bundled applications.

   Same idea as the Arcade: this file is metadata plus a loader, and
   every app is its own file in this folder, fetched the first time it
   is opened.  The desktop can therefore list every app in the Dock,
   Launchpad, Finder and Spotlight without downloading any of them.

     MATTAPPS.list            → metadata for every app
     MATTAPPS.get(id)         → one app's metadata
     MATTAPPS.load(id)        → Promise: fetch /apps/<id>.js once
     MATTAPPS.define(id, def)  → an app file registers itself
     MATTAPPS.preload(id)     → warm the cache (used on hover)

   An app definition is { body(), mount(body, id, node), unmount(node) }
   exactly like the apps written inline in index.html, so the window
   manager treats them identically.

   ── Add an app ────────────────────────────────────────────────────
   1. Write /apps/<id>.js:  MATTAPPS.define("<id>", { body, mount })
   2. Add one entry to LIST below.
   It then appears in Launchpad, the Finder, Spotlight, the Terminal
   (`open <id>`) and at mattlavergne.com/apps/<id>.
════════════════════════════════════════════════════════════════════ */
(function (global) {
"use strict";

/* the same squircle tile the rest of mattOS uses (kept local so the apps
   still work if the arcade engine is missing) */
function squircle(grad, inner, id) {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="ap${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
    <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#ap${id})"/>
    <rect x="6" y="6" width="88" height="44" rx="24" fill="rgba(255,255,255,.14)"/>${inner}</svg>`;
}

const ICONS = {
  calculator: squircle(["#4b5563", "#111827"],
    `<rect x="24" y="22" width="52" height="18" rx="4" fill="#fff"/>
     <text x="70" y="36" font-family="Helvetica,Arial" font-size="13" font-weight="700" fill="#111827" text-anchor="end">42</text>
     ${[0, 1, 2, 3].map(r => [0, 1, 2].map(c =>
      `<rect x="${24 + c * 14}" y="${46 + r * 8.5}" width="10" height="6" rx="2" fill="rgba(255,255,255,.85)"/>`).join("")).join("")}
     <rect x="66" y="46" width="10" height="32.5" rx="3" fill="#fb923c"/>`, "ca"),
  notes: squircle(["#fde68a", "#f59e0b"],
    `<rect x="26" y="22" width="48" height="56" rx="6" fill="#fff"/>
     <path d="M34 38h32M34 48h32M34 58h20" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
     <path d="M26 30h48" stroke="#fbbf24" stroke-width="3"/>`, "no"),
  clock: squircle(["#f8fafc", "#94a3b8"],
    `<circle cx="50" cy="50" r="27" fill="#fff" stroke="#0f172a" stroke-width="3"/>
     <path d="M50 32v19l13 8" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="50" cy="50" r="3" fill="#f97316"/>`, "cl"),
  weather: squircle(["#38bdf8", "#0284c7"],
    `<circle cx="40" cy="40" r="12" fill="#fde047"/>
     <path d="M34 66a12 12 0 0 1 1-24 16 16 0 0 1 30 4 10 10 0 0 1-2 20z" fill="#fff"/>
     <path d="M38 74l-3 7M50 74l-3 7M62 74l-3 7" stroke="#bae6fd" stroke-width="4" stroke-linecap="round"/>`, "we"),
  sketch: squircle(["#f472b6", "#7c3aed"],
    `<path d="M26 74l4-14 30-30 10 10-30 30z" fill="#fff"/>
     <path d="M60 30l6-6a5 5 0 0 1 7 0l3 3a5 5 0 0 1 0 7l-6 6z" fill="#fde047"/>
     <path d="M26 74l10-4-6-6z" fill="#94a3b8"/>`, "sk"),
  music: squircle(["#fb7185", "#be123c"],
    `<path d="M42 68V34l30-7v34" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
     <circle cx="36" cy="68" r="8" fill="#fff"/><circle cx="66" cy="61" r="8" fill="#fff"/>`, "mu"),
  achievements: squircle(["#fbbf24", "#b45309"],
    `<path d="M35 22h30v18a15 15 0 0 1-30 0z" fill="#fff"/>
     <path d="M35 26H26v6a10 10 0 0 0 10 10M65 26h9v6a10 10 0 0 1-10 10" fill="none" stroke="#fff" stroke-width="4"/>
     <rect x="44" y="55" width="12" height="12" fill="#fff"/><rect x="34" y="67" width="32" height="9" rx="3" fill="#fff"/>`, "ac"),
  trash: squircle(["#94a3b8", "#475569"],
    `<path d="M32 36h36M42 36v-5a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5M36 36l2 34a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5l2-34"
        fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`, "tr")
};

/* Metadata only.  `dock:true` puts it in the Dock; everything else lives
   in Launchpad, the Finder and Spotlight. */
const LIST = [
  { id: "calculator", title: "Calculator", tagline: "Ten digits and a grudge", icon: ICONS.calculator, w: 300, h: 452, dock: true },
  { id: "notes", title: "Notes", tagline: "A scratchpad that remembers", icon: ICONS.notes, w: 480, h: 460 },
  { id: "clock", title: "Clock", tagline: "World clock, stopwatch, timer", icon: ICONS.clock, w: 420, h: 480 },
  { id: "weather", title: "Weather", tagline: "Live conditions in Lafayette", icon: ICONS.weather, w: 400, h: 500 },
  { id: "sketch", title: "Sketch", tagline: "Draw something", icon: ICONS.sketch, w: 560, h: 480 },
  { id: "music", title: "Music", tagline: "Four chiptunes, synthesized live", icon: ICONS.music, w: 460, h: 430 },
  { id: "achievements", title: "Achievements", tagline: "Everything hidden in mattOS", icon: ICONS.achievements, w: 520, h: 560 }
];

const DEFS = {}, PENDING = {};
const byId = {};
LIST.forEach(a => { byId[a.id] = a; });

global.MATTAPPS = {
  base: "/apps/",
  list: LIST,
  icons: ICONS,
  get(id) { return byId[id] || null; },
  /* an app ships its own CSS; injected once, the first time it loads */
  style(id, css) {
    if (document.getElementById("app-css-" + id)) return;
    const s = document.createElement("style");
    s.id = "app-css-" + id;
    s.textContent = css;
    document.head.appendChild(s);
  },
  define(id, def) { DEFS[id] = def; },
  loaded(id) { return !!DEFS[id]; },
  load(id) {
    if (DEFS[id]) return Promise.resolve(DEFS[id]);
    if (PENDING[id]) return PENDING[id];
    PENDING[id] = new Promise((resolve, reject) => {
      if (!byId[id]) { reject(new Error("no such app: " + id)); return; }
      const s = document.createElement("script");
      s.src = global.MATTAPPS.base + id + ".js";
      s.async = true;
      s.onload = () => DEFS[id]
        ? resolve(DEFS[id])
        : reject(new Error("app '" + id + "' loaded but did not register"));
      s.onerror = () => { delete PENDING[id]; s.remove(); reject(new Error("could not load " + s.src)); };
      document.head.appendChild(s);
    });
    return PENDING[id];
  },
  preload(id) { if (byId[id]) global.MATTAPPS.load(id).catch(() => {}); }
};
})(window);
