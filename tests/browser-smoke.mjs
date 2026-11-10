import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.ORION_BROWSER_EXECUTABLE || (fs.existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
fs.mkdirSync('artifacts', { recursive: true });
try {
  await page.route('**/__orion_dev/version', r => r.fulfill({status:404}));
  await page.addInitScript(() => {
    localStorage.setItem('orion_onboarding_complete', 'true');
    localStorage.setItem('orion_changelog_dismissed', '1.1.2-map-reliability');
  });
  await page.goto(process.env.ORION_TEST_URL || 'http://127.0.0.1:4174/?orionStatic=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.platformFeeds?.weatherRadar?.status === 'online', null, { timeout: 45000 });
  const frameKey = () => page.evaluate(() => Array.from({ length: viewer.imageryLayers.length }, (_, i) => viewer.imageryLayers.get(i)).find(layer => layer.orionKey === 'zoomWeather')?.orionFrameKey);
  const initial = await frameKey();
  assert.ok(initial, 'Weather imagery must be present');
  await page.locator('#timelineRange').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(initial => Array.from({ length: viewer.imageryLayers.length }, (_, i) => viewer.imageryLayers.get(i)).find(layer => layer.orionKey === 'zoomWeather')?.orionFrameKey !== initial, initial);
  const replay = await frameKey();
  assert.notEqual(initial, replay);
  await page.locator('#weatherLatest').click();
  await page.waitForFunction(replay => Array.from({ length: viewer.imageryLayers.length }, (_, i) => viewer.imageryLayers.get(i)).find(layer => layer.orionKey === 'zoomWeather')?.orionFrameKey !== replay, replay);

  await page.evaluate(() => {
    OrionLiveLocation.testPosition({ coords: { latitude: 38.8977, longitude: -77.0365, accuracy: 20 }, timestamp: Date.now() });
    OrionLiveLocation.center();
  });
  await page.waitForFunction(() => !viewer.camera._currentFlight);
  const center = await page.evaluate(() => {
    const p = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, Cesium.Cartesian3.fromDegrees(-77.0365, 38.8977));
    return { x: p.x, y: p.y, w: viewer.canvas.clientWidth, h: viewer.canvas.clientHeight };
  });
  assert.ok(Math.abs(center.x - center.w / 2) < 10 && Math.abs(center.y - center.h / 2) < 10, JSON.stringify(center));
  console.log('Camera centered:', center);

  for (const mode of ['radar', 'infrared', 'satellite-global', 'precipitation', 'temperature', 'wet-bulb', 'feels-like', 'humidity', 'dewpoint', 'pressure', 'gusts', 'clouds', 'rain', 'snow', 'wind', 'satellite']) {
    await page.locator('#weatherMapModeSelect').selectOption(mode, { force: true });
    await page.waitForFunction(mode => platformFeeds.weatherRadar?.status === 'online' && platformFeeds.weatherRadar?.payload?.weather_mode === mode, mode, { timeout: 45000 });
    const frames = await page.evaluate(() => platformFeeds.weatherRadar.payload.frames.length);
    assert.ok(frames > 1, `${mode}: historical frames required`);
    console.log(mode, frames, 'frames');
  }

  await page.locator('#workspace-tab-layers').click();
  for (const [id, layer] of [['platformEarthquakes', 'earthquakes'], ['platformVolcanoes', 'volcanoes'], ['platformWildfires', 'wildfires']]) {
    await page.locator('label').filter({ has: page.locator('#' + id) }).click();
    await page.waitForFunction(id => document.getElementById(id)?.checked, id);
    await page.waitForFunction(layer => ['online', 'empty'].includes(platformFeeds[layer]?.status), layer, { timeout: 45000 });
    console.log(layer, await page.evaluate(layer => platformFeeds[layer].items.length, layer), 'reports');
  }
  const volcano = await page.evaluate(() => Object.values(orionSystems.entities).find(record => record.layerId === 'volcanoes')?.id);
  assert.ok(volcano, 'Volcano status catalog should contain records');
  await page.getByRole('searchbox', { name: 'Filter intel layers' }).fill('volcano');
  assert.equal(await page.locator('[data-layer-id="earthquakes"]').isVisible(), false);
  assert.equal(await page.locator('[data-layer-id="volcanoes"]').isVisible(), true);
  await page.getByRole('searchbox', { name: 'Filter intel layers' }).fill('');
  await page.locator('#workspace-tab-explore').click();
  await page.locator('#homeButton').click({ force: true });
  await page.waitForFunction(() => !viewer.camera._currentFlight);
  await page.waitForFunction(() => viewer.scene.globe.tilesLoaded, null, { timeout: 30000 });
  await page.screenshot({ path: 'artifacts/orion-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.platformFeeds?.weatherRadar?.status === 'online', null, { timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('orionLoadingScreen'), null, { timeout: 30000 });
  const panels = await page.evaluate(() => ({ command: document.getElementById('commandPanel').getBoundingClientRect().toJSON(), telemetry: document.getElementById('telemetryPanel').getBoundingClientRect().toJSON(), width: document.documentElement.scrollWidth }));
  assert.ok(panels.command.right <= panels.telemetry.left, 'Mobile panels overlap');
  assert.ok(panels.width <= 390, 'Mobile horizontal overflow');
  await page.screenshot({ path: 'artifacts/orion-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('Timeline, weather modes, location, hazard feeds, layer filter, and mobile layout passed.');
} finally {
  await browser.close();
}
