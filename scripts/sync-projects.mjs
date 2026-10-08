#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   sync-projects — draft public/projects.js entries for GitHub repos
   that aren't on the site yet.

     node scripts/sync-projects.mjs                 dry run: list what's new
     node scripts/sync-projects.mjs --write         add drafts to projects.js
     node scripts/sync-projects.mjs --write owner/repo [owner/repo …]
                                                    only these repos (private
                                                    ones too, given a token)

   A draft is a best guess: the name and tagline come from the README's
   title, the description from its first paragraph, the link from the
   repo's homepage or its GitHub Pages site, and the category and icon
   from keywords.  It's meant to be reviewed, which is why the workflow
   (.github/workflows/sync-projects.yml) opens a pull request rather than
   committing straight to main.

   Skipped automatically: forks, archived repos, empty repos, private
   repos (unless named on the command line), anything already in the list
   (matched on `repo`), and anything in MATTPROJECTS.ignore.

   Environment:
     GITHUB_TOKEN    optional locally; raises the rate limit, and with a
                     personal token can read private repos you name
     GITHUB_OWNER    whose repos to scan (default: mattlavergne)
     SITE_HOST       homepages on this host become relative links
                     (default: mattlavergne.com)
     SYNC_SUMMARY    write a Markdown summary (the PR body) to this path
════════════════════════════════════════════════════════════════════ */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const FILE = fileURLToPath(new URL("../public/projects.js", import.meta.url));
const MARKER = "  /* ↑ new projects go above this line";
const OWNER = process.env.GITHUB_OWNER || "mattlavergne";
const SITE_HOST = (process.env.SITE_HOST || "mattlavergne.com").toLowerCase();
const TOKEN = process.env.GITHUB_TOKEN || "";
const API = "https://api.github.com";

/* First match wins, so the specific rules sit above the general ones.
   [pattern, category, icon] — icons are keys of ICONS in projects.js. */
const RULES = [
  [/\b(games?|arcade|puzzle|platformer|roguelike|snake|tetris)\b/i, "games", "game"],
  [/\b(osint|recon|reconnaissance|whois|rdap)\b/i, "apps", "recon"],
  [/\b(chat|chatbot|llm|gpt|assistant)\b/i, "apps", "chat"],
  [/\b(music|audio|beats?|synth|daw)\b/i, "apps", "studio"],
  [/\b(wallpapers?|map art|posters?)\b/i, "apps", "mapart"],
  [/\b(maps?|mapping|leaflet|geo|gis)\b/i, "apps", "map"],
  [/\b(meals?|recipes?|food|cooking)\b/i, "apps", "food"],
  [/\b(trading|stocks?|crypto|backtest\w*|portfolio)\b/i, "research", "chart"],
  [/\b(calculator|fees?|pricing)\b/i, "tools", "fees"],
  [/\b(checklist|to-?do|procedure)\b/i, "tools", "checklist"],
  [/\b(scraper|scrape|scraping|crawler)\b/i, "tools", "scraper"],
  [/\bpdfs?\b/i, "automation", "pdf"],
  [/\bcrm\b/i, "automation", "crm"],
  [/\b(power automate|automation|workflows?)\b/i, "automation", "flow"],
  [/\b(wifi|iot|raspberry pi|sensors?|rssi)\b/i, "research", "wave"]
];

/* ── GitHub ─────────────────────────────────────────────────────── */
async function gh(path, { raw = false, allow404 = false } = {}) {
  const res = await fetch(API + path, {
    headers: {
      Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mattos-sync-projects",
      ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {})
    }
  });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}: ${(await res.text()).slice(0, 200)}`);
  return raw ? res.text() : res.json();
}

async function listRepos() {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/users/${OWNER}/repos?type=owner&sort=pushed&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

/* ── README → name, tagline, description ───────────────────────── */
const stripMd = s => s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")              // images
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")           // links → text
  .replace(/<[^>]+>/g, "")                           // inline html
  .replace(/(\*\*|\*|`)(.+?)\1/g, "$2")              // bold, italic, code
  .replace(/\s+/g, " ")
  .trim();
const stripEmoji = s => s.replace(/[\p{Extended_Pictographic}️‍]/gu, "").trim();

function readmeParts(md) {
  if (!md) return {};
  const lines = md.replace(/\r/g, "").split("\n");
  let title = "", para = "", inFence = false, buf = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("```")) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!title && /^#\s+/.test(t)) { title = stripEmoji(stripMd(t.replace(/^#\s+/, ""))); continue; }
    if (para) break;
    const prose = t && !/^(#|!\[|\[!\[|<|>|\||[-*+] |\d+\. |---|===)/.test(t);
    if (prose) { buf.push(t); continue; }
    if (buf.length) { para = stripMd(buf.join(" ")); buf = []; }
  }
  if (!para && buf.length) para = stripMd(buf.join(" "));
  return { title, para };
}

function clip(s, max) {
  if (!s || s.length <= max) return s || "";
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > max * 0.5) return cut.slice(0, end + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
}
const humanize = name => name.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, c => c.toUpperCase());
const capFirst = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/* ── Where the project lives ────────────────────────────────────── */
async function liveURL(repo) {
  const home = (repo.homepage || "").trim();
  if (/^https?:\/\//i.test(home)) {
    const u = new URL(home);
    return u.hostname.toLowerCase() === SITE_HOST ? (u.pathname + u.search) || "/" : home;
  }
  if (!repo.has_pages) return null;
  const base = `https://${repo.owner.login.toLowerCase()}.github.io/${repo.name}/`;
  // A Pages site whose page isn't index.html (a lone tool.html) needs the file named.
  const root = await gh(`/repos/${repo.full_name}/contents/`, { allow404: true }) || [];
  const html = root.filter(f => f.type === "file" && /\.html?$/i.test(f.name));
  if (html.some(f => /^index\.html?$/i.test(f.name)) || html.length !== 1) return base;
  return base + encodeURIComponent(html[0].name);
}

/* ── One draft entry ────────────────────────────────────────────── */
async function draft(repo, slugs) {
  const md = await gh(`/repos/${repo.full_name}/readme`, { raw: true, allow404: true });
  const { title, para } = readmeParts(md);
  const [head, ...rest] = (title || "").split(/\s+[—–-]\s+|:\s+/);
  const usable = head && head.length <= 40 && !/^[\w-]+(\.[\w-]+)+$/.test(head);
  const name = usable ? head : humanize(repo.name);

  const url = await liveURL(repo);
  const live = !!url;
  const text = [repo.name.replace(/[-_]+/g, " "), repo.description, (repo.topics || []).join(" "), title, para].join(" ");
  const [, category, icon] = RULES.find(([re]) => re.test(text)) || [null, live ? "apps" : "research", live ? "globe" : "code"];

  let slug = repo.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  for (let n = 2; slugs.has(slug); n++) slug = slug.replace(/-\d+$/, "") + "-" + n;
  slugs.add(slug);

  const firstSentence = ((para || "").match(/^.+?[.!?](?=\s|$)/) || [para || ""])[0].replace(/\.$/, "");
  const tagline = clip(repo.description || capFirst(rest.join(" — ")) || firstSentence, 70)
    || "TODO: one-line summary";
  const desc = clip(para || repo.description || "", 420) || `TODO: a sentence or two about ${name}.`;
  const tags = [...new Set([live && "Live", repo.language, ...(repo.topics || [])].filter(Boolean))].slice(0, 5);

  return {
    repo, category, icon, url,
    entry: {
      slug, name, category,
      status: live ? "live" : repo.private ? "soon" : "code",
      url: url || "#",
      repo: repo.full_name,
      ...(repo.private ? { repoPrivate: true } : {}),
      icon,
      modified: live ? "Live" : "Source",
      tagline, tags, desc,
      launch: null
    }
  };
}

const q = v => JSON.stringify(v);
function format({ repo, entry: e }) {
  const line1 = ["slug", "name", "category", "status", "url"].map(k => `${k}:${q(e[k])}`).join(", ");
  return `  {
    // drafted from github.com/${repo.full_name} by scripts/sync-projects.mjs — review, then delete this line
    ${line1},
    repo:${q(e.repo)},${e.repoPrivate ? " repoPrivate:true," : ""}
    icon:${q(e.icon)}, modified:${q(e.modified)},
    tagline:${q(e.tagline)},
    tags:${q(e.tags)},
    desc:${q(e.desc)},
    launch:null
  },
`;
}

function load(src) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "projects.js" });
  if (!ctx.MATTPROJECTS) throw new Error("projects.js did not define MATTPROJECTS");
  return ctx.MATTPROJECTS;
}

/* ── main ───────────────────────────────────────────────────────── */
async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const named = args.filter(a => !a.startsWith("--"));

  const src = await readFile(FILE, "utf8");
  const data = load(src);
  if (!src.includes(MARKER)) throw new Error("insertion marker not found in projects.js");
  const listed = new Set(data.list.filter(p => p.repo).map(p => p.repo.toLowerCase()));
  const ignored = new Set(data.ignore.map(n => n.toLowerCase()));
  const self = (process.env.GITHUB_REPOSITORY || "").toLowerCase();

  const candidates = named.length
    ? await Promise.all(named.map(n => gh(`/repos/${n.includes("/") ? n : OWNER + "/" + n}`)))
    : (await listRepos()).filter(r => !r.private);
  const fresh = candidates.filter(r =>
    !r.fork && !r.archived && r.size > 0 &&
    !listed.has(r.full_name.toLowerCase()) &&
    !ignored.has(r.name.toLowerCase()) && !ignored.has(r.full_name.toLowerCase()) &&
    r.full_name.toLowerCase() !== self);

  if (!fresh.length) { console.log("Nothing new: every repo is already on the site or ignored."); return; }

  const slugs = new Set(data.list.map(p => p.slug));
  const drafts = [];
  for (const r of fresh) drafts.push(await draft(r, slugs));

  for (const d of drafts)
    console.log(`+ ${d.repo.full_name.padEnd(40)} → ${d.entry.name} [${d.category}/${d.icon}] ${d.url || "(source only)"}`);

  if (write) {
    const out = src.replace(MARKER, drafts.map(format).join("\n") + "\n" + MARKER);
    const check = load(out);   // never write a file the site can't parse
    const missing = drafts.filter(d => !check.list.some(p => p.repo === d.repo.full_name));
    if (missing.length) throw new Error("drafts did not round-trip: " + missing.map(d => d.repo.full_name).join(", "));
    await writeFile(FILE, out);
    console.log(`\nAdded ${drafts.length} draft${drafts.length > 1 ? "s" : ""} to public/projects.js.`);
  } else {
    console.log("\nDry run. Add --write to put these in public/projects.js.");
  }

  if (process.env.SYNC_SUMMARY) await writeFile(process.env.SYNC_SUMMARY, summary(drafts));
}

function summary(drafts) {
  const rows = drafts.map(({ repo, entry: e }) =>
    `| [${repo.full_name}](${repo.html_url}) | ${e.name} | ${e.category} | \`${e.icon}\` | ${e.url === "#" ? "source only" : e.url} |`);
  const todo = drafts.filter(d => JSON.stringify(d.entry).includes("TODO")).map(d => "`" + d.entry.slug + "`");
  const warn = todo.length
    ? `\n> [!WARNING]\n> ${todo.join(", ")} had no README or description to draft from and still say **TODO**. Fill those in before merging, or they'll show on the site as-is.\n`
    : "";
  return `Found ${drafts.length} GitHub repo${drafts.length > 1 ? "s" : ""} that ${drafts.length > 1 ? "aren't" : "isn't"} on the landing page yet, and drafted ${drafts.length > 1 ? "entries" : "an entry"} in \`public/projects.js\`.

| Repo | Name | Category | Icon | Link |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
${warn}
**Before merging**, open \`public/projects.js\` in this PR (the drafts are at the bottom of the list) and:

- [ ] Rewrite the \`tagline\` and \`desc\` if the README's wording doesn't fit
- [ ] Check \`category\` and \`icon\` (keys of \`ICONS\` in the same file)
- [ ] Delete the \`// drafted from …\` comment line
- [ ] Optional: give a GitHub Pages app a pretty URL by adding it to \`APPS\` in \`src/index.js\` and pointing \`url\` at that path

Don't want one of these listed? In this PR, delete its draft and add the repo name to \`IGNORE\` at the bottom of \`public/projects.js\`, then merge. (Closing the PR without that just means it's suggested again tomorrow.)

Merging deploys the site.
`;
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
