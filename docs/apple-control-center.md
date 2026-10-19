# The Apple Control Center: secure operations

The Control Center is an owner-only tool for The Apple. It publishes validated content data, not executable code. It never receives a GitHub write token or player records.

## Features
- Overview: aggregated voluntary usage reports, schedules and backend health.
- Skin studio: design with the real game renderer, star prices, cosmetic effects, archive status and tour rewards.
- Daily challenges: choose one existing gameplay trigger for each of three tiers, with dated schedules.
- Weekly events: schedule an existing effect for Monday and customize its name, icon and explanation.
- Orchard Tours: name future 21-day seasons and their final cosmetic reward.
- Announcements and emergency ad-format pause switches.
- Analytics: event counts, difficulty reports, daily participation and CSV export.
- Testing: links to the private game, existing test tools and isolated draft preview.
- Publishing: drafts, release notes, numbered snapshots and rollback. Released skins are archived, not deleted from players' collections.

## Deployment blockers

Do not merge or deploy until these are reviewed and configured.

1. The existing APPLE_DB D1 binding must point to the production game database.
2. In Cloudflare Zero Trust Access, create or verify a self-hosted Access application protecting all private /apple/* paths, including /apple/portal/*, /apple/admin/api/*, /apple/stats and /apple/test/*. Require MFA, and allow only named admins.
3. Configure the Worker's environment variables or secrets: APPLE_ACCESS_TEAM_DOMAIN (for example my-team.cloudflareaccess.com), APPLE_ACCESS_AUD (the audience for the Access application), and APPLE_ADMIN_EMAILS (comma-separated exact email addresses). No values are committed to source code.
4. Do not protect /api/apple/content with Access: store app devices must fetch approved public configuration without sign-in. That endpoint exposes no credentials, usage reports or draft data.
5. Preserve all existing Worker environment settings, including the GitHub read-only token and D1 database binding.
6. Confirm that unsigned requests, tampered tokens, expired tokens, wrong audience, and unlisted email addresses all receive 403 from /apple/portal and /apple/admin/api, plus the older /apple/stats endpoint.
7. Confirm direct /apple-control/index.html, /apple-control/app.js and /apple-control/style.css return 404. Only the private /apple/portal path can deliver those assets.
8. Confirm the public privacy policy accurately describes the configuration download, and review the store privacy declarations.

A mere CF_Authorization cookie cannot bypass authorization. The Worker independently verifies the Cloudflare Access JWT RS256 signature, issuer, audience, expiry, and an email allowlist. If any of the three variables is missing, admin access is denied by default.

## Safe release order

1. Review both GitHub pull requests. Run security/unit tests and inspect the code changes.
2. Set Access policy and secrets in a staging environment, then validate every protected route.
3. Deploy the Worker backend. Public content starts with an empty version 0, and existing cloud sync/stat services remain untouched.
4. On the private portal, test draft saving, publishing, history and rollback with cosmetic data. Verify no users are affected by drafts.
5. Test game launch, offline launch, cloud save, purchases, events, tour rewards and ad flow on actual iOS and Android devices.
6. Publish the store app update. Older versions cannot receive live content.
7. Release small content changes first. Watch Cloudflare errors and Store/AdMob reports, with rollback available if needed.

## Data and game safety rules

- Only strictly validated, data-only records may be published. No code, scripts, executable expressions, arbitrary event logic, store purchase changes, external links or personal data.
- Challenge IDs and weekly mechanics are restricted to existing game capabilities, while cosmetic colors, labels and schedules may be edited.
- Already started Daily challenges retain their progress, even after a new content version arrives.
- Public content is checked again by the game; malformed or unreachable data falls back to a cached, valid version or bundled game defaults.
- Content loads on launch, not in the middle of gameplay. Offline users and older releases might have earlier content.
- Interstitial, banner and rewarded ad safety switches only pause an ad format; they do not increase advertising or affect purchases.
- Previously released custom skin data is retained during rollbacks and archives so existing owners can still use it.
- Write requests are same-origin JSON, include a dedicated CSRF header, and use version checks. Publications create history records.
- Anonymous analytics counts are events, not verified individuals. Revenue numbers must be checked in AdMob and the app stores.
- Keep the admin interface under MFA, review access logs, minimize admin privileges and verify production Cloudflare Access rules before deployment.

## Automated checks

Worker:
- node --check src/apple-control.js
- node --check src/index.js
- node --check public/apple-control/app.js
- node --test tests/apple-control.test.mjs

Game:
- node --check js/live-content.js
- node --check js/main.js
- node --test tools/live-content-test.mjs
- node tools/ads-test.mjs
- node tools/progress-test.mjs
- npm ci && npm run build
- node tools/native-smoke.mjs ios
- node tools/native-smoke.mjs android
- node tools/test-site.mjs
- node tools/retention-test.mjs

The browser tests need Playwright and Chromium. Passing unit checks is not a substitute for testing authentication in the deployed Cloudflare environment and gameplay on real devices.
