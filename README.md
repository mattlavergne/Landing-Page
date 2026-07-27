# mattlavergne.com

The landing page for **mattlavergne.com**, built as **mattOS** — a fully
interactive desktop operating system rendered in the browser. Visitors boot
into a liquid-glass desktop with a menu bar, a magnifying dock, draggable
windows, Spotlight search, a working Terminal, and a Finder that houses the
portfolio's projects (the live [Traffic Map](https://mattlavergne.com/trafficmap),
a map background generator, and more).

The design language — translucent glass panels, inset edge highlights, a
refractive sheen, heavy backdrop blur, the blue accent, and auto/light/dark
theming — is shared deliberately with the [Lafayette Traffic map](https://mattlavergne.com/trafficmap)
so the two sites read as one system.

Served by a Cloudflare Worker that fronts the whole domain — the portfolio is a
static asset, and `/trafficmap` is reverse-proxied to a separate project.

## Layout

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole OS, one self-contained file (all CSS/JS inline, no build, no CDN). **The file you normally edit.** |
| `public/app.html` | The **app-window shell**: renders one project as a browser-style window on the mattOS desktop. One shell serves every framed project. |
| `public/games/engine.js` | The **Arcade engine**: the stage every game runs on, plus the registry and the on-demand loader. Machinery only. |
| `public/games/catalog.js` | The list of games (name, icon, sizes, controls). Metadata only, so the desktop can show the arcade without downloading any game. |
| `public/games/<id>.js` | **One file per game** — `snake.js`, `chomper.js`, `stacks.js`, … Fetched the first time that game is opened. |
| `public/apps/registry.js` | The **bundled apps**: metadata + loader, same pattern as the arcade. |
| `public/apps/<id>.js` | **One file per app** — Calculator, Notes, Clock, Weather, Sketch, Music, Achievements. Each ships its own CSS and loads on demand. |
| `public/shell.js` | The rest of **mattsh**: a small filesystem, `sudo`, a text adventure, and a pile of joke commands. Loads with the Terminal. |
| `public/eggs.js` | The **achievement registry** and every easter egg that isn't in the shell. Loads last. |
| `src/index.js` | The Cloudflare Worker: serves framed apps, proxies their embedded content, and serves the landing page for everything else. |
| `wrangler.toml` | Worker + static-assets + routes config. |
| `.github/workflows/deploy.yml` | Deploys to Cloudflare on every push to `main`. |

## What's in the OS

Everything is real and interactive:

- **Boot sequence** → **Desktop** with animated liquid-glass wallpaper, clock &
  status widgets, and desktop icons.
- **Menu bar** — Apple-style  menu, contextual app menu, Go / Window / Help,
  and a system tray (Spotlight, Control Center, Wi-Fi, theme toggle, battery,
  clock).
- **Dock** — magnifies on hover; launches apps; shows running indicators;
  right-click a tile for its menu.
- **Launchpad** (`F4` / `⌘⇧A` / the Dock tile) — every app, game and pinned
  project on one searchable screen.
- **Mission Control** (`F3`) — spreads every open window out; click one to focus.
- **Force Quit** (`⌘⌥⎋`) — a real process list. Some processes take it personally.
- **Windows** — draggable, resizable, focusable, with working traffic-light
  controls (close / minimize / zoom).
- **Apps** — Finder (the project browser), About This Machine, Activity Monitor
  (skills as a live load graph), Career, Contact, Terminal (`help`, `neofetch`,
  `open <project>`, `theme`, `play <game>`, …), README, the **Arcade**, and the
  bundled apps: **Calculator**, **Notes** (persists), **Clock** (world clock,
  stopwatch, timer), **Weather** (live Lafayette conditions), **Sketch**,
  **Music** (chiptunes synthesized in the browser — no audio files) and
  **Achievements**.
- **Arcade** — nine games written from scratch, each opening in its own window
  *and* at its own URL (`/arcade/snake`): **Snake**, **Chomper** (a Pac-Man
  style maze chase with four ghosts, power pellets and a wrap-around tunnel),
  **Flap**, **Bricks**, **Twenty48**, **Stacks** (falling blocks), **Invaders**,
  **Hopper** (cross the road, ride the logs) and **Sweeper** (Minesweeper).
  Keyboard on a desktop; swipes and an on-screen pad on a phone. High scores
  persist per device.
- **Spotlight** (`⌘K` / `Ctrl-K`), **Control Center**, right-click **context
  menu**, **notifications**, and a **lock screen**.

Preferences (theme, wallpaper palette, brightness, Finder view) persist in
`localStorage`. Reduced-motion is respected, and the page ships a crawlable /
no-JS summary for SEO and accessibility.

## Routing

The Worker owns `mattlavergne.com/*`:

- `/trafficmap` → the **app-window shell** (`public/app.html`): the traffic map
  framed as an application window on the mattOS desktop, with working close /
  minimize / zoom controls and an address bar.
- `/trafficmap/_app/*` → reverse-proxied to the traffic map's GitHub Pages
  site. This is the raw map, and it's what the app window's iframe loads.
- `/apps` and `/apps/<app>` → the desktop, opening that app's window
  (`/apps/calculator`, `/apps/notes`, …). The pattern ignores anything with a
  dot in it, so the real files under `/apps/` are still served as files.
- `/arcade` and `/arcade/<game>` → **the desktop itself** (`public/index.html`),
  which opens the matching window on arrival. The arcade is not a separate
  site, so it does not need the framed shell: inside the desktop, opening a
  game just pushes its URL with the History API (no reload, no flicker), and a
  shared link or a refresh boots straight into that window.
- everything else → `public/index.html` (the portfolio) and its static assets.

## Framed apps (windowed projects)

Any project can open at its own pretty URL while *looking* like an app running
on the desktop: same wallpaper, the same menu bar (with a working Control
Center), wrapped in a browser-style window that opens **maximized**. The close
and minimize buttons return to the desktop; the green zoom button toggles a
smaller floating window; the pop-out button opens the content full-screen in a
new tab. Theme, wallpaper, and brightness follow whatever the visitor picked on
the desktop (shared `localStorage`) and can be changed right from the app's
Control Center. On phones the window is always full-bleed and touch-sized.

**Everything is driven by one registry** — the `APPS` object near the top of
`src/index.js`:

```js
const APPS = {
  "/trafficmap": {
    title: "Traffic Map",                 // shown in the menu bar + tab title
    subtitle: "Lafayette 911 · live incident map",
    address: "mattlavergne.com/trafficmap",   // text in the address bar
    accent: "#1573c9",                    // per-app accent color (optional)
    // Reverse-proxy the real content under /trafficmap/_app/* :
    proxy: "https://mattlavergne.github.io/Lafayette-911-Traffic",
  },
};
```

To add another framed project, add one entry. The key is the pretty URL. Point
it at **either**:

- `proxy: "<origin>"` — the Worker reverse-proxies `<path>/_app/*` to that
  origin (use this for a separate site, like a GitHub Pages project), **or**
- `embed: "/some/path"` — a URL already reachable on this domain (a static
  asset, another route). No proxying is done.

The shell, window chrome, and controls come for free. Nothing else to wire up.

## Deploying

Push to `main` and GitHub Actions runs `wrangler deploy` for you — no manual
steps. (You can also deploy by hand with `npx wrangler deploy`.)

### One-time setup for auto-deploy

Add two repository secrets in **GitHub → Settings → Secrets and variables →
Actions**:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → *Create Token* → **Edit Cloudflare Workers** template. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → right sidebar (Account ID). |

The workflow deploys the Worker named `trafficmap-proxy` (same as the existing
one) with the routes in `wrangler.toml`, so it takes over the domain in place.

## Add or edit a project

**One list drives the whole OS.** Every project comes from the `PROJECTS`
array near the top of the `<script>` in `public/index.html`. Add one object
and it shows up **consistently everywhere** — the Finder, Spotlight search, and
its own project window. Set `pinned: true` and it *also* gets an icon on the
**Desktop** and in the **Dock**. Nothing is hard-coded per-project anymore.

Copy an existing entry:

```js
{
  slug:"newthing",                 // unique id (used for the window + deep-link)
  name:"My New Thing",             // display name
  kind:"app",                      // "app" → shows a .app suffix; "case" → case study
  status:"live",                   // "live" → Live badge · "production" → In-production
                                   //   badge (no public link) · anything else → "soon"
  url:"/newthing",                 // "/path", "https://…", or "#"
  pinned:true,                     // OPTIONAL — also show on the Desktop + Dock
  icon:"sparkle",                  // one of: globe, sparkle, wave, flow, folder, note
  modified:"Live",                 // small caption under the icon
  size:"—",
  tagline:"One-line summary",
  tags:["Python","IoT"],
  desc:"A sentence or two shown in the project window.",
  launch:"Open the live app"       // button label when live (null → default)
}
```

Save, commit, push. The project appears everywhere automatically. Pin your best
one or two so the Desktop/Dock stay uncluttered; leave the rest to live in the
Finder. To change the bio, skills, or experience, edit the `PROFILE`, `SKILLS`,
`EXPERIENCE`, and `EDUCATION` objects right above `PROJECTS`.

## The Arcade

Nine games, **one file each**, in `public/games/`:

```
public/games/
  engine.js     the stage + registry + loader   (machinery only)
  catalog.js    the list of games               (metadata only)
  snake.js  chomper.js  flap.js  bricks.js  twenty48.js
  stacks.js invaders.js hopper.js sweeper.js    (one game per file)
```

The desktop loads `engine.js` and `catalog.js` — enough to *list* the arcade
everywhere — and a game's own file is fetched the first time someone opens it
(and preloaded on hover). So the landing page never pays for games nobody
plays, and no game code lives in `index.html`.

The API:

```js
MATTGAMES.list             // metadata for every game
MATTGAMES.best(id)         // this visitor's high score
MATTGAMES.mount(id, host)  // playable instance in an element; {destroy(), ready}
MATTGAMES.define(id, fn)   // how a game file registers itself
MATTGAMES.util             // helpers the game files share
```

The stage handles everything a game shouldn't have to: a canvas with fixed
logical coordinates that letterboxes into any window or phone, a HUD, start /
pause / game-over overlays, keyboard **and** swipe **and** on-screen controls,
sound with a remembered mute, high scores in `localStorage`, pausing when a
window is minimized or the tab is hidden, and teardown when the window closes.

### Every game is also a URL

`mattlavergne.com/arcade/snake` is a real address, like `/trafficmap` is:

- **Inside the desktop**, opening a game window pushes that URL with the
  History API. Nothing reloads — the transition is just a window opening — but
  the address bar tracks what you are looking at, and Back closes the game.
- **Cold**, the Worker serves the desktop for `/arcade/*` and it boots straight
  into that window (short boot, no Finder, no welcome toast).

The route table is built from the catalog (`ROUTES` in `index.html`), so a new
game gets its URL for free.

### To add a game

1. Write `public/games/<id>.js`:

```js
(function () {
"use strict";
const { rnd, clamp, rrect, Sound } = MATTGAMES.util;

MATTGAMES.define("pong", function (g) {
  function reset() { /* new game */ }
  function update(dt) { /* g.addScore(1), g.gameOver("…"), g.onDir, g.onAction … */ }
  function draw() { /* g.ctx, g.clear(), g.text(), in a g.W × g.H field */ }
  reset();
  return { reset, update, draw };
});
})();
```

2. Add one entry to `catalog.js`:

```js
{
  id:"pong", name:"Pong", tagline:"One-line summary",
  tags:["Classic"], icon: ICONS.pong,       // squircle tile, like the app icons
  w:480, h:600,                             // its mattOS window size
  stage:{ w:360, h:480, pad:"dpad" },       // logical field + touch controls
                                            //   "dpad" | "dpad+" | "lr" | "tap"
                                            //   | "toggle" | "none"
  help:"Shown on the start overlay.",
  hintKeys:"Arrow keys / WASD", hintTouch:"Swipe anywhere"
}
```

It then appears in the Arcade window, the Dock, the Finder, Spotlight, the
Terminal (`arcade`, `play pong`) and at `/arcade/pong` — automatically. If the
arcade files ever fail to load, the desktop simply has no Arcade and nothing
else breaks.

## The bundled apps

Same pattern as the arcade, one folder over:

```
public/apps/
  registry.js   metadata + loader          (machinery)
  calculator.js notes.js  clock.js  weather.js
  sketch.js     music.js  achievements.js  (one app per file, each with its CSS)
```

`registry.js` holds only names, icons and window sizes, so the Dock, Launchpad,
Finder and Spotlight can list every app without downloading one. An app's file
arrives when its window opens (the frame shows a spinner for the blink it takes).

**To add an app**: write `public/apps/<id>.js` —

```js
MATTAPPS.style("<id>", `.my-app{…}`);          // its CSS, injected once
MATTAPPS.define("<id>", {
  body(){ return `<div class="my-app">…</div>`; },
  mount(body, id, node){ /* wire it up */ },
  unmount(node){ /* stop timers, remove listeners */ }
});
```

— then add one entry to `LIST` in `registry.js` (`dock:true` also puts it in the
Dock). It appears everywhere else automatically, including at `/apps/<id>`.

The Weather app is the only thing on the site that talks to a third party
(Open-Meteo — no key, no account). If the request fails it says so and offers a
retry rather than inventing a forecast.

## Hidden things

mattOS has **42 achievements**, and finding them all unlocks *mattOS Pro*: a
gold wallpaper, one more game, and a note. The system lives in two files:

- `public/eggs.js` — the registry (`id`, `name`, `desc`, `hint`) and the wiring
  for everything outside the Terminal. It only talks to the desktop through
  `window.MATTOS`, the small bridge exposed by `index.html`.
- `public/shell.js` — the Terminal half: a read-only filesystem (`ls -a`, `cat`,
  `cd`, `find`, `tree`), a `sudo` that eventually gives in, a key hidden in a
  file, a text adventure with a real ending, and a stack of joke commands.

The **Achievements** app shows unlocked entries in full and locked ones as a
cryptic hint only — enough to prove something is there, never enough to hand it
over. Two of the eleven arcade games are hidden until they're earned; their URLs
work regardless, which is the reward for knowing about them.

**To add an egg**: append one entry to `EGGS` in `eggs.js`, then call
`MATTOS.egg("<id>")` from wherever it should fire (an app, the shell, a DOM
listener). The toast, the confetti, the persistence and the progress ring are
handled for you.

## Contact form (the Mail app)

The **Contact** app is a real Mail-style composer that sends messages straight
to your inbox — no backend required. It POSTs to
[FormSubmit](https://formsubmit.co), a free form-to-email relay, configured in
the `CONTACT` object near the top of the `<script>`:

```js
const CONTACT = {
  to: "contact@mattlavergne.com",
  toName: "Matt Lavergne",
  endpoint: "https://formsubmit.co/ajax/contact@mattlavergne.com"
};
```

**One-time activation:** the *first* message ever sent triggers a confirmation
email from FormSubmit to `contact@mattlavergne.com`. Click the link in it once,
and every message after that is delivered instantly. (Send yourself a test
message to kick this off.) A honeypot field guards against basic spam bots, and
if the network request ever fails the composer falls back to opening the
visitor's own mail app pre-filled — so it never dead-ends.

Prefer a different service? Swap `endpoint` for a
[Web3Forms](https://web3forms.com) URL (immediate delivery, needs a free access
key) or a `POST` route on your own Cloudflare Worker — the payload is JSON with
`name`, `email`, `message`, and `_subject`.

## Hidden extras

Nothing here is spelled out on screen, on purpose. The **Achievements** app
(Launchpad, or Spotlight) keeps score and gives one hint per locked entry; the
full list with answers is `EGGS` in `public/eggs.js`, and the Terminal half is
`public/shell.js`. The Konami code still works, and still unlocks `Secrets.txt`
on the desktop.
