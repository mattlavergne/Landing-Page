/* ══════════════════════════════════════════════════════════════════
   Achievements — the map of everything hidden in mattOS.

   Locked entries show only a cryptic hint, so the list tells you that
   something is there without telling you what it is.  Unlocked ones
   spell out what you did.  Find them all and mattOS Pro unlocks.

   The registry itself lives in /eggs.js; this window just renders it.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

MATTAPPS.style("achievements", `.ach{display:flex;flex-direction:column;height:100%;min-height:0}
.ach-top{flex:none;display:flex;gap:16px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--hairline)}
.ach-ring{--p:0;width:76px;height:76px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:conic-gradient(var(--accent) calc(var(--p)*1%),var(--bar-track) 0)}
.ach-ring b{width:60px;height:60px;border-radius:50%;background:var(--panel-solid);display:flex;align-items:center;
  justify-content:center;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.ach-topbody{flex:1;min-width:0}
.ach-topbody h2{font-size:17px;font-weight:800;letter-spacing:-.01em}
.ach-count{font-size:13px;color:var(--text-2);margin-top:3px}
.ach-pro{color:#f59e0b;font-weight:800}
.ach-bar{height:6px;border-radius:6px;background:var(--bar-track);margin-top:9px;overflow:hidden}
.ach-bar i{display:block;height:100%;width:0;border-radius:6px;
  background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .6s cubic-bezier(.22,1,.36,1)}
.ach-note{font-size:11.5px;color:var(--text-3);margin-top:8px;line-height:1.5}
.ach-list{flex:1;overflow:auto;padding:8px}
.ach-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px}
.ach-item:hover{background:var(--chip)}
.ach-item.on{background:color-mix(in srgb,var(--good) 10%,transparent)}
.ach-ico{width:32px;height:32px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-size:17px;background:var(--chip)}
.ach-ico.locked{color:var(--text-3);font-weight:800}
.ach-body{flex:1;min-width:0}
.ach-body b{display:block;font-size:13.5px;font-weight:700}
.ach-body i{display:block;font-style:normal;font-size:12px;color:var(--text-3);line-height:1.5;margin-top:1px}
.ach-item.on .ach-body i{color:var(--text-2)}
.ach-tick{color:var(--good);font-weight:800}
.ach-empty{padding:40px;text-align:center;color:var(--text-3);font-size:13px}
.ach-foot{flex:none;display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--hairline);font-size:11.5px}`);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

MATTAPPS.define("achievements", {
  body() {
    return `<div class="ach">
      <div class="ach-top">
        <div class="ach-ring" id="achRing"><b id="achPct">0%</b></div>
        <div class="ach-topbody">
          <h2>Achievements</h2>
          <div class="ach-count" id="achCount">Nothing found yet.</div>
          <div class="ach-bar"><i id="achBar"></i></div>
          <div class="ach-note" id="achNote">Locked entries only show a hint. That is on purpose.</div>
        </div>
      </div>
      <div class="ach-list" id="achList"></div>
      <div class="ach-foot">
        <button class="btn" id="achReset">Reset progress</button>
        <span class="muted" id="achFootNote"></span>
      </div>
    </div>`;
  },
  mount(body, id, node) {
    const eggs = (window.MATTOS && window.MATTOS.eggs) || null;
    const list = body.querySelector("#achList");

    function paint() {
      if (!eggs) {
        list.innerHTML = `<div class="ach-empty">The achievement registry didn't load.</div>`;
        return;
      }
      const all = eggs.list();
      const done = all.filter(a => a.done);
      const pct = Math.round(done.length / all.length * 100);
      body.querySelector("#achPct").textContent = pct + "%";
      body.querySelector("#achBar").style.width = pct + "%";
      body.querySelector("#achRing").style.setProperty("--p", pct);
      body.querySelector("#achCount").innerHTML =
        `<b>${done.length}</b> of <b>${all.length}</b> found` +
        (pct === 100 ? ` · <span class="ach-pro">mattOS Pro unlocked</span>` : "");
      body.querySelector("#achNote").textContent = pct === 100
        ? "Everything. You actually found everything. The gold wallpaper and one more game are yours."
        : "Locked entries only show a hint. That is on purpose.";
      body.querySelector("#achFootNote").textContent =
        done.length ? `Last found: ${done[done.length - 1].name}` : "";

      list.innerHTML = all.map(a => a.done
        ? `<div class="ach-item on">
             <span class="ach-ico">${a.icon || "🏆"}</span>
             <span class="ach-body"><b>${esc(a.name)}</b><i>${esc(a.desc || a.hint)}</i></span>
             <span class="ach-tick">✓</span>
           </div>`
        : `<div class="ach-item">
             <span class="ach-ico locked">?</span>
             <span class="ach-body"><b>Locked</b><i>${esc(a.hint)}</i></span>
           </div>`).join("");
    }

    body.querySelector("#achReset").addEventListener("click", () => {
      if (!eggs) return;
      const btn = body.querySelector("#achReset");
      if (btn.dataset.armed) { eggs.reset(); paint(); btn.textContent = "Reset progress"; delete btn.dataset.armed; return; }
      btn.dataset.armed = "1";
      btn.textContent = "Really reset? Click again";
      setTimeout(() => { if (btn.dataset.armed) { btn.textContent = "Reset progress"; delete btn.dataset.armed; } }, 4000);
    });

    paint();
    if (eggs) node._achOff = eggs.onChange(paint);
  },
  unmount(node) { if (node._achOff) { node._achOff(); node._achOff = null; } }
});
})();
