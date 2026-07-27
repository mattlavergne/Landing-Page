/* ══════════════════════════════════════════════════════════════════
   mattsh — the rest of the shell.

   The Terminal in index.html ships the basics (about, projects, theme,
   neofetch…).  This file, loaded the first time a Terminal opens, adds
   the parts worth digging for:

     • a small read-only filesystem (pwd, cd, ls -a, cat, find, tree)
     • sudo that eventually gives in, and a root prompt
     • an unlock key hidden in a file, and `unlock` to use it
     • a text adventure with a real ending
     • fortune, cowsay, hack, panic, gravity, roll, top, vim, and more

   Nothing here is documented in `help` on purpose; `help --all` is.
════════════════════════════════════════════════════════════════════ */
(function (global) {
"use strict";

/* ─────────────────────────── the filesystem ───────────────────────────
   Directories are objects, files are strings.  Names starting with "."
   are hidden from a plain `ls`, exactly as you'd hope. */
const KEY = "XYZZY-47-LIQUID";

const FS = {
  Users: {
    matt: {
      "README.txt":
`mattOS 4.8 "Liquid"
Everything in this filesystem is real text and none of it is a real
computer. Read what you like; you cannot break anything.

If you are the sort of person who runs "ls -a" on a stranger's
portfolio, we would get along.`,
      ".plan":
`.plan — Matt Lavergne
Last updated: this morning, on the drive in.

  now      47 Power Automate flows in production at the ULL Foundation.
           Gift processing, donor ops, events, onboarding. Child flows,
           custom REST connectors, environment variables, no hard-coded
           anything.
  next     An MBA, slowly. A map-art generator, slower.
  always   Automate the thing nobody wants to do twice.

Old habit: finger someone's .plan and you learned what they were up to.
Nobody does this anymore. You just did.`,
      ".mattos": {
        "unlock.key":
`# mattOS unlock key
# Feed this to the shell:  unlock <key>
` + KEY,
        "notes.txt":
`Reminders to self:
  - the ghosts in Chomper cheat slightly on level 4+
  - the arcade catalog is data; adding a game is one file
  - nobody will ever find this file`
      },
      ".ssh": {
        "id_rsa":
`-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NoAAAAAwEAAQAAAYEAyoumightthinkthisisarealkeybutitisnotitisajokeaaaa
aaaaaaaaaaaaaaaaaaaanicetryhoweverthatisexactlywhatiwouldwanttoseeaa
-----END OPENSSH PRIVATE KEY-----

(It's a joke. Never leave a real one lying around, obviously.)`,
        "known_hosts": "mattlavergne.com ssh-ed25519 AAAA… # you, apparently"
      },
      Documents: {
        "resume.txt":
`Matt Lavergne — Digital Services Coordinator, ULL Foundation
  2024–now  Digital Services Coordinator · 47-flow automation engine
  2024      Graduate Assistant · 20+ events a quarter, 100% data accuracy
  2017–24   Shift Manager → Team Member · taught ice skating, ran shifts
  B.S. Informatics (2023) · MBA in progress (2027)
Full version: the Career app, or contact@mattlavergne.com`,
        "salary.txt": "nice try",
        "TODO.md":
`- [x] make the portfolio a desktop
- [x] put an arcade in it
- [x] hide 40-odd things in it
- [ ] stop hiding things in it
- [ ] (never)`
      },
      Projects: {
        "47-flows.md":
`47 flows, one solution.
  gift processing · donor operations · events · onboarding/offboarding
  child-flow architecture so logic lives in one place
  custom REST connectors instead of copy-pasted HTTP actions
  environment variables so nothing is hard-coded across 47 flows
It runs whether or not anyone is thinking about it. That's the point.`,
        "trafficmap.md":
`Lafayette 911 traffic map: Python scraper → published on a schedule →
Leaflet front end with the same liquid-glass material as this desktop.
Live at /trafficmap.`,
        "arcade.md":
`11 games. engine.js is the stage, catalog.js is the list, one file per
game. Two of them are not in the catalog listing. You have found one if
you are reading this from a root shell.`
      }
    }
  },
  etc: {
    motd:
`Welcome to mattOS 4.8 "Liquid".
Unauthorized curiosity is encouraged.
Tip: sudo is refused here. Refused is not the same as impossible.`,
    hosts: "127.0.0.1 localhost\n127.0.0.1 mattlavergne.com # you are already home"
  },
  var: {
    log: {
      "system.log":
`00:00:00 kernel: GlassWM online
00:00:01 dock: magnifier calibrated
00:00:01 arcade: 11 titles indexed (2 hidden)
00:00:02 flows: 47 loaded, 0 failed
00:00:02 eggs: 42 registered, most unfound
00:00:03 login: welcome`
    }
  }
};

const FORTUNES = [
  "A process that needs a person to remember it is not a process.",
  "The best automation is the one nobody notices was ever manual.",
  "Documentation is a love letter to your future self.",
  "There is no such thing as a temporary spreadsheet.",
  "Ninety percent of automation is agreeing on what the process actually is.",
  "If it runs on someone's laptop, it does not run.",
  "Every hard-coded value is a promise you'll be back.",
  "You are never debugging the thing you think you are debugging.",
  "Ship it Tuesday. Never ship it Friday.",
  "The flow works. The assumption did not."
];

const TOP_PROCS = [
  ["1", "kernel_task", "3.1", "GlassWM"], ["47", "flowd", "12.8", "automation engine"],
  ["88", "dock", "0.9", "magnifier"], ["119", "spotlightd", "0.4", "indexing 6 projects"],
  ["203", "arcaded", "2.2", "11 titles"], ["404", "notfoundd", "0.0", "missing"],
  ["512", "wallpaperd", "1.7", "5 blobs drifting"], ["777", "coffeed", "99.9", "always"],
  ["1993", "fingerd", "0.1", "waiting for .plan reads"]
];

/* ─────────────────────────── the text adventure ───────────────────────────
   Small, but a real graph with a real ending. */
const ROOMS = {
  lobby: {
    look: "You are in the lobby of a foundation building. A reception desk sits under a wall of donor names.\nA <b>hallway</b> runs north. A <b>door</b> to the outside is behind you.",
    exits: { north: "hall", out: "outside" },
    items: ["badge"]
  },
  hall: {
    look: "A long hallway. Fluorescent light, industrial carpet. Doors to the <b>office</b> (east) and the <b>server room</b> (west).\nThe lobby is back <b>south</b>.",
    exits: { east: "office", west: "server", south: "lobby" }
  },
  office: {
    look: "A desk buried in paper. A 1,000-page PDF sits in the printer tray, unsorted.\nA sticky note reads: <i>“split by bookmark, route by recipient.”</i>\nThe hallway is <b>west</b>.",
    exits: { west: "hall" },
    items: ["script"]
  },
  server: {
    look: "A cold room that hums. One rack, one blinking switch, and a terminal with a blinking cursor.\nSomething is taped to the rack: a <b>key</b>.\nThe hallway is <b>east</b>.",
    exits: { east: "hall" },
    items: ["key"],
    locked: true
  },
  outside: {
    look: "You step outside into Louisiana humidity. The parking lot shimmers.\nYou could go back <b>in</b>.",
    exits: { in: "lobby" }
  }
};

function makeAdventure(ctx, done) {
  let room = "lobby";
  const bag = [];
  const seen = {};
  const say = h => ctx.p("", h.replace(/\n/g, "<br>"));

  function look() {
    const r = ROOMS[room];
    say(`<b class="acc">${room.toUpperCase()}</b><br>${r.look}`);
    if (r.items && r.items.length) say(`You can see: <b>${r.items.join("</b>, <b>")}</b>.`);
    seen[room] = true;
  }
  say(`<b>COLOSSAL FOUNDATION</b> — a very small adventure.<br>` +
      `Commands: <b>look</b>, <b>go &lt;direction&gt;</b>, <b>take &lt;thing&gt;</b>, <b>use &lt;thing&gt;</b>, <b>inventory</b>, <b>quit</b>.`);
  look();

  return function (line) {
    const [verb, ...rest] = line.toLowerCase().split(/\s+/);
    const arg = rest.join(" ");
    const r = ROOMS[room];

    if (verb === "quit" || verb === "exit") { say("You leave the building. The story waits."); return "exit"; }
    if (verb === "look" || verb === "l") { look(); return; }
    if (verb === "inventory" || verb === "i") { say(bag.length ? "You carry: <b>" + bag.join("</b>, <b>") + "</b>." : "Your hands are empty."); return; }
    if (verb === "xyzzy") { say("A hollow voice says <i>“fool”</i>."); if (ctx.os) ctx.os.egg("sh-xyzzy"); return; }
    if (verb === "take" || verb === "get") {
      const i = (r.items || []).indexOf(arg);
      if (i < 0) { say("There is no " + (arg || "that") + " here."); return; }
      bag.push(r.items.splice(i, 1)[0]);
      say("Taken.");
      return;
    }
    if (verb === "go" || verb === "move" || verb === "walk") {
      const dest = r.exits[arg];
      if (!dest) { say("You cannot go " + (arg || "nowhere") + " from here."); return; }
      if (ROOMS[dest].locked && !bag.includes("badge")) {
        say("The door needs a badge. There was one on the reception desk.");
        return;
      }
      room = dest; look();
      return;
    }
    if (verb === "use") {
      if (arg === "script" && bag.includes("script")) {
        say("You run the script. It splits the 1,000-page PDF along its bookmarks and routes every\nsection to the right recipient. Hours of someone's week, gone. Permanently.");
        bag.push("gratitude");
        return;
      }
      if (arg === "key" && bag.includes("key")) {
        say(`The key is stamped with a string: <b class="ok">${KEY}</b><br>` +
            `You could type <b>unlock ${KEY}</b> at a shell prompt. This is a shell prompt.`);
        if (bag.includes("script")) {
          say(`<br><b class="ok">You have done everything there is to do here.</b><br>` +
              `You automated the tedious thing, and you found the key nobody labelled.<br>` +
              `That is the whole job, honestly.<br><br><i>THE END.</i> Type <b>quit</b> to return to the shell.`);
          done();
        }
        return;
      }
      say("Nothing happens.");
      return;
    }
    if (ROOMS[room].exits[verb]) { room = ROOMS[room].exits[verb]; look(); return; }
    say("You cannot do that here. Try <b>look</b>, <b>go</b>, <b>take</b>, <b>use</b> or <b>quit</b>.");
  };
}

/* ─────────────────────────── the commands ─────────────────────────── */
global.MATTSH = {
  commands(ctx) {
    const p = ctx.p, esc = ctx.esc;
    const egg = id => { if (ctx.os) ctx.os.egg(id); };
    let cwd = ["Users", "matt"];
    let root = false, sudoTries = 0, unlocked = false;

    const at = path => path.reduce((n, k) => (n && typeof n === "object") ? n[k] : undefined, FS);
    const home = () => "~";
    const pretty = () => "/" + cwd.join("/");
    const resolve = arg => {
      if (!arg || arg === "." || arg === "~") return ["Users", "matt"];
      let parts = arg.startsWith("/") ? arg.slice(1).split("/")
        : arg.startsWith("~/") ? ["Users", "matt", ...arg.slice(2).split("/")]
          : [...cwd, ...arg.split("/")];
      const out = [];
      parts.forEach(seg => {
        if (!seg || seg === ".") return;
        if (seg === "..") out.pop();
        else out.push(seg);
      });
      return out;
    };
    const setPrompt = () => ctx.setPrompt(root ? "root@mattOS " + pretty() + " #" : "matt@mattOS ~ %");

    return {
      /* ── filesystem ── */
      pwd() { p("", pretty()); },
      cd(a) {
        const target = resolve((a && a[0]) || "~");
        const node = at(target);
        if (node === undefined) { p("err", "cd: no such directory: " + esc((a && a[0]) || "")); return; }
        if (typeof node === "string") { p("err", "cd: not a directory: " + esc(a[0])); return; }
        cwd = target; setPrompt(); p("u", pretty());
      },
      ls(a) {
        a = a || [];
        const all = a.some(x => /^-\w*a/.test(x));
        const path = a.filter(x => !x.startsWith("-"))[0];
        const node = at(resolve(path));
        if (node === undefined) { p("err", "ls: no such file or directory"); return; }
        if (typeof node === "string") { p("", esc(path)); return; }
        let names = Object.keys(node);
        const hidden = names.filter(n => n.startsWith("."));
        if (!all) names = names.filter(n => !n.startsWith("."));
        else egg("sh-filesystem");
        const line = names.map(n => typeof node[n] === "object"
          ? `<span class="acc">${esc(n)}/</span>`
          : (n.startsWith(".") ? `<span class="u">${esc(n)}</span>` : esc(n))).join("   ");
        p("", "<pre>" + (line || "(empty)") + "</pre>");
        if (!all && hidden.length) p("u", `(${hidden.length} hidden item${hidden.length === 1 ? "" : "s"} — try <b>ls -a</b>)`);
      },
      cat(a) {
        if (!a || !a.length) { p("err", "usage: cat &lt;file&gt;"); return; }
        const target = resolve(a[0]);
        const node = at(target);
        if (node === undefined) { p("err", "cat: " + esc(a[0]) + ": no such file"); return; }
        if (typeof node === "object") { p("err", "cat: " + esc(a[0]) + ": is a directory"); return; }
        p("", "<pre>" + esc(node) + "</pre>");
        const name = target[target.length - 1];
        if (name === ".plan") egg("sh-plan");
        if (name === "unlock.key") p("ok", "Looks like a key. There is a command for that.");
        if (name === "id_rsa") p("warn", "Never do this with a real key.");
      },
      tree() {
        const lines = [];
        (function walk(node, prefix, name) {
          lines.push(prefix + name);
          if (typeof node !== "object") return;
          const keys = Object.keys(node);
          keys.forEach((k, i) => {
            const last = i === keys.length - 1;
            walk(node[k], prefix.replace(/[├└]── /, m => m === "└── " ? "    " : "│   ") + (last ? "└── " : "├── "), k);
          });
        })(FS, "", "/");
        p("", "<pre>" + esc(lines.join("\n")) + "</pre>");
      },
      find(a) {
        const q = (a && a.join(" ") || "").toLowerCase();
        if (!q) { p("err", "usage: find &lt;name&gt;"); return; }
        const hits = [];
        (function walk(node, path) {
          Object.keys(node).forEach(k => {
            const full = path + "/" + k;
            if (k.toLowerCase().includes(q)) hits.push(full);
            if (typeof node[k] === "object") walk(node[k], full);
          });
        })(FS, "");
        p("", hits.length ? "<pre>" + esc(hits.join("\n")) + "</pre>" : "no matches");
      },

      /* ── privileges ── */
      sudo(a) {
        if (root) { p("ok", "you are already root. behave."); return; }
        sudoTries++;
        const cmd = (a && a.join(" ")) || "";
        if (sudoTries === 1) { p("err", "Permission denied: you don't have sudo access on mattOS."); return; }
        if (sudoTries === 2) { p("err", "Still no. This incident will be reported."); return; }
        if (sudoTries === 3) { p("warn", "…reported to whom, exactly? Fine. One more time."); return; }
        root = true; setPrompt();
        egg("sh-root");
        p("ok", "root granted. The prompt is a <b>#</b> now, as tradition demands.");
        p("u", "New commands: <b>whoami</b> knows, <b>unlock</b> takes a key, <b>panic</b> is real.");
        if (/sandwich/.test(cmd)) p("acc", "🥪 okay.");
      },
      su() { this.sudo([]); },
      whoami() { p("", root ? "root" : "matt"); },

      /* ── the key ── */
      unlock(a) {
        const given = (a && a[0] || "").trim().toUpperCase();
        if (!given) { p("err", "usage: unlock &lt;key&gt;   (there is a key file somewhere)"); return; }
        if (given !== KEY) { p("err", "that key doesn't fit."); return; }
        if (unlocked) { p("u", "already unlocked."); return; }
        unlocked = true;
        egg("sh-key");
        if (ctx.os && ctx.os.eggs) ctx.os.eggs.unlockGame("pong");
        p("ok", "Key accepted. A hidden game has been added to the Arcade: <b>Pong</b>.");
        p("u", "Try <b>play pong</b>, or find it in Launchpad.");
      },

      /* ── the adventure ── */
      adventure() {
        ctx.setMode(makeAdventure(ctx, () => egg("sh-adventure")));
      },
      xyzzy() { p("acc", "A hollow voice says <i>“fool”</i>."); egg("sh-xyzzy"); },

      /* ── noise and nonsense ── */
      fortune() { p("acc", FORTUNES[Math.floor(Math.random() * FORTUNES.length)]); egg("sh-fortune"); },
      cowsay(a) {
        const msg = (a && a.join(" ")) || "moo";
        const bar = "-".repeat(Math.min(msg.length, 40) + 2);
        p("", "<pre>" + esc(
` ${bar}
< ${msg.slice(0, 40)} >
 ${bar}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`) + "</pre>");
        egg("sh-cow");
      },
      hack() {
        egg("sh-hack");
        const el = document.getElementById("hackerLine");
        const LINES = [
          "connecting to mainframe 10.0.0.47 …",
          "bypassing firewall … [####------] 40%",
          "bypassing firewall … [########--] 80%",
          "ACCESS GRANTED",
          "downloading donor_database.sql … 0%",
          "downloading donor_database.sql … 63%",
          "wait. this is a portfolio site.",
          "there is no mainframe.",
          "there is no database.",
          "there is a very good traffic map though.",
          "disconnecting."
        ];
        let i = 0;
        if (el) el.classList.add("on");
        const iv = setInterval(() => {
          const line = LINES[i++];
          if (line === undefined) {
            clearInterval(iv);
            if (el) { el.classList.remove("on"); el.textContent = ""; }
            p("ok", "…you're in. (You were always in. It's a website.)");
            return;
          }
          p(i > 6 ? "u" : "ok", esc(line));
          if (el) el.textContent = line;
        }, 520);
      },
      panic(a) {
        if (ctx.os) ctx.os.kernelPanic((a && a.join(" ")) || "user requested panic");
      },
      gravity() { if (ctx.os) ctx.os.gravity(); },
      roll() { if (ctx.os) ctx.os.barrelRoll(); p("acc", "Do a barrel roll!"); },
      barrelroll() { this.roll(); },
      snow() { if (ctx.os) { ctx.os.snow(20); p("acc", "❄ it never does this here."); } },
      top() {
        p("", "<pre>" + esc("  PID  COMMAND        %CPU  NOTE") + "\n" +
          TOP_PROCS.map(([pid, cmd, cpu, note]) =>
            `<pre>${esc(pid.padStart(5))}  ${esc(cmd.padEnd(14))} ${esc(cpu.padStart(4))}  <span class="u">${esc(note)}</span></pre>`).join(""));
      },
      uptime() {
        const s = ctx.os ? Math.round((Date.now() - ctx.os.bootTime) / 1000) : 0;
        p("", `up ${Math.floor(s / 60)}m ${s % 60}s, 1 user, load average: 0.47, 0.47, 0.47`);
      },
      vim() { p("err", "vim: to exit, close the window. That's the joke. That's always been the joke."); },
      emacs() { p("err", "emacs: a fine operating system, lacking only a decent editor."); },
      nano() { p("ok", "nano: at least you're honest."); },
      rm(a) {
        const arg = (a || []).join(" ");
        if (/-rf?\s*\/\s*$/.test(arg) || arg === "-rf /") {
          p("err", "rm: deleting everything…");
          let n = 0;
          const iv = setInterval(() => {
            n++;
            if (n < 4) { p("err", "removing /" + ["Users", "etc", "var"][n - 1] + " …"); return; }
            clearInterval(iv);
            p("ok", "…just kidding. This filesystem is a JavaScript object. Nothing was harmed.");
          }, 480);
          return;
        }
        p("err", "rm: this filesystem is read-only. Try being destructive somewhere else.");
      },
      ping(a) {
        const host = (a && a[0]) || "mattlavergne.com";
        let n = 0;
        const iv = setInterval(() => {
          n++;
          p("", `64 bytes from ${esc(host)}: icmp_seq=${n} ttl=47 time=${(Math.random() * 8 + 4).toFixed(1)} ms`);
          if (n >= 4) { clearInterval(iv); p("u", "--- " + esc(host) + " ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss"); }
        }, 420);
      },
      curl(a) {
        const u = (a && a[0]) || "";
        if (/trafficmap/.test(u)) { p("ok", "302 Found → /trafficmap  (just click it)"); return; }
        p("", "<pre>" + esc(`HTTP/2 200
content-type: text/html; charset=utf-8
server: cloudflare-workers
x-powered-by: one guy and a Worker

<!DOCTYPE html><title>mattOS</title>…`) + "</pre>");
      },
      man(a) {
        const t = (a && a[0]) || "";
        if (!t) { p("err", "What manual page do you want?"); return; }
        if (t === "matt") { p("", "<pre>NAME\n    matt — automation specialist, Lafayette LA\n\nSYNOPSIS\n    matt [--hire] [--coffee]\n\nDESCRIPTION\n    Replaces manual work with systems that keep running.\n\nSEE ALSO\n    contact(1), arcade(6)</pre>"); return; }
        p("err", "No manual entry for " + esc(t) + ". There rarely is.");
      },
      "help"(a) {
        if (a && a[0] === "--all") {
          p("", "<pre>Everything mattsh knows:\n" +
            "  <b>filesystem</b>  pwd · cd · ls [-a] · cat · find · tree\n" +
            "  <b>privileges</b>  sudo (keep asking) · su · whoami · unlock &lt;key&gt;\n" +
            "  <b>toys</b>        fortune · cowsay · hack · panic · gravity · roll · snow\n" +
            "                top · uptime · ping · curl · man · vim · emacs · rm\n" +
            "  <b>stories</b>     adventure · xyzzy · matrix · coffee · credits\n" +
            "  <b>arcade</b>      arcade · play &lt;game&gt;\n" +
            "Some of these unlock achievements. Most of them are jokes.</pre>");
          return;
        }
        ctx.cmds.__baseHelp ? ctx.cmds.__baseHelp() : null;
        p("u", "There is more than this. Try <b>help --all</b>, or just poke around.");
      },
      mattbot(a) {
        const q = (a && a.join(" ") || "").toLowerCase();
        const answer =
          !q ? "usage: mattbot &lt;question&gt;  — I answer as Matt, badly." :
            /hire|available|job|work/.test(q) ? "Open to the right thing. contact@mattlavergne.com, or the Mail app." :
              /power ?automate|flow/.test(q) ? "47 of them, child-flow architecture, custom REST connectors, no hard-coded values." :
                /coffee/.test(q) ? "Yes." :
                  /favou?rite|favorite/.test(q) ? "The traffic map. It's the one strangers actually use." :
                    /you|who/.test(q) ? "Digital Services Coordinator at the ULL Foundation. Automation, integrations, M365." :
                      "I'm a joke command with about six answers. Try asking about flows, coffee, or hiring.";
        p("acc", "🤖 " + answer);
      }
    };
  }
};
})(window);
