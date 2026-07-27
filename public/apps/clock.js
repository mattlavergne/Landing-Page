/* ══════════════════════════════════════════════════════════════════
   Clock — world clock, stopwatch and timer, in one window.

   The world clock draws real analogue faces for a handful of cities;
   the stopwatch keeps laps; the timer counts down and rings (a short
   synthesized chime, no audio files).
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

MATTAPPS.style("clock", `.clockapp{display:flex;flex-direction:column;height:100%;padding:12px 14px 16px;gap:12px}
.ck-tabs{flex:none;display:flex;background:var(--chip);border-radius:11px;padding:3px}
.ck-tabs button{all:unset;flex:1;text-align:center;padding:7px 0;border-radius:9px;cursor:pointer;
  font-size:12.5px;font-weight:700;color:var(--text-2)}
.ck-tabs button.on{background:var(--panel-solid);color:var(--text);box-shadow:var(--shadow-sm)}
.ck-pane{display:none;flex:1;min-height:0;flex-direction:column;gap:12px}
.ck-pane.on{display:flex}
.ck-zones{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;overflow:auto;padding:4px}
.ck-zone{display:flex;flex-direction:column;align-items:center;gap:5px}
.ck-zone .face{width:88px;height:88px}
.ck-zone .dial{fill:var(--panel-solid);stroke:var(--hairline);stroke-width:2}
.ck-zone.home .dial{stroke:var(--accent);stroke-width:2.5}
.ck-zone .tick{stroke:var(--text-3);stroke-width:2.5;stroke-linecap:round}
.ck-zone .hh,.ck-zone .mh{stroke:var(--text);stroke-width:4;stroke-linecap:round}
.ck-zone .mh{stroke-width:3}
.ck-zone .sh{stroke:var(--accent);stroke-width:1.6;stroke-linecap:round}
.ck-zone .pin{fill:var(--accent)}
.ck-city{font-size:12.5px;font-weight:700}
.ck-digital{font-family:var(--mono);font-size:11.5px;color:var(--text-3)}
.ck-big{font-size:46px;font-weight:200;text-align:center;font-variant-numeric:tabular-nums;letter-spacing:-.02em;padding:14px 0 4px}
.ck-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.ck-laps{flex:1;overflow:auto;margin-top:6px;font-size:12.5px}
.ck-laps div{display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--hairline)}
.ck-laps b{font-family:var(--mono)}
.ck-note{font-size:11.5px;color:var(--text-3);text-align:center;margin-top:auto;line-height:1.6}`);

const ZONES = [
  { city: "Lafayette", tz: "America/Chicago", home: true },
  { city: "New York", tz: "America/New_York" },
  { city: "London", tz: "Europe/London" },
  { city: "Tokyo", tz: "Asia/Tokyo" }
];
const pad = n => String(n).padStart(2, "0");

function partsIn(tz, d) {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short"
    }).formatToParts(d);
    const g = t => (f.find(p => p.type === t) || {}).value;
    return { h: +g("hour") % 24, m: +g("minute"), s: +g("second"), day: g("weekday") };
  } catch (e) {
    return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), day: "" };
  }
}

function chime() {
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320, 1760].forEach((f, i) => {
      const o = C.createOscillator(), g = C.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, C.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.12, C.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, C.currentTime + i * 0.18 + 0.5);
      o.connect(g); g.connect(C.destination);
      o.start(C.currentTime + i * 0.18); o.stop(C.currentTime + i * 0.18 + 0.6);
    });
  } catch (e) { /* no audio, no chime */ }
}

MATTAPPS.define("clock", {
  body() {
    return `<div class="clockapp">
      <div class="ck-tabs">
        <button class="on" data-tab="world">World</button>
        <button data-tab="stop">Stopwatch</button>
        <button data-tab="timer">Timer</button>
      </div>
      <div class="ck-pane on" data-pane="world"><div class="ck-zones" id="ckZones"></div></div>
      <div class="ck-pane" data-pane="stop">
        <div class="ck-big" id="swTime">00:00.00</div>
        <div class="ck-row">
          <button class="btn primary" id="swGo">Start</button>
          <button class="btn" id="swLap">Lap</button>
          <button class="btn" id="swZero">Reset</button>
        </div>
        <div class="ck-laps" id="swLaps"></div>
      </div>
      <div class="ck-pane" data-pane="timer">
        <div class="ck-big" id="tmTime">05:00</div>
        <div class="ck-row" id="tmPresets">
          <button class="btn" data-min="1">1 min</button>
          <button class="btn" data-min="5">5 min</button>
          <button class="btn" data-min="10">10 min</button>
          <button class="btn" data-min="25">25 min</button>
        </div>
        <div class="ck-row">
          <button class="btn primary" id="tmGo">Start</button>
          <button class="btn" id="tmZero">Reset</button>
        </div>
        <div class="ck-note" id="tmNote">25 minutes is one pomodoro. Ask me how many of those a 47-flow build takes.</div>
      </div>
    </div>`;
  },
  mount(body, id, node) {
    const q = s => body.querySelector(s);
    body.querySelectorAll(".ck-tabs button").forEach(b => b.addEventListener("click", () => {
      body.querySelectorAll(".ck-tabs button").forEach(x => x.classList.toggle("on", x === b));
      body.querySelectorAll(".ck-pane").forEach(p => p.classList.toggle("on", p.dataset.pane === b.dataset.tab));
    }));

    /* ── world clock ── */
    const zonesEl = q("#ckZones");
    zonesEl.innerHTML = ZONES.map((z, i) => `
      <div class="ck-zone${z.home ? " home" : ""}">
        <svg viewBox="0 0 100 100" class="face" data-face="${i}">
          <circle cx="50" cy="50" r="44" class="dial"/>
          ${[...Array(12)].map((_, t) => {
            const a = t * 30 * Math.PI / 180;
            return `<line x1="${50 + Math.sin(a) * 37}" y1="${50 - Math.cos(a) * 37}"
                          x2="${50 + Math.sin(a) * 42}" y2="${50 - Math.cos(a) * 42}" class="tick"/>`;
          }).join("")}
          <line class="hh" x1="50" y1="50" x2="50" y2="26"/>
          <line class="mh" x1="50" y1="50" x2="50" y2="16"/>
          <line class="sh" x1="50" y1="56" x2="50" y2="14"/>
          <circle cx="50" cy="50" r="3.5" class="pin"/>
        </svg>
        <div class="ck-city">${z.city}</div>
        <div class="ck-digital" data-dig="${i}">--:--</div>
      </div>`).join("");

    function tick() {
      const now = new Date();
      ZONES.forEach((z, i) => {
        const p = partsIn(z.tz, now);
        const face = zonesEl.querySelector(`[data-face="${i}"]`);
        const set = (sel, deg) => {
          const el = face.querySelector(sel);
          if (el) el.setAttribute("transform", `rotate(${deg} 50 50)`);
        };
        set(".hh", (p.h % 12) * 30 + p.m * 0.5);
        set(".mh", p.m * 6 + p.s * 0.1);
        set(".sh", p.s * 6);
        const d = zonesEl.querySelector(`[data-dig="${i}"]`);
        if (d) d.textContent = `${p.day} ${pad(p.h)}:${pad(p.m)}`;
      });
    }
    tick();
    const iv = setInterval(tick, 1000);

    /* ── stopwatch ── */
    let swT = 0, swRun = false, swLast = 0, laps = [], raf = 0;
    const swFmt = ms => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(Math.floor(ms / 10) % 100)}`;
    function swFrame(t) {
      if (!swRun) return;
      if (swLast) swT += t - swLast;
      swLast = t;
      q("#swTime").textContent = swFmt(swT);
      raf = requestAnimationFrame(swFrame);
    }
    q("#swGo").addEventListener("click", () => {
      swRun = !swRun; swLast = 0;
      q("#swGo").textContent = swRun ? "Stop" : "Start";
      q("#swGo").classList.toggle("primary", !swRun);
      if (swRun) raf = requestAnimationFrame(swFrame);
      if (!swRun && swT > 0 && window.MATTOS) window.MATTOS.egg("stopwatch");
    });
    q("#swLap").addEventListener("click", () => {
      if (!swT) return;
      laps.unshift(swT);
      q("#swLaps").innerHTML = laps.map((l, i) =>
        `<div><span>Lap ${laps.length - i}</span><b>${swFmt(l - (laps[i + 1] || 0))}</b></div>`).join("");
    });
    q("#swZero").addEventListener("click", () => {
      swRun = false; swT = 0; swLast = 0; laps = [];
      q("#swGo").textContent = "Start"; q("#swGo").classList.add("primary");
      q("#swTime").textContent = "00:00.00"; q("#swLaps").innerHTML = "";
    });

    /* ── timer ── */
    let tmLeft = 300, tmRun = false, tmIv = 0;
    const tmPaint = () => { q("#tmTime").textContent = `${pad(Math.floor(tmLeft / 60))}:${pad(tmLeft % 60)}`; };
    body.querySelectorAll("#tmPresets .btn").forEach(b => b.addEventListener("click", () => {
      tmLeft = +b.dataset.min * 60; tmPaint();
    }));
    q("#tmGo").addEventListener("click", () => {
      tmRun = !tmRun;
      q("#tmGo").textContent = tmRun ? "Pause" : "Start";
      clearInterval(tmIv);
      if (tmRun) tmIv = setInterval(() => {
        if (tmLeft > 0) tmLeft--;
        tmPaint();
        if (tmLeft === 0) {
          clearInterval(tmIv); tmRun = false;
          q("#tmGo").textContent = "Start";
          chime();
          if (window.MATTOS) window.MATTOS.toast("Timer", "Time's up.", MATTAPPS.icons.clock);
        }
      }, 1000);
    });
    q("#tmZero").addEventListener("click", () => {
      clearInterval(tmIv); tmRun = false; tmLeft = 300;
      q("#tmGo").textContent = "Start"; tmPaint();
    });
    tmPaint();

    node._clockStop = () => { clearInterval(iv); clearInterval(tmIv); swRun = false; cancelAnimationFrame(raf); };
  },
  unmount(node) { if (node._clockStop) { node._clockStop(); node._clockStop = null; } }
});
})();
