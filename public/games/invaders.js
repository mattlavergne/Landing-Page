/* ══════════════════════════════════════════════════════════════════
   Invaders
   Hold the line: a marching formation, three bunkers that soak up what
   you don't, and a wave that closes in faster with every alien lost.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, clamp, rrect, Sound } = MATTGAMES.util;

const ROWS = 5, COLS = 8;
const AW = 24, AH = 16, GAPX = 34, GAPY = 26;
const ROW_KIND = [0, 0, 1, 1, 2];              // top rows are worth more
const KIND = [
  { pts: 30, col: "#f472b6" },
  { pts: 20, col: "#a78bfa" },
  { pts: 10, col: "#34d399" }
];

/* 11x8 pixel art, two frames per kind — drawn as blocks, arcade style */
const ART = [
  [["..#.....#..", "...#...#...", "..#######..", ".##.###.##.", "###########", "#.#######.#", "#.#.....#.#", "...##.##..."],
   ["..#.....#..", "#..#...#..#", "#.#######.#", "###.###.###", "###########", ".#########.", "..#.....#..", ".#.......#."]],
  [["...#####...", ".##########", "###########", "###.###.###", "###########", "...##.##...", "..##...##..", ".##.....##."],
   ["...#####...", ".##########", "###########", "###.###.###", "###########", "..##...##..", ".##.....##.", "#..#...#..#"]],
  [["....###....", "..#######..", ".#########.", "###.###.###", "###########", "...#...#...", "..#.#.#.#..", ".#.......#."],
   ["....###....", "..#######..", ".#########.", "###.###.###", "###########", "..#.#.#.#..", ".#.......#.", "..#.....#.."]]
];

function makeInvaders(g) {
  const W = g.W, H = g.H;
  const SHIP_Y = H - 30;
  let ship, aliens, bullet, bombs, bunkers, dir, stepT, stepEvery, frame,
      lives, level, bombT, over, shake, msgT;

  function reset() {
    lives = 3; level = 1; over = false;
    g.set("lives", lives); g.set("level", level);
    wave(true);
  }
  function wave(first) {
    ship = { x: W / 2, w: 30, h: 12, cool: 0 };
    aliens = [];
    const top = 44 + Math.min((level - 1) * 8, 40);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        aliens.push({ c, r, kind: ROW_KIND[r], x: 26 + c * GAPX, y: top + r * GAPY, alive: true });
    bullet = null; bombs = []; dir = 1; stepT = 0; frame = 0;
    bombT = 1.4; shake = 0; msgT = first ? 0 : 1.1;
    stepEvery = 0.62;
    if (first || !bunkers) buildBunkers();
  }
  function buildBunkers() {
    /* three little forts, each a grid of chunks that chip away */
    bunkers = [];
    const shape = [
      "..######..",
      ".########.",
      "##########",
      "##########",
      "###....###",
      "##......##"
    ];
    for (let b = 0; b < 3; b++) {
      const bx = 46 + b * ((W - 92) / 2) - 30, by = H - 96;
      shape.forEach((row, r) => row.split("").forEach((ch, c) => {
        if (ch === "#") bunkers.push({ x: bx + c * 6, y: by + r * 5, w: 6, h: 5, hp: 2 });
      }));
    }
  }

  const alive = () => aliens.filter(a => a.alive);

  g.onAction = () => fire();
  g.onPointer = (x, _y, phase) => {
    if (phase === "down" || phase === "move") ship.x = clamp(x, 20, W - 20);
  };
  function fire() {
    if (bullet || over) return;
    bullet = { x: ship.x, y: SHIP_Y - 10, v: -430 };
    Sound.play(880, 0.06, "square", 0.035);
  }

  function update(dt) {
    if (msgT > 0) { msgT -= dt; return; }
    if (shake > 0) shake -= dt;
    if (g.hold) ship.x = clamp(ship.x + g.hold * 260 * dt, 20, W - 20);

    /* the formation steps sideways, and drops a row at the edges */
    const live = alive();
    stepEvery = clamp(0.05 + 0.6 * (live.length / (ROWS * COLS)) - (level - 1) * 0.04, 0.05, 0.62);
    stepT += dt;
    if (stepT >= stepEvery) {
      stepT = 0; frame ^= 1;
      const minX = Math.min(...live.map(a => a.x)), maxX = Math.max(...live.map(a => a.x + AW));
      if ((dir > 0 && maxX + 8 > W - 8) || (dir < 0 && minX - 8 < 8)) {
        dir = -dir;
        live.forEach(a => { a.y += 12; });
      } else {
        live.forEach(a => { a.x += 8 * dir; });
      }
      Sound.play(live.length > 20 ? 110 : 150, 0.04, "square", 0.02);
      if (live.some(a => a.y + AH >= SHIP_Y - 6)) { loseLife(true); return; }
    }

    /* aliens drop bombs from the bottom of each column */
    bombT -= dt;
    if (bombT <= 0 && live.length) {
      bombT = Math.max(0.35, 1.5 - level * 0.12 - Math.random() * 0.5);
      const cols = {};
      live.forEach(a => { if (!cols[a.c] || a.y > cols[a.c].y) cols[a.c] = a; });
      const shooters = Object.values(cols);
      const from = shooters[rnd(shooters.length)];
      bombs.push({ x: from.x + AW / 2, y: from.y + AH, v: 150 + level * 12 });
    }

    /* player shot */
    if (bullet) {
      bullet.y += bullet.v * dt;
      if (bullet.y < -10) bullet = null;
      else if (hitBunker(bullet.x, bullet.y, 3)) bullet = null;
      else {
        for (const a of live) {
          if (bullet.x > a.x && bullet.x < a.x + AW && bullet.y > a.y && bullet.y < a.y + AH) {
            a.alive = false; bullet = null;
            g.addScore(KIND[a.kind].pts * level);
            Sound.pop();
            break;
          }
        }
      }
    }

    /* alien bombs */
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.y += b.v * dt;
      if (b.y > H) { bombs.splice(i, 1); continue; }
      if (hitBunker(b.x, b.y, 3)) { bombs.splice(i, 1); continue; }
      if (b.y > SHIP_Y - 6 && b.y < SHIP_Y + ship.h && Math.abs(b.x - ship.x) < ship.w / 2) {
        bombs.splice(i, 1); loseLife(false); return;
      }
    }

    if (!alive().length) {
      level++; g.set("level", level);
      g.addScore(150);
      Sound.good();
      wave(false);
    }
  }

  function hitBunker(x, y, r) {
    for (let i = 0; i < bunkers.length; i++) {
      const b = bunkers[i];
      if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) {
        b.hp--;
        if (b.hp <= 0) bunkers.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  function loseLife(reached) {
    lives--; g.set("lives", lives);
    Sound.bad(); shake = 0.4;
    if (lives <= 0 || reached) {
      over = true;
      g.gameOver(reached ? "They got through" : "Ship down",
        `You held out for ${level} wave${level === 1 ? "" : "s"}.`);
      return;
    }
    bombs = []; bullet = null; msgT = 1;
    ship.x = W / 2;
  }

  /* ── drawing ── */
  function drawAlien(ctx, a) {
    const art = ART[a.kind][frame];
    const px = AW / 11, py = AH / 8;
    ctx.fillStyle = KIND[a.kind].col;
    art.forEach((row, r) => {
      let run = 0;
      for (let c = 0; c <= row.length; c++) {
        if (row[c] === "#") { run++; continue; }
        if (run) { ctx.fillRect(a.x + (c - run) * px, a.y + r * py, run * px + 0.4, py + 0.4); run = 0; }
      }
    });
  }
  function draw() {
    const ctx = g.ctx;
    g.clear("#05070f");
    ctx.save();
    if (shake > 0) ctx.translate(rnd(3) - 1, rnd(3) - 1);

    /* starfield */
    ctx.fillStyle = "rgba(148,163,184,.25)";
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % (W - 8) + 4, y = (i * 53) % (H - 60) + 6;
      ctx.fillRect(x, y, 1.6, 1.6);
    }

    aliens.forEach(a => { if (a.alive) drawAlien(ctx, a); });

    /* bunkers */
    bunkers.forEach(b => {
      ctx.fillStyle = b.hp > 1 ? "#4ade80" : "#166534";
      ctx.fillRect(b.x, b.y, b.w, b.h);
    });

    /* ship */
    ctx.fillStyle = "#e2e8f0";
    rrect(ctx, ship.x - ship.w / 2, SHIP_Y, ship.w, ship.h, 3); ctx.fill();
    rrect(ctx, ship.x - 3, SHIP_Y - 7, 6, 8, 2); ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(ship.x - ship.w / 2 + 4, SHIP_Y + 4, ship.w - 8, 3);

    /* shots */
    if (bullet) {
      ctx.fillStyle = "#fde047";
      ctx.shadowColor = "rgba(253,224,71,.8)"; ctx.shadowBlur = 8;
      ctx.fillRect(bullet.x - 1.5, bullet.y, 3, 10);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = "#f87171";
    bombs.forEach(b => {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + 9);
      ctx.lineTo(b.x - 3, b.y);
      ctx.lineTo(b.x + 3, b.y);
      ctx.closePath(); ctx.fill();
    });

    /* ground line */
    ctx.fillStyle = "rgba(74,222,128,.5)";
    ctx.fillRect(6, H - 12, W - 12, 2);

    if (msgT > 0) g.text(lives === 3 && !over ? "WAVE " + level : "SHIP DOWN", W / 2, H / 2, 17, "#fde047", 800);
    ctx.restore();
  }

  reset();
  return { reset, update, draw };
}

MATTGAMES.define("invaders", makeInvaders);
})();
