/* ══════════════════════════════════════════════════════════════════
   Twenty48
   Slide tiles, chase 2048.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, clamp, rrect, FONT, COARSE, Sound } = MATTGAMES.util;

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
MATTGAMES.define("twenty48", make2048);
})();
