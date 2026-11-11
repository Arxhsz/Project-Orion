import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.ORION_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__orion_dev/version',r=>r.fulfill({status:404}));
await page.addInitScript(()=>{localStorage.setItem('orion_onboarding_complete','true');localStorage.setItem('orion_changelog_dismissed','1.1.2-map-reliability');localStorage.setItem('orion:shellVersion','4');});
try {
 await page.goto('http://127.0.0.1:4174/');
 await page.waitForFunction(()=>window.viewer);
 await page.waitForFunction(()=>Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).some(l=>l.orionKey==='zoomWeather'&&l.orionFrameKey.includes(':4096:')),null,{timeout:120000});
 console.log('Idle weather image upgraded through medium to 4096 pixels');
 await page.waitForFunction(()=>!document.getElementById('orionLoadingScreen'));
 await page.locator('.orion-dock-button[data-route="layers"]').click();
 await page.locator('label').filter({has:page.locator('#platformPower')}).click();
 await page.waitForFunction(()=>platformFeeds.powerGrid?.status==='online'&&platformFeeds.powerGrid.items.length>1000&&Orion.Renderer.Infrastructure.PowerGrid.collection.length>0,null,{timeout:60000});
 console.log('Global power grid lines',await page.evaluate(()=>({provider:platformFeeds.powerGrid.items.length,rendered:Orion.Renderer.Infrastructure.PowerGrid.collection.length})));
 await page.locator('label').filter({has:page.locator('#platformPower')}).click();
 await page.locator('label').filter({has:page.locator('#platformMarine')}).click();
 await page.waitForFunction(()=>platformFeeds.marineTraffic?.status==='online',null,{timeout:60000});
 console.log('AIS reports',await page.evaluate(()=>platformFeeds.marineTraffic.items.length));
 await page.screenshot({path:'artifacts/quality-oct05.png'});
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
