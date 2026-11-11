import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,executablePath:process.env.ORION_BROWSER_EXECUTABLE||(fs.existsSync(chrome)?chrome:undefined)});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__orion_dev/version',r=>r.fulfill({status:404}));
await page.addInitScript(()=>{localStorage.setItem('orion_onboarding_complete','true');localStorage.setItem('orion_changelog_dismissed','1.1.2-map-reliability');localStorage.setItem('orion:shellVersion','4');});
fs.mkdirSync('artifacts',{recursive:true});
try {
 await page.goto(process.env.ORION_TEST_URL||'http://127.0.0.1:4174/?orionStatic=1');
 await page.waitForFunction(()=>window.viewer&&Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).some(l=>l.orionKey==='zoomWeather'),null,{timeout:60000});
 await page.waitForFunction(()=>!document.getElementById('orionLoadingScreen'));
 await page.locator('.orion-dock-button[data-route="timeline"]').click();
 await page.evaluate(()=>{
   window.playbackAudit={missing:0,partial:0,frames:[],widths:[],wraps:0,lastTime:0,renderErrors:[]};
   viewer.scene.renderError.addEventListener((scene,error)=>playbackAudit.renderErrors.push(error.message));
   viewer.scene.postRender.addEventListener(()=>{
     if(!appState.playing)return;
     const l=Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).find(l=>l.orionKey==='zoomWeather');
     if(!l||l.alpha<.5)playbackAudit.missing++;
     if(l){
       const rect=l.imageryProvider.rectangle;
       if(rect.east-rect.west<1)playbackAudit.partial++;
       if(playbackAudit.frames.at(-1)!==l.orionFrameKey){
         playbackAudit.frames.push(l.orionFrameKey);
         playbackAudit.widths.push(l.imageryProvider.tileWidth);
         const time=Date.parse(l.orionFrameTime);
         if(time<playbackAudit.lastTime)playbackAudit.wraps++;
         playbackAudit.lastTime=time;
       }
     }
   });
   // Cover both ends of the full history, including the large last-to-first jump.
   const p=platformFeeds.weatherRadar.payload;
   p.frames=p.frames.slice(0,4).concat(p.frames.slice(-4));p.latest=p.frames.at(-1);
 });
 await page.locator('#speedSelect').selectOption('24');
 await page.locator('#playPause').click();
 await page.waitForFunction(()=>appState.playing,null,{timeout:120000});
 await page.waitForFunction(()=>playbackAudit.frames.length>12,null,{timeout:60000});
 await page.locator('#playPause').click();
 const audit=await page.evaluate(()=>playbackAudit);
 assert.equal(audit.missing,0,'A complete preceding frame must remain visible');
 assert.equal(audit.partial,0,'Global view must not be replaced by a small rectangle');
 assert.deepEqual(audit.renderErrors,[]);
 assert.ok(audit.frames.length>8,'Loop should repeat the real frame sequence');
 assert.ok(audit.wraps>=1,'At least one last-to-first transition must render');
 assert.ok(audit.widths.slice(1).every(width=>width>=2048),'Restart and all playback frames must retain playback resolution');
 await page.screenshot({path:'artifacts/buffered-satellite.png'});
 console.log('24 fps requested: no blank or cropped frames across loop',audit.frames.length);
 await page.locator('#timelineLoop').click();
 await page.locator('#playPause').click();
 await page.waitForFunction(()=>appState.playing);
 await page.waitForFunction(()=>!appState.playing,null,{timeout:60000});
 assert.equal(await page.locator('#timelineRange').inputValue(),await page.locator('#timelineRange').getAttribute('max'));
 console.log('Loop off stops at the final source frame');
 await page.locator('#weatherMapModeSelect').selectOption('precipitation',{force:true});
 await page.waitForFunction(()=>platformFeeds.weatherRadar.payload?.weather_mode==='precipitation'&&Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).some(l=>l.orionKey==='zoomWeather'&&l.orionFrameKey.startsWith('precipitation:')),null,{timeout:60000});
 const count=await page.evaluate(()=>platformFeeds.weatherRadar.payload.frames.length);
 assert.ok(count>=200,'Expanded forecast history should exceed 200 hourly frames');
 await page.evaluate(()=>{const p=platformFeeds.weatherRadar.payload;p.frames=p.frames.slice(0,12);p.latest=p.frames[0];});
 await page.locator('#playPause').click();await page.waitForFunction(()=>appState.playing,null,{timeout:60000});
 await page.waitForFunction(()=>!appState.playing,null,{timeout:60000});
 await page.screenshot({path:'artifacts/buffered-precipitation.png'});
 console.log('Precipitation raster buffering passed;',count,'available forecast frames');
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
