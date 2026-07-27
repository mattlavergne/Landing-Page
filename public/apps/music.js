/* ══════════════════════════════════════════════════════════════════
   Music — four chiptunes, synthesized live.

   There are no audio files anywhere on this site.  Every note is a
   WebAudio oscillator, sequenced from the little note strings below,
   so the whole "album" costs a couple of kilobytes.

   One track is not in the list.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

MATTAPPS.style("music", `.mu{display:flex;flex-direction:column;height:100%;min-height:0}
.mu-head{flex:none;display:flex;gap:14px;padding:16px 18px;border-bottom:1px solid var(--hairline)}
.mu-art{width:92px;height:92px;flex:none;border-radius:14px;display:flex;align-items:flex-end;justify-content:center;
  gap:4px;padding:12px;background:linear-gradient(150deg,#fb7185,#7c3aed);box-shadow:var(--shadow-sm)}
.mu-art span{width:7px;height:20%;background:rgba(255,255,255,.85);border-radius:3px;transition:height .12s ease}
.mu-art.live span{box-shadow:0 0 10px rgba(255,255,255,.7)}
.mu-title{font-size:17px;font-weight:800;letter-spacing:-.01em}
.mu-sub{font-size:12px;color:var(--text-3);margin-top:2px;line-height:1.5}
.mu-ctl{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
.mu-ctl .btn{padding:7px 13px;font-size:13px}
.mu-ctl input[type=range]{flex:1;min-width:80px;accent-color:var(--accent)}
.mu-list{flex:1;overflow:auto;padding:6px}
.mu-row{display:grid;grid-template-columns:22px 16px 1fr auto;align-items:center;gap:10px;
  padding:9px 12px;border-radius:10px;cursor:pointer;font-size:13px}
.mu-row:hover{background:var(--chip)}
.mu-row.on{background:var(--accent-soft)}
.mu-num{color:var(--text-3);font-family:var(--mono);font-size:11px}
.mu-play{width:0;height:0;border-left:9px solid var(--text-3);border-top:6px solid transparent;border-bottom:6px solid transparent}
.mu-row.on .mu-play{border-left-color:var(--accent)}
.mu-body b{display:block;font-weight:700}
.mu-body i{display:block;font-style:normal;font-size:11.5px;color:var(--text-3)}
.mu-len{font-size:11px;color:var(--text-3);font-family:var(--mono)}
.mu-row.secret{background:linear-gradient(90deg,color-mix(in srgb,#fbbf24 22%,transparent),transparent)}
.mu-foot{flex:none;padding:9px 16px;border-top:1px solid var(--hairline);font-size:11px;color:var(--text-3);text-align:center}`);

/* note name → frequency */
const SEMI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
function freq(n) {
  if (!n || n === "-") return 0;
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) return 0;
  return 440 * Math.pow(2, (SEMI[m[1]] + (+m[2] - 4) * 12 - 9) / 12);
}
const seq = s => s.trim().split(/\s+/);

const TRACKS = [
  {
    id: "boot", name: "Cold Boot", note: "The sound of mattOS waking up",
    bpm: 132, wave: "square",
    lead: seq(`C4 - E4 - G4 - C5 - G4 - E4 - C4 - D4 - F4 - A4 - D5 - A4 - F4 - D4 -
               E4 - G4 - B4 - E5 - B4 - G4 - E4 - F4 - A4 - C5 - F5 - C5 - A4 - F4 -`),
    bass: seq(`C2 - C2 - G2 - G2 - D2 - D2 - A2 - A2 - E2 - E2 - B2 - B2 - F2 - F2 - C3 - C3 -`)
  },
  {
    id: "flow", name: "47 Flows", note: "One bar per flow, roughly",
    bpm: 148, wave: "triangle",
    lead: seq(`A4 C5 E5 C5 A4 C5 E5 G5 F4 A4 C5 A4 F4 A4 C5 E5
               G4 B4 D5 B4 G4 B4 D5 F5 E4 G4 B4 G4 E4 G4 B4 D5`),
    bass: seq(`A2 - E2 - A2 - E2 - F2 - C3 - F2 - C3 - G2 - D3 - G2 - D3 - E2 - B2 - E2 - B2 -`)
  },
  {
    id: "bayou", name: "Bayou Drive", note: "Lafayette at 70 mph",
    bpm: 116, wave: "sawtooth",
    lead: seq(`D4 F4 A4 - D5 A4 F4 - C4 E4 G4 - C5 G4 E4 -
               A#3 D4 F4 - A#4 F4 D4 - A3 C#4 E4 - A4 E4 C#4 -`),
    bass: seq(`D2 - - - A2 - - - C2 - - - G2 - - - A#1 - - - F2 - - - A1 - - - E2 - - -`)
  },
  {
    id: "night", name: "Night Shift", note: "For the 2am deploys",
    bpm: 96, wave: "sine",
    lead: seq(`E4 - G4 - B4 - A4 - G4 - E4 - D4 - E4 -
               C4 - E4 - G4 - F4 - E4 - C4 - B3 - C4 -`),
    bass: seq(`E2 - - - C2 - - - A1 - - - B1 - - -`)
  },
  {
    /* not listed in the UI: the Konami code unlocks it */
    id: "konami", name: "↑↑↓↓←→←→BA", note: "You typed the thing", secret: true,
    bpm: 168, wave: "square",
    lead: seq(`E5 E5 - E5 - C5 E5 - G5 - - - G4 - - -
               C5 - - G4 - - E4 - - A4 - B4 - A#4 A4 -`),
    bass: seq(`C3 - G2 - C3 - G2 - A2 - E2 - A2 - E2 -`)
  }
];

MATTAPPS.define("music", {
  body() {
    const rows = TRACKS.filter(t => !t.secret).map((t, i) =>
      `<div class="mu-row" data-t="${t.id}">
         <span class="mu-num">${i + 1}</span>
         <span class="mu-play"></span>
         <span class="mu-body"><b>${t.name}</b><i>${t.note}</i></span>
         <span class="mu-len">${Math.round(t.lead.length * 60 / t.bpm / 2)}s</span>
       </div>`).join("");
    return `<div class="mu">
      <div class="mu-head">
        <div class="mu-art" id="muArt"><span></span><span></span><span></span><span></span><span></span></div>
        <div>
          <div class="mu-title" id="muTitle">mattOS Sounds</div>
          <div class="mu-sub" id="muSub">Nothing playing · every note is synthesized in the browser</div>
          <div class="mu-ctl">
            <button class="btn" id="muPrev">‹‹</button>
            <button class="btn primary" id="muGo">Play</button>
            <button class="btn" id="muNext">››</button>
            <input type="range" id="muVol" min="0" max="100" value="35" aria-label="Volume">
          </div>
        </div>
      </div>
      <div class="mu-list">${rows}</div>
      <div class="mu-foot">No audio files: four oscillators and a little sequencer.</div>
    </div>`;
  },
  mount(body, id, node) {
    const q = s => body.querySelector(s);
    let ctx = null, timer = 0, step = 0, playing = false, track = TRACKS[0], vol = 0.35;

    function ensure() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    function blip(f, dur, type, gain) {
      if (!f) return;
      const C = ensure();
      const o = C.createOscillator(), g = C.createGain();
      o.type = type; o.frequency.setValueAtTime(f, C.currentTime);
      g.gain.setValueAtTime(0.0001, C.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), C.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, C.currentTime + dur);
      o.connect(g); g.connect(C.destination);
      o.start(); o.stop(C.currentTime + dur + 0.02);
    }
    function paint() {
      body.querySelectorAll(".mu-row").forEach(r => r.classList.toggle("on", r.dataset.t === track.id && playing));
      q("#muTitle").textContent = playing ? track.name : "mattOS Sounds";
      q("#muSub").textContent = playing
        ? track.note + " · " + track.bpm + " bpm"
        : "Nothing playing · every note is synthesized in the browser";
      q("#muGo").textContent = playing ? "Pause" : "Play";
      q("#muArt").classList.toggle("live", playing);
    }
    function tick() {
      const beat = 60000 / track.bpm / 2;
      const lead = track.lead[step % track.lead.length];
      const bass = track.bass[step % track.bass.length];
      blip(freq(lead), beat / 1000 * 0.9, track.wave, 0.16);
      if (step % 2 === 0) blip(freq(bass) / 2, beat / 1000 * 1.6, "triangle", 0.13);
      const bars = q("#muArt").children;
      for (let i = 0; i < bars.length; i++) bars[i].style.height = (18 + Math.random() * 46) + "%";
      step++;
    }
    function play(t) {
      if (t) { track = t; step = 0; }
      ensure();
      playing = true;
      clearInterval(timer);
      timer = setInterval(tick, 60000 / track.bpm / 2);
      tick();
      paint();
      if (window.MATTOS) window.MATTOS.egg("music-play");
    }
    function stop() { playing = false; clearInterval(timer); paint(); }

    q("#muGo").addEventListener("click", () => playing ? stop() : play());
    q("#muVol").addEventListener("input", e => { vol = +e.target.value / 100; });
    const move = d => {
      const pool = TRACKS.filter(t => !t.secret || t.id === track.id);
      const i = pool.indexOf(track);
      play(pool[(i + d + pool.length) % pool.length]);
    };
    q("#muNext").addEventListener("click", () => move(1));
    q("#muPrev").addEventListener("click", () => move(-1));
    body.querySelectorAll(".mu-row").forEach(r => r.addEventListener("click", () => {
      play(TRACKS.find(t => t.id === r.dataset.t));
    }));

    /* the desktop can ask for the hidden track by name */
    node._musicPlay = tid => {
      const t = TRACKS.find(x => x.id === tid);
      if (!t) return;
      if (t.secret && !body.querySelector('[data-t="' + t.id + '"]')) {
        const row = document.createElement("div");
        row.className = "mu-row secret";
        row.dataset.t = t.id;
        row.innerHTML = `<span class="mu-num">★</span><span class="mu-play"></span>
          <span class="mu-body"><b>${t.name}</b><i>${t.note}</i></span><span class="mu-len">bonus</span>`;
        row.addEventListener("click", () => play(t));
        body.querySelector(".mu-list").appendChild(row);
      }
      play(t);
    };
    node._musicStop = stop;
    paint();
  },
  unmount(node) { if (node._musicStop) { node._musicStop(); node._musicStop = null; } }
});
})();
