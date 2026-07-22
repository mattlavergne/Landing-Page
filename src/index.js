// Cloudflare Worker for mattlavergne.com.
//
// This Worker owns the whole domain (Workers Route mattlavergne.com/*):
//
//   - /trafficmap        -> 301 to /trafficmap/ (so the map's relative asset
//                           URLs resolve under the subpath)
//   - /trafficmap/*      -> reverse-proxied to the traffic map's GitHub Pages
//                           site
//   - everything else    -> the portfolio landing page, served as a static
//                           asset (public/index.html) via the ASSETS binding
//
// The landing page is a normal static file — edit public/index.html and push;
// the deploy is handled automatically (see .github/workflows/deploy.yml).

const ORIGIN = "https://mattlavergne.github.io/Lafayette-911-Traffic";
const PREFIX = "/trafficmap";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /trafficmap -> /trafficmap/
    if (url.pathname === PREFIX) {
      return Response.redirect(url.origin + PREFIX + "/" + url.search, 301);
    }

    // /trafficmap/* -> reverse-proxy to GitHub Pages
    if (url.pathname.startsWith(PREFIX + "/")) {
      const originUrl = ORIGIN + url.pathname.slice(PREFIX.length) + url.search;
      const originResponse = await fetch(originUrl, {
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      const headers = new Headers(originResponse.headers);
      // Let the browser reuse assets but always revalidate with the edge, so
      // updates aren't hidden behind a stale browser cache. The 5-min edge
      // cache (cacheTtl above) still answers most revalidations instantly.
      headers.set("Cache-Control", "no-cache");
      return new Response(originResponse.body, {
        status: originResponse.status,
        headers,
      });
    }

    // Everything else is the portfolio landing page.
    return env.ASSETS.fetch(new URL("/index.html", url));
  },
};
