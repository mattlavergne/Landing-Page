/* ══════════════════════════════════════════════════════════════════
   Bricks
   Break every brick, keep the ball alive.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, clamp, rrect, COARSE, REDUCE, Sound } = MATTGAMES.util;

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
MATTGAMES.define("bricks", makeBricks);
})();
