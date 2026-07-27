/* ══════════════════════════════════════════════════════════════════
   mattOS Arcade — the catalog.

   Every game listed here appears automatically in the Arcade window,
   the Dock, the Finder, Spotlight, the Terminal (`arcade`, `play`),
   and at its own URL: mattlavergne.com/arcade/<id>.

   This file holds metadata ONLY — name, icon, sizes, controls — so the
   desktop can list the games without downloading any of them.  A game's
   code lives in ./<id>.js and is fetched the first time it is opened.

   ── Add a game ────────────────────────────────────────────────────
   1. Write /games/<id>.js:  MATTGAMES.define("<id>", g => ({reset, update, draw}))
   2. Add one entry below.
   Nothing else to wire up.

     id         must match the file name and the URL
     stage.w/h  the game's logical play field; it is letterboxed to fit
                whatever window or phone it lands in, so pick whatever
                proportions the game wants
     stage.pad  on-screen controls for touch:
                  "dpad"   four-way pad          "dpad+"  pad + an action key
                  "lr"     left / right only     "tap"    one big action key
                  "toggle" a sticky mode key     "none"   nothing
     stage.swipe  false to stop swipes being read as direction presses
     stats      HUD readouts; "score" and "best" are the default pair
     w/h        the size of its mattOS window on a desktop
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const { squircle } = MATTGAMES.util;

const ICONS = {
  arcade: squircle(["#fb7185", "#c026d3"],
    `<rect x="24" y="38" width="52" height="34" rx="9" fill="#fff"/>
     <rect x="31" y="49" width="5" height="13" rx="2.5" fill="#c026d3"/><rect x="27" y="53" width="13" height="5" rx="2.5" fill="#c026d3"/>
     <circle cx="62" cy="52" r="4" fill="#fb7185"/><circle cx="70" cy="60" r="4" fill="#38bdf8"/>
     <path d="M38 38V30a12 12 0 0 1 24 0v8" fill="none" stroke="#fff" stroke-width="5"/>`, "ar"),
  snake: squircle(["#4ade80", "#15803d"],
    `<path d="M28 66h20a8 8 0 0 0 8-8V44a8 8 0 0 1 8-8h8" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="34" cy="34" r="6" fill="#fff"/>`, "sn"),
  chomper: squircle(["#fde047", "#f59e0b"],
    `<path d="M50 22a28 28 0 1 0 0 56 28 28 0 0 0 24-14L50 50l24-14A28 28 0 0 0 50 22z" fill="#fff"/>
     <circle cx="46" cy="36" r="4" fill="#f59e0b"/>`, "ch"),
  flap: squircle(["#38bdf8", "#2563eb"],
    `<ellipse cx="46" cy="52" rx="20" ry="17" fill="#fff"/><circle cx="55" cy="46" r="4" fill="#2563eb"/>
     <path d="M66 50l12-6v14z" fill="#fde047"/><path d="M30 52c6-9 16-9 20 0-6 8-15 8-20 0z" fill="#bae6fd"/>`, "fl"),
  bricks: squircle(["#a78bfa", "#6d28d9"],
    `<rect x="24" y="26" width="24" height="11" rx="3" fill="#fff"/><rect x="52" y="26" width="24" height="11" rx="3" fill="#fff" opacity=".75"/>
     <rect x="24" y="41" width="24" height="11" rx="3" fill="#fff" opacity=".75"/><rect x="52" y="41" width="24" height="11" rx="3" fill="#fff"/>
     <circle cx="50" cy="62" r="5" fill="#fde047"/><rect x="34" y="72" width="32" height="7" rx="3.5" fill="#fff"/>`, "br"),
  twenty48: squircle(["#fbbf24", "#ea580c"],
    `<rect x="24" y="24" width="24" height="24" rx="6" fill="#fff"/><rect x="52" y="24" width="24" height="24" rx="6" fill="#fff" opacity=".55"/>
     <rect x="24" y="52" width="24" height="24" rx="6" fill="#fff" opacity=".55"/><rect x="52" y="52" width="24" height="24" rx="6" fill="#fff"/>
     <text x="36" y="42" font-family="Helvetica,Arial" font-size="15" font-weight="700" fill="#ea580c" text-anchor="middle">2</text>
     <text x="64" y="70" font-family="Helvetica,Arial" font-size="15" font-weight="700" fill="#ea580c" text-anchor="middle">4</text>`, "tw"),
  stacks: squircle(["#22d3ee", "#0e7490"],
    `<rect x="22" y="46" width="18" height="18" rx="3" fill="#fff"/><rect x="40" y="46" width="18" height="18" rx="3" fill="#fff" opacity=".7"/>
     <rect x="40" y="28" width="18" height="18" rx="3" fill="#fff" opacity=".7"/><rect x="58" y="46" width="18" height="18" rx="3" fill="#fff"/>
     <rect x="22" y="66" width="54" height="10" rx="3" fill="#fde047"/>`, "st"),
  invaders: squircle(["#34d399", "#047857"],
    `<path d="M36 30h6v6h16v-6h6v6h6v10h6v14h-6v-6h-6v12h-6v-6H42v6h-6V56h-6v6h-6V46h6V36h6z" fill="#fff"/>
     <rect x="30" y="72" width="40" height="6" rx="3" fill="#fde047"/><rect x="46" y="64" width="8" height="8" rx="2" fill="#fde047"/>`, "in"),
  hopper: squircle(["#f472b6", "#9333ea"],
    `<ellipse cx="50" cy="52" rx="17" ry="15" fill="#fff"/><circle cx="43" cy="45" r="4" fill="#9333ea"/><circle cx="57" cy="45" r="4" fill="#9333ea"/>
     <path d="M30 40c-4-6-2-12 3-13s8 5 6 11M70 40c4-6 2-12-3-13s-8 5-6 11" fill="#fff"/>
     <path d="M26 72h48" stroke="#fde047" stroke-width="5" stroke-linecap="round" stroke-dasharray="9 8"/>`, "ho"),
  dino: squircle(["#e2e8f0", "#94a3b8"],
    `<path d="M38 30h16v10h8v14h-8v10h-6l-4 14h-8l4-14h-8V54h-6V40h6V30z" fill="#334155"/>
     <rect x="26" y="72" width="48" height="4" rx="2" fill="#334155"/>
     <circle cx="50" cy="35" r="2.4" fill="#f8fafc"/>`, "di"),
  pong: squircle(["#0f172a", "#000000"],
    `<rect x="20" y="34" width="7" height="32" rx="3" fill="#fff"/>
     <rect x="73" y="42" width="7" height="32" rx="3" fill="#fb7185"/>
     <circle cx="52" cy="52" r="6" fill="#fde047"/>
     <path d="M50 20v60" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-dasharray="6 8"/>`, "po"),
  sweeper: squircle(["#94a3b8", "#334155"],
    `<rect x="22" y="22" width="24" height="24" rx="5" fill="#fff"/><rect x="54" y="22" width="24" height="24" rx="5" fill="#fff" opacity=".5"/>
     <rect x="22" y="54" width="24" height="24" rx="5" fill="#fff" opacity=".5"/>
     <circle cx="66" cy="66" r="11" fill="#fff"/><path d="M66 51v30M51 66h30" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
     <text x="34" y="41" font-family="Helvetica,Arial" font-size="17" font-weight="700" fill="#334155" text-anchor="middle">3</text>`, "sw")
};

MATTGAMES.icons = ICONS;

MATTGAMES.setCatalog([
  {
    id: "snake", name: "Snake", tagline: "Eat, grow, don't bite yourself",
    tags: ["Classic", "Arcade"], icon: ICONS.snake, w: 480, h: 600,
    stage: { w: 420, h: 420, pad: "dpad" },
    help: "Steer the snake into the food. Every bite makes you longer and a little faster. Walls and your own tail are fatal.",
    hintKeys: "Arrow keys / WASD  ·  P pauses  ·  R restarts",
    hintTouch: "Swipe anywhere, or use the pad below"
  },
  {
    id: "chomper", name: "Chomper", tagline: "Clear the maze, dodge four ghosts",
    tags: ["Maze", "Arcade"], icon: ICONS.chomper, w: 480, h: 640,
    stage: { w: 380, h: 420, pad: "dpad" },
    stats: [{ key: "score", label: "Score" }, { key: "best", label: "Best" },
            { key: "level", label: "Maze" }, { key: "lives", label: "Lives" }],
    help: "Eat every dot to clear the maze. The four big pellets turn the ghosts blue: eat them for 200, 400, 800, 1600. The side tunnel wraps around.",
    hintKeys: "Arrow keys / WASD  ·  P pauses  ·  R restarts",
    hintTouch: "Swipe anywhere, or use the pad below"
  },
  {
    id: "flap", name: "Flap", tagline: "One tap, endless pipes",
    tags: ["One-button", "Endless"], icon: ICONS.flap, w: 420, h: 640,
    stage: { w: 320, h: 480, pad: "tap", tapLabel: "FLAP", swipe: false },
    help: "Tap, click or press space to flap. Thread every gap. It speeds up the longer you last.",
    hintKeys: "Space / click to flap",
    hintTouch: "Tap the screen to flap"
  },
  {
    id: "bricks", name: "Bricks", tagline: "Break every brick, keep the ball alive",
    tags: ["Paddle", "Classic"], icon: ICONS.bricks, w: 520, h: 620,
    stage: { w: 380, h: 440, pad: "lr", swipe: false },
    stats: [{ key: "score", label: "Score" }, { key: "best", label: "Best" },
            { key: "level", label: "Level" }, { key: "lives", label: "Balls" }],
    help: "Drag or steer the paddle, bounce the ball, and clear the wall. Each cleared board gets faster and gappier.",
    hintKeys: "Mouse, or ← → keys  ·  Space launches",
    hintTouch: "Drag the paddle  ·  Tap to launch"
  },
  {
    id: "twenty48", name: "Twenty48", tagline: "Slide tiles, chase 2048",
    tags: ["Puzzle", "Numbers"], icon: ICONS.twenty48, w: 460, h: 580,
    stage: { w: 380, h: 418, pad: "dpad" },
    help: "Slide the board in any direction. Matching tiles merge and double. Reach 2048, then keep going.",
    hintKeys: "Arrow keys / WASD  ·  R restarts",
    hintTouch: "Swipe the board, or use the pad"
  },
  {
    id: "stacks", name: "Stacks", tagline: "Falling blocks, clean lines",
    tags: ["Puzzle", "Classic"], icon: ICONS.stacks, w: 480, h: 660,
    stage: { w: 340, h: 480, pad: "dpad+", tapLabel: "DROP" },
    stats: [{ key: "score", label: "Score" }, { key: "best", label: "Best" },
            { key: "level", label: "Level" }, { key: "lines", label: "Lines" }],
    help: "Rotate and drop the falling pieces to complete solid rows. Four rows at once is the big score. Every ten rows the drop gets faster.",
    hintKeys: "← → move · ↑ rotate · ↓ soft drop · Space hard drop",
    hintTouch: "Swipe to move, tap to rotate, swipe down to drop"
  },
  {
    id: "invaders", name: "Invaders", tagline: "Hold the line, wave after wave",
    tags: ["Shooter", "Arcade"], icon: ICONS.invaders, w: 520, h: 620,
    stage: { w: 380, h: 440, pad: "lr", swipe: false },
    stats: [{ key: "score", label: "Score" }, { key: "best", label: "Best" },
            { key: "level", label: "Wave" }, { key: "lives", label: "Ships" }],
    help: "Move along the bottom and shoot the formation before it reaches you. The fewer aliens left, the faster they come. Bunkers take the hits you don't.",
    hintKeys: "← → to move  ·  Space to fire",
    hintTouch: "Drag to move  ·  Tap to fire"
  },
  {
    id: "hopper", name: "Hopper", tagline: "Cross the road, ride the logs",
    tags: ["Arcade", "Timing"], icon: ICONS.hopper, w: 480, h: 620,
    stage: { w: 380, h: 440, pad: "dpad" },
    stats: [{ key: "score", label: "Score" }, { key: "best", label: "Best" },
            { key: "level", label: "Level" }, { key: "lives", label: "Lives" }],
    help: "Hop to the lily pads at the top. Traffic squashes you, water drowns you, so ride the logs across. Fill all five pads to move up a level.",
    hintKeys: "Arrow keys / WASD to hop",
    hintTouch: "Swipe to hop, or use the pad below"
  },
  {
    id: "sweeper", name: "Sweeper", tagline: "Find every mine, trip none",
    tags: ["Puzzle", "Logic"], icon: ICONS.sweeper, w: 520, h: 600,
    stage: { w: 380, h: 420, pad: "toggle", tapLabel: "FLAG", swipe: false },
    stats: [{ key: "score", label: "Score" }, { key: "best", label: "Best" },
            { key: "mines", label: "Mines" }, { key: "time", label: "Time" }],
    help: "Numbers count the mines touching that square. Clear every safe square to win. Right-click (or the flag button) marks a mine; on a phone, long-press does the same.",
    hintKeys: "Click to clear  ·  Right-click to flag  ·  R restarts",
    hintTouch: "Tap to clear  ·  Long-press to flag"
  },

  /* ── hidden ──────────────────────────────────────────────────────
     `hidden` keeps a game out of every listing until it is unlocked.
     Its URL still works, which is rather the point of a reward. */
  {
    id: "dino", name: "No Connection", tagline: "The offline classic", hidden: true,
    tags: ["Endless", "Hidden"], icon: ICONS.dino, w: 620, h: 480,
    stage: { w: 600, h: 360, pad: "dpad", swipe: true },
    help: "Jump the cacti, duck the birds. It gets faster, and night falls every few hundred metres.",
    hintKeys: "Space / ↑ to jump  ·  ↓ to duck",
    hintTouch: "Tap to jump  ·  swipe down to duck"
  },
  {
    id: "pong", name: "Pong", tagline: "1972, still undefeated", hidden: true,
    tags: ["Classic", "Hidden"], icon: ICONS.pong, w: 620, h: 470,
    stage: { w: 520, h: 340, pad: "dpad", swipe: false },
    stats: [{ key: "score", label: "Score" }, { key: "best", label: "Best" },
            { key: "you", label: "You" }, { key: "cpu", label: "CPU" }],
    help: "First to seven. Hit the ball with the edge of the paddle to change its angle.",
    hintKeys: "↑ ↓ or the mouse",
    hintTouch: "Drag to move your paddle"
  }
]);
})();
