/* ══════════════════════════════════════════════════════════════════
   mattOS — everything hidden.

   This file is the achievement registry plus the wiring for the eggs
   that live outside the Terminal.  It loads last, after the desktop
   exists, and talks to it only through the small window.MATTOS bridge
   (see index.html), so nothing here reaches into the OS internals.

   Locked achievements show only their `hint`, which is the whole
   point: the list proves something is there without giving it away.
   Find every one and mattOS Pro unlocks — a gold wallpaper, a hidden
   game, and a note.

   Terminal eggs live in /shell.js; the games are in /games/.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";
const OS = window.MATTOS;
if (!OS) return;

const KEY = "mattos-eggs";
const GKEY = "mattos-unlocked-games";

/* ─────────────────────────── the registry ───────────────────────────
   id      stable, stored
   name    shown once found
   desc    what you actually did
   hint    the only thing shown while locked — be suggestive, not clear */
const EGGS = [
  { id: "konami", icon: "🎮", name: "Old habits", desc: "You typed the Konami code.",
    hint: "Up, up, and then some. A code from 1986 still works here." },
  { id: "launchpad", icon: "🚀", name: "Everything at once", desc: "You found Launchpad.",
    hint: "One Dock tile isn't an app at all." },
  { id: "mission-control", icon: "🛫", name: "Air traffic control", desc: "You spread the windows out with Mission Control.",
    hint: "Function keys still do things around here. The third one." },
  { id: "force-quit", icon: "💀", name: "Have you tried turning it off", desc: "You force-quit a system process.",
    hint: "Something in the  menu can end a process. Some processes take it personally." },
  { id: "kernel-panic", icon: "🟦", name: "Blue screen of life", desc: "You caused a kernel panic. It was survivable.",
    hint: "Ask the Terminal to panic — or force-quit something you really shouldn't." },
  { id: "dock-menu", icon: "🖱️", name: "Secondary click", desc: "You right-clicked a Dock tile.",
    hint: "The Dock has more to say if you ask it the other way." },
  { id: "empty-trash", icon: "🗑️", name: "Nothing to empty", desc: "You emptied an already-empty Trash.",
    hint: "You can't take out the trash if there is no trash. Try anyway." },
  { id: "trash-persistent", icon: "♻️", name: "Persistent", desc: "You clicked the Trash five times. It stayed empty.",
    hint: "Keep opening the thing that is always empty." },
  { id: "battery", icon: "🔋", name: "Low power mode", desc: "You tapped the battery ten times and mattOS dimmed the lights.",
    hint: "The battery in the menu bar is a button. Ten is the magic number." },
  { id: "wifi-off", icon: "📴", name: "No signal", desc: "You turned the Wi-Fi off.",
    hint: "Control Center has a switch you probably shouldn't flip." },
  { id: "dino", icon: "🦖", name: "Offline classic", desc: "You found the game every browser hides for when the network dies.",
    hint: "When the connection drops, browsers give you something to do. So does this one." },
  { id: "screensaver-corner", icon: "📺", name: "Perfect corner", desc: "You watched the bouncing logo hit a corner exactly. Almost nobody sees this.",
    hint: "Leave the desktop completely alone, then watch the logo very, very closely." },
  { id: "matrix", icon: "💊", name: "Follow the white rabbit", desc: "You made it rain.",
    hint: "Green characters, black screen, 1999." },
  { id: "matt-type", icon: "⌨️", name: "Say my name", desc: "You typed my name on the desktop.",
    hint: "Click the wallpaper so nothing is focused, then type four letters." },
  { id: "ten-windows", icon: "🪟", name: "Window manager", desc: "You had ten windows open at once.",
    hint: "More. Open more of them." },
  { id: "clock-base", icon: "🕐", name: "Other bases", desc: "You made the desktop clock count in another base.",
    hint: "The clock widget doesn't only speak decimal. Click it." },
  { id: "about-build", icon: "🔢", name: "Build number", desc: "You clicked the version until it confessed.",
    hint: "In About This Machine, one row is a button in disguise." },
  { id: "boot-verbose", icon: "📜", name: "Verbose boot", desc: "You interrupted the boot the way a sysadmin would.",
    hint: "Sysadmins never let a boot screen finish quietly. Click it. Repeatedly." },
  { id: "night-owl", icon: "🦉", name: "Night owl", desc: "You showed up in the small hours.",
    hint: "Come back when you should be asleep." },
  { id: "four-oh-four", icon: "❓", name: "Not found", desc: "You were here at 4:04.",
    hint: "Be here at a very specific minute. It's the one that's missing." },
  { id: "spotlight-magic", icon: "🔦", name: "Spotlight knows", desc: "You searched Spotlight for something that isn't an app.",
    hint: "Search for a number that answers everything. Or a rude command." },
  { id: "calc-42", icon: "🧮", name: "The Answer", desc: "Your calculation came to 42.",
    hint: "Some sums matter more than others. Deep Thought took 7.5 million years." },
  { id: "calc-upside", icon: "🙃", name: "Calculator words", desc: "You spelled a word on the calculator.",
    hint: "Some numbers only read properly upside down. 0.7734, for example." },
  { id: "weather-live", icon: "🌤️", name: "Actual weather", desc: "You pulled real conditions over Lafayette.",
    hint: "One app talks to the real world." },
  { id: "weather-snow", icon: "❄️", name: "Snow in Louisiana", desc: "You poked the forecast until it snowed on the desktop.",
    hint: "Poke the weather until it changes its mind. Five times should do it." },
  { id: "music-play", icon: "🎵", name: "First listen", desc: "You played a track that has no audio file.",
    hint: "There is an album in here. Nothing was downloaded to make it." },
  { id: "music-secret", icon: "💿", name: "Bonus track", desc: "You unlocked the track that isn't on the list.",
    hint: "The album has a hidden track. The code that starts a party also plays it." },
  { id: "sketch-artist", icon: "🎨", name: "Prolific", desc: "Twenty-five strokes in Sketch.",
    hint: "Draw. Keep drawing." },
  { id: "notes-hire", icon: "✍️", name: "Direct approach", desc: "You wrote the obvious thing in Notes.",
    hint: "Notes is a scratchpad. Write down what you want to do about me." },
  { id: "stopwatch", icon: "⏱️", name: "Timekeeper", desc: "You timed something.",
    hint: "One of the apps has three tabs. The middle one wants to be stopped." },
  { id: "arcade-regular", icon: "🕹️", name: "Arcade regular", desc: "You played every game in the arcade.",
    hint: "All of them. Every single one." },
  /* ── Terminal (see /shell.js) ── */
  { id: "sh-root", icon: "🔑", name: "sudo make me a sandwich", desc: "You talked your way into a root shell.",
    hint: "The Terminal refuses sudo. It is not very firm about it. Ask again. And again." },
  { id: "sh-filesystem", icon: "📁", name: "There is a filesystem", desc: "You listed the hidden files.",
    hint: "`ls` shows some things. There is a flag that shows all things." },
  { id: "sh-plan", icon: "📄", name: "The .plan file", desc: "You read my .plan, the way people did in 1993.",
    hint: "Old-school hackers kept a plan in their home directory. `cat` it." },
  { id: "sh-key", icon: "🗝️", name: "Keymaster", desc: "You found the key file and used it.",
    hint: "Somewhere in the filesystem there is a key. The shell knows what to do with it." },
  { id: "sh-adventure", icon: "🗺️", name: "Colossal cave", desc: "You finished the text adventure.",
    hint: "One command in the Terminal starts a story. Stories have endings." },
  { id: "sh-xyzzy", icon: "🪄", name: "A hollow voice says fool", desc: "You said the magic word.",
    hint: "The magic word from 1977. Adventurers know it." },
  { id: "sh-hack", icon: "🧑‍💻", name: "I'm in", desc: "You hacked the mainframe. It was mostly for show.",
    hint: "Movies made this look like one word typed into a terminal. Here it is." },
  { id: "sh-gravity", icon: "🍎", name: "Newton was right", desc: "You dropped every window on the floor.",
    hint: "Tell the shell that what goes up must come down." },
  { id: "sh-roll", icon: "🌀", name: "Do a barrel roll", desc: "You rolled the whole desktop.",
    hint: "Peppy has been shouting it since 1997." },
  { id: "sh-cow", icon: "🐄", name: "Livestock as a service", desc: "You made the cow talk.",
    hint: "A command-line classic involving cattle." },
  { id: "sh-fortune", icon: "🥠", name: "Fortune favours the curious", desc: "You asked for your fortune.",
    hint: "Unix has been handing these out since the seventies." }
];

/* ─────────────────────────── storage ─────────────────────────── */
function readSet(key) {
  try { const a = JSON.parse(localStorage.getItem(key) || "[]"); return new Set(Array.isArray(a) ? a : []); }
  catch (e) { return new Set(); }
}
function writeSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) {}
}
let found = readSet(KEY);
let unlockedGames = readSet(GKEY);
const order = [];                                  // for "last found"
const listeners = [];
const notify = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });

function achieve(id, opts) {
  const egg = EGGS.find(e => e.id === id);
  if (!egg || found.has(id)) return false;
  found.add(id);
  order.push(id);
  writeSet(KEY, found);
  const n = found.size, total = EGGS.length;
  OS.toast(`${egg.icon}  ${egg.name}`,
    `${egg.desc}<br><span style="opacity:.65">Achievement ${n} of ${total}</span>`, "🏆");
  if (!(opts && opts.quiet)) OS.confetti(n === total ? 220 : 26);
  notify();
  if (n === total) setTimeout(goPro, 1200);
  return true;
}

/* ─────────────────────────── mattOS Pro ───────────────────────────
   The reward for finding everything: a gold palette, one more game,
   and a window that says thanks properly. */
function goPro() {
  try { localStorage.setItem("mattos-pro", "1"); } catch (e) {}
  OS.PALETTES.Gold = ["#fde047", "#fbbf24", "#f59e0b", "#fb923c", "#facc15"];
  OS.setWall("Gold");
  unlockGame("pong");
  OS.rainbow(4000);
  OS.confetti(240);
  document.documentElement.classList.add("mattos-pro");
  setTimeout(() => {
    OS.toast("mattOS Pro", "Every last one. The gold wallpaper is yours, and so is one more game.", "✦");
    proNote();
  }, 900);
}
function proNote() {
  const w = document.createElement("div");
  w.id = "proNote";
  w.innerHTML = `
    <div class="pro-card">
      <div class="pro-mark">✦</div>
      <h2>mattOS Pro</h2>
      <p>You found all ${EGGS.length}. Nobody was ever supposed to find all ${EGGS.length}.</p>
      <p>If you dug through a stranger's portfolio this thoroughly, we would probably get along.
         That kind of curiosity is most of what I do for a living: pull on the thread, find the
         thing nobody documented, automate it so nobody has to find it again.</p>
      <p class="pro-sign">— ${OS.profile.name}</p>
      <div class="pro-actions">
        <button class="btn primary" data-pro="mail">Get in touch</button>
        <button class="btn" data-pro="pong">Play the last game</button>
        <button class="btn" data-pro="close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(w);
  w.addEventListener("click", e => {
    const act = e.target.closest("[data-pro]");
    if (e.target === w || (act && act.dataset.pro === "close")) { w.remove(); return; }
    if (!act) return;
    if (act.dataset.pro === "mail") { w.remove(); OS.openApp("contact"); }
    if (act.dataset.pro === "pong") { w.remove(); OS.openApp("game:pong"); }
  });
}

function unlockGame(id) {
  if (unlockedGames.has(id)) return;
  unlockedGames.add(id);
  writeSet(GKEY, unlockedGames);
  notify();
}

/* ─────────────────────────── public surface ─────────────────────────── */
OS.egg = (id, ctx) => achieve(id, ctx);
OS.eggs = {
  list: () => EGGS.map(e => Object.assign({}, e, { done: found.has(e.id) })),
  total: EGGS.length,
  count: () => found.size,
  has: id => found.has(id),
  hasGame: id => unlockedGames.has(id),
  unlockGame,
  onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
  reset() {
    found = new Set(); unlockedGames = new Set(); order.length = 0;
    writeSet(KEY, found); writeSet(GKEY, unlockedGames);
    try { localStorage.removeItem("mattos-pro"); } catch (e) {}
    document.documentElement.classList.remove("mattos-pro");
    notify();
  }
};
/* re-apply Pro on a later visit */
try {
  if (localStorage.getItem("mattos-pro") === "1") {
    OS.PALETTES.Gold = ["#fde047", "#fbbf24", "#f59e0b", "#fb923c", "#facc15"];
    document.documentElement.classList.add("mattos-pro");
  }
} catch (e) {}

/* ═══════════════════════ the eggs themselves ═══════════════════════ */
const $ = s => document.querySelector(s);
const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

/* ── styles the eggs need ── */
const style = document.createElement("style");
style.textContent = `
#proNote{position:fixed;inset:0;z-index:9900;display:flex;align-items:center;justify-content:center;padding:24px;
  background:rgba(8,12,22,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:fade .25s ease}
.pro-card{max-width:520px;background:var(--panel-strong);border:1px solid var(--panel-border);border-radius:22px;
  padding:30px 30px 24px;box-shadow:var(--shadow),var(--edge);text-align:center;
  backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur)}
.pro-card .pro-mark{font-size:40px;color:#f59e0b;text-shadow:0 6px 24px rgba(245,158,11,.55)}
.pro-card h2{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:6px 0 12px;
  background:linear-gradient(135deg,#f59e0b,#fde047);-webkit-background-clip:text;background-clip:text;color:transparent}
.pro-card p{font-size:13.5px;line-height:1.75;color:var(--text-2);margin-bottom:10px;text-align:left}
.pro-card .pro-sign{text-align:right;font-weight:600;color:var(--text)}
.pro-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:16px}
html.mattos-pro #brandmark{color:#f59e0b;opacity:.28}
html.mattos-pro .mb-logo svg{color:#f59e0b}
.egg-big-cursor{cursor:none}
#eggCursor{position:fixed;z-index:9995;pointer-events:none;display:none;transform:translate(-6px,-4px)}
#eggCursor.on{display:block}
.desk-icon.egg-rain{animation:egg-fall 2.6s cubic-bezier(.4,0,.8,1) forwards}
@keyframes egg-fall{to{transform:translateY(110vh) rotate(220deg);opacity:0}}
`;
document.head.appendChild(style);

/* ── Konami: also unlocks the bonus track ── */
const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
let ki = 0;
document.addEventListener("keydown", e => {
  const k = (e.key || "").toLowerCase();
  if (k === KONAMI[ki]) {
    ki++;
    if (ki === KONAMI.length) {
      ki = 0;
      achieve("konami");
      playSecretTrack();
    }
  } else ki = (k === KONAMI[0]) ? 1 : 0;
});
function playSecretTrack() {
  if (!window.MATTAPPS) return;
  achieve("music-secret");
  OS.openApp("app:music");
  const tryPlay = n => {
    const node = document.querySelector('.win[data-app="app:music"]');
    if (node && node._musicPlay) node._musicPlay("konami");
    else if (n < 25) setTimeout(() => tryPlay(n + 1), 200);
  };
  setTimeout(() => tryPlay(0), 350);
}

/* ── type "matt" on the desktop with nothing focused ── */
let typed = "";
document.addEventListener("keydown", e => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!/^[a-z]$/i.test(e.key)) { typed = ""; return; }
  typed = (typed + e.key.toLowerCase()).slice(-6);
  if (typed.endsWith("matt")) { typed = ""; avatarRain(); achieve("matt-type"); }
});
function avatarRain() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:9845;pointer-events:none;overflow:hidden";
  document.body.appendChild(host);
  for (let i = 0; i < 26; i++) {
    const d = document.createElement("div");
    d.textContent = "M";
    d.style.cssText = `position:absolute;left:${Math.random() * 100}vw;top:-60px;width:44px;height:44px;
      border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;
      background:linear-gradient(135deg,var(--accent),var(--accent-2));box-shadow:0 8px 20px rgba(15,23,42,.35)`;
    const dur = 2400 + Math.random() * 2200;
    d.animate([{ transform: "translateY(0) rotate(0deg)" },
               { transform: `translateY(115vh) rotate(${Math.random() * 720 - 360}deg)` }],
      { duration: dur, delay: Math.random() * 900, easing: "cubic-bezier(.3,.6,.5,1)" });
    host.appendChild(d);
  }
  setTimeout(() => host.remove(), 5600);
}

/* ── the menu-bar battery: ten taps drops mattOS into low power mode ── */
let batteryTaps = 0, lowPower = false;
on($("#trayBattery"), "click", () => {
  batteryTaps++;
  if (batteryTaps === 10 && !lowPower) {
    lowPower = true;
    achieve("battery");
    document.querySelectorAll("#wallpaper .blob").forEach(b => b.style.animationPlayState = "paused");
    document.documentElement.style.setProperty("--wall-dim", "0.45");
    const pct = $("#mbBatteryPct");
    let n = 100;
    const iv = setInterval(() => {
      n -= 3;
      if (pct) pct.textContent = Math.max(1, n) + "%";
      if (n <= 1) {
        clearInterval(iv);
        OS.toast("Low Power Mode", "Animations paused, brightness down. It's cosmetic; your real battery is fine.", "🔋");
        setTimeout(() => {
          if (pct) pct.textContent = "100%";
          document.querySelectorAll("#wallpaper .blob").forEach(b => b.style.animationPlayState = "");
          document.documentElement.style.removeProperty("--wall-dim");
          lowPower = false; batteryTaps = 0;
        }, 6000);
      }
    }, 90);
  }
});

/* ── Wi-Fi off, and the offline game that comes with it ── */
function watchWifi() {
  const cc = $("#ccWifi");
  if (!cc) { setTimeout(watchWifi, 400); return; }
  on(cc, "click", () => {
    setTimeout(() => {
      if (!cc.classList.contains("on")) {
        achieve("wifi-off");
        OS.eggs.unlockGame("dino");
        setTimeout(() => OS.toast("No connection",
          "Nothing live will load until Wi-Fi is back. There is <b>something to do</b> while you wait: try the Arcade.", "📴"), 1400);
      }
    }, 30);
  });
}
watchWifi();

/* ── the bouncing-logo screensaver: catch a corner exactly ── */
(function watchScreensaver() {
  const ss = $("#screensaver"), logo = $("#ssLogo");
  if (!ss || !logo) return;
  let raf = 0;
  const check = () => {
    if (!ss.classList.contains("on")) { raf = 0; return; }
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(logo.style.transform || "");
    if (m) {
      const x = +m[1], y = +m[2];
      const nearX = x <= 3 || x >= window.innerWidth - 131;
      const nearY = y <= 3 || y >= window.innerHeight - 131;
      if (nearX && nearY) {
        achieve("screensaver-corner");
        OS.confetti(120);
      }
    }
    raf = requestAnimationFrame(check);
  };
  new MutationObserver(() => {
    if (ss.classList.contains("on") && !raf) raf = requestAnimationFrame(check);
  }).observe(ss, { attributes: true, attributeFilter: ["class"] });
})();

/* ── matrix rain, wherever it is started from ── */
(function watchMatrix() {
  const mx = $("#matrix");
  if (!mx) return;
  new MutationObserver(() => { if (mx.classList.contains("on")) achieve("matrix"); })
    .observe(mx, { attributes: true, attributeFilter: ["class"] });
})();

/* ── ten windows open at once ── */
(function watchWindows() {
  const layer = $("#windowLayer");
  if (!layer) return;
  new MutationObserver(() => {
    if (layer.querySelectorAll(".win:not(.closing)").length >= 10) achieve("ten-windows");
  }).observe(layer, { childList: true });
})();

/* ── the desktop clock widget counts in other bases ── */
(function clockBases() {
  const BASES = ["decimal", "binary", "hex", "roman"];
  let i = 0;
  const roman = n => {
    const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let out = "", v = n;
    map.forEach(([k, s]) => { while (v >= k) { out += s; v -= k; } });
    return out || "N";
  };
  function hook() {
    const w = $(".w-clock");
    if (!w) { setTimeout(hook, 500); return; }
    on(w, "click", () => {
      i = (i + 1) % BASES.length;
      const mode = BASES[i];
      const t = $("#wClockTime"), ap = $("#wClockAp");
      if (!t) return;
      if (mode === "decimal") { OS.toast("Clock", "Back to base 10.", "🕐"); return; }
      achieve("clock-base");
      const d = new Date(), h = d.getHours() % 12 || 12, m = d.getMinutes();
      const fmt = mode === "binary" ? h.toString(2) + ":" + m.toString(2).padStart(6, "0")
        : mode === "hex" ? h.toString(16).toUpperCase() + ":" + m.toString(16).toUpperCase().padStart(2, "0")
          : roman(h) + " " + roman(Math.floor(m / 10)) + roman(m % 10);
      t.textContent = fmt;
      t.style.fontSize = mode === "binary" ? "22px" : "";
      if (ap) ap.textContent = mode;
      OS.toast("Clock", "Now counting in " + mode + ". Click again to keep going.", "🕐");
      setTimeout(() => { t.style.fontSize = ""; }, 8000);
    });
  }
  hook();
})();

/* ── About This Machine: click the version until it gives something up ── */
let buildTaps = 0;
document.addEventListener("click", e => {
  const row = e.target.closest(".spec-row");
  if (!row || !/mattOS/.test(row.textContent)) return;
  buildTaps++;
  const v = row.querySelector(".v");
  if (!v) return;
  if (buildTaps < 5) { v.textContent = "mattOS 4.8 “Liquid” (" + (5 - buildTaps) + ")"; return; }
  if (buildTaps === 5) {
    achieve("about-build");
    v.textContent = "mattOS 4.8.1 build 47a";
    OS.toast("mattOS", "Build 47a. Named for the 47 flows, obviously. Try the Terminal: <b>ls -a</b>.", "🔢");
  }
});

/* ── boot screen: click the logo like an impatient sysadmin ── */
(function verboseBoot() {
  const boot = $("#boot");
  if (!boot) return;
  let taps = 0;
  on(boot, "click", () => {
    taps++;
    if (taps !== 5) return;
    achieve("boot-verbose");
    const post = $("#bootPost");
    if (!post) return;
    const LINES = [
      "AppleACPIPlatform: mattOS 4.8.1 build 47a",
      "GlassWM: compositor online, 1 display",
      "IOKit: registering Dock magnifier",
      "arcade: 11 titles indexed (2 hidden)",
      "flows: 47 loaded, 0 failed",
      "coffee: warm",
      "hint: the Terminal has a filesystem"
    ];
    let i = 0;
    const iv = setInterval(() => {
      post.textContent = LINES[i++] || "";
      if (i > LINES.length) clearInterval(iv);
    }, 260);
  });
})();

/* ── Spotlight: some queries aren't apps ── */
(function spotlightMagic() {
  const input = $("#spotInput");
  if (!input) return;
  const MAGIC = {
    "42": ["The Answer", "To Life, the Universe, and Everything. Deep Thought took 7½ million years."],
    "sudo": ["Permission denied", "Spotlight cannot grant root. The Terminal is more persuadable."],
    "konami": ["↑ ↑ ↓ ↓ ← → ← → B A", "Type it on the desktop, not in here."],
    "hire": ["Yes", "Opening Mail…"],
    "coffee": ["418", "I'm a teapot."],
    "matrix": ["Wake up", "Type `matrix` in the Terminal."],
    "do a barrel roll": ["Peppy says", "The Terminal can do that: `roll`."]
  };
  on(input, "input", () => {
    const q = input.value.trim().toLowerCase();
    const hit = MAGIC[q];
    if (!hit) return;
    achieve("spotlight-magic");
    OS.toast(hit[0], hit[1], "🔦");
    if (q === "hire") setTimeout(() => OS.openApp("contact"), 400);
  });
})();

/* ── the Trash never fills, but it keeps score ── */
(function trashEgg() {
  function hook() {
    const t = document.querySelector('.dock-item[data-open="trash"]');
    if (!t) { setTimeout(hook, 400); return; }
    let n = 0;
    on(t, "click", () => { if (++n === 5) achieve("trash-persistent"); });
  }
  hook();
})();

/* ── played every game in the arcade ── */
(function arcadeRegular() {
  if (!window.MATTGAMES) return;
  const check = () => {
    const all = MATTGAMES.list.filter(g => !g.hidden);
    const played = all.filter(g => {
      try { return localStorage.getItem("mattos-arcade-" + g.id + "-played") === "1"; } catch (e) { return false; }
    });
    if (played.length >= all.length) achieve("arcade-regular");
  };
  /* the arcade marks a game played when its window opens */
  new MutationObserver(m => {
    m.forEach(rec => rec.addedNodes.forEach(n => {
      if (!n.dataset || !n.dataset.app || !n.dataset.app.startsWith("game:")) return;
      try { localStorage.setItem("mattos-arcade-" + n.dataset.app.slice(5) + "-played", "1"); } catch (e) {}
      check();
    }));
  }).observe($("#windowLayer"), { childList: true });
  check();
})();

/* ── the clock: 4:04, and the small hours ── */
(function timeEggs() {
  const check = () => {
    const d = new Date(), h = d.getHours(), m = d.getMinutes();
    if (m === 4 && (h % 12) === 4) {
      if (achieve("four-oh-four")) {
        const c = $("#mbClock");
        if (c) {
          const was = c.textContent;
          c.textContent = "4:04 not found";
          setTimeout(() => { c.textContent = was; }, 6000);
        }
      }
    }
    if (h >= 0 && h < 5) {
      if (achieve("night-owl")) {
        OS.toast("Night owl", "It's " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) +
          ". Dark mode is the least I can do.", "🦉");
        OS.setTheme("dark");
      }
    }
  };
  setTimeout(check, 6000);
  setInterval(check, 30000);
})();

/* ── window shake: macOS grows the pointer, so mattOS does too ── */
(function shakeToFind() {
  let last = 0, dirn = 0, flips = 0, lastT = 0;
  document.addEventListener("pointermove", e => {
    const w = document.querySelector(".win.dragging");
    if (!w) { flips = 0; return; }
    const now = Date.now();
    const d = Math.sign(e.clientX - last);
    if (d && d !== dirn) {
      dirn = d;
      flips = (now - lastT < 420) ? flips + 1 : 1;
      lastT = now;
      if (flips >= 6) {
        flips = 0;
        bigCursor(e.clientX, e.clientY);
      }
    }
    last = e.clientX;
  });
  function bigCursor(x, y) {
    let c = $("#eggCursor");
    if (!c) {
      c = document.createElement("div");
      c.id = "eggCursor";
      c.innerHTML = `<svg viewBox="0 0 24 24" width="120" height="120" fill="#fff" stroke="#0f172a" stroke-width="1.2">
        <path d="M5 2l14 9-6 1.4 3.4 6.6-2.8 1.4L10 14l-5 4z"/></svg>`;
      document.body.appendChild(c);
    }
    c.style.left = x + "px"; c.style.top = y + "px";
    c.classList.add("on");
    document.body.classList.add("egg-big-cursor");
    OS.toast("Found it", "Shaking the pointer makes it huge on a real Mac too.", "🔍");
    const move = ev => { c.style.left = ev.clientX + "px"; c.style.top = ev.clientY + "px"; };
    document.addEventListener("pointermove", move);
    setTimeout(() => {
      c.classList.remove("on");
      document.body.classList.remove("egg-big-cursor");
      document.removeEventListener("pointermove", move);
    }, 2600);
  }
})();

/* ── snow, gravity and the barrel roll, driven from the shell/apps ── */
OS.snow = function (seconds) {
  const host = $("#snow");
  if (!host) return;
  host.classList.add("on");
  const flakes = [];
  for (let i = 0; i < 60; i++) {
    const f = document.createElement("div");
    f.className = "flake";
    f.textContent = ["❄", "❅", "❆", "•"][i % 4];
    f.style.left = Math.random() * 100 + "vw";
    f.style.fontSize = (10 + Math.random() * 16) + "px";
    const dur = 5000 + Math.random() * 6000;
    f.animate([{ transform: "translate(0,-20px) rotate(0deg)" },
               { transform: `translate(${Math.random() * 120 - 60}px,105vh) rotate(${Math.random() * 360}deg)` }],
      { duration: dur, delay: Math.random() * 4000, iterations: Infinity });
    host.appendChild(f); flakes.push(f);
  }
  setTimeout(() => { flakes.forEach(f => f.remove()); host.classList.remove("on"); }, (seconds || 20) * 1000);
};
OS.gravity = function () {
  const wins = [...document.querySelectorAll(".win")];
  if (!wins.length) { OS.toast("Gravity", "Nothing to drop. Open a window first.", "🍎"); return; }
  achieve("sh-gravity");
  wins.forEach((w, i) => {
    const r = w.getBoundingClientRect();
    w.classList.add("falling");
    w.animate([
      { transform: "translate(0,0) rotate(0deg)" },
      { transform: `translate(${(Math.random() * 60 - 30)}px, ${window.innerHeight - r.top - 40}px) rotate(${Math.random() * 24 - 12}deg)` }
    ], { duration: 900 + i * 90, easing: "cubic-bezier(.5,0,.9,.6)", fill: "forwards" });
  });
  setTimeout(() => {
    wins.forEach(w => { w.getAnimations().forEach(a => a.cancel()); w.classList.remove("falling"); });
    OS.toast("Gravity", "Everything back where it was. Newton would be relieved.", "🍎");
  }, 3200);
};
OS.barrelRoll = function () {
  achieve("sh-roll");
  const stage = document.body;
  stage.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: 1400, easing: "cubic-bezier(.5,0,.5,1)" });
};

/* the Weather app asks for snow by name */
const _egg = OS.egg;
OS.egg = function (id, ctx) {
  const first = _egg(id, ctx);
  if (id === "weather-snow") OS.snow(18);
  if (id === "calc-upside" && ctx && ctx.word) {
    OS.toast("Calculator", `Turn the window upside down: <b>${ctx.value}</b> reads <b>${ctx.word}</b>.`, "🙃");
  }
  return first;
};

/* a gentle nudge, once, for anyone who has found nothing yet */
setTimeout(() => {
  if (found.size === 0) {
    OS.toast("Achievements", "mattOS has " + EGGS.length + " things hidden in it. The Achievements app keeps score, and hints.", "🏆");
  }
}, 42000);
})();
