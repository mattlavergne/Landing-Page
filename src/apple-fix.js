// mattlavergne.com/fix/apple: repairs and checks The Apple's test site in the
// browser that opens it. Public (outside /apple, so the sign-in can't get in
// the way) and self-contained. It only touches the game's offline helpers,
// cached files and test-tool settings, never a saved game, and reports what
// it found so the report can be pasted into a bug report.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>The Apple: test site repair</title>
<style>
  body { margin: 0; background: #eaf7df; color: #3a1f2b; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 20px 16px 40px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  .btn { display: inline-block; margin: 6px 6px 6px 0; padding: 10px 16px; border: 2px solid #3a1f2b; border-radius: 12px; background: #fff; color: inherit; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
  .btn.go { background: #e8392f; border-color: #a3171a; color: #fff; }
  pre { white-space: pre-wrap; word-break: break-word; background: #fff; border: 2px solid #3a1f2b; border-radius: 12px; padding: 12px; font-size: 13px; line-height: 1.45; }
</style>
</head>
<body>
<main>
  <h1>&#127822; The Apple: test site repair</h1>
  <p id="status">Checking this browser&hellip;</p>
  <p><a class="btn go" href="/apple">Open the test site</a><button class="btn" id="copy">Copy report</button></p>
  <pre id="report"></pre>
</main>
<script>
(async function () {
  var lines = [];
  var log = function (s) { lines.push(s); document.getElementById('report').textContent = lines.join('\\n'); };
  log('Browser: ' + navigator.userAgent);
  log('Time: ' + new Date().toISOString());
  // 1. Offline helpers (service workers) for the game: list, then remove.
  try {
    if ('serviceWorker' in navigator) {
      var regs = await navigator.serviceWorker.getRegistrations();
      log('Offline helpers found: ' + regs.length);
      for (var i = 0; i < regs.length; i++) {
        var r = regs[i], w = r.active || r.waiting || r.installing;
        var mine = r.scope.indexOf('/apple') !== -1;
        log('  ' + r.scope + ' (' + (w ? w.state : 'no worker') + ')' + (mine ? ' -> removed: ' + (await r.unregister()) : ' (not the game, left alone)'));
      }
    } else log('Offline helpers: not supported in this browser');
  } catch (e) { log('Offline helpers: error ' + e); }
  // 2. Files the old helper cached.
  try {
    if ('caches' in window) {
      var keys = await caches.keys();
      log('Cached file stores: ' + (keys.join(', ') || 'none'));
      for (var j = 0; j < keys.length; j++) if (keys[j].indexOf('apple-') === 0) log('  ' + keys[j] + ' -> deleted: ' + (await caches.delete(keys[j])));
    }
  } catch (e) { log('Cached files: error ' + e); }
  // 3. Test-tool settings (the saves themselves are never touched).
  try {
    var admin = localStorage.getItem('the-apple-admin');
    log('Test-tool settings: ' + (admin || 'none'));
    if (admin) { localStorage.removeItem('the-apple-admin'); log('  -> switched off (back to your real save, everything unlocked)'); }
    var saved = [];
    for (var k = 0; k < localStorage.length; k++) { var key = localStorage.key(k); if (key && key.indexOf('the-apple') === 0) saved.push(key); }
    log('Game data in this browser: ' + (saved.sort().join(', ') || 'none'));
  } catch (e) { log('Storage: error ' + e); }
  // 4. How the test site's files load here.
  var files = ['/apple/test/', '/apple/test/css/style.css', '/apple/test/js/boot-check.js', '/apple/test/js/main.js', '/apple/test/js/platform.js', '/apple/test/js/admin.js'];
  log('Files:');
  for (var f = 0; f < files.length; f++) {
    try {
      var res = await fetch(files[f], { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' });
      var text = await res.text();
      log('  ' + files[f] + ' -> ' + res.status + (res.redirected ? ' redirected to ' + res.url : '') + ', ' + (res.headers.get('content-type') || 'no type') + ', ' + text.length + ' bytes, starts: ' + JSON.stringify(text.slice(0, 60)));
      if (f === 0) {
        var tags = text.match(/<script[^>]*>/g) || [];
        log('    script tags: ' + (tags.join(' ') || 'none'));
      }
    } catch (e) { log('  ' + files[f] + ' -> failed: ' + e); }
  }
  try {
    var src = await fetch('/apple/test/__source', { cache: 'no-store' });
    log('Served from: ' + (await src.text()).trim());
  } catch (e) { log('Served from: unknown (' + e + ')'); }
  document.getElementById('status').textContent = 'Done. Open the test site now. If it still doesn\\u2019t work, copy the report below and send it.';
})();
document.getElementById('copy').addEventListener('click', function () {
  var t = document.getElementById('report').textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
    document.getElementById('copy').textContent = 'Copied!';
  }, function () {
    var range = document.createRange(); range.selectNodeContents(document.getElementById('report'));
    var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.getElementById('copy').textContent = 'Selected: copy it';
  });
});
</script>
</body>
</html>
`;

export function appleFix() {
  return new Response(PAGE, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
