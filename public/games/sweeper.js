/* ══════════════════════════════════════════════════════════════════
   Sweeper
   Minesweeper: numbers count the mines they touch, the first click is
   always safe, and flags mark what you are sure about.

   Right-click flags on a desktop; on a phone, long-press or the FLAG
   button under the board.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, rrect, FONT, COARSE, Sound } = MATTGAMES.util;

const COLS = 10, ROWS = 12, CELL = 32, MINES = 18;
const OX = 30, OY = 18;                       // board origin inside the field
const NUMCOL = ["", "#60a5fa", "#4ade80", "#f87171", "#a78bfa", "#fb923c", "#22d3ee", "#e2e8f0", "#94a3b8"];

function makeSweeper(g) {
  let mine, open, flag, near, started, done, won, t, cleared, pressC, pressR, pressT, longFired;

  const idx = (c, r) => r * COLS + c;
  const inside = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

  function reset() {
    mine = new Array(COLS * ROWS).fill(false);
    open = new Array(COLS * ROWS).fill(false);
    flag = new Array(COLS * ROWS).fill(false);
    near = new Array(COLS * ROWS).fill(0);
    started = false; done = false; won = false;
    t = 0; cleared = 0; longFired = false; pressT = 0;
    g.set("mines", MINES); g.set("time", "0:00");
  }

  /* mines are laid after the first click, so it can never be a mine */
  function layMines(sc, sr) {
    let placed = 0;
    while (placed < MINES) {
      const c = rnd(COLS), r = rnd(ROWS);
      if (mine[idx(c, r)]) continue;
      if (Math.abs(c - sc) <= 1 && Math.abs(r - sr) <= 1) continue;   // keep the opening clear
      mine[idx(c, r)] = true; placed++;
    }
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++)
            if ((dc || dr) && inside(c + dc, r + dr) && mine[idx(c + dc, r + dr)]) n++;
        near[idx(c, r)] = n;
      }
    started = true;
  }

  function reveal(c, r) {
    if (!inside(c, r) || done) return;
    const i = idx(c, r);
    if (open[i] || flag[i]) return;
    if (!started) layMines(c, r);
    open[i] = true;
    if (mine[i]) {
      done = true;
      Sound.bad();
      g.gameOver("Mine!", `You cleared ${cleared} of ${COLS * ROWS - MINES} safe squares.`);
      return;
    }
    cleared++;
    g.addScore(10);
    if (near[i] === 0) {                       // open the whole empty pocket
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dc || dr) reveal(c + dc, r + dr);
    }
    if (cleared === COLS * ROWS - MINES && !done) {
      done = true; won = true;
      const bonus = Math.max(0, 600 - Math.round(t) * 5);
      g.addScore(bonus);
      Sound.good();
      g.gameOver("Swept clean", `Every mine found in ${fmt(t)}. Time bonus ${bonus}.`);
    }
  }
  function toggleFlag(c, r) {
    if (!inside(c, r) || done) return;
    const i = idx(c, r);
    if (open[i]) return;
    flag[i] = !flag[i];
    g.set("mines", MINES - flag.filter(Boolean).length);
    Sound.play(flag[i] ? 620 : 300, 0.05, "square", 0.035);
  }
  const fmt = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  /* ── input: tap clears, right-click / long-press / FLAG mode marks ── */
  const cellAt = (x, y) => ({ c: Math.floor((x - OX) / CELL), r: Math.floor((y - OY) / CELL) });
  g.onPointer = (x, y, phase, ev) => {
    if (done) return;
    const { c, r } = cellAt(x, y);
    if (phase === "down") {
      pressC = c; pressR = r; pressT = Date.now(); longFired = false;
      if (ev && ev.button === 2) { toggleFlag(c, r); longFired = true; }   // right-click
      return;
    }
    if (phase === "up") {
      if (longFired) return;
      if (c !== pressC || r !== pressR) return;                            // dragged off
      if (Date.now() - pressT > 420) { toggleFlag(c, r); return; }         // long-press
      if (g.toggled || (ev && (ev.ctrlKey || ev.metaKey))) toggleFlag(c, r);
      else reveal(c, r);
    }
  };

  function update(dt) {
    if (!started || done) return;
    const was = Math.floor(t);
    t += dt;
    if (Math.floor(t) !== was) g.set("time", fmt(t));   // one HUD write per second
  }

  /* ── drawing ── */
  function draw() {
    const ctx = g.ctx;
    g.clear("#101a2e");
    ctx.font = FONT(800, 17);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = idx(c, r), x = OX + c * CELL, y = OY + r * CELL;
        if (open[i]) {
          ctx.fillStyle = mine[i] ? "#7f1d1d" : "rgba(2,6,18,.55)";
          rrect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 5); ctx.fill();
          if (mine[i]) {
            ctx.fillStyle = "#fecaca";
            ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 7, 0, 7); ctx.fill();
            ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + CELL / 2 - 11, y + CELL / 2); ctx.lineTo(x + CELL / 2 + 11, y + CELL / 2);
            ctx.moveTo(x + CELL / 2, y + CELL / 2 - 11); ctx.lineTo(x + CELL / 2, y + CELL / 2 + 11);
            ctx.stroke();
          } else if (near[i]) {
            ctx.fillStyle = NUMCOL[near[i]];
            ctx.fillText(String(near[i]), x + CELL / 2, y + CELL / 2 + 1);
          }
        } else {
          ctx.fillStyle = "#475d7d";
          rrect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 5); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.16)";
          rrect(ctx, x + 1, y + 1, CELL - 2, (CELL - 2) * 0.45, 5); ctx.fill();
          if (flag[i]) {
            ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 12, y + CELL - 8); ctx.stroke();
            ctx.fillStyle = "#f87171";
            ctx.beginPath();
            ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 23, y + 12.5); ctx.lineTo(x + 12, y + 17);
            ctx.closePath(); ctx.fill();
          }
          /* a mine you never found, shown once the board is over */
          if (done && !won && mine[i]) {
            ctx.fillStyle = "rgba(248,113,113,.55)";
            ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 6, 0, 7); ctx.fill();
          }
        }
      }

    ctx.fillStyle = "rgba(226,232,240,.45)";
    ctx.font = FONT(700, 11);
    ctx.fillText(g.toggled ? "FLAG MODE: taps place flags"
      : (COARSE ? "Tap to clear · long-press to flag" : "Click to clear · right-click to flag"),
      g.W / 2, g.H - 10);
  }

  reset();
  return { reset, update, draw };
}

MATTGAMES.define("sweeper", makeSweeper);
})();
