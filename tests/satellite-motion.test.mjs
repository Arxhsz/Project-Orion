import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('orbital positions advance on the tracking clock without rebuilding the collection',()=>{
 const window={Orion:{Telemetry:{Samplers:{satellite:(item,time)=>({lon:+time/1000,lat:item.lat,height:420000})}}}};
 const Cesium={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})}};
 vm.runInNewContext(fs.readFileSync(new URL('../orion-renderer-primitive.js',import.meta.url),'utf8'),{window,Cesium});
 const renderer=window.Orion.Renderer.Orbital;
 const point={orionOrbitalItem:{lat:30}};let renders=0;
 renderer.collection={length:1,get:()=>point};renderer.viewer={scene:{requestRender:()=>renders++}};
 renderer.updatePositions(new Date(1000));assert.equal(point.position.lon,1);
 renderer.updatePositions(new Date(2000));assert.equal(point.position.lon,2);assert.equal(point.position.height,420000);
 renderer.updatePositions(new Date(2000));assert.equal(renders,2);
});
test('a missing OMM decoder reports an error instead of silently showing an empty catalog',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('  function parseOmmRecords('),app.indexOf('  function satelliteSampleFromItem('));
 const parse=vm.runInNewContext(source+'\nparseOmmRecords;',{window:{satellite:{}}});
 assert.throws(()=>parse([{NORAD_CAT_ID:25544}],100),/orbit decoder unavailable/);
});
