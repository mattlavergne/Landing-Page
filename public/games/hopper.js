/* ══════════════════════════════════════════════════════════════════
   Hopper
   Cross five lanes of traffic, then ride the logs over the river and
   land in all five lily pads.  Traffic squashes, water drowns.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, clamp, rrect, Sound } = MATTGAMES.util;

const COLS = 10, CW = 38;                 // 10 columns of 38 = 380 wide
const ROWS = 12, RH = 36;                 // 12 rows of 36 = 432 tall
const HOME = 0, WATER = [1, 2, 3, 4], MEDIAN = 5, ROAD = [6, 7, 8, 9, 10], START = 11;
const PAD_COLS = [0, 2, 4, 6, 8];         // the five lily pads, evenly spread
const CAR_COL = ["#f87171", "#fbbf24", "#38bdf8", "#a78bfa", "#fb923c"];

function makeHopper(g) {
  const W = g.W, TOP = 4;
  let frog, lanes, pads, lives, level, dead, deadT, hop, msgT;

  const rowY = r => TOP + r * RH;

  function reset() {
    lives = 3; level = 1; pads = [false, false, false, false, false];
    g.set("lives", lives); g.set("level", level);
    buildLanes();
    place();
    msgT = 0.7;
  }
  function place() {
    frog = { col: 4, row: START, x: 4 * CW + CW / 2, y: rowY(START) + RH / 2, ride: 0 };
    dead = false; deadT = 0; hop = 0;
  }
  function buildLanes() {
    const s = 1 + (level - 1) * 0.22;       // everything speeds up each level
    lanes = {};
    /* river: logs drift, and they are the only safe ground up there */
    WATER.forEach((r, i) => {
      const dirn = i % 2 ? -1 : 1;
      const len = [3, 2, 3, 2][i] * CW * 0.8;
      const speed = (34 + i * 9) * s * dirn;
      const gap = len + 62 + i * 10;
      const items = [];
      for (let x = -len; x < W + len; x += gap) items.push({ x, len });
      lanes[r] = { type: "log", speed, items };
    });
    /* road: cars, tighter and quicker nearer the bottom */
    ROAD.forEach((r, i) => {
      const dirn = i % 2 ? 1 : -1;
      const len = i === 2 ? CW * 1.5 : CW * 0.9;
      const speed = (48 + i * 13) * s * dirn;
      const gap = len + 92 - i * 6;
      const items = [];
      for (let x = -len; x < W + len; x += gap) items.push({ x, len, col: CAR_COL[i] });
      lanes[r] = { type: "car", speed, items };
    });
  }

  g.onDir = (x, y) => {
    if (dead || msgT > 0) return;
    if (y) {
      const nr = clamp(frog.row + y, HOME, START);
      if (nr === frog.row) return;
      frog.row = nr;
      if (y < 0) g.addScore(10);            // moving up is progress
    } else if (x) {
      const nc = clamp(frog.col + x, 0, COLS - 1);
      if (nc === frog.col) return;
      frog.col = nc;
    }
    frog.x = frog.col * CW + CW / 2;
    hop = 1;
    Sound.play(560, 0.05, "sine", 0.04);
    settle();
  };

  /* what happens where the frog just landed */
  function settle() {
    if (frog.row === HOME) {
      const slot = PAD_COLS.indexOf(frog.col);
      if (slot < 0 || pads[slot]) { die("Missed the pad"); return; }
      pads[slot] = true;
      g.addScore(60);
      Sound.good();
      if (pads.every(Boolean)) {
        level++; g.set("level", level);
        g.addScore(250);
        pads = [false, false, false, false, false];
        buildLanes();
        msgT = 1.1;
      }
      place();
      return;
    }
    check();
  }

  function laneItemUnder() {
    const lane = lanes[frog.row];
    if (!lane) return null;
    for (const it of lane.items) if (frog.x > it.x && frog.x < it.x + it.len) return it;
    return null;
  }
  function check() {
    if (dead) return;
    if (WATER.indexOf(frog.row) >= 0) {
      const log = laneItemUnder();
      if (!log) { die("Splash"); return; }
      frog.ride = lanes[frog.row].speed;
    } else {
      frog.ride = 0;
      if (ROAD.indexOf(frog.row) >= 0 && laneItemUnder()) { die("Squashed"); return; }
    }
    if (frog.x < 6 || frog.x > W - 6) die("Swept away");
  }

  function die(why) {
    if (dead) return;
    dead = true; deadT = 1; frog.why = why;
    lives--; g.set("lives", lives);
    Sound.bad();
  }

  function update(dt) {
    if (msgT > 0) { msgT -= dt; return; }
    if (dead) {
      deadT -= dt;
      if (deadT <= 0) {
        if (lives <= 0) {
          g.gameOver(frog.why || "Game over",
            `You filled ${pads.filter(Boolean).length} of 5 pads on level ${level}.`);
        } else { place(); msgT = 0.4; }
      }
      return;
    }
    if (hop > 0) hop = Math.max(0, hop - dt * 7);

    Object.keys(lanes).forEach(k => {
      const lane = lanes[k];
      lane.items.forEach(it => {
        it.x += lane.speed * dt;
        if (lane.speed > 0 && it.x > W + 10) it.x = -it.len - rnd(40);
        else if (lane.speed < 0 && it.x < -it.len - 10) it.x = W + rnd(40);
      });
    });

    if (frog.ride) {
      frog.x += frog.ride * dt;
      frog.col = clamp(Math.floor(frog.x / CW), 0, COLS - 1);
    }
    check();
  }

  /* ── drawing ── */
  function drawFrog(ctx, x, y, squish) {
    const s = 1 + squish * 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, 2 - s);
    ctx.fillStyle = dead ? "#94a3b8" : "#4ade80";
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 10, 0, 0, 7); ctx.fill();
    /* legs */
    ctx.fillStyle = dead ? "#64748b" : "#22c55e";
    [-1, 1].forEach(sx => {
      ctx.beginPath(); ctx.ellipse(sx * 11, 6, 5, 3.4, sx * 0.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx * 10, -6, 4.4, 3, -sx * 0.5, 0, 7); ctx.fill();
    });
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-4.5, -4.5, 3.4, 0, 7); ctx.arc(4.5, -4.5, 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.beginPath(); ctx.arc(-4.5, -5, 1.7, 0, 7); ctx.arc(4.5, -5, 1.7, 0, 7); ctx.fill();
    ctx.restore();
  }
  function draw() {
    const ctx = g.ctx, H = g.H;
    g.clear("#0b1224");

    /* bands */
    ctx.fillStyle = "#0e2a4d";                                  // river
    ctx.fillRect(0, rowY(WATER[0]), W, RH * WATER.length);
    ctx.fillStyle = "#14532d";                                  // banks
    ctx.fillRect(0, rowY(MEDIAN), W, RH);
    ctx.fillRect(0, rowY(START), W, RH);
    ctx.fillStyle = "#1f2937";                                  // road
    ctx.fillRect(0, rowY(ROAD[0]), W, RH * ROAD.length);
    ctx.fillStyle = "#0c1f3a";                                  // home bank
    ctx.fillRect(0, rowY(HOME), W, RH);

    /* lane markings */
    ctx.strokeStyle = "rgba(226,232,240,.22)"; ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ROAD.slice(1).forEach(r => {
      ctx.beginPath(); ctx.moveTo(0, rowY(r)); ctx.lineTo(W, rowY(r)); ctx.stroke();
    });
    ctx.setLineDash([]);
    /* river shimmer */
    ctx.strokeStyle = "rgba(148,197,253,.16)";
    WATER.forEach(r => {
      ctx.beginPath();
      ctx.moveTo(0, rowY(r) + RH / 2); ctx.lineTo(W, rowY(r) + RH / 2); ctx.stroke();
    });

    /* lily pads */
    PAD_COLS.forEach((c, i) => {
      const x = c * CW + CW / 2, y = rowY(HOME) + RH / 2;
      ctx.fillStyle = pads[i] ? "#4ade80" : "#166534";
      ctx.beginPath(); ctx.arc(x, y, 14, 0.5, Math.PI * 2 + 0.1); ctx.closePath(); ctx.fill();
      if (pads[i]) drawFrog(ctx, x, y, 0);
    });

    /* logs + cars */
    Object.keys(lanes).forEach(k => {
      const lane = lanes[k], y = rowY(+k);
      lane.items.forEach(it => {
        if (lane.type === "log") {
          ctx.fillStyle = "#78350f";
          rrect(ctx, it.x, y + 7, it.len, RH - 14, 8); ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,.22)";
          for (let x = it.x + 10; x < it.x + it.len - 6; x += 16) ctx.fillRect(x, y + 9, 2, RH - 18);
        } else {
          ctx.fillStyle = it.col;
          rrect(ctx, it.x, y + 6, it.len, RH - 12, 6); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.55)";
          rrect(ctx, it.x + it.len * 0.24, y + 10, it.len * 0.36, RH - 20, 3); ctx.fill();
          ctx.fillStyle = "rgba(15,23,42,.5)";
          ctx.fillRect(it.x + 4, y + RH - 9, 5, 3);
          ctx.fillRect(it.x + it.len - 9, y + RH - 9, 5, 3);
        }
      });
    });

    /* the frog */
    drawFrog(ctx, frog.x, rowY(frog.row) + RH / 2, dead ? 1 : hop);

    if (dead) g.text(frog.why || "", W / 2, rowY(frog.row) + RH / 2 - 26, 13, "#fca5a5", 800);
    else if (msgT > 0) g.text("LEVEL " + level, W / 2, H / 2, 17, "#fde047", 800);
  }

  reset();
  return { reset, update, draw };
}

MATTGAMES.define("hopper", makeHopper);
})();
