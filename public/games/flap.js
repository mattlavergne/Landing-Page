/* ══════════════════════════════════════════════════════════════════
   Flap
   One tap, endless pipes.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, clamp, rrect, Sound } = MATTGAMES.util;

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
MATTGAMES.define("flap", makeFlap);
})();
