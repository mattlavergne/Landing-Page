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
- **Dock** — magnifies on hover; launches apps; shows running indicators.
- **Windows** — draggable, resizable, focusable, with working traffic-light
  controls (close / minimize / zoom).
- **Apps** — Finder (the project browser), About This Machine, Activity Monitor
  (skills as a live load graph), Career, Contact, Terminal (`help`, `neofetch`,
  `open <project>`, `theme`, …), and README.
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

A few things aren't spelled out on screen: the **Konami code**
(`↑ ↑ ↓ ↓ ← → ← → B A`), a **screensaver** after a minute idle, secret
**Terminal** commands (`matrix`, `coffee`, `42`, `hire`, `credits`, `party`,
`sl`, `sudo`), clickable **battery/Wi-Fi/clock** in the menu bar, and a
**Trash** that reveals a hint after a few clicks. The Konami code unlocks a
`Secrets.txt` on the desktop that documents them all.
