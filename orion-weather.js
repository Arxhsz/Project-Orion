(function (window) {
  'use strict';
  var Orion = window.Orion = window.Orion || {};
  var root = 'https://nowcoast.noaa.gov/geoserver/observations/';
  var observed = {
    satellite: { service: 'satellite', layer: 'goes_visible_imagery', label: 'GOES visible · regional 5-min / global infrared hourly', unit: 'Reflectance' },
    infrared: { service: 'satellite', layer: 'goes_longwave_imagery', label: 'GOES infrared · regional 5-min / global infrared hourly', unit: 'Cloud-top brightness' },
    'satellite-global': { service: 'satellite', layer: 'global_longwave_imagery_mosaic', label: 'Global infrared · hourly', unit: 'Cloud-top brightness' },
    radar: { service: 'weather_radar', layer: 'conus_base_reflectivity_mosaic', label: 'NOAA MRMS · contiguous US', unit: 'dBZ' }
  };
  var fields = {
    precipitation: ['precipitation', 'mm/h'], wind: ['wind_speed_10m', 'mph'],
    gusts: ['wind_gusts_10m', 'mph'], temperature: ['temperature_2m', '°F'],
    'feels-like': ['apparent_temperature', '°F'], humidity: ['relative_humidity_2m', '%'],
    'wet-bulb': ['wet_bulb_temperature_2m', '°F'], dewpoint: ['dew_point_2m', '°F'], pressure: ['pressure_msl', 'hPa'],
    clouds: ['cloud_cover', '%'], snow: ['snowfall', 'cm/h'], rain: ['rain', 'mm/h']
  };
  var cache = new Map();
  function time(frame) { return Date.parse(frame.valid_time || frame.time); }
  function frames(payload) {
    var seen = new Set();
    return (payload.frames || []).filter(function (f) {
      var t = time(f);
      if (!Number.isFinite(t) || seen.has(t)) return false;
      seen.add(t); return true;
    }).sort(function (a, b) { return time(a) - time(b); });
  }
  function index(list, date) {
    var t = +date, lo = 0, hi = list.length - 1;
    if (!list.length) return -1;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (time(list[mid]) <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function parseTimes(value) {
    var out = [];
    String(value || '').split(',').forEach(function (part) {
      var range = part.trim().split('/');
      if (range.length === 1) { if (Number.isFinite(Date.parse(part))) out.push(new Date(part).toISOString()); return; }
      var match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(range[2]);
      var step = match && ((+match[1] || 0) * 3600 + (+match[2] || 0) * 60 + (+match[3] || 0)) * 1000;
      if (!step) return;
      for (var t = Date.parse(range[0]), end = Date.parse(range[1]); t <= end && out.length < 2048; t += step) out.push(new Date(t).toISOString());
    });
    return Array.from(new Set(out)).sort();
  }
  async function request(url, signal, asText) {
    var controller = new AbortController();
    var abort = function () { controller.abort(); };
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    var timeout = window.setTimeout(abort, 35000);
    try {
      var response = await fetch(url, { signal: controller.signal, headers: { Accept: asText ? 'application/xml' : 'application/json' } });
      if (!response.ok) throw new Error('Weather provider returned HTTP ' + response.status);
      return await (asText ? response.text() : response.json());
    } finally {
      window.clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', abort);
    }
  }
  async function observations(mode, signal) {
    var def = observed[mode], url = root + def.service + '/ows';
    var xml = await request(url + '?service=WMS&request=GetCapabilities&version=1.3.0', signal, true);
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var layer = Array.from(doc.getElementsByTagNameNS('*', 'Layer')).find(function (item) {
      return Array.from(item.children).some(function (child) { return child.localName === 'Name' && child.textContent === def.layer; });
    });
    var dimension = layer && Array.from(layer.children).find(function (child) { return child.localName === 'Dimension' && child.getAttribute('name') === 'time'; });
    var list = parseTimes(dimension && dimension.textContent).slice(-240).map(function (t) { return { time: t, wms: { url: url, layers: def.layer } }; });
    if (!list.length) throw new Error('NOAA has no available frames for this map');
    if (mode === 'satellite' || mode === 'infrared') {
      var globalLayer = Array.from(doc.getElementsByTagNameNS('*', 'Layer')).find(function (item) {
        return Array.from(item.children).some(function (child) { return child.localName === 'Name' && child.textContent === 'global_longwave_imagery_mosaic'; });
      });
      var globalDimension = globalLayer && Array.from(globalLayer.children).find(function (child) { return child.localName === 'Dimension' && child.getAttribute('name') === 'time'; });
      var contexts = parseTimes(globalDimension && globalDimension.textContent);
      list.forEach(function (frame) {
        var candidates = contexts.filter(function (t) { return Date.parse(t) <= Date.parse(frame.time); });
        if (candidates.length) frame.context = { url: url, layers: 'global_longwave_imagery_mosaic', time: candidates[candidates.length - 1] };
      });
    }
    return { weather_mode: mode, frames: list, latest: list[list.length - 1], provider: 'NOAA nowCOAST', coverage: def.label, unit: def.unit, mode: 'observed', refresh_seconds: 120, supportsHistorical: true, generated: new Date().toISOString() };
  }
  function coordinates() {
    var points = [];
    for (var lat = -80; lat <= 80; lat += 20) for (var lon = -170; lon <= 170; lon += 20) points.push([lat, lon]);
    return points;
  }
  function forecastUrl(model) {
    var points = coordinates();
    var query = new URLSearchParams({ latitude: points.map(function (p) { return p[0]; }).join(','), longitude: points.map(function (p) { return p[1]; }).join(','), hourly: Array.from(new Set(Object.values(fields).map(function (f) { return f[0]; }).concat(['wind_direction_10m']))).join(','), past_days: '2', forecast_days: '7', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'UTC', timeformat: 'unixtime' });
    if (model && model !== 'best_match') query.set('models', model);
    return 'https://api.open-meteo.com/v1/forecast?' + query;
  }
  function normalizeForecast(records, mode) {
    var field = fields[mode];
    if (!field || !Array.isArray(records) || records.length !== coordinates().length) throw new Error('Incomplete forecast grid');
    var times = records[0].hourly && records[0].hourly.time;
    if (!Array.isArray(times) || !times.length) throw new Error('Forecast has no timestamps');
    var list = times.map(function (stamp, i) {
      var values = records.map(function (r) {
        if (!r.hourly || r.hourly.time[i] !== stamp) return null;
        var v = (r.hourly[field[0]] || [])[i];
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      });
      var winds = { speed: [], direction: [] };
      records.forEach(function (r) {
        var h = r.hourly || {}, same = h.time && h.time[i] === stamp;
        winds.speed.push(same ? (h.wind_speed_10m || [])[i] : null);
        winds.direction.push(same ? (h.wind_direction_10m || [])[i] : null);
      });
      return { time: new Date(stamp * 1000).toISOString(), winds: winds, grid: { width: 18, height: 9, west: -170, south: -80, east: 170, north: 80, unit: field[1], values: values } };
    }).filter(function (f) { return f.grid.values.some(function (v) { return v !== null; }); });
    if (!list.length) throw new Error('Forecast grid contains no usable values');
    return { weather_mode: mode, frames: list, latest: list[index(list, new Date())], provider: 'Open-Meteo', coverage: 'Global model · sampled 20° grid', unit: field[1], mode: 'forecast', refresh_seconds: 1800, supportsHistorical: true, generated: new Date().toISOString() };
  }
  async function load(mode, signal, staticHost, model) {
    model = ["best_match", "gfs_seamless", "icon_seamless"].includes(model) ? model : "best_match";
    if (observed[mode]) return observations(mode, signal);
    if (!fields[mode]) throw new Error('Unsupported weather mode');
    if (!staticHost) return request('/live/weather/forecast?mode=' + encodeURIComponent(mode) + '&model=' + model, signal);
    var entry = cache.get(model);
    if (!entry) {
      try { entry = JSON.parse(window.sessionStorage.getItem('orion-weather-v2-' + model)); } catch (_) { /* Storage may be unavailable. */ }
      if (entry && (!Number.isFinite(entry.time) || !Array.isArray(entry.records))) entry = null;
    }
    if (!entry || Date.now() - entry.time > 1800000) {
      var records = await request(forecastUrl(model), signal);
      entry = { time: Date.now(), records: records };
      try { window.sessionStorage.setItem('orion-weather-v2-' + model, JSON.stringify(entry)); } catch (_) { /* A full cache never blocks weather. */ }
    }
    cache.set(model, entry);
    var payload = normalizeForecast(entry.records, mode);
    payload.coverage += " · " + model.replace("_seamless", "").replace("_", " ").toUpperCase();
    return payload;
  }
  Orion.Weather = { observed: observed, fields: fields, frames: frames, index: index, time: time, parseTimes: parseTimes, load: load, normalizeForecast: normalizeForecast, forecastUrl: forecastUrl };
})(window);
