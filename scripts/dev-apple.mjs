// The Apple's control center on your own computer: the real Worker
// (src/index.js) with a local database, a stand-in Cloudflare sign-in, the
// game served from a checkout of the game repo next to this one, and
// nothing sent to mattlavergne.com. For trying the portal and testing it
// end to end; production is untouched.
//   node scripts/dev-apple.mjs [--port 8787] [--db file.sqlite] [--game ../The-Apple]
// Then open http://localhost:8787/apple/portal/ (signed in as dev@local.test)
// and the game at /apple/test/. The game only downloads content on
// mattlavergne.com, so tests open it as http://mattlavergne.com:8787 with the
// browser told that name means this computer (Chromium:
// --host-resolver-rules="MAP mattlavergne.com 127.0.0.1"). Add ?signed-out to
// a portal address to see what a stranger gets.
// Needs Node 22 or later (node:sqlite).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createSign, generateKeyPairSync } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('--port', 8787));
const gameDir = resolve(site, arg('--game', '../The-Apple'));
const dbPath = arg('--db', ':memory:');
const EMAIL = 'dev@local.test', TEAM = 'dev-local.cloudflareaccess.com', AUD = 'dev-local-aud';

// D1, on SQLite: the subset the Worker uses.
const sqlite = new DatabaseSync(dbPath);
const stmt = (sql, args = []) => ({
  bind: (...values) => stmt(sql, values),
  run: async () => { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  first: async () => sqlite.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  now: () => { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
});
const db = {
  prepare: sql => stmt(sql),
  batch: async jobs => {
    sqlite.exec('BEGIN');
    try { const out = jobs.map(j => j.now()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
  exec: async sql => sqlite.exec(sql),
};

// Static assets, as Cloudflare serves public/ (directory URLs -> index.html).
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
function fileResponse(root, path) {
  let file = join(root, decodeURIComponent(path));
  if (!file.startsWith(root)) return new Response('Not found', { status: 404 });
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
  if (!existsSync(file)) return new Response('Not found', { status: 404 });
  return new Response(readFileSync(file), { headers: { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' } });
}
const ASSETS = { fetch: async input => fileResponse(join(site, 'public'), new URL(input.url || input).pathname) };

// The Cache API (caches.default), in memory.
const store = new Map();
globalThis.caches = { default: {
  match: async req => { const hit = store.get(new URL(req.url || req).href); if (!hit || hit.until < Date.now()) return undefined; return new Response(hit.body, { status: hit.status, headers: hit.headers }); },
  put: async (req, res) => {
    const age = Number((res.headers.get('Cache-Control') || '').match(/(?:s-)?max-age=(\d+)/)?.[1] || 0);
    store.set(new URL(req.url || req).href, { body: await res.arrayBuffer(), status: res.status, headers: [...res.headers], until: Date.now() + age * 1000 });
  },
  delete: async req => store.delete(new URL(req.url || req).href),
} };

// A stand-in for Cloudflare Access: a key pair, its certificate list, and a
// signed token on every request (unless ?signed-out).
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'dev', alg: 'RS256', use: 'sig' };
const token = () => {
  const now = Math.floor(Date.now() / 1000);
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = enc({ alg: 'RS256', kid: 'dev', typ: 'JWT' }) + '.' + enc({ iss: `https://${TEAM}`, aud: [AUD], email: EMAIL, iat: now - 5, nbf: now - 5, exp: now + 3600 });
  return input + '.' + createSign('RSA-SHA256').update(input).sign(privateKey, 'base64url');
};

// Outside requests the Worker makes: Access's certificates, and the game
// (which production proxies from GitHub) from the local checkout.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input.url || input);
  if (url.href === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
  if (url.origin === 'https://mattlavergne.github.io' && url.pathname.startsWith('/apple')) return fileResponse(gameDir, url.pathname.slice('/apple'.length) || '/');
  return realFetch(input, init);
};

const { default: worker } = await import(join(site, 'src', 'index.js'));
const env = { APPLE_DB: db, ASSETS, APPLE_ACCESS_TEAM_DOMAIN: TEAM, APPLE_ACCESS_AUD: AUD, APPLE_ADMIN_EMAILS: EMAIL };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost:' + port}`);
    const signedOut = url.searchParams.has('signed-out') || /signed-out/.test(req.headers.referer || '');
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    // The Worker checks that writes come from its own origin: the page's.
    const external = new URL(url.pathname + url.search, 'https://mattlavergne.com');
    if (headers.get('origin') === url.origin) headers.set('origin', 'https://mattlavergne.com');
    if (!signedOut) headers.set('Cf-Access-Jwt-Assertion', token());
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(r => { const b = []; req.on('data', c => b.push(c)); req.on('end', () => r(Buffer.concat(b))); });
    const ctx = { waitUntil: p => Promise.resolve(p).catch(e => console.error(e)) };
    const out = await worker.fetch(new Request(external, { method: req.method, headers, body }), env, ctx);
    const outHeaders = {};
    out.headers.forEach((v, k) => { outHeaders[k] = v; });
    res.writeHead(out.status, outHeaders);
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`Control center (local): http://localhost:${port}/apple/portal/\nGame (local, reads published content): http://localhost:${port}/apple/test/\nSigned in as ${EMAIL}; database ${dbPath}`));
