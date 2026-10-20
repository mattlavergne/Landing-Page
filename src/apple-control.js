// The Apple's control center: the owner-only portal and admin API
// (/apple/portal, /apple/admin/api/*), and the public, read-only content
// the game downloads (/api/apple/content).
//
// Content is data only: custom skins (colours and finishes), which of the
// game's existing challenges and weekly twists run on which dates, tour
// names and reward skins, announcements, and switches that pause an ad
// format. Never code, links, prices of the purchase, or anything personal.
// The game checks every item again (js/live-content.js in the game repo)
// and drops anything it doesn't know, so a mistake here can't break a phone.
//
// Format 2 (this file's) has a list of announcements. Copies of the game
// from before it read format 1 (one announcement), still served at
// /api/apple/content; the game asks for ?schema=2.

const FLAGS = ['pauseInterstitials', 'pauseRewarded', 'pauseBanners'];
const EMPTY = Object.freeze({ schema: 2, skins: [], daily: [], weekly: [], tours: [], notices: [],
  flags: Object.freeze({ pauseInterstitials: false, pauseRewarded: false, pauseBanners: false }) });
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const bad = (status, message) => Response.json({ error: message }, { status, headers: JSON_HEADERS });
const answer = (data, status = 200) => Response.json(data, { status, headers: JSON_HEADERS });
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasKeys = (v, keys) => isObj(v) && Object.keys(v).every(k => keys.includes(k));
const isText = (s, max, required = true) => typeof s === 'string' &&
  s.length <= max && (!required || s.trim().length > 0) && !/[<>\x00-\x08\x0e-\x1f]/.test(s);
const icon = s => isText(s, 12) && [...s].length <= 5;
const int = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const color = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const BOOLS = ['gloss', 'sparkle', 'stick', 'rainbow', 'active', 'tour'];
const clone = v => JSON.parse(JSON.stringify(v));
const blank = () => clone(EMPTY);

// What the game has, by id. The game repo's tools/content-sync-test.mjs
// checks these against its own lists (CONTRACTS, WEEKLY, TOURS), so they
// can't drift apart.
export const DAILY_IDS = {
  0: ['close', 'stars', 'level', 'walls', 'scratch'],
  1: ['nerve', 'poison', 'self', 'unbitten', 'frenzy'],
  2: ['lunge', 'grade', 'tangle', 'double', 'deep'],
};
export const WEEKLY_TYPES = ['stars', 'boxes', 'golden', 'xp'];
export const TOUR_SKINS = ['moonlight', 'blossom', 'ocean', 'honey', 'mint', 'berry', 'comet', 'clover',
  'butterfly', 'peach', 'lemon', 'cocoa', 'watermelon', 'aurora', 'pearl', 'dragon'];
const TOUR_DAYS = 21, DAY_ONE = Date.UTC(2026, 9, 1);

// Text fields may hold line breaks and tabs from the portal; phones show one
// line, and older copies refuse control characters, so they become spaces.
export function deviceCompatibleContent(value) {
  if (typeof value === 'string') return value.replace(/[\x09-\x0d]+/g, ' ');
  if (Array.isArray(value)) return value.map(deviceCompatibleContent);
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deviceCompatibleContent(entry)]));
  return value;
}
const dateOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const utcDay = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
// The first day of tour n.
export const tourStart = n => new Date(DAY_ONE + (n - 1) * TOUR_DAYS * 864e5).toISOString().slice(0, 10);
// Has tour n started anywhere in the world? (It's already tomorrow in some places.)
export const tourStarted = (n, now = utcDay(1)) => tourStart(n) <= now;

// A stored or submitted document in format 2 (format 1 had one `notice`).
export function upgradeContent(c) {
  if (!isObj(c) || c.schema !== 1) return c;
  const { notice, ...rest } = c;
  return { ...rest, schema: 2, notices: notice ? [{ id: 'notice-1', ...notice }] : [] };
}

export function validateContent(c) {
  const errors = [];
  if (!hasKeys(c, ['schema', 'skins', 'daily', 'weekly', 'tours', 'notices', 'flags']) || c.schema !== 2)
    return ['Invalid document (expected format 2).'];
  const limits = { skins: 150, daily: 400, weekly: 200, tours: 200, notices: 50 };
  for (const [key, max] of Object.entries(limits)) if (!Array.isArray(c[key]) || c[key].length > max) errors.push(`${key} must be a list of at most ${max}.`);
  if (errors.length) return errors;
  const unique = (values, label) => { if (new Set(values).size !== values.length) errors.push(`Two ${label} are the same.`); };
  c.skins.forEach((s, i) => {
    if (!hasKeys(s, ['id', 'name', 'base', 'dark', 'light', 'leaf', 'cost', ...BOOLS]) || !/^custom-[a-z0-9-]{3,40}$/.test(s.id || '') || !isText(s.name, 34) ||
      !['base', 'dark', 'light', 'leaf'].every(k => color(s[k])) || !int(s.cost, 0, 10000) || !BOOLS.every(k => typeof s[k] === 'boolean') || (s.tour && s.cost !== 0))
      errors.push(`Skin ${i + 1}: check its name, colours, price and options.`);
  });
  unique(c.skins.map(s => s.id), 'skin ids');
  c.daily.forEach((d, i) => {
    if (!hasKeys(d, ['date', 'items']) || !dateOk(d.date) || !Array.isArray(d.items) || d.items.length !== 3) { errors.push(`Challenge day ${i + 1} needs a date and exactly 3 challenges.`); return; }
    d.items.forEach((x, tier) => {
      if (!hasKeys(x, ['id', 'target', 'label', 'icon']) || !DAILY_IDS[tier].includes(x.id) || !int(x.target, 1, 100) || !isText(x.label, 80, false) || !isText(x.icon, 12, false))
        errors.push(`Challenges on ${d.date}: challenge ${tier + 1} isn't one the game has for that tier, or its number or words don't fit.`);
    });
  });
  unique(c.daily.map(d => d.date), 'challenge days');
  c.weekly.forEach((w, i) => {
    if (!hasKeys(w, ['monday', 'type', 'name', 'desc', 'icon']) || !dateOk(w.monday) || new Date(w.monday + 'T12:00:00Z').getUTCDay() !== 1 ||
      !WEEKLY_TYPES.includes(w.type) || !isText(w.name, 40) || !isText(w.desc, 140) || !icon(w.icon))
      errors.push(`Weekly twist ${i + 1}: it needs a Monday, a twist the game has, a name, an icon and a description.`);
  });
  unique(c.weekly.map(w => w.monday), 'weekly twists for one week');
  c.tours.forEach((t, i) => {
    const custom = c.skins.find(s => s.id === t?.skin);
    if (!hasKeys(t, ['number', 'name', 'icon', 'skin']) || !int(t.number, 1, 100000) || !isText(t.name, 40) || !icon(t.icon) ||
      !(TOUR_SKINS.includes(t.skin) || (custom && custom.tour)))
      errors.push(`Orchard Tour ${t?.number ?? i + 1}: it needs a name, an icon and a reward skin made for tours.`);
  });
  unique(c.tours.map(t => t.number), 'tours');
  c.notices.forEach((n, i) => {
    if (!hasKeys(n, ['id', 'title', 'body', 'start', 'end', 'enabled']) || !/^[a-z0-9-]{1,40}$/.test(n.id || '') || !isText(n.title, 60) || !isText(n.body, 240, false) ||
      !dateOk(n.start) || !dateOk(n.end) || n.end < n.start || typeof n.enabled !== 'boolean')
      errors.push(`Announcement ${i + 1}: it needs a title (60 letters at most), a message (240 at most) and dates, the last not before the first.`);
  });
  unique(c.notices.map(n => n.id), 'announcement ids');
  if (!hasKeys(c.flags, FLAGS) || !FLAGS.every(k => typeof c.flags[k] === 'boolean')) errors.push('The ad switches must each be on or off.');
  if (JSON.stringify(c).length > 120000) errors.push('That’s more than 120 KB of content.');
  return errors.slice(0, 30);
}

// Format 1, for copies of the game from before format 2: the announcement
// showing today (UTC), or the next one coming.
export function legacyContent(c, today = utcDay()) {
  const { notices, schema, ...rest } = c;
  const on = notices.filter(n => n.enabled && n.end >= today).sort((a, b) => (a.start <= today) === (b.start <= today) ? (a.start < b.start ? 1 : -1) : (a.start <= today ? -1 : 1));
  const n = on[0];
  return { schema: 1, ...rest, notice: n ? { title: n.title, body: n.body, start: n.start, end: n.end, enabled: true } : null };
}

let schemaReady = false;
async function tables(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS apple_control_live (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, content TEXT NOT NULL, edited_at TEXT NOT NULL, edited_by TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS apple_control_draft (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, content TEXT NOT NULL, edited_at TEXT NOT NULL, edited_by TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS apple_control_versions (version INTEGER PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, note TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS apple_stats (day TEXT NOT NULL, os TEXT NOT NULL, app TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, os, app, event, detail))'),
    db.prepare('CREATE TABLE IF NOT EXISTS apple_daily (num INTEGER NOT NULL, score INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (num, score))'),
  ]);
  await db.prepare("INSERT OR IGNORE INTO apple_control_live (id, version, content, edited_at, edited_by) VALUES (1, 0, ?, datetime('now'), 'system')").bind(JSON.stringify(EMPTY)).run();
  schemaReady = true;
}
const live = db => db.prepare('SELECT version, content, edited_at, edited_by FROM apple_control_live WHERE id = 1').first();
const draft = db => db.prepare('SELECT version, content, edited_at, edited_by FROM apple_control_draft WHERE id = 1').first();
const present = r => (r ? { version: r.version, content: upgradeContent(JSON.parse(r.content)), editedAt: r.edited_at, editedBy: r.edited_by } : null);

// ------------------------------------------------------------------ public
// Read-only, open to everyone (the game has no sign-in). Answers from the
// edge cache for 30 seconds at a time, so a flood of requests can't run up
// the database; a phone that already has this version gets a bare 304.
const CONTENT_TTL = 30;
const cacheKey = schema => new Request(`https://mattlavergne.com/__apple-content/v${schema}`);
export async function publicAppleContent(request, env, ctx) {
  const origin = request.headers.get('Origin');
  const allow = !origin || /^(https:\/\/(localhost|mattlavergne\.com|([a-z0-9-]+\.)+mattlavergne\.com)|capacitor:\/\/localhost|http:\/\/localhost(:\d+)?)$/i.test(origin);
  const headers = { ...JSON_HEADERS, 'Access-Control-Allow-Origin': allow && origin ? origin : 'https://mattlavergne.com',
    Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers });
  if (!env.APPLE_DB) return new Response('Not configured', { status: 503, headers });
  const schema = new URL(request.url).searchParams.get('schema') === '2' ? 2 : 1;
  const cache = globalThis.caches?.default;
  try {
    let body = null, version = null;
    const hit = cache && await cache.match(cacheKey(schema));
    if (hit) { body = await hit.text(); version = Number(hit.headers.get('X-Content-Version')); }
    else {
      await tables(env.APPLE_DB);
      const r = await live(env.APPLE_DB);
      const c = deviceCompatibleContent(upgradeContent(JSON.parse(r.content)));
      version = r.version;
      body = JSON.stringify({ version, content: schema === 2 ? c : legacyContent(c) });
      if (cache) {
        const put = cache.put(cacheKey(schema), new Response(body, { headers: { 'Cache-Control': `max-age=${CONTENT_TTL}`, 'X-Content-Version': String(version) } }));
        if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
      }
    }
    const etag = `"v${version}-s${schema}"`;
    const out = { ...headers, 'Cache-Control': `public, max-age=${CONTENT_TTL}`, ETag: etag };
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: out });
    return new Response(request.method === 'HEAD' ? null : body, { headers: out });
  } catch (err) {
    console.error('Apple public content', err);
    return new Response('Unavailable', { status: 503, headers });
  }
}

// ------------------------------------------------------------------ sign-in
// Cloudflare Access signs a token for each signed-in visit. It's verified
// here (signature, issuer, audience, expiry, and an email allowlist): the
// cookie alone, or a header someone typed, is never enough. Without the
// three settings, nobody gets in.
let certsCache = { until: 0, fetchedAt: 0, domain: '', keys: [] };
const decodeB64 = s => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
};
const bytes = s => Uint8Array.from(decodeB64(s), ch => ch.charCodeAt(0));
export async function verifyAppleAdmin(request, env) {
  const domain = (env.APPLE_ACCESS_TEAM_DOMAIN || '').replace(/^https:\/\//, '').replace(/\/+$/, '');
  const audience = env.APPLE_ACCESS_AUD;
  const emails = (env.APPLE_ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!/^([a-z0-9-]+\.)+cloudflareaccess\.com$/.test(domain) || !audience || !emails.length) return null;
  const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie?.[1];
  if (!token || token.length > 8192 || token.length < 80) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => p.length > 4096)) return null;
  try {
    const header = JSON.parse(decodeB64(parts[0])), claim = JSON.parse(decodeB64(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || !isText(header.kid, 256) || claim.iss !== 'https://' + domain || ![claim.aud].flat().includes(audience) ||
      typeof claim.exp !== 'number' || claim.exp <= now || (claim.nbf != null && claim.nbf > now) || (claim.iat != null && claim.iat > now + 60) ||
      typeof claim.email !== 'string' || !emails.includes(claim.email.toLowerCase()))
      return null;
    // The keys are fetched again when they're 10 minutes old, or for a key id
    // not seen yet, but at most once a minute: a stream of forged tokens with
    // made-up key ids can't turn this Worker into a flood of requests.
    const known = certsCache.domain === domain && certsCache.keys.some(k => k.kid === header.kid);
    const stale = Date.now() > certsCache.until || certsCache.domain !== domain;
    if ((stale || !known) && (Date.now() - certsCache.fetchedAt > 60000 || certsCache.domain !== domain)) {
      certsCache.fetchedAt = Date.now();
      const res = await fetch('https://' + domain + '/cdn-cgi/access/certs');
      if (!res.ok) return null;
      const doc = await res.json();
      if (!Array.isArray(doc.keys)) return null;
      certsCache = { domain, keys: doc.keys, until: Date.now() + 10 * 60 * 1000, fetchedAt: Date.now() };
    }
    const jwk = certsCache.domain === domain && certsCache.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    return valid ? claim.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ admin
async function bodyJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '') || request.headers.get('X-Apple-Control') !== '1')
    throw Error('Use the portal to submit JSON.');
  const size = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(size) && size > 160000) throw Error('Request exceeds 160 KB.');
  const raw = await request.text();
  if (raw.length > 160000) throw Error('Request exceeds 160 KB.');
  try { return JSON.parse(raw); } catch { throw Error('Invalid JSON.'); }
}
// Tours that have started keep their name, icon and reward until they end:
// players are already earning toward that skin.
function startedTourChanges(before, after, now = utcDay(1)) {
  const numbers = new Set([...before.tours, ...after.tours].map(t => t.number));
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return [...numbers].filter(n => tourStarted(n, now) && !same(before.tours.find(t => t.number === n), after.tours.find(t => t.number === n))).sort((a, b) => a - b);
}
async function publish(db, content, liveVersion, actor, action, note, cache) {
  const incoming = upgradeContent(content);
  const errors = validateContent(incoming);
  if (errors.length) return bad(422, errors.join(' '));
  const current = await live(db);
  if (!int(liveVersion, 0, 2147483647) || current.version !== liveVersion) return bad(409, 'Someone published since you loaded this page. Reload, then publish again.');
  const published = upgradeContent(JSON.parse(current.content));
  const outgoing = clone(incoming);
  // Never take a released skin away from its owners: one missing from a
  // rollback or an edit stays, archived (worn by owners, no longer sold).
  const ids = new Set(outgoing.skins.map(s => s.id));
  for (const s of published.skins) if (!ids.has(s.id)) { outgoing.skins.push({ ...s, active: false }); ids.add(s.id); }
  const locked = startedTourChanges(published, outgoing);
  if (locked.length) return bad(422, `Orchard Tour ${locked.join(', ')} has already started, so its name, icon and reward can’t change until it ends (players are earning toward that skin). Undo that change, then publish.`);
  const compatible = deviceCompatibleContent(outgoing);
  const mergedErrors = validateContent(compatible);
  if (mergedErrors.length) return bad(422, mergedErrors.join(' '));
  const next = current.version + 1, editedAt = new Date().toISOString();
  // One transaction: the update and its history entry commit together.
  const results = await db.batch([
    db.prepare('UPDATE apple_control_live SET version = ?, content = ?, edited_at = ?, edited_by = ? WHERE id = 1 AND version = ?').bind(next, JSON.stringify(compatible), editedAt, actor, liveVersion),
    db.prepare('INSERT INTO apple_control_versions (version, content, created_at, actor, action, note) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM apple_control_live WHERE id=1 AND version=?)')
      .bind(next, JSON.stringify(compatible), editedAt, actor, action, note, next),
  ]);
  if (results[0].meta?.changes !== 1 || results[1].meta?.changes !== 1) return bad(409, 'Another publish finished first. Reload, then publish again.');
  // This data centre serves the new version at once; others within 30 s.
  if (cache) await Promise.all([1, 2].map(s => cache.delete(cacheKey(s)).catch(() => {})));
  return answer({ ok: true, version: next, editedAt });
}

// The portal's page, script and styles are only served here, to a verified
// owner; their raw /apple-control/* addresses are blocked (src/index.js).
export async function handleAppleControl(request, env) {
  const actor = await verifyAppleAdmin(request, env);
  if (!actor) return new Response('Apple Control Center: verified Cloudflare Access sign-in required, with APPLE_ACCESS_TEAM_DOMAIN, APPLE_ACCESS_AUD and APPLE_ADMIN_EMAILS configured.', {
    status: 403, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '');
  if (path === '/apple/portal' || path.startsWith('/apple/portal/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return bad(405, 'Method not allowed.');
    const rest = path.slice('/apple/portal'.length) || '/index.html';
    if (!['/index.html', '/app.js', '/style.css'].includes(rest)) return bad(404, 'Not found.');
    const internalPath = rest === '/index.html' ? '/apple-control/' : '/apple-control' + rest;
    let asset = await env.ASSETS.fetch(new URL(internalPath, url));
    if (!asset.ok && rest === '/index.html') asset = await env.ASSETS.fetch(new URL('/apple-control/index.html', url));
    if (!asset.ok || asset.status >= 300) return new Response('Private portal asset unavailable.', { status: 503, headers: JSON_HEADERS });
    return new Response(asset.body, { status: 200, headers: {
      'Content-Type': rest.endsWith('.js') ? 'text/javascript; charset=utf-8' : rest.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    } });
  }
  if (!path.startsWith('/apple/admin/api/')) return bad(404, 'Not found.');
  if (!env.APPLE_DB) return bad(503, 'APPLE_DB is not configured.');
  const isWrite = request.method !== 'GET';
  if (isWrite && request.method !== 'POST' && request.method !== 'PUT') return bad(405, 'Method not allowed.');
  if (isWrite && request.headers.get('Origin') !== url.origin) return bad(403, 'Request origin does not match the portal.');
  const db = env.APPLE_DB, cache = globalThis.caches?.default;
  try {
    await tables(db);
    if (path === '/apple/admin/api/content' && request.method === 'GET')
      return answer({ live: present(await live(db)), draft: present(await draft(db)), actor, today: utcDay() });
    if (path === '/apple/admin/api/history' && request.method === 'GET') {
      const items = (await db.prepare('SELECT version, created_at, actor, action, note FROM apple_control_versions ORDER BY version DESC LIMIT 80').all()).results;
      return answer({ items });
    }
    if (path === '/apple/admin/api/version' && request.method === 'GET') {
      const v = Number.parseInt(url.searchParams.get('v') || '', 10);
      if (!int(v, 1, 2147483647)) return bad(400, 'Which version?');
      const r = await db.prepare('SELECT version, content, created_at, actor, action, note FROM apple_control_versions WHERE version = ?').bind(v).first();
      return r ? answer({ ...r, content: upgradeContent(JSON.parse(r.content)) }) : bad(404, 'Version not found.');
    }
    if (path === '/apple/admin/api/health' && request.method === 'GET') {
      const last = await live(db);
      const stats = await db.prepare('SELECT MAX(day) AS last_day, COUNT(*) AS rows FROM apple_stats').first();
      return answer({ ok: true, time: new Date().toISOString(), liveVersion: last.version, lastPublished: last.edited_at, lastStatsDay: stats.last_day, rows: stats.rows });
    }
    if (path === '/apple/admin/api/stats' && request.method === 'GET') {
      const days = Math.min(90, Math.max(7, Number.parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const platform = url.searchParams.get('platform') || 'all';
      if (!['all', 'ios', 'android'].includes(platform)) return bad(400, 'Invalid platform filter.');
      const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
      const osFilter = platform === 'all' ? '' : ' AND os = ?';
      const args = platform === 'all' ? [since] : [since, platform];
      const daily = (await db.prepare('SELECT day, os, app, event, detail, SUM(n) AS n FROM apple_stats WHERE day >= ?' + osFilter + ' GROUP BY day, os, app, event, detail ORDER BY day DESC LIMIT 20000').bind(...args).all()).results;
      const levels = (await db.prepare("SELECT event, detail, SUM(n) AS n FROM apple_stats WHERE day >= ?" + osFilter + " AND event IN ('level_reached','level_clear','level_fail') GROUP BY event, detail").bind(...args).all()).results;
      const rankSince = Math.floor((Date.parse(since + 'T00:00:00Z') - DAY_ONE) / 864e5) + 1;
      const ranks = platform === 'all' ? (await db.prepare('SELECT num, score, n FROM apple_daily WHERE num >= ? AND n > 0 ORDER BY num DESC, score DESC LIMIT 2000').bind(rankSince).all()).results : [];
      return answer({ days, since, platform, daily, levels, ranks, rankingAllPlatformOnly: true });
    }
    if (path === '/apple/admin/api/draft' && request.method === 'PUT') {
      const b = await bodyJson(request);
      const content = upgradeContent(b.content);
      const errors = validateContent(content);
      if (errors.length) return bad(422, errors.join(' '));
      const existing = await draft(db), version = existing?.version || 0;
      if (b.baseVersion !== version) return bad(409, 'The draft was changed in another tab or window. Reload to get its latest.');
      const compatible = deviceCompatibleContent(content);
      const next = version + 1, text = JSON.stringify(compatible), at = new Date().toISOString();
      if (!existing) {
        const created = await db.prepare('INSERT OR IGNORE INTO apple_control_draft (id, version, content, edited_at, edited_by) VALUES (1, ?, ?, ?, ?)').bind(next, text, at, actor).run();
        if (created.meta?.changes !== 1) return bad(409, 'A draft was started in another tab or window. Reload.');
      } else {
        const r = await db.prepare('UPDATE apple_control_draft SET version=?, content=?, edited_at=?, edited_by=? WHERE id=1 AND version=?').bind(next, text, at, actor, version).run();
        if (r.meta?.changes !== 1) return bad(409, 'The draft changed while saving. Reload.');
      }
      return answer({ ok: true, version: next, editedAt: at, content: compatible });
    }
    if (path === '/apple/admin/api/discard' && request.method === 'POST') {
      const b = await bodyJson(request), existing = await draft(db);
      if (!existing) return answer({ ok: true });
      if (b.draftVersion !== existing.version) return bad(409, 'The draft changed in another tab or window. Reload.');
      await db.prepare('DELETE FROM apple_control_draft WHERE id=1 AND version=?').bind(existing.version).run();
      return answer({ ok: true });
    }
    if (path === '/apple/admin/api/publish' && request.method === 'POST') {
      const b = await bodyJson(request), existing = await draft(db);
      if (!existing || b.draftVersion !== existing.version) return bad(409, 'The draft changed since you reviewed it. Review it again, then publish.');
      const note = isText(b.note, 140, false) ? b.note : '';
      const result = await publish(db, JSON.parse(existing.content), b.liveVersion, actor, 'publish', note || 'Published', cache);
      // Published: the draft is done with.
      if (result.status === 200) await db.prepare('DELETE FROM apple_control_draft WHERE id=1 AND version=?').bind(existing.version).run();
      return result;
    }
    if (path === '/apple/admin/api/rollback' && request.method === 'POST') {
      const b = await bodyJson(request);
      if (!int(b.version, 1, 2147483647)) return bad(400, 'Choose a version from the history.');
      const original = await db.prepare('SELECT content FROM apple_control_versions WHERE version=?').bind(b.version).first();
      if (!original) return bad(404, 'Version not found.');
      return publish(db, JSON.parse(original.content), b.liveVersion, actor, 'rollback', `Back to version ${b.version}`, cache);
    }
    return bad(404, 'Unknown endpoint or method.');
  } catch (err) {
    console.error('Apple Control Center error', err);
    if (/JSON|exceeds|portal/.test(String(err.message))) return bad(400, String(err.message));
    return bad(503, 'That didn’t go through, and nothing was changed. Try again in a moment.');
  }
}
