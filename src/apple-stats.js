// Anonymous play stats and the Daily Run ranking for The Apple
// (js/stats.js in mattlavergne/apple explains the game's side).
//
//   POST /api/apple/stats  <- { v: 1, os, app, events: [[day, name, detail], ...] }
//     -> { ok: true, counted }. Each valid event adds 1 to a daily total in
//        apple_stats (day, os, app version, event, detail). Nothing is stored
//        per player or per request: no IP address, no device ID, no time.
//        Unknown or malformed events are skipped, not errors, so an older
//        server never breaks a newer game.
//   POST /api/apple/daily  <- { num, score, level, prev }
//     -> { rank, players } for Daily Run #num. apple_daily keeps how many
//        devices have each score (num, score, n), nothing else. prev is the
//        score this device sent before for the same Daily: it's swapped for
//        the new one, so a device counts once however often it plays.
//   GET /apple/stats
//     -> an HTML summary for the developer. /apple is behind Cloudflare
//        Access, and the page also refuses requests that didn't come
//        through it.
//
// There are no names and no public list of scores, so there is nothing to win
// by cheating the ranking; impossible scores are still dropped.

import { respond } from './apple-api.js';

const DAY = 864e5;
const DAY_ONE = Date.UTC(2026, 9, 1); // Daily Run #1 (js/main.js in the game)
const MAX_BODY = 16 * 1024;
const MAX_EVENTS = 200;
const KEEP_DAILY = 60; // Dailies to keep ranking data for

const LEVEL = /^[1-9]\d{0,3}$/; // 1-9999
const lvl = d => LEVEL.test(d);
const oneOf = (...xs) => d => xs.includes(d);
// What each event's detail may be (js/stats.js, EVENTS).
const DETAILS = {
  first_launch: oneOf(''),
  active_day: oneOf('1', '2', '3', '4-7', '8-14', '15-30', '31+'),
  first_clear: d => lvl(d) || d === 'endless' || d === 'daily',
  first_fail: d => lvl(d) || d === 'endless' || d === 'daily',
  level_reached: lvl,
  level_clear: lvl,
  level_fail: lvl,
  daily_start: oneOf('1', '2', '3+'),
  daily_finish: lvl,
  share: oneOf('adventure', 'daily', 'endless'),
  paywall: oneOf('map', 'level', 'next', 'continue', 'endless'),
  purchase: oneOf('bought', 'restored', 'pending', 'cancelled', 'failed'),
  tutorial: oneOf('move', 'lead', 'bramble', 'dash', 'rot'),
  retry: oneOf('0-5', '5-15', '15-30', '30+'),
  review_prompt: oneOf(''),
  streak_broke: lvl,
  streak_mended: lvl,
  welcome_back: oneOf('3-6', '7-13', '14-29', '30+'),
  helping_hand: lvl,
  tour_tier: d => lvl(d) && Number(d) <= 15,
};
export const STAT_EVENTS = Object.keys(DETAILS);

const dayKey = t => new Date(t).toISOString().slice(0, 10);
export const dailyNum = (now = Date.now()) => Math.floor((Date.parse(dayKey(now)) - DAY_ONE) / DAY) + 1;

// The most a Daily Run could score by reaching `level`: every second at top
// nerve, every snake knocked out golden and double. Real runs score far less;
// this only stops numbers no run can reach.
export const maxDailyScore = level => 30000 * level * (level + 1);

let tablesReady = false;
async function ensureTables(db) {
  if (tablesReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS apple_stats (day TEXT NOT NULL, os TEXT NOT NULL, app TEXT NOT NULL, event TEXT NOT NULL, ' +
      'detail TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, os, app, event, detail))'),
    db.prepare('CREATE TABLE IF NOT EXISTS apple_daily (num INTEGER NOT NULL, score INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (num, score))'),
  ]);
  tablesReady = true;
}

let lastCleanup = 0;
async function cleanup(db, now) {
  await db.prepare('DELETE FROM apple_daily WHERE num < ? OR n <= 0').bind(dailyNum(now) - KEEP_DAILY).run();
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: 413 };
  try { return { body: JSON.parse(text) }; } catch { return { error: 400 }; }
}

// Counts a batch: valid events only, added up per (day, event, detail).
export function countEvents(body, now = Date.now()) {
  const os = body?.os === 'ios' || body?.os === 'android' ? body.os : null;
  if (!os || !Array.isArray(body.events)) return null;
  const app = typeof body.app === 'string' && /^\d{1,3}(\.\d{1,3}){0,2}$/.test(body.app) ? body.app : '?';
  // Events wait on the device while it's offline, so accept the last week.
  const oldest = dayKey(now - 8 * DAY), newest = dayKey(now + DAY);
  const counts = new Map();
  for (const ev of body.events.slice(0, MAX_EVENTS)) {
    if (!Array.isArray(ev) || ev.length !== 3) continue;
    const [day, event, detail] = ev;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < oldest || day > newest) continue;
    if (typeof detail !== 'string' || !Object.hasOwn(DETAILS, event) || !DETAILS[event](detail)) continue;
    const k = JSON.stringify([day, os, app, event, detail]);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

async function postStats(request, db, now) {
  const { body, error } = await readJson(request);
  if (error) return respond(request, error, { error: error === 413 ? 'too large' : 'bad json' });
  const counts = countEvents(body, now);
  if (!counts) return respond(request, 400, { error: 'expected { os, events: [...] }' });
  if (counts.size) {
    await db.batch([...counts].map(([k, n]) => db.prepare(
      'INSERT INTO apple_stats (day, os, app, event, detail, n) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT (day, os, app, event, detail) DO UPDATE SET n = n + excluded.n'
    ).bind(...JSON.parse(k), n)));
  }
  let counted = 0;
  for (const n of counts.values()) counted += n;
  return respond(request, 200, { ok: true, counted });
}

const rankOf = async (db, num, score) => {
  const r = await db.prepare('SELECT COALESCE(SUM(CASE WHEN score > ? THEN n END), 0) AS above, COALESCE(SUM(n), 0) AS players FROM apple_daily WHERE num = ? AND n > 0')
    .bind(score, num).first();
  return { rank: r.above + 1, players: Math.max(r.players, r.above + 1) };
};

async function postDaily(request, db, now) {
  const { body, error } = await readJson(request);
  if (error) return respond(request, error, { error: error === 413 ? 'too large' : 'bad json' });
  const { num, score, level } = body || {};
  const prev = body?.prev ?? null;
  // Local dates run from a day behind UTC to a day ahead of it.
  const today = dailyNum(now);
  if (!Number.isInteger(num) || num < today - 1 || num > today + 1) return respond(request, 400, { error: 'not a current Daily' });
  if (!Number.isInteger(level) || level < 1 || level > 99) return respond(request, 400, { error: 'bad level' });
  if (!Number.isInteger(score) || score < 0 || score > maxDailyScore(level)) return respond(request, 400, { error: 'impossible score' });
  if (prev !== null && (!Number.isInteger(prev) || prev < 0 || prev > score)) return respond(request, 400, { error: 'bad prev' });
  if (prev !== score) {
    const add = db.prepare('INSERT INTO apple_daily (num, score, n) VALUES (?, ?, 1) ON CONFLICT (num, score) DO UPDATE SET n = n + 1').bind(num, score);
    // Swap the device's earlier score for this one (never below zero).
    await db.batch(prev === null ? [add] : [
      db.prepare('UPDATE apple_daily SET n = n - 1 WHERE num = ? AND score = ? AND n > 0').bind(num, prev),
      add,
    ]);
  }
  return respond(request, 200, await rankOf(db, num, score));
}

export async function handleAppleStats(request, env, ctx) {
  if (request.method === 'OPTIONS') return respond(request, 204, null);
  const url = new URL(request.url);
  const which = url.pathname.replace(/\/+$/, '');
  if (which !== '/api/apple/stats' && which !== '/api/apple/daily') return respond(request, 404, { error: 'not found' });
  if (request.method !== 'POST') return respond(request, 405, { error: 'method not allowed' });
  const db = env.APPLE_DB;
  if (!db) return respond(request, 503, { error: 'not configured' });
  await ensureTables(db);
  const now = Date.now();
  if (now - lastCleanup > 6 * 3600e3) {
    lastCleanup = now;
    const job = cleanup(db, now).catch(e => console.error('apple stats cleanup', e));
    if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
  }
  return which === '/api/apple/stats' ? postStats(request, db, now) : postDaily(request, db, now);
}

// ------------------------------------------------------------------ the developer's page
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = n => Number(n || 0).toLocaleString('en-US');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const table = (head, rows) => rows.length
  ? `<table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
  : '<p class="none">Nothing yet.</p>';

export async function appleStatsPage(request, env, now = Date.now()) {
  // Cloudflare Access checks the sign-in before a request gets here, and adds
  // its token (a header, and the CF_Authorization cookie) to what it lets
  // through. Without either, Access isn't in front of this page: refuse.
  const viaAccess = request.headers.get('Cf-Access-Jwt-Assertion') || /(^|;\s*)CF_Authorization=/.test(request.headers.get('Cookie') || '');
  if (!viaAccess) return new Response('Sign in through mattlavergne.com/apple first.\n', { status: 403 });
  const db = env.APPLE_DB;
  if (!db) return new Response('The database isn’t configured.\n', { status: 503 });
  await ensureTables(db);
  const since = dayKey(now - 29 * DAY);
  const rows = (await db.prepare('SELECT day, event, detail, SUM(n) AS n FROM apple_stats WHERE day >= ? GROUP BY day, event, detail').bind(since).all()).results;
  const all = (await db.prepare("SELECT event, detail, SUM(n) AS n FROM apple_stats WHERE event IN ('level_reached', 'level_clear', 'level_fail') GROUP BY event, detail").all()).results;
  const today = dailyNum(now);
  const daily = (await db.prepare('SELECT num, score, n FROM apple_daily WHERE num >= ? AND n > 0 ORDER BY num DESC, score DESC').bind(today - 13).all()).results;

  const sum = (pred) => rows.filter(pred).reduce((t, r) => t + r.n, 0);
  const days = [...new Set(rows.map(r => r.day))].sort().reverse();
  const perDay = days.map(d => {
    const on = (e, detail) => sum(r => r.day === d && r.event === e && (detail === undefined || r.detail === detail));
    return [d, fmt(on('active_day')), fmt(on('first_launch')), `${fmt(on('daily_finish'))} / ${fmt(on('daily_start'))}`,
      fmt(on('paywall')), fmt(on('purchase', 'bought')), fmt(on('purchase', 'restored')), fmt(on('share'))];
  });
  const by = (event) => {
    const m = new Map();
    for (const r of rows) if (r.event === event) m.set(r.detail, (m.get(r.detail) || 0) + r.n);
    return [...m].sort((a, b) => b[1] - a[1]).map(([d, n]) => [d || '–', fmt(n)]);
  };
  const levels = new Map();
  for (const r of all) {
    const L = levels.get(r.detail) || { reached: 0, clear: 0, fail: 0 };
    L[r.event.slice(6)] += r.n;
    levels.set(r.detail, L);
  }
  const levelRows = [...levels].sort((a, b) => a[0] - b[0]).map(([n, L]) => [n, fmt(L.reached), fmt(L.clear), fmt(L.fail), pct(L.clear, L.clear + L.fail)]);
  const nums = [...new Set(daily.map(r => r.num))];
  const dailyRows = nums.map(num => {
    const rs = daily.filter(r => r.num === num);
    const players = rs.reduce((t, r) => t + r.n, 0);
    let seen = 0, median = 0;
    for (const r of rs) { seen += r.n; if (seen >= players / 2) { median = r.score; break; } }
    return [`#${num}${num === today ? ' (today, UTC)' : ''}`, fmt(players), fmt(rs[0]?.score), fmt(median)];
  });
  const ever = async (event, detail) => (await db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM apple_stats WHERE event = ? AND detail = ?').bind(event, detail).first()).n;
  const installs = await ever('first_launch', '');
  const funnelSteps = [['Installed', installs], ['Moved (lesson 1)', await ever('tutorial', 'move')], ['First crash (lesson 2)', await ever('tutorial', 'lead')],
    ['Reached level 2', await ever('level_reached', '2')], ['Dropped a bramble (lesson 3)', await ever('tutorial', 'bramble')],
    ['Dashed (lesson 4)', await ever('tutorial', 'dash')], ['Reached level 3', await ever('level_reached', '3')], ['Used Hidden Rot (lesson 5)', await ever('tutorial', 'rot')],
    ['Reached level 5', await ever('level_reached', '5')]];
  const funnel = funnelSteps.map(([label, n]) => [label, fmt(n), pct(n, installs)]);
  const retries = ['0-5', '5-15', '15-30', '30+'].map(b => [b, fmt(sum(r => r.event === 'retry' && r.detail === b))]);
  const losses = sum(r => r.event === 'level_fail' || r.event === 'daily_finish'); // every Daily Run ends in a loss
  const broke = sum(r => r.event === 'streak_broke'), mended = sum(r => r.event === 'streak_mended');
  const streaks = [['Ended (3+ days)', fmt(broke)], ['Mended', fmt(mended)], ['Mend rate', pct(mended, broke)]];
  const welcome = ['3-6', '7-13', '14-29', '30+'].map(b => [b, fmt(sum(r => r.event === 'welcome_back' && r.detail === b))]);
  const byNum = event => by(event).sort((a, b) => Number(a[0]) - Number(b[0]));
  const loyalty = ['1', '2', '3', '4-7', '8-14', '15-30', '31+'].map(b => [b, fmt(sum(r => r.event === 'active_day' && r.detail === b && r.day >= dayKey(now - 6 * DAY)))]);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Apple: play stats</title><meta name="robots" content="noindex">
<style>
:root { color-scheme: light dark; --bg: #fffaf2; --ink: #3a1f2b; --line: #e8dccb; --soft: #7d6470; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1418; --ink: #f6e9ee; --line: #3e2c34; --soft: #b39aa5; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, sans-serif; }
main { max-width: 900px; margin: 0 auto; }
h1 { font-size: 22px; margin: 4px 0 2px; } h2 { font-size: 17px; margin: 26px 0 6px; }
p { margin: 4px 0 8px; color: var(--soft); } .none { font-style: italic; }
.wrap { overflow-x: auto; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; min-width: 100%; }
th, td { text-align: right; padding: 5px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; } th { font-weight: 600; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 24px; }
</style></head><body><main>
<h1>&#127822; The Apple: play stats</h1>
<p>Anonymous daily totals from the store app (last 30 days; levels: all time). Each number counts events, not people; there is no per-player data to look at.</p>
<h2>Day by day</h2><p>Active devices, new installs, Daily Runs finished / started, Unlock screens, purchases, restores and shares.</p>
<div class="wrap">${table(['Day', 'Active', 'Installs', 'Dailies', 'Paywall', 'Bought', 'Restored', 'Shares'], perDay)}</div>
<h2>Adventure levels</h2><p>Reached: devices that unlocked the level. Clear rate: clears / (clears + times eaten), from every attempt.</p>
<div class="wrap">${table(['Level', 'Reached', 'Clears', 'Eaten', 'Clear rate'], levelRows)}</div>
<h2>Daily Run ranking</h2><p>Devices that compared each Daily, the top score and the median.</p>
<div class="wrap">${table(['Daily', 'Players', 'Top', 'Median'], dailyRows)}</div>
<h2>First minutes</h2><p>New installs, then how many finished each tutorial lesson and reached levels 2 and 3 (all time). The tutorial's goal: most installs reach level 3.</p>
<div class="wrap">${table(['Step', 'Devices', 'Of installs'], funnel)}</div>
<div class="cols">
<div><h2>Trying again</h2><p>After losing an Adventure level or a Daily Run, how soon players tried it again (last 30 days), out of ${fmt(losses)} losses.</p>${table(['Seconds', 'Retries'], retries)}</div>
<div><h2>Coming back</h2><p>Devices active in the last 7 days, by how many days they've played.</p>${table(['Days played', 'Devices'], loyalty)}</div>
<div><h2>Streaks</h2><p>Daily streaks of 3+ days that ended, and how many were mended by playing 3 Dailies that day.</p>${table(['', 'Count'], streaks)}</div>
<div><h2>Welcome back</h2><p>Players back after days away (the welcome gift).</p>${table(['Days away', 'Count'], welcome)}</div>
<div><h2>Helping hand</h2><p>Tries with slower snakes and a shield, by level: where players get stuck.</p>${table(['Level', 'Tries'], byNum('helping_hand'))}</div>
<div><h2>Orchard Tour</h2><p>Tour tiers reached (all tours, last 30 days).</p>${table(['Tier', 'Reached'], byNum('tour_tier'))}</div>
<div><h2>Unlock screen from</h2>${table(['From', 'Views'], by('paywall'))}</div>
<div><h2>Purchases</h2>${table(['Result', 'Count'], by('purchase'))}</div>
<div><h2>Shares</h2>${table(['What', 'Count'], by('share'))}</div>
<div><h2>First clear</h2>${table(['Where', 'Devices'], by('first_clear'))}</div>
<div><h2>First time eaten</h2>${table(['Where', 'Devices'], by('first_fail'))}</div>
</div>
</main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
