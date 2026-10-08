/* ══════════════════════════════════════════════════════════════════
   mattOS Projects — every project the portfolio shows, in one file.

   Each entry becomes a file in the Finder (grouped by category), an
   entry in Spotlight, its own project window, and `open <slug>` in the
   Terminal.  `pinned:true` also puts it on the Desktop and in the Dock.

     MATTPROJECTS.categories  → the Finder's groups, in display order
     MATTPROJECTS.list        → the projects
     MATTPROJECTS.icons       → the project icons (squircle tiles)
     MATTPROJECTS.ignore      → GitHub repos never to suggest

   ── Add a project ─────────────────────────────────────────────────
   Automatic: the "Sync GitHub projects" workflow checks GitHub every
   day and opens a pull request that drafts an entry for any new public
   repo.  Review the wording, merge, done.  (Locally:
   `node scripts/sync-projects.mjs` shows what it would add.)

   By hand: copy an entry below.  Every field:

     slug       unique id (window id + `open <slug>` in the Terminal)
     name       display name
     category   one of the CATEGORIES ids
     status     "live"        → Live badge + launch button
                "production"  → In-production badge, no public link
                "code"        → Open-source badge, button to the repo
                anything else → "Coming soon"
     url        "/path" on this domain, "https://…", or "#"
     locked     OPTIONAL — true when the app needs a sign-in (lock badge)
     repo       OPTIONAL — "owner/name" on GitHub. Adds a "View source"
                button, and tells the sync bot this repo is already here.
     repoPrivate OPTIONAL — true hides the source button (private repo)
     pinned     OPTIONAL — also show on the Desktop + Dock
     icon       a key of ICONS below (or one of the desktop's: globe,
                sparkle, wave, flow, folder, note)
     modified   small caption under the icon in the Finder
     tagline    one-line summary
     tags       a few short labels
     desc       a sentence or two for the project window
     launch     label for the launch button (null → "Open")
════════════════════════════════════════════════════════════════════ */
(function (global) {
"use strict";

/* The same squircle tile the rest of mattOS uses, kept local so this
   file stands on its own.  Gradient ids are prefixed "pj" so they never
   collide with the desktop's or the apps' icons. */
function squircle(grad, inner, id) {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="pj${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
    <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#pj${id})"/>
    <rect x="6" y="6" width="88" height="44" rx="24" fill="rgba(255,255,255,.14)"/>${inner}</svg>`;
}

/* One icon per kind of thing, so a project's tile hints at what it does. */
const ICONS = {
  /* a pin dropped on a road — live maps */
  map: squircle(["#22c7d6", "#1573c9"],
    `<path d="M20 74c12-2 16-12 30-12s20 8 30 6" stroke="rgba(255,255,255,.5)" stroke-width="9" fill="none" stroke-linecap="round"/>
     <path d="M20 74c12-2 16-12 30-12s20 8 30 6" stroke="#fff" stroke-width="2" fill="none" stroke-dasharray="5 5" stroke-linecap="round"/>
     <path d="M50 20a16 16 0 0 1 16 16c0 12-16 27-16 27S34 48 34 36a16 16 0 0 1 16-16z" fill="#fff"/>
     <circle cx="50" cy="36" r="6.5" fill="#ef4444"/>`, "mp"),
  /* a framed map print — map artwork */
  mapart: squircle(["#334155", "#0b1120"],
    `<rect x="22" y="26" width="56" height="48" rx="4" fill="#0f172a" stroke="#f6c453" stroke-width="3.5"/>
     <path d="M26 52c10-3 16 6 26 2s16-10 22-6" stroke="#38bdf8" stroke-width="4" fill="none" stroke-linecap="round"/>
     <path d="M30 30l18 40M56 30l-12 40M26 40h48M26 64h48M66 30l6 40" stroke="#f6c453" stroke-width="1.8" fill="none" opacity=".85"/>
     <circle cx="47" cy="47" r="2.6" fill="#fff"/>`, "ma"),
  /* level meters — music production (matches the ASTRA Studio app) */
  studio: squircle(["#27321f", "#11150f"],
    `<rect x="28" y="53" width="7" height="19" rx="2" fill="#d5f782"/>
     <rect x="39" y="39" width="7" height="33" rx="2" fill="#d5f782"/>
     <rect x="50" y="27" width="7" height="45" rx="2" fill="#d5f782"/>
     <rect x="61" y="45" width="7" height="27" rx="2" fill="#d5f782"/>
     <path d="M25 78h50" stroke="rgba(213,247,130,.52)" stroke-width="3" stroke-linecap="round"/>`, "st"),
  /* a magnifier with a crosshair — lookups, reconnaissance */
  recon: squircle(["#475569", "#0f172a"],
    `<circle cx="45" cy="45" r="17" fill="rgba(94,234,212,.12)" stroke="#fff" stroke-width="5"/>
     <path d="M57.5 57.5 74 74" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
     <path d="M45 33v7M45 50v7M33 45h7M50 45h7" stroke="#5eead4" stroke-width="3" stroke-linecap="round"/>
     <circle cx="45" cy="45" r="2.4" fill="#5eead4"/>`, "rc"),
  /* a speech bubble with a spark — AI chat */
  chat: squircle(["#38bdf8", "#4f46e5"],
    `<path d="M30 26h36a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H44l-12 10v-10h-2a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z" fill="#fff"/>
     <circle cx="37" cy="46" r="4" fill="#4f46e5"/><circle cx="49" cy="46" r="4" fill="#4f46e5"/><circle cx="61" cy="46" r="4" fill="#4f46e5"/>
     <path d="M74 14c1.2 6 3 7.8 9 9-6 1.2-7.8 3-9 9-1.2-6-3-7.8-9-9 6-1.2 7.8-3 9-9z" fill="#fde047"/>`, "ch"),
  /* fork, plate, knife — meals */
  food: squircle(["#fdba74", "#ea580c"],
    `<circle cx="50" cy="52" r="19" fill="#fff"/>
     <circle cx="50" cy="52" r="12" fill="none" stroke="#fdba74" stroke-width="3"/>
     <path d="M24 30v12a4 4 0 0 0 4 4v26M28 30v12M32 30v12a4 4 0 0 1-4 4" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/>
     <path d="M74 72V30c-5 3-7 9-7 16h7" stroke="#fff" stroke-width="3.2" fill="#fff" stroke-linejoin="round" stroke-linecap="round"/>`, "fo"),
  /* an apple — The Apple */
  apple: squircle(["#86efac", "#15803d"],
    `<path d="M50 38c-7-5-23-4-24 12-1 15 9 28 17 28 3 0 5-2 7-2s4 2 7 2c8 0 18-13 17-28-1-16-17-17-24-12z" fill="#ef4444"/>
     <path d="M36 48c1-5 4-7 8-7" stroke="rgba(255,255,255,.65)" stroke-width="3.5" fill="none" stroke-linecap="round"/>
     <path d="M50 38c0-6 2-11 6-14" stroke="#78350f" stroke-width="3.5" fill="none" stroke-linecap="round"/>
     <path d="M54 30c4-7 12-8 16-6-3 6-10 9-16 6z" fill="#fff" opacity=".92"/>`, "ap"),
  /* a calculator with a dollar sign — fee and price math */
  fees: squircle(["#34d399", "#047857"],
    `<rect x="28" y="20" width="44" height="60" rx="7" fill="#fff"/>
     <rect x="33" y="25" width="34" height="16" rx="3" fill="#d1fae5"/>
     <text x="50" y="38.5" font-family="Helvetica,Arial" font-size="15" font-weight="800" fill="#047857" text-anchor="middle">$</text>
     ${[0, 1, 2].map(r => [0, 1, 2].map(c =>
      `<rect x="${34 + c * 11}" y="${47 + r * 10}" width="8" height="7" rx="2" fill="${c === 2 && r === 2 ? "#10b981" : "#a7f3d0"}"/>`).join("")).join("")}`, "fe"),
  /* a clipboard of ticked items — checklists, procedures */
  checklist: squircle(["#60a5fa", "#1d4ed8"],
    `<rect x="27" y="24" width="46" height="56" rx="6" fill="#fff"/>
     <rect x="39" y="19" width="22" height="10" rx="3" fill="#bfdbfe" stroke="#fff" stroke-width="2"/>
     <path d="M33 41l3.5 3.5L43 38M33 54l3.5 3.5L43 51" stroke="#16a34a" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <rect x="33" y="64" width="9" height="8" rx="2" fill="none" stroke="#93c5fd" stroke-width="2.4"/>
     <path d="M48 41h18M48 54h18M48 68h12" stroke="#93c5fd" stroke-width="3.5" stroke-linecap="round"/>`, "cl"),
  /* a page of reactions being pulled down into a file — scraping */
  scraper: squircle(["#818cf8", "#3730a3"],
    `<rect x="22" y="22" width="56" height="42" rx="6" fill="#fff"/>
     <path d="M22 32h56" stroke="#c7d2fe" stroke-width="2"/>
     <circle cx="28" cy="27" r="1.8" fill="#a5b4fc"/><circle cx="34" cy="27" r="1.8" fill="#a5b4fc"/>
     <circle cx="32" cy="42" r="4" fill="#818cf8"/><path d="M40 42h18" stroke="#c7d2fe" stroke-width="3.5" stroke-linecap="round"/>
     <circle cx="32" cy="54" r="4" fill="#818cf8"/><path d="M40 54h26" stroke="#c7d2fe" stroke-width="3.5" stroke-linecap="round"/>
     <circle cx="66" cy="70" r="12" fill="#22c55e" stroke="#fff" stroke-width="3"/>
     <path d="M66 63v12M60.5 70l5.5 5.5 5.5-5.5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`, "sc"),
  /* a bookmarked PDF fanning out to recipients */
  pdf: squircle(["#f87171", "#b91c1c"],
    `<path d="M24 22h22l10 10v46a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V25a3 3 0 0 1 3-3z" fill="#fff"/>
     <path d="M46 22v10h10" fill="#fecaca"/>
     <path d="M28 22h8v16l-4-3-4 3z" fill="#ef4444"/>
     <path d="M28 48h20M28 56h20M28 64h14" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/>
     <path d="M60 56h6l8-14M60 56h14M60 56h6l8 14" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="76" cy="40" r="3.4" fill="#fff"/><circle cx="77" cy="56" r="3.4" fill="#fff"/><circle cx="76" cy="72" r="3.4" fill="#fff"/>`, "pd"),
  /* a like flowing into a database — social data into a CRM */
  crm: squircle(["#c084fc", "#7e22ce"],
    `<path d="M33 46c-6-5-11-9-11-14a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 5-5 9-11 14z" fill="#fff"/>
     <path d="M40 54c4 8 10 10 16 10" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-dasharray="1 6"/>
     <path d="M52 59l5 5-5 5" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <ellipse cx="68" cy="44" rx="11" ry="4.5" fill="#fff"/>
     <path d="M57 44v26c0 2.5 5 4.5 11 4.5s11-2 11-4.5V44" fill="#fff"/>
     <path d="M57 53c0 2.5 5 4.5 11 4.5s11-2 11-4.5M57 62c0 2.5 5 4.5 11 4.5s11-2 11-4.5" stroke="#c084fc" stroke-width="2.4" fill="none"/>`, "cr"),
  /* candlesticks with a trend line — trading research */
  chart: squircle(["#1e293b", "#020617"],
    `<path d="M24 76h52" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
     <path d="M31 40v32M45 30v30M59 44v24M71 22v34" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
     <rect x="27" y="48" width="8" height="18" rx="1.5" fill="#f87171"/>
     <rect x="41" y="36" width="8" height="18" rx="1.5" fill="#4ade80"/>
     <rect x="55" y="48" width="8" height="14" rx="1.5" fill="#f87171"/>
     <rect x="67" y="28" width="8" height="22" rx="1.5" fill="#4ade80"/>
     <path d="M26 64 40 46l14 8 22-28" stroke="#fde047" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`, "cs"),
  /* generic fallbacks the sync bot can pick from */
  code: squircle(["#64748b", "#1e293b"],
    `<path d="M40 34 24 50l16 16M60 34l16 16-16 16" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M55 28 45 72" stroke="#5eead4" stroke-width="5" stroke-linecap="round"/>`, "cd"),
  game: squircle(["#f472b6", "#9333ea"],
    `<path d="M33 36h34a13 13 0 0 1 12.7 10.2l3 14a7.5 7.5 0 0 1-13.4 5.7L65 61H35l-4.3 4.9a7.5 7.5 0 0 1-13.4-5.7l3-14A13 13 0 0 1 33 36z" fill="#fff"/>
     <path d="M30 49h12M36 43v12" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>
     <circle cx="62" cy="46" r="3.4" fill="#f472b6"/><circle cx="69" cy="53" r="3.4" fill="#9333ea"/>`, "gm"),
  tool: squircle(["#fbbf24", "#c2410c"],
    `<path d="M66 24a14 14 0 0 0-17 17L25 65a6 6 0 0 0 9 9l24-24a14 14 0 0 0 17-17l-8 8-8-1-1-8z" fill="#fff"/>
     <circle cx="29.5" cy="69.5" r="2.6" fill="#c2410c"/>`, "tl")
};

/* The Finder groups projects under these headings, in this order.
   `icon` names a line icon from the desktop's set (I.*). */
const CATEGORIES = [
  { id: "apps",       name: "Web Apps",   icon: "window",  blurb: "Things that run in your browser" },
  { id: "games",      name: "Games",      icon: "gamepad", blurb: "Made to be played" },
  { id: "tools",      name: "Work Tools", icon: "gear",    blurb: "Small utilities built for the day job" },
  { id: "automation", name: "Automation", icon: "restart", blurb: "Systems running in production" },
  { id: "research",   name: "Research",   icon: "starMini", blurb: "Experiments, analysis and code" }
];

const LIST = [
  /* ── Web Apps ───────────────────────────────────────────────── */
  {
    slug:"trafficmap", name:"Traffic Map", category:"apps", status:"live", url:"/trafficmap", pinned:true,
    repo:"mattlavergne/Lafayette-911-Traffic",
    icon:"map", modified:"Live",
    tagline:"Live Lafayette 911 incident map",
    tags:["Live","Mapping","Real-time","Python","Leaflet"],
    desc:"A real-time map and analytics dashboard for Lafayette Parish 911 traffic incidents: accidents, hazards, and road conditions with live weather context. Built in Python, published on a schedule, and built with the same liquid-glass interface as this site.",
    launch:"Open the live map"
  },
  {
    slug:"astra", name:"ASTRA Studio", category:"apps", status:"live", url:"/music",
    repo:"mattlavergne/ASTRA",
    icon:"studio", modified:"Live",
    tagline:"A music studio in the browser",
    tags:["Live","Web Audio","MIDI","Vanilla JS"],
    desc:"A full beat-production studio that runs entirely in the browser: pick a vibe and it writes a starting beat, then sequence drums, play keys in key, arrange sections into a song, mix, import your own samples, play along over MIDI, and export a WAV. No account, no subscription, and your audio never leaves your device.",
    launch:"Open the studio"
  },
  {
    slug:"cartogram", name:"Cartogram", category:"apps", status:"live", url:"/cartogram",
    repo:"mattlavergne/Map-Background-Builder",
    icon:"mapart", modified:"Live",
    tagline:"Turn any place into a wallpaper",
    tags:["Live","OpenStreetMap","Canvas","Leaflet"],
    desc:"Draw a box anywhere on a map and get generative wall art of that place: real roads, water, parks and buildings pulled live from OpenStreetMap, painted in one of six hand-tuned styles with glow, depth and grain, then titled and downloaded as a full-resolution PNG for a desktop or a phone. Entirely client-side.",
    launch:"Make a wallpaper"
  },
  {
    slug:"ghosttrace", name:"GhostTrace", category:"apps", status:"live", url:"/osint/",
    repo:"mattlavergne/OSINT",
    icon:"recon", modified:"Live",
    tagline:"Passive OSINT lookups, honestly labelled",
    tags:["Live","OSINT","Cloudflare Workers","RDAP"],
    desc:"A reconnaissance console for phone numbers, emails, usernames, domains, IP addresses and autonomous systems, built from free public sources. It reports what a signal actually means: geolocation providers' disagreement is measured, carrier records are labelled as allocations, and a source that can't answer says so instead of guessing.",
    launch:"Open GhostTrace"
  },
  {
    slug:"chat", name:"Chat", category:"apps", status:"live", url:"https://chat.mattlavergne.com", locked:true,
    repo:"mattlavergne/LLM", repoPrivate:true,
    icon:"chat", modified:"Private",
    tagline:"My private AI chat",
    tags:["Workers AI","Cloudflare Access","Durable Objects","TypeScript"],
    desc:"A small serverless AI chat that runs entirely on Cloudflare's free tier: one Worker serves the interface and streams replies from an open-weights model on Workers AI. Turnstile, per-IP rate limits and a daily usage budget keep it in bounds, and Cloudflare Access keeps it to the people I've invited.",
    launch:"Sign in"
  },
  {
    slug:"whattoeat", name:"What To Eat", category:"apps", status:"live", url:"/food", locked:true,
    repo:"mattlavergne/What-To-Eat", repoPrivate:true,
    icon:"food", modified:"Private",
    tagline:"A weekly meal log that ranks itself",
    tags:["Cloudflare Workers","D1","Cron"],
    desc:"A private weekly meal tracker: one dinner a week, rated out of 10 by both of us, which gradually builds a ranked master list to scan when neither of us can decide what to cook. A Cloudflare Worker with a D1 database, so the data follows us between phones instead of living in one browser. It emails a reminder every Sunday with a one-tap link to log the week. Same liquid-glass interface as the rest of the site.",
    launch:"Open the app"
  },

  /* ── Games ──────────────────────────────────────────────────── */
  {
    slug:"apple", name:"The Apple", category:"games", status:"live", url:"/apple", pinned:true,
    repo:"mattlavergne/apple",
    icon:"apple", modified:"Live",
    tagline:"Snake, flipped: you're the apple",
    tags:["Live","Game","Canvas","Vanilla JS"],
    desc:"A reverse game of Snake. You play the apple and lure hungry snakes into walls, thorns, each other and their own tails. Snakes get smarter as you go (greedy, then pathfinding, then trap-avoiding), and you fight back with dashes, brambles, hidden rot and decoys. A 100-level Adventure across ten worlds, an Endless mode, boss snakes, per-run power-ups and an Orchard shop for upgrades and skins. Hand-drawn on a canvas with synthesized sound, no libraries.",
    launch:"Play the game"
  },

  /* ── Work Tools ─────────────────────────────────────────────── */
  {
    slug:"fees", name:"GiveCampus Fee Calculator", category:"tools", status:"live", url:"/fees",
    repo:"mattlavergne/GiveCampus-Fee-Calculator",
    icon:"fees", modified:"Live",
    tagline:"What to charge so the department nets its number",
    tags:["Live","Fundraising","HTML"],
    desc:"Enter what a department needs to net and it works backwards to the amount to charge the donor, covering the GiveCampus card fee (2.9% + $0.30) and the Foundation's 5% admin fee, with the breakdown shown line by line.",
    launch:"Open the calculator"
  },
  {
    slug:"checklist", name:"Correspondence Checklist", category:"tools", status:"live", url:"/checklist",
    repo:"mattlavergne/Correspondence-Checklist",
    icon:"checklist", modified:"Live",
    tagline:"CRM correspondence uploads, step by step",
    tags:["Live","CRM","SQL","Process"],
    desc:"An interactive checklist for loading communication activities into the CRM: setting up the activity, logging the send, prepping the SQL and CSV files, and verifying row counts. Written so anyone can run the upload while a coworker is out; progress is saved as you go.",
    launch:"Open the checklist"
  },
  {
    slug:"fbscraper", name:"Facebook Web Scraper", category:"tools", status:"code", url:"#",
    repo:"mattlavergne/Facebook-Web-Scraper",
    icon:"scraper", modified:"Browser script",
    tagline:"Post engagement, exported to CSV",
    tags:["JavaScript","Browser","CSV","Tampermonkey"],
    desc:"A browser script that collects the people who liked, commented on, or shared a Facebook post and exports them to CSV from a floating panel. Runs from the console or as a Tampermonkey userscript, with configurable pacing to stay under rate limits.",
    launch:null
  },

  /* ── Automation ─────────────────────────────────────────────── */
  {
    slug:"flow47", name:"47-Flow Automation Engine", category:"automation", status:"production", url:"#",
    icon:"flow", modified:"In production",
    tagline:"The system that runs a foundation",
    tags:["Power Automate","M365","REST API","Child flows"],
    desc:"The flagship: a 47-flow Power Automate solution integrating Teamwork, SharePoint, Microsoft Forms, and M365 to automate gift processing, donor operations, event management, and staff onboarding/offboarding. Custom REST API connectors, child-flow architecture, and environment-variable management eliminate hard-coded dependencies across all 47 flows, so it stays maintainable as it grows.",
    launch:null
  },
  {
    slug:"pdfrouter", name:"PDF Bookmark Router", category:"automation", status:"production", url:"#",
    icon:"pdf", modified:"In production",
    tagline:"1,000+ pages, split and delivered",
    tags:["VBA","Automation","Documents"],
    desc:"A VBA script that splits a 1,000+ page PDF along its bookmarks and auto-routes each section to the right recipient, replacing a manual, hours-long distribution process with a one-click run.",
    launch:null
  },
  {
    slug:"crmimport", name:"Social → CRM Import", category:"automation", status:"production", url:"#",
    icon:"crm", modified:"In production",
    tagline:"Retire the copy-paste",
    tags:["REST API","CRM","Data integrity"],
    desc:"A bulk import pipeline that captures social-media interactions straight into the CRM, retiring manual data entry and keeping donor engagement records clean and current.",
    launch:null
  },

  /* ── Research ───────────────────────────────────────────────── */
  {
    slug:"trade", name:"Trade", category:"research", status:"code", url:"#",
    repo:"mattlavergne/Trade",
    icon:"chart", modified:"Python · CLI",
    tagline:"Finding out if a strategy works before it costs money",
    tags:["Python","Backtesting","Walk-forward","Risk"],
    desc:"A systematic trading research system: a multi-asset portfolio engine with volatility targeting, walk-forward validation with multiple-testing correction, realistic cost and funding models, and paper trading. Its main finding: sizing positions by volatility cut drawdown by two-thirds, while every forecasting strategy failed out-of-sample. It cannot place a real order.",
    launch:null
  },
  {
    slug:"trilateration", name:"WiFi Trilateration", category:"research", status:"soon", url:"#",
    icon:"wave", modified:"Experiment",
    tagline:"Physics-based motion detection",
    tags:["Raspberry Pi","Python","IoT","RSSI"],
    desc:"Motion detection using RSSI trilateration on a Raspberry Pi: no cameras, just radio physics. Maps the location of a disturbance in a room in real time. Write-up coming soon.",
    launch:null
  },

  /* ↑ new projects go above this line (scripts/sync-projects.mjs inserts here) */
];

/* GitHub repos the sync bot should never suggest (name only, any case).
   Forks, archived repos and empty repos are skipped automatically. */
const IGNORE = [
  "Landing-Page"
];

global.MATTPROJECTS = { categories: CATEGORIES, list: LIST, icons: ICONS, ignore: IGNORE };
})(typeof window !== "undefined" ? window : globalThis);
