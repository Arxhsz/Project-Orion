import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.ORION_BROWSER_EXECUTABLE || (fs.existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
fs.mkdirSync('artifacts', { recursive: true });

await page.route('**/__orion_dev/version', route => route.fulfill({ status: 404 }));
await page.addInitScript(() => {
  localStorage.setItem('orion_onboarding_complete', 'true');
  localStorage.setItem('orion_changelog_dismissed', '1.1.2-map-reliability');
  localStorage.removeItem('orion:shellVersion');
  localStorage.removeItem('orion:panelCollapsed');
  localStorage.removeItem('orion:timelineCollapsed');
});

try {
  await page.goto(process.env.ORION_TEST_URL || 'http://127.0.0.1:4174/?orionStatic=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.viewer && !document.getElementById('orionLoadingScreen'), null, { timeout: 60000 });
  await page.locator('.orion-command-dock').waitFor();

  const desktop = await page.evaluate(() => {
    const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
    return {
      command: rect('commandPanel'),
      telemetry: rect('telemetryPanel'),
      timeline: rect('timelineHud'),
      header: document.querySelector('.brand-hud').getBoundingClientRect().toJSON(),
      tools: document.querySelector('.orion-map-tools').getBoundingClientRect().toJSON(),
      dock: document.querySelector('.orion-command-dock').getBoundingClientRect().toJSON(),
      canvas: viewer.canvas.getBoundingClientRect().toJSON(),
      commandHidden: getComputedStyle(document.getElementById('commandPanel')).display === 'none',
      telemetryHidden: getComputedStyle(document.getElementById('telemetryPanel')).display === 'none',
      timelineHidden: getComputedStyle(document.getElementById('timelineHud')).display === 'none',
      scrollWidth: document.documentElement.scrollWidth
    };
  });
  assert.equal(desktop.commandHidden, true);
  assert.equal(desktop.telemetryHidden, true);
  assert.equal(desktop.timelineHidden, true);
  assert.equal(desktop.dock.left, 0);
  assert.equal(Math.round(desktop.dock.width), 60);
  assert.ok(desktop.header.left >= desktop.dock.right - 1, JSON.stringify(desktop));
  assert.equal(Math.round(desktop.header.right), 1440);
  assert.ok(desktop.tools.left >= desktop.dock.right, JSON.stringify(desktop));
  assert.equal(desktop.scrollWidth, 1440);
  assert.ok(desktop.canvas.width >= 1400 && desktop.canvas.height >= 990);

  await page.getByRole('button', { name: 'CameraNet', exact: true }).click();
  assert.equal(await page.locator('#commandPanel').evaluate(element => getComputedStyle(element).display !== 'none'), true);
  assert.equal(await page.locator('#workspace-tab-layers').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.layer-search').inputValue(), 'camera');
  assert.equal(await page.locator('[data-layer-id="cameras"]').isVisible(), true);

  await page.getByRole('button', { name: 'Infrastructure', exact: true }).click();
  assert.equal(await page.locator('.layer-search').inputValue(), 'power + cable');
  assert.equal(await page.locator('[data-layer-id="powerGrid"]').isVisible(), true);
  assert.equal(await page.locator('[data-layer-id="underseaCables"]').isVisible(), true);
  assert.equal(await page.locator('[data-layer-id="earthquakes"]').isVisible(), false);
  assert.equal(await page.locator('.orion-dock-button[data-route="infrastructure"]').evaluate(element => element.classList.contains('is-active')), true);
  const drawerStack = await page.evaluate(() => ({
    panel: Number(getComputedStyle(document.getElementById('commandPanel')).zIndex),
    tools: Number(getComputedStyle(document.querySelector('.orion-map-tools')).zIndex)
  }));
  assert.ok(drawerStack.panel > drawerStack.tools, JSON.stringify(drawerStack));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: 'artifacts/orion-shell-drawer.png' });

  await page.getByRole('button', { name: 'Live data status', exact: true }).click();
  assert.equal(await page.locator('.orion-feed-popover').isVisible(), true);
  assert.ok(await page.locator('.orion-feed-row').count() >= 1);
  await page.screenshot({ path: 'artifacts/orion-shell-feeds.png' });
  await page.getByRole('button', { name: 'Live data status', exact: true }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();

  const beforeZoom = await page.evaluate(() => viewer.camera.positionCartographic.height);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForFunction(before => viewer.camera.positionCartographic.height < before, beforeZoom);
  await page.waitForFunction(() => location.hash.startsWith('#orion&') && location.hash.includes('mode='));

  await page.getByRole('button', { name: 'Copy shareable view link', exact: true }).click();
  await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('#orion&lat='));
  const shareLink = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(shareLink, /#orion&lat=[^&]+&lon=[^&]+&h=\d+.*&mode=.*&t=\d+/);

  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  assert.equal(await page.locator('#timelineHud').evaluate(element => getComputedStyle(element).display !== 'none'), true);
  assert.equal(await page.locator('#commandPanel').evaluate(element => getComputedStyle(element).display === 'none'), true);
  assert.equal(await page.locator('#feedMeta').evaluate(element => element.scrollHeight <= element.clientHeight), true);
  await page.screenshot({ path: 'artifacts/orion-shell-timeline.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#timelineHud').evaluate(element => getComputedStyle(element).display === 'none'), true);
  await page.keyboard.press('l');
  assert.equal(await page.locator('#workspace-tab-layers').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('d');
  assert.equal(await page.locator('#telemetryPanel').evaluate(element => getComputedStyle(element).display !== 'none'), true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  assert.equal(await page.locator('#searchInput').evaluate(element => document.activeElement === element), true);
  assert.equal(await page.locator('.orion-dock-button[data-route="search"]').evaluate(element => element.classList.contains('is-active')), true);
  await page.screenshot({ path: 'artifacts/orion-shell-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.removeItem('orion:panelCollapsed');
    localStorage.removeItem('orion:timelineCollapsed');
    localStorage.removeItem('orion:shellVersion');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.viewer && !document.getElementById('orionLoadingScreen'), null, { timeout: 60000 });
  await page.locator('.orion-mobile-nav').waitFor();

  await page.getByRole('button', { name: 'Map', exact: true }).click();
  assert.equal(await page.locator('#commandPanel').evaluate(element => element.classList.contains('collapsed')), true);
  assert.equal(await page.locator('#telemetryPanel').evaluate(element => element.classList.contains('collapsed')), true);
  assert.equal(await page.locator('#timelineHud').evaluate(element => element.classList.contains('collapsed')), true);
  await page.screenshot({ path: 'artifacts/orion-shell-mobile-map.png' });

  await page.locator('.orion-mobile-nav').getByRole('button', { name: 'Layers', exact: true }).click();
  assert.equal(await page.locator('#commandPanel').evaluate(element => element.classList.contains('collapsed')), false);
  assert.equal(await page.locator('#workspace-tab-layers').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#telemetryPanel').evaluate(element => element.classList.contains('collapsed')), true);

  await page.locator('.orion-mobile-nav').getByRole('button', { name: 'Intel', exact: true }).click();
  assert.equal(await page.locator('#commandPanel').evaluate(element => element.classList.contains('collapsed')), true);
  assert.equal(await page.locator('#telemetryPanel').evaluate(element => element.classList.contains('collapsed')), false);
  const mobile = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    header: document.querySelector('.brand-hud').getBoundingClientRect().toJSON(),
    inspector: document.getElementById('telemetryPanel').getBoundingClientRect().toJSON(),
    nav: document.querySelector('.orion-mobile-nav').getBoundingClientRect().toJSON()
  }));
  assert.equal(mobile.width, 390);
  assert.ok(mobile.header.bottom <= mobile.inspector.top, JSON.stringify(mobile));
  assert.ok(mobile.inspector.bottom <= mobile.nav.top, JSON.stringify(mobile));
  await page.screenshot({ path: 'artifacts/orion-shell-mobile.png' });

  assert.deepEqual(errors, []);
  console.log('Map-first shell, map tools, share state, and responsive navigation passed.');
} finally {
  await browser.close();
}
