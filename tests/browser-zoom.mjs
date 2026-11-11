import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.ORION_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__orion_dev/version',r=>r.fulfill({status:404}));
await page.addInitScript(()=>{localStorage.setItem('orion_onboarding_complete','true');localStorage.setItem('orion_changelog_dismissed','1.1.2-map-reliability');localStorage.setItem('orion:shellVersion','3');localStorage.setItem('orion:panelCollapsed',JSON.stringify({commandPanel:false,telemetryPanel:true}));localStorage.setItem('orion:timelineCollapsed','1');});
try {
 await page.goto('http://127.0.0.1:4174/');
 await page.waitForFunction(()=>window.viewer&&platformFeeds.weatherRadar?.status==='online',null,{timeout:90000});
 await page.waitForFunction(()=>!document.getElementById('orionLoadingScreen'));
 await page.locator('.orion-dock-button[data-route="timeline"]').click();
 console.log('Initial weather loaded');
 for(const mode of ['infrared','radar']) {
  await page.locator('#weatherMapModeSelect').selectOption(mode,{force:true});
  await page.waitForFunction(m=>platformFeeds.weatherRadar?.payload?.weather_mode===m&&platformFeeds.weatherRadar.status==='online',mode,{timeout:90000});
  await page.evaluate(()=>{const p=platformFeeds.weatherRadar.payload;p.frames=p.frames.slice(-4);p.latest=p.frames.at(-1);});
  console.log(mode,'loaded');
  await page.locator('#speedSelect').selectOption('24');await page.locator('#playPause').click();
  await page.waitForFunction(()=>appState.playing,null,{timeout:120000});
  console.log(mode,'playing');
  await page.evaluate(()=>{
   window.zoomAudit={swaps:0,unready:0,last:null};
   window.removeZoomAudit=viewer.scene.postRender.addEventListener(()=>{
    const l=Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).find(l=>l.orionKey==='zoomWeather');
    if(l&&l!==zoomAudit.last){if(zoomAudit.last){zoomAudit.swaps++;if(!Orion.FrameBuffer.visibleReady(l,viewer.scene.globe))zoomAudit.unready++;}zoomAudit.last=l;}
   });
  });
  for(const height of [600000,180000,900000]) {
   await page.evaluate(h=>new Promise(resolve=>viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(-96,38,h),duration:1,complete:resolve,cancel:resolve})),height);
   await page.waitForFunction(()=>!appState.cameraMoving);console.log(mode,'zoom',height);
   assert.equal(await page.evaluate(()=>appState.playing),true,await page.evaluate(()=>JSON.stringify({message:document.getElementById('frameBufferStatus').textContent,error:platformFeeds.weatherRadar.error})));
   await page.waitForFunction(()=>{const l=Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).find(l=>l.orionKey==='zoomWeather');return l&&l.imageryProvider.rectangle.east-l.imageryProvider.rectangle.west<1&&l.imageryProvider.tileWidth>=2048;},null,{timeout:90000});
  }
  await page.locator('#playPause').click();
  await page.waitForFunction(()=>Array.from({length:viewer.imageryLayers.length},(_,i)=>viewer.imageryLayers.get(i)).some(l=>l.orionKey==='zoomWeather'&&l.imageryProvider.tileWidth===4096),null,{timeout:90000});
  const audit=await page.evaluate(()=>{removeZoomAudit();return {swaps:zoomAudit.swaps,unready:zoomAudit.unready};});
  assert.ok(audit.swaps>0,'Playback must complete at least one replacement while zooming: '+JSON.stringify(audit));assert.equal(audit.unready,0,'Every replacement must cover all visible terrain tiles');
  await page.screenshot({path:`artifacts/zoom-${mode}.png`});console.log(mode,'zoom/playback/detail checks passed',audit);
 }
 assert.deepEqual(errors,[]);
}catch(error){console.log(await page.evaluate(()=>({status:document.getElementById('frameBufferStatus').textContent,error:platformFeeds.weatherRadar.error,playing:appState.playing,layers:Array.from({length:viewer.imageryLayers.length},(_,i)=>{const l=viewer.imageryLayers.get(i);return {key:l.orionKey,width:l.imageryProvider.tileWidth,rect:l.imageryProvider.rectangle,ready:Orion.FrameBuffer.visibleReady(l,viewer.scene.globe)};})})));throw error;}finally{await browser.close();}
