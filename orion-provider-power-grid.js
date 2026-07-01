(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Providers = Orion.Providers || {};

  var layerId = "powerGrid";
  var definition = (Orion.Config && Orion.Config.PlatformLayerDefinitions && Orion.Config.PlatformLayerDefinitions[layerId]) || {};
  var health = Orion.Providers.Registry && Orion.Providers.Registry.createState
    ? Orion.Providers.Registry.createState(layerId)
    : {
        id: layerId,
        status: "unknown",
        lastSuccess: null,
        lastFailure: null,
        failureCount: 0,
        retryAfter: null
      };

  function staticHost() {
    return !!(Orion.Config && Orion.Config.Constants && Orion.Config.Constants.STATIC_HOST);
  }

  function endpointUrl(bounds) {
    if (staticHost()) {
      return "pages-data/live/intel/powerGrid.json";
    }

    var endpoint = definition.endpoint || "/live/intel?layer=powerGrid";
    if (bounds && Number.isFinite(bounds.west) && Number.isFinite(bounds.south) &&
      Number.isFinite(bounds.east) && Number.isFinite(bounds.north)) {
      endpoint += "&bbox=" + encodeURIComponent([
        bounds.west.toFixed(4),
        bounds.south.toFixed(4),
        bounds.east.toFixed(4),
        bounds.north.toFixed(4)
      ].join(","));
    }
    return endpoint;
  }

  function normalizePath(item) {
    var source = item && (item.points || item.positions || item.route || item.path);
    if (!Array.isArray(source)) {
      return [];
    }

    return source.map(function(point) {
      if (!Array.isArray(point) || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))) {
        return null;
      }
      return [Number(point[0]), Number(point[1]), Number(point[2]) || 48];
    }).filter(Boolean);
  }

  function normalize(rawData) {
    var raw = rawData && (rawData.features || rawData.items || rawData.lines || []);
    if (!Array.isArray(raw)) {
      raw = [];
    }

    return raw.map(function(item, index) {
      var path = normalizePath(item);
      if (path.length < 2) {
        return null;
      }

      return Object.assign({}, item, {
        id: item.id || item.name || "power-grid-" + index,
        name: item.name || "Power transmission line",
        kind: "line",
        category: item.category || "transmission",
        source: item.source || "OpenStreetMap / Overpass",
        provider: item.provider || "OpenStreetMap contributors",
        points: path,
        positions: path
      });
    }).filter(Boolean);
  }

  function fetchJson(url, signal) {
    return fetch(url, {
      headers: { Accept: "application/json" },
      signal: signal
    }).then(function(response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    });
  }

  Orion.Providers.PowerGrid = {
    id: layerId,

    initialize: function() {
      health.status = "standby";
      return Promise.resolve(health);
    },

    fetchMetadata: function() {
      return Promise.resolve({
        id: layerId,
        label: definition.label || "Power grid",
        endpoint: endpointUrl(null),
        attribution: this.getAttribution(),
        supportsLive: true,
        supportsHistorical: false,
        supportsStaticMode: true
      });
    },

    fetchData: function(bounds, time, options) {
      var signal = options && options.signal;
      health.status = "loading";

      return fetchJson(endpointUrl(bounds), signal).then(function(payload) {
        health.status = payload.fallback ? "fallback" : "online";
        health.lastSuccess = new Date().toISOString();
        health.failureCount = 0;
        return Object.assign({}, payload, {
          features: normalize(payload)
        });
      }).catch(function(error) {
        health.status = "offline";
        health.lastFailure = new Date().toISOString();
        health.failureCount += 1;
        throw error;
      });
    },

    normalize: normalize,

    getFreshness: function() {
      return {
        lastSuccess: health.lastSuccess,
        status: health.status
      };
    },

    getAttribution: function() {
      return "OpenStreetMap contributors / Overpass API";
    },

    getHealth: function() {
      return Object.assign({}, health);
    },

    dispose: function() {
      health.status = "standby";
    }
  };

  window.Orion = Orion;
})(window);
