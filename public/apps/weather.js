/* ══════════════════════════════════════════════════════════════════
   Weather — real conditions for Lafayette, Louisiana.

   Data comes from Open-Meteo (no key, no account, CORS-friendly).  If
   the request fails — offline, blocked, whatever — the app says so
   plainly instead of pretending, and offers a retry.

   Tapping the big weather glyph a few times does something.
════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

MATTAPPS.style("weather", `.wx{display:flex;flex-direction:column;height:100%;padding:16px 18px 18px;gap:14px}
.wx-load,.wx-err{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  font-size:13px;color:var(--text-3);text-align:center}
.wx-err b{font-size:14px;color:var(--text)}
.wx-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--chip);border-top-color:var(--accent);
  animation:wx-spin .7s linear infinite}
@keyframes wx-spin{to{transform:rotate(360deg)}}
.wx-main{display:flex;flex-direction:column;gap:14px;flex:1;min-height:0}
.wx-now{display:flex;align-items:center;gap:14px}
.wx-glyph{cursor:pointer;transition:transform .25s cubic-bezier(.34,1.3,.64,1);flex:none;
  filter:drop-shadow(0 6px 14px rgba(15,23,42,.22))}
.wx-temp{font-size:52px;font-weight:250;letter-spacing:-.03em;line-height:1}
.wx-cond{font-size:14px;font-weight:600;margin-top:2px}
.wx-place{font-size:12px;color:var(--text-3)}
.wx-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.wx-cell{display:flex;justify-content:space-between;align-items:baseline;padding:9px 12px;border-radius:12px;
  background:var(--chip);border:1px solid var(--panel-border);font-size:12.5px}
.wx-cell span{color:var(--text-3)}
.wx-cell b{font-size:14px}
.wx-days{display:flex;flex-direction:column;gap:2px}
.wx-day{display:grid;grid-template-columns:1fr 30px 42px 42px;align-items:center;padding:6px 8px;
  border-radius:9px;font-size:12.5px}
.wx-day:hover{background:var(--chip)}
.wx-day svg{justify-self:center}
.wx-day b{text-align:right;font-weight:700}
.wx-day i{text-align:right;font-style:normal;color:var(--text-3)}
.wx-foot{font-size:11px;color:var(--text-3);text-align:center;margin-top:auto}
.wx-foot a{color:var(--accent)}`);

const LAT = 30.2241, LON = -92.0198;
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit" +
  "&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FChicago&forecast_days=5";

/* WMO weather codes → a label and a glyph */
const CODES = {
  0: ["Clear", "sun"], 1: ["Mainly clear", "sun"], 2: ["Partly cloudy", "partly"], 3: ["Overcast", "cloud"],
  45: ["Fog", "fog"], 48: ["Freezing fog", "fog"],
  51: ["Light drizzle", "rain"], 53: ["Drizzle", "rain"], 55: ["Heavy drizzle", "rain"],
  61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "rain"], 67: ["Freezing rain", "rain"],
  71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow grains", "snow"],
  80: ["Showers", "rain"], 81: ["Showers", "rain"], 82: ["Violent showers", "rain"],
  85: ["Snow showers", "snow"], 86: ["Snow showers", "snow"],
  95: ["Thunderstorm", "storm"], 96: ["Thunderstorm, hail", "storm"], 99: ["Thunderstorm, hail", "storm"]
};
const GLYPH = {
  sun: `<circle cx="50" cy="50" r="19" fill="#fde047"/>${[...Array(8)].map((_, i) => {
    const a = i * Math.PI / 4;
    return `<line x1="${50 + Math.cos(a) * 26}" y1="${50 + Math.sin(a) * 26}" x2="${50 + Math.cos(a) * 34}" y2="${50 + Math.sin(a) * 34}" stroke="#fde047" stroke-width="5" stroke-linecap="round"/>`;
  }).join("")}`,
  partly: `<circle cx="38" cy="40" r="15" fill="#fde047"/><path d="M32 72a13 13 0 0 1 1-26 17 17 0 0 1 32 4 11 11 0 0 1-2 22z" fill="#e2e8f0"/>`,
  cloud: `<path d="M30 70a14 14 0 0 1 1-28 18 18 0 0 1 34 4 12 12 0 0 1-2 24z" fill="#cbd5e1"/>`,
  fog: `<path d="M30 62a14 14 0 0 1 1-28 18 18 0 0 1 34 4 12 12 0 0 1-2 24z" fill="#cbd5e1"/><path d="M26 74h48M32 84h36" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/>`,
  rain: `<path d="M30 60a14 14 0 0 1 1-28 18 18 0 0 1 34 4 12 12 0 0 1-2 24z" fill="#cbd5e1"/><path d="M36 70l-4 12M50 70l-4 12M64 70l-4 12" stroke="#38bdf8" stroke-width="5" stroke-linecap="round"/>`,
  snow: `<path d="M30 60a14 14 0 0 1 1-28 18 18 0 0 1 34 4 12 12 0 0 1-2 24z" fill="#e2e8f0"/><path d="M36 76h.01M50 80h.01M64 76h.01" stroke="#bae6fd" stroke-width="7" stroke-linecap="round"/>`,
  storm: `<path d="M30 58a14 14 0 0 1 1-28 18 18 0 0 1 34 4 12 12 0 0 1-2 24z" fill="#94a3b8"/><path d="M52 62l-14 18h11l-4 14 16-20H50z" fill="#fde047"/>`
};
const icon = (k, size) => `<svg viewBox="0 0 100 100" style="width:${size}px;height:${size}px">${GLYPH[k] || GLYPH.cloud}</svg>`;
const dayName = iso => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });

MATTAPPS.define("weather", {
  body() {
    return `<div class="wx">
      <div class="wx-load" id="wxLoad"><span class="wx-spin"></span>Reading the sky over Lafayette…</div>
      <div class="wx-main" id="wxMain" hidden>
        <div class="wx-now">
          <div class="wx-glyph" id="wxGlyph" title="Lafayette, LA"></div>
          <div>
            <div class="wx-temp" id="wxTemp">--°</div>
            <div class="wx-cond" id="wxCond"></div>
            <div class="wx-place">Lafayette, Louisiana</div>
          </div>
        </div>
        <div class="wx-grid" id="wxGrid"></div>
        <div class="wx-days" id="wxDays"></div>
        <div class="wx-foot">Open-Meteo · updated <span id="wxAt"></span> ·
          <a href="/trafficmap">the traffic map has this too</a></div>
      </div>
      <div class="wx-err" id="wxErr" hidden>
        <b>Couldn't reach the weather service.</b>
        <span>You may be offline, or the request was blocked.</span>
        <button class="btn" id="wxRetry">Try again</button>
      </div>
    </div>`;
  },
  mount(body) {
    const q = s => body.querySelector(s);
    let taps = 0;

    async function pull() {
      q("#wxLoad").hidden = false; q("#wxErr").hidden = true; q("#wxMain").hidden = true;
      try {
        const res = await fetch(URL, { cache: "no-store" });
        if (!res.ok) throw new Error("http " + res.status);
        const d = await res.json();
        const c = d.current, [label, kind] = CODES[c.weather_code] || ["Unsettled", "cloud"];
        q("#wxGlyph").innerHTML = icon(kind, 96);
        q("#wxTemp").textContent = Math.round(c.temperature_2m) + "°";
        q("#wxCond").textContent = label;
        q("#wxGrid").innerHTML = [
          ["Feels like", Math.round(c.apparent_temperature) + "°"],
          ["Humidity", Math.round(c.relative_humidity_2m) + "%"],
          ["Wind", Math.round(c.wind_speed_10m) + " mph"],
          ["Rain", (c.precipitation || 0).toFixed(2) + '"']
        ].map(([k, v]) => `<div class="wx-cell"><span>${k}</span><b>${v}</b></div>`).join("");
        q("#wxDays").innerHTML = d.daily.time.map((t, i) => {
          const k = (CODES[d.daily.weather_code[i]] || ["", "cloud"])[1];
          return `<div class="wx-day"><span>${i === 0 ? "Today" : dayName(t)}</span>
            ${icon(k, 26)}
            <b>${Math.round(d.daily.temperature_2m_max[i])}°</b>
            <i>${Math.round(d.daily.temperature_2m_min[i])}°</i></div>`;
        }).join("");
        q("#wxAt").textContent = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        q("#wxLoad").hidden = true; q("#wxMain").hidden = false;
        if (window.MATTOS) window.MATTOS.egg("weather-live");
      } catch (e) {
        q("#wxLoad").hidden = true; q("#wxErr").hidden = false;
      }
    }
    q("#wxRetry").addEventListener("click", pull);

    /* five taps on the glyph and it starts snowing on the desktop */
    q("#wxGlyph").addEventListener("click", () => {
      taps++;
      q("#wxGlyph").style.transform = `rotate(${taps * 14}deg)`;
      if (taps >= 5 && window.MATTOS) { window.MATTOS.egg("weather-snow"); taps = 0; }
    });
    pull();
  }
});
})();
