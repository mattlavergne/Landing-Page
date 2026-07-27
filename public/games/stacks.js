/* ══════════════════════════════════════════════════════════════════
   Stacks
   Falling blocks, clean lines: rotate the seven pieces, fill rows,
   clear up to four at a time.  Speeds up every ten rows.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, rrect, FONT, Sound } = MATTGAMES.util;

const COLS = 10, ROWS = 20, CELL = 22;
const BX = 10, BY = 22;                       // board origin inside the field
const PANEL = BX + COLS * CELL + 12;          // "next" panel starts here

/* the seven tetrominoes, each in its own colour */
const PIECES = [
  { c: "#22d3ee", m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },  // I
  { c: "#60a5fa", m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },                         // J
  { c: "#fb923c", m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },                         // L
  { c: "#fbbf24", m: [[1, 1], [1, 1]] },                                          // O
  { c: "#4ade80", m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },                         // S
  { c: "#a78bfa", m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },                         // T
  { c: "#f87171", m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] }                          // Z
];
const CLEAR_SCORE = [0, 100, 300, 500, 800];
const spin = m => m[0].map((_, i) => m.map(row => row[i]).reverse());

function makeStacks(g) {
  let board, cur, nextI, dropT, gravity, lines, level, held, repeat, flashRows, flashT;

  function reset() {
    board = [];
    for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(0));
    lines = 0; level = 1; gravity = 0.8; dropT = 0;
    flashRows = []; flashT = 0; repeat = 0;
    nextI = rnd(PIECES.length);
    g.set("lines", 0); g.set("level", 1);
    spawn();
  }

  function spawn() {
    const p = PIECES[nextI];
    nextI = rnd(PIECES.length);
    cur = { m: p.m.map(r => r.slice()), c: p.c, x: Math.floor((COLS - p.m[0].length) / 2), y: 0 };
    if (hits(cur.m, cur.x, cur.y)) {
      cur = null;
      g.gameOver("Stack topped out", `You cleared ${lines} row${lines === 1 ? "" : "s"}.`);
    }
  }

  function hits(m, px, py) {
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const x = px + c, y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board[y][x]) return true;
      }
    return false;
  }

  function move(dx) {
    if (!cur || hits(cur.m, cur.x + dx, cur.y)) return;
    cur.x += dx; Sound.play(320, 0.03, "square", 0.025);
  }
  function rotate() {
    if (!cur) return;
    const m = spin(cur.m);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!hits(m, cur.x + kick, cur.y)) {
        cur.m = m; cur.x += kick;
        Sound.play(520, 0.04, "square", 0.03);
        return;
      }
    }
  }
  function softDrop() {
    if (!cur) return;
    if (hits(cur.m, cur.x, cur.y + 1)) { lock(); return; }
    cur.y++; g.addScore(1); dropT = 0;
  }
  function hardDrop() {
    if (!cur) return;
    while (!hits(cur.m, cur.x, cur.y + 1)) { cur.y++; g.addScore(2); }
    Sound.play(180, 0.07, "square", 0.04);
    lock();
  }
  function ghostY() {
    let y = cur.y;
    while (!hits(cur.m, cur.x, y + 1)) y++;
    return y;
  }

  function lock() {
    cur.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && cur.y + r >= 0) board[cur.y + r][cur.x + c] = cur.c;
    }));
    const full = [];
    board.forEach((row, r) => { if (row.every(v => v)) full.push(r); });
    if (full.length) {
      flashRows = full; flashT = 0.28;
      g.addScore(CLEAR_SCORE[full.length] * level);
      lines += full.length;
      g.set("lines", lines);
      const lv = Math.min(15, Math.floor(lines / 10) + 1);
      if (lv !== level) { level = lv; g.set("level", level); }
      gravity = Math.max(0.07, 0.8 - (level - 1) * 0.055);
      full.length === 4 ? Sound.good() : Sound.pop();
      cur = null;                       // pieces pause while the rows flash
    } else {
      Sound.play(240, 0.04, "square", 0.03);
      spawn();
    }
  }
  function collapse() {
    flashRows.sort((a, b) => a - b).forEach(r => {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
    });
    flashRows = [];
    spawn();
  }

  /* ── controls ── */
  g.onDir = (x, y, _name, src) => {
    if (x) { move(x); held = x; repeat = 0.22; return; }
    if (y > 0) src === "swipe" ? hardDrop() : softDrop();
    else if (y < 0) rotate();
  };
  /* space and the DROP button slam the piece down; a tap rotates it */
  g.onAction = src => { src === "tap" ? rotate() : hardDrop(); };

  function update(dt) {
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) collapse(); return; }
    if (!cur) return;
    /* smooth auto-repeat while a left/right control is held down */
    if (g.hold && g.hold === held) {
      repeat -= dt;
      if (repeat <= 0) { move(g.hold); repeat = 0.06; }
    } else if (!g.hold) held = 0;

    dropT += dt;
    if (dropT >= gravity) { dropT = 0; if (hits(cur.m, cur.x, cur.y + 1)) lock(); else cur.y++; }
  }

  /* ── drawing ── */
  function block(ctx, x, y, col) {
    ctx.fillStyle = col;
    rrect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 4); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.26)";
    rrect(ctx, x + 1, y + 1, CELL - 2, (CELL - 2) * 0.42, 4); ctx.fill();
  }
  function draw() {
    const ctx = g.ctx;
    g.clear("#0b1224");
    /* well */
    ctx.fillStyle = "rgba(2,6,18,.55)";
    rrect(ctx, BX - 3, BY - 3, COLS * CELL + 6, ROWS * CELL + 6, 8); ctx.fill();
    ctx.strokeStyle = "rgba(148,163,184,.22)"; ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath(); ctx.moveTo(BX + c * CELL, BY); ctx.lineTo(BX + c * CELL, BY + ROWS * CELL); ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(BX, BY + r * CELL); ctx.lineTo(BX + COLS * CELL, BY + r * CELL); ctx.stroke();
    }
    /* settled blocks */
    board.forEach((row, r) => row.forEach((v, c) => {
      if (v) block(ctx, BX + c * CELL, BY + r * CELL, v);
    }));
    /* rows about to vanish */
    if (flashRows.length && Math.floor(flashT * 20) % 2) {
      ctx.fillStyle = "rgba(255,255,255,.75)";
      flashRows.forEach(r => ctx.fillRect(BX, BY + r * CELL, COLS * CELL, CELL));
    }
    /* landing shadow + the live piece */
    if (cur) {
      const gy = ghostY();
      ctx.strokeStyle = "rgba(226,232,240,.32)"; ctx.lineWidth = 1.5;
      cur.m.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return;
        rrect(ctx, BX + (cur.x + c) * CELL + 2, BY + (gy + r) * CELL + 2, CELL - 4, CELL - 4, 3);
        ctx.stroke();
      }));
      cur.m.forEach((row, r) => row.forEach((v, c) => {
        if (v && cur.y + r >= 0) block(ctx, BX + (cur.x + c) * CELL, BY + (cur.y + r) * CELL, cur.c);
      }));
    }
    /* next piece */
    g.text("NEXT", PANEL + 34, BY + 8, 10, "rgba(226,232,240,.5)", 800);
    const np = PIECES[nextI];
    const w = np.m[0].length, h = np.m.length;
    const s = 15;
    const ox = PANEL + 34 - (w * s) / 2, oy = BY + 22;
    ctx.fillStyle = "rgba(148,163,184,.10)";
    rrect(ctx, PANEL, BY + 18, 68, 62, 10); ctx.fill();
    np.m.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      ctx.fillStyle = np.c;
      rrect(ctx, ox + c * s + 1, oy + r * s + 1 + (4 - h) * 2, s - 2, s - 2, 3); ctx.fill();
    }));
    ctx.font = FONT(700, 10);
    ctx.textAlign = "center";
    g.text("LEVEL " + level, PANEL + 34, BY + 100, 10, "rgba(226,232,240,.5)", 800);
    g.text(String(lines) + " ROWS", PANEL + 34, BY + 118, 10, "rgba(226,232,240,.5)", 800);
  }

  reset();
  return { reset, update, draw };
}

MATTGAMES.define("stacks", makeStacks);
})();
