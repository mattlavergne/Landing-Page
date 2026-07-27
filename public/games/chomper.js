/* ══════════════════════════════════════════════════════════════════
   Chomper
   A Pac-Man style maze chase: dots, power pellets, four ghosts
   with scatter / chase / frightened behaviour, a wrap-around tunnel,
   lives and levels.

   One game, one file.  Loaded on demand by /games/engine.js the first
   time someone opens it, so the desktop only ever downloads the games
   that are actually played.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { rnd, clamp, Sound } = MATTGAMES.util;

/* ═══════════════════════════ GAME: CHOMPER ═══════════════════════════
   A Pac-Man-style maze chase: dots, power pellets, four ghosts with
   scatter / chase / frightened behaviour, a wrap-around tunnel, lives
   and levels. */
const MAZE = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "####.#.......#.####",
  "####.#.##-##.#.####",
  "####.##=====##.####",
  "      #=====#      ",
  "####.##=====##.####",
  "####.#########.####",
  "####....#.#....####",
  "####.###...###.####",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#..#.....#.....#..#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "###################"
];
const M_COLS = 19, M_ROWS = 21, T_M = 20, TUNNEL_ROW = 10;
const HOUSE = { c: 9, r: 10 };          // where eaten ghosts return to
const DIRS = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];

function makeChomper(g) {
  let grid, dots, player, ghosts, level, lives, mode, modeT, fright, frightChain,
      pauseT, mouth, flash, dying;

  function tile(c, r) {
    if (r < 0 || r >= M_ROWS) return "#";
    if (c < 0 || c >= M_COLS) return r === TUNNEL_ROW ? " " : "#";
    return grid[r][c];
  }
  /* who: 0 = player, 1 = ghost on the loose, 2 = ghost with house access
     (heading home as eyes, or climbing out of the house at the start). */
  function open(c, r, who) {
    const t = tile(c, r);
    if (t === "#") return false;
    if (t === "-" || t === "=") return who === 2;
    return true;
  }
  const access = gh => (gh.state === "eyes" || gh.state === "house") ? 2 : 1;

  function resetLevel(full) {
    if (full) grid = MAZE.map(r => r.split(""));
    dots = 0;
    grid.forEach(row => row.forEach(ch => { if (ch === "." || ch === "o") dots++; }));
    player = { x: 9 * T_M + T_M / 2, y: 13 * T_M + T_M / 2, dir: { x: -1, y: 0 }, want: { x: -1, y: 0 } };
    const corner = [{ c: 17, r: -2 }, { c: 1, r: -2 }, { c: 17, r: 22 }, { c: 1, r: 22 }];
    const kinds = ["blinky", "pinky", "inky", "clyde"];
    const colors = ["#ff5f57", "#f9a8d4", "#67e8f9", "#fdba74"];
    const spawn = [{ c: 9, r: 7 }, { c: 9, r: 10 }, { c: 8, r: 10 }, { c: 10, r: 10 }];
    ghosts = kinds.map((k, i) => ({
      kind: k, color: colors[i], corner: corner[i],
      x: spawn[i].c * T_M + T_M / 2, y: spawn[i].r * T_M + T_M / 2,
      dir: i === 0 ? { x: -1, y: 0 } : { x: 0, y: -1 },
      state: i === 0 ? "normal" : "house",
      release: i * 3.2, revive: 0
    }));
    mode = "scatter"; modeT = 0; fright = 0; frightChain = 0;
    pauseT = 0.7; mouth = 0; dying = 0;
  }
  function reset() {
    level = 1; lives = 3; flash = 0;
    resetLevel(true);
    g.set("level", level); g.set("lives", lives);
  }

  g.onDir = (x, y) => { player.want = { x, y }; };

  const speed = () => 82 + (level - 1) * 4;
  const gspeed = gh => gh.state === "eyes" ? 190
    : gh.state === "fright" ? 48
    : 74 + (level - 1) * 4 + (gh.kind === "blinky" && dots < 24 ? 10 : 0);

  /* move one entity, snapping to tile centres so turns feel right */
  function step(e, dist, decide, who) {
    while (dist > 0) {
      const c = Math.floor(e.x / T_M), r = Math.floor(e.y / T_M);
      const cx = c * T_M + T_M / 2, cy = r * T_M + T_M / 2;
      if (Math.abs(e.x - cx) < 0.6 && Math.abs(e.y - cy) < 0.6) {
        e.x = cx; e.y = cy;
        decide(e, c, r);
        if (!(e.dir.x || e.dir.y) || !open(c + e.dir.x, r + e.dir.y, who)) { e.dir = { x: 0, y: 0 }; return; }
      }
      const d = Math.min(dist, 1);
      e.x += e.dir.x * d; e.y += e.dir.y * d;
      dist -= d;
      const span = M_COLS * T_M;
      if (e.x < -T_M / 2) e.x += span + T_M;
      else if (e.x > span + T_M / 2) e.x -= span + T_M;
    }
  }

  function playerDecide(e, c, r) {
    if ((e.want.x || e.want.y) && open(c + e.want.x, r + e.want.y, 0)) e.dir = e.want;
  }
  function ghostTarget(gh, c, r) {
    if (gh.state === "eyes") return HOUSE;
    if (mode === "scatter") return gh.corner;
    const pc = Math.floor(player.x / T_M), pr = Math.floor(player.y / T_M);
    if (gh.kind === "blinky") return { c: pc, r: pr };
    if (gh.kind === "pinky") return { c: pc + player.dir.x * 4, r: pr + player.dir.y * 4 };
    if (gh.kind === "inky") {
      const b = ghosts[0];
      const bx = Math.floor(b.x / T_M), by = Math.floor(b.y / T_M);
      return { c: (pc + player.dir.x * 2) * 2 - bx, r: (pr + player.dir.y * 2) * 2 - by };
    }
    const d = Math.hypot(pc - c, pr - r);
    return d > 8 ? { c: pc, r: pr } : gh.corner;
  }
  function ghostDecide(gh, c, r) {
    /* climbing out of the house: line up under the door, then head up */
    if (gh.state === "house") {
      const doorX = 9 * T_M + T_M / 2;
      if (Math.abs(gh.x - doorX) > 1) { gh.dir = { x: Math.sign(doorX - gh.x), y: 0 }; return; }
      gh.x = doorX; gh.dir = { x: 0, y: -1 };
      if (r <= 7) { gh.state = "normal"; gh.dir = { x: rnd(2) ? 1 : -1, y: 0 }; }
      return;
    }
    if (gh.state === "eyes" && c === HOUSE.c && r === HOUSE.r) {
      gh.state = "house"; gh.release = 1.4; gh.dir = { x: 0, y: 0 }; return;
    }
    const who = access(gh);
    let opts = DIRS.filter(d => open(c + d.x, r + d.y, who) &&
      !(d.x === -gh.dir.x && d.y === -gh.dir.y));
    if (!opts.length) opts = DIRS.filter(d => open(c + d.x, r + d.y, who));
    if (!opts.length) { gh.dir = { x: 0, y: 0 }; return; }
    if (gh.state === "fright") { gh.dir = opts[rnd(opts.length)]; return; }
    const t = ghostTarget(gh, c, r);
    let best = opts[0], bd = Infinity;
    opts.forEach(d => {
      const dd = (c + d.x - t.c) ** 2 + (r + d.y - t.r) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    });
    gh.dir = best;
  }

  function loseLife() {
    lives--; g.set("lives", lives);
    Sound.bad();
    if (lives <= 0) {
      g.gameOver("Game over", `You cleared ${level > 1 ? level - 1 : 0} maze${level === 2 ? "" : "es"}.`);
      return;
    }
    resetLevel(false);      // same board, everyone back to their corners
  }

  function update(dt) {
    if (dying > 0) { dying -= dt; if (dying <= 0) loseLife(); return; }
    if (flash > 0) {
      flash -= dt;
      if (flash <= 0) { level++; g.set("level", level); resetLevel(true); }
      return;
    }
    if (pauseT > 0) { pauseT -= dt; return; }

    mouth += dt * 9;
    modeT += dt;
    if (fright > 0) {
      fright -= dt;
      if (fright <= 0) ghosts.forEach(gh => { if (gh.state === "fright") gh.state = "normal"; });
    } else {
      const span = mode === "scatter" ? 7 : 20;
      if (modeT > span) { mode = mode === "scatter" ? "chase" : "scatter"; modeT = 0; }
    }

    /* player */
    const pd = player.want;
    if (pd && pd.x === -player.dir.x && pd.y === -player.dir.y && (pd.x || pd.y)) player.dir = pd;
    step(player, speed() * dt, playerDecide, 0);

    /* dots */
    const pc = Math.floor(player.x / T_M), pr = Math.floor(player.y / T_M);
    const t = tile(pc, pr);
    if (t === "." || t === "o") {
      grid[pr][pc] = " "; dots--;
      if (t === "o") {
        g.addScore(50); fright = Math.max(2.5, 8 - level * 0.5); frightChain = 0;
        ghosts.forEach(gh => { if (gh.state === "normal") { gh.state = "fright"; gh.dir = { x: -gh.dir.x, y: -gh.dir.y }; } });
        Sound.good();
      } else { g.addScore(10); Sound.blip(); }
      if (dots === 0) { flash = 1.6; Sound.good(); return; }
    }

    /* ghosts */
    ghosts.forEach(gh => {
      if (gh.state === "house" && gh.release > 0) { gh.release -= dt; return; }
      step(gh, gspeed(gh) * dt, ghostDecide, access(gh));
      const d = Math.hypot(gh.x - player.x, gh.y - player.y);
      if (d < T_M * 0.72) {
        if (gh.state === "fright") {
          frightChain = Math.min(frightChain + 1, 4);
          g.addScore(200 * Math.pow(2, frightChain - 1));
          gh.state = "eyes"; Sound.good();
        } else if (gh.state === "normal") {
          dying = 1.2; Sound.bad();
        }
      }
    });
  }

  /* ── drawing ── */
  /* One wall tile, rounded only on its exposed corners, so a run of tiles
     reads as one continuous wall instead of a string of beads. */
  function wallPath(ctx, x, y, s, up, dn, lf, rt, r) {
    const tl = (!up && !lf) ? r : 0, tr = (!up && !rt) ? r : 0;
    const br = (!dn && !rt) ? r : 0, bl = (!dn && !lf) ? r : 0;
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + s - tr, y); if (tr) ctx.quadraticCurveTo(x + s, y, x + s, y + tr);
    ctx.lineTo(x + s, y + s - br); if (br) ctx.quadraticCurveTo(x + s, y + s, x + s - br, y + s);
    ctx.lineTo(x + bl, y + s); if (bl) ctx.quadraticCurveTo(x, y + s, x, y + s - bl);
    ctx.lineTo(x, y + tl); if (tl) ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  }
  const solid = (c, r) => tile(c, r) === "#";
  /* a wall tile with walls on all eight sides is never seen: leaving it unfilled
     turns thick blocks into hollow rings, the way arcade mazes are drawn */
  const buried = (c, r) => solid(c - 1, r) && solid(c + 1, r) && solid(c, r - 1) && solid(c, r + 1) &&
    solid(c - 1, r - 1) && solid(c + 1, r - 1) && solid(c - 1, r + 1) && solid(c + 1, r + 1);

  function drawMaze(ctx) {
    const flashing = fright > 0 && Math.floor(fright * 4) % 2 === 0;
    const wallA = flashing ? "#60a5fa" : "#2b4fd8";
    const wallTop = flashing ? "#bfdbfe" : "#5b83f5";
    /* the insides of thick blocks: dark, but clearly not a corridor */
    ctx.fillStyle = flashing ? "#1e3a8a" : "#131f45";
    ctx.beginPath();
    for (let r = 0; r < M_ROWS; r++)
      for (let c = 0; c < M_COLS; c++)
        if (grid[r][c] === "#" && buried(c, r)) ctx.rect(c * T_M, r * T_M, T_M, T_M);
    ctx.fill();
    /* every visible wall tile in ONE path, so shared edges fill seamlessly */
    ctx.fillStyle = wallA;
    ctx.beginPath();
    for (let r = 0; r < M_ROWS; r++)
      for (let c = 0; c < M_COLS; c++) {
        if (grid[r][c] !== "#" || buried(c, r)) continue;
        wallPath(ctx, c * T_M, r * T_M, T_M,
          solid(c, r - 1), solid(c, r + 1), solid(c - 1, r), solid(c + 1, r), 7);
      }
    ctx.fill();
    /* one lit strip along every exposed top edge */
    ctx.fillStyle = wallTop;
    ctx.beginPath();
    for (let r = 0; r < M_ROWS; r++)
      for (let c = 0; c < M_COLS; c++) {
        if (grid[r][c] !== "#" || solid(c, r - 1)) continue;
        const lf = solid(c - 1, r), rt = solid(c + 1, r), x = c * T_M;
        ctx.rect(x + (lf ? 0 : 5), r * T_M, T_M - (lf ? 0 : 5) - (rt ? 0 : 5), 2.5);
      }
    ctx.fill();

    for (let r = 0; r < M_ROWS; r++) {
      for (let c = 0; c < M_COLS; c++) {
        const t = grid[r][c];
        const x = c * T_M, y = r * T_M;
        if (t === "-") {
          ctx.fillStyle = "#f9a8d4";
          ctx.fillRect(x + 1, y + T_M / 2 - 1.5, T_M - 2, 3);
        } else if (t === ".") {
          ctx.fillStyle = "#fde68a";
          ctx.beginPath(); ctx.arc(x + T_M / 2, y + T_M / 2, 2.1, 0, 7); ctx.fill();
        } else if (t === "o") {
          const pulse = 3.6 + Math.sin(performance.now() / 170) * 1.3;
          ctx.fillStyle = "#fff7ed";
          ctx.shadowColor = "rgba(253,224,71,.9)"; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(x + T_M / 2, y + T_M / 2, pulse, 0, 7); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }
  function drawGhost(ctx, gh) {
    const R = T_M * 0.46, x = gh.x, y = gh.y;
    let body = gh.color;
    if (gh.state === "fright") body = fright < 2 && Math.floor(fright * 6) % 2 ? "#f8fafc" : "#3730a3";
    if (gh.state !== "eyes") {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y - 1, R, Math.PI, 0);
      ctx.lineTo(x + R, y + R * 0.85);
      for (let i = 0; i < 3; i++) {
        const w = (R * 2) / 3;
        ctx.quadraticCurveTo(x + R - w * (i + 0.5), y + R * 0.4, x + R - w * (i + 1), y + R * 0.85);
      }
      ctx.closePath(); ctx.fill();
    }
    /* eyes */
    const ex = gh.dir.x * 2, ey = gh.dir.y * 2;
    if (gh.state === "fright") {
      ctx.fillStyle = body === "#f8fafc" ? "#dc2626" : "#fff";
      [-3.4, 3.4].forEach(o => { ctx.beginPath(); ctx.arc(x + o, y - 2, 1.8, 0, 7); ctx.fill(); });
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) ctx[i ? "lineTo" : "moveTo"](x - 5 + i * 3.4, y + 4 + (i % 2 ? -1.6 : 1.6));
      ctx.stroke();
      return;
    }
    [-3.6, 3.6].forEach(o => {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(x + o, y - 2, 3.1, 3.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#1e3a8a";
      ctx.beginPath(); ctx.arc(x + o + ex, y - 2 + ey, 1.7, 0, 7); ctx.fill();
    });
  }
  function draw() {
    const ctx = g.ctx;
    g.clear("#05070f");
    drawMaze(ctx);
    /* player */
    const R = T_M * 0.44;
    const open01 = dying > 0 ? clamp(1 - dying / 1.2, 0, 1) : Math.abs(Math.sin(mouth)) * 0.9;
    const a = (dying > 0 ? 0.02 + open01 * 1.5 : 0.06 + open01 * 0.55);
    const face = Math.atan2(player.dir.y, player.dir.x) || (player.dir.x === 0 && player.dir.y === 0 ? 0 : 0);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(face);
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, dying > 0 ? R * (1 - open01 * 0.35) : R, a, Math.PI * 2 - a);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (dying <= 0) ghosts.forEach(gh => drawGhost(ctx, gh));

    if (flash > 0 && Math.floor(flash * 6) % 2) {
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fillRect(0, 0, M_COLS * T_M, M_ROWS * T_M);
    }
    if (pauseT > 0) g.text("READY", M_COLS * T_M / 2, M_ROWS * T_M - 10, 12, "#fde047", 800);
  }
  reset();
  return { reset, update, draw };
}
MATTGAMES.define("chomper", makeChomper);
})();
