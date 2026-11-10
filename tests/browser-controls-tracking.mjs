import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.ORION_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('**/__orion_dev/version',r=>r.fulfill({status:404}));
await page.addInitScript(()=>{localStorage.setItem('orion_onboarding_complete','true');localStorage.setItem('orion_changelog_dismissed','1.1.2-map-reliability');});
try {
 await page.goto('http://127.0.0.1:4174/');await page.waitForFunction(()=>window.viewer&&!document.getElementById('orionLoadingScreen'),null,{timeout:90000});
 await page.locator('#workspace-tab-controls').click();
 for(const [label,expression] of [['Allow globe rotation','viewer.scene.screenSpaceCameraController.enableRotate'],['Allow zoom','viewer.scene.screenSpaceCameraController.enableZoom'],['Atmosphere','viewer.scene.skyAtmosphere.show'],['Sun lighting','viewer.scene.globe.enableLighting'],['Place labels','appState.layers.labels']]){
  const box=page.getByLabel(label,{exact:true});await box.uncheck();assert.equal(await page.evaluate(e=>(0,eval)(e),expression),false,label);await box.check();assert.equal(await page.evaluate(e=>(0,eval)(e),expression),true,label);
 }
 console.log('Globe controls passed');
 await page.locator('#workspace-tab-layers').click();await page.locator('#orbitalDatasetSelect').selectOption('satScience');await page.locator('#trackSatellites').check({force:true});
 await page.waitForFunction(()=>platformFeeds.satScience?.status==='online'&&Orion.Renderer.Orbital.collection.length>0,null,{timeout:90000});
 await page.evaluate(()=>{if(!appState.tracking.live)document.getElementById('liveModeToggle').click();window.firstSatellite={id:Orion.Renderer.Orbital.collection.get(0).id.orionItemId,position:Cesium.Cartesian3.clone(Orion.Renderer.Orbital.collection.get(0).position)};});
 await page.waitForFunction(()=>{const c=Orion.Renderer.Orbital.collection;for(let i=0;i<c.length;i++){const p=c.get(i);if(p.id.orionItemId===firstSatellite.id)return Cesium.Cartesian3.distance(p.position,firstSatellite.position)>100;}return false;},null,{timeout:20000});
 console.log('Real satellite catalog and propagated motion passed:',await page.evaluate(()=>platformFeeds.satScience.items.length));
 await page.locator('#trackSatellites').uncheck({force:true});await page.waitForFunction(()=>Orion.Renderer.Orbital.collection.length===0);
 for(const width of [1440,900,615,390]){
  await page.setViewportSize({width,height:800});
  for(const tab of ['explore','layers','controls']){
   await page.locator('#workspace-tab-'+tab).click();
   const layout=await page.evaluate(()=>{const panel=document.getElementById('commandPanel'),nav=document.querySelector('.workspace-tabs'),body=panel.querySelector('.panel-body'),timeline=document.getElementById('timelineHud');body.scrollTop=body.scrollHeight;return {panelBottom:panel.getBoundingClientRect().bottom,timelineTop:timeline.getBoundingClientRect().top,bodyTop:body.getBoundingClientRect().top,navBottom:nav.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.ok(layout.panelBottom<layout.timelineTop,JSON.stringify({width,tab,layout}));assert.ok(layout.bodyTop>=layout.navBottom,JSON.stringify({width,tab,layout}));assert.equal(layout.overflow,false);
  }
  await page.screenshot({path:`artifacts/workspace-spacing-${width}.png`});
 }
 assert.deepEqual(errors,[]);console.log('Control effects, satellite toggle-off, tab scroll separation and timeline spacing passed at four widths');
}catch(error){console.log(await page.evaluate(()=>({status:platformFeeds.satScience?.status,error:platformFeeds.satScience?.error,count:platformFeeds.satScience?.items?.length,rendered:Orion.Renderer.Orbital.collection?.length})));throw error;}finally{await browser.close();}
