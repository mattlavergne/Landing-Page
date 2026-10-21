# The Apple: Control Center

The Control Center (`/apple/portal`) is your private dashboard for the game's live content. You can change what's on without an app update:
- **Daily challenges:** the three challenges on any day.
- **Weekly twists:** the twist each week, with your own name and words.
- **Orchard Tours:** a tour's name, icon and reward skin.
- **Announcements:** several, each scheduled.
- **Skins:** new skins for the Orchard, or as tour rewards.
- **Emergency ad switches:** pause one kind of ad.

It also has stats and a history you can go back to. Only you can open it: Cloudflare Access signs you in, and the Worker checks that sign-in itself.

## How it fits together

- **The game decides what's on each day by itself,** from the date, forever: the Daily Run, its challenges, the weekly twist and the tour. That logic lives in the game (`js/schedule.js` in the game repo). The portal loads that same file from the private test copy (`/apple/test/js/schedule.js`), so its calendar shows exactly what phones do: the automatic rotation, with your changes on top.
- **Your changes are a draft that saves itself.** Nothing reaches players until **Review & publish**, which lists every change in plain words first. Each publish is a numbered version, and **History** can go back to any of them.
- **Phones download the published content** from `https://mattlavergne.com/api/apple/content` when the game opens or comes back to the screen. Each item is checked on the phone, and anything bad or unknown is dropped on its own. The last good copy is kept for when there's no connection.
  - The game asks for `?schema=2`: the list of announcements.
  - Copies of the game from before get the old format: one announcement, the one showing today.

## The live preview

**📱 Preview** in the top bar opens the private test game beside the editor, playing your draft, as a phone would show it.
- **It updates as you edit.** Every saved change shows at once, without restarting the game. Your draft goes from this page to the test game through your browser's own storage on this site, never through the address phones use, so players see nothing until you publish.
- **It shows the day you're working on.** Opening a day, a week, a tour or an announcement moves the preview to that date. **Today** brings it back.
- **It plays on the test game's own test save,** so your real progress is never touched. The test tools are there too, as on the test game's own page.
- **It stays open next time** on a wide screen. On a narrow screen it opens over the editor; close it to keep editing.
- **What it can't show:** how older versions of the app handle your content. They ignore anything they don't understand. The automated tests cover that.

The test game can be shown inside this site only (its pages say `frame-ancestors 'self'`), not inside anyone else's.

## What can't change from here (on purpose)

- **New rules or mechanics.** Challenges and twists can only be ones the game already has. Apple doesn't allow downloading new game code, and it keeps players safe. New kinds need an app update.
- **A tour that has started.** Its name, icon and reward can't change until it ends, because players are earning toward that skin. The server refuses.
- **Today's challenges on a phone that has made a start on them.** Progress is never taken away. Phones that haven't started them get your new ones when they next open the game.
- **Published skins can't be deleted.** Players may own them. Archive one instead: owners keep it, and it's no longer sold.
- **Prices of the purchase, links, and anything personal.** Not in the content at all.

## If phones don't get your changes

1. **Check that you published.** The bar at the top says "Everything is published".
2. **Check the phone.** The game's **Settings** shows "Published content: v12 · current" when it has the latest. Open the game again, or switch away and back, then look.
3. **"blocked (Cloudflare's bot check stopped it…)" means Cloudflare is stopping the app.** Builds from before October 20 said "offline" for this, because the phone's web view hid Cloudflare's answer from the game; the app now downloads through the phone's own networking and can read it. A web page gets through because your browser can pass Cloudflare's "Just a moment…" check; the app can't. Here's how to fix it:
   - In Cloudflare, go to **Security → Bots** and turn off **Bot Fight Mode**.
   - On a paid plan, you can instead add a **WAF custom rule** that skips bot protection when the URL path starts with `/api/apple/`.
   - **Security → Events** shows what was blocked.
   - The game's other addresses (`/api/apple/sync…`, `/stats`, `/daily`) need the same.
4. **Check how a build from Xcode was made.** It has this only if it was built after the live-content update: run `git pull`, then `npm run ios`, and build again.
5. **Check how many phones got it.** **Today → On phones** and **Stats → Content versions** count phones that received each version. They only count players who said yes to play stats.

## Security

- **The private side.** `/apple/portal` and `/apple/admin/api/*` need a verified Cloudflare Access token:
  - the Worker checks the RS256 signature, issuer, audience, expiry and an email allowlist;
  - a cookie or a header alone is never enough;
  - without the three settings below, nobody gets in.
- **Writes are protected.** They must come from the portal's own page (Origin check), carry a custom header (against cross-site forms) and match the version they were based on.
- **The portal's page is locked down.** It has a strict Content Security Policy (no inline scripts or styles, no framing), and its raw files at `/apple-control/*` are blocked.
- **The forged-token rate limit.** A stream of forged tokens can't make the Worker fetch Cloudflare's keys more than once a minute.
- **The public side.** `/api/apple/content` is read-only (GET, HEAD, OPTIONS) and only ever has what's published: no drafts, no history, no email addresses. It is open because the game has no sign-in.
  - Answers are cached at the edge for 30 seconds, so a flood of requests can't run up the database.
  - A phone that already has the version gets a 304 (no body).
  - Publishing empties the cache.
- **Validation.** Everything is checked twice: by the server when you save or publish, and on each phone when it arrives.
- **Recommended:** a Cloudflare **rate-limiting rule** on `/api/apple/*`, for example 60 requests a minute per IP. Real phones make a handful.

## Setup (once)

1. **The database.** The `APPLE_DB` D1 binding (`wrangler.toml`) must point at the production database.
2. **Cloudflare Zero Trust → Access → Applications.** Create or check a **self-hosted** application that protects:
   - `/apple/portal`, `/apple/portal/*`
   - `/apple/admin/api/*`
   - `/apple/stats`
   - `/apple/test/*`

   Require multi-factor sign-in, and allow only your own email addresses. Do **not** protect `/api/apple/*`: phones need it.
3. **Workers & Pages → trafficmap-proxy → Settings → Variables and Secrets.** Add:
   - `APPLE_ACCESS_TEAM_DOMAIN`: your team domain, like `my-team.cloudflareaccess.com` (no `https://`);
   - `APPLE_ACCESS_AUD`: the Access application's **Application Audience (AUD) Tag**;
   - `APPLE_ADMIN_EMAILS`: your sign-in email addresses, comma-separated, exact.

   Keep the existing `APPLE_DB` binding and `GITHUB_TOKEN` secret.
4. **Check it.** Open `https://mattlavergne.com/apple/portal/` and sign in. A private browser window, signed out, must get "403".

## Trying it on your computer

`node scripts/dev-apple.mjs` runs the real Worker locally, without touching production. It uses a temporary database and a stand-in sign-in, and serves the game from a game-repo checkout next to this one (`../The-Apple`). Open `http://localhost:8787/apple/portal/`.

The game repo's `node tools/control-center-e2e.mjs` uses it for a full test: it edits in the portal, publishes, and checks a phone gets each change.

## Checks

- **Here:** `node --test tests/apple-control.test.mjs`. It covers sign-in, the format, publishing, caching, the tour lock, discarding drafts and forged tokens.
- **In the game repo:**
  - `node --test tools/live-content-test.mjs` checks the phone's side and that the schedule matches the game's rotation.
  - `node tools/content-sync-test.mjs` checks that this server and the game agree on challenges, twists and tour skins, and that a full publication reaches a phone whole.
  - `node tools/control-center-e2e.mjs` is the full end-to-end test, including the live preview.
