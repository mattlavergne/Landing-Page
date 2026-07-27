/* ══════════════════════════════════════════════════════════════════
   mattOS Arcade — the engine.

   No build step, no dependencies.  This file is the machinery only:
   the stage that every game runs on, plus the registry and the loader.
   The games themselves are one file each in this folder, and the list
   of them is /games/catalog.js.

   Load order on a page:  engine.js → catalog.js → (a game, on demand)

   The API:

     MATTGAMES.list             → metadata for every game (from catalog)
     MATTGAMES.get(id)          → one game's metadata
     MATTGAMES.best(id)         → this visitor's high score
     MATTGAMES.load(id)         → Promise: fetch /games/<id>.js once
     MATTGAMES.mount(id, host)  → build a playable instance inside an
                                  element; returns {destroy()}.  Loads
                                  the game file first if needed.
     MATTGAMES.define(id, fn)   → a game file registers itself
     MATTGAMES.util             → helpers shared with the game files

   A game factory receives the stage (`g`) and returns
   {reset(), update(dt), draw()}.  The stage handles the canvas and its
   scaling, the HUD, overlays, keyboard / swipe / on-screen controls,
   sound, high scores, pausing and teardown.
════════════════════════════════════════════════════════════════════ */
(function (global) {
"use strict";

/* ─────────────────────────── small helpers ─────────────────────────── */
const COARSE = matchMedia("(pointer: coarse)").matches;
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = n => Math.floor(Math.random() * n);
const FONT = (weight, size) =>
  `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (e) { /* private mode: scores just don't persist */ }
  return null;
}

/* rounded rectangle path that works everywhere (ctx.roundRect is newer) */
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ─────────────────────────── sound ───────────────────────────
   Short synthesized blips.  No files to download, and muting is
   remembered across visits and across both surfaces. */
const Sound = {
  ctx: null,
  on: store("mattos-arcade-sound") !== "off",
  toggle() {
    this.on = !this.on;
    store("mattos-arcade-sound", this.on ? "on" : "off");
    return this.on;
  },
  play(freq, dur, type, vol) {
    if (!this.on) return;
    try {
      if (!this.ctx) this.ctx = new (global.AudioContext || global.webkitAudioContext)();
      const c = this.ctx;
      if (c.state === "suspended") c.resume();
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(vol == null ? 0.05 : vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (dur || 0.08));
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + (dur || 0.08) + 0.02);
    } catch (e) { /* audio blocked: silence is fine */ }
  },
  blip() { this.play(660, 0.05, "square", 0.04); },
  good() { this.play(880, 0.09, "triangle", 0.05); setTimeout(() => this.play(1320, 0.09, "triangle", 0.04), 70); },
  bad() { this.play(180, 0.22, "sawtooth", 0.05); },
  pop() { this.play(420, 0.07, "sine", 0.06); }
};

/* ─────────────────────────── icons ───────────────────────────
   Game tiles are macOS-style squircles built by the catalog; this is
   the shared shape so every icon matches the mattOS app icons. */
function squircle(grad, inner, id) {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="ag${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
    <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#ag${id})"/>
    <rect x="6" y="6" width="88" height="44" rx="24" fill="rgba(255,255,255,.14)"/>${inner}</svg>`;
}

/* line icons for the HUD buttons */
const UI = {
  sound: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  muted: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>`,
  restart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 5v14M15 5v14"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>`,
  right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`
};

/* ─────────────────────────── styles ───────────────────────────
   Injected once.  Values fall back to sane defaults so the games
   look right on any host page, themed or not. */
const CSS = `
.ag{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;outline:none;
  font-family:var(--font,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);
  color:var(--text,#0f172a);-webkit-user-select:none;user-select:none}
.ag-hud{flex:none;display:flex;align-items:center;gap:14px;padding:9px 13px;
  border-bottom:1px solid var(--hairline,rgba(15,23,42,.08))}
.ag-stat{display:flex;flex-direction:column;line-height:1.15}
.ag-stat i{font-style:normal;font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:800;
  color:var(--text-3,rgba(15,23,42,.42))}
.ag-stat b{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.ag-sp{flex:1}
.ag-btn{all:unset;width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;color:var(--text-2,rgba(15,23,42,.62));background:var(--chip,rgba(15,23,42,.05));
  border:1px solid var(--panel-border,rgba(15,23,42,.06))}
.ag-btn:hover{background:var(--chip-hover,rgba(15,23,42,.09));color:var(--text,#0f172a)}
.ag-btn:active{transform:scale(.94)}
.ag-btn svg{width:17px;height:17px}
.ag-screen{position:relative;flex:1;min-height:0;overflow:hidden;background:#080c17}
.ag-screen canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.ag-ov{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;
  gap:9px;text-align:center;padding:20px;color:#fff;z-index:2;
  background:rgba(6,10,20,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.ag-ov.on{display:flex;animation:ag-fade .18s ease}
@keyframes ag-fade{from{opacity:0}to{opacity:1}}
.ag-ov h3{font-size:23px;font-weight:800;letter-spacing:-.02em;margin:0}
.ag-ov p{font-size:13.5px;line-height:1.6;color:rgba(255,255,255,.8);max-width:36ch;margin:0}
.ag-ov .ag-score{font-size:12.5px;color:rgba(255,255,255,.62);font-variant-numeric:tabular-nums}
.ag-play{all:unset;margin-top:4px;cursor:pointer;padding:12px 26px;border-radius:999px;font-size:14.5px;font-weight:800;
  background:linear-gradient(135deg,#60a5fa,#a855f7);color:#fff;box-shadow:0 12px 30px rgba(96,110,255,.42)}
.ag-play:active{transform:scale(.97)}
.ag-hint{font-size:11px;letter-spacing:.03em;color:rgba(255,255,255,.5);
  font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.ag-pad{flex:none;display:none;align-items:center;justify-content:center;gap:26px;
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));
  border-top:1px solid var(--hairline,rgba(15,23,42,.08))}
.ag-pad.on{display:flex}
.ag-dpad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,42px);gap:5px}
.ag-key{all:unset;display:flex;align-items:center;justify-content:center;border-radius:13px;cursor:pointer;
  background:var(--chip,rgba(15,23,42,.06));border:1px solid var(--panel-border,rgba(15,23,42,.07));
  color:var(--text-2,rgba(15,23,42,.62));touch-action:none;-webkit-tap-highlight-color:transparent}
.ag-key:active,.ag-key.down{background:var(--accent,#2563eb);color:#fff;transform:scale(.95)}
.ag-key svg{width:22px;height:22px}
.ag-dpad.tall{grid-template-rows:repeat(3,42px) 40px}
.ag-key.wide{grid-column:span 3;font-size:13px;font-weight:800;letter-spacing:.06em}
.ag-key.a{grid-area:4/1/5/4}
.ag-tapkey.ghost{background:var(--chip,rgba(15,23,42,.06));color:var(--text-2,rgba(15,23,42,.62));
  border:1px solid var(--panel-border,rgba(15,23,42,.08))}
.ag-tapkey.ghost.on{background:var(--accent,#2563eb);color:#fff}
.ag-loading{flex:1;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  font-size:13px;font-weight:600;color:var(--text-3,rgba(15,23,42,.42))}
.ag-loading.ag-err{color:var(--bad,#dc2626)}
.ag-loading b{font-size:14px}
.ag-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--chip,rgba(15,23,42,.08));
  border-top-color:var(--accent,#2563eb);animation:ag-spin .7s linear infinite}
@keyframes ag-spin{to{transform:rotate(360deg)}}
.ag-key.u{grid-area:1/2}.ag-key.l{grid-area:2/1}.ag-key.d{grid-area:2/2}.ag-key.r{grid-area:2/3}
.ag-tapkey{all:unset;display:flex;align-items:center;justify-content:center;cursor:pointer;
  min-width:160px;height:46px;border-radius:14px;font-size:14px;font-weight:800;letter-spacing:.06em;
  background:var(--accent,#2563eb);color:#fff;touch-action:none;-webkit-tap-highlight-color:transparent}
.ag-tapkey:active{transform:scale(.97)}
@media(max-width:380px){.ag-dpad{grid-template-columns:repeat(3,42px);grid-template-rows:repeat(3,38px)}}
`;

function injectCSS() {
  if (document.getElementById("mattgames-css")) return;
  const s = document.createElement("style");
  s.id = "mattgames-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ═══════════════════════ THE STAGE (shared shell) ═══════════════════════
   Every game gets: a scaled canvas with fixed logical coordinates, a HUD,
   an overlay for start / pause / game-over, keyboard + swipe + on-screen
   controls, high-score persistence, and correct teardown. */
function Stage(host, cfg) {
  injectCSS();

  const root = document.createElement("div");
  root.className = "ag";
  root.tabIndex = 0;
  const stats = (cfg.stats || ["score", "best"]).map(x =>
    typeof x === "string" ? { key: x, label: x === "best" ? "Best" : x[0].toUpperCase() + x.slice(1) } : x);
  root.innerHTML =
    `<div class="ag-hud">
       ${stats.map(s => `<div class="ag-stat"><i>${s.label}</i><b data-stat="${s.key}">0</b></div>`).join("")}
       <div class="ag-sp"></div>
       <button class="ag-btn" data-act="pause" title="Pause (P)" aria-label="Pause">${UI.pause}</button>
       <button class="ag-btn" data-act="sound" title="Sound" aria-label="Toggle sound">${Sound.on ? UI.sound : UI.muted}</button>
       <button class="ag-btn" data-act="restart" title="Restart (R)" aria-label="Restart">${UI.restart}</button>
     </div>
     <div class="ag-screen"><canvas></canvas>
       <div class="ag-ov on"><h3></h3><p></p><div class="ag-score"></div>
         <button class="ag-play">Play</button><div class="ag-hint"></div></div>
     </div>
     <div class="ag-pad"></div>`;
  host.appendChild(root);

  const screen = root.querySelector(".ag-screen");
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const ov = root.querySelector(".ag-ov");
  const pad = root.querySelector(".ag-pad");

  const W = cfg.w, H = cfg.h;                 // logical play-field size
  const bestKey = "mattos-arcade-" + cfg.id + "-best";
  let dpr = 1, scale = 1, ox = 0, oy = 0, cw = 0, ch = 0;

  let game = null;
  const api = {
    root, ctx, W, H,
    state: "ready",                            // ready | playing | paused | over
    score: 0,
    hold: 0,                                   // -1 / +1 while a left/right control is held
    toggled: false,                            // state of a "toggle" pad button
    best: +(store(bestKey) || 0) || 0,
    /* ── HUD ── */
    set(key, val) {
      const e = root.querySelector(`[data-stat="${key}"]`);
      if (e) e.textContent = val;
    },
    addScore(n) { api.score += n; api.set("score", api.score); },
    saveBest() {
      if (api.score > api.best) { api.best = api.score; store(bestKey, String(api.best)); }
      api.set("best", api.best);
      return api.best;
    },
    /* ── overlay ── */
    overlay(o) {
      if (!o) { ov.classList.remove("on"); return; }
      ov.querySelector("h3").textContent = o.title || "";
      ov.querySelector("p").innerHTML = o.msg || "";
      ov.querySelector(".ag-score").textContent = o.score || "";
      const btn = ov.querySelector(".ag-play");
      btn.textContent = o.btn || "Play";
      btn.style.display = o.btn === null ? "none" : "";
      ov.querySelector(".ag-hint").textContent =
        o.hint != null ? o.hint : (COARSE ? cfg.hintTouch || "" : cfg.hintKeys || "");
      ov.classList.add("on");
    },
    /* ── canvas ── */
    clear(fill) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "#0a1020"); g.addColorStop(1, "#05080f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
      if (fill !== false) {
        ctx.fillStyle = fill || "#0b1224";
        rrect(ctx, 0, 0, W, H, 10); ctx.fill();
      }
    },
    text(str, x, y, size, color, weight, align) {
      ctx.fillStyle = color || "#fff";
      ctx.font = FONT(weight || 700, size || 16);
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      ctx.fillText(str, x, y);
    },
    sound: Sound,
    rrect: (x, y, w, h, r) => rrect(ctx, x, y, w, h, r),
    /* filled by the game */
    onDir: null, onAction: null, onPointer: null, onKey: null
  };

  /* ── sizing: logical W×H letterboxed and centred in the screen ── */
  function fit() {
    const r = screen.getBoundingClientRect();
    if (!r.width || !r.height) return;
    cw = r.width; ch = r.height;
    dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = Math.min(cw / W, ch / H);
    ox = (cw - W * scale) / 2;
    oy = (ch - H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = true;
    if (game && game.draw) game.draw();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(screen);

  /* screen point → logical point */
  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left - ox) / scale, y: (ev.clientY - r.top - oy) / scale };
  }

  /* ── control plumbing ── */
  const DIRNAME = { "0,-1": "up", "0,1": "down", "-1,0": "left", "1,0": "right" };
  /* src is "key", "swipe", "pad" or "overlay": some games want to tell a
     thumb-swipe apart from a key press. */
  function dir(x, y, src) {
    if (api.state === "ready" || api.state === "over") { start(); }
    if (api.onDir) api.onDir(x, y, DIRNAME[x + "," + y], src);
  }
  function action(src) {
    if (api.state === "ready" || api.state === "over") { start(); return; }
    if (api.state === "paused") { resume(); return; }
    if (api.onAction) api.onAction(src);
  }

  /* keyboard (only while this game has focus, so several windows can be open) */
  const KEYDIR = {
    arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
    arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0]
  };
  function onKeyDown(e) {
    const k = (e.key || "").toLowerCase();
    if (KEYDIR[k]) {
      e.preventDefault();
      if (KEYDIR[k][1] === 0) api.hold = KEYDIR[k][0];   // paddle games steer while held
      dir(KEYDIR[k][0], KEYDIR[k][1], "key");
      return;
    }
    if (k === " " || k === "enter") { e.preventDefault(); action("key"); return; }
    if (k === "p") { e.preventDefault(); api.state === "paused" ? resume() : pause(); return; }
    if (k === "r") { e.preventDefault(); restart(); return; }
    if (api.onKey) api.onKey(k, e);
  }
  function onKeyUp(e) {
    const k = (e.key || "").toLowerCase();
    if (KEYDIR[k] && KEYDIR[k][1] === 0 && api.hold === KEYDIR[k][0]) api.hold = 0;
    if (api.onKeyUp) api.onKeyUp(k, e);
  }
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("keyup", onKeyUp);
  root.addEventListener("pointerdown", () => root.focus({ preventScroll: true }));

  /* pointer: swipes drive direction, taps drive action, drags drive paddles */
  let sx = 0, sy = 0, st = 0, moved = false, downId = null;
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    downId = e.pointerId; sx = e.clientX; sy = e.clientY; st = Date.now(); moved = false;
    try { canvas.setPointerCapture(downId); } catch (_) {}
    if (api.onPointer) { const p = toLogical(e); api.onPointer(p.x, p.y, "down", e); }
  });
  canvas.addEventListener("pointermove", e => {
    if (api.onPointer && downId !== null) { const p = toLogical(e); api.onPointer(p.x, p.y, "move", e); }
    if (downId === null || moved) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
    moved = true;
    if (cfg.swipe !== false) {
      if (Math.abs(dx) > Math.abs(dy)) dir(dx > 0 ? 1 : -1, 0, "swipe");
      else dir(0, dy > 0 ? 1 : -1, "swipe");
    }
  });
  function upHandler(e) {
    if (downId === null) return;
    try { canvas.releasePointerCapture(downId); } catch (_) {}
    downId = null;
    if (api.onPointer) { const p = toLogical(e); api.onPointer(p.x, p.y, "up", e); }
    if (!moved && Date.now() - st < 400) action("tap");
  }
  canvas.addEventListener("pointerup", upHandler);
  canvas.addEventListener("pointercancel", () => { downId = null; });
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  /* on-screen pad (touch devices) */
  if (cfg.pad === "dpad" || cfg.pad === "dpad+") {
    const extra = cfg.pad === "dpad+"
      ? `<button class="ag-key wide a" aria-label="${cfg.tapLabel || "Drop"}">${cfg.tapLabel || "DROP"}</button>` : "";
    pad.innerHTML = `<div class="ag-dpad${extra ? " tall" : ""}">
        <button class="ag-key u" aria-label="Up">${UI.up}</button>
        <button class="ag-key l" aria-label="Left">${UI.left}</button>
        <button class="ag-key d" aria-label="Down">${UI.down}</button>
        <button class="ag-key r" aria-label="Right">${UI.right}</button>
        ${extra}
      </div>`;
    const map = [[".u", 0, -1], [".l", -1, 0], [".d", 0, 1], [".r", 1, 0]];
    map.forEach(([sel, x, y]) => {
      const b = pad.querySelector(sel);
      b.addEventListener("pointerdown", e => { e.preventDefault(); b.classList.add("down"); dir(x, y, "pad"); });
      const off = () => b.classList.remove("down");
      b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off);
      b.addEventListener("pointercancel", off);
    });
    const act = pad.querySelector(".ag-key.a");
    if (act) act.addEventListener("pointerdown", e => { e.preventDefault(); action("pad"); });
  } else if (cfg.pad === "toggle") {
    /* a sticky mode button (Sweeper's flag); games read api.toggled */
    pad.innerHTML = `<button class="ag-tapkey ghost">${cfg.tapLabel || "MODE"}</button>`;
    const b = pad.querySelector(".ag-tapkey");
    b.addEventListener("pointerdown", e => {
      e.preventDefault();
      api.toggled = !api.toggled;
      b.classList.toggle("on", api.toggled);
      if (api.onToggle) api.onToggle(api.toggled);
    });
  } else if (cfg.pad === "lr") {
    pad.innerHTML = `<button class="ag-key l" style="width:74px;height:46px" aria-label="Left">${UI.left}</button>
                     <button class="ag-key r" style="width:74px;height:46px" aria-label="Right">${UI.right}</button>`;
    [[".l", -1], [".r", 1]].forEach(([sel, x]) => {
      const b = pad.querySelector(sel);
      const on = e => { e.preventDefault(); b.classList.add("down"); api.hold = x; dir(x, 0, "pad"); };
      const off = () => { b.classList.remove("down"); if (api.hold === x) api.hold = 0; };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off);
      b.addEventListener("pointercancel", off);
    });
  } else if (cfg.pad === "tap") {
    pad.innerHTML = `<button class="ag-tapkey">${cfg.tapLabel || "TAP"}</button>`;
    const b = pad.querySelector(".ag-tapkey");
    b.addEventListener("pointerdown", e => { e.preventDefault(); action("pad"); });
  }
  if (cfg.pad && cfg.pad !== "none" && COARSE) pad.classList.add("on");

  /* HUD buttons */
  root.querySelector('[data-act="restart"]').addEventListener("click", restart);
  root.querySelector('[data-act="pause"]').addEventListener("click", () => api.state === "paused" ? resume() : pause());
  const soundBtn = root.querySelector('[data-act="sound"]');
  soundBtn.addEventListener("click", () => {
    const on = Sound.toggle();
    soundBtn.innerHTML = on ? UI.sound : UI.muted;
    if (on) Sound.blip();
  });
  ov.querySelector(".ag-play").addEventListener("click", e => { e.stopPropagation(); action("overlay"); });
  ov.addEventListener("pointerdown", e => { if (e.target === ov) action("overlay"); });

  /* ── run states ── */
  function start() {
    api.score = 0; api.set("score", 0); api.set("best", api.best);
    api.state = "playing";
    api.overlay(null);
    if (game.reset) game.reset();
    root.focus({ preventScroll: true });
  }
  function restart() { start(); }
  function pause() {
    if (api.state !== "playing") return;
    api.state = "paused";
    api.overlay({ title: "Paused", msg: cfg.help || "", btn: "Resume", score: "Score " + api.score });
  }
  function resume() {
    if (api.state !== "paused") return;
    api.state = "playing"; api.overlay(null); root.focus({ preventScroll: true });
  }
  api.pause = pause;
  api.gameOver = (title, msg) => {
    api.state = "over";
    const best = api.saveBest();
    const isBest = api.score >= best && api.score > 0;
    api.overlay({
      title: title || "Game over",
      msg: msg || (isBest ? "New personal best." : ""),
      score: `Score ${api.score}  ·  Best ${best}`,
      btn: "Play again"
    });
    Sound.bad();
  };

  /* ── the loop ── */
  let raf = 0, prev = 0;
  game = cfg.make(api);
  api.set("best", api.best);
  api.overlay({
    title: cfg.name, msg: cfg.help || "",
    score: api.best ? "Best " + api.best : "",
    btn: "Play"
  });
  fit();

  function frame(t) {
    if (!root.isConnected) { destroy(); return; }          // window closed
    raf = requestAnimationFrame(frame);
    if (root.offsetParent === null && root.getClientRects().length === 0) { prev = t; return; } // minimized
    if (document.hidden) { prev = t; if (api.state === "playing") pause(); return; }
    let dt = (t - prev) / 1000;
    prev = t;
    if (!(dt > 0) || dt > 0.1) dt = dt > 0.1 ? 0.1 : 1 / 60;
    if (api.state === "playing" && game.update) game.update(dt);
    if (game.draw) game.draw();
  }
  raf = requestAnimationFrame(frame);

  let dead = false;
  function destroy() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    if (game.destroy) game.destroy();
    if (root.parentNode) root.parentNode.removeChild(root);
  }
  return { destroy, api, root };
}


/* ═══════════════════════ REGISTRY + LOADER ═══════════════════════
   The catalog (metadata for every game) is set by /games/catalog.js.
   A game's code is fetched the first time it is opened, and each file
   registers itself by calling define(). */
const DEFS = {};        // id -> factory, filled in by the game files
const PENDING = {};     // id -> in-flight load promise
let CATALOG = [];

function entry(id) {
  for (let i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
  return null;
}

const MG = {
  /* where the game files live; overridable if the arcade ever moves */
  base: "/games/",

  /* helpers the game files borrow, so a game only ever imports one thing */
  util: { COARSE, REDUCE, clamp, rnd, FONT, rrect, store, squircle, Sound },

  get list() { return CATALOG; },
  icons: {},                     // catalog.js fills this in (tiles for the UI)
  get(id) { return entry(id); },
  best(id) { return +(store("mattos-arcade-" + id + "-best") || 0) || 0; },
  sound: Sound,
  injectCSS,

  /* catalog.js hands over the list of games */
  setCatalog(list) { CATALOG = list.slice(); },

  /* a game file registers its factory */
  define(id, make) { DEFS[id] = make; },

  /* fetch a game's code once; resolves with its factory */
  load(id) {
    if (DEFS[id]) return Promise.resolve(DEFS[id]);
    if (PENDING[id]) return PENDING[id];
    PENDING[id] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = MG.base + id + ".js";
      s.async = true;
      s.onload = () => DEFS[id]
        ? resolve(DEFS[id])
        : reject(new Error("game '" + id + "' loaded but did not register"));
      s.onerror = () => { delete PENDING[id]; s.remove(); reject(new Error("could not load " + s.src)); };
      document.head.appendChild(s);
    });
    return PENDING[id];
  },

  /* warm the cache without caring about the result (used on hover) */
  preload(id) { if (entry(id)) MG.load(id).catch(() => {}); },

  /* Build a playable instance of `id` inside `host`.
     Returns {destroy(), ready} immediately; the game appears as soon as
     its file arrives, and destroy() is safe to call before that. */
  mount(id, host) {
    const def = entry(id);
    if (!def) return null;
    injectCSS();
    let stage = null, killed = false;

    const wait = document.createElement("div");
    wait.className = "ag-loading";
    wait.innerHTML = `<span class="ag-spin"></span><span>Loading ${def.name}…</span>`;
    host.appendChild(wait);
    const clearWait = () => { if (wait.parentNode) wait.parentNode.removeChild(wait); };

    const ready = MG.load(id).then(make => {
      clearWait();
      if (killed) return null;
      stage = Stage(host, {
        id: def.id, name: def.name, help: def.help,
        hintKeys: def.hintKeys, hintTouch: def.hintTouch,
        w: def.stage.w, h: def.stage.h,
        pad: def.stage.pad, tapLabel: def.stage.tapLabel, swipe: def.stage.swipe,
        stats: def.stats, make
      });
      return stage;
    }).catch(err => {
      clearWait();
      if (killed) return null;
      const oops = document.createElement("div");
      oops.className = "ag-loading ag-err";
      oops.innerHTML = `<b>${def.name} didn't load.</b><span>Check your connection, then try again.</span>`;
      host.appendChild(oops);
      if (global.console) console.error(err);
      return null;
    });

    return {
      ready,
      destroy() { killed = true; clearWait(); if (stage) stage.destroy(); }
    };
  }
};

global.MATTGAMES = MG;
})(window);
