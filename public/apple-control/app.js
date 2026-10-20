// The Apple · Control Center (owner only, behind Cloudflare Access).
//
// What's on each day comes from the game's own code (js/schedule.js in the
// game repo, loaded from the private test copy at /apple/test/), so the
// calendar shows exactly what phones will do: the automatic rotation, with
// your changes on top. Edits go to a draft that saves itself; nothing
// reaches players until Review & publish. The server (src/apple-control.js)
// checks everything again, and so does the game.

const $ = s => document.querySelector(s);
const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = v => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fmtN = n => Number(n || 0).toLocaleString();
const PREVIEW_KEY = 'the-apple.content.preview.v1';
const FLAG_INFO = {
  pauseInterstitials: ['Pause full-screen ads', 'No ads between games, in every copy of the app that has this.'],
  pauseRewarded: ['Pause rewarded ads', 'No "watch an ad" for bonus stars or a second chance (stars still work).'],
  pauseBanners: ['Pause banner ads', 'No banners on the menus.'],
};
const TIER = ['Easy', 'Medium', 'Hard'];
const VIEWS = { today: 'Today', calendar: 'Calendar', notices: 'Announcements', tours: 'Orchard Tours', skins: 'Skins', stats: 'Stats', history: 'History', settings: 'Settings' };

const S = {
  live: null, draft: null, doc: null, actor: '', loaded: false,
  view: 'today', calMonth: null, look: 'draft', game: null, gameError: '',
  saveTimer: null, saving: null, savedAt: 0, conflict: false,
  stats: null, statsDays: 30, statsPlatform: 'all', history: null,
};

// ------------------------------------------------------------------ server
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/apple/admin/api/' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json', 'X-Apple-Control': '1' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) { const e = new Error(data?.error || `The server said ${res.status}.`); e.status = res.status; throw e; }
  return data;
}
async function load() {
  const r = await api('content');
  S.live = r.live;
  S.draft = r.draft;
  S.actor = r.actor;
  S.doc = clone((r.draft || r.live).content);
  S.loaded = true;
  S.conflict = false;
  $('#who').textContent = `Signed in as ${r.actor}`;
}

// ------------------------------------------------------------------ the game's own code
// The private test copy of the game is the latest game code. If it can't be
// loaded (an older game without js/schedule.js), the portal still edits and
// publishes, but can't show the automatic rotation.
async function loadGame() {
  try {
    const [schedule, config, tour, render] = await Promise.all(['schedule', 'config', 'tour', 'render'].map(m => import(`/apple/test/js/${m}.js`)));
    S.game = { ...schedule, ...config, ...tour, drawApple: render.drawApple, builtInSkins: new Set(config.SKINS.map(s => s.id)) };
  } catch (e) {
    S.game = null;
    S.gameError = 'The test copy of the game is older than this control center (it has no js/schedule.js), so the automatic rotation can’t be shown. Merge the game’s latest pull request; editing and publishing still work.';
  }
}
// The content to show: what's published, or with your changes.
const shown = () => (S.look === 'live' ? S.live.content : S.doc);
// The game's skin list, with the custom skins of `content`, as the game adds them.
function useSkins(content) {
  if (!S.game) return;
  const list = S.game.SKINS;
  for (let i = list.length - 1; i >= 0; i--) if (!S.game.builtInSkins.has(list[i].id)) list.splice(i, 1);
  for (const s of content.skins) if (!S.game.builtInSkins.has(s.id)) list.push({ ...s, remote: true });
}
function dayFor(key, content = shown()) {
  useSkins(content);
  return S.game.scheduleFor(S.game.dayOf(key), content);
}
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(y, m - 1, d + n, 12); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const niceDate = (key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, opts); };
const skinById = id => S.game?.SKINS.find(s => s.id === id) || shown().skins.find(s => s.id === id);
function appleCanvas(skin, size = 72) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = size + 'px';
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', skin ? skin.name : 'Apple');
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  if (S.game && skin) S.game.drawApple(x, size / 2, size * 0.55, size * 0.34, { skin, time: 0.4 });
  else { x.fillStyle = skin?.base || '#e8392f'; x.beginPath(); x.arc(size / 2, size * 0.55, size * 0.32, 0, 7); x.fill(); }
  return c;
}
// Put canvases where the markup left <span data-apple="skin-id" data-size="64">.
function placeApples(root = document) {
  for (const el of root.querySelectorAll('[data-apple]')) el.replaceWith(appleCanvas(skinById(el.dataset.apple), Number(el.dataset.size) || 64));
}

// ------------------------------------------------------------------ saving
const changesFromLive = () => describeChanges(S.live.content, S.doc);
function edit(fn, message) {
  fn(S.doc);
  S.look = 'draft';
  queueSave();
  render();
  if (message) toast(message);
}
function queueSave() {
  clearTimeout(S.saveTimer);
  $('#saved').textContent = 'Saving…';
  S.saveTimer = setTimeout(() => { S.saving = save().finally(() => { S.saving = null; }); }, 600);
  updateBar();
}
async function flushSave() {
  if (S.saveTimer) { clearTimeout(S.saveTimer); S.saveTimer = null; S.saving = save().finally(() => { S.saving = null; }); }
  if (S.saving) await S.saving;
}
async function save() {
  S.saveTimer = null;
  try {
    if (same(S.doc, S.live.content)) {
      // Back to what's published: no draft needed.
      if (S.draft) await api('discard', { method: 'POST', body: { draftVersion: S.draft.version } });
      S.draft = null;
    } else {
      const r = await api('draft', { method: 'PUT', body: { baseVersion: S.draft?.version || 0, content: S.doc } });
      S.draft = { version: r.version, content: r.content, editedAt: r.editedAt };
    }
    S.savedAt = Date.now();
    $('#saved').textContent = 'Draft saved';
  } catch (e) {
    $('#saved').textContent = 'Not saved';
    if (e.status === 409) { S.conflict = true; banner('This draft was changed in another tab or window. Reload to get the latest; your last change here wasn’t saved.', 'reload'); }
    else if (e.status === 422) banner(e.message, null, true);
    else banner(`Couldn’t save the draft: ${e.message}`, null, true);
  }
  updateBar();
}

// ------------------------------------------------------------------ what changed, in words
function describeChanges(a, b) {
  const out = [];
  const byKey = (list, key) => new Map(list.map(x => [x[key], x]));
  const diff = (key, label, word) => {
    const A = byKey(a[key], label), B = byKey(b[key], label);
    for (const [k, x] of B) if (!A.has(k)) out.push(['Added', word(x, 'add')]); else if (!same(A.get(k), x)) out.push(['Changed', word(x, 'change', A.get(k))]);
    for (const [k, x] of A) if (!B.has(k)) out.push(['Removed', word(x, 'remove')]);
  };
  diff('daily', 'date', (x, how) => (how === 'remove' ? `custom challenges on ${niceDate(x.date)} (back to the automatic ones)` : `challenges on ${niceDate(x.date)}: ${x.items.map(it => challengeWords(it)).join(' · ')}`));
  diff('weekly', 'monday', (x, how) => (how === 'remove' ? `the twist for the week of ${niceDate(x.monday)} (back to the automatic one)` : `the twist for the week of ${niceDate(x.monday)}: ${x.icon} ${x.name}`));
  diff('tours', 'number', (x, how) => (how === 'remove' ? `Tour ${x.number}'s custom theme (back to the automatic one)` : `Tour ${x.number}: ${x.icon} ${x.name}, reward ${skinById(x.skin)?.name || x.skin}`));
  diff('notices', 'id', (x, how) => `announcement “${x.title}”${how === 'remove' ? '' : ` (${niceDate(x.start)} to ${niceDate(x.end)}${x.enabled ? '' : ', off'})`}`);
  diff('skins', 'id', (x, how) => `skin “${x.name}”${how === 'remove' ? ' (owners keep it)' : x.active ? '' : ' (archived)'}`);
  for (const k of Object.keys(FLAG_INFO)) if (a.flags[k] !== b.flags[k]) out.push([b.flags[k] ? 'Turned on' : 'Turned off', FLAG_INFO[k][0].toLowerCase()]);
  return out;
}
function challengeWords(it) {
  if (!S.game) return it.label || `${it.id} ${it.target}`;
  return S.game.challengeText(it).text;
}

// ------------------------------------------------------------------ chrome
function updateBar() {
  if (!S.loaded) return;
  const n = changesFromLive().length;
  const st = $('#bar-status');
  st.innerHTML = n
    ? `<span class="dot amber"></span><span>${n} unpublished change${n === 1 ? '' : 's'}</span><span class="tag live">Live v${S.live.version}</span>`
    : `<span class="dot green"></span><span>Everything is published</span><span class="tag live">Live v${S.live.version}</span>`;
  $('#review').hidden = !n;
  $('#discard').hidden = !n;
  if (!n && !S.saveTimer) $('#saved').textContent = '';
}
let bannerAction = null;
function banner(message, action = null, error = false) {
  const el = $('#banner');
  bannerAction = action;
  el.className = 'banner' + (error ? ' error' : '');
  el.innerHTML = `${h(message)}${action === 'reload' ? '<button class="btn small" data-act="reload">Reload</button>' : ''}<button class="btn small ghost" data-act="banner-close">Dismiss</button>`;
  el.hidden = false;
}
let toastTimer = null;
function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast' + (error ? ' error' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
let drawerReturn = null;
function openDrawer(title, html, onReady) {
  drawerReturn = document.activeElement;
  $('#drawer-title').textContent = title;
  $('#drawer-body').innerHTML = html;
  $('#drawer').hidden = false;
  $('#scrim').hidden = false;
  placeApples($('#drawer-body'));
  onReady?.($('#drawer-body'));
  ($('#drawer-body').querySelector('input, select, textarea, button') || $('#drawer-close')).focus();
}
function closeDrawer() {
  $('#drawer').hidden = true;
  if ($('#modal').hidden) $('#scrim').hidden = true;
  drawerReturn?.focus?.();
}
function openModal(title, html, onReady) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  onReady?.($('#modal-body'));
  ($('#modal-body').querySelector('textarea, input, button.primary, button') || $('#modal')).focus();
}
const closeModal = () => { $('#modal').hidden = true; };
function setView(view) {
  if (!VIEWS[view]) view = 'today';
  S.view = view;
  for (const b of document.querySelectorAll('#nav button')) {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  document.title = `${VIEWS[view]} · The Apple Control Center`;
  if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  $('.side').classList.remove('open');
  render();
  $('#view').focus({ preventScroll: true });
  if (view === 'stats' && !S.stats) loadStats();
  if (view === 'history' && !S.history) loadHistory();
}
function render() {
  if (!S.loaded) return;
  const v = $('#view');
  v.innerHTML = ({ today: viewToday, calendar: viewCalendar, notices: viewNotices, tours: viewTours, skins: viewSkins, stats: viewStats, history: viewHistory, settings: viewSettings })[S.view]();
  placeApples(v);
  updateBar();
}
const lookSwitch = () => (changesFromLive().length ? `<div class="seg" role="group" aria-label="Show"><button data-act="look" data-look="live" aria-pressed="${S.look === 'live'}">Published</button><button data-act="look" data-look="draft" aria-pressed="${S.look === 'draft'}">With my changes</button></div>` : '');
const needGame = () => (S.game ? '' : `<div class="empty">${h(S.gameError)}</div>`);
const kind = custom => (custom ? '<span class="tag custom">Custom</span>' : '<span class="tag auto">Automatic</span>');

// ------------------------------------------------------------------ Today
function viewToday() {
  const t = todayKey();
  const head = `<div class="head"><div><h1>Today</h1><p>${h(niceDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))}: what phones show${S.look === 'draft' && changesFromLive().length ? ' once you publish' : ''}.</p></div>${lookSwitch()}</div>`;
  if (!S.game) return head + needGame() + todayStatus();
  const d = dayFor(t);
  const tourSkin = skinById(d.tour.theme.skin);
  const week = Array.from({ length: 7 }, (_, i) => dayFor(addDays(t, i + 1)));
  return `${head}
  <div class="hero">
    <article class="card"><header><h2>Daily Run #${d.day.num}</h2>${kind(d.challenges.some(c => c.custom))}</header>
      <div class="list">${d.challenges.map((c, i) => { const w = S.game.challengeText(c); return `<div class="row"><span class="ch-icon">${h(w.icon)}</span><div class="grow"><div class="title">${h(w.text)}</div><div class="sub">${TIER[i]}${c.custom ? ' · custom' : ''}</div></div></div>`; }).join('')}</div>
      <div class="actions"><button class="btn small" data-act="day" data-key="${t}">Change today’s challenges</button></div>
    </article>
    <article class="card"><header><h2>This week</h2>${kind(d.week.custom)}</header>
      <div class="row"><span class="ch-icon">${h(d.week.icon)}</span><div class="grow"><div class="title">${h(d.week.name)}</div><div class="sub">${h(d.week.desc)}</div></div></div>
      ${d.week.weekend ? '<p class="small"><span class="tag live">Weekend</span> Double XP today, on top.</p>' : ''}
      <div class="actions"><button class="btn small" data-act="week" data-key="${d.week.monday}">Change this week’s twist</button></div>
    </article>
    <article class="card"><header><h2>Orchard Tour ${d.tour.n}</h2>${kind(d.tour.custom)}</header>
      <div class="tour-card"><span data-apple="${h(d.tour.theme.skin)}" data-size="72"></span><div><div class="title">${h(d.tour.theme.icon)} ${h(d.tour.theme.name)}</div>
      <div class="sub muted small">Day ${d.tour.day} of 21 · ${d.tour.daysLeft === 1 ? 'last day' : `${d.tour.daysLeft} days left`}</div>
      <div class="sub muted small">Reward: ${h(tourSkin?.name || d.tour.theme.skin)}</div></div></div>
      <div class="progress"><i data-width="${Math.round(d.tour.day / 21 * 100)}"></i></div>
    </article>
  </div>
  <div class="grid two">
    <article class="card"><header><h2>Announcement</h2><button class="btn small" data-act="notice-new" data-start="${t}">New</button></header>
      ${d.notices.length ? `<div class="phone">${d.notices.slice(0, 1).map(n => `<div class="notice-preview"><strong>${h(n.title)}</strong><span>${h(n.body)}</span></div>`).join('')}</div>${d.notices.length > 1 ? `<p class="small muted">${d.notices.length - 1} more showing today; the newest one is shown.</p>` : ''}` : '<div class="empty">None today. The home screen shows the game as usual.</div>'}
    </article>
    ${todayStatus()}
  </div>
  <article class="card"><header><h2>The next 7 days</h2><button class="btn small" data-act="view" data-view="calendar">Open the calendar</button></header>
    <div class="week-strip">${week.map(x => `<button class="mini${x.challenges.some(c => c.custom) || x.week.custom ? ' custom' : ''}" data-act="day" data-key="${x.day.key}"><span class="d">${h(niceDate(x.day.key, { weekday: 'short', day: 'numeric' }))}</span><span class="n">Daily #${x.day.num}</span><span class="icons" aria-label="Challenges">${x.challenges.map(c => h(S.game.challengeText(c).icon)).join('')}</span><span class="n">${h(x.week.icon)} ${h(x.week.name)}</span>${x.notices.length ? '<span class="n">📣 announcement</span>' : ''}</button>`).join('')}</div>
  </article>`;
}
function todayStatus() {
  const pub = S.live.editedAt ? new Date(S.live.editedAt).toLocaleString() : 'never';
  const reached = contentReach();
  return `<article class="card"><header><h2>On phones</h2><span class="tag live">v${S.live.version}</span></header>
    <div class="list">
      <div class="row"><div class="grow"><div class="title">Published version ${S.live.version}</div><div class="sub">${S.live.version ? `${h(pub)}${S.live.editedBy && S.live.editedBy !== 'system' ? ` by ${h(S.live.editedBy)}` : ''}` : 'Nothing published yet: phones use the automatic rotation.'}</div></div></div>
      <div class="row"><div class="grow"><div class="title">Phones that got it</div><div class="sub">${reached}</div></div></div>
      <div class="row"><div class="grow"><div class="title">How fast</div><div class="sub">A phone downloads the latest when the game opens or comes back to the screen, within about a minute of publishing.</div></div></div>
    </div>
    <div class="actions"><button class="btn small" data-act="check">Check what’s being served</button><button class="btn small" data-act="view" data-view="settings">Troubleshooting</button></div>
  </article>`;
}
function contentReach() {
  if (!S.stats) { loadStats(true); return 'Loading…'; }
  const rows = (S.stats.daily || []).filter(r => r.event === 'content');
  if (!rows.length) return 'No reports yet. Phones report this only if the player said yes to play stats, and only from the app version that has the new content system.';
  const byVersion = new Map();
  for (const r of rows) byVersion.set(Number(r.detail), (byVersion.get(Number(r.detail)) || 0) + r.n);
  const latest = byVersion.get(S.live.version) || 0;
  return `${fmtN(latest)} report${latest === 1 ? '' : 's'} of version ${S.live.version} in the last ${S.stats.days} days (from players who share play stats).`;
}

// ------------------------------------------------------------------ Calendar
function viewCalendar() {
  const t = todayKey();
  if (!S.calMonth) S.calMonth = t.slice(0, 7);
  const [y, m] = S.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1, 12);
  const start = addDays(`${y}-${String(m).padStart(2, '0')}-01`, -((first.getDay() + 6) % 7));
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const head = `<div class="head"><div><h1>Calendar</h1><p>Every day’s challenges and every week’s twist: automatic unless you change them. Click a day or a week.</p></div>${lookSwitch()}</div>
  <div class="head"><div class="cal-nav"><button class="btn small" data-act="month" data-step="-1" aria-label="Previous month">‹</button><h2>${h(title)}</h2><button class="btn small" data-act="month" data-step="1" aria-label="Next month">›</button><button class="btn small ghost" data-act="month" data-step="0">Today</button></div></div>`;
  if (!S.game) return head + needGame();
  let cells = '<div class="dow wk">Week</div>' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let w = 0; w < 6; w++) {
    const monday = addDays(start, w * 7);
    if (w >= 4 && monday.slice(0, 7) !== S.calMonth) break;
    const mon = dayFor(monday);
    cells += `<button class="week" data-act="week" data-key="${monday}" aria-label="Week of ${h(niceDate(monday))}: ${h(mon.week.name)}"><span>${h(mon.week.icon)} ${kind(mon.week.custom)}</span><b>${h(mon.week.name)}</b></button>`;
    for (let i = 0; i < 7; i++) {
      const key = addDays(monday, i), d = i ? dayFor(key) : mon;
      const custom = d.challenges.some(c => c.custom);
      const cls = ['day', key.slice(0, 7) !== S.calMonth && 'other', key < t && 'past', key === t && 'today', custom && 'has-custom'].filter(Boolean).join(' ');
      const marks = [d.tour.day === 1 ? `<span class="tag lock">🎪 Tour ${d.tour.n}</span>` : '', d.notices.length ? '<span class="tag draft">📣</span>' : ''].join('');
      cells += `<button class="${cls}" data-act="day" data-key="${key}" aria-label="${h(niceDate(key, { weekday: 'long', month: 'long', day: 'numeric' }))}${custom ? ', custom challenges' : ''}"><span class="num">${Number(key.slice(8))}<small>${d.day.num > 0 ? `#${d.day.num}` : ''}</small></span><span class="icons">${d.challenges.map(c => h(S.game.challengeText(c).icon)).join('')}</span><span class="marks">${marks}</span></button>`;
    }
  }
  return `${head}<div class="cal">${cells}</div>
  <div class="legend"><span><span class="tag custom">Custom</span> changed by you</span><span><span class="tag auto">Automatic</span> the game’s rotation</span><span><span class="tag lock">🎪</span> a new Orchard Tour starts</span><span><span class="tag draft">📣</span> an announcement shows</span><span>Striped: days that have passed</span></div>`;
}
function openDay(key) {
  if (!S.game) return toast('The automatic rotation isn’t available; see the note at the top.', true);
  const d = dayFor(key, S.doc), auto = S.game.autoChallenges(S.game.dayOf(key));
  const past = key < todayKey();
  const set = S.doc.daily.find(x => x.date === key);
  const tiers = d.challenges.map((c, tier) => {
    const pool = S.game.CONTRACTS.filter(x => x.tier === tier);
    const it = set ? set.items[tier] : { id: c.id, target: c.target, label: '', icon: '' };
    const usual = pool.find(x => x.id === it.id)?.n || [];
    return `<div class="tier" data-tier="${tier}"><header><h3>${TIER[tier]}</h3>${kind(c.custom)}</header>
      <label class="field"><span>Challenge</span><select data-f="id" ${past ? 'disabled' : ''}>${pool.map(x => `<option value="${x.id}" ${x.id === it.id ? 'selected' : ''}>${h(x.icon)} ${h(x.text(x.id === it.id ? it.target : x.n[0]))}</option>`).join('')}</select></label>
      <div class="pair"><label class="field"><span>Number</span><input type="number" min="1" max="100" step="1" value="${it.target}" data-f="target" ${past ? 'disabled' : ''}><small data-usual>${usual.length ? `The rotation uses ${usual.join(' or ')}.` : ''}</small></label>
      <label class="field"><span>Icon <small>(optional)</small></span><input maxlength="12" value="${h(it.icon)}" placeholder="${h(pool.find(x => x.id === it.id)?.icon || '')}" data-f="icon" ${past ? 'disabled' : ''}></label></div>
      <label class="field"><span>Your own words <small>(optional)</small></span><input maxlength="80" value="${h(it.label)}" placeholder="The game’s words" data-f="label" ${past ? 'disabled' : ''}></label>
      <div class="preview-line" data-preview>${h(S.game.challengeText(it).icon)} ${h(S.game.challengeText(it).text)}</div>
    </div>`;
  }).join('');
  openDrawer(niceDate(key, { weekday: 'long', month: 'long', day: 'numeric' }), `
    <section><div class="row"><div class="grow"><div class="title">Daily Run #${d.day.num}</div><div class="sub">${past ? 'This day has passed.' : key === todayKey() ? 'Today. Phones that already made a start on today’s challenges keep theirs; the rest get these when they next open the game.' : 'Phones get these on the day.'}</div></div></div></section>
    <section><h3>Challenges</h3>${tiers}
      ${past ? '' : `<div class="actions"><button class="btn primary" data-act="day-save" data-key="${key}">Use these</button>${set ? `<button class="btn" data-act="day-reset" data-key="${key}">Back to automatic</button>` : ''}</div>
      <p class="small muted">Automatic for this day: ${auto.map(a => h(S.game.challengeText(a).text)).join(' · ')}.</p>`}
    </section>
    <section><h3>The week’s twist</h3><div class="row"><span class="ch-icon">${h(d.week.icon)}</span><div class="grow"><div class="title">${h(d.week.name)} ${kind(d.week.custom)}</div><div class="sub">${h(d.week.desc)}</div></div><button class="btn small" data-act="week" data-key="${d.week.monday}">Change</button></div></section>
    <section><h3>Orchard Tour</h3><div class="row"><span data-apple="${h(d.tour.theme.skin)}" data-size="44"></span><div class="grow"><div class="title">${h(d.tour.theme.icon)} ${h(d.tour.theme.name)} ${kind(d.tour.custom)}</div><div class="sub">Tour ${d.tour.n}, day ${d.tour.day} of 21</div></div><button class="btn small" data-act="view" data-view="tours">Tours</button></div></section>
    <section><h3>Announcements</h3>${d.notices.length ? d.notices.map(n => `<div class="row"><div class="grow"><div class="title">${h(n.title)}</div><div class="sub">${h(niceDate(n.start))} to ${h(niceDate(n.end))}</div></div><button class="btn small" data-act="notice-edit" data-id="${h(n.id)}">Edit</button></div>`).join('') : '<p class="muted small">None this day.</p>'}<div class="actions"><button class="btn small" data-act="notice-new" data-start="${key}">New announcement from this day</button></div></section>`,
  body => {
    for (const tier of body.querySelectorAll('.tier')) {
      // A different challenge: its usual number (numbers mean different things).
      tier.querySelector('[data-f="id"]').addEventListener('change', e => {
        const c = S.game.CONTRACTS.find(x => x.id === e.target.value);
        if (c) tier.querySelector('[data-f="target"]').value = c.n[0];
      });
      const upd = () => {
        const it = readTier(tier);
        const c = S.game.CONTRACTS.find(x => x.id === it.id);
        const opt = tier.querySelector('[data-f="id"]').selectedOptions[0];
        if (c && opt) opt.textContent = `${c.icon} ${c.text(it.target)}`;
        tier.querySelector('[data-usual]').textContent = c?.n?.length ? `The rotation uses ${c.n.join(' or ')}.` : '';
        tier.querySelector('[data-f="icon"]').placeholder = c?.icon || '';
        const w = S.game.challengeText(it);
        tier.querySelector('[data-preview]').textContent = `${w.icon} ${w.text}`;
      };
      tier.addEventListener('input', upd);
      tier.addEventListener('change', upd);
    }
  });
}
function readTier(el) {
  const v = f => el.querySelector(`[data-f="${f}"]`).value;
  return { id: v('id'), target: Math.max(1, Math.min(100, Math.round(Number(v('target')) || 1))), label: v('label').trim(), icon: v('icon').trim() };
}
function saveDay(key) {
  const items = [...$('#drawer-body').querySelectorAll('.tier')].map(readTier);
  const auto = S.game.autoChallenges(S.game.dayOf(key));
  const isAuto = items.every((it, i) => it.id === auto[i].id && it.target === auto[i].target && !it.label && !it.icon);
  edit(doc => {
    doc.daily = doc.daily.filter(x => x.date !== key);
    if (!isAuto) doc.daily.push({ date: key, items });
    doc.daily.sort((a, b) => a.date.localeCompare(b.date));
  }, isAuto ? 'Same as the automatic ones: nothing to change.' : `Challenges for ${niceDate(key)} saved to your draft.`);
  closeDrawer();
}
function openWeek(monday) {
  if (!S.game) return toast('The automatic rotation isn’t available; see the note at the top.', true);
  const d = dayFor(monday, S.doc);
  const set = S.doc.weekly.find(w => w.monday === monday);
  const auto = S.game.weeklyEvent(S.game.dateOf(monday));
  const cur = set || { type: d.week.id, name: d.week.name, icon: d.week.icon, desc: d.week.desc };
  const past = addDays(monday, 6) < todayKey();
  openDrawer(`Week of ${niceDate(monday, { month: 'long', day: 'numeric' })}`, `
    <section><p class="muted small">${past ? 'This week has passed.' : 'A twist changes how the game plays all week (Monday to Sunday), for everyone. Pick one the game has; the name, icon and words are yours.'}</p>
      <p class="small">Automatic this week: <b>${h(auto.icon)} ${h(auto.name)}</b>. ${kind(!!set)}</p></section>
    <section class="form" id="week-form">
      <label class="field"><span>Twist</span><select data-f="type" ${past ? 'disabled' : ''}>${S.game.WEEKLY.map(w => `<option value="${w.id}" ${w.id === cur.type ? 'selected' : ''}>${h(w.icon)} ${h(w.name)}: ${h(w.desc)}</option>`).join('')}</select></label>
      <div class="pair"><label class="field"><span>Name</span><input maxlength="40" value="${h(cur.name)}" data-f="name" ${past ? 'disabled' : ''}></label><label class="field"><span>Icon</span><input maxlength="12" value="${h(cur.icon)}" data-f="icon" ${past ? 'disabled' : ''}></label></div>
      <label class="field"><span>What it says <span class="count" data-count>${cur.desc.length}/140</span></span><input maxlength="140" value="${h(cur.desc)}" data-f="desc" ${past ? 'disabled' : ''}></label>
      ${past ? '' : `<div class="actions"><button class="btn primary" data-act="week-save" data-key="${monday}">Use this</button>${set ? `<button class="btn" data-act="week-reset" data-key="${monday}">Back to automatic</button>` : ''}</div>`}
    </section>`, body => {
    const form = body.querySelector('#week-form');
    form.querySelector('[data-f="type"]').addEventListener('change', e => {
      const w = S.game.WEEKLY.find(x => x.id === e.target.value);
      for (const f of ['name', 'icon', 'desc']) form.querySelector(`[data-f="${f}"]`).value = w[f];
    });
    form.querySelector('[data-f="desc"]').addEventListener('input', e => { form.querySelector('[data-count]').textContent = `${e.target.value.length}/140`; });
  });
}
function saveWeek(monday) {
  const f = k => $('#week-form').querySelector(`[data-f="${k}"]`).value.trim();
  const w = { monday, type: f('type'), name: f('name'), icon: f('icon'), desc: f('desc') };
  if (!w.name || !w.icon || !w.desc) return toast('Give it a name, an icon and words.', true);
  const auto = S.game.weeklyEvent(S.game.dateOf(monday));
  const isAuto = w.type === auto.id && w.name === auto.name && w.icon === auto.icon && w.desc === auto.desc;
  edit(doc => {
    doc.weekly = doc.weekly.filter(x => x.monday !== monday);
    if (!isAuto) doc.weekly.push(w);
    doc.weekly.sort((a, b) => a.monday.localeCompare(b.monday));
  }, `Twist for the week of ${niceDate(monday)} saved to your draft.`);
  closeDrawer();
}

// ------------------------------------------------------------------ Announcements
function viewNotices() {
  const t = todayKey();
  const all = [...S.doc.notices].sort((a, b) => b.start.localeCompare(a.start));
  const groups = [
    ['Showing now', all.filter(n => n.enabled && n.start <= t && t <= n.end)],
    ['Coming up', all.filter(n => n.enabled && n.start > t)],
    ['Off', all.filter(n => !n.enabled && n.end >= t)],
    ['Finished', all.filter(n => n.end < t)],
  ];
  return `<div class="head"><div><h1>Announcements</h1><p>A short message on the game’s home screen, between the dates you pick. It never blocks play and never links anywhere. If two overlap, the newest shows.</p></div><button class="btn primary" data-act="notice-new" data-start="${t}">New announcement</button></div>
  ${all.length ? groups.filter(g => g[1].length).map(([name, list]) => `<article class="card"><header><h2>${name}</h2><span class="muted small">${list.length}</span></header><div class="list">${list.map(n => `<div class="row"><div class="grow"><div class="title">${h(n.title)}</div><div class="sub">${h(n.body) || '<i>No message</i>'}</div><div class="sub">${h(niceDate(n.start))} to ${h(niceDate(n.end))}</div></div><input type="checkbox" class="switch" data-act="notice-toggle" data-id="${h(n.id)}" ${n.enabled ? 'checked' : ''} aria-label="Show “${h(n.title)}”"><button class="btn small" data-act="notice-edit" data-id="${h(n.id)}">Edit</button></div>`).join('')}</div></article>`).join('') : '<div class="empty">No announcements yet.</div>'}`;
}
function openNotice(id, start = todayKey()) {
  const n = S.doc.notices.find(x => x.id === id) || { id: '', title: '', body: '', start, end: addDays(start, 6), enabled: true };
  openDrawer(id ? 'Edit announcement' : 'New announcement', `
    <section class="form" id="notice-form">
      <label class="field"><span>Title <span class="count" data-count="title">${n.title.length}/60</span></span><input maxlength="60" value="${h(n.title)}" data-f="title" placeholder="Harvest Week is here!" required></label>
      <label class="field"><span>Message <span class="count" data-count="body">${n.body.length}/240</span></span><textarea maxlength="240" data-f="body" placeholder="Stars are worth 50% more all week.">${h(n.body)}</textarea><small>One short paragraph. Line breaks become spaces.</small></label>
      <div class="pair"><label class="field"><span>First day</span><input type="date" value="${n.start}" data-f="start"></label><label class="field"><span>Last day</span><input type="date" value="${n.end}" data-f="end"></label></div>
      <label class="check"><input type="checkbox" class="switch" data-f="enabled" ${n.enabled ? 'checked' : ''}> Show it</label>
      <div><span class="small muted">How it looks</span><div class="phone"><div class="notice-preview" id="np"><strong></strong><span></span></div></div></div>
      <div class="actions"><button class="btn primary" data-act="notice-save" data-id="${h(n.id)}">${id ? 'Save' : 'Add'}</button>${id ? `<button class="btn danger" data-act="notice-delete" data-id="${h(n.id)}">Delete</button>` : ''}</div>
    </section>`, body => {
    const form = body.querySelector('#notice-form');
    const upd = () => {
      const v = f => form.querySelector(`[data-f="${f}"]`).value;
      body.querySelector('#np strong').textContent = v('title') || 'Title';
      body.querySelector('#np span').textContent = v('body').replace(/\s+/g, ' ');
      form.querySelector('[data-count="title"]').textContent = `${v('title').length}/60`;
      form.querySelector('[data-count="body"]').textContent = `${v('body').length}/240`;
    };
    form.addEventListener('input', upd);
    upd();
  });
}
function saveNotice(id) {
  const form = $('#notice-form');
  const v = f => form.querySelector(`[data-f="${f}"]`);
  const n = { id: id || `n-${Date.now().toString(36)}`, title: v('title').value.trim(), body: v('body').value.replace(/\s+/g, ' ').trim(), start: v('start').value, end: v('end').value, enabled: v('enabled').checked };
  if (!n.title) return toast('Give it a title.', true);
  if (/[<>]/.test(n.title + n.body)) return toast('Announcements can’t contain < or >.', true);
  if (!n.start || !n.end || n.end < n.start) return toast('The last day can’t be before the first.', true);
  edit(doc => { const i = doc.notices.findIndex(x => x.id === n.id); if (i >= 0) doc.notices[i] = n; else doc.notices.push(n); }, id ? 'Announcement saved to your draft.' : 'Announcement added to your draft.');
  closeDrawer();
}

// ------------------------------------------------------------------ Tours
function viewTours() {
  const head = `<div class="head"><div><h1>Orchard Tours</h1><p>A new 21-day tour starts every three weeks, with its own theme and a reward skin at tier 15. The game cycles through its 16 themes by itself; give a future tour your own name, icon or reward skin if you like. A tour that has started can’t change: players are earning toward its skin.</p></div>${lookSwitch()}</div>`;
  if (!S.game) return head + needGame();
  const t = S.game.dayOf(todayKey());
  const current = S.game.tourFor(t.num).n;
  const rows = [];
  for (let n = Math.max(1, current - 2); n <= current + 12; n++) {
    const first = S.game.tourDays(n).first;
    const tour = dayFor(first).tour;
    const started = n <= current;
    rows.push(`<div class="row tour-row${n === current ? ' current' : ''}"><span data-apple="${h(tour.theme.skin)}" data-size="48"></span><div class="grow"><div class="title">${h(tour.theme.icon)} Tour ${n}: ${h(tour.theme.name)} ${kind(tour.custom)}</div><div class="sub">${h(niceDate(tour.first))} to ${h(niceDate(tour.last))} · reward: ${h(skinById(tour.theme.skin)?.name || tour.theme.skin)}</div></div>${n === current ? '<span class="tag lock">Running</span>' : started ? '<span class="tag off">Finished</span>' : `<button class="btn small" data-act="tour" data-n="${n}">Change</button>`}</div>`);
  }
  return `${head}<article class="card"><div class="list">${rows.join('')}</div></article>`;
}
function openTour(n) {
  const first = S.game.tourDays(n).first;
  const auto = S.game.tourFor(S.game.dayOf(first).num).theme;
  const set = S.doc.tours.find(t => t.number === n);
  const cur = set || { name: auto.name, icon: auto.icon, skin: auto.skin };
  const tourSkins = [...S.game.TOURS.map(t => ({ id: t.skin, name: skinById(t.skin)?.name || t.skin })), ...S.doc.skins.filter(s => s.tour).map(s => ({ id: s.id, name: `${s.name} (custom)` }))];
  openDrawer(`Tour ${n}`, `
    <section><p class="muted small">${h(niceDate(first, { month: 'long', day: 'numeric' }))} to ${h(niceDate(S.game.tourDays(n).last, { month: 'long', day: 'numeric' }))}. Automatic: ${h(auto.icon)} ${h(auto.name)}.</p>
      <div class="big-preview" id="tour-apple"><span data-apple="${h(cur.skin)}" data-size="120"></span></div></section>
    <section class="form" id="tour-form">
      <div class="pair"><label class="field"><span>Name</span><input maxlength="40" value="${h(cur.name)}" data-f="name"></label><label class="field"><span>Icon</span><input maxlength="12" value="${h(cur.icon)}" data-f="icon"></label></div>
      <label class="field"><span>Reward skin (tier 15)</span><select data-f="skin">${tourSkins.map(s => `<option value="${h(s.id)}" ${s.id === cur.skin ? 'selected' : ''}>${h(s.name)}</option>`).join('')}</select><small>Only skins made for tours. Make your own under Skins (tick “Tour reward”).</small></label>
      <div class="actions"><button class="btn primary" data-act="tour-save" data-n="${n}">Use this</button>${set ? `<button class="btn" data-act="tour-reset" data-n="${n}">Back to automatic</button>` : ''}</div>
    </section>`, body => {
    body.querySelector('[data-f="skin"]').addEventListener('change', e => {
      const holder = body.querySelector('#tour-apple');
      holder.replaceChildren(appleCanvas(skinById(e.target.value), 120));
    });
  });
}
function saveTour(n) {
  const f = k => $('#tour-form').querySelector(`[data-f="${k}"]`).value.trim();
  const t = { number: n, name: f('name'), icon: f('icon'), skin: f('skin') };
  if (!t.name || !t.icon) return toast('Give it a name and an icon.', true);
  const auto = S.game.tourFor(S.game.dayOf(S.game.tourDays(n).first).num).theme;
  const isAuto = t.name === auto.name && t.icon === auto.icon && t.skin === auto.skin;
  edit(doc => { doc.tours = doc.tours.filter(x => x.number !== n); if (!isAuto) doc.tours.push(t); doc.tours.sort((a, b) => a.number - b.number); }, `Tour ${n} saved to your draft.`);
  closeDrawer();
}

// ------------------------------------------------------------------ Skins
function viewSkins() {
  const builtIn = S.game ? S.game.SKINS.filter(s => S.game.builtInSkins.has(s.id)) : [];
  const how = s => (s.tour ? 'Orchard Tour reward' : s.level ? `Rank ${s.level}` : s.cost ? `${fmtN(s.cost)}★ in the Orchard` : 'Everyone has it');
  return `<div class="head"><div><h1>Skins</h1><p>Make new apple skins: they’re added to the game’s Orchard (for stars) or kept as a tour reward, without an app update. A skin you remove stays with anyone who has it.</p></div><button class="btn primary" data-act="skin-new">New skin</button></div>
  <article class="card"><header><h2>Your skins</h2><span class="muted small">${S.doc.skins.length}</span></header>
    ${S.doc.skins.length ? `<div class="skin-grid">${S.doc.skins.map(s => `<button class="skin-card editable" data-act="skin-edit" data-id="${h(s.id)}"><span data-apple="${h(s.id)}" data-size="72"></span><b>${h(s.name)}</b><small>${h(how(s))}</small>${s.active ? '' : '<span class="tag off">Archived</span>'}</button>`).join('')}</div>` : '<div class="empty">None yet.</div>'}
  </article>
  <article class="card"><header><h2>In the game</h2><span class="muted small">${builtIn.length}</span></header>
    ${S.game ? `<div class="skin-grid">${builtIn.map(s => `<div class="skin-card"><span data-apple="${h(s.id)}" data-size="64"></span><b>${h(s.name)}</b><small>${h(how(s))}</small></div>`).join('')}</div>` : needGame()}
  </article>`;
}
function openSkin(id) {
  const s = S.doc.skins.find(x => x.id === id) || { id: '', name: '', base: '#e8392f', dark: '#a3171a', light: '#ff9a86', leaf: '#4caf50', cost: 500, gloss: false, sparkle: false, stick: false, rainbow: false, active: true, tour: false };
  const published = S.live.content.skins.some(x => x.id === s.id);
  openDrawer(id ? s.name : 'New skin', `
    <section><div class="big-preview" id="skin-apple"></div></section>
    <section class="form" id="skin-form">
      <label class="field"><span>Name</span><input maxlength="34" value="${h(s.name)}" data-f="name" placeholder="Harvest Apple"></label>
      <div class="colors">${[['base', 'Colour'], ['dark', 'Shadow'], ['light', 'Shine'], ['leaf', 'Leaf']].map(([k, l]) => `<label class="field"><span>${l}</span><input type="color" value="${s[k]}" data-f="${k}"></label>`).join('')}</div>
      <div class="pair">${[['gloss', 'Glossy'], ['sparkle', 'Sparkles'], ['stick', 'Candy stick'], ['rainbow', 'Rainbow']].map(([k, l]) => `<label class="check"><input type="checkbox" class="switch" data-f="${k}" ${s[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <label class="check"><input type="checkbox" class="switch" data-f="tour" ${s.tour ? 'checked' : ''}> Tour reward only (not sold)</label>
      <label class="field" data-price><span>Price in the Orchard (stars)</span><input type="number" min="0" max="10000" step="10" value="${s.cost}" data-f="cost"><small>For comparison: Granny Smith 100, Pink Lady 400, Cosmic Crisp 1,200, Solid Gold 2,500.</small></label>
      <label class="check"><input type="checkbox" class="switch" data-f="active" ${s.active ? 'checked' : ''}> Available (off: archived, owners keep it)</label>
      <div class="actions"><button class="btn primary" data-act="skin-save" data-id="${h(s.id)}">${id ? 'Save' : 'Add'}</button>${id && !published ? `<button class="btn danger" data-act="skin-delete" data-id="${h(s.id)}">Delete</button>` : ''}</div>
      ${published ? '<p class="small muted">Published skins can’t be deleted (players may own them); archive one instead.</p>' : ''}
    </section>`, body => {
    const form = body.querySelector('#skin-form');
    const upd = () => {
      const k = readSkin(form, s.id);
      body.querySelector('#skin-apple').replaceChildren(appleCanvas(k, 140));
      body.querySelector('[data-price]').hidden = k.tour;
    };
    form.addEventListener('input', upd);
    upd();
  });
}
function readSkin(form, id) {
  const v = f => form.querySelector(`[data-f="${f}"]`);
  const k = { id, name: v('name').value.trim() || 'New Apple', base: v('base').value, dark: v('dark').value, light: v('light').value, leaf: v('leaf').value,
    cost: Math.max(0, Math.min(10000, Math.round(Number(v('cost').value) || 0))), gloss: v('gloss').checked, sparkle: v('sparkle').checked, stick: v('stick').checked, rainbow: v('rainbow').checked, active: v('active').checked, tour: v('tour').checked };
  if (k.tour) k.cost = 0;
  return k;
}
function saveSkin(id) {
  const form = $('#skin-form');
  const k = readSkin(form, id);
  if (!form.querySelector('[data-f="name"]').value.trim()) return toast('Give it a name.', true);
  if (/[<>]/.test(k.name)) return toast('Names can’t contain < or >.', true);
  if (!id) {
    const base = 'custom-' + (k.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'apple');
    let n = 1, next = base.length >= 10 ? base : base + '-skin';
    while (S.doc.skins.some(x => x.id === next) || S.live.content.skins.some(x => x.id === next)) next = `${base}-${++n}`;
    k.id = next;
  }
  edit(doc => { const i = doc.skins.findIndex(x => x.id === k.id); if (i >= 0) doc.skins[i] = k; else doc.skins.push(k); }, id ? 'Skin saved to your draft.' : 'Skin added to your draft.');
  closeDrawer();
}

// ------------------------------------------------------------------ Stats
async function loadStats(quiet = false) {
  if (S.statsLoading) return;
  S.statsLoading = true;
  try {
    S.stats = await api(`stats?days=${S.statsDays}&platform=${S.statsPlatform}`);
    if (S.view === 'stats' || S.view === 'today') render();
  } catch (e) { if (!quiet) toast(e.message, true); S.stats = { daily: [], levels: [], ranks: [], days: S.statsDays }; }
  finally { S.statsLoading = false; }
}
function viewStats() {
  const head = `<div class="head"><div><h1>Stats</h1><p>Anonymous counts from players who said yes to sharing play stats. Counts of events, not people; nothing here can identify anyone.</p></div>
    <div class="actions"><div class="seg" role="group" aria-label="Days">${[7, 30, 90].map(d => `<button data-act="stats-days" data-days="${d}" aria-pressed="${S.statsDays === d}">${d} days</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Platform">${[['all', 'Both'], ['ios', 'iPhone'], ['android', 'Android']].map(([p, l]) => `<button data-act="stats-platform" data-platform="${p}" aria-pressed="${S.statsPlatform === p}">${l}</button>`).join('')}</div>
    <button class="btn small" data-act="csv">Export CSV</button></div></div>`;
  if (!S.stats) return head + '<div class="empty">Loading…</div>';
  const rows = S.stats.daily || [];
  const sum = (ev, detail) => rows.filter(r => r.event === ev && (detail === undefined || r.detail === detail)).reduce((t, r) => t + r.n, 0);
  const days = new Map();
  for (const r of rows) if (r.event === 'active_day') days.set(r.day, (days.get(r.day) || 0) + r.n);
  const series = [];
  for (let i = S.stats.days - 1; i >= 0; i--) { const k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); series.push([k, days.get(k) || 0]); }
  const max = Math.max(1, ...series.map(x => x[1]));
  const levels = new Map();
  for (const r of S.stats.levels || []) { const x = levels.get(r.detail) || { clear: 0, fail: 0, reached: 0 }; x[r.event.slice(6)] += r.n; levels.set(r.detail, x); }
  const hardest = [...levels].map(([n, x]) => ({ n: Number(n), ...x, rate: x.clear + x.fail ? x.clear / (x.clear + x.fail) : null })).filter(x => x.clear + x.fail >= 3).sort((a, b) => a.rate - b.rate).slice(0, 12);
  const versions = new Map();
  for (const r of rows) if (r.event === 'content') versions.set(Number(r.detail), (versions.get(Number(r.detail)) || 0) + r.n);
  const helping = new Map();
  for (const r of rows) if (r.event === 'helping_hand') helping.set(Number(r.detail), (helping.get(Number(r.detail)) || 0) + r.n);
  const table = (cols, data) => (data.length ? `<div class="table-wrap"><table><thead><tr>${cols.map((c, i) => `<th${i ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${data.map(r => `<tr>${r.map((v, i) => `<td${i ? ' class="num"' : ''}>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing yet.</div>');
  return `${head}
  <div class="grid four">
    ${[['Active device-days', sum('active_day')], ['New installs', sum('first_launch')], ['Daily Runs finished', sum('daily_finish')], ['Purchases', sum('purchase', 'bought')]].map(([l, v]) => `<article class="card kpi"><b>${fmtN(v)}</b><span>${l}</span></article>`).join('')}
  </div>
  <article class="card"><header><h2>Active devices by day</h2><span class="muted small">max ${fmtN(max)}</span></header>
    <div class="bars" role="img" aria-label="Active devices per day">${series.map(([k, v]) => `<i data-height="${Math.round(v / max * 100)}" title="${k}: ${v}"></i>`).join('')}</div>
    <div class="bars-x"><span>${h(series[0][0])}</span><span>${h(series.at(-1)[0])}</span></div>
  </article>
  <div class="grid two">
    <article class="card"><header><h2>Hardest Adventure levels</h2></header><p class="small muted">Clear rate = clears ÷ (clears + times eaten). A level far below its neighbours needs a look.</p>
      ${table(['Level', 'Clears', 'Eaten', 'Clear rate'], hardest.map(x => [x.n, fmtN(x.clear), fmtN(x.fail), `${Math.round(x.rate * 100)}%`]))}</article>
    <article class="card"><header><h2>Content versions reaching phones</h2></header><p class="small muted">Each time a phone got a new published version.</p>
      ${table(['Version', 'Phones'], [...versions].sort((a, b) => b[0] - a[0]).slice(0, 10).map(([v, n]) => [`v${v}${v === S.live.version ? ' (live)' : ''}`, fmtN(n)]))}</article>
    <article class="card"><header><h2>Coming back</h2></header>
      ${table(['', 'Count'], [['Streaks of 3+ days ended', fmtN(sum('streak_broke'))], ['…and mended', fmtN(sum('streak_mended'))], ['Welcomed back', fmtN(sum('welcome_back'))], ['Tour tiers reached', fmtN(sum('tour_tier'))], ['Tries again after losing', fmtN(sum('retry'))]])}</article>
    <article class="card"><header><h2>Helping hand, by level</h2></header><p class="small muted">Where players get stuck.</p>
      ${table(['Level', 'Tries'], [...helping].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([l, n]) => [l, fmtN(n)]))}</article>
  </div>`;
}

// ------------------------------------------------------------------ History
async function loadHistory() {
  try { S.history = (await api('history')).items; } catch (e) { S.history = []; toast(e.message, true); }
  if (S.view === 'history') render();
}
function viewHistory() {
  const head = '<div class="head"><div><h1>History</h1><p>Every publish is kept. Going back to an old version publishes it again as a new one; nothing is erased.</p></div></div>';
  if (!S.history) return head + '<div class="empty">Loading…</div>';
  if (!S.history.length) return head + '<div class="empty">Nothing published yet.</div>';
  return `${head}<article class="card"><div class="list">${S.history.map(x => `<div class="row"><span class="tag ${x.version === S.live.version ? 'live' : 'auto'}">v${x.version}</span><div class="grow"><div class="title">${h(x.note || (x.action === 'rollback' ? 'Went back' : 'Published'))}</div><div class="sub">${h(new Date(x.created_at).toLocaleString())} · ${h(x.actor)}</div></div>${x.version === S.live.version ? '<span class="muted small">Live now</span>' : `<button class="btn small" data-act="rollback" data-v="${x.version}">Go back to this</button>`}</div>`).join('')}</div></article>`;
}

// ------------------------------------------------------------------ Settings
function viewSettings() {
  const f = S.doc.flags;
  return `<div class="head"><div><h1>Settings</h1><p>Emergency switches, testing and troubleshooting.</p></div></div>
  <div class="grid two">
    <article class="card"><header><h2>Emergency ad switches</h2></header><p class="small muted">Only for when an ad network misbehaves. They pause a kind of ad; they never add ads or change the purchase. Publish to apply.</p>
      <div class="list">${Object.entries(FLAG_INFO).map(([k, [t, d]]) => `<label class="row"><div class="grow"><div class="title">${t}</div><div class="sub">${d}</div></div><input type="checkbox" class="switch" data-act="flag" data-flag="${k}" ${f[k] ? 'checked' : ''}></label>`).join('')}</div>
    </article>
    <article class="card"><header><h2>Try it before players do</h2></header><p class="small muted">Opens the test game with your unpublished changes, on a separate test save. Nobody else sees it.</p>
      <div class="actions"><button class="btn primary" data-act="preview">Play my draft in the test game ↗</button><a class="btn" href="/apple/test/" target="_blank" rel="noopener">Test game (published) ↗</a></div>
      <p class="small muted">Download the draft as a file, for safekeeping: <button class="btn small" data-act="download">Download JSON</button></p>
    </article>
    <article class="card"><header><h2>If phones don’t get your changes</h2></header>
      <ol class="small">
        <li><b>Did you publish?</b> The bar at the top says “Everything is published” when you have.</li>
        <li><b>Look on the phone:</b> the game’s Settings shows “Published content: v${S.live.version} · current” when it has the latest. Open the game again, or switch away and back, to check.</li>
        <li><b>It says “blocked (Cloudflare’s bot check…)”, or “offline” on a build from before October 20:</b> Cloudflare is stopping the app. In Cloudflare, go to Security → Bots and turn off <i>Bot Fight Mode</i>, or, on a paid plan, add a WAF rule that skips bot checks for paths starting with <code>/api/apple/</code>. Security → Events shows what was blocked.</li>
        <li><b>A build from Xcode</b> only has this if it was built after the live-content update: run <code>git pull</code>, then <code>npm run ios</code>, and build again.</li>
        <li><b>Today’s challenges:</b> a phone that already made a start on them keeps them (progress is never taken away). They change from tomorrow.</li>
      </ol>
      <div class="actions"><button class="btn small" data-act="check">Check what’s being served</button></div>
    </article>
    <article class="card"><header><h2>Elsewhere</h2></header><div class="list">
      ${[['https://apps.admob.com/', 'AdMob', 'Ad earnings and settings'], ['https://appstoreconnect.apple.com/', 'App Store Connect', 'Builds, TestFlight, sales'], ['https://play.google.com/console/', 'Google Play Console', 'Android releases'], ['https://dash.cloudflare.com/', 'Cloudflare', 'Security, Access, the Worker and database'], ['/apple/stats', 'Old stats page', 'The previous play-stats tables']].map(([u, t, d]) => `<a class="row" href="${u}" target="_blank" rel="noopener"><div class="grow"><div class="title">${t} ↗</div><div class="sub">${d}</div></div></a>`).join('')}
    </div></article>
  </div>`;
}
async function checkServed() {
  try {
    const r = await fetch('/api/apple/content?schema=2', { cache: 'no-store', credentials: 'omit' });
    const type = r.headers.get('Content-Type') || '';
    if (!r.ok || !type.includes('json')) return toast(`The content address answered ${r.status}${type.includes('html') ? ' with a web page (a Cloudflare check?)' : ''}.`, true);
    const body = await r.json();
    toast(body.version === S.live.version ? `Serving version ${body.version}, the latest. (From this computer; a phone may differ, see Troubleshooting.)` : `Serving version ${body.version}; ${S.live.version} is the latest. Caches catch up within 30 seconds.`);
  } catch (e) { toast(`Couldn’t reach the content address: ${e.message}`, true); }
}

// ------------------------------------------------------------------ publishing
async function review() {
  await flushSave();
  if (S.conflict) return;
  const list = changesFromLive();
  if (!list.length) return toast('Nothing to publish.');
  openModal('Review and publish', `
    <p class="muted">These go to every phone the next time the game opens. You can go back to the current version from History at any time.</p>
    <ul class="changes">${list.map(([what, text]) => `<li><b>${h(what)}</b>${h(text)}</li>`).join('')}</ul>
    <label class="field"><span>Note for the history <small>(optional)</small></span><input maxlength="140" id="publish-note" placeholder="Halloween week"></label>
    <div class="actions"><button class="btn primary" data-act="publish">Publish to players</button><button class="btn" data-act="modal-close">Not yet</button></div>`);
}
async function publish() {
  const btn = document.querySelector('[data-act="publish"]');
  btn.disabled = true;
  try {
    await flushSave();
    if (!S.draft) { closeModal(); return toast('Nothing to publish.'); }
    const r = await api('publish', { method: 'POST', body: { draftVersion: S.draft.version, liveVersion: S.live.version, note: $('#publish-note').value.trim() } });
    closeModal();
    await load();
    S.history = null;
    S.look = 'draft';
    render();
    toast(`Published version ${r.version}. Phones get it the next time the game opens.`);
  } catch (e) {
    btn.disabled = false;
    if (e.status === 409) banner(e.message, 'reload', true); else toast(e.message, true);
  }
}
async function discardAll() {
  openModal('Discard your changes?', `<p>Everything you changed since the last publish goes back to what’s published (version ${S.live.version}).</p><ul class="changes">${changesFromLive().map(([w, t]) => `<li><b>${h(w)}</b>${h(t)}</li>`).join('')}</ul><div class="actions"><button class="btn danger" data-act="discard-yes">Discard</button><button class="btn" data-act="modal-close">Keep them</button></div>`);
}
async function rollback(v) {
  const dirty = changesFromLive().length;
  openModal(`Go back to version ${v}?`, `<p>Version ${v} is published again, as version ${S.live.version + 1}. ${dirty ? 'Your unpublished changes are discarded first.' : ''} A tour that has started keeps its reward either way.</p><div class="actions"><button class="btn primary" data-act="rollback-yes" data-v="${v}">Go back</button><button class="btn" data-act="modal-close">Cancel</button></div>`);
}

// ------------------------------------------------------------------ events
const actions = {
  view: el => setView(el.dataset.view),
  look: el => { S.look = el.dataset.look; render(); },
  month: el => {
    const step = Number(el.dataset.step);
    if (!step) S.calMonth = todayKey().slice(0, 7);
    else { const [y, m] = S.calMonth.split('-').map(Number); const d = new Date(y, m - 1 + step, 1, 12); S.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    render();
  },
  day: el => openDay(el.dataset.key),
  'day-save': el => saveDay(el.dataset.key),
  'day-reset': el => { edit(doc => { doc.daily = doc.daily.filter(x => x.date !== el.dataset.key); }, 'Back to the automatic challenges.'); closeDrawer(); },
  week: el => openWeek(el.dataset.key),
  'week-save': el => saveWeek(el.dataset.key),
  'week-reset': el => { edit(doc => { doc.weekly = doc.weekly.filter(x => x.monday !== el.dataset.key); }, 'Back to the automatic twist.'); closeDrawer(); },
  'notice-new': el => openNotice('', el.dataset.start),
  'notice-edit': el => openNotice(el.dataset.id),
  'notice-save': el => saveNotice(el.dataset.id),
  'notice-delete': el => { edit(doc => { doc.notices = doc.notices.filter(x => x.id !== el.dataset.id); }, 'Announcement removed from your draft.'); closeDrawer(); },
  'notice-toggle': el => edit(doc => { const n = doc.notices.find(x => x.id === el.dataset.id); if (n) n.enabled = el.checked; }),
  tour: el => openTour(Number(el.dataset.n)),
  'tour-save': el => saveTour(Number(el.dataset.n)),
  'tour-reset': el => { edit(doc => { doc.tours = doc.tours.filter(x => x.number !== Number(el.dataset.n)); }, 'Back to the automatic theme.'); closeDrawer(); },
  'skin-new': () => openSkin(''),
  'skin-edit': el => openSkin(el.dataset.id),
  'skin-save': el => saveSkin(el.dataset.id),
  'skin-delete': el => {
    if (S.doc.tours.some(t => t.skin === el.dataset.id)) return toast('A tour uses this skin as its reward. Change that tour first.', true);
    edit(doc => { doc.skins = doc.skins.filter(x => x.id !== el.dataset.id); }, 'Skin removed from your draft.'); closeDrawer();
  },
  flag: el => edit(doc => { doc.flags[el.dataset.flag] = el.checked; }, 'Saved to your draft. Publish to apply.'),
  'stats-days': el => { S.statsDays = Number(el.dataset.days); S.stats = null; render(); loadStats(); },
  'stats-platform': el => { S.statsPlatform = el.dataset.platform; S.stats = null; render(); loadStats(); },
  csv: () => {
    const rows = [['date', 'platform', 'app_version', 'event', 'detail', 'count'], ...(S.stats?.daily || []).map(r => [r.day, r.os, r.app, r.event, r.detail, r.n])];
    download(`the-apple-stats-${todayKey()}.csv`, rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'text/csv');
  },
  download: () => download('the-apple-draft.json', JSON.stringify(S.doc, null, 2), 'application/json'),
  preview: () => {
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify({ version: 0, content: S.doc, expires: Date.now() + 3600000 })); } catch { return toast('This browser won’t store the preview.', true); }
    const a = document.createElement('a');
    a.href = '/apple/test/?contentPreview=1'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.append(a); a.click(); a.remove();
  },
  check: () => checkServed(),
  rollback: el => rollback(Number(el.dataset.v)),
  'rollback-yes': async el => {
    el.disabled = true;
    try {
      if (S.draft) await api('discard', { method: 'POST', body: { draftVersion: S.draft.version } });
      const r = await api('rollback', { method: 'POST', body: { version: Number(el.dataset.v), liveVersion: S.live.version } });
      closeModal(); await load(); S.history = null; render(); loadHistory();
      toast(`Version ${el.dataset.v} is live again, as version ${r.version}.`);
    } catch (e) { el.disabled = false; toast(e.message, true); }
  },
  publish: () => publish(),
  'discard-yes': async () => {
    clearTimeout(S.saveTimer); S.saveTimer = null;
    if (S.saving) await S.saving;
    try { if (S.draft) await api('discard', { method: 'POST', body: { draftVersion: S.draft.version } }); } catch (e) { return toast(e.message, true); }
    S.draft = null; S.doc = clone(S.live.content); closeModal(); render(); toast('Changes discarded.');
  },
  'modal-close': () => closeModal(),
  reload: async () => { $('#banner').hidden = true; await load(); render(); },
  'banner-close': () => { $('#banner').hidden = true; },
};
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('click', e => {
  const nav = e.target.closest('#nav button');
  if (nav) return setView(nav.dataset.view);
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.matches('input[type=checkbox]')) return; // switches act on change
  e.preventDefault();
  actions[el.dataset.act]?.(el);
});
document.addEventListener('change', e => {
  const el = e.target.closest('input[type=checkbox][data-act]');
  if (el) actions[el.dataset.act]?.(el);
});
$('#review').addEventListener('click', review);
$('#discard').addEventListener('click', discardAll);
$('#drawer-close').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', () => { if ($('#modal').hidden) closeDrawer(); });
$('#menu-btn').addEventListener('click', () => { const s = $('.side'); s.classList.toggle('open'); $('#menu-btn').setAttribute('aria-expanded', String(s.classList.contains('open'))); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (!$('#drawer').hidden) closeDrawer(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); flushSave(); }
});
window.addEventListener('beforeunload', e => { if (S.saveTimer || S.saving) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
// Sizes the markup can't set inline (the page's security policy forbids
// inline styles): bars and progress widths.
new MutationObserver(() => {
  for (const el of document.querySelectorAll('[data-width]')) { el.style.width = el.dataset.width + '%'; el.removeAttribute('data-width'); }
  for (const el of document.querySelectorAll('[data-height]')) { el.style.height = Math.max(2, Number(el.dataset.height)) + '%'; el.removeAttribute('data-height'); }
}).observe(document.body, { childList: true, subtree: true });

(async () => {
  try {
    await Promise.all([load(), loadGame()]);
    if (S.gameError) banner(S.gameError);
    setView(location.hash.slice(1) || 'today');
  } catch (e) {
    $('#bar-status').textContent = 'Couldn’t load';
    banner(`Couldn’t load the control center: ${e.message}`, 'reload', true);
  }
})();
