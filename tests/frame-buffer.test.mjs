import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const window = {Orion:{}, Cesium: {GeographicTilingScheme:class {constructor(options){this.options=options;}}, Event:class{}, Credit:class {}}};
vm.runInNewContext(fs.readFileSync(new URL('../orion-frame-buffer.js',import.meta.url),'utf8'),{window,Map,Promise});
const FrameBuffer=window.Orion.FrameBuffer;
test('buffer coalesces reads, retains decoded frames and evicts failed loads for retry',async()=>{
  const buffer=new FrameBuffer(4);let calls=0;
  const factory=async()=>{calls++;return {image:'decoded'};};
  const [a,b]=await Promise.all([buffer.get('a',factory),buffer.get('a',factory)]);
  assert.equal(a,b);assert.equal(calls,1);
  await assert.rejects(buffer.get('bad',async()=>{throw new Error('offline');}),/offline/);
  assert.equal(await buffer.get('bad',async()=>42),42);
  buffer.clear();await buffer.get('a',factory);assert.equal(calls,2);
});
test('preloading bounds concurrency and honors cancellation',async()=>{
  const buffer=new FrameBuffer(20);let active=0,max=0,done=0,cancel=false;
  await buffer.prime(Array.from({length:12},(_,i)=>String(i)),async()=>{
    active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return 1;
  },()=>{done++;if(done===4)cancel=true;},()=>cancel);
  assert.ok(max<=3);assert.ok(done>=4&&done<12);
});
test('provider returns a decoded image promise and maps one full-image tile across its rectangle',async()=>{
  const image={width:1024,height:512},rectangle={west:-3,east:3,south:-1,north:1};
  const provider=FrameBuffer.provider(image,rectangle,'NOAA');
  assert.equal(await provider.requestImage(),image);
  assert.equal(provider.rectangle,rectangle);
  assert.equal(provider.tilingScheme.options.numberOfLevelZeroTilesX,1);
  assert.equal(provider.maximumLevel,0);
});

test('upload readiness requires the complete cached texture, independent of other globe tiles',()=>{
  assert.equal(FrameBuffer.uploaded({_imageryCache:{}}),false);
  assert.equal(FrameBuffer.uploaded({_imageryCache:{tile:{state:2,image:{}}}}),false);
  assert.equal(FrameBuffer.uploaded({_imageryCache:{tile:{state:4,texture:{}}}}),true);
});

test('a decoded texture cannot replace a frame until every visible terrain tile uses it',()=>{
 window.Cesium.Rectangle={intersection:(a,b)=>a.east>b.west&&a.west<b.east?a:undefined};
 const rect={west:0,east:1};
 const layer={imageryProvider:{rectangle:rect},_imageryCache:{tile:{state:4,texture:{}}}};
 const ready={imageryLayer:layer,texture:{}};
 const tile={rectangle:rect,data:{imagery:[{loadingImagery:ready}]}};
 const globe={_surface:{_tilesToRender:[tile]}};
 assert.equal(FrameBuffer.visibleReady(layer,globe),false);
 tile.data.imagery[0].readyImagery=ready;
 assert.equal(FrameBuffer.visibleReady(layer,globe),true);
 globe._surface._tilesToRender.push({rectangle:rect,data:{imagery:[]}});
 assert.equal(FrameBuffer.visibleReady(layer,globe),false);
 globe._surface._tilesToRender[1].rectangle={west:2,east:3};
 assert.equal(FrameBuffer.visibleReady(layer,globe),true);
});

test('decoded cache evicts least recently used frames within its byte budget',async()=>{
 const b=new FrameBuffer(10,800);let reads=0;
 const frame=()=>{reads++;return {image:{width:10,height:10}};};
 await b.get('a',frame);await b.get('b',frame);await b.get('a',frame);await b.get('c',frame);
 assert.equal(b.stats().bytes,800);assert.equal(reads,3);
 await b.get('a',frame);assert.equal(reads,3);
 await b.get('b',frame);assert.equal(reads,4);
});

test('loop-start pins survive history churn without bypassing the memory budget',async()=>{
 const b=new FrameBuffer(10,1200);let firstReads=0;
 b.pin(['first']);await b.get('first',()=>{firstReads++;return {width:10,height:10};});
 for(let i=0;i<10;i++)await b.get('frame'+i,()=>({width:10,height:10}));
 await b.get('first',()=>{firstReads++;return {width:10,height:10};});
 assert.equal(firstReads,1);assert.ok(b.stats().bytes<=1200);
 b.pin([]);for(let i=0;i<4;i++)await b.get('other'+i,()=>({width:10,height:10}));
 await b.get('first',()=>{firstReads++;return {width:10,height:10};});assert.equal(firstReads,2);
});
