/* ══════════════════════════════════════════════════════════════════
   Notes — a scratchpad that survives a refresh.

   Notes are kept in localStorage under "mattos-notes", so whatever a
   visitor types is still there next time.  Nothing is ever sent
   anywhere; it is their browser's storage, not mine.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

MATTAPPS.style("notes", `.notes{display:flex;height:100%;min-height:0}
.nt-side{width:172px;flex:none;display:flex;flex-direction:column;border-right:1px solid var(--hairline);
  background:color-mix(in srgb,var(--panel-solid) 24%,transparent)}
.nt-tools{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--hairline)}
.nt-tools button{all:unset;width:28px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;background:var(--chip);font-size:15px;color:var(--text-2)}
.nt-tools button:hover{background:var(--chip-hover);color:var(--text)}
.nt-list{flex:1;overflow:auto;padding:6px}
.nt-item{padding:8px 10px;border-radius:10px;cursor:default}
.nt-item:hover{background:var(--chip)}
.nt-item.on{background:var(--accent-soft)}
.nt-item .t{font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nt-item .d{font-size:10.5px;color:var(--text-3);margin-top:2px}
.nt-main{flex:1;display:flex;flex-direction:column;min-width:0}
.nt-meta{flex:none;padding:8px 16px;font-size:11px;color:var(--text-3);border-bottom:1px solid var(--hairline);text-align:center}
.notes textarea{all:unset;flex:1;padding:16px 18px;font-size:14px;line-height:1.7;color:var(--text);
  overflow:auto;white-space:pre-wrap;font-family:var(--font);user-select:text;-webkit-user-select:text}
@media(max-width:640px){.nt-side{width:124px}}`);

const KEY = "mattos-notes";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const WELCOME = "Welcome to Notes.\n\nAnything you type stays in this browser: no account, no server, no upload.\n\nThe Terminal has a filesystem, by the way. Try `ls -a`.";

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw;
  } catch (e) { /* fall through to the default note */ }
  return [{ t: Date.now(), body: WELCOME }];
}
function save(notes) { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) {} }
const title = n => (n.body.split("\n")[0] || "New note").slice(0, 34) || "New note";
const when = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

MATTAPPS.define("notes", {
  body() {
    return `<div class="notes">
      <div class="nt-side">
        <div class="nt-tools">
          <button class="nt-new" title="New note">+</button>
          <button class="nt-del" title="Delete note">🗑</button>
        </div>
        <div class="nt-list" id="ntList"></div>
      </div>
      <div class="nt-main">
        <div class="nt-meta" id="ntMeta"></div>
        <textarea id="ntBody" spellcheck="true" placeholder="Start typing…"></textarea>
      </div>
    </div>`;
  },
  mount(body) {
    let notes = load(), sel = 0;
    const list = body.querySelector("#ntList");
    const area = body.querySelector("#ntBody");
    const meta = body.querySelector("#ntMeta");

    function paint() {
      list.innerHTML = notes.map((n, i) =>
        `<div class="nt-item${i === sel ? " on" : ""}" data-i="${i}">
           <div class="t">${esc(title(n))}</div>
           <div class="d">${when(n.t)} · ${n.body.trim().split(/\s+/).filter(Boolean).length} words</div>
         </div>`).join("");
      list.querySelectorAll(".nt-item").forEach(el => el.addEventListener("click", () => {
        sel = +el.dataset.i; area.value = notes[sel].body; paint(); area.focus();
      }));
      const n = notes[sel];
      meta.textContent = n ? new Date(n.t).toLocaleString() : "";
    }
    area.value = notes[sel] ? notes[sel].body : "";
    paint();

    let t = null;
    area.addEventListener("input", () => {
      notes[sel].body = area.value;
      notes[sel].t = Date.now();
      clearTimeout(t);
      t = setTimeout(() => { save(notes); paint(); }, 350);
      /* a note that says the magic word */
      const v = area.value.toLowerCase();
      if (window.MATTOS && /\bhire\s+matt\b/.test(v)) window.MATTOS.egg("notes-hire");
    });
    body.querySelector(".nt-new").addEventListener("click", () => {
      notes.unshift({ t: Date.now(), body: "" });
      sel = 0; area.value = ""; save(notes); paint(); area.focus();
    });
    body.querySelector(".nt-del").addEventListener("click", () => {
      notes.splice(sel, 1);
      if (!notes.length) notes = [{ t: Date.now(), body: "" }];
      sel = 0; area.value = notes[0].body; save(notes); paint();
    });
  }
});
})();
