(function (window) {
  'use strict';
  var Orion = window.Orion = window.Orion || {};
  function normalize(data, category) {
    var items = (data.events || []).slice(0, 200).map(function (event) {
      var points = (event.geometry || []).filter(function (g) { return g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2; }).sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); });
      if (!points.length) return null;
      var point = points[0], lon = point.coordinates[0], lat = point.coordinates[1];
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      return { id: event.id, name: event.title, kind: 'event', category: category, lon: lon, lat: lat, time: point.date, source: 'NASA EONET', status: 'Open event report', sources: event.sources || [], description: 'Reported event location. 3D shape and smoke are illustrative, not measured plume or terrain data.' };
    }).filter(Boolean);
    return { source: 'NASA EONET', generated: Date.now(), mode: 'event-reports', fallback: false, features: items, count: items.length };
  }
  function volcanoes(data) {
    var items = (data.features || []).slice(0, 500).map(function (feature) {
      var geometry = feature.geometry || {}, coords = geometry.coordinates || [];
      if (geometry.type !== 'Point' || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) || Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90) return null;
      var p = feature.properties || {};
      return { id: 'usgs-volcano-' + (p.vnum || p.volcanoCd), name: p.volcanoName || 'Volcano', kind: 'event', category: 'volcanoes',
        lon: coords[0], lat: coords[1], time: p.alertDate, source: 'USGS Volcano Hazards Program',
        status: (p.alertLevel || 'UNASSIGNED') + ' / ' + (p.colorCode || 'UNASSIGNED'),
        description: p.noticeSynopsis || 'No current notice supplied by USGS.', showPlume: false,
        sources: [{id: 'USGS', url: p.noticeUrl || p.volcanoUrl}] };
    }).filter(Boolean);
    return { source: 'USGS Volcano Hazards Program', generated: Date.now(), mode: 'status-reports', fallback: false, features: items, count: items.length };
  }
  Orion.Hazards = { normalize: normalize, volcanoes: volcanoes };
})(window);
