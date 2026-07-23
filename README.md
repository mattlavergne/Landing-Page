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
| `public/index.html` | The whole OS — one self-contained file (all CSS/JS inline, no build, no CDN). **The only file you normally edit.** |
| `src/index.js` | The Cloudflare Worker: proxies `/trafficmap*`, serves the landing page for everything else. |
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

- `/trafficmap` → redirect to `/trafficmap/`
- `/trafficmap/*` → reverse-proxied to the traffic map's GitHub Pages site
- everything else → `public/index.html` (the portfolio)

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

Projects are the files in the Finder (and entries in Spotlight & the Dock).
Open `public/index.html`, find the `PROJECTS` array near the top of the
`<script>`, and copy an existing entry:

```js
{
  slug:"newthing",                 // unique id (used for the window + deep-link)
  name:"My New Thing",             // display name
  kind:"app",                      // "app" → shows a .app suffix; "case" → case study
  status:"live",                   // "live" → green Live badge; anything else → "soon"
  url:"/newthing",                 // "/path", "https://…", or "#"
  icon:"sparkle",                  // one of: globe, sparkle, wave, flow, folder, note
  modified:"Live",                 // small caption under the icon
  size:"—",
  tagline:"One-line summary",
  tags:["Python","IoT"],
  desc:"A sentence or two shown in the project window.",
  launch:"Open the live app"       // button label when live (null → "Coming soon")
}
```

Save, commit, push. The project appears everywhere automatically. To change the
bio, skills, or experience, edit the `PROFILE`, `SKILLS`, and `EXPERIENCE`
objects right above `PROJECTS`.
