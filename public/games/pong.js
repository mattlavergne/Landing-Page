/* ══════════════════════════════════════════════════════════════════
   Pong (1972) — the reward game.

   Not listed in the arcade until you either find the key hidden in the
   Terminal's filesystem, or finish every achievement in mattOS.

   The opponent is deliberately beatable: it tracks the ball with a
   reaction delay that shrinks as your score climbs.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { clamp, rrect, Sound } = MATTGAMES.util;

const PW = 10, PH = 62, MARGIN = 18, WIN = 7;

function makePong(g) {
  const W = g.W, H = g.H;
  let you, cpu, ball, yourScore, cpuScore, over, serveT, rally;

  function reset() {
    you = { y: H / 2 - PH / 2 };
    cpu = { y: H / 2 - PH / 2, drift: 0 };
    yourScore = 0; cpuScore = 0; over = false; rally = 0;
    g.set("you", 0); g.set("cpu", 0);
    serve(1);
  }
  function serve(dir) {
    ball = { x: W / 2, y: H / 2, vx: dir * 250, vy: (Math.random() * 200 - 100), r: 7 };
    serveT = 0.8; rally = 0;
  }

  g.onDir = (x, y) => { if (y) you.y = clamp(you.y + y * 34, 0, H - PH); };
  g.onPointer = (x, y, phase) => {
    if (phase === "down" || phase === "move") you.y = clamp(y - PH / 2, 0, H - PH);
  };

  function update(dt) {
    if (over) return;
    if (g.hold) you.y = clamp(you.y + g.hold * 420 * dt, 0, H - PH);
    if (serveT > 0) { serveT -= dt; return; }

    /* the opponent: reacts late, and less late as you pull ahead */
    const react = clamp(0.42 - yourScore * 0.04, 0.08, 0.42);
    const target = ball.vx > 0 ? ball.y - PH / 2 : H / 2 - PH / 2;
    cpu.y += (target - cpu.y) * Math.min(1, dt / react);
    cpu.y = clamp(cpu.y, 0, H - PH);

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); Sound.blip(); }
    if (ball.y + ball.r > H) { ball.y = H - ball.r; ball.vy = -Math.abs(ball.vy); Sound.blip(); }

    const hit = (px, py) => ball.y + ball.r > py && ball.y - ball.r < py + PH;
    if (ball.vx < 0 && ball.x - ball.r < MARGIN + PW && ball.x > MARGIN && hit(MARGIN, you.y)) {
      bounce(you.y, 1);
    } else if (ball.vx > 0 && ball.x + ball.r > W - MARGIN - PW && ball.x < W - MARGIN && hit(W - MARGIN - PW, cpu.y)) {
      bounce(cpu.y, -1);
    }

    if (ball.x < -20) { cpuScore++; g.set("cpu", cpuScore); point(); }
    else if (ball.x > W + 20) {
      yourScore++; g.set("you", yourScore); g.addScore(100 + rally * 10); point();
    }
  }
  function bounce(py, dir) {
    const rel = clamp((ball.y - (py + PH / 2)) / (PH / 2), -1, 1);
    const speed = Math.min(680, Math.hypot(ball.vx, ball.vy) * 1.06 + 12);
    const angle = rel * 0.9;
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    ball.x += dir * 6;
    rally++;
    Sound.play(dir > 0 ? 520 : 420, 0.05, "square", 0.04);
  }
  function point() {
    Sound.pop();
    if (yourScore >= WIN || cpuScore >= WIN) {
      over = true;
      const won = yourScore > cpuScore;
      g.gameOver(won ? "You win" : "You lose",
        `${yourScore} – ${cpuScore}. ` + (won
          ? "Fifty-odd years old and it still holds up."
          : "First to " + WIN + ". The paddle gets sharper the further ahead you are."));
      return;
    }
    serve(ball.x < 0 ? 1 : -1);
  }

  function draw() {
    const ctx = g.ctx;
    g.clear("#05070f");
    ctx.strokeStyle = "rgba(226,232,240,.25)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 14]);
    ctx.beginPath(); ctx.moveTo(W / 2, 8); ctx.lineTo(W / 2, H - 8); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(226,232,240,.16)";
    ctx.font = "700 46px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(yourScore), W / 2 - 46, 44);
    ctx.fillText(String(cpuScore), W / 2 + 46, 44);

    ctx.fillStyle = "#e2e8f0";
    rrect(ctx, MARGIN, you.y, PW, PH, 5); ctx.fill();
    ctx.fillStyle = "#fb7185";
    rrect(ctx, W - MARGIN - PW, cpu.y, PW, PH, 5); ctx.fill();

    ctx.fillStyle = "#fde047";
    ctx.shadowColor = "rgba(253,224,71,.7)"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;

    if (serveT > 0 && !over) g.text("Serving…", W / 2, H - 30, 13, "rgba(226,232,240,.5)", 700);
    g.text("first to " + WIN, W / 2, H - 12, 10, "rgba(226,232,240,.3)", 700);
  }
  reset();
  return { reset, update, draw };
}

MATTGAMES.define("pong", makePong);
})();
