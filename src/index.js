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
//   3. Desktop URLs: /arcade, /arcade/<game>, /apps and /apps/<app> are real
//      URLs served by the desktop itself, which opens the matching window
//      (see DESKTOP_PATHS).
//
//   4. Everything else -> the portfolio landing page (public/index.html) and
//      its static assets, served via the ASSETS binding.
//
// ── Add another framed project ─────────────────────────────────────────────
// Add one entry to APPS.  The key is the pretty URL.  Point it at either a
// `proxy` origin (reverse-proxied under <path>/_app/*) or an `embed` URL that
// is already reachable on this domain (a static asset, another route, …).
// Use both when the proxied site's page isn't its index.html: `proxy` serves it,
// `embed: "<path>/_app/page.html"` points the window at the right file.
// That's it — the shell, window chrome, and controls come for free.

import { handleAppleApi } from "./apple-api.js";
import { appleFix } from "./apple-fix.js";

const APPS = {
  "/trafficmap": {
    title: "Traffic Map",
    subtitle: "Lafayette 911 · live incident map",
    address: "mattlavergne.com/trafficmap",
    accent: "#1573c9",
    // The map is published to GitHub Pages; proxy it under /trafficmap/_app/*.
    proxy: "https://mattlavergne.github.io/Lafayette-911-Traffic",
  },
  "/music": {
    title: "ASTRA Studio",
    subtitle: "Beat production · sequencing · mixing · export",
    address: "mattlavergne.com/music",
    accent: "#d5f782",
    // ASTRA's production-ready static app lives in dist/ on GitHub Pages.
    // Proxy the dist directory directly so all relative CSS, module and worker
    // URLs stay under /music/_app/* and resolve through this Worker.
    proxy: "https://mattlavergne.github.io/ASTRA/dist",
  },
  "/apple": {
    title: "The Apple",
    // The developer's private test copy of the game (players use the App
    // Store app), locked with Cloudflare Access. It opens full-screen at
    // /apple/test/, not in a desktop window. The old /apple/_app/ address
    // still works, but an offline helper (service worker) an earlier version
    // left in browsers there couldn't load pages through the sign-in and
    // showed a blank page; /apple/test/ is out of its reach, and the game
    // removes the old helper when it opens.
    direct: true,
    mount: "/apple/test",
    // From GitHub Pages, or straight from the repo when it's private: set the
    // Worker secret GITHUB_TOKEN (read-only access to this repo's contents).
    proxy: "https://mattlavergne.github.io/apple",
    repo: "mattlavergne/apple",
  },
  "/cartogram": {
    title: "Cartogram",
    subtitle: "Map artwork · wallpaper builder",
    address: "mattlavergne.com/cartogram",
    accent: "#f6c453",
    // Static site on GitHub Pages (mattlavergne/Map-Background-Builder).
    proxy: "https://mattlavergne.github.io/Map-Background-Builder",
  },
};

// Pretty URLs the desktop owns.  The arcade and the bundled apps are not
// separate sites: they are part of mattOS, so /arcade, /arcade/<game>,
// /apps and /apps/<app> serve the desktop itself and it deep-links to the
// right window client-side (see ROUTES in public/index.html).  That keeps
// the transition between "pages" seamless — opening a window inside the
// desktop just pushes its URL, no reload — while a shared link or a refresh
// still lands in exactly the same place.
//
// The pattern deliberately has no dot in the last segment, so the real
// assets under /apps/ (registry.js, calculator.js, …) are still served as
// files rather than swallowed by the desktop.
const DESKTOP_PATHS = /^\/(arcade|apps)(\/[a-z0-9-]+)?\/?$/i;

// If pathname is "<appPath>/_app[/...]" (or the app's own `mount` path) for a
// proxied app, return the app and the remaining origin path (always starting
// with "/").
function embedTarget(pathname) {
  for (const [appPath, app] of Object.entries(APPS)) {
    if (!app.proxy) continue;
    for (const base of [app.mount, appPath + "/_app"]) {
      if (base && (pathname === base || pathname.startsWith(base + "/"))) {
        const rest = pathname.slice(base.length);
        return { app, rest: rest === "" ? "/" : rest };
      }
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 0) The Apple. /apple itself is a private test site (Cloudflare Access
    //    in front of it), so the parts the public app needs live outside it:
    //    the cloud-save API (src/apple-api.js) at /api/apple, and the privacy
    //    policy the App Store listing and AdMob link to at /privacy/apple.
    if (path.startsWith("/api/apple/") || path.startsWith("/apple/api/")) return handleAppleApi(request, env, ctx);
    if (path === "/privacy/apple" || path === "/privacy/apple/") return applePrivacy(env, url);
    // A repair page for the test site, public so a sign-in problem can't block it.
    if (path === "/fix/apple" || path === "/fix/apple/") return appleFix();

    // 1) Proxied embed content for a framed app's iframe.
    const target = embedTarget(path);
    if (target) {
      const fromRepo = !!(target.app.repo && env.GITHUB_TOKEN);
      // Which source is in use, to check before making the repo private.
      if (target.rest === "/__source") {
        return new Response(fromRepo ? "The repo, with the GitHub token (it can be private).\n" : "GitHub Pages (the repo must stay public).\n", {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      if (fromRepo) return repoFile(env, ctx, target.app.repo, target.rest);
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
    if (key && APPS[key].direct) return Response.redirect(url.origin + (APPS[key].mount || key + "/_app") + "/", 302);
    if (key) return renderAppFrame(env, url, key, APPS[key]);

    // 2b) An arcade or app URL -> the desktop, which opens that window.
    if (DESKTOP_PATHS.test(path)) return env.ASSETS.fetch(new URL("/index.html", url));

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

// The Apple's privacy policy: a copy of the game's privacy.html kept here, so
// the address the App Store and AdMob link to never depends on the game repo
// (private or not) or a token. Update both copies together; the game's
// tools/test-site.mjs checks they match.
async function applePrivacy(env, url) {
  // public/privacy/apple.html. Static assets drop ".html" from addresses by
  // default, so ask for it without, then with, the extension.
  let res = await env.ASSETS.fetch(new URL("/privacy/apple", url));
  if (!res.ok) res = await env.ASSETS.fetch(new URL("/privacy/apple.html", url));
  if (!res.ok) return new Response("The privacy policy is temporarily unavailable.", { status: 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

// A file from a GitHub repo through the API, for a project whose repo is
// private (GitHub Pages only serves public repos on the free plan). Cached at
// the edge for a minute, so a merge shows up quickly without using up the
// token's hourly limit.
const REPO_TYPES = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json", webmanifest: "application/manifest+json", txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", woff2: "font/woff2",
};
async function repoFile(env, ctx, repo, rest) {
  const file = (rest.endsWith("/") ? rest + "index.html" : rest).replace(/^\/+/, "");
  if (!file || file.split("/").some(s => s === ".." || s.startsWith("."))) return new Response("Not found", { status: 404 });
  const cacheKey = new Request(`https://mattlavergne.com/__repo-cache/${repo}/${file}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("Cache-Control", "no-cache");
    return new Response(cached.body, { headers });
  }
  const gh = await fetch(`https://api.github.com/repos/${repo}/contents/${file.split("/").map(encodeURIComponent).join("/")}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "mattlavergne.com",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!gh.ok) {
    return new Response(gh.status === 404 ? "Not found" : `Couldn't read ${repo} from GitHub (${gh.status}). Is the GITHUB_TOKEN secret still valid?`, {
      status: gh.status === 404 ? 404 : 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const res = new Response(gh.body, {
    headers: {
      "Content-Type": REPO_TYPES[file.split(".").pop().toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    },
  });
  const forCache = res.clone();
  const stored = new Response(forCache.body, { headers: { ...Object.fromEntries(forCache.headers), "Cache-Control": "max-age=60" } });
  ctx.waitUntil(caches.default.put(cacheKey, stored));
  return res;
}

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
