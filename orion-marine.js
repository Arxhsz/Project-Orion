(function(window) {
  'use strict';
  var Orion = window.Orion = window.Orion || {};
  var metadata = null, metadataAt = 0, pending = null, last = null, lastAt = 0;
  function normalize(locations, vessels, now) {
    var names = new Map((vessels || []).map(function(v) { return [String(v.mmsi), v]; }));
    var items = (locations.features || []).flatMap(function(f) {
      var p = f.properties || {}, c = f.geometry && f.geometry.coordinates, id = String(f.mmsi || p.mmsi || '');
      var time = Number(p.timestampExternal), m = names.get(id) || {};
      if (!/^\d{9}$/.test(id) || !c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90 || !Number.isFinite(time) || now-time > 30*60000 || time-now > 60000) return [];
      var heading = Number.isFinite(p.heading) && p.heading >= 0 && p.heading < 360 ? p.heading : null;
      var course = Number.isFinite(p.cog) && p.cog >= 0 && p.cog < 360 ? p.cog : null;
      return [{id:'ais-'+id,name:m.name || 'MMSI '+id,lon:c[0],lat:c[1],height:0,
        kind:'observation',trackType:'sea',category:'vessel',heading:heading == null ? course : heading,
        headingSource:heading == null ? 'course over ground' : 'AIS heading',
        speed: Number.isFinite(p.sog) && p.sog < 102.3 ? p.sog : null,
        speedUnit:'knots',mmsi:id,vesselType:m.shipType ?? null,callsign:m.callSign || null,
        timestamp:time,updated:new Date(time).toISOString(),source:'Fintraffic Digitraffic AIS',
        status:now-time>5*60000?'delayed':'observed',description:'Finnish waters · reported AIS position · no extrapolation'}];
    });
    return {items:items,source:'Fintraffic Digitraffic · CC BY 4.0',coverage:'Finnish waters',generated:locations.dataUpdatedTime,provider_health:items.length?'online':'empty'};
  }
  async function json(path) {
    var r = await fetch('https://meri.digitraffic.fi/api/ais/v1/'+path,{signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error('Marine feed HTTP '+r.status);
    return r.json();
  }
  Orion.Marine = {normalize:normalize, load:function() {
    if(last && Date.now()-lastAt<60000) return Promise.resolve(last);
    if(pending) return pending;
    pending=(async function() {
      if(!metadata || Date.now()-metadataAt>3600000) { metadata=await json('vessels'); metadataAt=Date.now(); }
      last=normalize(await json('locations'),metadata,Date.now());lastAt=Date.now();return last;
    })().finally(function(){pending=null;});
    return pending;
  }};
})(window);
