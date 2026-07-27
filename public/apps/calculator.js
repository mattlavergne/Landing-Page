/* ══════════════════════════════════════════════════════════════════
   Calculator — the macOS one, more or less.

   Full keyboard support, a running "tape" of the last few results, and
   the operator key stays lit while it waits for the second operand.

   (Some numbers read as words when the display is upside down.  The
   calculator notices.)
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

MATTAPPS.style("calculator", `.calc{display:flex;flex-direction:column;height:100%;padding:8px 12px 12px;
  background:linear-gradient(180deg,#1b2334,#0b1020);color:#fff}
.calc-tape{height:50px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;
  font-size:11px;line-height:1.5;color:rgba(255,255,255,.32);text-align:right;font-variant-numeric:tabular-nums}
.calc-tape b{color:rgba(255,255,255,.6);font-weight:700}
.calc-out{flex:none;text-align:right;font-size:44px;font-weight:300;padding:4px 4px 14px;
  font-variant-numeric:tabular-nums;letter-spacing:-.02em;overflow:hidden;white-space:nowrap;transition:font-size .1s}
.calc-pad{flex:1;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:8px}
.ckey{all:unset;display:flex;align-items:center;justify-content:center;border-radius:999px;cursor:pointer;
  font-size:19px;font-weight:600;background:rgba(255,255,255,.15);color:#fff;
  -webkit-tap-highlight-color:transparent;transition:filter .1s,background .1s,color .1s}
.ckey:hover{filter:brightness(1.2)}
.ckey.hit{filter:brightness(1.6)}
.ckey.fn{background:rgba(255,255,255,.62);color:#0f172a}
.ckey.op,.ckey.eq{background:#fb923c}
.ckey.op.live{background:#fff;color:#fb923c}
.ckey.zero{grid-column:span 2;justify-content:flex-start;padding-left:30px}`);

const KEYS = [
  ["AC", "ac", "fn"], ["±", "neg", "fn"], ["%", "pct", "fn"], ["÷", "/", "op"],
  ["7", "7"], ["8", "8"], ["9", "9"], ["×", "*", "op"],
  ["4", "4"], ["5", "5"], ["6", "6"], ["−", "-", "op"],
  ["1", "1"], ["2", "2"], ["3", "3"], ["+", "+", "op"],
  ["0", "0", "zero"], [".", "."], ["=", "=", "eq"]
];

/* what the display spells when you turn the window upside down */
const UPSIDE = {
  "07734": "hELLO", "7734": "hELL0", "5537": "LESS", "3704": "hOLE",
  "35007": "LOOSE", "376616": "919LE", "0.7734": "hELLO",
  "58008": "BOOBS", "1134": "hELL", "618": "BIG", "710": "OIL", "77345": "ShELL"
};

const fmt = n => {
  if (!isFinite(n)) return "Error";
  const s = Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-6 && n !== 0)
    ? n.toExponential(6).replace("e+", "e")
    : String(Math.round(n * 1e10) / 1e10);
  return s.length > 12 ? String(+n.toPrecision(10)) : s;
};

MATTAPPS.define("calculator", {
  body() {
    const keys = KEYS.map(([label, k, cls]) =>
      `<button class="ckey ${cls || ""}" data-k="${k}">${label}</button>`).join("");
    return `<div class="calc">
      <div class="calc-tape" id="calcTape"></div>
      <div class="calc-out" id="calcOut">0</div>
      <div class="calc-pad">${keys}</div>
    </div>`;
  },
  mount(body, id, node) {
    const out = body.querySelector("#calcOut");
    const tapeEl = body.querySelector("#calcTape");
    let cur = "0", prev = null, op = null, fresh = true, tape = [];

    const show = () => {
      out.textContent = cur;
      out.style.fontSize = cur.length > 9 ? "30px" : cur.length > 7 ? "36px" : "44px";
      const word = UPSIDE[cur.replace(/^-/, "")];
      if (word && window.MATTOS) window.MATTOS.egg("calc-upside", { word, value: cur });
    };
    const paintOp = () => body.querySelectorAll(".ckey.op").forEach(b =>
      b.classList.toggle("live", op !== null && b.dataset.k === op && fresh));
    const pushTape = line => {
      tape.push(line);
      if (tape.length > 4) tape.shift();
      tapeEl.innerHTML = tape.map(t => `<div>${t}</div>`).join("");
    };

    function digit(d) {
      if (fresh) { cur = d === "." ? "0." : d; fresh = false; }
      else if (d === ".") { if (!cur.includes(".")) cur += "."; }
      else cur = cur === "0" ? d : cur + d;
      if (cur.replace("-", "").replace(".", "").length > 12) cur = cur.slice(0, 13);
      show(); paintOp();
    }
    function apply() {
      const a = parseFloat(prev), b = parseFloat(cur);
      const r = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
      pushTape(`${fmt(a)} ${op === "*" ? "×" : op === "/" ? "÷" : op} ${fmt(b)} = <b>${fmt(r)}</b>`);
      return fmt(r);
    }
    function setOp(k) {
      if (op !== null && !fresh) { cur = apply(); show(); }
      prev = cur; op = k; fresh = true; paintOp();
    }
    function equals() {
      if (op === null || prev === null) return;
      cur = apply(); prev = null; op = null; fresh = true;
      show(); paintOp();
      if (cur === "42" && window.MATTOS) window.MATTOS.egg("calc-42");
    }
    function press(k) {
      if (/^[0-9.]$/.test(k)) return digit(k);
      if (k === "ac") { cur = "0"; prev = null; op = null; fresh = true; tape = []; tapeEl.innerHTML = ""; show(); paintOp(); return; }
      if (k === "neg") { cur = cur.startsWith("-") ? cur.slice(1) : (cur === "0" ? cur : "-" + cur); show(); return; }
      if (k === "pct") { cur = fmt(parseFloat(cur) / 100); fresh = true; show(); return; }
      if (k === "=") return equals();
      if ("+-*/".includes(k)) return setOp(k);
    }

    body.querySelectorAll(".ckey").forEach(b => {
      b.addEventListener("click", () => {
        press(b.dataset.k);
        b.classList.add("hit");
        setTimeout(() => b.classList.remove("hit"), 110);
      });
    });

    /* keyboard: works whenever this window is focused */
    const KEYMAP = { Enter: "=", "=": "=", Escape: "ac", c: "ac", Backspace: "bs", "%": "pct", x: "*" };
    const onKey = e => {
      if (!node.classList.contains("active")) return;
      const k = KEYMAP[e.key] || e.key;
      if (k === "bs") { cur = cur.length > 1 ? cur.slice(0, -1) : "0"; if (cur === "-") cur = "0"; show(); e.preventDefault(); return; }
      if (/^[0-9.]$/.test(k) || "+-*/=".includes(k) || k === "ac" || k === "pct") {
        e.preventDefault();
        press(k);
        const btn = body.querySelector(`.ckey[data-k="${k === "=" ? "=" : k}"]`);
        if (btn) { btn.classList.add("hit"); setTimeout(() => btn.classList.remove("hit"), 110); }
      }
    };
    document.addEventListener("keydown", onKey);
    node._calcKey = onKey;
    show();
  },
  unmount(node) { if (node._calcKey) { document.removeEventListener("keydown", node._calcKey); node._calcKey = null; } }
});
})();
