// Cloudflare Worker for mattlavergne.com.
//
// This Worker owns the whole domain (Workers Route mattlavergne.com/*) and does
// three things:
//
//   1. Framed apps.  A "framed app" is a project that opens at its own pretty
//      URL (e.g. /trafficmap) but LOOKS like an application window sitting on
//      the mattOS desktop — same wallpaper, menu bar, and a browser-style
//      window with working close / minimize / zoom controls.  The window's
//      content is loaded in an iframe.  The single shell that renders every
//      framed app is public/app.html; the per-app details live in the APPS
//      registry below.
//
//   2. Embed proxying.  Each framed app serves its real content under
//      <path>/_app/* .  For apps with a `proxy` origin (like the traffic map,
//      which lives on GitHub Pages) the Worker reverse-proxies that subpath to
//      the origin, so the iframe loads it same-origin and relative asset URLs
//      resolve correctly.
//
//   3. Everything else -> the portfolio landing page (public/index.html) and
//      its static assets, served via the ASSETS binding.
//
// ── Add another framed project ─────────────────────────────────────────────
// Add one entry to APPS.  The key is the pretty URL.  Point it at either a
// `proxy` origin (reverse-proxied under <path>/_app/*) or an `embed` URL that
// is already reachable on this domain (a static asset, another route, …).
// That's it — the shell, window chrome, and controls come for free.

const APPS = {
  "/trafficmap": {
    title: "Traffic Map",
    subtitle: "Lafayette 911 · live incident map",
    address: "mattlavergne.com/trafficmap",
    accent: "#1573c9",
    // The map is published to GitHub Pages; proxy it under /trafficmap/_app/*.
    proxy: "https://mattlavergne.github.io/Lafayette-911-Traffic",
  },
};

// If pathname is "<appPath>/_app[/...]" for a proxied app, return the app and
// the remaining origin path (always starting with "/").
function embedTarget(pathname) {
  for (const [appPath, app] of Object.entries(APPS)) {
    if (!app.proxy) continue;
    const base = appPath + "/_app";
    if (pathname === base || pathname.startsWith(base + "/")) {
      const rest = pathname.slice(base.length);
      return { app, rest: rest === "" ? "/" : rest };
    }
  }
  return null;
}

// The pretty URL for a framed app, tolerating an optional trailing slash.
function appKeyFor(pathname) {
  const key = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return APPS[key] ? key : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1) Proxied embed content for a framed app's iframe.
    const target = embedTarget(path);
    if (target) {
      const originUrl = target.app.proxy + target.rest + url.search;
      const originResponse = await fetch(originUrl, {
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      const headers = new Headers(originResponse.headers);
      // Reuse assets in the browser but always revalidate with the edge, so
      // fresh map data isn't hidden behind a stale browser cache.
      headers.set("Cache-Control", "no-cache");
      // Allow the content to be embedded in the app window (same origin).
      headers.delete("X-Frame-Options");
      headers.delete("Content-Security-Policy");
      return new Response(originResponse.body, {
        status: originResponse.status,
        headers,
      });
    }

    // 2) A framed app's pretty URL -> the mattOS app-window shell.
    const key = appKeyFor(path);
    if (key) return renderAppFrame(env, url, key, APPS[key]);

    // The shell template must never be served raw (its placeholders would be
    // unfilled JavaScript); send stray requests for it back to the desktop.
    if (path === "/app.html" || path === "/app") {
      return Response.redirect(url.origin + "/", 302);
    }

    // 3) Everything else: the matching static asset if one exists, otherwise
    //    fall back to the landing page.
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
    return env.ASSETS.fetch(new URL("/index.html", url));
  },
};

// Render public/app.html with this app's config injected. The shell reads
// window.__APP__ to populate the title, address bar, accent, and iframe.
async function renderAppFrame(env, url, appPath, app) {
  const res = await env.ASSETS.fetch(new URL("/app.html", url));
  let html = await res.text();
  const embed = app.embed || appPath + "/_app/";
  const cfg = {
    title: app.title || "App",
    subtitle: app.subtitle || "",
    address: app.address || url.host + appPath,
    accent: app.accent || "",
    embed,
    path: appPath,
  };
  // Escape "<" so the JSON can't terminate the injecting <script> element.
  const json = JSON.stringify(cfg).replace(/</g, "\\u003c");
  html = html
    .replace("__APP_CONFIG__", json)
    .replace(/__EMBED_FALLBACK__/g, embed);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
