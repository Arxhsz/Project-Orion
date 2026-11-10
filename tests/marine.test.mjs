import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const window={Orion:{}};vm.runInNewContext(fs.readFileSync('orion-marine.js','utf8'),{window,Map,Date,Number});
test('AIS keeps measured positions, north headings and source times, rejects stale and invalid reports',()=>{
 const now=Date.now(),f={mmsi:230123456,geometry:{coordinates:[24,60]},properties:{timestampExternal:now,heading:0,cog:45,sog:2}};
 const feed=window.Orion.Marine.normalize({features:[f,{...f,properties:{...f.properties,timestampExternal:now-3600000}}]},[{mmsi:230123456,name:'Test',shipType:70}],now);
 assert.equal(feed.items.length,1);assert.equal(feed.items[0].heading,0);assert.equal(feed.items[0].kind,'observation');assert.equal(feed.items[0].name,'Test');
 const missing=window.Orion.Marine.normalize({features:[{...f,properties:{...f.properties,heading:511,cog:360,sog:102.3}}]},[],now).items[0];
 assert.equal(missing.heading,null);assert.equal(missing.speed,null);
});
