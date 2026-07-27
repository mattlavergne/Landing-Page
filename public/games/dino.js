/* ══════════════════════════════════════════════════════════════════
   No Connection — the game every browser hides for when the network
   dies.  mattOS hides one too: turn the Wi-Fi off in Control Center
   and it appears in the Arcade.

   Run, jump the cacti, duck the birds, and watch day turn to night.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, clamp, rrect, Sound } = MATTGAMES.util;

const GROUND = 300, GRAV = 2100, JUMP = -620;

function makeDino(g) {
  const W = g.W, H = g.H;
  let x, y, vy, ducking, run, obstacles, speed, dist, night, dead, blink, clouds;

  function reset() {
    y = GROUND; vy = 0; ducking = false; run = 0; x = 60;
    obstacles = []; speed = 300; dist = 0; night = 0; dead = false; blink = 0;
    clouds = [...Array(4)].map(() => ({ x: rnd(W), y: 40 + rnd(90), s: 0.3 + Math.random() * 0.5 }));
    spawn(W + 120);
  }
  function spawn(atX) {
    const bird = dist > 700 && Math.random() < 0.28;
    obstacles.push(bird
      ? { x: atX, y: GROUND - 46 - rnd(2) * 34, w: 34, h: 26, bird: true, flap: 0 }
      : { x: atX, y: GROUND - (Math.random() < 0.5 ? 34 : 48), w: 14 + rnd(3) * 10, h: Math.random() < 0.5 ? 34 : 48 });
  }
  function jump() {
    if (dead) return;
    if (y >= GROUND) { vy = JUMP; Sound.play(660, 0.07, "square", 0.04); }
  }
  g.onAction = jump;
  g.onDir = (dx, dy) => {
    if (dy < 0) jump();
    else if (dy > 0) { ducking = true; setTimeout(() => { ducking = false; }, 420); }
  };

  function update(dt) {
    dist += speed * dt / 10;
    speed = Math.min(660, 300 + dist * 0.16);
    night = (Math.floor(dist / 900) % 2) ? Math.min(1, (dist % 900) / 120) : Math.max(0, 1 - (dist % 900) / 120);
    g.set("score", Math.floor(dist));
    g.score = Math.floor(dist);

    vy += GRAV * dt;
    y = Math.min(GROUND, y + vy * dt);
    if (y >= GROUND) vy = 0;
    run += dt * speed / 26;

    clouds.forEach(c => {
      c.x -= speed * 0.12 * dt;
      if (c.x < -70) { c.x = W + rnd(80); c.y = 40 + rnd(90); }
    });

    obstacles.forEach(o => {
      o.x -= speed * dt;
      if (o.bird) o.flap += dt * 9;
    });
    if (obstacles.length && obstacles[obstacles.length - 1].x < W - 180 - rnd(220)) spawn(W + 40);
    if (obstacles.length && obstacles[0].x < -60) obstacles.shift();

    /* collision, with a forgiving box */
    const bx = x + 6, bw = ducking ? 40 : 26;
    const by = ducking ? y - 22 : y - 44, bh = ducking ? 22 : 44;
    obstacles.forEach(o => {
      if (bx + bw > o.x + 3 && bx < o.x + o.w - 3 && by + bh > o.y + 3 && by < o.y + o.h) die();
    });
  }
  function die() {
    if (dead) return;
    dead = true;
    g.gameOver("Ouch", `You ran ${Math.floor(dist)} metres offline.`);
  }

  function draw() {
    const ctx = g.ctx;
    const ink = night > 0.5 ? "#e2e8f0" : "#334155";
    const bg = night > 0.5 ? "#0b1020" : "#f1f5f9";
    g.clear(bg);
    ctx.fillStyle = ink;

    clouds.forEach(c => {
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12 * c.s * 2, 0, 7);
      ctx.arc(c.x + 18 * c.s * 2, c.y + 4, 9 * c.s * 2, 0, 7);
      ctx.arc(c.x - 16 * c.s * 2, c.y + 5, 8 * c.s * 2, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    if (night > 0.5) {
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 12; i++) ctx.fillRect((i * 73) % W, 30 + (i * 37) % 120, 2, 2);
      ctx.globalAlpha = 1;
    }

    /* ground */
    ctx.fillRect(0, GROUND + 2, W, 2);
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < W / 40; i++) {
      const gx = (i * 40 - (dist * 10) % 40);
      ctx.fillRect(gx, GROUND + 8, 12, 2);
      ctx.fillRect(gx + 20, GROUND + 14, 6, 2);
    }
    ctx.globalAlpha = 1;

    /* obstacles */
    obstacles.forEach(o => {
      if (o.bird) {
        const up = Math.sin(o.flap) > 0;
        ctx.beginPath();
        ctx.ellipse(o.x + 17, o.y + 13, 15, 7, 0, 0, 7); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(o.x + 14, o.y + 12);
        ctx.lineTo(o.x + 2, o.y + (up ? -6 : 26));
        ctx.lineTo(o.x + 26, o.y + 12);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = bg;
        ctx.fillRect(o.x + 26, o.y + 9, 3, 3);
        ctx.fillStyle = ink;
      } else {
        rrect(ctx, o.x + o.w / 2 - 4, o.y, 8, o.h, 3); ctx.fill();
        rrect(ctx, o.x, o.y + o.h * 0.34, 5, o.h * 0.3, 2.5); ctx.fill();
        rrect(ctx, o.x + o.w - 5, o.y + o.h * 0.28, 5, o.h * 0.34, 2.5); ctx.fill();
      }
    });

    /* the runner */
    const legs = Math.floor(run) % 2 === 0;
    const top = ducking ? y - 22 : y - 44;
    if (ducking) {
      rrect(ctx, x, top, 46, 22, 7); ctx.fill();
      rrect(ctx, x + 34, top - 6, 16, 14, 5); ctx.fill();
    } else {
      rrect(ctx, x + 2, top + 14, 22, 30, 7); ctx.fill();
      rrect(ctx, x + 16, top, 20, 18, 6); ctx.fill();
      rrect(ctx, x + 34, top + 6, 6, 4, 2); ctx.fill();
      ctx.fillRect(x + 6, top + 44, 6, legs && !dead ? 8 : 3);
      ctx.fillRect(x + 16, top + 44, 6, legs || dead ? 3 : 8);
    }
    ctx.fillStyle = bg;
    ctx.fillRect(x + 27, top + 5, 4, 4);
    ctx.fillStyle = ink;

    /* offline chrome */
    ctx.globalAlpha = 0.55;
    g.text("no connection", W / 2, 26, 12, ink, 700);
    ctx.globalAlpha = 1;
    g.text(String(Math.floor(dist)).padStart(5, "0"), W - 46, 26, 14, ink, 700);
    if (dead) {
      g.text("G A M E   O V E R", W / 2, GROUND - 120, 20, ink, 800);
    }
  }
  reset();
  return { reset, update, draw };
}

MATTGAMES.define("dino", makeDino);
})();
