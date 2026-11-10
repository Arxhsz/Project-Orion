(function () {
  'use strict';
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  var revision = null;
  async function poll() {
    try {
      var response = await fetch('/__orion_dev/version', { cache: 'no-store' });
      if (response.status === 404) return;
      if (response.ok) {
        var data = await response.json();
        if (revision !== null && revision !== data.revision) { location.reload(); return; }
        revision = data.revision;
      }
    } catch (_) {
      // The Python watcher briefly restarts the local server between edits.
    }
    window.setTimeout(poll, 1200);
  }
  poll();
})();
