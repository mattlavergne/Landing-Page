// Cloud saves for The Apple (mattlavergne.com/apple).
//
//   GET /apple/api/save/<CODE>  -> { data, updatedAt } or 404
//   PUT /apple/api/save/<CODE>  <- { data, updatedAt }
//
// There are no accounts: a device makes up a random 12-character sync code and
// any device that knows the code shares the save. No personal data is stored.
// Merging two devices' progress happens in the game; the server just keeps the
// latest copy.
//
// Storage is a D1 database bound as APPLE_DB (see wrangler.toml). The table is
// created on first use, so there is no migration step.

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

let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS apple_saves (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL)'
  ).run();
  tableReady = true;
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
    const row = await db.prepare('SELECT data, updated_at FROM apple_saves WHERE code = ?').bind(code).first();
    if (!row) return respond(request, 404, { error: 'no save for this code' });
    return respond(request, 200, { data: JSON.parse(row.data), updatedAt: row.updated_at });
  }

  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_BYTES) return respond(request, 413, { error: 'save too large' });
    let body;
    try { body = JSON.parse(text); } catch { return respond(request, 400, { error: 'bad json' }); }
    if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
      return respond(request, 400, { error: 'expected { data: {...} }' });
    }
    const updatedAt = Number.isFinite(body.updatedAt) ? Math.min(body.updatedAt, Date.now() + 60_000) : Date.now();
    const now = Date.now();
    await db.prepare(
      'INSERT INTO apple_saves (code, data, updated_at, created_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(code, JSON.stringify(body.data), updatedAt, now).run();
    return respond(request, 200, { ok: true, updatedAt });
  }

  return respond(request, 405, { error: 'method not allowed' });
}
