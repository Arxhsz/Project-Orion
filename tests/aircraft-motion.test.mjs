import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function setup(){let now=100000;const window={Orion:{Runtime:{StateManager:{isLayerEnabled:()=>true}},SimulationClock:{mode:'live'},Telemetry:{Samplers:{intel:i=>i}}}};const Cesium={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:x=>x*Math.PI/180},Color:{WHITE:{withAlpha:x=>x}}};vm.runInNewContext(fs.readFileSync(new URL('../orion-renderer-primitive.js',import.meta.url),'utf8'),{window,Cesium,Date:{now:()=>now}});return {r:window.Orion.Renderer.Aviation,t:n=>now=n,window};}
test('aircraft advance between reports without requiring a fetch or camera movement, then stop at the report',()=>{
 const {r,t}=setup();r.collection={};r.interpolationMs=1000;
 r.ingestAircraft({id:'abc',lon:10,lat:20,height:1000,heading:90,timestamp:100},0);
 t(101000);r.ingestAircraft({id:'abc',lon:12,lat:20,height:2000,heading:90,timestamp:101},0);
 const b={};r.billboardsById.abc=b;t(101500);r.updatePositions();assert.equal(b.position.lon,11);assert.equal(b.position.height,1500);assert.equal(b.rotation,-Math.PI/2);
 t(105000);r.updatePositions();assert.equal(b.position.lon,12);
 t(110000);r.updatePositions();assert.equal(b.position.lon,12);
});
test('new aircraft reports preserve visual continuity, dateline crossings take the short path, and older reports cannot rewind',()=>{
 const {r,t}=setup();r.interpolationMs=1000;r.ingestAircraft({id:'a',lon:179,lat:0,height:0,timestamp:100},0);
 t(101000);r.ingestAircraft({id:'a',lon:-179,lat:0,height:0,timestamp:101},0);
 t(101500);assert.equal(r.interpolateRecord(r.aircraftById.a).lon,-180);
 r.ingestAircraft({id:'a',lon:-178,lat:0,height:0,timestamp:102},0);assert.equal(r.interpolateRecord(r.aircraftById.a).lon,-180);
 r.ingestAircraft({id:'a',lon:0,lat:0,height:0,timestamp:99},0);assert.equal(r.aircraftById.a.current.lon,-178);
});
test('live transport polling keeps its cadence at orbital zoom',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=app.indexOf('    platformLayerTimer = window.setInterval',app.indexOf('  function initPlatformSystems('));
 const source=app.slice(start,app.indexOf('    window.orionSystems =',start));let tick,now=40000;const calls=[];
 vm.runInNewContext(source,{window:{setInterval:f=>{tick=f;}},viewer:{camera:{positionCartographic:{height:10000000}}},Date:{now:()=>now},state:{tracking:{live:true}},platformLayerDefinitions:{liveAircraft:{refreshMs:30000},marineTraffic:{refreshMs:60000}},platformFeeds:{liveAircraft:{loadedAt:1},marineTraffic:{loadedAt:1}},layerStateManager:{isLayerEnabled:()=>true},platformUsesEntityFeed:()=>true,updatePlatformLayerEntities:()=>{},refreshPlatformLayer:id=>calls.push(id)});
 tick();assert.deepEqual(calls,['liveAircraft']);calls.length=0;now=70000;tick();assert.deepEqual(calls,['liveAircraft','marineTraffic']);
});
