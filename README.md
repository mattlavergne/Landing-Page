# mattlavergne.com

The landing page for **mattlavergne.com**, framed from the point of view of a
speck of dust: computer parts (CPU, RAM, GPU, PSU, I/O bus) tower over you at
proportional scale, Apple-keynote style.

Served by a Cloudflare Worker that fronts the whole domain — the portfolio is a
static asset, and `/trafficmap` is reverse-proxied to a separate project.

## Layout

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole site — one self-contained file (all CSS/JS inline). **The only file you normally edit.** |
| `src/index.js` | The Cloudflare Worker: proxies `/trafficmap*`, serves the landing page for everything else. |
| `wrangler.toml` | Worker + static-assets + routes config. |
| `.github/workflows/deploy.yml` | Deploys to Cloudflare on every push to `main`. |

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

## Add a project

Open `public/index.html`, find the `PROJECTS` array near the top of the
`<script>`, and copy an existing entry:

```js
{
  name:"My New Thing",
  url:"https://mattlavergne.com/newthing",  // "/path", "https://…", or "#"
  status:"live",         // "live" → green LIVE badge, otherwise "soon"
  label:"Case study",    // badge text when status isn't "live"
  tags:["Python","IoT"],
  wide:true              // true = full-width card
}
```

Save, commit, push. Done.
