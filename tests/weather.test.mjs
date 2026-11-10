import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function load(file, extras = {}) {
  const window = {Orion: {}, ...extras};
  vm.runInNewContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {window, URLSearchParams, Date, Set, Map, ...extras});
  return window.Orion;
}
const Weather = load('orion-weather.js').Weather;
test('NOAA irregular frame times are selected without inventing updates or using a future observation', () => {
  const frames = Weather.frames({frames: [{time:'2026-10-01T12:04:58Z'},{time:'2026-10-01T12:00:54Z'},{time:'bad'},{time:'2026-10-01T12:04:58Z'}]});
  assert.equal(frames.length, 2);
  assert.equal(Weather.index(frames, new Date('2026-10-01T12:03:00Z')), 0);
  assert.equal(Weather.index(frames, new Date('2026-10-01T12:04:58Z')), 1);
  assert.equal(Weather.index(frames, new Date('2000-01-01')), 0);
  assert.equal(Weather.index([], new Date()), -1);
});
test('capability time lists and ranges normalize and bound expansion', () => {
  assert.equal(Weather.parseTimes('2026-10-01T12:00:00Z/2026-10-01T12:10:00Z/PT5M').length, 3);
  assert.equal(Weather.parseTimes('2026-10-01T12:00:00Z/2026-10-01T12:10:00Z/PT0M').length, 0);
  assert.equal(Weather.parseTimes('invalid').length, 0);
  assert.equal(Weather.parseTimes('2026-10-01T12:00:00Z,2026-10-01T12:00:00Z').length, 1);
});
test('forecast frame values change with time; missing values never become zero', () => {
  const rows = Array.from({length:162},()=>({hourly:{time:[1790856000,1790859600],temperature_2m:[60,70]}}));
  rows[0].hourly.temperature_2m[1] = null;
  const payload = Weather.normalizeForecast(rows,'temperature');
  assert.equal(payload.frames[0].grid.values[0],60);
  assert.equal(payload.frames[1].grid.values[0],null);
  assert.equal(payload.frames[1].grid.values[1],70);
  assert.equal(payload.frames[0].grid.west,-170);
  assert.throws(()=>Weather.normalizeForecast(rows.slice(1),'temperature'),/Incomplete/);
});
test('forecast provider URLs are explicit and model-bounded', () => {
  const url = new URL(Weather.forecastUrl('gfs_seamless'));
  assert.equal(url.hostname,'api.open-meteo.com');
  assert.equal(url.searchParams.get('models'),'gfs_seamless');
  assert.ok(url.searchParams.get('hourly').includes('wet_bulb_temperature_2m'));
});
test('camera flight cancels prior tracking and centers its target after completion', () => {
  let params, target, locked=false, completed=false, cancelled=false;
  const C = { Matrix4:{IDENTITY:{}}, Cartographic:{fromDegrees:(lon,lat)=>({lon,lat})}, Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})}, Math:{toRadians:n=>n*Math.PI/180}, BoundingSphere:class {constructor(center){this.center=center;}}, HeadingPitchRange:class {constructor(heading,pitch,range){Object.assign(this,{heading,pitch,range});}}, EasingFunction:{CUBIC_IN_OUT:()=>{}}};
  const viewer={trackedEntity:{},scene:{globe:{getHeight:()=>100}},camera:{cancelFlight(){cancelled=true;},lookAtTransform(){},flyToBoundingSphere(s,p){target=s.center;params=p;},lookAt(t){locked=t;}}};
  const Camera=load('orion-camera.js',{Cesium:C}).CameraFlight;
  assert.equal(Camera.focus(viewer,{lat:39,lon:-77},{range:2200,complete:()=>completed=true}),true);
  assert.equal(cancelled,true);assert.equal(viewer.trackedEntity,undefined);assert.equal(target.height,100);
  params.complete();assert.equal(locked,target);assert.equal(completed,true);
  assert.equal(Camera.focus(viewer,{lat:NaN,lon:0}),false);
});
test('event normalization uses the newest valid location and preserves event time', () => {
  const Hazards=load('orion-hazards.js').Hazards;
  const payload=Hazards.normalize({events:[{id:'e',title:'Volcano',geometry:[{type:'Point',coordinates:[10,20],date:'2026-09-01'},{type:'Point',coordinates:[11,21],date:'2026-10-01'}]}]},'volcanoes');
  assert.equal(payload.features[0].lon,11);
  assert.equal(payload.features[0].time,'2026-10-01');
  assert.match(payload.features[0].description,/illustrative/);
  assert.equal(Hazards.normalize({events:[]},'wildfires').features.length,0);
});

test('USGS volcano advisories preserve alerts without fabricating ash plumes', () => {
  const Hazards = load('orion-hazards.js').Hazards;
  const result = Hazards.volcanoes({features:[{geometry:{type:'Point',coordinates:[-155,19]},properties:{vnum:'1',volcanoName:'Example',alertLevel:'ADVISORY',colorCode:'YELLOW',noticeSynopsis:'No ash observed'}}]});
  assert.equal(result.features[0].showPlume,false);
  assert.equal(result.features[0].status,'ADVISORY / YELLOW');
  assert.equal(result.features[0].description,'No ash observed');
  assert.equal(Hazards.volcanoes({features:[{geometry:{type:'Point',coordinates:[181,0]}}]}).features.length,0);
});

test('weather raster keeps missing cells transparent rather than converting null to zero', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const source = app.slice(app.indexOf('    function gridValue(row, column) {'), app.indexOf('    for (var y = 0; y < canvas.height;'));
  const sample = vm.runInNewContext(source + '\ngridValue;', {values:[null,0,NaN,25],gridWidth:2});
  assert.equal(sample(0,0),null);
  assert.equal(sample(0,1),0);
  assert.equal(sample(1,0),null);
  assert.equal(sample(1,1),25);
});

test('zoomed forecast rasters sample the visible coordinates instead of stretching the global image', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const source = app.slice(app.indexOf('  function buildWeatherFieldTexture('), app.indexOf('  function ensureWeatherEffectCanvas('));
  let pixels;
  const canvas = {getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{pixels=image.data;}})};
  const render=vm.runInNewContext(source+'\nbuildWeatherFieldTexture;',{
    document:{createElement:()=>canvas},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
    weatherFieldColor:(_mode,v)=>[Math.round(v),0,0],Cesium:{Rectangle:{fromDegrees:(...bounds)=>bounds}}
  });
  const result=render({grid:{width:2,height:2,west:0,east:10,south:0,north:10,values:[0,100,0,100]}},'temperature',[7,2,9,8]);
  assert.deepEqual(Array.from(result.rectangle),[7,2,9,8]);
  assert.equal(canvas.width,1024);
  assert.equal(pixels[(Math.floor(canvas.height/2)*canvas.width+canvas.width/2)*4],80);
});
