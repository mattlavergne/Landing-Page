/* ══════════════════════════════════════════════════════════════════
   Snake
   Eat, grow, don't bite yourself.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, rrect, Sound } = MATTGAMES.util;

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
MATTGAMES.define("snake", makeSnake);
})();
