/* ══════════════════════════════════════════════════════════════════
   Sketch — a small paint app.

   Pressure-free but pointer-friendly: mouse, trackpad, finger and
   stylus all draw.  Brush, eraser, colours, undo, clear, and a real
   PNG export.  The canvas keeps its bitmap when the window resizes.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

MATTAPPS.style("sketch", `.sk{display:flex;flex-direction:column;height:100%;min-height:0}
.sk-bar{flex:none;display:flex;align-items:center;gap:10px;padding:8px 12px;flex-wrap:wrap;
  border-bottom:1px solid var(--hairline)}
.sk-colors{display:flex;gap:5px}
.sk-col{all:unset;width:20px;height:20px;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(15,23,42,.18)}
.sk-col.on{box-shadow:0 0 0 2px var(--panel-solid),0 0 0 4px var(--accent)}
.sk-sizes{display:flex;gap:3px;background:var(--chip);border-radius:9px;padding:2px}
.sk-size{all:unset;width:26px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.sk-size i{display:block;border-radius:50%;background:var(--text-2)}
.sk-size.on{background:var(--panel-solid);box-shadow:var(--shadow-sm)}
.sk-tool{all:unset;padding:6px 11px;border-radius:9px;cursor:pointer;font-size:12px;font-weight:700;
  background:var(--chip);color:var(--text-2)}
.sk-tool:hover{background:var(--chip-hover);color:var(--text)}
.sk-tool.on{background:var(--accent);color:#fff}
.sk-sp{flex:1}
.sk-stage{flex:1;min-height:0;position:relative;background:#f8fafc}
.sk-stage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}`);

const COLORS = ["#0f172a", "#ffffff", "#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];
const SIZES = [2, 5, 10, 20];

MATTAPPS.define("sketch", {
  body() {
    return `<div class="sk">
      <div class="sk-bar">
        <div class="sk-colors">${COLORS.map((c, i) =>
      `<button class="sk-col${i === 0 ? " on" : ""}" data-c="${c}" style="background:${c}" aria-label="colour ${i + 1}"></button>`).join("")}</div>
        <div class="sk-sizes">${SIZES.map((s, i) =>
      `<button class="sk-size${i === 1 ? " on" : ""}" data-s="${s}"><i style="width:${s + 2}px;height:${s + 2}px"></i></button>`).join("")}</div>
        <button class="sk-tool" data-tool="erase" title="Eraser">Eraser</button>
        <div class="sk-sp"></div>
        <button class="sk-tool" data-act="undo" title="Undo (⌘Z)">Undo</button>
        <button class="sk-tool" data-act="clear">Clear</button>
        <button class="sk-tool" data-act="save">Save PNG</button>
      </div>
      <div class="sk-stage"><canvas></canvas></div>
    </div>`;
  },
  mount(body, id, node) {
    const stage = body.querySelector(".sk-stage");
    const cv = body.querySelector("canvas");
    const ctx = cv.getContext("2d");
    let color = COLORS[0], size = SIZES[1], erasing = false, drawing = false, strokes = 0;
    const undo = [];

    function fit() {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const keep = cv.width ? ctx.getImageData(0, 0, cv.width, cv.height) : null;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, cv.width, cv.height);
      if (keep) ctx.putImageData(keep, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
    }
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    fit();

    const at = e => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    function snapshot() {
      undo.push(cv.toDataURL());
      if (undo.length > 12) undo.shift();
    }
    cv.addEventListener("pointerdown", e => {
      e.preventDefault();
      snapshot();
      drawing = true;
      cv.setPointerCapture(e.pointerId);
      const p = at(e);
      ctx.strokeStyle = erasing ? "#f8fafc" : color;
      ctx.lineWidth = erasing ? size * 2.4 : size;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y); ctx.stroke();
    });
    cv.addEventListener("pointermove", e => {
      if (!drawing) return;
      const p = at(e);
      ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    const stop = () => {
      if (!drawing) return;
      drawing = false; strokes++;
      if (strokes === 25 && window.MATTOS) window.MATTOS.egg("sketch-artist");
    };
    cv.addEventListener("pointerup", stop);
    cv.addEventListener("pointercancel", stop);
    cv.addEventListener("pointerleave", stop);

    body.querySelectorAll(".sk-col").forEach(b => b.addEventListener("click", () => {
      color = b.dataset.c; erasing = false;
      body.querySelectorAll(".sk-col").forEach(x => x.classList.toggle("on", x === b));
      body.querySelector('[data-tool="erase"]').classList.remove("on");
    }));
    body.querySelectorAll(".sk-size").forEach(b => b.addEventListener("click", () => {
      size = +b.dataset.s;
      body.querySelectorAll(".sk-size").forEach(x => x.classList.toggle("on", x === b));
    }));
    body.querySelector('[data-tool="erase"]').addEventListener("click", e => {
      erasing = !erasing;
      e.currentTarget.classList.toggle("on", erasing);
    });
    body.querySelector('[data-act="clear"]').addEventListener("click", () => {
      snapshot();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
    });
    function undoOne() {
      const d = undo.pop();
      if (!d) return;
      const img = new Image();
      img.onload = () => {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      };
      img.src = d;
    }
    body.querySelector('[data-act="undo"]').addEventListener("click", undoOne);
    body.querySelector('[data-act="save"]').addEventListener("click", () => {
      const a = document.createElement("a");
      a.download = "sketch.png";
      a.href = cv.toDataURL("image/png");
      a.click();
    });
    const onKey = e => {
      if (!node.classList.contains("active")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoOne(); }
    };
    document.addEventListener("keydown", onKey);
    node._skKey = onKey;
    node._skRo = ro;
  },
  unmount(node) {
    if (node._skKey) { document.removeEventListener("keydown", node._skKey); node._skKey = null; }
    if (node._skRo) { node._skRo.disconnect(); node._skRo = null; }
  }
});
})();
