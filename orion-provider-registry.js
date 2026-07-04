(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Providers = Orion.Providers || {};

  var definitions = (Orion.Config && Orion.Config.ProviderDefinitions) || {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function normalizeId(id) {
    var layerMap = {
      realtimeSatellites: "satellites",
      satInternet: "satellites",
      satCommunications: "satellites",
      satPositioning: "satellites",
      satEarthImaging: "satellites",
      satWeather: "satellites",
      satScience: "satellites",
      satIot: "satellites",
      starlink: "satellites",
      debris: "satellites",
      weatherRadar: "weatherRadar",
      liveAircraft: "liveAircraft",
      liveShips: "liveShips",
      cameras: "cameras",
      earthquakes: "earthquakes",
      wildfires: "wildfires",
      underseaCables: "underseaCables",
      powerGrid: "powerGrid"
    };
    return layerMap[id] || id;
  }

  Orion.Providers.Registry = {
    get: function(id) {
      var providerId = normalizeId(id);
      return clone(definitions[providerId] || {
        id: providerId,
        label: providerId,
        status: "unknown",
        supportsStaticMode: false,
        supportsHistorical: false,
        supportsLive: false,
        timeCapability: "live-only",
        minimumRefreshMs: 60000,
        maximumRecommendedRequestFrequencyMs: 60000,
        requiresBackendProxy: true,
        requiresApiKey: false,
        attribution: "Unspecified",
        licensingNotes: "No provider metadata is configured."
      });
    },

    list: function() {
      return Object.keys(definitions).map(function(id) {
        return clone(definitions[id]);
      });
    },

    supportsCurrentMode: function(id) {
      var provider = this.get(id);
      var staticHost = !!(Orion.Config && Orion.Config.Constants && Orion.Config.Constants.STATIC_HOST);
      return !staticHost || provider.supportsStaticMode !== false;
    },

    createState: function(id) {
      var provider = this.get(id);
      return {
        id: provider.id,
        label: provider.label,
        status: provider.status || "unknown",
        lastSuccess: null,
        lastFailure: null,
        failureCount: 0,
        retryAfter: null,
        supportsStaticMode: !!provider.supportsStaticMode,
        supportsHistorical: !!provider.supportsHistorical,
        supportsLive: !!provider.supportsLive,
        timeCapability: provider.timeCapability || (provider.supportsHistorical ? "historical-query" : "live-only"),
        minimumRefreshMs: provider.minimumRefreshMs || 60000,
        maximumRecommendedRequestFrequencyMs: provider.maximumRecommendedRequestFrequencyMs || provider.minimumRefreshMs || 60000,
        requiresBackendProxy: !!provider.requiresBackendProxy,
        requiresApiKey: !!provider.requiresApiKey,
        attribution: provider.attribution || "Unspecified",
        licensingNotes: provider.licensingNotes || ""
      };
    }
  };

  window.Orion = Orion;
})(window);
