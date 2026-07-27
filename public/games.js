/* ══════════════════════════════════════════════════════════════════
   mattOS Arcade — a tiny game engine plus five playable games.

   One file, no build step, no dependencies.  It is loaded by BOTH
   surfaces so there is a single copy of every game:

     • public/index.html  — the desktop: each game opens in its own
                            draggable mattOS window (Arcade app).
     • public/arcade.html — a standalone page for direct links and
                            phones, served at mattlavergne.com/arcade.

   Everything talks to one API:

     MATTGAMES.list            → metadata for every game
     MATTGAMES.get(id)         → one game's metadata
     MATTGAMES.mount(id, host) → build a playable instance inside an
                                 element; returns {destroy()}
     MATTGAMES.best(id)        → the visitor's high score (localStorage)

   Add a game: write a factory (see SNAKE below), then add one entry to
   GAMES at the bottom.  The shell, HUD, overlays, touch pad, high
   scores, sound, pausing and canvas scaling all come for free.
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
   macOS-style squircle tiles, matching the mattOS app icons. */
function squircle(grad, inner, id) {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="ag${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
    <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#ag${id})"/>
    <rect x="6" y="6" width="88" height="44" rx="24" fill="rgba(255,255,255,.14)"/>${inner}</svg>`;
}
const ICONS = {
  arcade: squircle(["#fb7185", "#c026d3"],
    `<rect x="24" y="38" width="52" height="34" rx="9" fill="#fff"/>
     <rect x="31" y="49" width="5" height="13" rx="2.5" fill="#c026d3"/><rect x="27" y="53" width="13" height="5" rx="2.5" fill="#c026d3"/>
     <circle cx="62" cy="52" r="4" fill="#fb7185"/><circle cx="70" cy="60" r="4" fill="#38bdf8"/>
     <path d="M38 38V30a12 12 0 0 1 24 0v8" fill="none" stroke="#fff" stroke-width="5"/>`, "ar"),
  snake: squircle(["#4ade80", "#15803d"],
    `<path d="M28 66h20a8 8 0 0 0 8-8V44a8 8 0 0 1 8-8h8" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="34" cy="34" r="6" fill="#fff"/>`, "sn"),
  chomper: squircle(["#fde047", "#f59e0b"],
    `<path d="M50 22a28 28 0 1 0 0 56 28 28 0 0 0 24-14L50 50l24-14A28 28 0 0 0 50 22z" fill="#fff"/>
     <circle cx="46" cy="36" r="4" fill="#f59e0b"/>`, "ch"),
  flap: squircle(["#38bdf8", "#2563eb"],
    `<ellipse cx="46" cy="52" rx="20" ry="17" fill="#fff"/><circle cx="55" cy="46" r="4" fill="#2563eb"/>
     <path d="M66 50l12-6v14z" fill="#fde047"/><path d="M30 52c6-9 16-9 20 0-6 8-15 8-20 0z" fill="#bae6fd"/>`, "fl"),
  bricks: squircle(["#a78bfa", "#6d28d9"],
    `<rect x="24" y="26" width="24" height="11" rx="3" fill="#fff"/><rect x="52" y="26" width="24" height="11" rx="3" fill="#fff" opacity=".75"/>
     <rect x="24" y="41" width="24" height="11" rx="3" fill="#fff" opacity=".75"/><rect x="52" y="41" width="24" height="11" rx="3" fill="#fff"/>
     <circle cx="50" cy="62" r="5" fill="#fde047"/><rect x="34" y="72" width="32" height="7" rx="3.5" fill="#fff"/>`, "br"),
  twenty48: squircle(["#fbbf24", "#ea580c"],
    `<rect x="24" y="24" width="24" height="24" rx="6" fill="#fff"/><rect x="52" y="24" width="24" height="24" rx="6" fill="#fff" opacity=".55"/>
     <rect x="24" y="52" width="24" height="24" rx="6" fill="#fff" opacity=".55"/><rect x="52" y="52" width="24" height="24" rx="6" fill="#fff"/>
     <text x="36" y="42" font-family="Helvetica,Arial" font-size="15" font-weight="700" fill="#ea580c" text-anchor="middle">2</text>
     <text x="64" y="70" font-family="Helvetica,Arial" font-size="15" font-weight="700" fill="#ea580c" text-anchor="middle">4</text>`, "tw")
};

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
.ag-key.wide{grid-column:span 3;font-size:13px;font-weight:800;letter-spacing:.04em}
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
  const stats = cfg.stats || [{ key: "score", label: "Score" }, { key: "best", label: "Best" }];
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
  function dir(x, y) {
    if (api.state === "ready" || api.state === "over") { start(); }
    if (api.onDir) api.onDir(x, y, DIRNAME[x + "," + y]);
  }
  function action() {
    if (api.state === "ready" || api.state === "over") { start(); return; }
    if (api.state === "paused") { resume(); return; }
    if (api.onAction) api.onAction();
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
      dir(KEYDIR[k][0], KEYDIR[k][1]);
      return;
    }
    if (k === " " || k === "enter") { e.preventDefault(); action(); return; }
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
    if (api.onPointer) { const p = toLogical(e); api.onPointer(p.x, p.y, "down"); }
  });
  canvas.addEventListener("pointermove", e => {
    if (api.onPointer && downId !== null) { const p = toLogical(e); api.onPointer(p.x, p.y, "move"); }
    if (downId === null || moved) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
    moved = true;
    if (cfg.swipe !== false) {
      if (Math.abs(dx) > Math.abs(dy)) dir(dx > 0 ? 1 : -1, 0);
      else dir(0, dy > 0 ? 1 : -1);
    }
  });
  function upHandler(e) {
    if (downId === null) return;
    try { canvas.releasePointerCapture(downId); } catch (_) {}
    downId = null;
    if (api.onPointer) { const p = toLogical(e); api.onPointer(p.x, p.y, "up"); }
    if (!moved && Date.now() - st < 400) action();
  }
  canvas.addEventListener("pointerup", upHandler);
  canvas.addEventListener("pointercancel", () => { downId = null; });
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  /* on-screen pad (touch devices) */
  if (cfg.pad === "dpad") {
    pad.innerHTML = `<div class="ag-dpad">
        <button class="ag-key u" aria-label="Up">${UI.up}</button>
        <button class="ag-key l" aria-label="Left">${UI.left}</button>
        <button class="ag-key d" aria-label="Down">${UI.down}</button>
        <button class="ag-key r" aria-label="Right">${UI.right}</button>
      </div>`;
    const map = [[".u", 0, -1], [".l", -1, 0], [".d", 0, 1], [".r", 1, 0]];
    map.forEach(([sel, x, y]) => {
      const b = pad.querySelector(sel);
      b.addEventListener("pointerdown", e => { e.preventDefault(); b.classList.add("down"); dir(x, y); });
      const off = () => b.classList.remove("down");
      b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off);
      b.addEventListener("pointercancel", off);
    });
  } else if (cfg.pad === "lr") {
    pad.innerHTML = `<button class="ag-key l" style="width:74px;height:46px" aria-label="Left">${UI.left}</button>
                     <button class="ag-key r" style="width:74px;height:46px" aria-label="Right">${UI.right}</button>`;
    [[".l", -1], [".r", 1]].forEach(([sel, x]) => {
      const b = pad.querySelector(sel);
      const on = e => { e.preventDefault(); b.classList.add("down"); api.hold = x; dir(x, 0); };
      const off = () => { b.classList.remove("down"); if (api.hold === x) api.hold = 0; };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off);
      b.addEventListener("pointercancel", off);
    });
  } else if (cfg.pad === "tap") {
    pad.innerHTML = `<button class="ag-tapkey">${cfg.tapLabel || "TAP"}</button>`;
    const b = pad.querySelector(".ag-tapkey");
    b.addEventListener("pointerdown", e => { e.preventDefault(); action(); });
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
  ov.querySelector(".ag-play").addEventListener("click", e => { e.stopPropagation(); action(); });
  ov.addEventListener("pointerdown", e => { if (e.target === ov) action(); });

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

/* ═══════════════════════════ GAME: SNAKE ═══════════════════════════ */
const COLS_S = 21, T_S = 20;
function makeSnake(g) {
  const N = COLS_S;
  let body, dir, queue, food, timer, step, grow, dead, pulse;

  function reset() {
    body = [{ x: 10, y: 12 }, { x: 10, y: 13 }, { x: 10, y: 14 }];
    dir = { x: 0, y: -1 }; queue = [];
    grow = 0; timer = 0; step = 0.135; dead = false; pulse = 0;
    placeFood();
  }
  function placeFood() {
    let p, tries = 0;
    do { p = { x: rnd(N), y: rnd(N) }; tries++; }
    while (tries < 300 && body.some(b => b.x === p.x && b.y === p.y));
    food = p;
  }
  g.onDir = (x, y) => {
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (x === -last.x && y === -last.y) return;      // no instant reversal
    if (x === last.x && y === last.y) return;
    if (queue.length < 3) queue.push({ x, y });
  };

  function update(dt) {
    timer += dt;
    if (timer < step) return;
    timer -= step;
    if (queue.length) dir = queue.shift();
    const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N ||
        body.some((b, i) => i < body.length - 1 && b.x === head.x && b.y === head.y)) {
      dead = true;
      g.gameOver("Game over", `You grew to ${body.length} segments.`);
      return;
    }
    body.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      g.addScore(10); grow += 2; pulse = 1;
      step = Math.max(0.062, step - 0.0035);
      Sound.pop();
      placeFood();
    }
    if (grow > 0) grow--; else body.pop();
  }

  function draw() {
    const ctx = g.ctx, S = T_S;
    g.clear("#0b1224");
    /* grid */
    ctx.strokeStyle = "rgba(148,163,184,.07)";
    ctx.lineWidth = 1;
    for (let i = 1; i < N; i++) {
      ctx.beginPath(); ctx.moveTo(i * S, 0); ctx.lineTo(i * S, N * S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * S); ctx.lineTo(N * S, i * S); ctx.stroke();
    }
    /* food */
    if (pulse > 0) pulse = Math.max(0, pulse - 0.05);
    const fr = S * 0.32 + pulse * 3;
    ctx.fillStyle = "#f87171";
    ctx.shadowColor = "rgba(248,113,113,.8)"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(food.x * S + S / 2, food.y * S + S / 2, fr, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    /* snake */
    body.forEach((b, i) => {
      const t = i / Math.max(1, body.length - 1);
      ctx.fillStyle = i === 0 ? "#86efac" : `rgb(${52 + t * 20},${211 - t * 70},${153 - t * 40})`;
      const p = i === 0 ? 1 : 2;
      rrect(ctx, b.x * S + p, b.y * S + p, S - p * 2, S - p * 2, i === 0 ? 7 : 5);
      ctx.fill();
    });
    /* eyes */
    const h = body[0];
    ctx.fillStyle = "#0b1224";
    const ex = h.x * S + S / 2 + dir.x * 3.5, ey = h.y * S + S / 2 + dir.y * 3.5;
    const px = dir.x ? 0 : 3.6, py = dir.y ? 0 : 3.6;
    ctx.beginPath(); ctx.arc(ex - px, ey - py, 2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + px, ey + py, 2, 0, 7); ctx.fill();
    if (dead) { ctx.fillStyle = "rgba(11,18,36,.35)"; ctx.fillRect(0, 0, N * S, N * S); }
  }
  reset();
  return { reset, update, draw };
}

/* ═══════════════════════════ GAME: CHOMPER ═══════════════════════════
   A Pac-Man-style maze chase: dots, power pellets, four ghosts with
   scatter / chase / frightened behaviour, a wrap-around tunnel, lives
   and levels. */
const MAZE = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "####.#.......#.####",
  "####.#.##-##.#.####",
  "####.##=====##.####",
  "      #=====#      ",
  "####.##=====##.####",
  "####.#########.####",
  "####....#.#....####",
  "####.###...###.####",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#..#.....#.....#..#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "###################"
];
const M_COLS = 19, M_ROWS = 21, T_M = 20, TUNNEL_ROW = 10;
const HOUSE = { c: 9, r: 10 };          // where eaten ghosts return to
const DIRS = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];

function makeChomper(g) {
  let grid, dots, player, ghosts, level, lives, mode, modeT, fright, frightChain,
      pauseT, mouth, flash, dying;

  function tile(c, r) {
    if (r < 0 || r >= M_ROWS) return "#";
    if (c < 0 || c >= M_COLS) return r === TUNNEL_ROW ? " " : "#";
    return grid[r][c];
  }
  /* who: 0 = player, 1 = ghost on the loose, 2 = ghost with house access
     (heading home as eyes, or climbing out of the house at the start). */
  function open(c, r, who) {
    const t = tile(c, r);
    if (t === "#") return false;
    if (t === "-" || t === "=") return who === 2;
    return true;
  }
  const access = gh => (gh.state === "eyes" || gh.state === "house") ? 2 : 1;

  function resetLevel(full) {
    if (full) grid = MAZE.map(r => r.split(""));
    dots = 0;
    grid.forEach(row => row.forEach(ch => { if (ch === "." || ch === "o") dots++; }));
    player = { x: 9 * T_M + T_M / 2, y: 13 * T_M + T_M / 2, dir: { x: -1, y: 0 }, want: { x: -1, y: 0 } };
    const corner = [{ c: 17, r: -2 }, { c: 1, r: -2 }, { c: 17, r: 22 }, { c: 1, r: 22 }];
    const kinds = ["blinky", "pinky", "inky", "clyde"];
    const colors = ["#ff5f57", "#f9a8d4", "#67e8f9", "#fdba74"];
    const spawn = [{ c: 9, r: 7 }, { c: 9, r: 10 }, { c: 8, r: 10 }, { c: 10, r: 10 }];
    ghosts = kinds.map((k, i) => ({
      kind: k, color: colors[i], corner: corner[i],
      x: spawn[i].c * T_M + T_M / 2, y: spawn[i].r * T_M + T_M / 2,
      dir: i === 0 ? { x: -1, y: 0 } : { x: 0, y: -1 },
      state: i === 0 ? "normal" : "house",
      release: i * 3.2, revive: 0
    }));
    mode = "scatter"; modeT = 0; fright = 0; frightChain = 0;
    pauseT = 0.7; mouth = 0; dying = 0;
  }
  function reset() {
    level = 1; lives = 3; flash = 0;
    resetLevel(true);
    g.set("level", level); g.set("lives", lives);
  }

  g.onDir = (x, y) => { player.want = { x, y }; };

  const speed = () => 82 + (level - 1) * 4;
  const gspeed = gh => gh.state === "eyes" ? 190
    : gh.state === "fright" ? 48
    : 74 + (level - 1) * 4 + (gh.kind === "blinky" && dots < 24 ? 10 : 0);

  /* move one entity, snapping to tile centres so turns feel right */
  function step(e, dist, decide, who) {
    while (dist > 0) {
      const c = Math.floor(e.x / T_M), r = Math.floor(e.y / T_M);
      const cx = c * T_M + T_M / 2, cy = r * T_M + T_M / 2;
      if (Math.abs(e.x - cx) < 0.6 && Math.abs(e.y - cy) < 0.6) {
        e.x = cx; e.y = cy;
        decide(e, c, r);
        if (!(e.dir.x || e.dir.y) || !open(c + e.dir.x, r + e.dir.y, who)) { e.dir = { x: 0, y: 0 }; return; }
      }
      const d = Math.min(dist, 1);
      e.x += e.dir.x * d; e.y += e.dir.y * d;
      dist -= d;
      const span = M_COLS * T_M;
      if (e.x < -T_M / 2) e.x += span + T_M;
      else if (e.x > span + T_M / 2) e.x -= span + T_M;
    }
  }

  function playerDecide(e, c, r) {
    if ((e.want.x || e.want.y) && open(c + e.want.x, r + e.want.y, 0)) e.dir = e.want;
  }
  function ghostTarget(gh, c, r) {
    if (gh.state === "eyes") return HOUSE;
    if (mode === "scatter") return gh.corner;
    const pc = Math.floor(player.x / T_M), pr = Math.floor(player.y / T_M);
    if (gh.kind === "blinky") return { c: pc, r: pr };
    if (gh.kind === "pinky") return { c: pc + player.dir.x * 4, r: pr + player.dir.y * 4 };
    if (gh.kind === "inky") {
      const b = ghosts[0];
      const bx = Math.floor(b.x / T_M), by = Math.floor(b.y / T_M);
      return { c: (pc + player.dir.x * 2) * 2 - bx, r: (pr + player.dir.y * 2) * 2 - by };
    }
    const d = Math.hypot(pc - c, pr - r);
    return d > 8 ? { c: pc, r: pr } : gh.corner;
  }
  function ghostDecide(gh, c, r) {
    /* climbing out of the house: line up under the door, then head up */
    if (gh.state === "house") {
      const doorX = 9 * T_M + T_M / 2;
      if (Math.abs(gh.x - doorX) > 1) { gh.dir = { x: Math.sign(doorX - gh.x), y: 0 }; return; }
      gh.x = doorX; gh.dir = { x: 0, y: -1 };
      if (r <= 7) { gh.state = "normal"; gh.dir = { x: rnd(2) ? 1 : -1, y: 0 }; }
      return;
    }
    if (gh.state === "eyes" && c === HOUSE.c && r === HOUSE.r) {
      gh.state = "house"; gh.release = 1.4; gh.dir = { x: 0, y: 0 }; return;
    }
    const who = access(gh);
    let opts = DIRS.filter(d => open(c + d.x, r + d.y, who) &&
      !(d.x === -gh.dir.x && d.y === -gh.dir.y));
    if (!opts.length) opts = DIRS.filter(d => open(c + d.x, r + d.y, who));
    if (!opts.length) { gh.dir = { x: 0, y: 0 }; return; }
    if (gh.state === "fright") { gh.dir = opts[rnd(opts.length)]; return; }
    const t = ghostTarget(gh, c, r);
    let best = opts[0], bd = Infinity;
    opts.forEach(d => {
      const dd = (c + d.x - t.c) ** 2 + (r + d.y - t.r) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    });
    gh.dir = best;
  }

  function loseLife() {
    lives--; g.set("lives", lives);
    Sound.bad();
    if (lives <= 0) {
      g.gameOver("Game over", `You cleared ${level > 1 ? level - 1 : 0} maze${level === 2 ? "" : "es"}.`);
      return;
    }
    resetLevel(false);      // same board, everyone back to their corners
  }

  function update(dt) {
    if (dying > 0) { dying -= dt; if (dying <= 0) loseLife(); return; }
    if (flash > 0) {
      flash -= dt;
      if (flash <= 0) { level++; g.set("level", level); resetLevel(true); }
      return;
    }
    if (pauseT > 0) { pauseT -= dt; return; }

    mouth += dt * 9;
    modeT += dt;
    if (fright > 0) {
      fright -= dt;
      if (fright <= 0) ghosts.forEach(gh => { if (gh.state === "fright") gh.state = "normal"; });
    } else {
      const span = mode === "scatter" ? 7 : 20;
      if (modeT > span) { mode = mode === "scatter" ? "chase" : "scatter"; modeT = 0; }
    }

    /* player */
    const pd = player.want;
    if (pd && pd.x === -player.dir.x && pd.y === -player.dir.y && (pd.x || pd.y)) player.dir = pd;
    step(player, speed() * dt, playerDecide, 0);

    /* dots */
    const pc = Math.floor(player.x / T_M), pr = Math.floor(player.y / T_M);
    const t = tile(pc, pr);
    if (t === "." || t === "o") {
      grid[pr][pc] = " "; dots--;
      if (t === "o") {
        g.addScore(50); fright = Math.max(2.5, 8 - level * 0.5); frightChain = 0;
        ghosts.forEach(gh => { if (gh.state === "normal") { gh.state = "fright"; gh.dir = { x: -gh.dir.x, y: -gh.dir.y }; } });
        Sound.good();
      } else { g.addScore(10); Sound.blip(); }
      if (dots === 0) { flash = 1.6; Sound.good(); return; }
    }

    /* ghosts */
    ghosts.forEach(gh => {
      if (gh.state === "house" && gh.release > 0) { gh.release -= dt; return; }
      step(gh, gspeed(gh) * dt, ghostDecide, access(gh));
      const d = Math.hypot(gh.x - player.x, gh.y - player.y);
      if (d < T_M * 0.72) {
        if (gh.state === "fright") {
          frightChain = Math.min(frightChain + 1, 4);
          g.addScore(200 * Math.pow(2, frightChain - 1));
          gh.state = "eyes"; Sound.good();
        } else if (gh.state === "normal") {
          dying = 1.2; Sound.bad();
        }
      }
    });
  }

  /* ── drawing ── */
  /* One wall tile, rounded only on its exposed corners, so a run of tiles
     reads as one continuous wall instead of a string of beads. */
  function wallPath(ctx, x, y, s, up, dn, lf, rt, r) {
    const tl = (!up && !lf) ? r : 0, tr = (!up && !rt) ? r : 0;
    const br = (!dn && !rt) ? r : 0, bl = (!dn && !lf) ? r : 0;
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + s - tr, y); if (tr) ctx.quadraticCurveTo(x + s, y, x + s, y + tr);
    ctx.lineTo(x + s, y + s - br); if (br) ctx.quadraticCurveTo(x + s, y + s, x + s - br, y + s);
    ctx.lineTo(x + bl, y + s); if (bl) ctx.quadraticCurveTo(x, y + s, x, y + s - bl);
    ctx.lineTo(x, y + tl); if (tl) ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  }
  const solid = (c, r) => tile(c, r) === "#";
  /* a wall tile with walls on all eight sides is never seen: leaving it unfilled
     turns thick blocks into hollow rings, the way arcade mazes are drawn */
  const buried = (c, r) => solid(c - 1, r) && solid(c + 1, r) && solid(c, r - 1) && solid(c, r + 1) &&
    solid(c - 1, r - 1) && solid(c + 1, r - 1) && solid(c - 1, r + 1) && solid(c + 1, r + 1);

  function drawMaze(ctx) {
    const flashing = fright > 0 && Math.floor(fright * 4) % 2 === 0;
    const wallA = flashing ? "#60a5fa" : "#2b4fd8";
    const wallTop = flashing ? "#bfdbfe" : "#5b83f5";
    /* the insides of thick blocks: dark, but clearly not a corridor */
    ctx.fillStyle = flashing ? "#1e3a8a" : "#131f45";
    ctx.beginPath();
    for (let r = 0; r < M_ROWS; r++)
      for (let c = 0; c < M_COLS; c++)
        if (grid[r][c] === "#" && buried(c, r)) ctx.rect(c * T_M, r * T_M, T_M, T_M);
    ctx.fill();
    /* every visible wall tile in ONE path, so shared edges fill seamlessly */
    ctx.fillStyle = wallA;
    ctx.beginPath();
    for (let r = 0; r < M_ROWS; r++)
      for (let c = 0; c < M_COLS; c++) {
        if (grid[r][c] !== "#" || buried(c, r)) continue;
        wallPath(ctx, c * T_M, r * T_M, T_M,
          solid(c, r - 1), solid(c, r + 1), solid(c - 1, r), solid(c + 1, r), 7);
      }
    ctx.fill();
    /* one lit strip along every exposed top edge */
    ctx.fillStyle = wallTop;
    ctx.beginPath();
    for (let r = 0; r < M_ROWS; r++)
      for (let c = 0; c < M_COLS; c++) {
        if (grid[r][c] !== "#" || solid(c, r - 1)) continue;
        const lf = solid(c - 1, r), rt = solid(c + 1, r), x = c * T_M;
        ctx.rect(x + (lf ? 0 : 5), r * T_M, T_M - (lf ? 0 : 5) - (rt ? 0 : 5), 2.5);
      }
    ctx.fill();

    for (let r = 0; r < M_ROWS; r++) {
      for (let c = 0; c < M_COLS; c++) {
        const t = grid[r][c];
        const x = c * T_M, y = r * T_M;
        if (t === "-") {
          ctx.fillStyle = "#f9a8d4";
          ctx.fillRect(x + 1, y + T_M / 2 - 1.5, T_M - 2, 3);
        } else if (t === ".") {
          ctx.fillStyle = "#fde68a";
          ctx.beginPath(); ctx.arc(x + T_M / 2, y + T_M / 2, 2.1, 0, 7); ctx.fill();
        } else if (t === "o") {
          const pulse = 3.6 + Math.sin(performance.now() / 170) * 1.3;
          ctx.fillStyle = "#fff7ed";
          ctx.shadowColor = "rgba(253,224,71,.9)"; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(x + T_M / 2, y + T_M / 2, pulse, 0, 7); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }
  function drawGhost(ctx, gh) {
    const R = T_M * 0.46, x = gh.x, y = gh.y;
    let body = gh.color;
    if (gh.state === "fright") body = fright < 2 && Math.floor(fright * 6) % 2 ? "#f8fafc" : "#3730a3";
    if (gh.state !== "eyes") {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y - 1, R, Math.PI, 0);
      ctx.lineTo(x + R, y + R * 0.85);
      for (let i = 0; i < 3; i++) {
        const w = (R * 2) / 3;
        ctx.quadraticCurveTo(x + R - w * (i + 0.5), y + R * 0.4, x + R - w * (i + 1), y + R * 0.85);
      }
      ctx.closePath(); ctx.fill();
    }
    /* eyes */
    const ex = gh.dir.x * 2, ey = gh.dir.y * 2;
    if (gh.state === "fright") {
      ctx.fillStyle = body === "#f8fafc" ? "#dc2626" : "#fff";
      [-3.4, 3.4].forEach(o => { ctx.beginPath(); ctx.arc(x + o, y - 2, 1.8, 0, 7); ctx.fill(); });
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) ctx[i ? "lineTo" : "moveTo"](x - 5 + i * 3.4, y + 4 + (i % 2 ? -1.6 : 1.6));
      ctx.stroke();
      return;
    }
    [-3.6, 3.6].forEach(o => {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(x + o, y - 2, 3.1, 3.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#1e3a8a";
      ctx.beginPath(); ctx.arc(x + o + ex, y - 2 + ey, 1.7, 0, 7); ctx.fill();
    });
  }
  function draw() {
    const ctx = g.ctx;
    g.clear("#05070f");
    drawMaze(ctx);
    /* player */
    const R = T_M * 0.44;
    const open01 = dying > 0 ? clamp(1 - dying / 1.2, 0, 1) : Math.abs(Math.sin(mouth)) * 0.9;
    const a = (dying > 0 ? 0.02 + open01 * 1.5 : 0.06 + open01 * 0.55);
    const face = Math.atan2(player.dir.y, player.dir.x) || (player.dir.x === 0 && player.dir.y === 0 ? 0 : 0);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(face);
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, dying > 0 ? R * (1 - open01 * 0.35) : R, a, Math.PI * 2 - a);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (dying <= 0) ghosts.forEach(gh => drawGhost(ctx, gh));

    if (flash > 0 && Math.floor(flash * 6) % 2) {
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fillRect(0, 0, M_COLS * T_M, M_ROWS * T_M);
    }
    if (pauseT > 0) g.text("READY", M_COLS * T_M / 2, M_ROWS * T_M - 10, 12, "#fde047", 800);
  }
  reset();
  return { reset, update, draw };
}

/* ═══════════════════════════ GAME: FLAP ═══════════════════════════ */
function makeFlap(g) {
  const W = g.W, H = g.H, GROUND = H - 46;
  let bird, pipes, speed, dead, tilt, scroll;

  function reset() {
    bird = { x: W * 0.29, y: H * 0.42, v: 0, r: 12 };
    pipes = []; speed = 118; dead = false; tilt = 0; scroll = 0;
    addPipe(W + 60); addPipe(W + 60 + 170);
  }
  function addPipe(x) {
    const gap = 132;
    const top = 46 + rnd(GROUND - gap - 110);
    pipes.push({ x, top, gap, w: 46, passed: false });
  }
  g.onAction = () => { if (!dead) { bird.v = -228; Sound.play(760, 0.06, "square", 0.035); } };
  g.onDir = (x, y) => { if (y < 0) g.onAction(); };

  function update(dt) {
    bird.v += 900 * dt;
    bird.y += bird.v * dt;
    tilt = clamp(bird.v / 480, -0.5, 1.1);
    scroll += speed * dt;

    speed = Math.min(190, 118 + g.score * 1.6);
    pipes.forEach(p => { p.x -= speed * dt; });
    if (pipes.length && pipes[pipes.length - 1].x < W - 168) addPipe(W + 20);
    if (pipes.length && pipes[0].x < -60) pipes.shift();

    pipes.forEach(p => {
      if (!p.passed && p.x + p.w < bird.x) { p.passed = true; g.addScore(1); Sound.pop(); }
      const inX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + p.w;
      const inY = bird.y - bird.r < p.top || bird.y + bird.r > p.top + p.gap;
      if (inX && inY) die();
    });
    if (bird.y + bird.r > GROUND) { bird.y = GROUND - bird.r; die(); }
    if (bird.y - bird.r < 0) { bird.y = bird.r; bird.v = 0; }
  }
  function die() {
    if (dead) return;
    dead = true;
    g.gameOver("Down you go", `You cleared ${g.score} pipe${g.score === 1 ? "" : "s"}.`);
  }

  function draw() {
    const ctx = g.ctx;
    g.clear(false);
    /* sky */
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0b2a55"); sky.addColorStop(0.55, "#1d4ed8"); sky.addColorStop(1, "#38bdf8");
    ctx.fillStyle = sky;
    rrect(ctx, 0, 0, W, H, 10); ctx.fill();
    ctx.save();
    rrect(ctx, 0, 0, W, H, 10); ctx.clip();

    /* parallax clouds */
    ctx.fillStyle = "rgba(255,255,255,.13)";
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 97 - scroll * 0.24) % (W + 120) + W + 120) % (W + 120) - 60;
      const cy = 46 + ((i * 53) % 150);
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, 7); ctx.arc(cx + 20, cy + 5, 15, 0, 7); ctx.arc(cx - 19, cy + 6, 13, 0, 7);
      ctx.fill();
    }
    /* pipes */
    pipes.forEach(p => {
      const grad = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      grad.addColorStop(0, "#16a34a"); grad.addColorStop(0.45, "#4ade80"); grad.addColorStop(1, "#15803d");
      ctx.fillStyle = grad;
      ctx.fillRect(p.x, 0, p.w, p.top);
      ctx.fillRect(p.x, p.top + p.gap, p.w, GROUND - p.top - p.gap);
      ctx.fillStyle = "#22c55e";
      rrect(ctx, p.x - 4, p.top - 15, p.w + 8, 15, 4); ctx.fill();
      rrect(ctx, p.x - 4, p.top + p.gap, p.w + 8, 15, 4); ctx.fill();
    });
    /* ground */
    ctx.fillStyle = "#166534";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(0, GROUND, W, 6);
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 8;
    for (let i = -1; i < W / 22 + 1; i++) {
      const x = i * 22 - (scroll % 22);
      ctx.beginPath(); ctx.moveTo(x, GROUND + 10); ctx.lineTo(x + 12, H); ctx.stroke();
    }
    /* bird */
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(tilt);
    ctx.fillStyle = "#fde047";
    ctx.beginPath(); ctx.ellipse(0, 0, bird.r + 3, bird.r, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    const flapA = dead ? 0.4 : Math.sin(performance.now() / 90) * 0.5;
    ctx.ellipse(-3, 2, 8, 5, flapA, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(6, -4, 4.2, 0, 7); ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.beginPath(); ctx.arc(7.4, -4, 2, 0, 7); ctx.fill();
    ctx.fillStyle = "#f97316";
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(21, 2.5); ctx.lineTo(12, 5.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    /* score */
    ctx.shadowColor = "rgba(3,10,26,.65)"; ctx.shadowBlur = 10;
    g.text(String(g.score), W / 2, 52, 40, "#fff", 800);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  reset();
  return { reset, update, draw };
}

/* ═══════════════════════════ GAME: BRICKS ═══════════════════════════ */
function makeBricks(g) {
  const W = g.W, H = g.H;
  const COLS = 9, ROWS = 6, BW = (W - 24) / COLS, BH = 17;
  const COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa"];
  let paddle, ball, bricks, lives, level, stuck, shake;

  function reset() { lives = 3; level = 1; g.set("lives", lives); g.set("level", level); build(); }
  function build() {
    paddle = { x: W / 2, w: 78, h: 12, y: H - 34 };
    bricks = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (!(level > 1 && (r + c) % (level + 2) === 0))
          bricks.push({ x: 12 + c * BW, y: 44 + r * (BH + 6), w: BW - 5, h: BH, c: COLORS[r % COLORS.length], hp: r < 1 && level > 2 ? 2 : 1 });
    resetBall();
  }
  function resetBall() {
    stuck = true; shake = 0;
    ball = { x: paddle.x, y: paddle.y - 12, r: 6.5, vx: 0, vy: 0, sp: 235 + level * 18 };
  }
  function launch() {
    if (!stuck) return;
    stuck = false;
    const a = (-Math.PI / 2) + (Math.random() * 0.7 - 0.35);
    ball.vx = Math.cos(a) * ball.sp; ball.vy = Math.sin(a) * ball.sp;
    Sound.blip();
  }
  g.onAction = launch;
  /* left/right are held rather than tapped: the stage tracks that in g.hold */
  g.onPointer = (x, _y, phase) => {
    if (phase === "down" || phase === "move") {
      paddle.x = clamp(x, paddle.w / 2, W - paddle.w / 2);
      if (stuck) ball.x = paddle.x;
    }
  };

  function update(dt) {
    /* held key or held on-screen button: smooth, continuous steering */
    if (g.hold) {
      paddle.x = clamp(paddle.x + g.hold * 340 * dt, paddle.w / 2, W - paddle.w / 2);
      if (stuck) ball.x = paddle.x;
    }
    if (shake > 0) shake -= dt;
    if (stuck) { ball.x = paddle.x; ball.y = paddle.y - 12; return; }

    /* substep so a fast ball can't tunnel through a brick */
    const steps = Math.ceil((Math.abs(ball.vx) + Math.abs(ball.vy)) * dt / 6) || 1;
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * sdt; ball.y += ball.vy * sdt;
      if (ball.x - ball.r < 4) { ball.x = 4 + ball.r; ball.vx = Math.abs(ball.vx); Sound.blip(); }
      if (ball.x + ball.r > W - 4) { ball.x = W - 4 - ball.r; ball.vx = -Math.abs(ball.vx); Sound.blip(); }
      if (ball.y - ball.r < 4) { ball.y = 4 + ball.r; ball.vy = Math.abs(ball.vy); Sound.blip(); }

      /* paddle */
      if (ball.vy > 0 && ball.y + ball.r > paddle.y && ball.y - ball.r < paddle.y + paddle.h &&
          ball.x > paddle.x - paddle.w / 2 - 4 && ball.x < paddle.x + paddle.w / 2 + 4) {
        const rel = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1);
        const a = -Math.PI / 2 + rel * 1.05;
        const sp = Math.min(ball.sp * 1.5, Math.hypot(ball.vx, ball.vy) * 1.02);
        ball.vx = Math.cos(a) * sp; ball.vy = Math.sin(a) * sp;
        ball.y = paddle.y - ball.r - 0.5;
        Sound.play(520, 0.05, "square", 0.04);
      }

      /* bricks */
      for (let i = 0; i < bricks.length; i++) {
        const b = bricks[i];
        if (ball.x + ball.r < b.x || ball.x - ball.r > b.x + b.w ||
            ball.y + ball.r < b.y || ball.y - ball.r > b.y + b.h) continue;
        const ox = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
        const oy = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
        if (ox < oy) ball.vx = -ball.vx; else ball.vy = -ball.vy;
        b.hp--;
        shake = REDUCE ? 0 : 0.12;
        if (b.hp <= 0) { bricks.splice(i, 1); g.addScore(10 * level); Sound.pop(); }
        else { g.addScore(5); Sound.blip(); }
        break;
      }

      if (ball.y - ball.r > H) {
        lives--; g.set("lives", lives);
        if (lives <= 0) { g.gameOver("Game over", `You cleared ${level - 1} full board${level === 2 ? "" : "s"}.`); return; }
        Sound.bad(); resetBall(); return;
      }
    }
    if (!bricks.length) {
      level++; g.set("level", level);
      g.addScore(100);
      Sound.good();
      build();
    }
  }

  function draw() {
    const ctx = g.ctx;
    g.clear("#0b1224");
    ctx.save();
    if (shake > 0) ctx.translate(rnd(3) - 1, rnd(3) - 1);
    /* frame */
    ctx.strokeStyle = "rgba(148,163,184,.25)"; ctx.lineWidth = 2;
    rrect(ctx, 3, 3, W - 6, H - 6, 9); ctx.stroke();
    /* bricks */
    bricks.forEach(b => {
      ctx.fillStyle = b.c;
      ctx.globalAlpha = b.hp > 1 ? 1 : 0.92;
      rrect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,.28)";
      rrect(ctx, b.x, b.y, b.w, b.h * 0.42, 4); ctx.fill();
      if (b.hp > 1) {
        ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.6;
        rrect(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 3); ctx.stroke();
      }
    });
    /* paddle */
    const grad = ctx.createLinearGradient(0, paddle.y, 0, paddle.y + paddle.h);
    grad.addColorStop(0, "#e2e8f0"); grad.addColorStop(1, "#94a3b8");
    ctx.fillStyle = grad;
    rrect(ctx, paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, 6); ctx.fill();
    /* ball */
    ctx.fillStyle = "#fde047";
    ctx.shadowColor = "rgba(253,224,71,.75)"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    if (stuck) g.text(COARSE ? "Tap to launch" : "Space to launch", W / 2, H - 62, 13, "rgba(255,255,255,.65)", 700);
    ctx.restore();
  }
  reset();
  return { reset, update, draw };
}

/* ═══════════════════════════ GAME: 2048 ═══════════════════════════ */
function make2048(g) {
  const N = 4, PAD = 10, SIZE = (g.W - PAD * (N + 1)) / N;
  const TCOL = {
    2: ["#eef2f7", "#475569"], 4: ["#e2e8f0", "#475569"], 8: ["#fbbf24", "#3b2a06"],
    16: ["#fb923c", "#fff"], 32: ["#f87171", "#fff"], 64: ["#ef4444", "#fff"],
    128: ["#60a5fa", "#fff"], 256: ["#3b82f6", "#fff"], 512: ["#a78bfa", "#fff"],
    1024: ["#8b5cf6", "#fff"], 2048: ["#34d399", "#06281c"]
  };
  let cells, anim, won, banner;

  function reset() {
    cells = [];
    for (let i = 0; i < N * N; i++) cells.push(0);
    anim = []; won = false; banner = 0;
    spawn(); spawn();
  }
  function spawn() {
    const free = [];
    cells.forEach((v, i) => { if (!v) free.push(i); });
    if (!free.length) return;
    const i = free[rnd(free.length)];
    cells[i] = Math.random() < 0.9 ? 2 : 4;
    anim.push({ i, t: 0, kind: "spawn" });
  }
  const at = (r, c) => cells[r * N + c];
  const put = (r, c, v) => { cells[r * N + c] = v; };

  function slide(dx, dy) {
    let moved = false, gained = 0;
    const order = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) order.push([r, c]);
    if (dx > 0) order.sort((a, b) => b[1] - a[1]);
    if (dy > 0) order.sort((a, b) => b[0] - a[0]);
    const merged = {};
    order.forEach(([r, c]) => {
      let v = at(r, c);
      if (!v) return;
      let nr = r, nc = c;
      while (true) {
        const tr = nr + dy, tc = nc + dx;
        if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
        const tv = at(tr, tc);
        if (tv === 0) { put(tr, tc, v); put(nr, nc, 0); nr = tr; nc = tc; moved = true; }
        else if (tv === v && !merged[tr * N + tc]) {
          put(tr, tc, v * 2); put(nr, nc, 0);
          merged[tr * N + tc] = true;
          gained += v * 2; moved = true;
          anim.push({ i: tr * N + tc, t: 0, kind: "merge" });
          if (v * 2 === 2048) won = true;
          break;
        } else break;
      }
    });
    if (gained) { g.addScore(gained); Sound.pop(); } else if (moved) Sound.blip();
    return moved;
  }
  function canMove() {
    if (cells.some(v => !v)) return true;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = at(r, c);
      if ((c < N - 1 && at(r, c + 1) === v) || (r < N - 1 && at(r + 1, c) === v)) return true;
    }
    return false;
  }
  g.onDir = (x, y) => {
    if (g.state !== "playing") return;
    if (slide(x, y)) {
      spawn();
      if (won && !banner) { banner = 3.4; Sound.good(); }   // celebrate, but let them keep playing
      if (!canMove()) g.gameOver("No moves left", "The board is full.");
    }
  };

  function update(dt) {
    anim = anim.filter(a => (a.t += dt * 5) < 1);
    if (banner > 0) banner -= dt;
  }

  function draw() {
    const ctx = g.ctx, W = g.W;
    g.clear("#141a2b");
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = PAD + c * (SIZE + PAD), y = PAD + r * (SIZE + PAD);
        ctx.fillStyle = "rgba(148,163,184,.10)";
        rrect(ctx, x, y, SIZE, SIZE, 10); ctx.fill();
        const v = at(r, c);
        if (!v) continue;
        const a = anim.find(z => z.i === r * N + c);
        let s = 1;
        if (a) s = a.kind === "spawn" ? 0.35 + 0.65 * a.t : 1 + Math.sin(a.t * Math.PI) * 0.12;
        const col = TCOL[v] || ["#0ea5e9", "#fff"];
        ctx.save();
        ctx.translate(x + SIZE / 2, y + SIZE / 2);
        ctx.scale(s, s);
        ctx.fillStyle = col[0];
        rrect(ctx, -SIZE / 2, -SIZE / 2, SIZE, SIZE, 10); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.18)";
        rrect(ctx, -SIZE / 2, -SIZE / 2, SIZE, SIZE * 0.4, 10); ctx.fill();
        const digits = String(v).length;
        ctx.fillStyle = col[1];
        ctx.font = FONT(800, digits > 3 ? 21 : digits > 2 ? 26 : 31);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(v), 0, 1);
        ctx.restore();
      }
    }
    const hintY = PAD * 2 + N * (SIZE + PAD) - PAD / 2;
    if (banner > 0) {
      ctx.globalAlpha = clamp(banner, 0, 1);
      g.text("2048! Keep going.", W / 2, hintY, 14, "#34d399", 800);
      ctx.globalAlpha = 1;
    } else {
      g.text(COARSE ? "Swipe to combine tiles" : "Arrow keys or WASD", W / 2, hintY, 12, "rgba(226,232,240,.45)", 700);
    }
  }
  reset();
  return { reset, update, draw };
}

/* ═══════════════════════════ REGISTRY ═══════════════════════════ */
const GAMES = [
  {
    id: "snake", name: "Snake", tagline: "Eat, grow, don't bite yourself",
    tags: ["Classic", "Arcade"], icon: ICONS.snake, w: 480, h: 600,
    stage: { w: COLS_S * T_S, h: COLS_S * T_S, pad: "dpad" },
    help: "Steer the snake into the food. Every bite makes you longer and a little faster. Walls and your own tail are fatal.",
    hintKeys: "Arrow keys / WASD  ·  P pauses  ·  R restarts",
    hintTouch: "Swipe anywhere, or use the pad below",
    make: makeSnake
  },
  {
    id: "chomper", name: "Chomper", tagline: "Clear the maze, dodge four ghosts",
    tags: ["Maze", "Arcade"], icon: ICONS.chomper, w: 480, h: 640,
    stage: { w: M_COLS * T_M, h: M_ROWS * T_M, pad: "dpad" },
    help: "Eat every dot to clear the maze. The four big pellets turn the ghosts blue: eat them for 200, 400, 800, 1600. The side tunnel wraps around.",
    hintKeys: "Arrow keys / WASD  ·  P pauses  ·  R restarts",
    hintTouch: "Swipe anywhere, or use the pad below",
    make: makeChomper
  },
  {
    id: "flap", name: "Flap", tagline: "One tap, endless pipes",
    tags: ["One-button", "Endless"], icon: ICONS.flap, w: 420, h: 640,
    stage: { w: 320, h: 480, pad: "tap", tapLabel: "FLAP", swipe: false },
    help: "Tap, click or press space to flap. Thread every gap. It speeds up the longer you last.",
    hintKeys: "Space / click to flap",
    hintTouch: "Tap the screen to flap",
    make: makeFlap
  },
  {
    id: "bricks", name: "Bricks", tagline: "Break every brick, keep the ball alive",
    tags: ["Paddle", "Classic"], icon: ICONS.bricks, w: 520, h: 620,
    stage: { w: 380, h: 440, pad: "lr", swipe: false },
    help: "Drag or steer the paddle, bounce the ball, and clear the wall. Each cleared board gets faster and gappier.",
    hintKeys: "Mouse, or ← → keys  ·  Space launches",
    hintTouch: "Drag the paddle  ·  Tap to launch",
    make: makeBricks
  },
  {
    id: "twenty48", name: "Twenty48", tagline: "Slide tiles, chase 2048",
    tags: ["Puzzle", "Numbers"], icon: ICONS.twenty48, w: 460, h: 580,
    stage: { w: 380, h: 418, pad: "dpad" },
    help: "Slide the board in any direction. Matching tiles merge and double. Reach 2048, then keep going.",
    hintKeys: "Arrow keys / WASD  ·  R restarts",
    hintTouch: "Swipe the board, or use the pad",
    make: make2048
  }
];

const byId = {};
GAMES.forEach(g => { byId[g.id] = g; });

global.MATTGAMES = {
  list: GAMES.map(g => ({
    id: g.id, name: g.name, tagline: g.tagline, tags: g.tags,
    icon: g.icon, help: g.help, w: g.w, h: g.h
  })),
  icons: ICONS,
  get: id => byId[id],
  best: id => +(store("mattos-arcade-" + id + "-best") || 0) || 0,
  sound: Sound,
  injectCSS,
  /* Build a playable instance of `id` inside `host`.  Returns {destroy}. */
  mount(id, host) {
    const def = byId[id];
    if (!def) return null;
    return Stage(host, {
      id: def.id, name: def.name, help: def.help,
      hintKeys: def.hintKeys, hintTouch: def.hintTouch,
      w: def.stage.w, h: def.stage.h,
      pad: def.stage.pad, tapLabel: def.stage.tapLabel,
      swipe: def.stage.swipe,
      stats: def.id === "chomper"
        ? [{ key: "score", label: "Score" }, { key: "best", label: "Best" }, { key: "level", label: "Maze" }, { key: "lives", label: "Lives" }]
        : def.id === "bricks"
          ? [{ key: "score", label: "Score" }, { key: "best", label: "Best" }, { key: "level", label: "Level" }, { key: "lives", label: "Balls" }]
          : [{ key: "score", label: "Score" }, { key: "best", label: "Best" }],
      make: def.make
    });
  }
};
})(window);
