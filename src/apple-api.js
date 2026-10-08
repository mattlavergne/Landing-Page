// Cloud saves for The Apple (mattlavergne.com/apple).
//
//   GET /apple/api/save/<CODE>[?have=<rev>]
//     -> { data, updatedAt, rev }, or { unchanged: true, rev } when the caller
//        already has revision <rev>, or 404 when nothing is saved yet
//   PUT /apple/api/save/<CODE>  <- { data, updatedAt, baseRev }
//     -> { ok: true, rev, updatedAt }
//     -> 409 { conflict: true, reason, data, updatedAt, rev } when another
//        device saved first (baseRev is not the latest revision) or the new
//        save has less progress than the stored one. The game merges the
//        returned save into its own and tries again.
//
// There are no accounts: a device makes up a random 12-character sync code and
// any device that knows the code shares the save. No personal data is stored.
// Merging progress happens in the game (js/sync.js in mattlavergne/apple).
//
// A save can't go backwards, whatever a game version or a race does:
//   - every write must be based on the latest revision (compare-and-swap);
//   - progress that only ever grows (unlocked levels, stars, upgrades, skins,
//     lifetime stats, the star ledger) is checked and can never shrink;
//   - recent versions of every save are kept in apple_save_history (the last
//     20, plus the last one of each day for 30 days), so a mistake can be
//     undone by hand.
//
// Storage is a D1 database bound as APPLE_DB (see wrangler.toml). Tables are
// created and upgraded on first use, so there is no migration step.

const CODE = /^[A-HJ-NP-Z2-9]{12}$/; // no 0/O/1/I, so codes are easy to read aloud
const MAX_BYTES = 64 * 1024;

// The game runs on this domain (framed, under /apple/_app/) and on GitHub Pages.
// The store app's pages come from capacitor://localhost (iOS) and
// https://localhost (Android); both have the hostname localhost, so the
// localhost rule below must keep allowing any scheme.
function allowedOrigin(origin) {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:' && (u.hostname === 'mattlavergne.com' || u.hostname.endsWith('.mattlavergne.com'))) return origin;
    if (u.protocol === 'https:' && u.hostname === 'mattlavergne.github.io') return origin;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return origin;
  } catch { /* bad origin header */ }
  return null;
}

function respond(request, status, body) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const origin = allowedOrigin(request.headers.get('Origin'));
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, PUT, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
    headers.Vary = 'Origin';
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

const KEEP_RECENT = 20;
const KEEP_DAYS = 30;

let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS apple_saves (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, ' +
    'created_at INTEGER NOT NULL, rev INTEGER NOT NULL DEFAULT 0)'
  ).run();
  // Tables made before revisions existed get the column (existing saves start at rev 0).
  try {
    await db.prepare('ALTER TABLE apple_saves ADD COLUMN rev INTEGER NOT NULL DEFAULT 0').run();
  } catch (e) {
    if (!/duplicate column/i.test(String(e && e.message))) throw e;
  }
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS apple_save_history (code TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT NOT NULL, ' +
    'saved_at INTEGER NOT NULL, PRIMARY KEY (code, rev))'
  ).run();
  tableReady = true;
}

// Progress that only ever grows. Returns where `next` has less than `prev`
// (empty when nothing would be lost). Keep in step with regressions() in the
// game's js/sync.js.
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export function regressions(next, prev) {
  const lost = [];
  const n = obj(next), p = obj(prev);
  const map = (path, a, b) => {
    a = obj(a);
    for (const [k, v] of Object.entries(obj(b))) if (num(a[k]) < num(v)) lost.push(`${path}.${k}`);
  };
  if (num(obj(n.adventure).unlocked) < num(obj(p.adventure).unlocked)) lost.push('adventure.unlocked');
  map('adventure.stars', obj(n.adventure).stars, obj(p.adventure).stars);
  map('adventure.best', obj(n.adventure).best, obj(p.adventure).best);
  map('upgrades', n.upgrades, p.upgrades);
  map('stats', n.stats, p.stats);
  for (const [mode, b] of Object.entries(obj(p.best))) map(`best.${mode}`, obj(n.best)[mode], b);
  for (const [dev, l] of Object.entries(obj(p.ledger))) map(`ledger.${dev}`, obj(n.ledger)[dev], l);
  const skins = new Set(Array.isArray(n.skins) ? n.skins : []);
  for (const s of Array.isArray(p.skins) ? p.skins : []) if (!skins.has(s)) lost.push(`skins.${s}`);
  return lost;
}

const readSave = (db, code) =>
  db.prepare('SELECT data, updated_at, rev FROM apple_saves WHERE code = ?').bind(code).first();

// Keeps the last KEEP_RECENT versions, plus the last version of each day for
// KEEP_DAYS days. A failure here never fails the save itself.
async function keepHistory(db, code, rev, data, now) {
  try {
    await db.batch([
      db.prepare('INSERT OR REPLACE INTO apple_save_history (code, rev, data, saved_at) VALUES (?, ?, ?, ?)').bind(code, rev, data, now),
      db.prepare(
        'DELETE FROM apple_save_history WHERE code = ? AND rev <= ? AND (saved_at < ? OR rev NOT IN ' +
        '(SELECT MAX(rev) FROM apple_save_history WHERE code = ? GROUP BY saved_at / 86400000))'
      ).bind(code, rev - KEEP_RECENT, now - KEEP_DAYS * 864e5, code),
    ]);
  } catch (e) {
    console.error('apple_save_history', e);
  }
}

export async function handleAppleApi(request, env) {
  if (request.method === 'OPTIONS') return respond(request, 204, null);
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/apple\/api\/save\/([^/]+)\/?$/);
  if (!m) return respond(request, 404, { error: 'not found' });
  const code = m[1].toUpperCase();
  if (!CODE.test(code)) return respond(request, 400, { error: 'bad sync code' });
  const db = env.APPLE_DB;
  if (!db) return respond(request, 503, { error: 'sync not configured' });
  await ensureTable(db);

  if (request.method === 'GET') {
    const row = await readSave(db, code);
    if (!row) return respond(request, 404, { error: 'no save for this code' });
    const have = url.searchParams.get('have');
    if (have !== null && Number(have) === row.rev) return respond(request, 200, { unchanged: true, rev: row.rev });
    return respond(request, 200, { data: JSON.parse(row.data), updatedAt: row.updated_at, rev: row.rev });
  }

  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_BYTES) return respond(request, 413, { error: 'save too large' });
    let body;
    try { body = JSON.parse(text); } catch { return respond(request, 400, { error: 'bad json' }); }
    if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
      return respond(request, 400, { error: 'expected { data: {...} }' });
    }
    // Game versions from before revisions don't send baseRev; they still get
    // the progress check and the compare-and-swap below.
    const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : null;
    const now = Date.now();
    const updatedAt = Number.isFinite(body.updatedAt) ? Math.min(body.updatedAt, now + 60_000) : now;
    const json = JSON.stringify(body.data);
    const conflict = (row, reason, extra = {}) => respond(request, 409, {
      conflict: true, reason, ...extra, data: JSON.parse(row.data), updatedAt: row.updated_at, rev: row.rev,
    });

    let row = await readSave(db, code);
    let rev;
    if (row) {
      if (baseRev !== null && baseRev !== row.rev) return conflict(row, 'stale');
      const lost = regressions(body.data, JSON.parse(row.data));
      if (lost.length) return conflict(row, 'would-lose-progress', { lost: lost.slice(0, 20) });
      rev = row.rev + 1;
      // Before revisions there was no history: keep the version being replaced.
      if (row.rev === 0) await keepHistory(db, code, 0, row.data, now);
      const res = await db.prepare('UPDATE apple_saves SET data = ?, updated_at = ?, rev = ? WHERE code = ? AND rev = ?')
        .bind(json, updatedAt, rev, code, row.rev).run();
      if (res.meta?.changes !== 1) {
        // Another device saved between our read and our write.
        row = await readSave(db, code);
        return row ? conflict(row, 'stale') : respond(request, 503, { error: 'try again' });
      }
    } else {
      rev = 1;
      const res = await db.prepare(
        'INSERT INTO apple_saves (code, data, updated_at, created_at, rev) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING'
      ).bind(code, json, updatedAt, now, rev).run();
      if (res.meta?.changes !== 1) {
        row = await readSave(db, code);
        return row ? conflict(row, 'stale') : respond(request, 503, { error: 'try again' });
      }
    }
    await keepHistory(db, code, rev, json, now);
    return respond(request, 200, { ok: true, rev, updatedAt });
  }

  return respond(request, 405, { error: 'method not allowed' });
}
