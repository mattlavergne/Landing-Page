// Apple Control Center: authenticated admin operations and public data-only content.
// Never ship executable code or admin credentials to a player. The public endpoint
// exposes only strictly validated artwork, dated challenge selections and labels.
const EMPTY = Object.freeze({ schema: 1, skins: [], daily: [], weekly: [], tours: [],
  notice: null, flags: { pauseInterstitials: false, pauseRewarded: false, pauseBanners: false } });
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
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
const blank = () => JSON.parse(JSON.stringify(EMPTY));
const dateOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(d + 'T00:00:00Z')) &&
  new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const TODAY = () => new Date().toISOString().slice(0, 10);
const DAILY_IDS = {
  0: ['close', 'stars', 'level', 'walls', 'scratch'],
  1: ['nerve', 'poison', 'self', 'unbitten', 'frenzy'],
  2: ['lunge', 'grade', 'tangle', 'double', 'deep'],
};
const TOUR_SKINS = ['moonlight', 'blossom', 'ocean', 'honey', 'mint', 'berry', 'comet', 'clover'];

// Exported to make validation testable without a D1 database or login.
export function validateContent(c) {
  const errors = [];
  if (!hasKeys(c, ['schema', 'skins', 'daily', 'weekly', 'tours', 'notice', 'flags']) || c.schema !== 1)
    return ['Invalid document schema (expected schema 1).'];
  const lists = ['skins', 'daily', 'weekly', 'tours'];
  for (const key of lists) if (!Array.isArray(c[key]) || c[key].length > (key === 'skins' ? 80 : 150))
    errors.push(key + ' must be an array of permitted length.');
  if (errors.length) return errors;
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) errors.push('Duplicate ' + label + '.');
  };
  c.skins.forEach((s, i) => {
    if (!hasKeys(s, ['id','name','base','dark','light','leaf','cost','gloss','sparkle','stick','rainbow','active','tour']) ||
      !/^custom-[a-z0-9-]{3,40}$/.test(s.id || '') || !isText(s.name, 34) ||
      !['base','dark','light','leaf'].every(k => color(s[k])) || !int(s.cost, 0, 10000) ||
      !BOOLS.every(k => typeof s[k] === 'boolean') || (s.tour && s.cost !== 0))
      errors.push('Skin ' + (i+1) + ': invalid identifier, color, price or options.');
  });
  unique(c.skins.map(s => s.id), 'skin IDs');
  c.daily.forEach((d, i) => {
    if (!hasKeys(d, ['date', 'items']) || !dateOk(d.date) || !Array.isArray(d.items) || d.items.length !== 3) {
      errors.push('Daily schedule ' + (i+1) + ' needs a valid date and exactly 3 challenges.'); return;
    }
    d.items.forEach((x, tier) => {
      if (!hasKeys(x, ['id','target','label','icon']) || !DAILY_IDS[tier].includes(x.id) ||
        !int(x.target, 1, 100) || !isText(x.label, 80, false) || !isText(x.icon, 12, false))
        errors.push('Daily ' + d.date + ': challenge ' + (tier+1) + ' has invalid values or tier.');
    });
  });
  unique(c.daily.map(d => d.date), 'daily dates');
  c.weekly.forEach((w, i) => {
    if (!hasKeys(w, ['monday','type','name','desc','icon']) || !dateOk(w.monday) ||
      new Date(w.monday + 'T12:00:00Z').getUTCDay() !== 1 ||
      !['stars','boxes','golden','xp'].includes(w.type) ||
      !isText(w.name, 40) || !isText(w.desc, 140) || !icon(w.icon))
      errors.push('Weekly schedule ' + (i+1) + ': check Monday, mechanic, name and description.');
  });
  unique(c.weekly.map(w => w.monday), 'weekly dates');
  c.tours.forEach((t, i) => {
    const skin = c.skins.find(s => s.id === t.skin);
    if (!hasKeys(t, ['number','name','icon','skin']) || !int(t.number, 1, 100000) ||
      !isText(t.name, 40) || !icon(t.icon) ||
      !(TOUR_SKINS.includes(t.skin) || (skin && skin.tour && skin.active)))
      errors.push('Orchard Tour ' + (i+1) + ': invalid number, name, icon or reward skin.');
  });
  unique(c.tours.map(t => t.number), 'tour numbers');
  if (c.notice !== null && (!hasKeys(c.notice, ['title','body','start','end','enabled']) ||
      !isText(c.notice.title, 60) || !isText(c.notice.body, 240) ||
      !dateOk(c.notice.start) || !dateOk(c.notice.end) ||
      c.notice.end < c.notice.start || typeof c.notice.enabled !== 'boolean'))
    errors.push('Announcement needs a title, message and valid start/end dates.');
  if (!hasKeys(c.flags, ['pauseInterstitials', 'pauseRewarded', 'pauseBanners']) ||
    !Object.values(c.flags).every(v => typeof v === 'boolean'))
    errors.push('Ad safety switches must be true or false.');
  if (JSON.stringify(c).length > 60000) errors.push('Content exceeds the 60 KB limit.');
  return errors.slice(0, 30);
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
const present = r => r ? ({ version: r.version, content: JSON.parse(r.content),
  editedAt: r.edited_at, editedBy: r.edited_by }) : null;

// Read-only and deliberately accessible to the store app. Nothing sensitive.
export async function publicAppleContent(request, env) {
  const origin = request.headers.get('Origin');
  const allow = !origin || /^(https:\/\/(localhost|mattlavergne\.com|([a-z0-9-]+\.)+mattlavergne\.com|mattlavergne\.github\.io)|capacitor:\/\/localhost)$/i.test(origin);
  const headers = { ...JSON_HEADERS, 'Access-Control-Allow-Origin': allow && origin ? origin : 'https://mattlavergne.com',
    'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  if (!env.APPLE_DB) return new Response('Not configured', { status: 503, headers });
  try {
    await tables(env.APPLE_DB);
    const r = await live(env.APPLE_DB);
    const body = JSON.stringify({ version: r.version, content: JSON.parse(r.content) });
    return new Response(body, { headers: { ...headers, 'Cache-Control': 'public, max-age=60',
      'ETag': '"' + r.version + '"' } });
  } catch (err) {
    console.error('Apple public content', err);
    return new Response('Unavailable', { status: 503, headers });
  }
}

let certsCache = { until: 0, domain: '', keys: [] };
const decodeB64 = s => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
};
const bytes = s => Uint8Array.from(decodeB64(s), ch => ch.charCodeAt(0));
export async function verifyAppleAdmin(request, env) {
  const domain = (env.APPLE_ACCESS_TEAM_DOMAIN || '').replace(/^https:\/\//, '').replace(/\/+$/, '');
  const audience = env.APPLE_ACCESS_AUD;
  const emails = (env.APPLE_ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  // Refuse all admin access until these are set explicitly. Never trust a
  // supplied email header, a mere cookie or a JWT whose signature was not checked.
  if (!/^([a-z0-9-]+\.)+cloudflareaccess\.com$/.test(domain) || !audience || !emails.length)
    return null;
  const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie?.[1];
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decodeB64(parts[0])), claim = JSON.parse(decodeB64(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || !isText(header.kid, 256) ||
      claim.iss !== 'https://' + domain ||
      ![claim.aud].flat().includes(audience) ||
      typeof claim.exp !== 'number' || claim.exp <= now ||
      (claim.nbf != null && claim.nbf > now) ||
      (claim.iat != null && claim.iat > now + 60) ||
      typeof claim.email !== 'string' || !emails.includes(claim.email.toLowerCase()))
      return null;
    if (Date.now() > certsCache.until || certsCache.domain !== domain ||
        !certsCache.keys.some(k => k.kid === header.kid)) {
      const res = await fetch('https://' + domain + '/cdn-cgi/access/certs');
      if (!res.ok) return null;
      const doc = await res.json();
      if (!Array.isArray(doc.keys)) return null;
      certsCache = { domain, keys: doc.keys, until: Date.now() + 10 * 60 * 1000 };
    }
    const jwk = certsCache.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1]));
    return valid ? claim.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
async function bodyJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '') ||
    request.headers.get('X-Apple-Control') !== '1') throw Error('Use the portal to submit JSON.');
  const raw = await request.text();
  if (raw.length > 80000) throw Error('Request exceeds 80 KB.');
  try { return JSON.parse(raw); } catch { throw Error('Invalid JSON.'); }
}
async function publish(db, content, liveVersion, actor, action, note) {
  const errors = validateContent(content);
  if (errors.length) return bad(422, errors.join(' '));
  const current = await live(db);
  if (!int(liveVersion, 0, 2147483647) || current.version !== liveVersion)
    return bad(409, 'Live content changed. Reload before publishing.');
  const next = current.version + 1, editedAt = new Date().toISOString();
  // One D1 transaction: an update and its history entry commit together.
  const results = await db.batch([
    db.prepare('UPDATE apple_control_live SET version = ?, content = ?, edited_at = ?, edited_by = ? WHERE id = 1 AND version = ?')
      .bind(next, JSON.stringify(content), editedAt, actor, liveVersion),
    db.prepare('INSERT INTO apple_control_versions (version, content, created_at, actor, action, note) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM apple_control_live WHERE id=1 AND version=?)')
      .bind(next, JSON.stringify(content), editedAt, actor, action, note, next)
  ]);
  if (results[0].meta?.changes !== 1 || results[1].meta?.changes !== 1)
    return bad(409, 'Another publication completed first.');
  return answer({ ok: true, version: next, editedAt });
}

// The portal HTML/CSS/JS are static assets, but reachable ONLY through
// /apple/portal routes here, not by requesting the raw /apple-control/* path.
export async function handleAppleControl(request, env) {
  const actor = await verifyAppleAdmin(request, env);
  if (!actor) return new Response('Apple Control Center: verified Cloudflare Access sign-in required, with APPLE_ACCESS_TEAM_DOMAIN, APPLE_ACCESS_AUD and APPLE_ADMIN_EMAILS configured.', {
    status: 403, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '');
  if (path === '/apple/portal' || path.startsWith('/apple/portal/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return bad(405, 'Method not allowed.');
    const rest = path.slice('/apple/portal'.length) || '/index.html';
    if (!['/index.html', '/app.js', '/style.css'].includes(rest)) return bad(404, 'Not found.');
    const asset = await env.ASSETS.fetch(new URL('/apple-control' + rest, url));
    return new Response(asset.body, { status: asset.status, headers: {
      'Content-Type': rest.endsWith('.js') ? 'text/javascript; charset=utf-8' :
        rest.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer'
    }});
  }
  if (!path.startsWith('/apple/admin/api/')) return bad(404, 'Not found.');
  if (!env.APPLE_DB) return bad(503, 'APPLE_DB is not configured.');
  const isWrite = request.method !== 'GET';
  if (isWrite && (request.method !== 'POST' && request.method !== 'PUT'))
    return bad(405, 'Method not allowed.');
  if (isWrite && request.headers.get('Origin') !== url.origin)
    return bad(403, 'Request origin does not match the portal.');
  const db = env.APPLE_DB;
  try {
    await tables(db);
    if (path === '/apple/admin/api/content' && request.method === 'GET')
      return answer({ live: present(await live(db)), draft: present(await draft(db)), actor });
    if (path === '/apple/admin/api/history' && request.method === 'GET') {
      const items = (await db.prepare('SELECT version, created_at, actor, action, note FROM apple_control_versions ORDER BY version DESC LIMIT 80').all()).results;
      return answer({ items });
    }
    if (path === '/apple/admin/api/health' && request.method === 'GET') {
      const last = await live(db);
      const stats = await db.prepare('SELECT MAX(day) AS last_day, COUNT(*) AS rows FROM apple_stats').first();
      return answer({ ok: true, time: new Date().toISOString(), liveVersion: last.version,
        lastPublished: last.edited_at, lastStatsDay: stats.last_day, rows: stats.rows,
        notes: ['Revenue must be checked in AdMob and App Store Connect.', 'Counts reflect voluntary anonymous reports, not authenticated people.'] });
    }
    if (path === '/apple/admin/api/stats' && request.method === 'GET') {
      const days = Math.min(90, Math.max(7, Number.parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
      const daily = (await db.prepare('SELECT day, os, app, event, detail, SUM(n) AS n FROM apple_stats WHERE day >= ? GROUP BY day, os, app, event, detail ORDER BY day DESC LIMIT 20000').bind(since).all()).results;
      const levels = (await db.prepare("SELECT event, detail, SUM(n) AS n FROM apple_stats WHERE event IN ('level_reached','level_clear','level_fail') GROUP BY event, detail").all()).results;
      const ranks = (await db.prepare('SELECT num, score, n FROM apple_daily WHERE num >= ? AND n > 0 ORDER BY num DESC, score DESC LIMIT 2000')
        .bind(Math.floor((Date.now() - Date.UTC(2026, 9, 1)) / 864e5) - 29).all()).results;
      return answer({ days, since, daily, levels, ranks });
    }
    if (path === '/apple/admin/api/draft' && request.method === 'PUT') {
      const b = await bodyJson(request);
      const errors = validateContent(b.content);
      if (errors.length) return bad(422, errors.join(' '));
      const existing = await draft(db), version = existing?.version || 0;
      if (b.baseVersion !== version) return bad(409, 'Draft was changed elsewhere. Reload to avoid overwriting it.');
      const next = version + 1, content = JSON.stringify(b.content), at = new Date().toISOString();
      if (!existing) {
        await db.prepare('INSERT OR IGNORE INTO apple_control_draft (id, version, content, edited_at, edited_by) VALUES (1, ?, ?, ?, ?)')
          .bind(next, content, at, actor).run();
      } else {
        const r = await db.prepare('UPDATE apple_control_draft SET version=?, content=?, edited_at=?, edited_by=? WHERE id=1 AND version=?')
          .bind(next, content, at, actor, version).run();
        if (r.meta?.changes !== 1) return bad(409, 'Draft changed while saving.');
      }
      return answer({ ok: true, version: next, editedAt: at });
    }
    if (path === '/apple/admin/api/publish' && request.method === 'POST') {
      const b = await bodyJson(request), existing = await draft(db);
      if (!existing || b.draftVersion !== existing.version) return bad(409, 'Save the latest draft before publishing.');
      const note = isText(b.note, 140, false) ? b.note : '';
      return publish(db, JSON.parse(existing.content), b.liveVersion, actor, 'publish', note || 'Published from draft');
    }
    if (path === '/apple/admin/api/rollback' && request.method === 'POST') {
      const b = await bodyJson(request);
      if (!int(b.version, 1, 2147483647)) return bad(400, 'Choose a history version.');
      const original = await db.prepare('SELECT content FROM apple_control_versions WHERE version=?').bind(b.version).first();
      if (!original) return bad(404, 'Version not found.');
      return publish(db, JSON.parse(original.content), b.liveVersion, actor, 'rollback', 'Restore version ' + b.version);
    }
    return bad(404, 'Unknown endpoint or method.');
  } catch (err) {
    console.error('Apple Control Center error', err);
    if (/JSON|exceeds|portal/.test(String(err.message))) return bad(400, String(err.message));
    return bad(503, 'The requested operation could not be completed. No success has been confirmed.');
  }
}
