# mattlavergne.com — landing page

The portfolio landing page for **mattlavergne.com**, framed from the point of
view of a speck of dust: computer parts (CPU, RAM, GPU, PSU, I/O bus) tower
over you at proportional scale, Apple-keynote style.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole site — one self-contained file (all CSS/JS inline, no external assets). **This is the only file you edit.** |
| `build-worker.js` | Wraps `index.html` into `worker.js`. Run with `node build-worker.js`. |
| `worker.js` | Auto-generated. The Cloudflare Worker that serves the site. Don't edit by hand. |

## How mattlavergne.com is served

A single Cloudflare Worker owns the whole domain (Workers Route
`mattlavergne.com/*`):

- `/trafficmap` and `/trafficmap/*` → reverse-proxied to the traffic map's
  GitHub Pages site (unchanged).
- **everything else** → this landing page.

## Deploy / update

1. Edit `index.html` (see "Add a project" below).
2. Regenerate the Worker:
   ```
   node build-worker.js
   ```
3. Ship it, either way:
   - **Dashboard:** Cloudflare → Workers & Pages → `trafficmap-proxy` →
     *Edit code* → paste the contents of `worker.js` → **Save and Deploy**.
   - **CLI:** `npx wrangler deploy` (if the Worker is set up with Wrangler).

The Workers Route stays `mattlavergne.com/*` — no routing changes needed, and
the live traffic map is unaffected.

## Add a project

Open `index.html`, find the `PROJECTS` array near the top of the `<script>`,
and copy an existing entry:

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

Save, run `node build-worker.js`, and deploy. That's it.
