// Reload the page when a new version is published (version.json changes), so the
// Streamlabs/OBS browser source and the panel never keep running old code.
// Settings live in storage and the match intro does not replay after a reload,
// so reloading is safe. (Engine copied from goblin-overlay.)

// Pure: should we reload? Only when both versions are known and they differ.
export function shouldReload(loaded, latest) {
  return Boolean(loaded) && Boolean(latest) && String(loaded) !== String(latest);
}

// GitHub Pages lets browsers cache files for 10 minutes, so a plain reload can come
// back with old modules. Refresh every code file in the HTTP cache first.
export const CODE = ['overlay.html', 'panel.html', 'panel.js', 'panel.css',
  'scenes/starting.html', 'scenes/starting.js', 'scenes/starting.css',
  'scenes/brb.html', 'scenes/brb.js', 'scenes/brb.css',
  'scenes/ending.html', 'scenes/ending.js', 'scenes/ending.css',
  'core/alertlogic.js', 'core/aoe2.js', 'core/autoupdate.js', 'core/brbchat.js', 'core/bus.js', 'core/camchatlogic.js',
  'core/countdown.js', 'core/intrologic.js', 'core/panelcore.js', 'core/ratings.js', 'core/reactionlogic.js', 'core/recheader.js', 'core/replaywatch.js', 'core/registry.js', 'core/remote.js', 'core/scene.js',
  'core/settings.js', 'core/streamlabs.js', 'core/twitchchat.js',
  'core/ambience.js', 'core/dustdrift.js', 'core/endinglogic.js', 'core/matchbarlogic.js', 'core/sceneaudio.js',
  'modules/camchat.js', 'modules/camchat.css', 'modules/intro.js', 'modules/intro.css', 'modules/alerts.js', 'modules/alerts.css',
  'modules/matchbar.js', 'modules/matchbar.css', 'modules/reactions-fx.js', 'modules/reactions.js', 'modules/reactions.css',
  'shared/war-table.js', 'shared/campaign.js', 'shared/tokens.css'];

async function refreshCache(fetchFn) {
  const root = new URL('../', import.meta.url);
  await Promise.all(CODE.map((f) => fetchFn(new URL(f, root).href, { cache: 'reload' }).catch(() => {})));
}

export function startAutoUpdate({
  url = new URL('../version.json', import.meta.url).href,
  everyMs = 120000,
  canReload = () => true,
  reload = () => location.reload(),
  fetchFn = globalThis.fetch,
} = {}) {
  let loaded = null;
  const check = async () => {
    try {
      const r = await fetchFn(url + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()).v;
      if (loaded === null) { loaded = v; return; }
      if (shouldReload(loaded, v) && canReload()) {
        await refreshCache(fetchFn);
        reload();
      }
    } catch { /* offline or not deployed: try again next time */ }
  };
  check();
  const id = setInterval(check, everyMs);
  return { stop: () => clearInterval(id), check };
}
