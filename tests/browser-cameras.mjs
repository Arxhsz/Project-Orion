import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.ORION_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__orion_dev/version',r=>r.fulfill({status:404}));
await page.addInitScript(()=>{localStorage.setItem('orion_onboarding_complete','true');localStorage.setItem('orion_changelog_dismissed','1.1.2-map-reliability');localStorage.setItem('orion:shellVersion','3');localStorage.setItem('orion:panelCollapsed',JSON.stringify({commandPanel:false,telemetryPanel:true}));localStorage.setItem('orion:timelineCollapsed','1');});
try{
 await page.goto('http://127.0.0.1:4174/');await page.waitForFunction(()=>window.CameraNet&&window.viewer);await page.waitForFunction(()=>!document.getElementById('orionLoadingScreen'));
 const result=await page.evaluate(async()=>{const r=await fetch('/live/cameras?provider=publicwebcam');const d=await r.json();const cameras=d.cameras||d.items||[];CameraNet.state.cameras=cameras;const c=cameras.find(c=>c.stream_type==='embed');if(c)CameraNet.selectCameraById(viewer,c.id);return {count:cameras.length,id:c?.id};});
 assert.equal(result.count,4,JSON.stringify(result));
 await page.waitForFunction(()=>document.querySelector('#cameraFrame iframe')?.src.startsWith('https://g1.ipcamlive.com/'),null,{timeout:30000});
 await page.getByRole('button',{name:'☆ Favorite',exact:true}).click();
 assert.ok(await page.evaluate(id=>JSON.parse(localStorage.getItem('orion_camera_favorites')).includes(id),result.id));
 await page.getByRole('button',{name:'Center',exact:true}).click();await page.waitForFunction(()=>!viewer.camera._currentFlight);
 await page.getByRole('button',{name:'Nearby cameras',exact:true}).click();assert.ok(await page.locator('#cameraNearby').count());
 await page.screenshot({path:'artifacts/camera-live-video.png'});console.log('Live camera embed, favorites, centering and nearby cameras passed',result.count);assert.deepEqual(errors,[]);
}finally{await browser.close();}
