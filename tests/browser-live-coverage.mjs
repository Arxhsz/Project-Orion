import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.ORION_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__orion_dev/version',r=>r.fulfill({status:404}));
await page.addInitScript(()=>{localStorage.setItem('orion_onboarding_complete','true');localStorage.setItem('orion_changelog_dismissed','1.1.2-map-reliability');});
try {
 await page.goto('http://127.0.0.1:4174/');await page.waitForFunction(()=>window.viewer&&platformFeeds.weatherRadar?.status==='online',null,{timeout:60000});
 await page.waitForFunction(()=>!document.getElementById('orionLoadingScreen'));
 await page.locator('#weatherMapModeSelect').selectOption('infrared');
 await page.waitForFunction(()=>platformFeeds.weatherRadar?.payload?.weather_mode==='infrared'&&platformFeeds.weatherRadar.status==='online',null,{timeout:60000});
 await page.locator('#timelineRange').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#workspace-tab-layers').click();
 await page.evaluate(()=>{if(appState.tracking.live)document.getElementById('liveModeToggle').click();document.getElementById('liveModeToggle').click();});
 await page.waitForFunction(()=>document.getElementById('timelineRange').value===document.getElementById('timelineRange').max);
 assert.match(await page.locator('#currentDateLabel').textContent(),/LATEST/);
 await page.waitForFunction(()=>Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).some(l=>l.orionKey==='zoomWeather'&&l.orionFrameTime===platformFeeds.weatherRadar.payload.frames.at(-1).time),null,{timeout:60000});
 const coverage=await page.evaluate(()=>{const l=Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).find(l=>l.orionKey==='zoomWeather');return {west:l.imageryProvider.rectangle.west,east:l.imageryProvider.rectangle.east,context:platformFeeds.weatherRadar.payload.frames.at(-1).context,time:l.orionFrameTime};});
 assert.ok(coverage.east-coverage.west>6.2,JSON.stringify(coverage));assert.ok(coverage.context,'Latest regional imagery must have global context');
 await page.waitForFunction(()=>Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).some(l=>l.orionKey==='zoomWeather'&&l.imageryProvider.tileWidth===4096),null,{timeout:90000});
 await page.screenshot({path:'artifacts/live-coverage-fixed.png'});assert.deepEqual(errors,[]);console.log('Live Mode selects latest NOAA frame, retains global context and full-globe coverage',coverage.time);
}finally{await browser.close();}
