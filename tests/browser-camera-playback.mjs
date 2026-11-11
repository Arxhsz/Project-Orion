import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chrome = process.env.ORION_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(chrome) ? chrome : undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/__orion_dev/version', route => route.fulfill({ status: 404 }));
await page.route('**/camera/health*', async route => {
  await new Promise(resolve => setTimeout(resolve, 8000));
  await route.continue();
});
await page.addInitScript(() => {
  localStorage.setItem('orion_onboarding_complete', 'true');
  localStorage.setItem('orion_changelog_dismissed', '1.1.2-map-reliability');
  localStorage.setItem('orion:shellVersion', '4');
});

try {
  await page.goto(process.env.ORION_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.CameraNet && window.viewer && !document.getElementById('orionLoadingScreen'), null, { timeout: 60000 });

  const startedAt = Date.now();
  const selected = await page.evaluate(() => {
    const camera = {
      id: 'caltrans-d4-283',
      name: 'W580 at 35th Avenue',
      provider: 'Caltrans CCTV',
      state: 'CA',
      lat: 37.804,
      lon: -122.207,
      stream_type: 'hls',
      stream_available: true,
      stream_url: location.origin + '/camera/hls?url=' + encodeURIComponent('https://wzmedia.dot.ca.gov/D4/W580_at_35th_Av.stream/playlist.m3u8') + '&cid=caltrans-d4-283'
    };
    CameraNet.state.cameras = [camera];
    return CameraNet.selectCameraById(viewer, camera.id);
  });
  assert.equal(selected, true);
  await page.locator('#cameraNetVideo').waitFor({ state: 'attached', timeout: 3500 });
  assert.ok(Date.now() - startedAt < 4000, 'Player creation was blocked by the independent health probe');

  await page.waitForFunction(() => {
    const video = document.getElementById('cameraNetVideo');
    return video && video.readyState >= 2 && CameraNet.state.playbackPhase === 'playing';
  }, null, { timeout: 35000 });

  await page.locator('#cameraNetVideo').evaluate(video => video.dispatchEvent(new Event('waiting')));
  await page.waitForFunction(() => CameraNet.state.playbackPhase === 'buffering');
  assert.equal(await page.locator('.camera-playback-status').isVisible(), true);
  await page.locator('#cameraNetVideo').evaluate(video => video.dispatchEvent(new Event('canplay')));
  await page.waitForFunction(() => CameraNet.state.playbackPhase === 'playing');

  await page.locator('#cameraClose').click();
  await page.waitForFunction(() => CameraNet.state.playbackPhase === 'idle');
  const closedState = await page.evaluate(() => ({
    hidden: document.getElementById('cameraWindow').classList.contains('hidden'),
    hlsReleased: CameraNet.state.currentHls === null,
    selectedReleased: CameraNet.state.selectedCamera === null
  }));
  assert.deepEqual(closedState, { hidden: true, hlsReleased: true, selectedReleased: true });
  assert.deepEqual(errors, []);
  console.log('CameraNet starts before health checks, plays HLS, exposes buffering state, and releases playback on close.');
} finally {
  await browser.close();
}
