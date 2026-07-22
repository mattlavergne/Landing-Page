// Builds worker.js from index.html.
//
// The landing page is a single self-contained HTML file. This wraps it,
// safely escaped, into the Cloudflare Worker that fronts mattlavergne.com —
// keeping index.html as the one place you edit (add projects, tweak copy).
//
//   1. Edit index.html
//   2. Run:  node build-worker.js
//   3. Paste the new worker.js into the Cloudflare dashboard (Edit code)
//      and Save & Deploy  — or, if you use Wrangler:  npx wrangler deploy
//
// The /trafficmap reverse-proxy logic below is unchanged from the original
// Worker, so the live traffic map keeps working exactly as before.

const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// Escape so the HTML can live inside a JS template literal:
//   \  ->  \\      backtick -> \`      ${ -> \${
const escaped = html
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const worker = `// AUTO-GENERATED FROM index.html — do not edit by hand.
// Regenerate with:  node build-worker.js
//
// Cloudflare Worker for mattlavergne.com.
// - /trafficmap* reverse-proxies to the traffic map's GitHub Pages site.
// - Everything else serves the portfolio landing page (built from index.html).
//
// Setup: paste this into the mattlavergne.com Worker (Edit code), Save &
// Deploy. The Workers Route mattlavergne.com/* stays as-is so this Worker
// keeps owning the whole domain.

const ORIGIN = "https://mattlavergne.github.io/Lafayette-911-Traffic";
const PREFIX = "/trafficmap";

const LANDING_HTML = \`${escaped}\`;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // /trafficmap -> /trafficmap/ so the map's relative asset URLs resolve.
    if (url.pathname === PREFIX) {
      return Response.redirect(url.origin + PREFIX + "/" + url.search, 301);
    }

    // Anything outside /trafficmap/ is the portfolio landing page.
    if (!url.pathname.startsWith(PREFIX + "/")) {
      return new Response(LANDING_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // /trafficmap/* -> reverse-proxy to GitHub Pages (unchanged).
    const originUrl = ORIGIN + url.pathname.slice(PREFIX.length) + url.search;
    const originResponse = await fetch(originUrl, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    return new Response(originResponse.body, {
      status: originResponse.status,
      headers: originResponse.headers,
    });
  },
};
`;

fs.writeFileSync(path.join(__dirname, "worker.js"), worker);
console.log(`Wrote worker.js (${(worker.length / 1024).toFixed(1)} KB)`);
