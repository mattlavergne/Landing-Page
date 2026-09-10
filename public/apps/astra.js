/* ASTRA Studio launcher. Opens the full production studio at /music. */
(function () {
"use strict";

MATTAPPS.style("astra", `.as-launch{display:grid;place-items:center;height:100%;padding:28px;text-align:center;background:radial-gradient(circle at 50% 20%,rgba(213,247,130,.10),transparent 42%)}
.as-launch .as-mark{width:84px;height:84px;margin:0 auto 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;align-items:end;padding:14px;border-radius:22px;background:#171c15;border:1px solid #34402c;box-shadow:var(--shadow-sm)}
.as-launch .as-mark i{display:block;background:#d5f782;border-radius:3px;height:42%}.as-launch .as-mark i:nth-child(2){height:72%}.as-launch .as-mark i:nth-child(3){height:100%}.as-launch .as-mark i:nth-child(4){height:58%}.as-launch h1{font-size:24px;margin:0 0 8px}.as-launch p{max-width:360px;color:var(--text-2);line-height:1.5;margin:0 auto 18px}.as-launch .btn{min-width:170px}`);

MATTAPPS.define("astra", {
  body() {
    return `<div class="as-launch">
      <div>
        <div class="as-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <h1>ASTRA Studio</h1>
        <p>Full browser music production studio for beat making, sequencing, arranging, mixing, sample import, MIDI performance and WAV export.</p>
        <button class="btn primary" id="asOpen">Open Studio</button>
      </div>
    </div>`;
  },
  mount(body) {
    const open = () => { window.location.href = "/music"; };
    body.querySelector("#asOpen").addEventListener("click", open);
  }
});
})();
