import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chrome = process.env.ORION_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(chrome) ? chrome : undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const cameraRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (request.url().includes('pages-data/live/camera')) cameraRequests.push(new URL(request.url()).pathname);
});
await page.route('**/__orion_dev/version', route => route.fulfill({ status: 404 }));
await page.addInitScript(() => {
  localStorage.setItem('orion_onboarding_complete', 'true');
  localStorage.setItem('orion_changelog_dismissed', '1.1.2-map-reliability');
});

try {
  await page.goto(process.env.ORION_TEST_URL || 'http://127.0.0.1:4174/?orionStatic=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.viewer && !document.getElementById('orionLoadingScreen'), null, { timeout: 60000 });
  await page.locator('.orion-dock-button[data-route="cameras"]').click();
  await page.locator('#platformCameras').check({ force: true });
  await page.waitForFunction(() => CameraNet.state.providerStatus === 'active', null, { timeout: 30000 });
  assert.ok(cameraRequests.some(path => path.endsWith('/cameras-index.json')), cameraRequests.join('\n'));
  assert.equal(cameraRequests.some(path => path.endsWith('/cameras.json')), false, cameraRequests.join('\n'));

  await page.evaluate(() => new Promise(resolve => viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-80.2, 26.7, 260000),
    duration: 0.6,
    complete: resolve,
    cancel: resolve
  })));
  await page.waitForFunction(() => Object.keys(CameraNet.state.staticTilePromises).length > 0 && CameraNet.state.cameras.some(camera => !camera._summary), null, { timeout: 30000 });
  assert.ok(cameraRequests.some(path => path.includes('/camera-tiles/')), cameraRequests.join('\n'));
  assert.ok((await page.evaluate(() => CameraNet.state.providerCount)) >= 5000);
  assert.deepEqual(errors, []);
  console.log('CameraNet spatial index and viewport tile loading passed.');
} finally {
  await browser.close();
}
