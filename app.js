(function () {
  "use strict";

  var Orion = window.Orion;

  function getCompassDirection(d) { return Orion.Runtime.Utils.getCompassDirection(d); }
  function formatAltitude(m) { return Orion.Runtime.Utils.formatAltitude(m); }

  var MS_PER_DAY = Orion.Config.Constants.MS_PER_DAY;
  var MS_PER_HOUR = Orion.Config.Constants.MS_PER_HOUR;
  var GIBS_IMAGERY_LAG_DAYS = Orion.Config.Constants.GIBS_IMAGERY_LAG_DAYS;
  var GIBS_ROOT = Orion.Config.Constants.GIBS_ROOT;
  var EARTH_HOME = Orion.Config.Constants.EARTH_HOME;
  var SAVED_LOCATIONS_KEY = Orion.Config.Constants.SAVED_LOCATIONS_KEY;

  var layerDefinitions = Orion.Config.LayerDefinitions;

  var savedLocations = loadSavedLocations();

  var TRACK_EPOCH = Orion.Config.Constants.TRACK_EPOCH;
  var TRACK_SOURCE_LABEL = Orion.Config.Constants.TRACK_SOURCE_LABEL;
  var trackFilterIds = {
    all: "trackFilterAll",
    air: "trackFilterAir",
    sat: "trackFilterSat",
    sea: "trackFilterSea"
  };

  var platformLayerDefinitions = Orion.Config.PlatformLayerDefinitions;
  var orbitalLayerIds = [
    "realtimeSatellites",
    "satInternet",
    "satCommunications",
    "satPositioning",
    "satEarthImaging",
    "satWeather",
    "satScience",
    "satIot",
    "starlink",
    "debris"
  ];
  var mergedPlatformLayerIds = {
    liveAircraft: true,
    liveShips: true
  };
  orbitalLayerIds.forEach(function (layerId) {
    mergedPlatformLayerIds[layerId] = true;
  });
  var trackingDomainPlatformLayers = {
    air: ["liveAircraft"],
    sea: ["liveShips"],
    sat: orbitalLayerIds
  };

  var trackingDefinitions = Orion.Config.TrackingDefinitions;

  trackingDefinitions = buildTrackingCatalog(trackingDefinitions);

  var elements = {};
  var viewer;
  var clickHandler;
  var targetEntity;
  var fallbackBaseLayer;
  var streetDetailLayer;
  var streetRoadsLayer;
  var streetDetailAlpha = 0;
  var streetRoadsAlpha = 0;
  var ORBITAL_ALTITUDE_CUTOFF = 1000000;
  var detailBlendFrame;
  var refreshTimer;
  var toastTimer;
  var swapCleanupTimer;
  var imageryFadeFrame;
  var imageryTransitionToken = 0;
  var activeImageryLayers = [];
  var stagedImageryLayers = [];
  var baseImageryLayer = null;
  var lastImageryHealthCheck = 0;
  var lastCameraCartesian = null;
  var lastCameraMotionAt = 0;
  var playbackFrame;
  var lastPlaybackTimestamp = 0;
  var updatePlaybackAccumulator = 0;
  var lastCameraUpdate = 0;
  var trackingTimer;
  var trackingEntities = {};
  var lastTrackingKey = "";
  var trackingDomainSyncPaused = false;
  var legacyTrackingVisualsEnabled = false;
  var liveAircraftFetchPending = false;
  var lastLiveAircraftFetch = 0;
  var liveAircraftActive = false;
  var platformLayerTimer;
  var platformFeeds = {};
  window.platformFeeds = platformFeeds;
  var PLATFORM_PRIMITIVE_LAYERS = [
    'realtimeSatellites',
    'satInternet',
    'satCommunications',
    'satPositioning',
    'satEarthImaging',
    'satWeather',
    'satScience',
    'satIot',
    'starlink',
    'debris',
    'earthquakes',
    'lightning',
    'cameras',
    'liveShips',
    'liveAircraft'
  ];

  var platformEntities = {};
  var platformPrimitives = {};
  var platformHeatmapLayers = {};
  var platformHeatmapSignatures = {};
  var selectedPlatformEntityId = null;
  var platformFollowReady = false;
  var weatherRadarLayer = null;
  var weatherRadarPreviousLayers = [];
  var weatherRadarTimer = null;
  var weatherRadarAnimationTimer = null;
  var weatherRadarFrameIndex = 0;
  var zoomWeatherLayer = null;
  var zoomWeatherPreviousLayers = [];
  var zoomWeatherMode = null;
  var zoomWeatherTimer = null;
  var zoomWeatherRequestToken = 0;
  var weatherEffectCanvas = null;
  var weatherEffectContext = null;
  var weatherEffectFrame = null;
  var weatherEffectParticles = [];
  var weatherEffectMode = null;
  var weatherEffectStartedAt = 0;
  var weatherModeLegend = null;
  var cityBuildingsTileset = null;
  var boundaryDataSources = { countries: null, usStates: null };
  var boundaryLoadPromise = null;
  var soundEngine = null;
  var timelapseRecorder = null;
  var timelapseChunks = [];
  var lastIntelListRender = 0;
  var cameraFeedTimer = null;
  var lastPlatformMotionFrame = 0;
  var lastCameraRegionKey = "";
  var lastCameraRegionFetchTime = 0;
  var intelCalloutPosScratch = null;
  var intelGlyphCache = {};

  var lodManager = null;
  var cullingManager = null;
  var currentLODLevel = Orion.Runtime.StateManager.lodLevel;
  
  function setLODLevel(newLevel) {
    currentLODLevel = newLevel;
    Orion.Runtime.StateManager.lodLevel = newLevel;
  }

  var primitiveCollections = {
    earthquakes: null,
    lightning: null,
    rfHeatmap: null
  };

  var entityPools = {
    billboard: [],
    label: [],
    polyline: []
  };
  var POOL_SIZE = 500;

  var imageryShaders = {
    standard: null,
    thermal: null,
    night: null,
    weather: null
  };
  var currentImageryMode = "standard";
  var activeShaderStage = null;

  var layerStateManager = Orion.Runtime.StateManager;


  var providerHealthTracker = Orion.Telemetry.ProviderHealth;

  var performanceBudgetManager = Orion.Runtime.PerformanceBudget;


  var diagnosticsManager = Orion.Diagnostics.SystemMonitor;
  var hardeningManager = Orion.Diagnostics.Hardening;
  window.OrionHardening = hardeningManager;
  var stabilityManager = Orion.Diagnostics.Stability;
  var visualCohesionManager = Orion.Intelligence.VisualCohesion;
  var adaptiveIntelligenceManager = Orion.Intelligence.AdaptiveIntelligence;
  var operationalIntelligenceManager = Orion.Intelligence.OperationalNarrative;
  var cognitiveOperationsManager = Orion.Intelligence.CognitiveOperations;
  var cognitiveGovernanceManager = Orion.Intelligence.CognitiveGovernance;


  window.OrionIntelligence = adaptiveIntelligenceManager;
  window.OrionOperational = operationalIntelligenceManager;
  window.OrionCognitive = cognitiveOperationsManager;
  window.OrionGovernance = cognitiveGovernanceManager;

  var maxDate = latestStableGibsTime(new Date());
  var minDate = addDays(maxDate, -30);

  var state = {
    date: maxDate,
    compareDate: addDays(maxDate, -7),
    compareMode: false,
    splitPosition: 0.5,
    timelineMode: "hourly",
    playing: false,
    speed: 1,
    autoDetailActive: false,
    detailTier: "orbital",
    scanMode: "standard",
    cameraMoving: false,
    cameraMovingFast: false,
    timelapseRecording: false,
    earthquakeFeed: "2.5_day",
    earthquakeMinMagnitude: 2.5,
    radarOpacity: 0.44,
    radarAnimating: true,
    weatherMapMode: "satellite",
    satelliteSource: "nasa-live",
    orbitalDataset: "all",
    cleanEarth: false,
    intelSearch: "",
    intelCategory: "all",
    target: {
      name: "Global scan",
      lat: null,
      lon: null
    },
    layers: {
      trueColor: true,
      sentinel: false,
      clouds: false,
      infrared: false,
      night: false,
      labels: true,
      boundaries: false
    },
    platformLayers: {
      realtimeSatellites: false,
      satInternet: false,
      satCommunications: false,
      satPositioning: false,
      satEarthImaging: false,
      satWeather: false,
      satScience: false,
      satIot: false,
      starlink: false,
      debris: false,
      earthquakes: false,
      cameras: false,
      weatherRadar: false,
      liveShips: false,
      wildfires: false,
      cyberNetwork: false,
      defenseAirspace: false,
      underseaCables: false,
      powerGrid: false,
      rfHeatmap: false,
      emergencyIncidents: false,
      volumetricWeather: false,
      lightning: false,
      socialEvents: false,
      airCorridors: false,
      traffic: false,
      cities3d: false,
      soundscape: false
    },
    tracking: {
      filter: "all",
      air: false,
      sat: false,
      sea: false,
      live: false,
      follow: false,
      followReady: false,
      selectedId: null,
      dirty: true
    }
  };
  window.appState = state;

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      "searchForm",
      "searchInput",
      "savedLocations",
      "saveLocationButton",
      "layerTrueColor",
      "layerSentinel",
      "layerCleanEarth",
      "layerClouds",
      "layerInfrared",
      "layerNight",
      "layerLabels",
      "layerBoundaries",
      "weatherMapModeSelect",
      "satelliteSourceSelect",
      "platformSatellites",
      "platformStarlink",
      "platformDebris",
      "platformEarthquakes",
      "platformCameras",
      "platformWeatherRadar",
      "platformLiveShips",
      "platformAircraft",
      "platformWildfires",
      "platformCyber",
      "platformAirspace",
      "platformCables",
      "platformPower",
      "platformRf",
      "platformEmergency",
      "platformWeatherVolume",
      "platformLightning",
      "platformEvents",
      "platformAirCorridors",
      "platformTraffic",
      "platformCities",
      "platformSound",
      "scanModeSelect",
      "timelapseRecord",
      "timelapseStart",
      "timelapseEnd",
      "timelapseLocationMode",
      "earthquakeFeedSelect",
      "earthquakeMagnitudeSelect",
      "radarOpacityRange",
      "radarAnimateToggle",
      "telemetryStack",
      "intelListPanel",
      "intelSearch",
      "intelCategoryChips",
      "intelEntityList",
      "intelEntityCount",
      "compareToggle",
      "homeButton",
      "trackFilterAll",
      "trackFilterAir",
      "trackFilterSat",
      "trackFilterSea",
      "trackAircraft",
      "trackSatellites",
      "trackVessels",
      "orbitalDatasetSelect",
      "liveModeToggle",
      "unlockCamera",
      "targetName",
      "targetLat",
      "targetLon",
      "providerLabel",
      "imageDate",
      "updateAge",
      "cloudCoverage",
      "cameraAltitude",
      "mapDetailLabel",
      "trackingModeLabel",
      "trackingSource",
      "trackingCount",
      "trackingClock",
      "platformLayerCount",
      "platformFeedStatus",
      "intelDetailCard",
      "cameraWindow",
      "cameraClose",
      "cameraDragHandle",
      "cameraMinimize",
      "cameraFullscreen",
      "cameraPopout",
      "cameraTitle",
      "cameraMeta",
      "cameraFrame",
      "timelineRange",
      "timelineStartLabel",
      "timelineCursorLabel",
      "timelineEndLabel",
      "currentDateLabel",
      "feedMeta",
      "timelineModeHourly",
      "timelineModeUpdates",
      "prevDay",
      "playPause",
      "nextDay",
      "speedSelect",
      "compareControls",
      "compareRange",
      "compareDateLabel",
      "splitRange",
      "splitDivider",
      "toast",
      "intelMapCallout",
      "intelMapCalloutBody",
      "intelMapCalloutClose",
      "cesiumCredit"
    ].forEach(function (id) {
      elements[id] = $(id);
    });
  }

  function utcMidnight(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  function latestStableGibsDate(date) {
    var today = utcMidnight(date);
    var lagDays = GIBS_IMAGERY_LAG_DAYS;
    if (date.getUTCHours() < 15) {
      lagDays += 1;
    }
    return addDays(today, -lagDays);
  }

  function latestStableGibsTime(date) {
    return addHours(latestStableGibsDate(date), 23);
  }

  function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
  }

  function effectiveGibsDate(requestedDate) {
    if (!isValidDate(requestedDate)) {
      return latestStableGibsDate(new Date());
    }

    var latest = latestStableGibsDate(new Date());
    var day = utcMidnight(requestedDate);

    if (!isValidDate(day) || day.getTime() > latest.getTime()) {
      return latest;
    }

    return day;
  }

  function addDays(date, amount) {
    return new Date(date.getTime() + amount * MS_PER_DAY);
  }

  function addHours(date, amount) {
    return new Date(date.getTime() + amount * MS_PER_HOUR);
  }

  function daysBetween(start, end) {
    return Math.round((utcMidnight(end).getTime() - utcMidnight(start).getTime()) / MS_PER_DAY);
  }

  function hoursBetween(start, end) {
    return (end.getTime() - start.getTime()) / MS_PER_HOUR;
  }

  function formatDate(date) {
    if (!isValidDate(date)) {
      return formatDate(latestStableGibsDate(new Date()));
    }

    return date.toISOString().slice(0, 10);
  }

  function formatHour(date) {
    return String(date.getUTCHours()).padStart(2, "0") + ":00";
  }

  function formatUtcClock(date) {
    return [
      String(date.getUTCHours()).padStart(2, "0"),
      String(date.getUTCMinutes()).padStart(2, "0"),
      String(date.getUTCSeconds()).padStart(2, "0")
    ].join(":");
  }

  function readableDate(date) {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      timeZone: "UTC"
    });
  }

  function readableDateTime(date) {
    return readableDate(date) + " - " + formatHour(date) + " UTC";
  }

  function readableLiveDateTime(date) {
    return readableDate(date) + " - " + formatUtcClock(date) + " UTC";
  }

  function buildTrackingCatalog(seedDefinitions) {
    var airRoutes = [
      [[-118.41, 33.94, 10600], [-104.67, 39.86, 11200], [-87.9, 41.98, 11000], [-73.78, 40.64, 10300]],
      [[-80.29, 25.79, 9800], [-84.43, 33.64, 10600], [-95.34, 29.98, 10400], [-118.41, 33.94, 10900]],
      [[2.55, 49.0, 10400], [13.5, 52.36, 11100], [30.9, 50.35, 10500], [37.62, 55.75, 9800]],
      [[103.99, 1.36, 10600], [114.2, 22.31, 11100], [121.81, 31.14, 10800], [139.78, 35.55, 9900]],
      [[151.18, -33.95, 10300], [144.84, -37.67, 10600], [115.97, -31.94, 10400], [103.99, 1.36, 11100]],
      [[-46.47, -23.43, 10000], [-58.54, -34.82, 10600], [-70.79, -33.39, 10200], [-77.11, -12.02, 9700]],
      [[28.25, -26.13, 9800], [31.12, -29.62, 10400], [39.2, -6.88, 9900], [55.52, -4.67, 10300]]
    ];
    var vesselRoutes = [
      [[-72.2, 40.1, 30], [-57.5, 40.8, 30], [-34.0, 43.8, 30], [-12.8, 49.1, 30], [3.9, 51.8, 30]],
      [[32.34, 29.95, 30], [33.4, 25.7, 30], [38.9, 18.5, 30], [48.7, 14.2, 30], [56.3, 23.7, 30]],
      [[140.4, 34.7, 30], [160.0, 34.0, 30], [-176.0, 34.2, 30], [-149.0, 36.2, 30], [-122.7, 37.6, 30]],
      [[103.7, 1.18, 30], [108.8, 4.2, 30], [114.3, 10.2, 30], [121.0, 18.5, 30], [128.5, 29.4, 30]],
      [[-94.6, 28.8, 30], [-90.0, 28.4, 30], [-85.3, 27.8, 30], [-82.2, 25.2, 30], [-87.2, 23.8, 30]],
      [[18.1, -34.2, 30], [30.5, -32.6, 30], [43.2, -19.0, 30], [55.5, -8.8, 30], [72.6, 16.9, 30]]
    ];
    var catalog = seedDefinitions.slice();

    for (var airIndex = 0; airIndex < 28; airIndex++) {
      catalog.push({
        id: "air-demo-" + String(airIndex + 1).padStart(2, "0"),
        type: "air",
        name: "AIRTRACK " + String(201 + airIndex),
        detail: "Synthetic demo aircraft",
        periodHours: 5.8 + (airIndex % 8) * 0.58,
        phase: positiveModulo(airIndex * 0.137, 1),
        route: airRoutes[airIndex % airRoutes.length]
      });
    }

    for (var satIndex = 0; satIndex < 36; satIndex++) {
      catalog.push({
        id: "sat-demo-" + String(satIndex + 1).padStart(2, "0"),
        type: "sat",
        name: "ORBITAL " + String(500 + satIndex),
        detail: "Synthetic demo satellite",
        periodHours: 1.42 + (satIndex % 9) * 0.045,
        phase: positiveModulo(satIndex * 0.071, 1),
        inclination: 38 + (satIndex % 7) * 8.4,
        longitudeRate: 204 + (satIndex % 11) * 7.6,
        longitudeOffset: normalizeLongitude(-170 + satIndex * 19),
        height: 430000 + (satIndex % 10) * 42000
      });
    }

    for (var vesselIndex = 0; vesselIndex < 24; vesselIndex++) {
      catalog.push({
        id: "sea-demo-" + String(vesselIndex + 1).padStart(2, "0"),
        type: "sea",
        name: "SEALANE " + String(300 + vesselIndex),
        detail: "Synthetic demo vessel",
        periodHours: 52 + (vesselIndex % 10) * 8,
        phase: positiveModulo(vesselIndex * 0.093, 1),
        route: vesselRoutes[vesselIndex % vesselRoutes.length]
      });
    }

    return catalog;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function clampDate(date) {
    var timestamp = clamp(date.getTime(), minDate.getTime(), maxDate.getTime());
    return new Date(timestamp);
  }

  function dateFromRange(inputValue) {
    if (state.timelineMode === "updates") {
      return addDays(minDate, Number(inputValue));
    }

    return addHours(minDate, Number(inputValue));
  }

  function rangeFromDate(date) {
    if (state.timelineMode === "updates") {
      return daysBetween(minDate, date);
    }

    return Number(hoursBetween(minDate, date).toFixed(2));
  }

  function timelineRangeMax() {
    if (state.timelineMode === "updates") {
      return daysBetween(minDate, maxDate);
    }

    return Math.round(hoursBetween(minDate, maxDate));
  }

  function addTimelineUnits(date, amount) {
    if (state.timelineMode === "updates") {
      return addDays(date, amount);
    }

    return addHours(date, amount);
  }

  function loadSavedLocations() {
    try {
      var raw = window.localStorage.getItem(SAVED_LOCATIONS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map(sanitizeSavedLocation).filter(Boolean).slice(0, 18);
    } catch (error) {
      return [];
    }
  }

  function sanitizeSavedLocation(location) {
    if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
      return null;
    }

    if (location.lat < -90 || location.lat > 90 || location.lon < -180 || location.lon > 180) {
      return null;
    }

    return {
      id: String(location.id || Date.now() + "-" + Math.random().toString(16).slice(2)),
      name: String(location.name || "Saved view").slice(0, 48),
      lat: location.lat,
      lon: location.lon,
      height: clamp(Number(location.height) || 650000, 1200, 12000000)
    };
  }

  function persistSavedLocations() {
    try {
      window.localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(savedLocations));
    } catch (error) {
      showToast("Saved locations could not be written in this browser.");
    }
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function normalizeLongitude(lon) {
    return positiveModulo(lon + 180, 360) - 180;
  }

  function interpolateLongitude(startLon, endLon, amount) {
    var delta = endLon - startLon;

    if (delta > 180) {
      delta -= 360;
    } else if (delta < -180) {
      delta += 360;
    }

    return normalizeLongitude(startLon + delta * amount);
  }

  function smoothstep(amount) {
    return amount * amount * (3 - 2 * amount);
  }
  function LODManager(viewer) {
    this.viewer = viewer;
    this.currentLevel = 'close';
    this.listeners = [];
    this.thresholds = {
      distant: 1000000,
      medium: 100000
    };
    this.hysteresis = 0.1;
  }

  LODManager.prototype.update = function() {
    var cameraHeight = this.viewer.camera.positionCartographic.height;
    var newLevel = this.calculateLevel(cameraHeight);
    
    if (newLevel !== this.currentLevel) {
      this.currentLevel = newLevel;
      setLODLevel(newLevel);
      this.notifyListeners(newLevel, cameraHeight);
    }
  };

  LODManager.prototype.calculateLevel = function(height) {
    var distantThreshold = this.thresholds.distant;
    var mediumThreshold = this.thresholds.medium;

    var pressure = performanceBudgetManager.enforce();
    if (pressure > 1.1) {
      distantThreshold *= 0.6;
      mediumThreshold *= 0.6;
    }

    if (this.currentLevel === 'distant') {      if (height < distantThreshold * (1 - this.hysteresis)) {
        return 'medium';
      }
      return 'distant';
    } else if (this.currentLevel === 'medium') {
      if (height > distantThreshold * (1 + this.hysteresis)) {
        return 'distant';
      } else if (height < mediumThreshold * (1 - this.hysteresis)) {
        return 'close';
      }
      return 'medium';
    } else {
      if (height > mediumThreshold * (1 + this.hysteresis)) {
        return 'medium';
      }
      return 'close';
    }
  };

  LODManager.prototype.subscribe = function(callback) {
    this.listeners.push(callback);
  };

  LODManager.prototype.notifyListeners = function(level, height) {
    for (var i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](level, height);
      } catch (error) {
        console.error('LOD listener error:', error);
      }
    }
  };
  function CullingManager(viewer) {
    this.viewer = viewer;
    this.culledEntities = new Set();
    this.updateInterval = 100;
    this.lastUpdate = 0;
  }

  CullingManager.prototype.update = function(time) {
    if (time - this.lastUpdate < this.updateInterval) {
      return;
    }
    this.lastUpdate = time;
    
    var camera = this.viewer.camera;
    var cameraPosition = camera.positionWC;
    var entities = this.viewer.entities.values;
    
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      if (!entity.position) continue;

      if (entity.orionLayerId && !layerStateManager.isLayerEnabled(entity.orionLayerId)) {
        this.cullEntity(entity);
        continue;
      }

      try {        var position = entity.position.getValue(this.viewer.clock.currentTime);
        if (!position) continue;
        
        var distance = Cesium.Cartesian3.distance(cameraPosition, position);
        var maxDistance = entity.orionMaxDistance || 26000000;

        var pressure = performanceBudgetManager.enforce();
        if (pressure > 1.2) {
          maxDistance *= 0.5;
        }

        if (distance > maxDistance) {          this.cullEntity(entity);
          continue;
        }
        
        var toEntity = Cesium.Cartesian3.subtract(position, cameraPosition, new Cesium.Cartesian3());
        var dot = Cesium.Cartesian3.dot(toEntity, camera.directionWC);
        
        if (dot < 0) {
          this.cullEntity(entity);
        } else {
          this.showEntity(entity);
        }
      } catch (error) {
        continue;
      }
    }
  };

  CullingManager.prototype.cullEntity = function(entity) {
    if (!this.culledEntities.has(entity.id)) {
      entity.show = false;
      this.culledEntities.add(entity.id);
    }
  };

  CullingManager.prototype.showEntity = function(entity) {
    if (this.culledEntities.has(entity.id)) {
      entity.show = true;
      this.culledEntities.delete(entity.id);
    }
  };
  function initPrimitiveCollections() {
    if (!viewer) return;

    primitiveCollections.earthquakes = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());

    primitiveCollections.lightning = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());

    primitiveCollections.rfHeatmap = viewer.scene.primitives.add(new Cesium.BillboardCollection());

    console.log('Primitive collections initialized for high-performance rendering');
  }
  function debounce(func, wait) {
    var timeout;
    return function() {
      var context = this;
      var args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function() {
        func.apply(context, args);
      }, wait);
    };
  }
  function throttle(func, limit) {
    var inThrottle;
    return function() {
      var context = this;
      var args = arguments;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(function() {
          inThrottle = false;
        }, limit);
      }
    };
  }
  function initEntityPools() {
    var startTime = performance.now();
    var fallback = (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
      OrionTextureManager.getIcon('fallback') : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    for (var i = 0; i < POOL_SIZE; i++) {
      var entity = viewer.entities.add({
        show: false,
        billboard: {
          image: fallback,
          width: 32,
          height: 32,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      entityPools.billboard.push(entity);
    }

    var duration = performance.now() - startTime;
    console.log("Entity pools initialized in " + duration.toFixed(2) + "ms (" + POOL_SIZE + " billboard entities)");
  }

  function acquireEntity(type) {
    var pool = entityPools[type];
    if (!pool || pool.length === 0) {
      return createNewEntity(type);
    }

    var entity = pool.pop();
    entity.show = true;
    return entity;
  }

  function releaseEntity(entity, type) {
    entity.show = false;
    entity.position = undefined;

    if (entity.billboard) {
      entity.billboard.image = (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
        OrionTextureManager.getIcon('fallback') : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    }
    if (entity.label) {
      entity.label.text = "";
    }
    if (entity.polyline) {
      entity.polyline.positions = [];
    }

    var pool = entityPools[type];
    if (pool && pool.length < POOL_SIZE) {
      pool.push(entity);
    } else {
      viewer.entities.remove(entity);
    }
  }

  function createNewEntity(type) {
    var fallback = (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
      OrionTextureManager.getIcon('fallback') : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    if (type === "billboard") {
      return viewer.entities.add({
        billboard: {
          image: fallback,
          width: 32,
          height: 32,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    } else if (type === "label") {

      return viewer.entities.add({
        label: {
          text: "",
          font: "14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10)
        }
      });
    } else if (type === "polyline") {
      return viewer.entities.add({
        polyline: {
          positions: [],
          width: 2,
          material: Cesium.Color.WHITE
        }
      });
    }
    
    return viewer.entities.add({});
  }
  function createThermalShader() {
    if (!Cesium.PostProcessStage) {
      console.warn("PostProcessStage not available, thermal shader disabled");
      return null;
    }

    try {
      return new Cesium.PostProcessStage({
        name: "orion_thermal",
        fragmentShader: `#if __VERSION__ == 300
  #define varying in
  #define texture2D texture
  out vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor
#endif
varying vec2 v_textureCoordinates;
uniform sampler2D colorTexture;
uniform float alpha;

void main() {
  vec4 color = texture2D(colorTexture, v_textureCoordinates);
  float intensity = (color.r + color.g + color.b) / 3.0;

  vec3 thermal;
  if (intensity < 0.25) {
    thermal = mix(vec3(0.0, 0.0, 0.5), vec3(0.5, 0.0, 0.5), intensity * 4.0);
  } else if (intensity < 0.5) {
    thermal = mix(vec3(0.5, 0.0, 0.5), vec3(1.0, 0.0, 0.0), (intensity - 0.25) * 4.0);
  } else if (intensity < 0.75) {
    thermal = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0), (intensity - 0.5) * 4.0);
  } else {
    thermal = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (intensity - 0.75) * 4.0);
  }

  gl_FragColor = mix(color, vec4(thermal, color.a), alpha);
}`,
        uniforms: {
          alpha: 1.0
        }
      });
    } catch (error) {
      console.error("Failed to create thermal shader:", error);
      return null;
    }
  }
  function createNightVisionShader() {
    if (!Cesium.PostProcessStage) {
      console.warn("PostProcessStage not available, night vision shader disabled");
      return null;
    }

    try {
      return new Cesium.PostProcessStage({
        name: "orion_night_vision",
        fragmentShader: `#if __VERSION__ == 300
  #define varying in
  #define texture2D texture
  out vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor
#endif
varying vec2 v_textureCoordinates;
uniform sampler2D colorTexture;
uniform float alpha;

void main() {
  vec4 color = texture2D(colorTexture, v_textureCoordinates);
  float intensity = (color.r + color.g + color.b) / 3.0;
  
  vec3 nightVision = vec3(intensity * 0.1, intensity * 1.3, intensity * 0.3);
  
  gl_FragColor = mix(color, vec4(nightVision, color.a), alpha);
}`,
        uniforms: {
          alpha: 1.0
        }
      });
    } catch (error) {
      console.error("Failed to create night vision shader:", error);
      return null;
    }
  }
  function createWeatherShader() {
    if (!Cesium.PostProcessStage) {
      console.warn("PostProcessStage not available, weather shader disabled");
      return null;
    }

    try {
      return new Cesium.PostProcessStage({
        name: "orion_weather",
        fragmentShader: `#if __VERSION__ == 300
  #define varying in
  #define texture2D texture
  out vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor
#endif
varying vec2 v_textureCoordinates;
uniform sampler2D colorTexture;
uniform float alpha;

void main() {
  vec4 color = texture2D(colorTexture, v_textureCoordinates);

  vec3 weather;
  weather.r = color.r * 0.9;
  weather.g = color.g * 1.05;
  weather.b = color.b * 1.2;

  gl_FragColor = mix(color, vec4(weather, color.a), alpha);
}`,
        uniforms: {
          alpha: 1.0
        }
      });
    } catch (error) {
      console.error("Failed to create weather shader:", error);
      return null;
    }
  }

  function createAtmosphereShader() {
    if (!Cesium.PostProcessStage) return null;
    try {
      return new Cesium.PostProcessStage({
        name: "orion_atmosphere",
        fragmentShader: `#if __VERSION__ == 300
  #define varying in
  #define texture2D texture
  out vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor
#endif
varying vec2 v_textureCoordinates;
uniform sampler2D colorTexture;
uniform float height;
uniform float tension;

void main() {
  vec4 color = texture2D(colorTexture, v_textureCoordinates);
  
  float scatterFactor = clamp((height - 100000.0) / 10000000.0, 0.0, 0.12);
  float tensionBoost = clamp(tension * 0.05, 0.0, 0.05);
  
  vec3 scatterColor = vec3(0.05, 0.1, 0.2) * (scatterFactor + tensionBoost);
  
  gl_FragColor = vec4(color.rgb + scatterColor, color.a);
}`,
        uniforms: {
          height: function() {
            return viewer ? viewer.camera.positionCartographic.height : 0;
          },
          tension: function() {
            return (Orion && Orion.Intelligence && Orion.Intelligence.CognitiveOperations) ? 
                   Orion.Intelligence.CognitiveOperations.tension : 0;
          }
        }
      });
    } catch (e) { return null; }
  }
  function initImageryShaders() {
    if (!viewer || !viewer.scene || !viewer.scene.postProcessStages) {
      console.warn("Viewer not ready for shader initialization");
      return;
    }

    var startTime = performance.now();
    
    imageryShaders.thermal = createThermalShader();
    imageryShaders.night = createNightVisionShader();
    imageryShaders.weather = createWeatherShader();
    imageryShaders.atmosphere = createAtmosphereShader();

    if (imageryShaders.atmosphere) {
      viewer.scene.postProcessStages.add(imageryShaders.atmosphere);
    }

    var duration = performance.now() - startTime;    console.log("Imagery shaders initialized in " + duration.toFixed(2) + "ms");
  }
  function switchImageryMode(mode) {
    if (!viewer || !viewer.scene || !viewer.scene.postProcessStages) {
      console.warn("Viewer not ready for imagery mode switch");
      return;
    }

    if (mode === currentImageryMode) {
      return;
    }

    var startTime = performance.now();
    var oldStage = activeShaderStage;
    var newStage = (mode !== "standard" && imageryShaders[mode]) ? imageryShaders[mode] : null;

    if (newStage) {
      try {
        activeShaderStage = viewer.scene.postProcessStages.add(newStage);

        if (activeShaderStage.uniforms && typeof activeShaderStage.uniforms.alpha !== 'undefined') {
          activeShaderStage.uniforms.alpha = 0.0;

          var start = performance.now();
          var duration = 250;

          function fadeIn() {
            var elapsed = performance.now() - start;
            var progress = Math.min(elapsed / duration, 1.0);
            activeShaderStage.uniforms.alpha = progress;

            if (progress < 1.0) {
              requestAnimationFrame(fadeIn);
            } else if (oldStage) {
              viewer.scene.postProcessStages.remove(oldStage);
            }
          }
          requestAnimationFrame(fadeIn);
        } else {
          if (oldStage) viewer.scene.postProcessStages.remove(oldStage);
        }
      } catch (error) {
        console.error("Failed to add shader:", error);
        mode = "standard";
        activeShaderStage = null;
        if (oldStage) viewer.scene.postProcessStages.remove(oldStage);
      }
    } else {
      if (oldStage) {
        if (oldStage.uniforms && typeof oldStage.uniforms.alpha !== 'undefined') {
          var start = performance.now();
          var duration = 200;
          function fadeOut() {
            var elapsed = performance.now() - start;
            var progress = Math.min(elapsed / duration, 1.0);
            oldStage.uniforms.alpha = 1.0 - progress;
            if (progress < 1.0) {
              requestAnimationFrame(fadeOut);
            } else {
              viewer.scene.postProcessStages.remove(oldStage);
            }
          }
          requestAnimationFrame(fadeOut);
        } else {
          viewer.scene.postProcessStages.remove(oldStage);
        }
      }
      activeShaderStage = null;
    }

    currentImageryMode = mode;
    viewer.scene.requestRender();

    var duration = performance.now() - startTime;
    console.log("Imagery mode transition started to '" + mode + "' in " + duration.toFixed(2) + "ms");
  }
  function setImageryLayerLinearSampling(layer) {
    if (!layer || !Cesium.TextureMagnificationFilter) {
      return;
    }
    try {
      layer.magnificationFilter = Cesium.TextureMagnificationFilter.LINEAR;
      if (Cesium.TextureMinificationFilter && Cesium.TextureMinificationFilter.LINEAR !== undefined) {
        layer.minificationFilter = Cesium.TextureMinificationFilter.LINEAR;
      }
    } catch (err) {
    }
  }

  function bearingDegrees(startLat, startLon, endLat, endLon) {
    var startPhi = Cesium.Math.toRadians(startLat);
    var endPhi = Cesium.Math.toRadians(endLat);
    var deltaLambda = Cesium.Math.toRadians(endLon - startLon);
    var y = Math.sin(deltaLambda) * Math.cos(endPhi);
    var x = Math.cos(startPhi) * Math.sin(endPhi) - Math.sin(startPhi) * Math.cos(endPhi) * Math.cos(deltaLambda);

    return positiveModulo(Cesium.Math.toDegrees(Math.atan2(y, x)), 360);
  }

  function routeMission(definition, time) {
    var elapsedHours = (time.getTime() - TRACK_EPOCH) / MS_PER_HOUR;
    var rawProgress = elapsedHours / definition.periodHours + definition.phase;
    var cycle = Math.floor(rawProgress);
    var progress = positiveModulo(rawProgress, 1);
    var activeWindow = definition.type === "air" ? 0.82 : 0.94;
    var active = progress <= activeWindow;
    var routeProgress = active ? progress / activeWindow : 1;

    return {
      active: active,
      cycle: cycle,
      progress: progress,
      routeProgress: clamp(routeProgress, 0, 1)
    };
  }

  function routeCruiseHeight(definition) {
    return definition.route.reduce(function (maxHeight, waypoint) {
      return Math.max(maxHeight, Number(waypoint[2]) || 0);
    }, definition.type === "air" ? 10500 : 0);
  }

  function routePosition(definition, time) {
    var route = definition.route;
    var mission = routeMission(definition, time);
    var scaled = mission.routeProgress * (route.length - 1);
    var index = Math.min(Math.floor(scaled), route.length - 2);
    var nextIndex = Math.min(index + 1, route.length - 1);
    var amount = smoothstep(scaled - index);
    var start = route[index];
    var end = route[nextIndex];
    var height = start[2] + (end[2] - start[2]) * amount;
    var status = "Underway";

    if (definition.type === "air") {
      var climb = smoothstep(clamp(mission.routeProgress / 0.16, 0, 1));
      var descent = 1 - smoothstep(clamp((mission.routeProgress - 0.82) / 0.16, 0, 1));
      var airborne = mission.active ? clamp(Math.min(climb, descent), 0, 1) : 0;
      height = 160 + routeCruiseHeight(definition) * airborne;
      status = airborne > 0.86 ? "Airborne" : mission.routeProgress < 0.5 ? "Climb" : "Landing";
    } else if (definition.type === "sea") {
      height = 30;
      status = mission.active ? "Underway" : "In port";
    }

    if (!mission.active && definition.type === "air") {
      status = "Landed";
    }

    return {
      lon: interpolateLongitude(start[0], end[0], amount),
      lat: start[1] + (end[1] - start[1]) * amount,
      height: height,
      heading: bearingDegrees(start[1], start[0], end[1], end[0]),
      active: mission.active,
      cycle: mission.cycle,
      routeProgress: mission.routeProgress,
      status: status
    };
  }

  function orbitalPosition(definition, time) {
    var elapsedHours = (time.getTime() - TRACK_EPOCH) / MS_PER_HOUR;
    var orbitProgress = elapsedHours / definition.periodHours + definition.phase;
    var angle = orbitProgress * Math.PI * 2;
    var latitudeAmplitude = Math.min(Math.abs(definition.inclination), 82);
    var lat = latitudeAmplitude * Math.sin(angle);
    var lon = normalizeLongitude(definition.longitudeOffset + elapsedHours * definition.longitudeRate + 24 * Math.sin(angle * 0.37));
    var height = definition.height + 22000 * Math.sin(angle * 1.7);
    var heading = positiveModulo(90 + 68 * Math.cos(angle), 360);

    return {
      lon: lon,
      lat: lat,
      height: height,
      heading: heading,
      active: true,
      cycle: Math.floor(orbitProgress),
      routeProgress: positiveModulo(orbitProgress, 1),
      status: "Orbital"
    };
  }

  function sampleTrackPosition(definition, time) {
    if (definition.livePosition) {
      return definition.livePosition;
    }

    if (definition.type === "sat") {
      return orbitalPosition(definition, time);
    }

    return routePosition(definition, time);
  }

  function getTrackingTime() {
    return state.tracking.live ? new Date() : state.date;
  }

  function trackTypeLabel(type) {
    if (type === "air") {
      return "Aircraft";
    }

    if (type === "sat") {
      return "Satellite";
    }

    return "Vessel";
  }

  function svgDataUri(svg) {
    return "data:image/svg+xml;base64," + window.btoa(svg);
  }

  function trackIcon(type, color) {
    if (type === "air") {
      return svgDataUri([
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>",
        "<path d='M48 6 56 43 88 56 88 66 57 59 53 82 65 89 65 94 48 89 31 94 31 89 43 82 39 59 8 66 8 56 40 43Z' fill='", color, "' fill-opacity='.92'/>",
        "<path d='M48 6 56 43 88 56 88 66 57 59 53 82 65 89 65 94 48 89 31 94 31 89 43 82 39 59 8 66 8 56 40 43Z' fill='none' stroke='white' stroke-opacity='.62' stroke-width='3'/>",
        "</svg>"
      ].join(""));
    }

    if (type === "sat") {
      return svgDataUri([
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>",
        "<rect x='38' y='34' width='20' height='28' rx='3' fill='", color, "' fill-opacity='.94' stroke='white' stroke-opacity='.62' stroke-width='3'/>",
        "<path d='M8 36H32V60H8ZM64 36H88V60H64Z' fill='", color, "' fill-opacity='.48' stroke='white' stroke-opacity='.42' stroke-width='3'/>",
        "<path d='M32 48H38M58 48H64M48 22V34M48 62V76' stroke='white' stroke-opacity='.72' stroke-width='3' stroke-linecap='round'/>",
        "<circle cx='48' cy='48' r='5' fill='white' fill-opacity='.86'/>",
        "</svg>"
      ].join(""));
    }

    return svgDataUri([
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>",
      "<path d='M16 50 28 36H68L82 50 74 70H24Z' fill='", color, "' fill-opacity='.9' stroke='white' stroke-opacity='.56' stroke-width='3'/>",
      "<path d='M34 36 40 24H58L64 36M28 56H68M38 66H58' stroke='white' stroke-opacity='.64' stroke-width='3' stroke-linecap='round'/>",
      "<circle cx='48' cy='50' r='5' fill='white' fill-opacity='.8'/>",
      "</svg>"
    ].join(""));
  }

  function trackStyle(type) {
    if (type === "air") {
      return {
        icon: trackIcon("air", "#f4f6ff"),
        iconScale: 0.42,
        color: Cesium.Color.fromCssColorString("#f4f6ff"),
        trailColor: Cesium.Color.fromCssColorString("#dfe6ff"),
        bodyAlpha: 0.88,
        spanAlpha: 0.54,
        modelMaxDistance: 360000,
        billboardMaxDistance: 2600000,
        followRange: 82000,
        followPitch: -28,
        trailHours: 2.8,
        trailSamples: 22,
        trailWidth: 1.8,
        trailAlpha: 0.5,
        pointSize: 5
      };
    }

    if (type === "sat") {
      return {
        icon: trackIcon("sat", "#f3c46b"),
        iconScale: 0.48,
        color: Cesium.Color.fromCssColorString("#f3c46b"),
        trailColor: Cesium.Color.fromCssColorString("#f0b24e"),
        bodyAlpha: 0.94,
        spanAlpha: 0.52,
        modelMaxDistance: 1600000,
        billboardMaxDistance: 9000000,
        followRange: 260000,
        followPitch: -22,
        trailHours: 0.48,
        trailSamples: 18,
        trailWidth: 1.35,
        trailAlpha: 0.44,
        pointSize: 6
      };
    }

    return {
      icon: trackIcon("sea", "#9fb8ff"),
      iconScale: 0.4,
      color: Cesium.Color.fromCssColorString("#9fb8ff"),
      trailColor: Cesium.Color.fromCssColorString("#89a6f4"),
      bodyAlpha: 0.82,
      spanAlpha: 0.44,
      modelMaxDistance: 280000,
      billboardMaxDistance: 2200000,
      followRange: 52000,
      followPitch: -35,
      trailHours: 18,
      trailSamples: 24,
      trailWidth: 1.55,
      trailAlpha: 0.46,
      pointSize: 5
    };
  }

  function platformEntityKey(layerId, id) {
    return layerId + "::" + String(id || "").replace(/[^a-zA-Z0-9:_-]/g, "-");
  }

  function platformLayerFromEntityKey(id) {
    var text = String(id || "");
    var split = text.indexOf("::");
    return split === -1 ? "" : text.slice(0, split);
  }

  function samplePlatformFeedItem(layerId, item, time) {
    var definition = platformLayerDefinitions[layerId];

    if (!definition || !item) {
      return null;
    }

    if (definition.type === "satellite") {
      return satelliteSampleFromItem(item, time || platformTime());
    }

    if (definition.type === "earthquake") {
      return earthquakeSampleFromItem(item.feature);
    }

    if (definition.type === "camera") {
      return cameraSampleFromItem(item);
    }

    if (definition.type === "intel" || definition.type === "moving") {
      return intelSampleFromItem(item, time || platformTime());
    }

    return null;
  }

  function platformLayerCategoryLabel(layerId, definition) {
    if (layerId === "liveAircraft") {
      return "Aircraft";
    }
    if (layerId === "liveShips") {
      return "Vessels";
    }
    if (orbitalLayerIds.indexOf(layerId) !== -1) {
      return "Satellites";
    }
    if (layerId === "earthquakes") {
      return "Earthquakes";
    }
    if (layerId === "lightning") {
      return "Lightning";
    }
    return (definition && definition.category) || "Intel";
  }

  function platformItemDisplayName(layerId, item, definition, index) {
    var name = item && item.name ? String(item.name) : ((definition && definition.label) || "Object");

    if (orbitalLayerIds.indexOf(layerId) !== -1 && item && item.id && name.indexOf(String(item.id)) === -1) {
      name += " #" + item.id;
    }

    if (!name || name === "Object") {
      name = ((definition && definition.label) || "Object") + " " + (index + 1);
    }

    return name;
  }

  function trackingFilterMatchesPlatformLayer(layerId) {
    if (state.tracking.filter === "all") {
      return true;
    }
    if (state.tracking.filter === "air") {
      return layerId === "liveAircraft";
    }
    if (state.tracking.filter === "sea") {
      return layerId === "liveShips";
    }
    if (state.tracking.filter === "sat") {
      return orbitalLayerIds.indexOf(layerId) !== -1;
    }
    return true;
  }

  function isTrackingDomainLayer(layerId) {
    return layerId === "liveAircraft" || layerId === "liveShips" || orbitalLayerIds.indexOf(layerId) !== -1;
  }

  function platformTime() {
    return state.tracking.live ? new Date() : state.date;
  }

  function platformIcon(type, color) {
    if (type === "camera") {
      return svgDataUri([
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>",
        "<rect x='20' y='28' width='44' height='32' rx='6' fill='", color, "' fill-opacity='.88' stroke='white' stroke-opacity='.58' stroke-width='3'/>",
        "<path d='M64 38 82 28V60L64 50Z' fill='", color, "' fill-opacity='.54' stroke='white' stroke-opacity='.42' stroke-width='3'/>",
        "<circle cx='42' cy='44' r='9' fill='none' stroke='white' stroke-opacity='.8' stroke-width='3'/>",
        "</svg>"
      ].join(""));
    }

    return svgDataUri([
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>",
      "<path d='M48 10 58 38 86 48 58 58 48 86 38 58 10 48 38 38Z' fill='", color, "' fill-opacity='.9' stroke='white' stroke-opacity='.55' stroke-width='3'/>",
      "<circle cx='48' cy='48' r='7' fill='white' fill-opacity='.82'/>",
      "</svg>"
    ].join(""));
  }

  var markerIconCache = {};

  function markerIcon(variant) {
    var key = variant || "soft-dot";
    if (markerIconCache[key]) {
      return markerIconCache[key];
    }

    var canvasOnlyIcons = {
      "soft-dot": true,
      pulse: true,
      "smoke-sheet": true,
      lightning: true
    };

    var sharedIcon = (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
      OrionTextureManager.getIcon(key) : null;
    
    if (typeof sharedIcon === "string" && sharedIcon && !canvasOnlyIcons[key]) {
      markerIconCache[key] = sharedIcon;
      return sharedIcon;
    }

    if (sharedIcon && sharedIcon.tagName === 'IMG' && !canvasOnlyIcons[key]) {
      markerIconCache[key] = sharedIcon;
      return sharedIcon;
    }

    var size = key === "smoke-sheet" ? 128 : 64;
    var ratio = 2;
    
    var canvasData = window.OrionTextureManager ? 
      window.OrionTextureManager.createSafeCanvas(size * ratio, size * ratio) : null;
    
    if (!canvasData) {
      var canvas = document.createElement("canvas");
      canvas.width = size * ratio;
      canvas.height = size * ratio;
      var ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
      canvasData = { canvas: canvas, ctx: ctx };
    }
    
    var canvas = canvasData.canvas;
    var ctx = canvasData.ctx;
    
    if (!ctx) {
      console.error("Failed to get 2D context for marker icon");
      return "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='8' fill='white'/%3E%3C/svg%3E";
    }
    
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, size, size);

    if (key === "smoke-sheet") {
      var smokeCx = size / 2;
      var smokeCy = size / 2;
      var smokeGlow = ctx.createRadialGradient(smokeCx, smokeCy, 0, smokeCx, smokeCy, size * 0.52);
      smokeGlow.addColorStop(0, "rgba(235,238,242,0.30)");
      smokeGlow.addColorStop(0.32, "rgba(180,186,192,0.18)");
      smokeGlow.addColorStop(0.66, "rgba(116,122,130,0.075)");
      smokeGlow.addColorStop(1, "rgba(80,84,92,0)");

      ctx.fillStyle = smokeGlow;
      ctx.beginPath();
      ctx.ellipse(smokeCx, smokeCy, size * 0.46, size * 0.33, -0.16, 0, Math.PI * 2);
      ctx.fill();

      for (var wisp = 0; wisp < 34; wisp += 1) {
        var angle = wisp * 2.399963 + Math.sin(wisp * 1.7) * 0.36;
        var radius = (0.1 + ((wisp * 37) % 100) / 100 * 0.42) * size;
        var x = smokeCx + Math.cos(angle) * radius * 0.72;
        var y = smokeCy + Math.sin(angle) * radius * 0.44;
        var rx = (12 + ((wisp * 19) % 22)) * (size / 128);
        var ry = (7 + ((wisp * 29) % 18)) * (size / 128);
        var alpha = 0.035 + (((wisp * 13) % 100) / 100) * 0.07;
        var grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry) * 2.7);
        grad.addColorStop(0, "rgba(255,255,255," + alpha.toFixed(3) + ")");
        grad.addColorStop(0.58, "rgba(190,196,202," + (alpha * 0.45).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(90,94,102,0)");
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle * 0.62);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * 2.4, ry * 2.0, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      var smokeURL = window.OrionTextureManager ?
        window.OrionTextureManager.canvasToDataURL(canvas) : canvas.toDataURL("image/png");
      markerIconCache[key] = smokeURL;
      return smokeURL;
    }

    var cx = size / 2;
    var cy = size / 2;
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 31);
    halo.addColorStop(0, "rgba(255,255,255,.34)");
    halo.addColorStop(0.36, "rgba(255,255,255,.18)");
    halo.addColorStop(0.72, "rgba(255,255,255,.055)");
    halo.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, 31, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "rgba(255,255,255,.48)";
    ctx.shadowBlur = 9;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    
    if (variant === "earthquake-wave") {
       ctx.beginPath();
       ctx.arc(cx, cy, 8, 0, Math.PI * 2);
       ctx.fill();
       ctx.shadowBlur = 0;
       ctx.strokeStyle = "white";
       ctx.lineWidth = 2;
       ctx.beginPath();
       ctx.arc(cx, cy, 24, 0, Math.PI * 2);
       ctx.stroke();
    } else {
       ctx.beginPath();
       ctx.arc(cx, cy, variant === "pulse" ? 7.2 : 6.2, 0, Math.PI * 2);
       ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(5,7,12,.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, variant === "pulse" ? 8.5 : 7.4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, variant === "pulse" ? 11.5 : 10.5, 0, Math.PI * 2);
    ctx.stroke();

    var dataURL = window.OrionTextureManager ? 
      window.OrionTextureManager.canvasToDataURL(canvas) : canvas.toDataURL("image/png");
    
    markerIconCache[key] = dataURL;
    return markerIconCache[key];
  }

  window.trackIcon = trackIcon;
  window.platformIcon = platformIcon;
  window.markerIcon = markerIcon;

  function intelLayerShowsBeacon(layerId, kind) {
    if (isDensityOnlyIntelLayer(layerId)) {
      return false;
    }

    if (kind === "line" || kind === "arc" || kind === "volume") {
      return false;
    }

    if (layerId === "lightning" || layerId === "wildfires" || layerId === "defenseAirspace" || layerId === "volumetricWeather") {
      return false;
    }

    return true;
  }

  function intelBeaconDimensions(layerId, kind) {
    if (layerId === "socialEvents") {
      return new Cesium.Cartesian3(2400, 2400, 7200);
    }

    if (layerId === "emergencyIncidents") {
      return new Cesium.Cartesian3(2000, 2000, 9600);
    }

    if (layerId === "traffic") {
      return new Cesium.Cartesian3(900, 900, 3200);
    }

    if (layerId === "rfHeatmap" && kind === "heat") {
      return new Cesium.Cartesian3(1500, 1500, 5400);
    }

    if (kind === "heat") {
      return new Cesium.Cartesian3(1600, 1600, 5000);
    }

    if (kind === "event") {
      return new Cesium.Cartesian3(2300, 2300, 7000);
    }

    return new Cesium.Cartesian3(2200, 2200, 6600);
  }

  function intelLayerGlyph(layerId, kind, item, selected, cssColor) {
    var color = cssColor || "#7ec8ff";
    var key = layerId + "|" + kind + "|" + (selected ? "1" : "0") + "|" + color;

    if (intelGlyphCache[key]) {
      return intelGlyphCache[key];
    }

    var sw = selected ? 5.2 : 4.0;
    var fo = selected ? "1.0" : "0.92";
    var blurId = "b" + String(Math.abs(key.split("").reduce(function (a, c) {
      return ((a << 5) - a) + c.charCodeAt(0);
    }, 0)) % 900000);
    var filter = "<filter id='" + blurId + "' x='-35%' y='-35%' width='170%' height='170%'><feGaussianBlur stdDeviation='1.4' result='r'/><feMerge><feMergeNode in='r'/><feMergeNode in='SourceGraphic'/></feMerge></filter>";
    var svg = "";

    if (kind === "line" || kind === "arc") {
      if (layerId === "traffic") {
        svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<g filter='url(#" + blurId + ")'><rect x='28' y='28' width='40' height='40' rx='8' transform='rotate(45 48 48)' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "'/><rect x='41' y='38' width='14' height='22' rx='3' fill='#0a1018'/></g></svg>";
      } else if (layerId === "underseaCables") {
        svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M14 58 C 30 28, 38 82, 48 48 S 66 22, 82 40' fill='none' stroke='#ffffff' stroke-width='" + sw + "' stroke-linecap='round'/><path d='M14 58 C 30 28, 38 82, 48 48 S 66 22, 82 40' fill='none' stroke='" + color + "' stroke-opacity='" + fo + "' stroke-width='6' stroke-linecap='round'/><circle cx='48' cy='48' r='9' fill='" + color + "' stroke='#fff' stroke-width='2'/></svg>";
      } else if (layerId === "powerGrid") {
        svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<rect x='22' y='22' width='52' height='52' rx='10' fill='#0d1524' stroke='#ffffff' stroke-width='" + (sw - 1) + "'/><path d='M48 26 L38 50 H46 L42 70 L58 44 H48 Z' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='2' filter='url(#" + blurId + ")'/></svg>";
      } else if (layerId === "airCorridors") {
        svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M22 68 L48 18 L74 68' fill='none' stroke='" + color + "' stroke-width='10' stroke-linejoin='round' filter='url(#" + blurId + ")'/><path d='M22 68 L48 18 L74 68' fill='none' stroke='#ffffff' stroke-width='" + sw + "' stroke-linejoin='round'/></svg>";
      } else if (layerId === "cyberNetwork") {
        svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<polygon points='48,14 78,30 78,66 48,82 18,66 18,30' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/><circle cx='48' cy='48' r='10' fill='#0a1018' stroke='#fff' stroke-width='2'/></svg>";
      } else {
        svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M20 76 L48 20 L76 76Z' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/></svg>";
      }
    } else if (layerId === "emergencyIncidents") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M48 10 L86 78 H10Z' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/><path d='M44 34 H52 L51 54 H45 Z' fill='#0a0f16'/><rect x='44' y='60' width='8' height='9' rx='2' fill='#0a0f16'/></svg>";
    } else if (layerId === "socialEvents") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<rect x='14' y='20' width='68' height='56' rx='14' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/><path d='M48 32 l9 18 20 3 -14 14 3 20 -18 -9 -18 9 3 -20 -14 -14 20 -3z' fill='#0a1018' stroke='#ffffff' stroke-width='2'/></svg>";
    } else if (layerId === "wildfires") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M48 10 C62 30, 80 45, 80 65 A32 32 0 1 1 16 65 C16 45, 34 30, 48 10Z' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/><path d='M48 35 C54 48, 62 55, 62 65 A14 14 0 1 1 34 65 C34 55, 42 48, 48 35Z' fill='#ffffff' fill-opacity='0.6'/> </svg>";
    } else if (layerId === "lightning") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M55 8 L30 52 H46 L38 88 L68 40 H50 L60 8 Z' fill='#ffffff' fill-opacity='" + fo + "' stroke='" + color + "' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/></svg>";
    } else if (layerId === "rfHeatmap") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<rect x='20' y='20' width='56' height='56' rx='12' fill='#0d1524' stroke='#ffffff' stroke-width='" + (sw - 0.5) + "'/><path d='M26 58 Q36 34, 48 52 T70 34' fill='none' stroke='" + color + "' stroke-width='7' stroke-linecap='round' filter='url(#" + blurId + ")'/><path d='M26 40 Q40 62, 52 44 T74 56' fill='none' stroke='" + color + "' stroke-opacity='0.55' stroke-width='5' stroke-linecap='round'/></svg>";
    } else if (layerId === "cyberNetwork") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<polygon points='48,12 80,30 80,66 48,84 16,66 16,30' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/><path d='M26 58 L40 44 L48 54 L70 32' fill='none' stroke='#0a1018' stroke-width='4' stroke-linecap='round'/></svg>";
    } else if (layerId === "defenseAirspace") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M48 16 L78 78 H18Z' fill='#0d1524' stroke='#ffffff' stroke-width='" + sw + "'/><path d='M48 28 L66 68 H30Z' fill='" + color + "' fill-opacity='" + fo + "' filter='url(#" + blurId + ")'/></svg>";
    } else if (layerId === "underseaCables") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<rect x='22' y='38' width='52' height='22' rx='6' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/><path d='M30 38 V28 Q48 18,66 28 V38' fill='none' stroke='#9cd8ff' stroke-width='4' stroke-linecap='round'/></svg>";
    } else if (layerId === "powerGrid") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<rect x='30' y='20' width='36' height='56' rx='6' fill='#0d1524' stroke='#ffffff' stroke-width='" + (sw - 0.6) + "'/><circle cx='48' cy='36' r='6' fill='" + color + "' filter='url(#" + blurId + ")'/><path d='M38 52 H58 M48 52 V74' stroke='" + color + "' stroke-width='6' stroke-linecap='round'/></svg>";
    } else if (layerId === "volumetricWeather") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M25 65 A15 15 0 0 1 25 35 A20 20 0 0 1 60 30 A15 15 0 0 1 85 45 A15 15 0 0 1 70 75 Z' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/></svg>";
    } else if (layerId === "airCorridors") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M24 62 L48 22 L72 62' fill='none' stroke='" + color + "' stroke-width='12' stroke-linecap='round' filter='url(#" + blurId + ")'/><path d='M34 52 H62 M48 34 V52' stroke='#ffffff' stroke-width='" + sw + "' stroke-linecap='round'/></svg>";
    } else if (layerId === "traffic") {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<rect x='26' y='26' width='44' height='44' rx='10' transform='rotate(45 48 48)' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/><rect x='40' y='40' width='16' height='16' rx='3' fill='#0a1018'/></svg>";
    } else {
      svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>" + filter + "<path d='M48 14 L78 34 V62 L48 82 18 62 V34Z' fill='" + color + "' fill-opacity='" + fo + "' stroke='#ffffff' stroke-width='" + sw + "' filter='url(#" + blurId + ")'/></svg>";
    }

    var uri = svgDataUri(svg);
    intelGlyphCache[key] = uri;
    
    if (window.OrionTextureManager && typeof OrionTextureManager.preloadImage === "function") {
      OrionTextureManager.preloadImage(uri, key);
    }
    
    return uri;
  }

  function hideIntelMapCallout() {
    if (!elements.intelMapCallout) {
      return;
    }

    elements.intelMapCallout.classList.remove("is-visible");
    elements.intelMapCallout.classList.add("hidden");
    elements.intelMapCallout.setAttribute("aria-hidden", "true");

    if (elements.intelMapCalloutBody) {
      elements.intelMapCalloutBody.innerHTML = "";
    }
  }

  function buildIntelMapCalloutInnerHtml(record) {
    var item = record.item || {};
    var layerId = record.layerId;

    if (layerId === "emergencyIncidents") {
      var meta = item.metadata || {};
      var rows = [
        ["Event", item.event || item.name || "-"],
        ["Severity", item.severity || "-"],
        ["Area", item.area || "-"],
        ["Status", item.status || "-"],
        ["Urgency", meta.urgency || "-"],
        ["Certainty", meta.certainty || "-"],
        ["Sent", item.timestamp ? String(item.timestamp) : "-"],
        ["Expires", item.expires ? String(item.expires) : "-"],
        ["Source", item.source || item.provider || "National Weather Service"]
      ];
      var grid = rows.map(function (row) {
        return "<dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd>";
      }).join("");
      var desc = (item.description || "").trim();
      var instr = (item.instruction || "").trim();
      var descBlock = desc ? "<p class='intel-map-callout-desc'>" + escapeHtml(desc) + "</p>" : "";
      var insBlock = instr ? "<p class='intel-map-callout-desc'><strong>Instruction:</strong> " + escapeHtml(instr) + "</p>" : "";

      return [
        "<div class='intel-map-callout-kicker'>National Weather Service</div>",
        "<h3>", escapeHtml(item.name || "Weather alert"), "</h3>",
        "<dl class='intel-map-callout-grid'>", grid, "</dl>",
        descBlock,
        insBlock
      ].join("");
    }

    if (layerId === "socialEvents") {
      var metaEv = item.metadata || {};
      var rowsEv = [
        ["Venue", item.venue || "-"],
        ["Segment", metaEv.segment || "-"],
        ["Genre", metaEv.genre || "-"],
        ["When", item.timestamp ? String(item.timestamp) : "-"],
        ["Source", item.source || item.provider || "Ticketmaster"]
      ];
      var gridEv = rowsEv.map(function (row) {
        return "<dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd>";
      }).join("");
      var note = (item.description || "").trim();
      var noteBlock = note ? "<p class='intel-map-callout-desc'>" + escapeHtml(note) + "</p>" : "";
      var img = item.image_url ? "<img class='intel-map-callout-media' alt='' src='" + escapeHtml(item.image_url) + "' loading='lazy' />" : "";
      var link = item.url ? "<a class='intel-map-callout-link' href='" + escapeHtml(item.url) + "' target='_blank' rel='noopener noreferrer'>Open on Ticketmaster</a>" : "";

      return [
        "<div class='intel-map-callout-kicker'>Live events</div>",
        "<h3>", escapeHtml(item.name || "Event"), "</h3>",
        "<dl class='intel-map-callout-grid'>", gridEv, "</dl>",
        noteBlock,
        img,
        link
      ].join("");
    }

    return "";
  }

  function showIntelMapCalloutForRecord(record) {
    if (!elements.intelMapCallout || !elements.intelMapCalloutBody || !record) {
      return;
    }

    var lid = record.layerId;

    if (lid !== "emergencyIncidents" && lid !== "socialEvents") {
      hideIntelMapCallout();
      return;
    }

    elements.intelMapCalloutBody.innerHTML = buildIntelMapCalloutInnerHtml(record);
    elements.intelMapCallout.style.setProperty("--detail-color", record.definition.color || "#ffffff");
    elements.intelMapCallout.classList.remove("hidden");
    elements.intelMapCallout.setAttribute("aria-hidden", "false");
    void elements.intelMapCallout.offsetWidth;
    elements.intelMapCallout.classList.add("is-visible");
    syncIntelMapCallout();
  }

  function syncIntelMapCallout() {
    if (!viewer || !elements.intelMapCallout) {
      return;
    }

    if (elements.intelMapCallout.classList.contains("hidden")) {
      return;
    }

    var id = selectedPlatformEntityId;

    if (!id) {
      return;
    }

    var rec = platformEntities[id];

    if (!rec || !rec.currentPosition || (rec.layerId !== "emergencyIncidents" && rec.layerId !== "socialEvents")) {
      return;
    }

    if (!intelCalloutPosScratch) {
      intelCalloutPosScratch = new Cesium.Cartesian2();
    }

    if (!Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, rec.currentPosition, intelCalloutPosScratch)) {
      return;
    }

    elements.intelMapCallout.style.left = Math.round(intelCalloutPosScratch.x) + "px";
    elements.intelMapCallout.style.top = Math.round(intelCalloutPosScratch.y) + "px";
  }

  function parseTleText(text, limit) {
    var lines = String(text || "").split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean);
    var items = [];

    for (var index = 0; index < lines.length - 2 && items.length < limit; index += 3) {
      var name = lines[index];
      var line1 = lines[index + 1];
      var line2 = lines[index + 2];

      if (line1.charAt(0) !== "1" || line2.charAt(0) !== "2") {
        continue;
      }

      try {
        items.push({
          id: line1.slice(2, 7).trim() || name,
          name: name.replace(/^0\s+/, "").slice(0, 28),
          line1: line1,
          line2: line2,
          satrec: window.satellite ? window.satellite.twoline2satrec(line1, line2) : null
        });
      } catch (error) {
      }
    }

    return items;
  }

  function satelliteSampleFromItem(item, time) {
    if (!window.satellite || !item.satrec) {
      return null;
    }

    var propagated = window.satellite.propagate(item.satrec, time);

    if (!propagated || !propagated.position) {
      return null;
    }

    var gmst = window.satellite.gstime(time);
    var geodetic = window.satellite.eciToGeodetic(propagated.position, gmst);
    var lat = window.satellite.degreesLat(geodetic.latitude);
    var lon = normalizeLongitude(window.satellite.degreesLong(geodetic.longitude));
    var height = geodetic.height * 1000;

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(height)) {
      return null;
    }

    return {
      lon: lon,
      lat: lat,
      height: clamp(height, 140000, 36000000),
      heading: 0,
      status: "Propagated TLE"
    };
  }

  function earthquakeSampleFromItem(feature) {
    var coords = feature && feature.geometry && feature.geometry.coordinates;
    var properties = feature && feature.properties ? feature.properties : {};

    if (!Array.isArray(coords) || coords.length < 2) {
      return null;
    }

    return {
      lon: Number(coords[0]),
      lat: Number(coords[1]),
      height: 1600,
      magnitude: Number(properties.mag) || 1,
      depth: Number(coords[2]) || 0,
      time: properties.time,
      status: "USGS seismic event"
    };
  }

  function cameraSampleFromItem(camera) {
    return {
      lon: Number(camera.lon),
      lat: Number(camera.lat),
      height: 0,
      status: camera.status || "standby"
    };
  }

  function routeSampleFromItem(item, time) {
    var route = Array.isArray(item.route) ? item.route : [];

    if (route.length === 0) {
      return null;
    }

    if (route.length === 1) {
      return {
        lon: Number(route[0][0]),
        lat: Number(route[0][1]),
        height: Number(route[0][2]) || Number(item.height) || 0,
        heading: Number(item.heading) || 0
      };
    }

    var periodMs = Math.max(0.4, Number(item.periodHours) || 4) * MS_PER_HOUR;
    var phase = Number(item.phase) || 0;
    var progress = ((time.getTime() - TRACK_EPOCH) / periodMs + phase) % 1;

    if (progress < 0) {
      progress += 1;
    }

    var scaled = progress * (route.length - 1);
    var startIndex = Math.min(route.length - 2, Math.floor(scaled));
    var local = scaled - startIndex;
    var start = route[startIndex];
    var end = route[startIndex + 1];
    var startLon = Number(start[0]);
    var endLon = Number(end[0]);
    var deltaLon = endLon - startLon;

    if (deltaLon > 180) {
      startLon += 360;
    } else if (deltaLon < -180) {
      endLon += 360;
    }

    var lon = normalizeLongitude(lerp(startLon, endLon, local));
    var lat = lerp(Number(start[1]), Number(end[1]), local);
    var height = lerp(Number(start[2]) || Number(item.height) || 0, Number(end[2]) || Number(item.height) || 0, local);
    var heading = bearingDegrees(start[1], start[0], end[1], end[0]);

    return {
      lon: lon,
      lat: lat,
      height: height,
      heading: heading,
      progress: progress
    };
  }

  function intelPointFromItem(item) {
    if (Array.isArray(item.points) && item.points.length) {
      return midpointSample(item.points, Number(item.height) || 0);
    }

    if (Array.isArray(item.route) && item.route.length) {
      return midpointSample(item.route, Number(item.height) || 0);
    }

    if (Array.isArray(item.center)) {
      return {
        lon: Number(item.center[0]),
        lat: Number(item.center[1]),
        height: Number(item.center[2]) || Number(item.height) || 0
      };
    }

    return {
      lon: Number(item.lon),
      lat: Number(item.lat),
      height: Number(item.height) || 0,
      heading: Number(item.heading) || 0,
      magnitude: Number(item.magnitude) || Number(item.intensity) || 1
    };
  }

  function intelSampleFromItem(item, time) {
    if (item.kind === "moving") {
      if (Array.isArray(item.route) && item.route.length) {
        return routeSampleFromItem(item, time);
      }
      return intelPointFromItem(item);
    }

    return intelPointFromItem(item);
  }

  function midpointSample(points, fallbackHeight) {
    var usable = points.filter(function (point) {
      return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
    });

    if (!usable.length) {
      return null;
    }

    var center = usable[Math.floor((usable.length - 1) / 2)];
    return {
      lon: Number(center[0]),
      lat: Number(center[1]),
      height: Number(center[2]) || fallbackHeight || 0
    };
  }

  function pointsToCartesian(points, fallbackHeight) {
    if (!Array.isArray(points)) {
      return [];
    }

    return points.filter(function (point) {
      return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
    }).map(function (point) {
      return Cesium.Cartesian3.fromDegrees(
        Number(point[0]),
        Number(point[1]),
        Number(point[2]) || fallbackHeight || 0
      );
    });
  }

  function linePathPositions(points, fallbackHeight, samplesPerSegment) {
    var usable = Array.isArray(points) ? points.filter(function (point) {
      return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
    }) : [];

    if (!usable.length) {
      return [];
    }

    if (usable.length === 1) {
      return pointsToCartesian(usable, fallbackHeight);
    }

    var positions = [];
    var samples = Math.max(2, samplesPerSegment || 8);

    for (var index = 0; index < usable.length - 1; index++) {
      var start = usable[index];
      var end = usable[index + 1];
      var startLon = Number(start[0]);
      var endLon = Number(end[0]);
      var deltaLon = endLon - startLon;

      if (deltaLon > 180) {
        startLon += 360;
      } else if (deltaLon < -180) {
        endLon += 360;
      }

      for (var sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
        if (index > 0 && sampleIndex === 0) {
          continue;
        }

        var local = sampleIndex / (samples - 1);
        positions.push(Cesium.Cartesian3.fromDegrees(
          normalizeLongitude(lerp(startLon, endLon, local)),
          lerp(Number(start[1]), Number(end[1]), local),
          lerp(Number(start[2]) || fallbackHeight || 0, Number(end[2]) || fallbackHeight || 0, local)
        ));
      }
    }

    return positions;
  }

  function featureRadius(item, fallback) {
    return Number(item.radiusMeters) || Number(item.radius) || fallback;
  }

  function featureHeight(item, fallback) {
    return Number(item.heightMeters) || Number(item.height) || fallback;
  }

  function platformHeightProfile(layerId, definition, item, sample) {
    var kind = item && (item.kind || item.category);
    var height = Number(sample.height) || 0;
    var clampHeightRef = false;
    var polylineClamp = false;

    if (definition.type === "camera" || definition.type === "earthquake") {
      height = 0;
      clampHeightRef = true;
    } else if (definition.type === "moving") {
      height = clamp(height, 0, 30);
    } else if (layerId === "traffic") {
      height = clamp(height || 6, 2, 10);
      clampHeightRef = true;
      polylineClamp = true;
    } else if (layerId === "underseaCables") {
      height = -10;
      polylineClamp = true;
    } else if (layerId === "powerGrid") {
      height = clamp(height || 48, 30, 80);
    } else if (layerId === "defenseAirspace") {
      height = clamp(height || 4500, 2200, 11000);
    } else if (kind === "heat" || kind === "area" || kind === "event") {
      height = 0;
      clampHeightRef = true;
    } else if (kind === "arc") {
      height = height || 90000;
    }

    return {
      height: height,
      heightReference: clampHeightRef && Cesium.HeightReference ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE,
      clampToGround: polylineClamp
    };
  }

  function featureIntensity(item, fallback) {
    return clamp(Number(item && item.intensity) || fallback || 0.55, 0.08, 1);
  }

  function animatedMaterial(cssColor, minAlpha, maxAlpha, speed, phaseOffset) {
    var color = Cesium.Color.fromCssColorString(cssColor);
    return new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(function () {
      var t = performance.now() * 0.001 * (speed || 1) + (phaseOffset || 0);
      var wave = 0.5 + 0.3 * Math.sin(t * Math.PI * 2) + 0.2 * Math.sin(t * Math.PI * 4.4);
      return color.withAlpha(lerp(minAlpha, maxAlpha, clamp(wave, 0, 1)));
    }, false));
  }

  function animatedRadius(baseRadius, scale, speed, phaseOffset) {
    return new Cesium.CallbackProperty(function () {
      var t = performance.now() * 0.001 * (speed || 1) + (phaseOffset || 0);
      var wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.5);
      var pulse = 1.0 + (wave * (scale || 0.04)); 

      return Math.max(1, baseRadius * pulse);
    }, false);
  }

  function addEarthquakeWaveEffect(effects, name, positionProperty, sample, cssColor, baseRadius, intensity, index) {
    var color = Cesium.Color.fromCssColorString("#ff3b30"); 
    var ringCount = 8;
    for (var i = 0; i < ringCount; i++) {
      (function(phaseOffset) {
        effects.push(viewer.entities.add({
          name: name + " seismic ring " + phaseOffset,
          position: positionProperty,
          ellipse: {
            semiMajorAxis: new Cesium.CallbackProperty(function(time) {
              var t = (time.secondsOfDay * 0.28 + phaseOffset) % 1.0;
              return 1000 + t * baseRadius * 2.2;
            }, false),
            semiMinorAxis: new Cesium.CallbackProperty(function(time) {
              var t = (time.secondsOfDay * 0.28 + phaseOffset) % 1.0;
              return 1000 + t * baseRadius * 2.2;
            }, false),
            material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(function(time) {
              var t = (time.secondsOfDay * 0.28 + phaseOffset) % 1.0;
              var alpha = (1.0 - t) * 0.45;
              return color.withAlpha(alpha);
            }, false)),
            height: 0,
            outline: false,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15000000)
          }
        }));
      })(i * (1.0 / ringCount));
    }
  }
  function lineGlowColor(cssColor, minAlpha, maxAlpha, speed, phaseOffset) {
    var color = Cesium.Color.fromCssColorString(cssColor);
    return new Cesium.CallbackProperty(function () {
      var t = performance.now() * 0.001 * (speed || 1) + (phaseOffset || 0);
      var wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2.5);
      return color.withAlpha(lerp(minAlpha, maxAlpha, wave));
    }, false);
  }

  function severityColor(layerId, item, sample, fallbackColor) {
    var magnitude = Number(sample && sample.magnitude) || Number(item && item.intensity) || 0;

    if (layerId === "earthquakes") {
      if (magnitude >= 6) return "#ffffff";
      if (magnitude >= 4.5) return "#ffd0ba";
      if (magnitude >= 2.5) return "#ff9a80";
      return "#ffcabf";
    }

    if (layerId === "wildfires") {
      return magnitude > 0.78 ? "#fff0d8" : magnitude > 0.55 ? "#ffb38a" : "#ff8068";
    }

    if (layerId === "traffic") {
      return magnitude > 0.78 ? "#ffffff" : magnitude > 0.56 ? "#ffd890" : "#bfffcf";
    }

    if (layerId === "lightning") {
      return "#ffffff";
    }

    if (layerId === "emergencyIncidents") {
      var sev = String(item && item.severity || "").toLowerCase();

      if (sev === "extreme") {
        return "#ff4a6a";
      }

      if (sev === "severe") {
        return "#ff8a3d";
      }

      if (sev === "moderate") {
        return "#ffc14a";
      }

      if (sev === "minor") {
        return "#7ee0ff";
      }

      return fallbackColor;
    }

    if (layerId === "socialEvents") {
      var genre = String(item && item.metadata && item.metadata.genre || "").toLowerCase();
      var segment = String(item && item.metadata && item.metadata.segment || "").toLowerCase();

      if (genre.indexOf("music") >= 0 || segment.indexOf("music") >= 0) {
        return "#d28bff";
      }

      if (genre.indexOf("sport") >= 0 || segment.indexOf("sport") >= 0) {
        return "#5cf0c4";
      }

      return "#7ec8ff";
    }

    return fallbackColor;
  }

  function sampleDegreesAlong(points, progress, fallbackHeight) {
    var usable = (points || []).filter(function (point) {
      return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
    });

    if (!usable.length) {
      return null;
    }

    if (usable.length === 1) {
      return {
        lon: Number(usable[0][0]),
        lat: Number(usable[0][1]),
        height: Number(usable[0][2]) || fallbackHeight || 0
      };
    }

    var scaled = clamp(progress, 0, 0.999999) * (usable.length - 1);
    var startIndex = Math.floor(scaled);
    var local = scaled - startIndex;
    var start = usable[startIndex];
    var end = usable[startIndex + 1];
    var startLon = Number(start[0]);
    var endLon = Number(end[0]);
    var deltaLon = endLon - startLon;

    if (deltaLon > 180) {
      startLon += 360;
    } else if (deltaLon < -180) {
      endLon += 360;
    }

    return {
      lon: normalizeLongitude(lerp(startLon, endLon, local)),
      lat: lerp(Number(start[1]), Number(end[1]), local),
      height: lerp(Number(start[2]) || fallbackHeight || 0, Number(end[2]) || fallbackHeight || 0, local)
    };
  }

  function animatedLinePosition(pathRef, speed, phaseOffset) {
    return new Cesium.CallbackPositionProperty(function () {
      var positions = Array.isArray(pathRef) ? pathRef : (pathRef && pathRef.positions) || [];

      if (!positions.length) {
        return undefined;
      }

      if (positions.length === 1) {
        return positions[0];
      }

      var progress = (performance.now() * 0.001 * (speed || 0.12) + (phaseOffset || 0)) % 1;
      var scaled = progress * (positions.length - 1);
      var startIndex = Math.floor(scaled);
      var local = scaled - startIndex;
      var start = positions[startIndex];
      var end = positions[Math.min(startIndex + 1, positions.length - 1)];

      return Cesium.Cartesian3.lerp(start, end, local, new Cesium.Cartesian3());
    }, false);
  }

  function animatedShockwaveEntity(name, positionProperty, cssColor, radius, speed, phaseOffset, height) {
    return viewer.entities.add({
      name: name,
      position: positionProperty,
      ellipse: {
        semiMajorAxis: animatedRadius(radius, 0.86, speed, phaseOffset),
        semiMinorAxis: animatedRadius(radius, 0.86, speed, phaseOffset + 0.07),
        height: height || 0,
        material: animatedMaterial(cssColor, 0.018, 0.16, speed, phaseOffset),
        outline: false,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9000000)
      }
    });
  }

  function addLinePulseEffect(effects, name, pathRef, cssColor, speed, phaseOffset, pixelSize) {
    var size = pixelSize || 7;
    var pulse = viewer.entities.add({
      name: name,
      position: animatedLinePosition(pathRef, speed, phaseOffset),
      billboard: {
        image: (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
          OrionTextureManager.getIcon('pulse') : markerIcon("pulse"),
        scale: clamp(size / 24, 0.22, 0.36),
        color: Cesium.Color.fromCssColorString(cssColor).withAlpha(0.94),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 36000000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    if (pulse.billboard && window.OrionTextureManager) {
      safeAssignBillboard(pulse.billboard, OrionTextureManager.getIcon('pulse'));
    }
    
    effects.push(pulse);
  }

  function isHeatmapLayer(layerId) {
    return layerId === "rfHeatmap" ||
      layerId === "socialEvents" ||
      layerId === "emergencyIncidents" ||
      layerId === "traffic" ||
      layerId === "cameras";
  }

  function isDensityOnlyIntelLayer(layerId) {
    return layerId === "rfHeatmap" ||
      layerId === "socialEvents" ||
      layerId === "traffic";
  }

  function suppressGenericIntelEllipse(layerId, kind) {
    if (isDensityOnlyIntelLayer(layerId)) {
      return true;
    }

    return kind === "line" ||
      kind === "arc" ||
      kind === "volume" ||
      layerId === "cyberNetwork" ||
      layerId === "underseaCables" ||
      layerId === "powerGrid" ||
      layerId === "airCorridors" ||
      layerId === "defenseAirspace" ||
      layerId === "volumetricWeather" ||
      layerId === "lightning";
  }

  function useSimpleIntelDot(layerId, kind) {
    return isDensityOnlyIntelLayer(layerId) ||
      layerId === "defenseAirspace" ||
      layerId === "volumetricWeather" ||
      layerId === "lightning";
  }

  function raiseLayerToTop(layer) {
    if (!viewer || !layer || !imageryLayerExists(layer)) {
      return;
    }

    viewer.imageryLayers.raiseToTop(layer);
  }

  function raiseOperationalLayers() {
    if (!viewer || !viewer.imageryLayers) {
      return;
    }

    raiseLayerToTop(streetDetailLayer);
    raiseLayerToTop(streetRoadsLayer);
    raiseLayerToTop(weatherRadarLayer);
    raiseLayerToTop(zoomWeatherLayer);

    Object.keys(platformHeatmapLayers).forEach(function (layerId) {
      raiseLayerToTop(platformHeatmapLayers[layerId]);
    });
  }

  function isValidCoordinate(lon, lat) {
    if (typeof lon !== 'number' || typeof lat !== 'number') {
      return false;
    }
    if (!isFinite(lon) || !isFinite(lat)) {
      return false;
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return false;
    }
    return true;
  }

  function calculateDistance(lon1, lat1, lon2, lat2) {
    var dLon = lon2 - lon1;
    var dLat = lat2 - lat1;
    return Math.sqrt(dLon * dLon + dLat * dLat);
  }
  function dedupeConsecutiveRingPositions(ring) {
    if (!ring || ring.length === 0) {
      return ring;
    }
    var eps = 1e-9;
    var out = [ring[0]];
    for (var i = 1; i < ring.length; i++) {
      var a = out[out.length - 1];
      var b = ring[i];
      if (!Array.isArray(b) || b.length < 2) {
        continue;
      }
      var dlon = Math.abs(Number(b[0]) - Number(a[0]));
      var dlat = Math.abs(Number(b[1]) - Number(a[1]));
      if (dlon > eps || dlat > eps) {
        out.push([Number(b[0]), Number(b[1])]);
      }
    }
    return out;
  }

  function isValidPolygonRing(ring) {
    if (!ring || ring.length < 4) {
      return false;
    }

    var allSame = true;
    var first = ring[0];
    for (var i = 1; i < ring.length; i++) {
      if (ring[i][0] !== first[0] || ring[i][1] !== first[1]) {
        allSame = false;
        break;
      }
    }
    if (allSame) {
      return false;
    }

    var maxEdgeLength = 180;
    for (var i = 0; i < ring.length - 1; i++) {
      var dist = calculateDistance(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
      if (dist > maxEdgeLength) {
        console.warn('Polygon ring has edge longer than', maxEdgeLength, 'degrees:', dist);
        return false;
      }
    }

    return true;
  }

  function validateCoordinateArray(coords, depth) {
    if (!Array.isArray(coords)) {
      return null;
    }

    if (depth === 0) {
      if (coords.length >= 2 && isValidCoordinate(coords[0], coords[1])) {
        return coords;
      }
      return null;
    }

    var validCoords = [];
    for (var i = 0; i < coords.length; i++) {
      var validated = validateCoordinateArray(coords[i], depth - 1);
      if (validated !== null) {
        validCoords.push(validated);
      }
    }

    return validCoords.length > 0 ? validCoords : null;
  }

  function validateGeometry(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      return null;
    }

    var type = geometry.type;
    var coords = geometry.coordinates;
    var validated = null;

    try {
      switch (type) {
        case 'Point':
          validated = validateCoordinateArray(coords, 0);
          break;
        case 'LineString':
        case 'MultiPoint':
          validated = validateCoordinateArray(coords, 1);
          if (validated && validated.length < 2) {
            return null;
          }
          break;
        case 'Polygon':
          validated = validateCoordinateArray(coords, 2);
          if (validated) {
            var validRings = [];
            for (var i = 0; i < validated.length; i++) {
              var ring = validated[i];
              if (ring && ring.length >= 3) {
                ring = dedupeConsecutiveRingPositions(ring);
                if (!ring || ring.length < 3) {
                  continue;
                }
                var first = ring[0];
                var last = ring[ring.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                  ring.push([first[0], first[1]]);
                }
                ring = dedupeConsecutiveRingPositions(ring);
                if (!ring || ring.length < 4) {
                  continue;
                }
                if (isValidPolygonRing(ring)) {
                  validRings.push(ring);
                }
              }
            }
            validated = validRings.length > 0 ? validRings : null;
          }
          break;
        case 'MultiLineString':
          validated = validateCoordinateArray(coords, 2);
          if (validated) {
            var validLines = [];
            for (var i = 0; i < validated.length; i++) {
              if (validated[i] && validated[i].length >= 2) {
                validLines.push(validated[i]);
              }
            }
            validated = validLines.length > 0 ? validLines : null;
          }
          break;
        case 'MultiPolygon':
          validated = validateCoordinateArray(coords, 3);
          if (validated) {
            var validPolygons = [];
            for (var i = 0; i < validated.length; i++) {
              var polygon = validated[i];
              if (!polygon) continue;
              
              var validRings = [];
              for (var j = 0; j < polygon.length; j++) {
                var ring = polygon[j];
                if (ring && ring.length >= 3) {
                  ring = dedupeConsecutiveRingPositions(ring);
                  if (!ring || ring.length < 3) {
                    continue;
                  }
                  var first = ring[0];
                  var last = ring[ring.length - 1];
                  if (first[0] !== last[0] || first[1] !== last[1]) {
                    ring.push([first[0], first[1]]);
                  }
                  ring = dedupeConsecutiveRingPositions(ring);
                  if (!ring || ring.length < 4) {
                    continue;
                  }
                  if (isValidPolygonRing(ring)) {
                    validRings.push(ring);
                  }
                }
              }
              
              if (validRings.length > 0) {
                validPolygons.push(validRings);
              }
            }
            validated = validPolygons.length > 0 ? validPolygons : null;
          }
          break;
        default:
          console.warn('Unknown geometry type:', type);
          return null;
      }

      if (validated === null) {
        return null;
      }

      return {
        type: type,
        coordinates: validated
      };
    } catch (error) {
      console.error('Error validating geometry:', error);
      return null;
    }
  }

  function validateAndCleanGeoJSON(geojson, name) {
    console.log('Validating GeoJSON:', name);
    
    if (!geojson || geojson.type !== 'FeatureCollection') {
      console.error('Invalid GeoJSON: not a FeatureCollection');
      throw new Error('Invalid GeoJSON format');
    }

    var features = geojson.features || [];
    var validFeatures = [];
    var invalidCount = 0;

    if (features.length > 0) {
      var firstFeature = features[0];
      console.log('First feature geometry type:', firstFeature.geometry ? firstFeature.geometry.type : 'none');
      if (firstFeature.geometry && firstFeature.geometry.coordinates) {
        var coords = firstFeature.geometry.coordinates;
        console.log('Coordinate structure depth:', Array.isArray(coords) ? (Array.isArray(coords[0]) ? (Array.isArray(coords[0][0]) ? (Array.isArray(coords[0][0][0]) ? 4 : 3) : 2) : 1) : 0);
        console.log('First coordinate sample:', JSON.stringify(coords).substring(0, 200));
      }
    }

    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      if (!feature || !feature.geometry) {
        invalidCount++;
        continue;
      }

      var validGeometry = validateGeometry(feature.geometry);
      if (validGeometry) {
        validFeatures.push({
          type: 'Feature',
          properties: feature.properties || {},
          geometry: validGeometry
        });
      } else {
        invalidCount++;
        if (i < 3) {
          console.log('Invalid feature', i, ':', feature.properties ? feature.properties.name : 'unnamed');
        }
      }
    }

    console.log('GeoJSON validation complete:', name);
    console.log('  Valid features:', validFeatures.length);
    console.log('  Invalid features filtered:', invalidCount);

    if (validFeatures.length === 0) {
      throw new Error('No valid features found in GeoJSON');
    }

    return {
      type: 'FeatureCollection',
      features: validFeatures
    };
  }

  function styleBoundaryDataSource(dataSource, cssColor, alpha, width, label) {
    var color = Cesium.Color.fromCssColorString(cssColor).withAlpha(alpha);
    var entities = dataSource.entities.values;

    entities.forEach(function (entity) {
      entity.show = state.layers.boundaries;
      entity.name = entity.name || label;

      if (entity.polygon) {
        entity.polygon.material = Cesium.Color.TRANSPARENT;
        if (Cesium.ArcType && Cesium.ArcType.GEODESIC !== undefined) {
          entity.polygon.arcType = Cesium.ArcType.GEODESIC;
        }
        entity.polygon.outline = true;
        entity.polygon.outlineColor = color;
        entity.polygon.outlineWidth = width;
        entity.polygon.height = 600;
        entity.polygon.heightReference = Cesium.HeightReference.NONE;
        entity.polygon.classificationType = undefined;
      }

      if (entity.polyline) {
        entity.polyline.material = color;
        entity.polyline.width = width;
        entity.polyline.clampToGround = false;
        entity.polyline.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(0, 42000000);
      }
    });
  }

  function applyBoundaryVisibility() {
    Object.keys(boundaryDataSources).forEach(function (key) {
      var source = boundaryDataSources[key];
      if (source) {
        source.show = state.layers.boundaries;
        source.entities.values.forEach(function (entity) {
          entity.show = state.layers.boundaries;
        });
      }
    });

    if (viewer) {
      raiseOperationalLayers();
      viewer.scene.requestRender();
    }
  }

  function updateBoundaryLayer() {
    if (!viewer) {
      return;
    }

    if (!state.layers.boundaries) {
      applyBoundaryVisibility();
      return;
    }

    if (boundaryDataSources.countries && boundaryDataSources.usStates) {
      applyBoundaryVisibility();
      return;
    }

    if (boundaryLoadPromise) {
      boundaryLoadPromise.then(applyBoundaryVisibility);
      return;
    }

    if (boundaryLoadPromise) {
      boundaryLoadPromise.then(applyBoundaryVisibility);
      return;
    }

    showToast("Loading border data...");

    var boundaryUrls = isStaticHostMode()
      ? [
        "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
        "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"
      ]
      : [
        "/geo/countries?v=20260515-validated",
        "/geo/us-states?v=20260515-validated"
      ];

    boundaryLoadPromise = Promise.all([
      fetch(boundaryUrls[0])
        .then(function(response) { return response.json(); })
        .then(function(geojson) { return validateAndCleanGeoJSON(geojson, "countries"); }),
      fetch(boundaryUrls[1])
        .then(function(response) { return response.json(); })
        .then(function(geojson) { return validateAndCleanGeoJSON(geojson, "us-states"); })
    ]).then(function (cleanedGeoJSONs) {
      return Promise.all([
        Cesium.GeoJsonDataSource.load(cleanedGeoJSONs[0], {
          stroke: Cesium.Color.WHITE.withAlpha(0.26),
          fill: Cesium.Color.TRANSPARENT,
          strokeWidth: 1.1,
          clampToGround: false
        }),
        Cesium.GeoJsonDataSource.load(cleanedGeoJSONs[1], {
          stroke: Cesium.Color.WHITE.withAlpha(0.46),
          fill: Cesium.Color.TRANSPARENT,
          strokeWidth: 1.45,
          clampToGround: false
        })
      ]);
    }).then(function (sources) {
      boundaryDataSources.countries = sources[0];
      boundaryDataSources.usStates = sources[1];
      styleBoundaryDataSource(boundaryDataSources.countries, "#ffffff", 0.24, 1.05, "Country border");
      styleBoundaryDataSource(boundaryDataSources.usStates, "#ffffff", 0.48, 1.55, "US state border");
      viewer.dataSources.add(boundaryDataSources.countries);
      viewer.dataSources.add(boundaryDataSources.usStates);
      applyBoundaryVisibility();
      showToast("State and country borders enabled.");
    }).catch(function (error) {
      console.error("Boundary load error:", error);
      state.layers.boundaries = false;
      syncControlState();
      showToast("Border overlay could not load: " + error.message);
    }).finally(function () {
      boundaryLoadPromise = null;
    });
  }

  function heatmapOpacity(layerId) {
    if (layerId === "cameras") {
      return 0.38;
    }
    if (layerId === "traffic") {
      return 0.62;
    }
    if (layerId === "emergencyIncidents") {
      return 0.58;
    }
    return 0.54;
  }

  function heatmapPointsFromItems(layerId, items) {
    var points = [];

    (items || []).forEach(function (item, index) {
      if (!item) {
        return;
      }

      var intensity = featureIntensity(item, layerId === "cameras" ? 0.45 : 0.56);
      var radiusKm = Math.max(8, (featureRadius(item, layerId === "traffic" ? 32000 : 52000) || 52000) / 1000);

      if (layerId === "cameras") {
        if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lon))) {
          return;
        }
        points.push({
          lat: Number(item.lat),
          lon: Number(item.lon),
          intensity: clamp((Number(item.clusterCount) || 1) / 8, 0.28, 1),
          radiusKm: clamp((Number(item.clusterCount) || 1) * 16, 20, 180),
          label: item.name || "Camera density"
        });
        return;
      }

      if (layerId === "traffic" || item.kind === "line" || item.kind === "arc") {
        var route = item.points || item.route || [];
        var samples = layerId === "traffic" ? 44 : 6;
        for (var sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
          var sample = sampleDegreesAlong(route, samples === 1 ? 0 : sampleIndex / (samples - 1), 0);
          if (sample) {
            points.push({
              lat: sample.lat,
              lon: sample.lon,
              intensity: intensity,
              radiusKm: layerId === "traffic" ? clamp(radiusKm * 0.86, 22, 110) : clamp(radiusKm * 0.3, 12, 85),
              label: item.name || "Traffic density"
            });
          }
        }
        return;
      }

      if (Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))) {
        points.push({
          lat: Number(item.lat),
          lon: Number(item.lon),
          intensity: intensity,
          radiusKm: clamp(radiusKm, 12, 240),
          label: item.name || platformLayerDefinitions[layerId].label
        });
      }
    });

    return points;
  }

  function heatmapBounds(points, layerId) {
    var west = 180;
    var east = -180;
    var south = 90;
    var north = -90;
    var maxRadiusKm = 24;

    points.forEach(function (point) {
      west = Math.min(west, point.lon);
      east = Math.max(east, point.lon);
      south = Math.min(south, point.lat);
      north = Math.max(north, point.lat);
      maxRadiusKm = Math.max(maxRadiusKm, Number(point.radiusKm) || 24);
    });

    var latPad = clamp(maxRadiusKm / 55, 0.55, 12);
    var lonPad = clamp(maxRadiusKm / 55, 0.55, 18);

    west = clamp(west - lonPad, -179.8, 179.8);
    east = clamp(east + lonPad, -179.8, 179.8);
    south = clamp(south - latPad, -84, 84);
    north = clamp(north + latPad, -84, 84);

    var minSpan = 0.5;
    if (east - west < minSpan) {
      west -= minSpan / 2;
      east += minSpan / 2;
    }

    if (north - south < minSpan) {
      south -= minSpan / 2;
      north += minSpan / 2;
    }

    return {
      west: west,
      east: east,
      south: south,
      north: north
    };
  }

  function heatColor(value) {
    var stops = [
      [0.00, [45, 76, 255, 0]],
      [0.14, [59, 95, 255, 110]],
      [0.28, [59, 210, 255, 150]],
      [0.44, [70, 255, 142, 175]],
      [0.60, [255, 238, 86, 205]],
      [0.76, [255, 145, 53, 228]],
      [0.90, [255, 63, 58, 244]],
      [1.00, [255, 255, 255, 255]]
    ];

    for (var index = 1; index < stops.length; index++) {
      if (value <= stops[index][0]) {
        var prev = stops[index - 1];
        var next = stops[index];
        var local = clamp((value - prev[0]) / (next[0] - prev[0]), 0, 1);
        return [
          Math.round(lerp(prev[1][0], next[1][0], local)),
          Math.round(lerp(prev[1][1], next[1][1], local)),
          Math.round(lerp(prev[1][2], next[1][2], local)),
          Math.round(lerp(prev[1][3], next[1][3], local))
        ];
      }
    }

    return stops[stops.length - 1][1];
  }

  function buildHeatmapTexture(layerId, points) {
    var bounds = heatmapBounds(points, layerId);
    var width = 768;
    var height = 512;
    var alphaCanvas = document.createElement("canvas");
    var colorCanvas = document.createElement("canvas");
    alphaCanvas.width = colorCanvas.width = width;
    alphaCanvas.height = colorCanvas.height = height;

    var ctx = alphaCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    var lonSpan = Math.max(0.0001, bounds.east - bounds.west);
    var latSpan = Math.max(0.0001, bounds.north - bounds.south);

    points.forEach(function (point) {
      var x = (point.lon - bounds.west) / lonSpan * width;
      var y = (bounds.north - point.lat) / latSpan * height;
      var latRadius = (Number(point.radiusKm) || 28) / 111;
      var lonRadius = latRadius / Math.max(0.25, Math.cos(Cesium.Math.toRadians(point.lat)));
      var minRadiusPx = 10;
      var maxRadiusPx = Math.max(width, height) * 0.28;
      var radius = clamp(Math.max(lonRadius / lonSpan * width, latRadius / latSpan * height), minRadiusPx, maxRadiusPx);
      var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      var alpha = clamp((Number(point.intensity) || 0.5) * 0.62, 0.12, 0.72);

      gradient.addColorStop(0, "rgba(0,0,0," + alpha + ")");
      gradient.addColorStop(0.38, "rgba(0,0,0," + (alpha * 0.5) + ")");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });

    var colorCtx = colorCanvas.getContext("2d");
    var image = ctx.getImageData(0, 0, width, height);
    var data = image.data;

    for (var pixel = 0; pixel < data.length; pixel += 4) {
      var value = clamp(data[pixel + 3] / 220, 0, 1);
      if (value < 0.025) {
        data[pixel + 3] = 0;
        continue;
      }
      var color = heatColor(value);
      data[pixel] = color[0];
      data[pixel + 1] = color[1];
      data[pixel + 2] = color[2];
      data[pixel + 3] = Math.round(color[3] * clamp(value * 1.35, 0.18, 1));
    }

    colorCtx.putImageData(image, 0, 0);

    return {
      url: colorCanvas.toDataURL("image/png"),
      rectangle: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north)
    };
  }

  function heatmapSignature(points) {
    return points.map(function (point) {
      return [
        point.lat.toFixed(3),
        point.lon.toFixed(3),
        point.intensity.toFixed(2),
        Math.round(point.radiusKm)
      ].join(":");
    }).join("|");
  }

  function removePlatformHeatmap(layerId) {
    var layer = platformHeatmapLayers[layerId];

    if (layer && viewer && imageryLayerExists(layer)) {
      viewer.imageryLayers.remove(layer, true);
    }

    delete platformHeatmapLayers[layerId];
    delete platformHeatmapSignatures[layerId];
  }

  function updatePlatformHeatmap(layerId, items) {
    if (!viewer || !isHeatmapLayer(layerId) || !layerStateManager.isLayerEnabled(layerId)) {
      removePlatformHeatmap(layerId);
      return;
    }

    var points = heatmapPointsFromItems(layerId, items);

    if (!points.length) {
      removePlatformHeatmap(layerId);
      return;
    }

    var signature = heatmapSignature(points);

    if (platformHeatmapSignatures[layerId] === signature && platformHeatmapLayers[layerId]) {
      raiseOperationalLayers();
      return;
    }

    var texture = buildHeatmapTexture(layerId, points);
    var oldLayer = platformHeatmapLayers[layerId];
    var heatLayer = viewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
      url: texture.url,
      rectangle: texture.rectangle,
      credit: platformLayerDefinitions[layerId].label + " density"
    }));

    heatLayer.alpha = heatmapOpacity(layerId);
    heatLayer.brightness = 1.02;
    heatLayer.contrast = 1.1;
    heatLayer.saturation = 1.08;
    heatLayer.orionHeatmapLayerId = layerId;
    platformHeatmapLayers[layerId] = heatLayer;
    platformHeatmapSignatures[layerId] = signature;

    if (oldLayer && imageryLayerExists(oldLayer)) {
      viewer.imageryLayers.remove(oldLayer, true);
    }

    raiseOperationalLayers();
    viewer.scene.requestRender();
  }

  var throttledTrafficUpdate = throttle(function(items) {
    updatePlatformHeatmap("traffic", items);
  }, 2000);

  function movingTrailPositions(item, time) {
    var positions = [];
    var periodHours = Math.max(0.4, Number(item.periodHours) || 4);
    var stepMs = periodHours * MS_PER_HOUR / 22;

    for (var index = -18; index <= 0; index++) {
      var sample = routeSampleFromItem(item, new Date(time.getTime() + index * stepMs));

      if (sample) {
        positions.push(Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height));
      }
    }

    return positions;
  }

  function bearingDegrees(lat1, lon1, lat2, lon2) {
    var phi1 = Cesium.Math.toRadians(Number(lat1) || 0);
    var phi2 = Cesium.Math.toRadians(Number(lat2) || 0);
    var delta = Cesium.Math.toRadians((Number(lon2) || 0) - (Number(lon1) || 0));
    var y = Math.sin(delta) * Math.cos(phi2);
    var x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(delta);
    return (Cesium.Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  function buildSatelliteTrail(item, time) {
    var positions = [];

    for (var index = -18; index <= 18; index++) {
      var sample = satelliteSampleFromItem(item, new Date(time.getTime() + index * 5 * 60 * 1000));

      if (sample) {
        positions.push(Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height));
      }
    }

    return positions;
  }

  function createPlatformEffects(layerId, definition, item, sample, positionProperty, profile, index, linePathRef) {
    var effects = [];
    var kind = item.kind || definition.type;
    var cssColor = severityColor(layerId, item, sample, definition.color);
    var intensity = featureIntensity(item, layerId === "earthquakes" ? clamp((sample.magnitude || 1) / 6, 0.2, 1) : 0.56);
    var baseRadius = featureRadius(item, layerId === "earthquakes" ? clamp((sample.magnitude || 1) * 15000, 28000, 160000) : 52000);
    var visualRadius = baseRadius;

    if (layerId === "lightning") {
      visualRadius = clamp(featureRadius(item, 9000), 5500, 18000);
    } else if (layerId === "emergencyIncidents") {
      visualRadius = clamp(featureRadius(item, 26000), 12000, 52000);
    } else if (layerId === "traffic") {
      visualRadius = clamp(featureRadius(item, 1800), 700, 2600);
    }

    if (definition.type === "earthquake") {
      var cameraHeight = viewer.camera.positionCartographic.height;
      var lodLevel = currentLODLevel;
      
      if (lodLevel === 'close') {
        for (var waveIdx = 0; waveIdx < 3; waveIdx++) {
          effects.push(viewer.entities.add({
            name: (item.name || "Earthquake") + " wave " + waveIdx,
            position: positionProperty,
            ellipse: {
              semiMajorAxis: new Cesium.CallbackProperty(function(time) {
                var elapsed = (time.secondsOfDay + index * 0.1 + waveIdx * 0.8) % 3.6;
                return baseRadius * (0.2 + elapsed / 3.6 * 0.8);
              }, false),
              semiMinorAxis: new Cesium.CallbackProperty(function(time) {
                var elapsed = (time.secondsOfDay + index * 0.1 + waveIdx * 0.8) % 3.6;
                return baseRadius * (0.2 + elapsed / 3.6 * 0.8);
              }, false),
              material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(function(time) {
                var elapsed = (time.secondsOfDay + index * 0.1 + waveIdx * 0.8) % 3.6;
                var alpha = clamp((1 - elapsed / 3.6) * intensity * 0.35, 0, 0.35);
                return Cesium.Color.fromCssColorString(cssColor).withAlpha(alpha);
              }, false)),
              height: 0,
              outline: false,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000000)
            }
          }));
        }
        
        effects.push(viewer.entities.add({
          name: (item.name || "Earthquake") + " epicenter",
          position: positionProperty,
          ellipse: {
            semiMajorAxis: baseRadius * 0.1,
            semiMinorAxis: baseRadius * 0.1,
            material: animatedMaterial("#ff3b30", 0.1, 0.9, 2.5, index * 0.1),
            height: 0,
            outline: false
          }
        }));
      } else if (lodLevel === 'medium') {
        effects.push(viewer.entities.add({
          name: (item.name || "Earthquake") + " ring",
          position: positionProperty,
          ellipse: {
            semiMajorAxis: baseRadius * 0.5,
            semiMinorAxis: baseRadius * 0.5,
            material: animatedMaterial(cssColor, 0.1, 0.4, 1.5, index * 0.1),
            height: 0,
            outline: false
          }
        }));
      }
    }

    if (layerId === "wildfires") {
      effects.push(viewer.entities.add({
        name: (item.name || "Wildfire") + " fire core",
        position: positionProperty,
        point: {
          pixelSize: 6 + intensity * 8,
          color: Cesium.Color.fromCssColorString("#ff7b32").withAlpha(0.95),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
          outlineWidth: 1.2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000)
        }
      }));

      var smokeEffects = Orion.Renderer.Environment.SmokeSystem.createSmokePlume(item.id || index, sample, intensity, {
        layerId: "wildfires",
        mode: "wildfire",
        radius: clamp(featureRadius(item, 72000), 38000, 150000),
        height: clamp(featureHeight(item, 18000), 9000, 42000),
        opacity: 0.2
      });
      smokeEffects.forEach(function(e) { effects.push(e); });
    }

    if (layerId === "lightning") {
      var lightningEffects = Orion.Renderer.Environment.LightningSystem.createLightningBolt(item.id || index, sample, visualRadius, intensity);
      lightningEffects.forEach(function(e) { effects.push(e); });
    }

    if (layerId === "volumetricWeather") {
      var stormRadius = clamp(baseRadius * 0.36, 42000, 190000);
      for (var stormRing = 0; stormRing < 3; stormRing++) {
        effects.push(animatedShockwaveEntity(
          (item.name || "Storm") + " pressure ring " + stormRing,
          positionProperty,
          cssColor,
          stormRadius * (0.72 + stormRing * 0.18),
          0.08 + intensity * 0.08,
          index * 0.071 + stormRing * 0.28,
          clamp(featureHeight(item, 36000) * 0.16, 8000, 26000)
        ));
      }
      var stormSmoke = Orion.Renderer.Environment.SmokeSystem.createSmokePlume(item.id || index, sample, intensity, {
        layerId: "volumetricWeather",
        mode: "storm",
        radius: clamp(featureRadius(item, 150000), 60000, 420000),
        height: clamp(featureHeight(item, 62000), 26000, 98000),
        baseAltitude: clamp(featureHeight(item, 36000) * 0.32, 9000, 34000),
        opacity: 0.16
      });
      stormSmoke.forEach(function(e) { effects.push(e); });
      return effects;
      
      var cloudLayerCount = 72;
      var cloudOpacity = 0.018;
      
      for (var cloudIdx = 0; cloudIdx < cloudLayerCount; cloudIdx++) {
        (function(idx) {
          var phase = idx / cloudLayerCount;
          var cloudSeed = index * 1000 + idx * 80;
          
          var coreDistance = Math.sqrt(idx / cloudLayerCount);
          var angleOffset = (idx / cloudLayerCount) * Math.PI * 2 * 3;
          var radiusOffset = Math.pow(coreDistance, 0.78) * baseRadius * 0.52;
          
          var turbulence = Math.sin(cloudSeed * 0.1) * 0.5 + 0.5;
          var density = 1.0 - Math.pow(coreDistance, 1.5);
          
          effects.push(viewer.entities.add({
            name: (item.name || "Storm") + " cloud cell " + idx,
            position: new Cesium.CallbackPositionProperty(function(time, result) {
              var seconds = time.secondsOfDay + cloudSeed;
              
              var rotation = seconds * 0.015 + angleOffset;
              var baseOffsetX = Math.cos(rotation) * radiusOffset;
              var baseOffsetY = Math.sin(rotation) * radiusOffset;
              
              var turbX = Math.sin(seconds * 0.04 + idx * 0.3) * 1400 * turbulence;
              turbX += Math.sin(seconds * 0.08 + idx * 0.15) * 700 * turbulence;
              
              var turbY = Math.cos(seconds * 0.035 + idx * 0.25) * 1400 * turbulence;
              turbY += Math.cos(seconds * 0.07 + idx * 0.2) * 700 * turbulence;
              
              var driftX = baseOffsetX + turbX + Math.sin(seconds * 0.02) * 900;
              var driftY = baseOffsetY + turbY + Math.cos(seconds * 0.018) * 900;
              
              var baseHeight = featureHeight(item, 42000);
              var heightVariation = Math.sin(idx * 0.8 + seconds * 0.05) * 6200;
              var verticalFlow = Math.sin(coreDistance * Math.PI) * 4200;
              var height = baseHeight + heightVariation + verticalFlow;
              
              return Cesium.Cartesian3.fromDegrees(
                sample.lon + (driftX / 111000), 
                sample.lat + (driftY / 111000), 
                height, 
                Cesium.Ellipsoid.WGS84, 
                result
              );
            }, false),
            billboard: {
              image: markerIcon("soft-dot"),
              scale: new Cesium.CallbackProperty(function(time) {
                var seconds = time.secondsOfDay + cloudSeed;
                
                var coreScale = 0.18 + density * 0.16;
                var variation = 1.0 + turbulence * 0.12;
                var baseScale = coreScale * variation * (1.0 + intensity * 0.08);
                
                var pulse = Math.sin(seconds * 0.6 + idx * 0.4) * 0.04;
                return baseScale * (1.0 + pulse);
              }, false),
              color: new Cesium.CallbackProperty(function(time) {
                var seconds = time.secondsOfDay + cloudSeed;
                
                var brightness = 0.85 + density * 0.15;
                var alpha = cloudOpacity * (0.56 + density * 0.34);
                
                var flicker = Math.sin(seconds * 2.5 + idx * 0.1) * 0.015;
                alpha += flicker * intensity;
                
                return Cesium.Color.fromBytes(210, 220, 230, Math.floor(clamp(alpha, 0.006, 0.035) * 255));
              }, false),
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15000000),
              disableDepthTestDistance: 0
            }
          }));
        })(cloudIdx);
      }
    }

    if (layerId === "defenseAirspace") {
      effects.push(animatedShockwaveEntity((item.name || "Airspace") + " perimeter sweep", positionProperty, cssColor, baseRadius, 0.18 + intensity * 0.22, index * 0.05, profile.height));
      return effects;
      effects.push(viewer.entities.add({
        name: (item.name || "Airspace") + " altitude volume",
        position: positionProperty,
        cylinder: {
          length: profile.height * 1.35,
          topRadius: baseRadius,
          bottomRadius: baseRadius,
          material: animatedMaterial(cssColor, 0.025, 0.095, 0.14, index * 0.08),
          outline: false,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9000000)
        }
      }));
    }

    if (layerId === "emergencyIncidents") {
      effects.push(animatedShockwaveEntity((item.name || definition.label) + " alert pulse", positionProperty, cssColor, visualRadius, 0.42 + intensity * 0.34, index * 0.1, 0));
    }

    if (kind === "line" || kind === "arc" || layerId === "underseaCables" || layerId === "powerGrid" || layerId === "airCorridors" || layerId === "traffic") {
      var points = item.points || item.route || [];
      var pulseHeight = layerId === "underseaCables" ? 2 : profile.height;
      var pulseSpeed = layerId === "cyberNetwork" ? 0.16 + intensity * 0.18 : layerId === "traffic" ? 0.26 + intensity * 0.18 : 0.08 + intensity * 0.12;
      var pathRef = linePathRef || { positions: linePathPositions(points, pulseHeight, kind === "arc" ? 12 : 8) };
      addLinePulseEffect(effects, (item.name || definition.label) + " signal pulse", pathRef, cssColor, pulseSpeed, index * 0.071, layerId === "traffic" ? 5 : 7);
      if (layerId === "cyberNetwork" || layerId === "powerGrid" || layerId === "airCorridors") {
        addLinePulseEffect(effects, (item.name || definition.label) + " secondary pulse", pathRef, cssColor, pulseSpeed * 0.72, 0.48 + index * 0.037, 5);
      }
    }

    if (definition.type === "satellite") {
      var lodLevel = currentLODLevel;
      var cameraHeight = viewer.camera.positionCartographic.height;
      
      if (layerId === "starlink") {
        var satelliteScale = lodLevel === 'close' ? 0.24 : 0.18;
        var satelliteAlpha = lodLevel === 'close' ? 0.45 : 0.32;
        
        effects.push(viewer.entities.add({
          name: (item.name || definition.label) + " orbital glow",
          position: positionProperty,
          billboard: {
            image: markerIcon("soft-dot"),
            scale: satelliteScale,
            color: Cesium.Color.fromCssColorString(cssColor).withAlpha(satelliteAlpha),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 36000000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        }));
      } else {
        var satelliteScale = layerId === "debris" ? 0.18 : 0.24;
        var satelliteAlpha = lodLevel === 'distant' ? 0.25 : 0.42;
        
        effects.push(viewer.entities.add({
          name: (item.name || definition.label) + " orbital glow",
          position: positionProperty,
          billboard: {
            image: markerIcon("soft-dot"),
            scale: satelliteScale,
            color: Cesium.Color.fromCssColorString(cssColor).withAlpha(satelliteAlpha),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 36000000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        }));
      }
    }

    return effects;
  }

  function addOperationalPulse(lat, lon, color, radiusM) {
    if (!viewer) return;
    var entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      ellipse: {
        semiMajorAxis: new Cesium.CallbackProperty(function(time, result) {
          var t = (performance.now() * 0.001) % 1.0;
          return t * (radiusM || 50000);
        }, false),
        semiMinorAxis: new Cesium.CallbackProperty(function(time, result) {
          var t = (performance.now() * 0.001) % 1.0;
          return t * (radiusM || 50000);
        }, false),
        material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(function(time, result) {
          var t = (performance.now() * 0.001) % 1.0;
          return Cesium.Color.fromCssColorString(color || "#ffffff").withAlpha((1.0 - t) * 0.4);
        }, false)),
        height: 0,
        outline: false
      }
    });
    
    setTimeout(function() {
      if (viewer && viewer.entities.contains(entity)) {
        viewer.entities.remove(entity);
      }
    }, 1000);
  }

  function createPlatformRecord(layerId, item, sample, index) {
    var definition = platformLayerDefinitions[layerId];
    var color = Cesium.Color.fromCssColorString(definition.color);
    var id = platformEntityKey(layerId, item.id || item.name || index);
    var profile = platformHeightProfile(layerId, definition, item, sample);
    var height = profile.height;
    var position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, height);
    var currentPosition = Cesium.Cartesian3.clone(position);
    var targetPosition = Cesium.Cartesian3.clone(position);
    var positionProperty = new Cesium.CallbackPositionProperty(function () {
      return currentPosition;
    }, false);
    var commonDistance = new Cesium.DistanceDisplayCondition(0, definition.type === "satellite" ? 36000000 : 26000000);
    var kind = item.kind || definition.type;
    var linePathRef = null;
    var entityOptions = {
      name: item.name || definition.label,
      position: positionProperty,
      show: true
    };
    var tintBillboard = false;
    var initialGlyph = null;

    if (definition.type === "camera") {
      entityOptions.billboard = {
        image: (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
          OrionTextureManager.getIcon('camera-online') : platformIcon("camera", definition.color),
        scale: 0.34,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        distanceDisplayCondition: commonDistance,
        heightReference: profile.heightReference,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      };
    } else if (definition.type === "moving") {
      entityOptions.billboard = {
        image: trackIcon(item.trackType || "sea", definition.color),
        scale: 0.34,
        rotation: Cesium.Math.toRadians(sample.heading || 0),
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        distanceDisplayCondition: commonDistance,
        heightReference: profile.heightReference,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      };
    } else if (definition.type === "intel") {
      var cssTint = severityColor(layerId, item, sample, definition.color);

      if (kind === "line" || kind === "arc") {
        linePathRef = {
          positions: linePathPositions(item.points || item.route || [], height, kind === "arc" ? 12 : 8)
        };

        if (linePathRef.positions.length < 2) {
          linePathRef.positions = pointsToCartesian(item.points || item.route || [], height);
        }

        entityOptions.polyline = {
          positions: linePathRef.positions,
          width: kind === "arc" ? 2.45 : 1.85,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: kind === "arc" ? 0.26 : 0.15,
            color: lineGlowColor(cssTint, kind === "arc" ? 0.34 : 0.28, kind === "arc" ? 0.88 : 0.68, kind === "arc" ? 0.26 : 0.18, index * 0.08)
          }),
          clampToGround: profile.clampToGround,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 36000000)
        };
        entityOptions.billboard = {
          image: markerIcon("soft-dot"),
          scale: layerId === "traffic" ? 0.21 : 0.26,
          color: Cesium.Color.WHITE.withAlpha(0.98),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 26000000),
          heightReference: profile.heightReference,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        };
        tintBillboard = false;
        
        initialGlyph = intelLayerGlyph(layerId, kind, item, false, cssTint);
      } else if (kind === "area" || kind === "heat") {
        if (!suppressGenericIntelEllipse(layerId, kind)) {
          entityOptions.ellipse = {
            semiMajorAxis: featureRadius(item, kind === "heat" ? 180000 : 420000),
            semiMinorAxis: featureRadius(item, kind === "heat" ? 180000 : 420000),
            height: 0,
            material: Cesium.Color.fromCssColorString(cssTint).withAlpha(kind === "heat" ? 0.045 : 0.11),
            outline: false
          };
        }
        entityOptions.billboard = {
          image: markerIcon("soft-dot"),
          scale: isDensityOnlyIntelLayer(layerId) ? 0.16 : (kind === "heat" ? 0.25 : 0.28),
          color: Cesium.Color.WHITE.withAlpha(0.98),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          distanceDisplayCondition: commonDistance,
          heightReference: profile.heightReference,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        };
        tintBillboard = false;
        
        initialGlyph = intelLayerGlyph(layerId, kind, item, false, cssTint);
      } else if (kind === "volume") {
        entityOptions.billboard = {
          image: markerIcon("soft-dot"),
          scale: 0.27,
          color: Cesium.Color.WHITE.withAlpha(0.98),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          distanceDisplayCondition: commonDistance,
          heightReference: profile.heightReference,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        };
        tintBillboard = false;
        
        initialGlyph = intelLayerGlyph(layerId, kind, item, false, cssTint);
      } else {
        var glyphScale = 0.35;

        if (layerId === "lightning") {
          glyphScale = 0.28;
        } else if (layerId === "emergencyIncidents") {
          glyphScale = 0.38;
        } else if (layerId === "wildfires") {
          glyphScale = 0.4;
        } else if (layerId === "socialEvents") {
          glyphScale = 0.38;
        } else if (kind === "event") {
          glyphScale = clamp(7.2 / 20, 0.3, 0.42);
        }

        entityOptions.billboard = {
          image: markerIcon("soft-dot"),
          scale: glyphScale,
          color: Cesium.Color.WHITE.withAlpha(0.98),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          distanceDisplayCondition: commonDistance,
          heightReference: profile.heightReference,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        };
        tintBillboard = false;

        initialGlyph = intelLayerGlyph(layerId, kind, item, false, cssTint);

        if (!suppressGenericIntelEllipse(layerId, kind)) {
          entityOptions.ellipse = {
            semiMajorAxis: featureRadius(item, kind === "event" ? 22000 : 90000),
            semiMinorAxis: featureRadius(item, kind === "event" ? 22000 : 90000),
            height: 0,
            material: Cesium.Color.fromCssColorString(cssTint).withAlpha(kind === "event" ? 0.055 : 0.06),
            outline: false
          };
        }
      }

      if (useSimpleIntelDot(layerId, kind) && entityOptions.billboard) {
        initialGlyph = null;
        tintBillboard = true;
        entityOptions.billboard.image = markerIcon("soft-dot");
        entityOptions.billboard.color = Cesium.Color.fromCssColorString(cssTint).withAlpha(0.92);
      }

      if (intelLayerShowsBeacon(layerId, kind)) {
        entityOptions.box = {
          dimensions: intelBeaconDimensions(layerId, kind),
          material: animatedMaterial(cssTint, 0.2, 0.58, 1.02 + index * 0.035, index * 0.07),
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.41),
          outlineWidth: 1.35,
          heightReference: profile.heightReference,
          distanceDisplayCondition: commonDistance
        };
      }
    } else {
      var dotVariant = (definition.type === "earthquake") ? "earthquake-wave" : "soft-dot";
      var dotScale = definition.type === "earthquake" ? clamp((8 + sample.magnitude * 1.6) / 24, 0.38, 0.65) : (orbitalLayerIds.indexOf(layerId) !== -1 ? 0.32 : 0.28);
      
      entityOptions.billboard = {
        image: (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
          OrionTextureManager.getIcon(dotVariant) : markerIcon(dotVariant),
        scale: dotScale,
        color: color.withAlpha(layerId === "debris" ? 0.72 : 0.94),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        distanceDisplayCondition: commonDistance,
        heightReference: profile.heightReference,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      };
      tintBillboard = true;
    }

    entityOptions.label = {
      text: item.name || definition.label,
      font: "10px Inter, ui-sans-serif, system-ui, sans-serif",
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: color.withAlpha(0.94),
      outlineColor: Cesium.Color.BLACK.withAlpha(0.84),
      outlineWidth: 4,
      pixelOffset: new Cesium.Cartesian2(0, -25),
      show: false,
      distanceDisplayCondition: commonDistance,
      heightReference: profile.heightReference,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    };

    var entity = viewer.entities.add(entityOptions);
    entity.orionPlatformEntityId = id;
    entity.orionLayerId = layerId;
    
    if (initialGlyph && entity.billboard) {
      safeAssignBillboard(entity.billboard, initialGlyph);
    }
    
    if (entity.billboard) {
      entity.orionBillboardBaseScale = Number(entityOptions.billboard.scale) || 0.34;
      entity.orionTintBillboard = tintBillboard;
      if (definition.type === "intel") {
        entity.orionUsesIntelGlyph = true;
      }
    }

    var trail = null;
    if (definition.trail) {
      trail = viewer.entities.add({
        name: (item.name || definition.label) + " path",
        polyline: {
          positions: definition.type === "moving" ? movingTrailPositions(item, platformTime()) : buildSatelliteTrail(item, platformTime()),
          width: definition.type === "moving" ? 1.45 : 1.2,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            color: lineGlowColor(definition.color, definition.type === "moving" ? 0.22 : 0.18, definition.type === "moving" ? 0.56 : 0.42, 0.18, index * 0.05)
          })
        }
      });
      trail.orionPlatformEntityId = id;
      trail.orionLayerId = layerId;
    }

    var coverage = null;
    if (definition.type === "satellite") {
      coverage = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat),
        show: false,
        ellipse: {
          semiMajorAxis: 920000,
          semiMinorAxis: 920000,
          height: 0,
          material: color.withAlpha(0.06),
          outline: false
        }
      });
      coverage.orionPlatformEntityId = id;
      coverage.orionLayerId = layerId;
    }

    var effects = createPlatformEffects(layerId, definition, item, sample, positionProperty, profile, index, linePathRef);
    effects.forEach(function (effect) {
      effect.orionPlatformEntityId = id;
      effect.orionLayerId = layerId;
    });

    return {
      id: id,
      layerId: layerId,
      definition: definition,
      item: item,
      entity: entity,
      trail: trail,
      coverage: coverage,
      effects: effects,
      linePathRef: linePathRef,
      currentPosition: currentPosition,
      targetPosition: targetPosition,
      sample: sample,
      lastTrailMinute: -1,
      followAnchor: null,
      index: index
    };
  }
  function safeAssignBillboard(billboard, imageSource) {
    if (!billboard) return;
    
    if (window.OrionTextureManager && typeof OrionTextureManager.assignBillboardImage === "function") {
      OrionTextureManager.assignBillboardImage(billboard, imageSource);
    } else {
      billboard.image = imageSource;
    }
  }

  function updatePlatformRecord(record, item, sample, index) {
    var selected = record.id === selectedPlatformEntityId;
    var definition = record.definition;
    var profile = platformHeightProfile(record.layerId, definition, item, sample);
    var height = profile.height;
    var kind = item.kind || definition.type;
    var position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, height);

    record.item = item;
    record.sample = sample;
    record.index = index;
    Cesium.Cartesian3.clone(position, record.targetPosition);

    record.entity.show = true;
    if (record.entity.label) {
      record.entity.label.show = selected || (definition.type === "camera") || (definition.trail && index < 12) || (kind === "area" && index < 4);
      record.entity.label.text = item.name || definition.label;
      
      record.entity.label.fillColor = Cesium.Color.WHITE.withAlpha(visualCohesionManager.getAdaptiveAlpha(selected ? 1 : 0.85, record.layerId));
      record.entity.label.outlineColor = Cesium.Color.BLACK.withAlpha(visualCohesionManager.getAdaptiveAlpha(selected ? 1 : 0.65, record.layerId));
    }

    if (record.entity.point) {
      var baseAlpha = selected ? 1 : 0.9;
      var adaptiveAlpha = visualCohesionManager.getAdaptiveAlpha(baseAlpha, record.layerId);
      record.entity.point.color = (selected ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString(definition.color)).withAlpha(adaptiveAlpha);
      if (definition.type === "earthquake") {
        record.entity.point.pixelSize = clamp(5 + sample.magnitude * 1.6, 6, 16);
        record.entity.orionPointBaseSize = record.entity.point.pixelSize.getValue();
      } else if (definition.type === "intel" && kind === "event") {
        record.entity.point.pixelSize = clamp(5 + (Number(sample.magnitude) || 1) * 1.2, 6, 16);
        record.entity.orionPointBaseSize = record.entity.point.pixelSize.getValue();
      }
    }

    if (record.entity.billboard) {
      var baseScale = Number(record.entity.orionBillboardBaseScale) || 0.34;
      record.entity.billboard.scale = selected ? baseScale * 1.32 : baseScale;
      
      var baseAlpha = selected ? 1 : 0.9;
      var adaptiveAlpha = visualCohesionManager.getAdaptiveAlpha(baseAlpha, record.layerId);

      if (record.entity.orionUsesIntelGlyph) {
        var cssG = severityColor(record.layerId, item, sample, definition.color);
        var glyphImage = intelLayerGlyph(record.layerId, kind, item, selected, cssG);
        safeAssignBillboard(record.entity.billboard, glyphImage);
        record.entity.billboard.color = Cesium.Color.WHITE.withAlpha(adaptiveAlpha * 0.98);
      } else if (record.entity.orionTintBillboard) {
        record.entity.billboard.color = (selected ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString(definition.color)).withAlpha(adaptiveAlpha);
      } else {
        record.entity.billboard.color = Cesium.Color.WHITE.withAlpha(adaptiveAlpha);
      }

      if (definition.type === "moving") {
        record.entity.billboard.rotation = Cesium.Math.toRadians(sample.heading || 0);
      }
    }

    if (record.entity.polyline && (kind === "line" || kind === "arc")) {
      var linePositions = linePathPositions(item.points || item.route || [], height, kind === "arc" ? 12 : 8);
      if (linePositions.length < 2) {
        linePositions = pointsToCartesian(item.points || item.route || [], height);
      }
      if (linePositions.length >= 2) {
        record.entity.polyline.positions = linePositions;
        if (!record.linePathRef) {
          record.linePathRef = { positions: linePositions };
        } else {
          record.linePathRef.positions = linePositions;
        }
      }
    }

    if (record.entity.ellipse && (kind === "area" || kind === "heat" || kind === "event")) {
      var radius = featureRadius(item, kind === "event" ? 42000 : kind === "heat" ? 180000 : 420000);
      record.entity.ellipse.semiMajorAxis = selected ? radius * 1.18 : radius;
      record.entity.ellipse.semiMinorAxis = selected ? radius * 1.18 : radius;
      var ellCss = definition.type === "intel" ? severityColor(record.layerId, item, sample, definition.color) : definition.color;
      record.entity.ellipse.material = Cesium.Color.fromCssColorString(ellCss).withAlpha(selected ? 0.17 : (kind === "heat" ? 0.048 : kind === "event" ? 0.065 : 0.078));
    }

    if (record.coverage) {
      record.coverage.show = selected;
      record.coverage.position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat);
    }

    if (record.trail) {
      var minuteBucket = Math.floor(platformTime().getTime() / (60 * 1000));
      if (selected || record.lastTrailMinute !== minuteBucket) {
        record.trail.polyline.positions = definition.type === "moving" ? movingTrailPositions(item, platformTime()) : buildSatelliteTrail(item, platformTime());
        record.lastTrailMinute = minuteBucket;
      }
      record.trail.show = layerStateManager.isLayerEnabled(record.layerId);
    }

    if (Array.isArray(record.effects)) {
      record.effects.forEach(function (effect) {
        effect.show = layerStateManager.isLayerEnabled(record.layerId);
      });
    }

    if (selected) {
      updatePlatformTarget(record, sample);
    }
  }

  function removePlatformRecord(record) {
    if (!record) {
      return;
    }

    [record.entity, record.trail, record.coverage].concat(record.effects || []).forEach(function (entity) {
      if (entity) {
        viewer.entities.remove(entity);
      }
    });

    delete platformEntities[record.id];
  }

  function defaultIntelKindForLayer(layerId, item) {
    if (item && item.kind) {
      return item.kind;
    }

    if (layerId === "cyberNetwork") return "arc";
    if (layerId === "underseaCables" || layerId === "powerGrid" || layerId === "airCorridors" || layerId === "traffic") return "line";
    if (layerId === "defenseAirspace") return "area";
    if (layerId === "rfHeatmap") return "heat";
    if (layerId === "volumetricWeather") return "volume";
    if (layerId === "lightning" || layerId === "socialEvents" || layerId === "emergencyIncidents") return "event";
    return "event";
  }

  function normalizeIntelPath(points) {
    if (!Array.isArray(points)) {
      return [];
    }

    return points.map(function (point) {
      if (!Array.isArray(point) || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))) {
        return null;
      }
      return [
        Number(point[0]),
        Number(point[1]),
        Number(point[2]) || 0
      ];
    }).filter(Boolean);
  }

  function normalizeGeoJsonFeature(layerId, feature, index) {
    var geometry = feature && feature.geometry ? feature.geometry : null;
    var props = Object.assign({}, feature && feature.properties ? feature.properties : {});
    var type = geometry && geometry.type;
    var coords = geometry && geometry.coordinates;
    var baseId = feature && (feature.id || props.id || props.objectid || props.OBJECTID) || (layerId + "-geo-" + index);
    var baseName = props.name || props.NAME || props.title || props.road || props.route || platformLayerDefinitions[layerId].label;

    function baseItem(suffix) {
      var item = Object.assign({}, props);
      item.id = String(baseId) + (suffix || "");
      item.name = String(baseName || item.id);
      item.kind = defaultIntelKindForLayer(layerId, item);
      item.sourceFeature = feature;
      return item;
    }

    if (type === "Point" && Array.isArray(coords)) {
      var pointItem = baseItem("");
      pointItem.lon = Number(coords[0]);
      pointItem.lat = Number(coords[1]);
      pointItem.height = Number(coords[2]) || Number(pointItem.height) || 0;
      return [pointItem];
    }

    if (type === "LineString" && Array.isArray(coords)) {
      var lineItem = baseItem("");
      lineItem.kind = defaultIntelKindForLayer(layerId, lineItem);
      lineItem.points = normalizeIntelPath(coords);
      lineItem.positions = lineItem.points;
      return [lineItem];
    }

    if (type === "MultiLineString" && Array.isArray(coords)) {
      return coords.map(function (line, lineIndex) {
        var lineItem = baseItem("-" + lineIndex);
        lineItem.kind = defaultIntelKindForLayer(layerId, lineItem);
        lineItem.points = normalizeIntelPath(line);
        lineItem.positions = lineItem.points;
        return lineItem;
      }).filter(function (item) {
        return item.points && item.points.length >= 2;
      });
    }

    if ((type === "Polygon" || type === "MultiPolygon") && Array.isArray(coords)) {
      var ring = type === "Polygon" ? coords[0] : coords[0] && coords[0][0];
      var areaItem = baseItem("");
      var path = normalizeIntelPath(ring || []);
      if (path.length) {
        var center = midpointSample(path, 0);
        if (center) {
          areaItem.lon = center.lon;
          areaItem.lat = center.lat;
        }
        areaItem.points = path;
        areaItem.positions = path;
      }
      return [areaItem];
    }

    return [];
  }

  function normalizeIntelItem(layerId, rawItem, index) {
    if (!rawItem) {
      return null;
    }

    if (rawItem.type === "Feature" && rawItem.geometry) {
      return normalizeGeoJsonFeature(layerId, rawItem, index);
    }

    var item = Object.assign({}, rawItem);
    item.id = item.id || item.name || (layerId + "-" + index);
    item.name = item.name || item.title || item.label || platformLayerDefinitions[layerId].label + " " + (index + 1);
    item.kind = defaultIntelKindForLayer(layerId, item);

    var path = normalizeIntelPath(item.points || item.positions || item.route || item.path || item.coordinates);
    if (path.length) {
      item.points = path;
      item.positions = path;
      if (!Array.isArray(item.route) && item.kind === "moving") {
        item.route = path;
      }

      var first = path[0];
      var last = path[path.length - 1];
      if (!Number.isFinite(Number(item.lon)) || !Number.isFinite(Number(item.lat))) {
        item.lon = Number(first[0]);
        item.lat = Number(first[1]);
      }
      if (!Number.isFinite(Number(item.targetLon)) || !Number.isFinite(Number(item.targetLat))) {
        item.targetLon = Number(last[0]);
        item.targetLat = Number(last[1]);
      }
    } else if (Number.isFinite(Number(item.lon)) && Number.isFinite(Number(item.lat)) &&
      Number.isFinite(Number(item.targetLon)) && Number.isFinite(Number(item.targetLat))) {
      item.points = [
        [Number(item.lon), Number(item.lat), Number(item.height) || 0],
        [Number(item.targetLon), Number(item.targetLat), Number(item.height) || 0]
      ];
      item.positions = item.points;
    }

    if (layerId === "traffic" && item.kind !== "line") {
      item.kind = "line";
    }

    return item;
  }

  function normalizeIntelPayloadItems(layerId, payload, definition) {
    if (!payload) {
      return [];
    }

    var raw = [];
    if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
      raw = payload.features;
    } else {
      [
        payload.features,
        payload.items,
        payload.arcs,
        payload.cables,
        payload.lines,
        payload.routes,
        payload.zones,
        payload.events,
        payload.strikes,
        payload.storms,
        payload.points,
        payload.segments,
        payload.incidents
      ].some(function (candidate) {
        if (Array.isArray(candidate) && candidate.length) {
          raw = candidate;
          return true;
        }
        return false;
      });
    }

    var items = [];
    raw.forEach(function (rawItem, index) {
      var normalized = normalizeIntelItem(layerId, rawItem, index);
      if (Array.isArray(normalized)) {
        normalized.forEach(function (item) {
          if (item) items.push(item);
        });
      } else if (normalized) {
        items.push(normalized);
      }
    });

    return items.slice(0, (definition && definition.maxItems) || 120);
  }

  function clearPlatformLayer(layerId) {
    Object.keys(platformEntities).forEach(function (id) {
      var record = platformEntities[id];
      if (record.layerId === layerId) {
        removePlatformRecord(record);
      }
    });

    var collection = primitiveCollections[layerId];
    if (collection) {
      collection.removeAll();
      
      var primsToRemove = [];
      Object.keys(platformPrimitives).forEach(function(id) {
        if (platformPrimitives[id].layerId === layerId) {
          primsToRemove.push(id);
        }
      });
      primsToRemove.forEach(function(id) {
        delete platformPrimitives[id];
      });
    }

    if (selectedPlatformEntityId && selectedPlatformEntityId.indexOf(layerId + "::") === 0) {
      clearPlatformSelection("TRACK LOST");
    }

    removePlatformHeatmap(layerId);
    updatePlatformTelemetry();
  }

  function applyPlatformPayload(layerId, payload) {
    var definition = platformLayerDefinitions[layerId];
    var feed = platformFeeds[layerId] || {};
    var items = [];

    if (payload && payload.fallback && providerHealthTracker.shouldUseCachedData(layerId)) {
      var cached = providerHealthTracker.getCachedPayload(layerId);
      if (cached) {
        console.log('[Payload] Using local cached data instead of server fallback for', layerId);
        payload = cached;
      }
    }

    if (definition.type === "satellite") {
      items = parseTleText(payload.tle || "", definition.maxItems).map(function (item) {
        item.color = definition.color;
        item.category = definition.label;
        item.source = payload.source || definition.source;
        item.group = payload.group || definition.label;
        item.groups = payload.groups || [];
        return item;
      });
    } else if (definition.type === "earthquake") {
      items = (payload.features || []).slice(0, definition.maxItems).map(function (feature, index) {
        var properties = feature.properties || {};
        var magnitude = Number(properties.mag) || 0;
        if (magnitude < state.earthquakeMinMagnitude) {
          return null;
        }
        return {
          id: feature.id || ("quake-" + index),
          name: "M" + magnitude.toFixed(1) + " " + String(properties.place || "Earthquake").slice(0, 28),
          feature: feature
        };
      }).filter(Boolean);
    } else if (definition.type === "camera") {
      items = clusterCameraItems((payload.cameras || []).slice(0, definition.maxItems));
      
      if (items.length > 0 && viewer && viewer.camera) {
        var center = viewer.camera.positionCartographic;
        addOperationalPulse(Cesium.Math.toDegrees(center.latitude), Cesium.Math.toDegrees(center.longitude), "#ffffff", 150000);
      }
    } else if (layerId === "liveAircraft" && Array.isArray(payload.states)) {
      items = payload.states.slice(0, definition.maxItems || 10000).map(function (aircraft, index) {
        return {
          id: aircraft.icao24 || aircraft.callsign || ("aircraft-" + index),
          name: String(aircraft.callsign || aircraft.icao24 || "OpenSky aircraft").trim(),
          kind: "moving",
          category: aircraft.onGround ? "ground" : "aircraft",
          lat: Number(aircraft.lat),
          lon: Number(aircraft.lon),
          height: Math.max(0, Number(aircraft.altitude) || 0),
          heading: Number(aircraft.heading) || 0,
          speed: Number(aircraft.velocity) || 0,
          status: aircraft.onGround ? "Ground" : "Airborne",
          source: "OpenSky Network",
          timestamp: payload.time ? payload.time * 1000 : Date.now()
        };
      }).filter(function (item) {
        return Number.isFinite(item.lat) && Number.isFinite(item.lon);
      });
    } else if (definition.type === "intel" || definition.type === "moving") {
      items = normalizeIntelPayloadItems(layerId, payload, definition);
    } else if (layerId === "cyberNetwork" || layerId === "underseaCables" || layerId === "powerGrid") {
      items = (payload.features || payload.items || []).slice(0, definition.maxItems || 800);
    }

    feed.payload = payload;
    feed.items = items;
    feed.loadedAt = Date.now();
    feed.status = payload.provider_health === "degraded"
      ? "degraded"
      : (payload.error ? payload.error : (payload.fallback ? "fallback" : (items.length ? "online" : "empty")));
    platformFeeds[layerId] = feed;

    var renderTime = platformTime();

    if (layerId === "cyberNetwork" || layerId === "underseaCables" || layerId === "powerGrid") {
      if (layerStateManager.isLayerEnabled(layerId)) {
        InfrastructureRenderer.render(layerId, items);
      } else {
        destroyLayerCompletely(layerId);
      }
      updatePlatformTelemetry();
      return;
    }

    if (layerId === "liveShips") {
      if (layerStateManager.isLayerEnabled(layerId)) {
        MaritimeRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : [], renderTime);
      } else {
        destroyLayerCompletely(layerId);
      }
      updatePlatformTelemetry();
      return;
    }

    if (layerId === "liveAircraft") {
      if (layerStateManager.isLayerEnabled(layerId)) {
        AviationRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : [], renderTime);
      } else {
        destroyLayerCompletely(layerId);
      }
      updatePlatformTelemetry();
      return;
    }

    if (orbitalLayerIds.indexOf(layerId) !== -1) {
      if (layerStateManager.isLayerEnabled(layerId)) {
        OrbitalRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : [], layerId, renderTime);
      } else {
        destroyLayerCompletely(layerId);
      }
      updatePlatformTelemetry();
      return;
    }

    if (layerId === "cameras" && currentLODLevel === 'distant') {
      if (layerStateManager.isLayerEnabled(layerId)) {
        renderCamerasAsPrimitives(items);
      } else {
        destroyLayerCompletely(layerId);
      }
      updatePlatformTelemetry();
      return;
    }

    if (layerId === "rfHeatmap") {
      if (layerStateManager.isLayerEnabled(layerId)) {
        updatePlatformHeatmap(layerId, items);
      } else {
        destroyLayerCompletely(layerId);
      }
      updatePlatformTelemetry();
      return;
    }

    if (layerStateManager.isLayerEnabled(layerId)) {
      updatePlatformHeatmap(layerId, items);
      updatePlatformLayerEntities(layerId);
    } else {
      destroyLayerCompletely(layerId);
    }
    
    updatePlatformTelemetry();
  }

  function refreshPlatformLayersForLOD() {
    var lodSensitiveLayers = ['earthquakes', 'wildfires', 'volumetricWeather', 'lightning', 
                             'cameras', 'liveShips', 'liveAircraft'].concat(orbitalLayerIds);
    
    lodSensitiveLayers.forEach(function(layerId) {
      if (layerStateManager.isLayerEnabled(layerId)) {
        var feed = platformFeeds[layerId];
        var items = (feed && feed.items) ? feed.items : [];
        var time = platformTime();

        if (layerId === 'liveShips') {
          MaritimeRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : [], time);
        } else if (layerId === 'liveAircraft') {
          AviationRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : [], time);
        } else if (orbitalLayerIds.indexOf(layerId) !== -1) {
          OrbitalRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : [], layerId, time);
        } else if (layerId === 'cameras') {
          if (currentLODLevel === 'distant') {
            renderCamerasAsPrimitives(items);
          } else {
            updatePlatformLayerEntities(layerId);
          }
        } else {
          updatePlatformLayerEntities(layerId);
        }
      } else {
        destroyLayerCompletely(layerId);
      }
    });
  }





  
  var OrbitalRenderer = Orion.Renderer.Orbital;
  var InfrastructureRenderer = Orion.Renderer.Infrastructure;
  var EnvironmentRenderer = Orion.Renderer.Environment;
  var MaritimeRenderer = Orion.Renderer.Maritime;
  var AviationRenderer = Orion.Renderer.Aviation;

  function renderOrbitalAsPrimitives(layerId, items) {
    OrbitalRenderer.render(items);
  }

  function renderVesselsAsPrimitives(items) {
    MaritimeRenderer.render(items);
  }

  function renderAircraftAsPrimitives(items) {
    AviationRenderer.render(items);
  }

  function renderCamerasAsPrimitives(items) {
    if (Orion.Renderer.Cameras && Orion.Renderer.Cameras.render) {
      Orion.Renderer.Cameras.render(items);
    }
  }

  function updateLegacyRfHeatmapRenderer(layerId, items) {
    if (Orion.Renderer.RFHeatmap && Orion.Renderer.RFHeatmap.render) {
      Orion.Renderer.RFHeatmap.render(items);
    }
  }

  Object.assign(Orion.Renderer, {
    Cameras: {
      init: function() {
        console.log('[Orion.Renderer.Cameras] Initialized');
      },
      render: function(items) {
        if (Orion.Telemetry.CameraNet && Orion.Telemetry.CameraNet.update) {
          Orion.Telemetry.CameraNet.update(viewer);
        }
      }
    },
    Atmosphere: {
      stage: null,
      init: function() {
        this.stage = createAtmosphereShader();
        if (this.stage) viewer.scene.postProcessStages.add(this.stage);
        console.log('[Orion.Renderer.Atmosphere] Initialized');
      },
      setTension: function(tension) {
        if (this.stage) this.stage.uniforms.tension = tension;
      }
    },
    Effects: {
      init: function() {
        console.log('[Orion.Renderer.Effects] Initialized');
      },
      createPulse: function(lat, lon, color, radius) {
        addOperationalPulse(lat, lon, color, radius);
      }
    },
    RFHeatmap: {
      collection: null,
      init: function() { this.collection = viewer.scene.primitives.add(new Cesium.BillboardCollection()); console.log('[Orion.Renderer.RFHeatmap] Initialized'); },
      render: function(items) {
        if (!this.collection) return;
        this.collection.removeAll();
        var self = this;
        items.forEach(function(item) {
          var intensity = item.intensity || 0.5;
          for (var i = 0; i < 3; i++) {
            self.collection.add({
              position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 1000),
              image: markerIcon("soft-dot"), scale: (0.8 + i * 1.5) * intensity * 2.5,
              color: Cesium.Color.fromCssColorString("#d3f2ff").withAlpha(0.04 / (i + 1)), disableDepthTestDistance: Number.POSITIVE_INFINITY
            });
          }
        });
      }
    }
  });


  Orion.Telemetry.Samplers = {
    satellite: function(item, time) { 
      return (typeof satelliteSampleFromItem === 'function') ? satelliteSampleFromItem(item, time) : null; 
    },
    intel: function(item, time) { 
      return (typeof intelSampleFromItem === 'function') ? intelSampleFromItem(item, time) : item; 
    }
  };

  function refreshPlatformLayer(layerId, force) {
    var definition = platformLayerDefinitions[layerId];
    var feed = platformFeeds[layerId] || { items: [], status: "offline", loadedAt: 0, retryCount: 0 };

    if (!definition || !layerStateManager.isLayerEnabled(layerId) || !definition.endpoint) {
      return;
    }

    if (!force && state.cameraMovingFast && layerId !== "cameras") {
      return;
    }

    var now = Date.now();
    if (!force && feed.loadedAt && now - feed.loadedAt < definition.refreshMs) {
      updatePlatformLayerEntities(layerId);
      return;
    }

    if (!force && !providerHealthTracker.shouldRetryNow(layerId)) {
      var timeUntilRetry = providerHealthTracker.getTimeUntilRetry(layerId);
      console.log('[RefreshPlatform]', layerId, 'waiting', Math.ceil(timeUntilRetry / 1000), 's before retry');
      
      if (providerHealthTracker.shouldUseCachedData(layerId)) {
        var cachedPayload = providerHealthTracker.getCachedPayload(layerId);
        if (cachedPayload) {
          console.log('[RefreshPlatform]', layerId, 'using cached data (stale-if-error)');
          applyPlatformPayload(layerId, cachedPayload);
          return;
        }
      }

      platformFeeds[layerId] = Object.assign({}, feed, {
        status: feed.items && feed.items.length ? "degraded" : "offline",
        error: "Retrying in " + Math.ceil(timeUntilRetry / 1000) + "s",
        loadedAt: now
      });
      updatePlatformTelemetry();
      return;
    }

    platformFeeds[layerId] = Object.assign({}, feed, { status: "loading" });
    updatePlatformTelemetry();

    var endpoint = definition.endpoint;
    if (layerId === "earthquakes") {
      endpoint += "?feed=" + encodeURIComponent(state.earthquakeFeed);
    } else if (layerId === "cameras") {
      endpoint += cameraRegionQuery();
    }

    if (hardeningManager.simulationActive && Math.random() > 0.6) {
      setTimeout(function() {
        console.warn('[Hardening] Simulated network failure for:', layerId);
        handleFetchError(new Error("Simulated network failure"));
      }, 500 + Math.random() * 2000);
      return;
    }

    fetchJsonEndpoint(endpoint)
      .then(function (payload) {
        if (!layerStateManager.isLayerEnabled(layerId)) {
          console.log('[RefreshPlatform] Layer', layerId, 'disabled during fetch, ignoring payload');
          return;
        }
        
        providerHealthTracker.recordSuccess(layerId, payload);
        
        platformFeeds[layerId].retryCount = 0; 
        applyPlatformPayload(layerId, payload || {});
      })
      .catch(handleFetchError);

    function handleFetchError(error) {
        if (!layerStateManager.isLayerEnabled(layerId)) {
          console.log('[RefreshPlatform] Layer', layerId, 'disabled during fetch error, ignoring');
          return;
        }

        providerHealthTracker.recordFailure(layerId, error);
        
        var providerInfo = providerHealthTracker.getProviderInfo(layerId);
        var health = providerHealthTracker.getHealth(layerId);
        
        console.log('[RefreshPlatform]', layerId, 'fetch failed:', error.message, 
                    '| health:', health, 
                    '| consecutive failures:', providerInfo.consecutiveFailures,
                    '| retry in:', Math.ceil(providerInfo.backoffMs / 1000) + 's');
        
        if (providerHealthTracker.shouldUseCachedData(layerId)) {
          var cachedPayload = providerHealthTracker.getCachedPayload(layerId);
          if (cachedPayload) {
            console.log('[RefreshPlatform]', layerId, 'serving cached data (stale-if-error)');
            
            platformFeeds[layerId] = Object.assign({}, platformFeeds[layerId], {
              status: 'degraded',
              error: error && error.message ? error.message : "Network error",
              loadedAt: Date.now(),
              usingCache: true
            });
            
            applyPlatformPayload(layerId, cachedPayload);
            updatePlatformTelemetry();
            return;
          }
        }
        
        var hasOldCache = feed.items && feed.items.length > 0;
        var newStatus = hasOldCache ? "degraded" : "offline";
        
        platformFeeds[layerId] = Object.assign({}, platformFeeds[layerId], {
          status: newStatus,
          error: error && error.message ? error.message : "Network error",
          loadedAt: Date.now(),
          retryCount: providerInfo.retryCount
        });

        setTimeout(function() {
          if (layerStateManager.isLayerEnabled(layerId)) {
            refreshPlatformLayer(layerId);
          }
        }, providerInfo.backoffMs);

        updatePlatformTelemetry();
        if (hasOldCache) {
          updatePlatformLayerEntities(layerId);
        }
    }
  }

  function updatePlatformLayerPrimitives(layerId) {
    var feed = platformFeeds[layerId];
    var items = feed && Array.isArray(feed.items) ? feed.items : [];

    if (layerId === 'liveAircraft') {
      AviationRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : []);
      return;
    }
    if (layerId === 'liveShips') {
      MaritimeRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : []);
      return;
    }
    if (orbitalLayerIds.indexOf(layerId) !== -1) {
      OrbitalRenderer.render(trackingFilterMatchesPlatformLayer(layerId) ? items : [], layerId);
      return;
    }

    var definition = platformLayerDefinitions[layerId];
    var collection = primitiveCollections[layerId];
    if (!collection) return;

    if (!layerStateManager.isLayerEnabled(layerId)) {
      collection.removeAll();
      Object.keys(platformPrimitives).forEach(function(id) {
        if (platformPrimitives[id] && platformPrimitives[id].layerId === layerId) {
          delete platformPrimitives[id];
        }
      });
      return;
    }

    var active = {};
    var time = platformTime();

    items.forEach(function (item, index) {
      var sample = null;

      if (definition.type === "satellite") {
        sample = satelliteSampleFromItem(item, time);
      } else if (definition.type === "earthquake") {
        sample = earthquakeSampleFromItem(item.feature);
      } else if (definition.type === "camera") {
        sample = cameraSampleFromItem(item);
      } else if (definition.type === "intel" || definition.type === "moving") {
        sample = intelSampleFromItem(item, time);
      }

      if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) {
        return;
      }

      var id = platformEntityKey(layerId, item.id || item.name || index);
      active[id] = true;

      var position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height || 0);
      var pickId = {
        orionPlatformEntityId: id,
        orionPrimitivePlatformEntityId: id,
        orionLayerId: layerId,
        orionItemId: item.id || item.name || index
      };

      if (!platformPrimitives[id]) {
        if (layerId === 'earthquakes' || layerId === 'lightning') {
          var magnitude = item.magnitude || (item.intensity * 6) || 4.0;
          var colorStr = layerId === 'lightning' ? '#ffffff' : getMagnitudeColor(magnitude);
          
          platformPrimitives[id] = collection.add({
            id: pickId,
            position: position,
            pixelSize: layerId === 'lightning' ? 4 : Math.min(magnitude * 2, 14),
            color: Cesium.Color.fromCssColorString(colorStr).withAlpha(0.85),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          });
        } else {
          var image = null;
          var scale = 0.28;
          var color = Cesium.Color.WHITE;

          if (definition.type === 'camera') {
            image = (window.OrionTextureManager && typeof OrionTextureManager.getIcon === 'function') ? 
                     OrionTextureManager.getIcon('camera-online') : platformIcon("camera", "#ffffff");
            scale = 0.3;
          } else {
            image = markerIcon(definition.type === 'earthquake' ? "earthquake-wave" : "soft-dot");
            scale = layerId === 'debris' ? 0.22 : 0.28;
            color = Cesium.Color.fromCssColorString(definition.color).withAlpha(layerId === 'debris' ? 0.6 : 0.9);
          }

          platformPrimitives[id] = collection.add({
            id: pickId,
            position: position,
            image: image,
            scale: scale,
            color: color,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          });
        }
        platformPrimitives[id].orionId = id;
        platformPrimitives[id].layerId = layerId;
      } else {
        platformPrimitives[id].position = position;
        platformPrimitives[id].id = pickId;
      }
    });

    var primitivesToRemove = [];
    Object.keys(platformPrimitives).forEach(function (id) {
      var prim = platformPrimitives[id];
      if (prim.layerId === layerId && !active[id]) {
        collection.remove(prim);
        primitivesToRemove.push(id);
      }
    });
    
    primitivesToRemove.forEach(function(id) {
      delete platformPrimitives[id];
    });

    viewer.scene.requestRender();
  }

  function updatePlatformLayerEntities(layerId) {
    if (!layerStateManager.isLayerEnabled(layerId)) {
      clearPlatformLayer(layerId);
      return;
    }

    if (!viewer) {
      return;
    }

    if (PLATFORM_PRIMITIVE_LAYERS.indexOf(layerId) !== -1) {
      updatePlatformLayerPrimitives(layerId);
      return;
    }

    var definition = platformLayerDefinitions[layerId];
    var feed = platformFeeds[layerId];
    var items = feed && Array.isArray(feed.items) ? feed.items : [];
    var active = {};
    var time = platformTime();

    items.forEach(function (item, index) {
      var sample = null;

      if (definition.type === "satellite") {
        sample = satelliteSampleFromItem(item, time);
      } else if (definition.type === "earthquake") {
        sample = earthquakeSampleFromItem(item.feature);
      } else if (definition.type === "camera") {
        sample = cameraSampleFromItem(item);
      } else if (definition.type === "intel" || definition.type === "moving") {
        sample = intelSampleFromItem(item, time);
      }

      if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) {
        return;
      }

      var id = platformEntityKey(layerId, item.id || item.name || index);
      active[id] = true;

      if (!platformEntities[id]) {
        platformEntities[id] = createPlatformRecord(layerId, item, sample, index);
      }

      updatePlatformRecord(platformEntities[id], item, sample, index);
    });

    Object.keys(platformEntities).forEach(function (id) {
      var record = platformEntities[id];
      if (record.layerId === layerId && !active[id]) {
        removePlatformRecord(record);
      }
    });

    viewer.scene.requestRender();
  }

  function platformUsesEntityFeed(definition) {
    return definition && definition.type !== "weatherRadar" && definition.type !== "tileset" && definition.type !== "sound";
  }

  function cameraRegionQuery() {
    if (!viewer || !viewer.scene) {
      return "";
    }

    var rect = viewer.camera.computeViewRectangle();
    if (!rect) {
      return "";
    }

    var west = Cesium.Math.toDegrees(rect.west);
    var south = Cesium.Math.toDegrees(rect.south);
    var east = Cesium.Math.toDegrees(rect.east);
    var north = Cesium.Math.toDegrees(rect.north);

    west = Math.max(-180, Math.min(180, west));
    east = Math.max(-180, Math.min(180, east));
    south = Math.max(-90, Math.min(90, south));
    north = Math.max(-90, Math.min(90, north));

    var bboxStr = [west.toFixed(4), south.toFixed(4), east.toFixed(4), north.toFixed(4)].join(",");
    
    return "&bbox=" + encodeURIComponent(bboxStr);
  }

  function clusterCameraItems(cameras) {
    if (!viewer || !viewer.camera) {
      return cameras;
    }

    var height = viewer.camera.positionCartographic.height;
    var lodLevel = currentLODLevel;

    if (lodLevel === 'distant' || height > 2000000) {
      var bucket = 5.0;
      var groups = {};

      cameras.forEach(function (camera) {
        var key = Math.round(Number(camera.lat) / bucket) + ":" + Math.round(Number(camera.lon) / bucket);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(camera);
      });

      return Object.keys(groups).map(function (key) {
        var group = groups[key];
        var lat = group.reduce(function (sum, camera) { return sum + Number(camera.lat); }, 0) / group.length;
        var lon = group.reduce(function (sum, camera) { return sum + Number(camera.lon); }, 0) / group.length;

        return {
          id: "cluster-" + key.replace(/[^a-zA-Z0-9-]/g, "-"),
          name: group.length + " cameras",
          lat: lat,
          lon: lon,
          provider: "Regional cluster",
          category: "cluster",
          status: "online",
          stream_type: "Cluster",
          stream_mode: "zoom-to-expand",
          clusterCount: group.length,
          children: group.map(function (camera) { return camera.id; })
        };
      });
    }

    if (lodLevel === 'medium' || height > 260000) {
      var bucket = height > 850000 ? 2.2 : 0.82;
      var groups = {};

      cameras.forEach(function (camera) {
        var key = Math.round(Number(camera.lat) / bucket) + ":" + Math.round(Number(camera.lon) / bucket);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(camera);
      });

      return Object.keys(groups).map(function (key) {
        var group = groups[key];
        if (group.length <= 2) {
          return group[0];
        }

        var lat = group.reduce(function (sum, camera) { return sum + Number(camera.lat); }, 0) / group.length;
        var lon = group.reduce(function (sum, camera) { return sum + Number(camera.lon); }, 0) / group.length;

        return {
          id: "cluster-" + key.replace(/[^a-zA-Z0-9-]/g, "-"),
          name: group.length + " cameras",
          lat: lat,
          lon: lon,
          provider: "Regional cluster",
          category: "cluster",
          status: "online",
          stream_type: "Cluster",
          stream_mode: "zoom-to-expand",
          clusterCount: group.length,
          children: group.map(function (camera) { return camera.id; })
        };
      });
    }

    return cameras;
  }

  function dynamicPlatformSample(record, time) {
    if (!record || !record.definition || !record.item) {
      return null;
    }

    return samplePlatformFeedItem(record.layerId, record.item, time) || record.sample || null;
  }

  function refreshPlatformMotionTargets() {
    if (!viewer) {
      return;
    }

    var time = platformTime();
    Object.keys(platformEntities).forEach(function (id) {
      var record = platformEntities[id];

      if (!record || !layerStateManager.isLayerEnabled(record.layerId)) {
        if (id === selectedPlatformEntityId) {
          clearPlatformSelection("TRACK LOST");
        }
        return;
      }

      var sample = dynamicPlatformSample(record, time);

      if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) {
        if (id === selectedPlatformEntityId) {
          clearPlatformSelection("TRACK LOST");
        }
        return;
      }

      updatePlatformRecord(record, record.item, sample, record.index);
    });
  }

  function platformCullDistance(record) {
    if (!record || !record.definition) {
      return 0;
    }

    if (record.definition.type === "satellite") {
      return record.layerId === "debris" ? 36000000 : 42000000;
    }

    if (record.definition.type === "camera") {
      return 9000000;
    }

    if (record.definition.type === "moving") {
      return 18000000;
    }

    if (record.definition.type === "intel" && (record.item.kind === "line" || record.item.kind === "arc")) {
      return 36000000;
    }

    if (record.layerId === "traffic" || record.layerId === "emergencyIncidents" || record.layerId === "socialEvents") {
      return 18000000;
    }

    return 26000000;
  }

  function applyPlatformCulling() {
    if (!viewer || !viewer.camera) {
      return;
    }

    var cameraPosition = viewer.camera.positionWC;
    Object.keys(platformEntities).forEach(function (id) {
      var record = platformEntities[id];

      if (!record) {
        return;
      }

      var enabled = layerStateManager.isLayerEnabled(record.layerId);
      if (!enabled && id === selectedPlatformEntityId) {
        clearPlatformSelection("TRACK LOST");
      }

      var selected = enabled && id === selectedPlatformEntityId;
      var distance = record.currentPosition ? Cesium.Cartesian3.distance(cameraPosition, record.currentPosition) : 0;
      var visible = selected || (enabled && distance <= platformCullDistance(record));

      if (record.entity) {
        record.entity.show = visible;
      }
      if (record.trail) {
        record.trail.show = visible && (selected || record.definition.trail || distance < platformCullDistance(record));
      }
      if (record.coverage) {
        record.coverage.show = selected;
      }
      (record.effects || []).forEach(function (effect) {
        effect.show = visible && (selected || distance < platformCullDistance(record));
      });
    });
  }

  function updatePlatformSystems(force) {
    Object.keys(platformLayerDefinitions).forEach(function (layerId) {
      if (layerStateManager.isLayerEnabled(layerId) && platformUsesEntityFeed(platformLayerDefinitions[layerId])) {
        refreshPlatformLayer(layerId, !!force);
      }
    });
  }

  function initPlatformSystems() {
    platformLayerTimer = window.setInterval(function () {
      if (!viewer) return;
      
      var height = viewer.camera.positionCartographic.height;
      var now = Date.now();
      
      Object.keys(platformLayerDefinitions).forEach(function (layerId) {
        if (layerStateManager.isLayerEnabled(layerId)) {
          var definition = platformLayerDefinitions[layerId];
          var feed = platformFeeds[layerId] || {};
          
          var dynamicRefreshMs = definition.refreshMs || 60000;
          if (height > 5000000) dynamicRefreshMs *= 2.5;
          else if (height > 1500000) dynamicRefreshMs *= 1.5;
          
          var ageMs = now - (feed.loadedAt || 0);
          
          if (platformUsesEntityFeed(definition) && ageMs >= dynamicRefreshMs) {
            updatePlatformLayerEntities(layerId);
            refreshPlatformLayer(layerId, false);
          }
        } else {
          destroyLayerCompletely(layerId);
        }
      });
    }, 5000);

    window.orionSystems = {
      layers: platformLayerDefinitions,
      feeds: platformFeeds,
      entities: platformEntities,
      heatmaps: platformHeatmapLayers,
      select: selectPlatformEntity,
      clearSelection: clearPlatformSelection,
      scan: setScanMode,
      recordTimelapse: recordTimelapse,
      refresh: function () {
        updatePlatformSystems(true);
      }
    };
  }

  function setWeatherRadarLayer(enabled) {
    if (!viewer) {
      return;
    }

    if (!enabled) {
      if (weatherRadarTimer) {
        window.clearInterval(weatherRadarTimer);
        weatherRadarTimer = null;
      }

      if (weatherRadarAnimationTimer) {
        window.clearInterval(weatherRadarAnimationTimer);
        weatherRadarAnimationTimer = null;
      }

      if (weatherRadarLayer) {
        viewer.imageryLayers.remove(weatherRadarLayer, true);
        weatherRadarLayer = null;
      }

      weatherRadarPreviousLayers.forEach(function (layer) {
        if (layer && imageryLayerExists(layer)) {
          viewer.imageryLayers.remove(layer, true);
        }
      });
      weatherRadarPreviousLayers = [];

      platformFeeds.weatherRadar = {
        status: "standby",
        loadedAt: Date.now(),
        items: []
      };
      updateStreetDetailBlend(viewer.camera.positionCartographic.height);
      viewer.scene.requestRender();
      return;
    }

    refreshWeatherRadarLayer(true);
    updateStreetDetailBlend(viewer.camera.positionCartographic.height);

    if (!weatherRadarTimer) {
      weatherRadarTimer = window.setInterval(function () {
        if (state.platformLayers.weatherRadar) {
          refreshWeatherRadarLayer(false);
        }
      }, platformLayerDefinitions.weatherRadar.refreshMs);
    }
  }

  function applyWeatherRadarFrame(frame) {
    if (!frame || !frame.path || !Cesium.UrlTemplateImageryProvider) {
      return false;
    }

    if (weatherRadarLayer) {
      weatherRadarLayer.alpha = Math.max(0.08, state.radarOpacity * 0.42);
      weatherRadarPreviousLayers.push(weatherRadarLayer);
      window.setTimeout(function () {
        var oldLayer = weatherRadarPreviousLayers.shift();
        if (oldLayer && imageryLayerExists(oldLayer)) {
          viewer.imageryLayers.remove(oldLayer, true);
          viewer.scene.requestRender();
        }
      }, 2600);
      weatherRadarLayer = null;
    }

    weatherRadarLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: (isStaticHostMode() ? "https://tilecache.rainviewer.com" : "/rainviewer") + frame.path + "/256/{z}/{x}/{y}/2/1_1.png",
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      minimumLevel: 0,
      maximumLevel: 10,
      credit: "RainViewer"
    }));
    if (weatherRadarLayer.imageryProvider && weatherRadarLayer.imageryProvider.errorEvent) {
      weatherRadarLayer.imageryProvider.errorEvent.addEventListener(function (tileProviderError) {
        tileProviderError.retry = tileProviderError.timesRetried < 1;
      });
    }
    weatherRadarLayer.alpha = state.radarOpacity;
    weatherRadarLayer.brightness = 1.04;
    weatherRadarLayer.contrast = 1.18;
    weatherRadarLayer.saturation = 0.42;
    raiseOperationalLayers();
    viewer.scene.requestRender();
    return true;
  }

  function syncWeatherRadarAnimation() {
    if (weatherRadarAnimationTimer) {
      window.clearInterval(weatherRadarAnimationTimer);
      weatherRadarAnimationTimer = null;
    }

    if (!state.radarAnimating || !state.platformLayers.weatherRadar) {
      return;
    }

    weatherRadarAnimationTimer = window.setInterval(function () {
      var frames = platformFeeds.weatherRadar && platformFeeds.weatherRadar.items;

      if (!Array.isArray(frames) || frames.length < 2 || !state.platformLayers.weatherRadar) {
        return;
      }

      weatherRadarFrameIndex = (weatherRadarFrameIndex + 1) % frames.length;
      applyWeatherRadarFrame(frames[weatherRadarFrameIndex]);
    }, 1100);
  }

  function refreshWeatherRadarLayer(force) {
    var feed = platformFeeds.weatherRadar || {};

    if (!force && feed.loadedAt && Date.now() - feed.loadedAt < platformLayerDefinitions.weatherRadar.refreshMs) {
      return;
    }

    platformFeeds.weatherRadar = Object.assign({}, feed, {
      status: "loading"
    });
    updatePlatformTelemetry();

    fetchJsonEndpoint(platformLayerDefinitions.weatherRadar.endpoint)
      .then(function (payload) {
        var frames = payload.frames || [];
        var frame = frames.length ? frames[frames.length - 1] : payload.latest;

        if (!applyWeatherRadarFrame(frame)) {
          throw new Error("No radar frame");
        }
        weatherRadarFrameIndex = Math.max(0, frames.length - 1);

        platformFeeds.weatherRadar = {
          status: "online",
          loadedAt: Date.now(),
          items: frames,
          payload: payload
        };
        syncWeatherRadarAnimation();
        updatePlatformTelemetry();
        viewer.scene.requestRender();
      })
      .catch(function (error) {
        platformFeeds.weatherRadar = Object.assign({}, platformFeeds.weatherRadar, {
          status: error && error.message ? error.message : "offline",
          loadedAt: Date.now()
        });
        updatePlatformTelemetry();
      });
  }

  var zoomWeatherModeConfig = {
    radar: {
      label: "Radar",
      endpointMode: "radar",
      sourceLabel: "Zoom Earth radar",
      alpha: 0.78,
      brightness: 1.08,
      contrast: 1.12,
      saturation: 1.18,
      maxLevel: 8,
      legend: ["Light", "Moderate", "Heavy"],
      gradient: "linear-gradient(90deg,#48d5ff,#5cff8e,#fff26b,#ff9e3d,#f54747,#ffffff)"
    },
    precipitation: {
      label: "Precipitation",
      endpointMode: "precipitation",
      sourceLabel: "Zoom Earth / DWD ICON",
      alpha: 0.74,
      brightness: 1.02,
      contrast: 1.08,
      saturation: 1.15,
      maxLevel: 8,
      legend: ["Dry", "Rain", "Extreme"],
      gradient: "linear-gradient(90deg,#3067ff,#33d7ff,#45ec84,#fff06a,#ff8c3a,#ffffff)"
    },
    wind: {
      label: "Wind",
      endpointMode: "wind",
      sourceLabel: "Zoom Earth / DWD ICON",
      alpha: 0.68,
      brightness: 1.0,
      contrast: 1.1,
      saturation: 1.24,
      maxLevel: 8,
      effect: "wind",
      legend: ["0", "40", "80 mph"],
      gradient: "linear-gradient(90deg,#5b5ed6,#3177d7,#21b8d2,#58dfb6,#d8f66a,#ff9e53,#ba2b7d)"
    },
    temperature: {
      label: "Temperature",
      endpointMode: "temperature",
      sourceLabel: "Zoom Earth / DWD ICON",
      alpha: 0.76,
      brightness: 1.04,
      contrast: 1.06,
      saturation: 1.22,
      maxLevel: 8,
      legend: ["-20", "40", "100 F"],
      gradient: "linear-gradient(90deg,#6030b8,#2872d7,#28cdd3,#72e075,#f0e86b,#ff9b43,#ba1656)"
    },
    humidity: {
      label: "Humidity",
      endpointMode: "humidity",
      sourceLabel: "Zoom Earth / DWD ICON",
      alpha: 0.72,
      brightness: 1.0,
      contrast: 1.08,
      saturation: 1.2,
      maxLevel: 8,
      legend: ["Dry", "Moist", "Saturated"],
      gradient: "linear-gradient(90deg,#6b4fc7,#3583db,#2bd3d3,#5fe28a,#d7ef72,#ffffff)"
    },
    pressure: {
      label: "Pressure",
      endpointMode: "pressure",
      sourceLabel: "Zoom Earth / DWD ICON",
      alpha: 0.72,
      brightness: 1.06,
      contrast: 1.05,
      saturation: 1.08,
      maxLevel: 8,
      effect: "pressure",
      legend: ["980", "1010", "1040 mb"],
      gradient: "linear-gradient(90deg,#b84a3f,#f3b39e,#eff4f6,#7fd9d8,#2a9fa5)"
    }
  };

  function isZoomWeatherMapMode(mode) {
    return !!zoomWeatherModeConfig[mode];
  }

  function zoomWeatherLayerAlpha(mode) {
    var config = zoomWeatherModeConfig[mode] || {};
    return Math.max(0.05, Math.min(1, (config.alpha || 0.72) * state.radarOpacity));
  }

  function ensureWeatherEffectCanvas() {
    if (weatherEffectCanvas) {
      return;
    }

    weatherEffectCanvas = document.createElement("canvas");
    weatherEffectCanvas.className = "weather-effect-canvas";
    weatherEffectCanvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(weatherEffectCanvas);
    weatherEffectContext = weatherEffectCanvas.getContext("2d", { alpha: true });
    resizeWeatherEffectCanvas();
    window.addEventListener("resize", resizeWeatherEffectCanvas);
  }

  function resizeWeatherEffectCanvas() {
    if (!weatherEffectCanvas) {
      return;
    }

    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, window.innerWidth);
    var height = Math.max(1, window.innerHeight);
    weatherEffectCanvas.width = Math.round(width * ratio);
    weatherEffectCanvas.height = Math.round(height * ratio);
    weatherEffectCanvas.style.width = width + "px";
    weatherEffectCanvas.style.height = height + "px";

    if (weatherEffectContext) {
      weatherEffectContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }

  function seedWeatherEffectParticles(count) {
    weatherEffectParticles = [];
    var width = Math.max(1, window.innerWidth);
    var height = Math.max(1, window.innerHeight);

    for (var i = 0; i < count; i += 1) {
      weatherEffectParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        age: Math.random() * 120,
        speed: 0.55 + Math.random() * 1.25,
        length: 9 + Math.random() * 22
      });
    }
  }

  function weatherVectorAt(x, y, t) {
    var nx = x / Math.max(window.innerWidth, 1);
    var ny = y / Math.max(window.innerHeight, 1);
    var angle =
      Math.sin(nx * 7.4 + t * 0.00042) * 1.1 +
      Math.cos(ny * 6.2 - t * 0.00031) * 0.95 +
      Math.sin((nx + ny) * 4.8 + t * 0.00022) * 0.65;
    var speed = 0.55 + 1.55 * (0.5 + 0.5 * Math.sin(nx * 9.0 - ny * 5.5 + t * 0.00038));
    return {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed
    };
  }

  function drawWindEffect(now) {
    var ctx = weatherEffectContext;
    var width = window.innerWidth;
    var height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    weatherEffectParticles.forEach(function (particle) {
      var vector = weatherVectorAt(particle.x, particle.y, now);
      var length = particle.length * (0.65 + vector.x * 0.05 + vector.y * 0.05);
      var alpha = 0.14 + Math.min(0.24, Math.abs(vector.x + vector.y) * 0.05);
      var x2 = particle.x - vector.x * length;
      var y2 = particle.y - vector.y * length;

      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "rgba(214,244,255," + alpha.toFixed(3) + ")";
      ctx.lineWidth = 1.05;
      ctx.stroke();

      particle.x += vector.x * particle.speed;
      particle.y += vector.y * particle.speed;
      particle.age += 1;

      if (particle.x < -40 || particle.x > width + 40 || particle.y < -40 || particle.y > height + 40 || particle.age > 240) {
        particle.x = Math.random() * width;
        particle.y = Math.random() * height;
        particle.age = 0;
      }
    });

    ctx.globalCompositeOperation = "source-over";
  }

  function drawPressureEffect(now) {
    var ctx = weatherEffectContext;
    var width = window.innerWidth;
    var height = window.innerHeight;
    var phase = (now - weatherEffectStartedAt) * 0.00012;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 1.15;

    for (var row = -2; row < 10; row += 1) {
      var yBase = (row / 8) * height + Math.sin(phase + row) * 26;
      ctx.beginPath();
      for (var x = -40; x <= width + 40; x += 18) {
        var y = yBase +
          Math.sin(x * 0.008 + row * 0.85 + phase * 3.2) * 28 +
          Math.cos(x * 0.014 - row * 0.45 - phase * 2.1) * 14;
        if (x === -40) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = row % 3 === 0 ? "rgba(255,255,255,0.25)" : "rgba(222,248,250,0.16)";
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function startWeatherModeEffects(mode) {
    var config = zoomWeatherModeConfig[mode] || {};

    if (weatherEffectFrame) {
      window.cancelAnimationFrame(weatherEffectFrame);
      weatherEffectFrame = null;
    }

    if (!config.effect) {
      if (weatherEffectCanvas) {
        weatherEffectCanvas.classList.remove("is-active");
      }
      weatherEffectMode = null;
      return;
    }

    ensureWeatherEffectCanvas();
    weatherEffectMode = config.effect;
    weatherEffectStartedAt = performance.now();
    weatherEffectCanvas.dataset.effect = weatherEffectMode;
    weatherEffectCanvas.classList.add("is-active");

    if (weatherEffectMode === "wind") {
      seedWeatherEffectParticles(280);
    }

    function frame(now) {
      if (!weatherEffectContext || weatherEffectMode !== config.effect || !isZoomWeatherMapMode(state.weatherMapMode)) {
        return;
      }

      if (weatherEffectMode === "wind") {
        drawWindEffect(now);
      } else if (weatherEffectMode === "pressure") {
        drawPressureEffect(now);
      }

      weatherEffectFrame = window.requestAnimationFrame(frame);
    }

    weatherEffectFrame = window.requestAnimationFrame(frame);
  }

  function ensureWeatherModeLegend() {
    if (weatherModeLegend) {
      return weatherModeLegend;
    }

    weatherModeLegend = document.createElement("aside");
    weatherModeLegend.className = "weather-mode-legend hidden";
    weatherModeLegend.setAttribute("aria-live", "polite");
    weatherModeLegend.innerHTML = [
      "<div class='weather-mode-legend-title'></div>",
      "<div class='weather-mode-legend-meta'></div>",
      "<div class='weather-mode-legend-gradient'></div>",
      "<div class='weather-mode-legend-scale'></div>"
    ].join("");
    document.body.appendChild(weatherModeLegend);
    return weatherModeLegend;
  }

  function updateWeatherModeLegend(mode, payload) {
    var config = zoomWeatherModeConfig[mode];

    if (!config) {
      if (weatherModeLegend) {
        weatherModeLegend.classList.add("hidden");
      }
      return;
    }

    var legend = ensureWeatherModeLegend();
    var title = legend.querySelector(".weather-mode-legend-title");
    var meta = legend.querySelector(".weather-mode-legend-meta");
    var gradient = legend.querySelector(".weather-mode-legend-gradient");
    var scale = legend.querySelector(".weather-mode-legend-scale");
    var latest = payload && payload.latest ? payload.latest : {};
    var valid = latest.valid_time || latest.time || "";
    var scaleValues = config.legend || [];

    title.textContent = config.label + " Live";
    meta.textContent = (payload && payload.provider ? payload.provider : config.sourceLabel) + (valid ? " / " + valid.replace("T", " ").replace("Z", " UTC") : "");
    gradient.style.background = config.gradient;
    scale.innerHTML = scaleValues.map(function (label) {
      return "<span>" + escapeHtml(label) + "</span>";
    }).join("");
    legend.dataset.mode = mode;
    legend.classList.remove("hidden");
  }

  function clearZoomWeatherLayer() {
    if (!viewer) {
      return;
    }

    if (zoomWeatherTimer) {
      window.clearInterval(zoomWeatherTimer);
      zoomWeatherTimer = null;
    }

    if (weatherEffectFrame) {
      window.cancelAnimationFrame(weatherEffectFrame);
      weatherEffectFrame = null;
    }

    if (weatherEffectCanvas) {
      weatherEffectCanvas.classList.remove("is-active");
      if (weatherEffectContext) {
        weatherEffectContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }

    if (weatherModeLegend) {
      weatherModeLegend.classList.add("hidden");
    }

    if (zoomWeatherLayer && imageryLayerExists(zoomWeatherLayer)) {
      viewer.imageryLayers.remove(zoomWeatherLayer, true);
    }
    zoomWeatherLayer = null;

    zoomWeatherPreviousLayers.forEach(function (layer) {
      if (layer && imageryLayerExists(layer)) {
        viewer.imageryLayers.remove(layer, true);
      }
    });
    zoomWeatherPreviousLayers = [];
    zoomWeatherMode = null;
    document.body.dataset.weatherMap = state.weatherMapMode || "satellite";
    viewer.scene.requestRender();
  }

  function applyZoomWeatherLayer(payload, mode) {
    if (!viewer || !payload || !payload.tile_template) {
      return false;
    }

    var config = zoomWeatherModeConfig[mode] || zoomWeatherModeConfig.wind;

    if (zoomWeatherLayer && imageryLayerExists(zoomWeatherLayer)) {
      zoomWeatherLayer.alpha = Math.max(0.04, zoomWeatherLayer.alpha * 0.42);
      zoomWeatherPreviousLayers.push(zoomWeatherLayer);
      window.setTimeout(function () {
        var oldLayer = zoomWeatherPreviousLayers.shift();
        if (oldLayer && imageryLayerExists(oldLayer)) {
          viewer.imageryLayers.remove(oldLayer, true);
          viewer.scene.requestRender();
        }
      }, 1800);
      zoomWeatherLayer = null;
    }

    zoomWeatherLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: payload.tile_template,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      minimumLevel: 0,
      maximumLevel: config.maxLevel || 8,
      credit: payload.provider || config.sourceLabel || "Zoom Earth"
    }));
    zoomWeatherLayer.orionKey = "zoomWeather";

    if (zoomWeatherLayer.imageryProvider && zoomWeatherLayer.imageryProvider.errorEvent) {
      zoomWeatherLayer.imageryProvider.errorEvent.addEventListener(function (tileProviderError) {
        tileProviderError.retry = tileProviderError.timesRetried < 1;
      });
    }

    zoomWeatherLayer.alpha = zoomWeatherLayerAlpha(mode);
    zoomWeatherLayer.brightness = config.brightness || 1;
    zoomWeatherLayer.contrast = config.contrast || 1;
    zoomWeatherLayer.saturation = config.saturation || 1;
    zoomWeatherMode = mode;
    raiseOperationalLayers();
    startWeatherModeEffects(mode);
    updateWeatherModeLegend(mode, payload);
    viewer.scene.requestRender();
    return true;
  }

  function isStaticHostMode() {
    return !!(Orion.Config.Constants && Orion.Config.Constants.STATIC_HOST);
  }

  function staticDataUrlForEndpoint(endpoint) {
    if (!isStaticHostMode() || !endpoint) {
      return endpoint;
    }

    var parsed = new URL(endpoint, window.location.origin);
    var path = parsed.pathname;
    var params = parsed.searchParams;

    if (path === "/live/satellites") {
      return "pages-data/live/satellites/" + encodeURIComponent(params.get("group") || "stations") + ".json";
    }
    if (path === "/live/earthquakes") {
      return "pages-data/live/earthquakes/" + encodeURIComponent(params.get("feed") || state.earthquakeFeed || "2.5_day") + ".json";
    }
    if (path === "/live/weather/radar") {
      return "pages-data/live/weather/radar.json";
    }
    if (path === "/live/wildfires") {
      return "pages-data/live/wildfires.json";
    }
    if (path === "/live/aircraft") {
      return "pages-data/live/aircraft.json";
    }
    if (path === "/live/cameras") {
      return "pages-data/live/cameras.json";
    }
    if (path === "/live/intel") {
      return "pages-data/live/intel/" + encodeURIComponent(params.get("layer") || "unknown") + ".json";
    }

    return endpoint;
  }

  function fetchJsonEndpoint(endpoint) {
    return fetch(staticDataUrlForEndpoint(endpoint), { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      });
  }

  function zoomEarthTileBase() {
    return isStaticHostMode() ? "https://tiles.zoom.earth" : "/zoom-earth";
  }

  function toUtcStamp(seconds) {
    return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function selectZoomEarthForecastClient(timesPayload, layerName, levelName) {
    var layerPayload = timesPayload && timesPayload[layerName];
    var levelPayload = layerPayload && layerPayload[levelName];
    var now = Date.now() / 1000;
    var best = null;

    Object.keys(levelPayload || {}).forEach(function (runKey) {
      var runTs = Number(runKey);
      var hours = levelPayload[runKey];

      if (!Number.isFinite(runTs) || !Array.isArray(hours)) {
        return;
      }

      hours.forEach(function (hourValue) {
        var hour = Number(hourValue);
        if (!Number.isFinite(hour)) {
          return;
        }

        var validTs = runTs + hour * 3600;
        var score = (validTs <= now ? 0 : 1000000000) + Math.abs(now - validTs);
        if (!best || score < best.score) {
          best = { runTs: runTs, forecastHour: hour, validTs: validTs, score: score };
        }
      });
    });

    if (!best) {
      return null;
    }

    var runDate = new Date(best.runTs * 1000);
    var datePath = runDate.toISOString().slice(0, 10) + "/" +
      String(runDate.getUTCHours()).padStart(2, "0") +
      String(runDate.getUTCMinutes()).padStart(2, "0");
    var forecastPath = "f" + String(best.forecastHour).padStart(3, "0");

    return {
      path: zoomEarthTileBase() + "/icon/v1/" + layerName + "/webp/" + levelName + "/" + datePath + "/" + forecastPath + "/{z}/{y}/{x}.webp",
      run_time: toUtcStamp(best.runTs),
      valid_time: toUtcStamp(best.validTs),
      forecast_hour: best.forecastHour
    };
  }

  function selectZoomEarthRadarClient(timesPayload) {
    var reflectivity = timesPayload && timesPayload.reflectivity ? timesPayload.reflectivity : {};
    var now = Date.now() / 1000;
    var frames = Object.keys(reflectivity).map(function (key) {
      return { time: Number(key), hash: reflectivity[key] };
    }).filter(function (frame) {
      return Number.isFinite(frame.time) && frame.hash;
    }).sort(function (a, b) {
      return a.time - b.time;
    });
    var selected = frames.filter(function (frame) {
      return frame.time <= now;
    });

    selected = (selected.length ? selected : frames).slice(-12);
    return selected.map(function (frame) {
      var date = new Date(frame.time * 1000);
      var day = date.toISOString().slice(0, 10);
      var hm = String(date.getUTCHours()).padStart(2, "0") + String(date.getUTCMinutes()).padStart(2, "0");
      return {
        time: toUtcStamp(frame.time),
        hash: frame.hash,
        path: zoomEarthTileBase() + "/radar/reflectivity/" + day + "/" + hm + "/" + frame.hash + "/{z}/{y}/{x}.webp"
      };
    });
  }

  function fetchZoomEarthWeatherPayload(mode) {
    var config = zoomWeatherModeConfig[mode];

    if (!isStaticHostMode()) {
      return fetch("/live/weather/zoom-earth?mode=" + encodeURIComponent(config.endpointMode), { headers: { Accept: "application/json" } })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Zoom Earth weather unavailable");
          }
          return response.json();
        });
    }

    return fetch("pages-data/live/weather/zoom-" + encodeURIComponent(mode) + ".json", { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Zoom Earth pages snapshot unavailable");
        }
        return response.json();
      })
      .then(function (payload) {
        if (!payload || !payload.tile_template) {
          throw new Error("No Zoom Earth weather snapshot");
        }
        return payload;
      });
  }

  function setZoomWeatherMapMode(mode, force) {
    if (!viewer || !isZoomWeatherMapMode(mode)) {
      clearZoomWeatherLayer();
      return;
    }

    var config = zoomWeatherModeConfig[mode];
    var token = ++zoomWeatherRequestToken;

    platformFeeds.weatherRadar = {
      status: "loading",
      loadedAt: Date.now(),
      items: []
    };
    updatePlatformTelemetry();

    fetchZoomEarthWeatherPayload(mode)
      .then(function (payload) {
        if (token !== zoomWeatherRequestToken || state.weatherMapMode !== mode) {
          return;
        }

        if (!applyZoomWeatherLayer(payload, mode)) {
          throw new Error("No Zoom Earth weather tile");
        }

        platformFeeds.weatherRadar = {
          status: "online",
          loadedAt: Date.now(),
          items: payload.frames || [],
          payload: payload
        };
        updatePlatformTelemetry();
      })
      .catch(function (error) {
        if (token !== zoomWeatherRequestToken) {
          return;
        }
        platformFeeds.weatherRadar = Object.assign({}, platformFeeds.weatherRadar, {
          status: error && error.message ? error.message : "offline",
          loadedAt: Date.now()
        });
        updatePlatformTelemetry();
      });

    if (!zoomWeatherTimer) {
      zoomWeatherTimer = window.setInterval(function () {
        if (isZoomWeatherMapMode(state.weatherMapMode)) {
          setZoomWeatherMapMode(state.weatherMapMode, true);
        }
      }, 10 * 60 * 1000);
    }

    if (force && zoomWeatherLayer && zoomWeatherMode === mode) {
      zoomWeatherLayer.alpha = zoomWeatherLayerAlpha(mode);
      raiseOperationalLayers();
    }
  }

  function setCityLayer(enabled) {
    if (!viewer) {
      return;
    }

    if (!enabled) {
      if (cityBuildingsTileset) {
        viewer.scene.primitives.remove(cityBuildingsTileset);
        cityBuildingsTileset = null;
      }

      platformFeeds.cities3d = {
        status: "standby",
        loadedAt: Date.now(),
        items: []
      };
      viewer.scene.requestRender();
      return;
    }

    if (cityBuildingsTileset) {
      platformFeeds.cities3d = {
        status: "online",
        loadedAt: Date.now(),
        items: [{ name: "OSM buildings" }]
      };
      return;
    }

    platformFeeds.cities3d = {
      status: "loading",
      loadedAt: Date.now(),
      items: []
    };
    updatePlatformTelemetry();

    var token = window.CESIUM_ION_TOKEN || window.localStorage.getItem("orion:cesiumIonToken");

    if (!token || !Cesium.createOsmBuildingsAsync) {
      platformFeeds.cities3d.status = "Cesium ion token needed";
      updatePlatformTelemetry();
      showToast("3D buildings are wired in. Add a Cesium ion token to enable OSM Buildings.");
      return;
    }

    Cesium.Ion.defaultAccessToken = token;
    Cesium.createOsmBuildingsAsync()
      .then(function (tileset) {
        cityBuildingsTileset = tileset;
        viewer.scene.primitives.add(tileset);
        platformFeeds.cities3d = {
          status: "online",
          loadedAt: Date.now(),
          items: [{ name: "OSM buildings" }]
        };
        updatePlatformTelemetry();
        viewer.scene.requestRender();
      })
      .catch(function () {
        platformFeeds.cities3d.status = "offline";
        updatePlatformTelemetry();
        showToast("3D buildings could not be loaded from Cesium ion.");
      });
  }

  function setSoundEngine(enabled) {
    if (!enabled) {
      if (soundEngine) {
        soundEngine.gain.gain.setTargetAtTime(0, soundEngine.context.currentTime, 0.08);
        window.setTimeout(function () {
          if (soundEngine) {
            soundEngine.oscillator.stop();
            soundEngine.context.close();
            soundEngine = null;
          }
        }, 160);
      }

      platformFeeds.soundscape = {
        status: "standby",
        loadedAt: Date.now(),
        items: []
      };
      return;
    }

    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextCtor) {
      platformFeeds.soundscape = {
        status: "audio unavailable",
        loadedAt: Date.now(),
        items: []
      };
      updatePlatformTelemetry();
      return;
    }

    if (!soundEngine) {
      var context = new AudioContextCtor();
      var oscillator = context.createOscillator();
      var filter = context.createBiquadFilter();
      var gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 56;
      filter.type = "lowpass";
      filter.frequency.value = 240;
      gain.gain.value = 0.0001;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      oscillator.start();

      soundEngine = {
        context: context,
        oscillator: oscillator,
        filter: filter,
        gain: gain
      };
    }

    if (soundEngine.context.state === "suspended") {
      soundEngine.context.resume();
    }

    soundEngine.gain.gain.setTargetAtTime(0.025, soundEngine.context.currentTime, 0.12);
    platformFeeds.soundscape = {
      status: "online",
      loadedAt: Date.now(),
      items: [{ name: "Camera-position ambience" }]
    };
    updatePlatformTelemetry();
  }

  function setScanMode(mode) {
    state.scanMode = mode || "standard";
    document.body.dataset.scanMode = state.scanMode;
    
    cognitiveGovernanceManager.recordInteraction();

    var shaderVisualModes = {
      thermal: "thermal",
      infrared: "thermal",
      night: "night",
      weather: "weather",
      radar: "weather",
      signal: "night"
    };
    var shaderMode = shaderVisualModes[state.scanMode] || "standard";
    switchImageryMode(shaderMode);

    var presets = {
      weather: {
        layers: { weatherRadar: true, lightning: true, volumetricWeather: true, wildfires: true },
        imagery: { clouds: true, infrared: false }
      },
      cyber: {
        layers: { cyberNetwork: true, underseaCables: true, rfHeatmap: true },
        imagery: {}
      },
      traffic: {
        layers: { cameras: true, traffic: true, emergencyIncidents: true },
        imagery: { labels: true }
      },
      orbital: {
        layers: {
          realtimeSatellites: true,
          satInternet: true,
          satCommunications: true,
          satPositioning: true,
          satEarthImaging: true,
          satWeather: true,
          satScience: true,
          satIot: true,
          starlink: true,
          debris: true
        },
        imagery: { night: true }
      },
      radar: {
        layers: { weatherRadar: true, defenseAirspace: true, airCorridors: true },
        imagery: { clouds: true }
      },
      signal: {
        layers: { rfHeatmap: true, cyberNetwork: true, underseaCables: true },
        imagery: { labels: true }
      },
      thermal: {
        layers: { wildfires: true, volumetricWeather: true },
        imagery: { infrared: true, clouds: true }
      },
      infrared: {
        layers: { wildfires: true, lightning: true },
        imagery: { infrared: true, night: false }
      },
      night: {
        layers: { cameras: true, traffic: true, lightning: true },
        imagery: { night: true, labels: true }
      }
    };

    var preset = presets[state.scanMode];

    if (preset) {
      Object.keys(preset.imagery || {}).forEach(function (layerId) {
        state.layers[layerId] = preset.imagery[layerId];
      });
      Object.keys(preset.layers || {}).forEach(function (layerId) {
        if (platformLayerDefinitions[layerId] && state.platformLayers[layerId] !== preset.layers[layerId]) {
          setPlatformLayer(layerId, preset.layers[layerId]);
        }
      });
      scheduleImageryRefresh();
    }

    if (viewer) {
      var baseColor = state.scanMode === "night" ? "#01040a" : state.scanMode === "thermal" ? "#160806" : "#0a1628";
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(baseColor);
      viewer.scene.requestRender();
    }

    if (elements.scanModeSelect) {
      elements.scanModeSelect.value = state.scanMode;
    }

    showToast("Scan mode: " + state.scanMode.toUpperCase());
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1000);
  }

  function beginCanvasTimelapseCapture() {
    var canvas = viewer && viewer.scene && viewer.scene.canvas;

    timelapseChunks = [];

    if (!canvas || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      return null;
    }

    try {
      var stream = canvas.captureStream(30);
      var recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
      recorder.ondataavailable = function (event) {
        if (event.data && event.data.size) {
          timelapseChunks.push(event.data);
        }
      };
      recorder.onstop = function () {
        if (timelapseChunks.length) {
          downloadBlob(new Blob(timelapseChunks, { type: "video/webm" }), "project-orion-timelapse.webm");
        }
      };
      recorder.start(500);
      return recorder;
    } catch (error) {
      try {
        var fallbackStream = canvas.captureStream(24);
        var fallbackRecorder = new MediaRecorder(fallbackStream);
        fallbackRecorder.ondataavailable = function (event) {
          if (event.data && event.data.size) {
            timelapseChunks.push(event.data);
          }
        };
        fallbackRecorder.onstop = function () {
          if (timelapseChunks.length) {
            downloadBlob(new Blob(timelapseChunks, { type: "video/webm" }), "project-orion-timelapse.webm");
          }
        };
        fallbackRecorder.start(500);
        return fallbackRecorder;
      } catch (fallbackError) {
        return null;
      }
    }
  }

  function exportTimelapseMetadata(start, end, steps, scope) {
    var metadata = {
      project: "Project Orion",
      generatedAt: new Date().toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      steps: steps,
      scope: scope,
      target: state.target,
      imageryProvider: activeProviderLabel(),
      layers: Object.assign({}, state.layers),
      platformLayers: Object.assign({}, state.platformLayers)
    };
    downloadBlob(new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" }), "project-orion-timelapse-metadata.json");
  }

  function recordTimelapse() {
    if (!viewer || state.timelapseRecording) {
      return;
    }

    var startInput = elements.timelapseStart && elements.timelapseStart.value;
    var endInput = elements.timelapseEnd && elements.timelapseEnd.value;
    var start = startInput ? new Date(startInput + "T00:00:00Z") : addDays(state.date, -7);
    var end = endInput ? new Date(endInput + "T23:00:00Z") : state.date;

    if (start > end) {
      var swap = start;
      start = end;
      end = swap;
    }

    start = clampDate(start);
    end = clampDate(end);
    var totalHours = Math.max(1, Math.floor(hoursBetween(start, end)));
    var steps = Math.min(96, Math.max(8, totalHours));
    var stepIndex = 0;
    var wasPlaying = state.playing;
    var scope = elements.timelapseLocationMode ? elements.timelapseLocationMode.value : "view";

    state.timelapseRecording = true;
    if (elements.timelapseRecord) {
      elements.timelapseRecord.classList.add("active");
      elements.timelapseRecord.textContent = "Generating...";
    }

    setPlaying(false);
    setLiveMode(false);
    timelapseRecorder = beginCanvasTimelapseCapture();

    if (scope === "target" && Number.isFinite(state.target.lat) && Number.isFinite(state.target.lon)) {
      flyToLocation({
        name: state.target.name || "Selected target",
        lat: state.target.lat,
        lon: state.target.lon,
        height: 900000
      });
    }

    showToast("Generating historical imagery sequence.");

    function tick() {
      var amount = stepIndex / Math.max(1, steps);
      var next = new Date(start.getTime() + (end.getTime() - start.getTime()) * amount);
      setDate(next, true);
      if (elements.timelapseRecord) {
        elements.timelapseRecord.textContent = "Rendering " + Math.min(stepIndex + 1, steps) + " / " + steps;
      }
      stepIndex += 1;

      if (stepIndex <= steps) {
        window.setTimeout(tick, 640);
        return;
      }

      state.timelapseRecording = false;
      if (timelapseRecorder && timelapseRecorder.state !== "inactive") {
        timelapseRecorder.stop();
      }
      exportTimelapseMetadata(start, end, steps, scope);
      if (elements.timelapseRecord) {
        elements.timelapseRecord.classList.remove("active");
        elements.timelapseRecord.textContent = "Generate history timelapse";
      }
      if (wasPlaying) {
        setPlaying(true);
      }
      showToast("History timelapse generated from NASA GIBS imagery.");
    }

    tick();
  }

  function selectedOrbitalLayerIds() {
    return state.orbitalDataset === "all" ? orbitalLayerIds.slice() : orbitalLayerIds.filter(function (layerId) {
      return layerId === state.orbitalDataset;
    });
  }

  function setOrbitalDataset(dataset) {
    state.orbitalDataset = orbitalLayerIds.indexOf(dataset) === -1 ? "all" : dataset;
    if (elements.orbitalDatasetSelect) {
      elements.orbitalDatasetSelect.value = state.orbitalDataset;
    }

    if (state.tracking.sat || orbitalLayerIds.some(function (layerId) { return state.platformLayers[layerId]; })) {
      orbitalLayerIds.forEach(function (layerId) {
        setPlatformLayer(layerId, state.tracking.sat && selectedOrbitalLayerIds().indexOf(layerId) !== -1);
      });
    }
    state.tracking.dirty = true;
    updateTrackingLayer(true);
  }

  function setTrackingDomain(type, enabled) {
    if (!trackingDomainPlatformLayers[type]) {
      return;
    }

    state.tracking[type] = !!enabled;
    state.tracking.dirty = true;
    trackingDomainSyncPaused = true;

    if (type === "sat") {
      orbitalLayerIds.forEach(function (layerId) {
        setPlatformLayer(layerId, enabled && selectedOrbitalLayerIds().indexOf(layerId) !== -1);
      });
    } else {
      trackingDomainPlatformLayers[type].forEach(function (layerId) {
        setPlatformLayer(layerId, !!enabled);
      });
    }

    trackingDomainSyncPaused = false;
    state.tracking[type] = !!enabled;
    syncTrackingControls();
    updateTrackingLayer(true);
  }

  function syncTrackingDomainFromPlatformLayer(layerId) {
    if (trackingDomainSyncPaused) {
      return;
    }

    if (layerId === "liveAircraft") {
      state.tracking.air = !!state.platformLayers.liveAircraft;
      state.tracking.dirty = true;
    } else if (layerId === "liveShips") {
      state.tracking.sea = !!state.platformLayers.liveShips;
      state.tracking.dirty = true;
    } else if (orbitalLayerIds.indexOf(layerId) !== -1) {
      state.tracking.sat = orbitalLayerIds.some(function (id) {
        return !!state.platformLayers[id];
      });
      state.tracking.dirty = true;
    }
  }

  function applyWeatherMapMode(mode) {
    state.weatherMapMode = mode || "satellite";
    document.body.dataset.weatherMap = state.weatherMapMode;
    if (elements.weatherMapModeSelect) {
      elements.weatherMapModeSelect.value = state.weatherMapMode;
    }

    if (state.weatherMapMode === "satellite") {
      clearZoomWeatherLayer();
      setPlatformLayer("weatherRadar", false);
      state.layers.clouds = false;
      state.layers.infrared = false;
      scheduleImageryRefresh();
    } else if (state.weatherMapMode === "satellite-hd") {
      clearZoomWeatherLayer();
      state.cleanEarth = true;
      state.layers.clouds = false;
      state.layers.infrared = false;
      scheduleImageryRefresh();
    } else if (isZoomWeatherMapMode(state.weatherMapMode)) {
      state.scanMode = "weather";
      document.body.dataset.scanMode = "weather";
      switchImageryMode("weather");
      if (elements.scanModeSelect) {
        elements.scanModeSelect.value = "weather";
      }
      if (state.weatherMapMode === "radar" || state.weatherMapMode === "precipitation") {
        state.radarOpacity = Math.max(state.radarOpacity, 0.58);
      }
      setZoomWeatherMapMode(state.weatherMapMode, true);
    }

    syncControlState();
    updateTelemetry();
  }

  function applySatelliteSource(source) {
    state.satelliteSource = source || "nasa-live";
    if (elements.satelliteSourceSelect) {
      elements.satelliteSourceSelect.value = state.satelliteSource;
    }

    if (state.satelliteSource === "cloud-free") {
      state.cleanEarth = true;
      state.layers.clouds = false;
      state.layers.infrared = false;
    } else if (state.satelliteSource === "public-geostat") {
      state.cleanEarth = true;
      state.layers.trueColor = true;
      state.layers.clouds = false;
      state.layers.infrared = false;
    } else {
      state.cleanEarth = false;
      state.layers.trueColor = true;
    }

    scheduleImageryRefresh();
    syncControlState();
    updateTelemetry();
  }

  function setPlatformLayer(layerId, enabled) {
    if (!platformLayerDefinitions[layerId]) {
      return;
    }

    var stateChanged = layerStateManager.setLayerEnabled(layerId, enabled);
    if (!stateChanged) {
      if (enabled) {
        var existingFeed = platformFeeds[layerId];
        var hasItems = existingFeed && Array.isArray(existingFeed.items) && existingFeed.items.length > 0;
        if (platformUsesEntityFeed(platformLayerDefinitions[layerId]) && !hasItems) {
          refreshPlatformLayer(layerId, true);
        }
        syncPlatformControls();
        updatePlatformTelemetry();
      } else {
        destroyLayerCompletely(layerId, true);
        syncPlatformControls();
        updatePlatformTelemetry();
      }
      return;
    }

    state.platformLayers[layerId] = enabled;
    syncTrackingDomainFromPlatformLayer(layerId);

    if (layerId === "weatherRadar") {
      setWeatherRadarLayer(enabled);
      syncPlatformControls();
      updatePlatformTelemetry();
      return;
    }

    if (layerId === "cities3d") {
      setCityLayer(enabled);
      syncPlatformControls();
      updatePlatformTelemetry();
      return;
    }

    if (layerId === "soundscape") {
      setSoundEngine(enabled);
      syncPlatformControls();
      updatePlatformTelemetry();
      return;
    }

    if (layerId === "cameras") {
      if (enabled && window.CameraNet) {
        CameraNet.enable(viewer);
      } else if (window.CameraNet) {
        CameraNet.disable(viewer);
      }
      syncPlatformControls();
      updatePlatformTelemetry();
      return;
    }

    if (enabled) {
      refreshPlatformLayer(layerId, true);
    } else {
      destroyLayerCompletely(layerId, true);
      
      if (elements[platformLayerDefinitions[layerId].controlId]) {
        elements[platformLayerDefinitions[layerId].controlId].checked = false;
      }
    }

    syncPlatformControls();
    updatePlatformTelemetry();
  }
  function layerHasRenderableState(layerId) {
    var hasEntities = Object.keys(platformEntities).some(function (id) {
      return platformEntities[id] && platformEntities[id].layerId === layerId;
    });
    var hasPrimitives = Object.keys(platformPrimitives).some(function (id) {
      return platformPrimitives[id] && platformPrimitives[id].layerId === layerId;
    });
    var collection = primitiveCollections[layerId];
    var hasCollection = !!(collection && typeof collection.length === "number" && collection.length > 0);
    var feed = platformFeeds[layerId];
    var hasFeed = !!(feed && ((Array.isArray(feed.items) && feed.items.length > 0) ||
      (feed.status && ["standby", "offline"].indexOf(feed.status) === -1)));

    return hasEntities || hasPrimitives || hasCollection || !!platformHeatmapLayers[layerId] || hasFeed;
  }

  function destroyLayerCompletely(layerId, force) {
    if (!force && !layerHasRenderableState(layerId)) {
      return;
    }

    console.log('[LayerCleanup] Destroying layer:', layerId);

    var entitiesToRemove = [];
    Object.keys(platformEntities).forEach(function (id) {
      var record = platformEntities[id];
      if (record && record.layerId === layerId) {
        entitiesToRemove.push(id);
      }
    });

    entitiesToRemove.forEach(function(id) {
      var record = platformEntities[id];
      if (record) {
        removePlatformRecord(record);
        delete platformEntities[id];
      }
    });

    if (layerId === 'liveShips') MaritimeRenderer.render([]);
    if (layerId === 'liveAircraft') AviationRenderer.render([]);
    if (orbitalLayerIds.indexOf(layerId) !== -1) {
      OrbitalRenderer.render([], layerId);
    }

    if (layerId === 'cyberNetwork' || layerId === 'underseaCables' || layerId === 'powerGrid') {
      InfrastructureRenderer.render(layerId, []);
    }

    var collection = primitiveCollections[layerId];
    if (collection) {
      collection.removeAll();
    }

    if (layerId === 'cyberNetwork' && primitiveCollections.cyberPackets) {
      primitiveCollections.cyberPackets.removeAll();
    }
    if (layerId === 'rfHeatmap' && primitiveCollections.rfHeatmap) {
      primitiveCollections.rfHeatmap.removeAll();
    }

    var primitivesToRemove = [];
    Object.keys(platformPrimitives).forEach(function(id) {
      if (platformPrimitives[id] && platformPrimitives[id].layerId === layerId) {
        primitivesToRemove.push(id);
      }
    });

    primitivesToRemove.forEach(function(id) {
      delete platformPrimitives[id];
    });
    removePlatformHeatmap(layerId);

    if (platformFeeds[layerId]) {
      platformFeeds[layerId].items = [];
      platformFeeds[layerId].status = "standby";
      platformFeeds[layerId].loadedAt = 0;
    }

    if (selectedPlatformEntityId && selectedPlatformEntityId.indexOf(layerId + "::") === 0) {
      console.log('[LayerCleanup] Selected entity belonged to destroyed layer, unlocking camera');
      clearPlatformSelection("TRACK LOST");
    }

    updatePlatformTelemetry();

    if (force || entitiesToRemove.length) {
      console.log('[LayerCleanup] Layer destroyed:', layerId, 
                  'entities removed:', entitiesToRemove.length);
    }
  }
  function platformDetailTimestamp(record) {
    var item = record.item || {};
    var payload = platformFeeds[record.layerId] && platformFeeds[record.layerId].payload;
    var raw = item.timestamp || item.time || item.updated || item.generated || (payload && payload.generated);

    if (typeof raw === "number") {
      return new Date(raw < 10000000000 ? raw * 1000 : raw);
    }

    if (raw) {
      var parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return platformTime();
  }

  function platformDetailDescription(record) {
    var item = record.item || {};

    if (item.description) {
      return item.description;
    }

    if (record.layerId === "emergencyIncidents") {
      return "Live National Weather Service CAP alerts. Plotted coordinates are centroids from the official GeoJSON feed.";
    }

    if (record.layerId === "socialEvents") {
      var feedEv = platformFeeds.socialEvents;

      if (feedEv && feedEv.payload && feedEv.payload.mode === "no_credentials") {
        return "Set TICKETMASTER_API_KEY on the Orion server to load real US events from Ticketmaster.";
      }

      return "Public events from the Ticketmaster Discovery API when a key is configured. Images and links come from Ticketmaster.";
    }

    if (record.layerId === "traffic") {
      return "Congestion corridor rendered as road-level heat and animated route flow.";
    }

    if (record.layerId === "rfHeatmap") {
      return "Merged RF density field generated from overlapping cellular, WiFi, and signal-source samples.";
    }

    if (record.definition.type === "camera") {
      return "Camera metadata is loaded regionally. Live video or a refreshed snapshot is opened only when selected.";
    }

    return entityDetail(record.definition.type, item, record.sample);
  }

  function showPlatformDetail(record) {
    if (!elements.intelDetailCard || !record || !record.sample) {
      return;
    }

    var item = record.item || {};
    var timestamp = platformDetailTimestamp(record);
    var severity = item.severity || item.priority || item.intensity || item.magnitude || record.sample.magnitude || "nominal";
    var mediaUrl = item.image_url || item.imageUrl || item.media_url || item.mediaUrl || item.snapshot_url || item.proxy_snapshot_url;
    var type = item.type || item.category || record.definition.label;
    var status = item.status || (platformFeeds[record.layerId] && platformFeeds[record.layerId].status) || "online";
    var confidence = visualCohesionManager.getConfidenceScore(record.layerId);
    var ageMin = platformFeeds[record.layerId] ? Math.round((Date.now() - platformFeeds[record.layerId].loadedAt) / 60000) : 0;

    var rows = [
      ["Type", type],
      ["Severity", typeof severity === "number" ? Number(severity).toFixed(2) : severity],
      ["Status", status],
      ["Confidence", (confidence * 100).toFixed(0) + "%"],
      ["Data Age", ageMin > 0 ? ageMin + "m ago" : "LIVE"]
    ];

    if (record.sample && record.sample.heading) {
      rows.push(["Heading", record.sample.heading.toFixed(0) + " deg (" + getCompassDirection(record.sample.heading) + ")"]);
    }
    if (record.sample && record.sample.height) {
      rows.push(["Altitude", formatAltitude(record.sample.height)]);
    }
    
    rows.push(
      ["Location", record.sample.lat.toFixed(4) + ", " + record.sample.lon.toFixed(4)],
      ["Timestamp", readableDateTime(timestamp)],
      ["Source", item.source || item.provider || record.definition.source]
    );

    if (record.definition.type === "satellite") {
      rows.splice(1, 0,
        ["NORAD", item.id || "-"],
        ["Catalog", item.group || record.definition.label],
        ["Orbit", item.satrec && Number.isFinite(item.satrec.no) ? (1440 / Math.max(0.0001, item.satrec.no)).toFixed(1) + " min" : "TLE propagated"]
      );
    }

    if (record.layerId === "emergencyIncidents") {
      rows.splice(1, 0, ["Event", item.event || item.name || "-"], ["Area", item.area || "-"]);
      rows.push(["Expires", item.expires ? String(item.expires) : "-"], ["Urgency", (item.metadata && item.metadata.urgency) || "-"], ["Certainty", (item.metadata && item.metadata.certainty) || "-"]);
    }

    if (record.layerId === "socialEvents") {
      rows.splice(1, 0, ["Venue", item.venue || "-"], ["Segment", (item.metadata && item.metadata.segment) || "-"], ["Genre", (item.metadata && item.metadata.genre) || "-"]);
      if (item.url) {
        rows.push(["Ticket link", item.url]);
      }
    }

    var rowHtml = rows.map(function (row) {
      return "<div class=\"intel-detail-row\"><span>" + escapeHtml(row[0]) + "</span><strong>" + escapeHtml(row[1]) + "</strong></div>";
    }).join("");

    var mediaHtml = mediaUrl
      ? "<img class=\"intel-detail-media\" alt=\"Intel media\" src=\"" + escapeHtml(mediaUrl) + "\">"
      : "<div class=\"intel-detail-placeholder\"><span>NO MEDIA</span><strong>TACTICAL PLACEHOLDER</strong></div>";

    elements.intelDetailCard.innerHTML = [
      "<div class=\"intel-detail-head\">",
      "<span class=\"section-label\">Selected intel</span>",
      "<strong>", escapeHtml(item.name || record.definition.label), "</strong>",
      "</div>",
      rowHtml,
      "<p>", escapeHtml(platformDetailDescription(record)), "</p>",
      mediaHtml
    ].join("");
    elements.intelDetailCard.style.setProperty("--detail-color", record.definition.color || "#ffffff");
    elements.intelDetailCard.classList.remove("hidden");
  }

  function hidePlatformDetail() {
    if (elements.intelDetailCard) {
      elements.intelDetailCard.classList.add("hidden");
      elements.intelDetailCard.innerHTML = "";
    }

    hideIntelMapCallout();
  }

  function ensurePrimitivePlatformSelectionRecord(platformEntityId) {
    if (platformEntities[platformEntityId]) {
      return platformEntities[platformEntityId];
    }

    var layerId = platformLayerFromEntityKey(platformEntityId);
    var definition = platformLayerDefinitions[layerId];
    var feed = platformFeeds[layerId];
    var items = feed && Array.isArray(feed.items) ? feed.items : [];

    if (!definition || !items.length || PLATFORM_PRIMITIVE_LAYERS.indexOf(layerId) === -1 || !layerStateManager.isLayerEnabled(layerId)) {
      return null;
    }

    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      var id = platformEntityKey(layerId, item.id || item.name || index);

      if (id !== platformEntityId) {
        continue;
      }

      var sample = samplePlatformFeedItem(layerId, item, platformTime());

      if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) {
        return null;
      }

      var record = createPlatformRecord(layerId, item, sample, index);
      platformEntities[platformEntityId] = record;
      updatePlatformRecord(record, item, sample, index);
      return record;
    }

    return null;
  }

  function selectPlatformEntity(platformEntityId) {
    var record = platformEntities[platformEntityId] || ensurePrimitivePlatformSelectionRecord(platformEntityId);

    if (!record || !record.sample || !layerStateManager.isLayerEnabled(record.layerId)) {
      return;
    }

    clearTrackingSelection();
    selectedPlatformEntityId = platformEntityId;
    window.selectedPlatformEntityId = platformEntityId;
    platformFollowReady = false;
    record.followAnchor = null;
    updatePlatformRecord(record, record.item, record.sample, record.index || 0);
    
    operationalIntelligenceManager.recordAttention(platformEntityId);
    cognitiveGovernanceManager.recordInteraction();

    updatePlatformLayerEntities(record.layerId);

    setTarget({
      name: record.item.name || record.definition.label,
      lat: record.sample.lat,
      lon: record.sample.lon
    });
    dropTargetMarker(record.sample.lat, record.sample.lon);
    showPlatformDetail(record);
    showIntelMapCalloutForRecord(record);

    if (record.definition.type === "camera" && record.item.category !== "cluster") {
      openCameraWindow(record.item);
    } else if (record.definition.type === "camera" && record.item.category === "cluster") {
      showToast("Camera cluster selected. Zooming in to load nearby live feeds.");
    }

    var range = platformFollowRange(record);
    var pitch = platformFollowPitch(record);

    function finishPlatformLock() {
      var activeRecord = platformEntities[platformEntityId];

      if (!activeRecord || selectedPlatformEntityId !== platformEntityId) {
        return;
      }

      platformFollowReady = true;
      activeRecord.followAnchor = null;
      followSelectedPlatformRecord(activeRecord);
    }

    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(record.currentPosition, 1), {
      duration: 1.35,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(pitch), range),
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: finishPlatformLock,
      cancel: finishPlatformLock
    });

    window.setTimeout(finishPlatformLock, 1550);
  }

  function platformFollowRange(record) {
    var baseRange = 130000;
    if (record.definition.type === "satellite") {
      baseRange = (record.layerId === "starlink" || record.layerId === "debris") ? 360000 : 240000;
    } else if (record.definition.type === "camera") {
      baseRange = 72000;
    } else if (record.definition.type === "moving") {
      baseRange = 54000;
    } else if (record.definition.type === "intel") {
      if (record.item.kind === "line" || record.item.kind === "arc") baseRange = 420000;
      else if (record.item.kind === "area" || record.item.kind === "volume") baseRange = 620000;
      else baseRange = 110000;
    }

    if (cognitiveOperationsManager.tension > 0.6) {
      baseRange *= 1.35;
    }

    return baseRange;
  }

  function platformFollowPitch(record) {
    if (record.definition.type === "camera") {
      return -52;
    }

    if (record.definition.type === "satellite") {
      return -28;
    }

    if (record.definition.type === "moving") {
      return -34;
    }

    return -38;
  }

  function followSelectedPlatformRecord(record) {
    if (!viewer || !record || !record.currentPosition) {
      return;
    }

    var transform = Cesium.Transforms.eastNorthUpToFixedFrame(
      record.currentPosition,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Matrix4()
    );

    if (!record.followAnchor) {
      record.followAnchor = true;
      viewer.camera.lookAtTransform(transform, new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(platformFollowPitch(record)),
        platformFollowRange(record)
      ));
    }

    viewer.scene.requestRender();
  }

  function updatePlatformTarget(record, sample) {
    state.target = {
      name: record.item.name || record.definition.label,
      lat: sample.lat,
      lon: sample.lon
    };

    if (targetEntity) {
      targetEntity.position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat);
    }

    updateTargetTelemetry();
  }

  function openCameraWindow(camera) {
    if (!elements.cameraWindow) {
      return;
    }

    clearCameraFeedTimer();
    elements.cameraWindow.classList.remove("hidden");
    elements.cameraTitle.textContent = camera.name || "Camera node";
    elements.cameraMeta.textContent = [
      camera.provider || "Provider unknown",
      camera.category || "camera",
      camera.stream_type || "stream",
      camera.status || "standby",
      camera.stream_mode || "proxy"
    ].join(" / ");

    var cameraId = encodeURIComponent(camera.id || "");
    var staticMode = isStaticHostMode();
    var snapshotUrl = camera.proxy_snapshot_url || camera.snapshot_url || (!staticMode && cameraId ? "/camera/snapshot?id=" + cameraId : "");
    var streamUrl = camera.proxy_stream_url || camera.stream_url || (!staticMode && cameraId ? "/camera/mjpeg?id=" + cameraId : "");
    var streamType = String(camera.stream_type || "").toUpperCase();
    var hasUpstream = Boolean(camera.upstream_stream_url || camera.upstream_snapshot_url);
    var alt = escapeHtml(camera.name || "Camera feed");

    if (!snapshotUrl && !streamUrl) {
      elements.cameraFrame.innerHTML = "<span>Stream proxy framework ready</span>";
      return;
    }

    if (!hasUpstream) {
      renderRefreshingCameraImage(snapshotUrl, alt, "GENERATED LIVE");
    } else if (streamType === "MJPEG" && streamUrl) {
      elements.cameraFrame.innerHTML = [
        "<div class=\"camera-live-shell\">",
        "<img alt=\"", alt, "\" src=\"", escapeHtml(cacheBustUrl(streamUrl)), "\" onerror=\"this.dataset.failed='1'\">",
        "<span class=\"camera-live-badge\">LIVE</span>",
        "<span class=\"camera-live-clock\">UPSTREAM PROXY</span>",
        "</div>"
      ].join("");
    } else if (streamUrl && streamType !== "WEBRTC" && streamType !== "RTSP") {
      elements.cameraFrame.innerHTML = [
        "<div class=\"camera-live-shell\">",
        "<video controls autoplay muted playsinline src=\"", escapeHtml(cacheBustUrl(streamUrl)), "\"></video>",
        "<span class=\"camera-live-badge\">LIVE</span>",
        "<span class=\"camera-live-clock\">UPSTREAM PROXY</span>",
        "</div>"
      ].join("");
      var video = elements.cameraFrame.querySelector("video");
      if (video) {
        video.addEventListener("error", function () {
          renderRefreshingCameraImage(snapshotUrl, alt, "LIVE SNAPSHOT");
        }, { once: true });
      }
    } else {
      renderRefreshingCameraImage(snapshotUrl, alt, "LIVE SNAPSHOT");
    }
  }

  function closeCameraWindow() {
    clearCameraFeedTimer();
    if (elements.cameraWindow) {
      elements.cameraWindow.classList.add("hidden");
      elements.cameraWindow.classList.remove("minimized", "fullscreen");
    }
    
    if (window.CameraNet && CameraNet.state.selectedCamera) {
      CameraNet.state.visibleCameraEntities.forEach(function(entity) {
        if (entity.label) {
          entity.label.show = false;
        }
      });
      CameraNet.state.selectedCamera = null;
    }
  }

  function clearCameraFeedTimer() {
    if (cameraFeedTimer) {
      window.clearInterval(cameraFeedTimer);
      cameraFeedTimer = null;
    }
  }

  function cacheBustUrl(url) {
    if (!url) {
      return "";
    }

    return url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now();
  }

  function renderRefreshingCameraImage(snapshotUrl, alt, modeLabel) {
    if (!snapshotUrl || !elements.cameraFrame) {
      return;
    }

    elements.cameraFrame.innerHTML = [
      "<div class=\"camera-live-shell generated\">",
      "<img id=\"cameraLiveImage\" alt=\"", alt, "\" src=\"", escapeHtml(cacheBustUrl(snapshotUrl)), "\">",
      "<span class=\"camera-live-badge\">LIVE</span>",
      "<span class=\"camera-live-clock\" id=\"cameraLiveClock\">", escapeHtml(modeLabel), "</span>",
      "</div>"
    ].join("");

    cameraFeedTimer = window.setInterval(function () {
      var image = document.getElementById("cameraLiveImage");
      var clock = document.getElementById("cameraLiveClock");

      if (!image || !document.body.contains(image)) {
        clearCameraFeedTimer();
        return;
      }

      image.src = cacheBustUrl(snapshotUrl);
      if (clock) {
        clock.textContent = modeLabel + " / " + new Date().toLocaleTimeString([], { hour12: false });
      }
    }, 1000);
  }

  function initCameraWindowControls() {
    if (!elements.cameraWindow) {
      return;
    }

    if (elements.cameraMinimize) {
      elements.cameraMinimize.addEventListener("click", function () {
        elements.cameraWindow.classList.toggle("minimized");
      });
    }

    if (elements.cameraFullscreen) {
      elements.cameraFullscreen.addEventListener("click", function () {
        elements.cameraWindow.classList.toggle("fullscreen");
        elements.cameraWindow.classList.remove("minimized");
      });
    }

    if (elements.cameraPopout) {
      elements.cameraPopout.addEventListener("click", function () {
        var title = elements.cameraTitle ? elements.cameraTitle.textContent : "Project Orion camera";
        var popup = window.open("", "orion-camera-popout", "width=520,height=380");
        if (!popup) {
          showToast("Popout blocked by browser.");
          return;
        }
        popup.document.write("<title>" + escapeHtml(title) + "</title><body style='margin:0;background:#05070c;color:white;font:14px system-ui;display:grid;place-items:center'>" + (elements.cameraFrame ? elements.cameraFrame.innerHTML : "No feed") + "</body>");
        popup.document.close();
      });
    }

    var dragging = false;
    var offsetX = 0;
    var offsetY = 0;
    var handle = elements.cameraDragHandle || elements.cameraWindow;

    handle.addEventListener("pointerdown", function (event) {
      if (event.target.closest("button")) {
        return;
      }
      dragging = true;
      var rect = elements.cameraWindow.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      elements.cameraWindow.setPointerCapture(event.pointerId);
    });

    elements.cameraWindow.addEventListener("pointermove", function (event) {
      if (!dragging) {
        return;
      }
      elements.cameraWindow.style.left = clamp(event.clientX - offsetX, 8, window.innerWidth - 120) + "px";
      elements.cameraWindow.style.top = clamp(event.clientY - offsetY, 8, window.innerHeight - 80) + "px";
      elements.cameraWindow.style.right = "auto";
      elements.cameraWindow.style.bottom = "auto";
    });

    elements.cameraWindow.addEventListener("pointerup", function (event) {
      dragging = false;
      try {
        elements.cameraWindow.releasePointerCapture(event.pointerId);
      } catch (error) {
      }
    });
  }

  function clearPlatformSelection(message) {
    var previousSelectionId = selectedPlatformEntityId;
    selectedPlatformEntityId = null;
    window.selectedPlatformEntityId = null;
    platformFollowReady = false;
    closeCameraWindow();
    hidePlatformDetail();

    if (previousSelectionId && platformEntities[previousSelectionId]) {
      var previousRecord = platformEntities[previousSelectionId];
      if (previousRecord && PLATFORM_PRIMITIVE_LAYERS.indexOf(previousRecord.layerId) !== -1) {
        removePlatformRecord(previousRecord);
      }
    }

    Object.keys(platformEntities).forEach(function (id) {
      if (platformEntities[id]) {
        platformEntities[id].followAnchor = null;
      }
    });

    Object.keys(platformLayerDefinitions).forEach(function (layerId) {
      if (state.platformLayers[layerId]) {
        updatePlatformLayerEntities(layerId);
      }
    });

    if (viewer && !state.tracking.follow) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    
    if (message !== false) {
      showToast(message || "TRACK LOST");
    }
  }

  function updatePlatformTelemetry() {
    if (!elements.platformLayerCount || !elements.platformFeedStatus) {
      return;
    }

    var enabled = Object.keys(state.platformLayers).filter(function (layerId) {
      return state.platformLayers[layerId];
    });
    var objectCount = enabled.reduce(function (sum, layerId) {
      var feed = platformFeeds[layerId];
      if (PLATFORM_PRIMITIVE_LAYERS.indexOf(layerId) !== -1 && feed && Array.isArray(feed.items)) {
        return sum + feed.items.length;
      }
      return sum + Object.keys(platformEntities).filter(function (id) {
        return platformEntities[id] && platformEntities[id].layerId === layerId;
      }).length;
    }, 0);
    var loading = enabled.filter(function (layerId) {
      return platformFeeds[layerId] && platformFeeds[layerId].status === "loading";
    }).length;
    var online = enabled.filter(function (layerId) {
      return platformFeeds[layerId] && platformFeeds[layerId].status === "online";
    }).length;
    var fallback = enabled.filter(function (layerId) {
      return platformFeeds[layerId] && platformFeeds[layerId].status === "fallback";
    }).length;
    var degraded = enabled.filter(function (layerId) {
      return platformFeeds[layerId] && platformFeeds[layerId].status === "degraded";
    }).length;
    var empty = enabled.filter(function (layerId) {
      return platformFeeds[layerId] && platformFeeds[layerId].status === "empty";
    }).length;
    var error = enabled.filter(function (layerId) {
      var status = platformFeeds[layerId] && platformFeeds[layerId].status;
      return status && ["online", "loading", "fallback", "degraded", "empty", "standby"].indexOf(status) === -1;
    }).length;

    elements.platformLayerCount.textContent = enabled.length + " layers / " + objectCount + " objects";

    if (!enabled.length) {
      elements.platformFeedStatus.textContent = "Standby";
    } else if (loading) {
      elements.platformFeedStatus.textContent = "Loading " + loading + " feed" + (loading === 1 ? "" : "s");
    } else {
      var parts = [];
      if (online) parts.push(online + " online");
      if (degraded) parts.push(degraded + " degraded");
      if (fallback) parts.push(fallback + " fallback");
      if (empty) parts.push(empty + " empty");
      if (error) parts.push(error + " error");
      elements.platformFeedStatus.textContent = (parts.length ? parts.join(" / ") : "0 active") + " / " + enabled.length + " enabled";
    }
    updatePlatformLayerBadges();
    renderIntelEntityList(false);
    if (!legacyTrackingVisualsEnabled) {
      updateTrackingTelemetry(activePlatformTrackingCount(), platformTime());
    }
  }

  function enhancePlatformLayerUi() {
    var grid = document.querySelector(".platform-toggle-grid");

    if (!grid) {
      return;
    }

    var groups = {};
    Object.keys(platformLayerDefinitions).forEach(function (layerId) {
      var definition = platformLayerDefinitions[layerId];
      var control = elements[definition.controlId];
      var label = control && control.closest("label");

      if (!label) {
        return;
      }

      label.dataset.layerId = layerId;
      label.dataset.category = definition.category;
      label.classList.toggle("merged-platform-source", !!mergedPlatformLayerIds[layerId]);

      if (mergedPlatformLayerIds[layerId]) {
        return;
      }

      if (!label.querySelector(".layer-status-dot")) {
        var status = document.createElement("span");
        status.className = "layer-status-dot standby";
        status.title = "standby";
        label.appendChild(status);
      }

      if (!label.querySelector(".layer-count-badge")) {
        var count = document.createElement("span");
        count.className = "layer-count-badge";
        count.textContent = "0";
        label.appendChild(count);
      }

      if (!groups[definition.category]) {
        var group = document.createElement("div");
        group.className = "platform-category";
        group.innerHTML = "<button type=\"button\" class=\"platform-category-toggle\" aria-expanded=\"true\">" + definition.category + "</button><div class=\"platform-category-body\"></div>";
        grid.appendChild(group);
        groups[definition.category] = group.querySelector(".platform-category-body");
        group.querySelector(".platform-category-toggle").addEventListener("click", function () {
          var collapsed = group.classList.toggle("collapsed");
          this.setAttribute("aria-expanded", collapsed ? "false" : "true");
        });
      }

      groups[definition.category].appendChild(label);
    });

    updatePlatformLayerBadges();
  }

  function updatePlatformLayerBadges() {
    Object.keys(platformLayerDefinitions).forEach(function (layerId) {
      var definition = platformLayerDefinitions[layerId];
      var control = elements[definition.controlId];
      var label = control && control.closest("label");
      var status = label && label.querySelector(".layer-status-dot");
      var count = label && label.querySelector(".layer-count-badge");
      var feed = platformFeeds[layerId] || {};
      var itemCount = Array.isArray(feed.items) ? feed.items.length : 0;
      var statusText = state.platformLayers[layerId] ? (feed.status || "loading") : "standby";

      if (count) {
        count.textContent = String(itemCount);
      }

      if (status) {
        status.className = "layer-status-dot " + statusClass(statusText);
        status.title = statusText + (itemCount ? " / " + itemCount + " items" : "");
      }
    });
  }

  function statusClass(status) {
    var text = String(status || "standby").toLowerCase();
    if (text === "online") {
      return "online";
    }
    if (text.indexOf("loading") !== -1) {
      return "loading";
    }
    if (text.indexOf("fallback") !== -1 || text.indexOf("token") !== -1 || text.indexOf("adapter") !== -1) {
      return "fallback";
    }
    if (text.indexOf("error") !== -1 || text.indexOf("offline") !== -1 || text.indexOf("fail") !== -1) {
      return "error";
    }
    if (text.indexOf("empty") !== -1 || text.indexOf("standby") !== -1) {
      return "standby";
    }
    return "fallback";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function activePlatformTrackingCount() {
    var count = 0;
    ["liveAircraft", "liveShips"].concat(orbitalLayerIds).forEach(function (layerId) {
      if (!layerStateManager.isLayerEnabled(layerId) || !trackingFilterMatchesPlatformLayer(layerId)) {
        return;
      }
      var feed = platformFeeds[layerId];
      count += feed && Array.isArray(feed.items) ? feed.items.length : 0;
    });
    return count;
  }

  function addPrimitiveFeedRows(rows) {
    var time = platformTime();

    Object.keys(platformLayerDefinitions).forEach(function (layerId) {
      if (!layerStateManager.isLayerEnabled(layerId) || !trackingFilterMatchesPlatformLayer(layerId)) {
        return;
      }

      var definition = platformLayerDefinitions[layerId];
      var feed = platformFeeds[layerId];
      var items = feed && Array.isArray(feed.items) ? feed.items : [];

      if (!items.length || PLATFORM_PRIMITIVE_LAYERS.indexOf(layerId) === -1) {
        return;
      }

      var limit = orbitalLayerIds.indexOf(layerId) !== -1
        ? Math.min(items.length, 12000)
        : (layerId === "liveAircraft" || layerId === "liveShips" ? Math.min(items.length, 10000) : 1000);
      var category = platformLayerCategoryLabel(layerId, definition);

      items.slice(0, limit).forEach(function (item, index) {
        var id = platformEntityKey(layerId, item.id || item.name || index);

        if (platformEntities[id]) {
          return;
        }

        var sample = samplePlatformFeedItem(layerId, item, time);

        if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) {
          return;
        }

        rows.push({
          id: id,
          kind: "platformPrimitive",
          name: platformItemDisplayName(layerId, item, definition, index),
          category: category,
          status: item.status || sample.status || feed.status || "online",
          source: item.source || item.provider || definition.source,
          lat: sample.lat,
          lon: sample.lon,
          detail: entityDetail(definition.type, item, sample),
          selected: id === selectedPlatformEntityId,
          color: definition.color
        });
      });
    });
  }

  function collectIntelEntityRows() {
    var rows = [];

    Object.keys(platformEntities).forEach(function (id) {
      var record = platformEntities[id];
      if (!record || !state.platformLayers[record.layerId] || !record.sample) {
        return;
      }
      var item = record.item || {};
      rows.push({
        id: id,
        kind: "platform",
        name: item.name || record.definition.label,
        category: record.definition.category || "Intel",
        status: item.status || (platformFeeds[record.layerId] && platformFeeds[record.layerId].status) || "online",
        source: record.definition.source,
        lat: record.sample.lat,
        lon: record.sample.lon,
        detail: entityDetail(record.definition.type, item, record.sample),
        selected: id === selectedPlatformEntityId,
        color: record.definition.color
      });
    });

    addPrimitiveFeedRows(rows);

    if (state.platformLayers.cameras && window.CameraNet && typeof CameraNet.getSelectableCameras === "function") {
      CameraNet.getSelectableCameras().forEach(function (camera) {
        rows.push({
          id: camera.id,
          kind: "cameraNet",
          name: camera.name || "FL511 camera",
          category: "Ground Cameras",
          status: camera.status || (camera.stream_available ? "stream available" : "online"),
          source: camera.provider || "FL511",
          lat: Number(camera.lat),
          lon: Number(camera.lon),
          detail: [
            camera.road || camera.county || "Florida traffic",
            camera.stream_type || "HLS"
          ].filter(Boolean).join(" / "),
          selected: !!camera.selected,
          color: "#ffffff"
        });
      });
    }

    var time = getTrackingTime();
    Object.keys(trackingEntities).forEach(function (id) {
      var record = trackingEntities[id];
      var definition = record && record.definition;
      if (!definition || !trackingVisible(definition)) {
        return;
      }
      var sample = sampleTrackPosition(definition, time);
      rows.push({
        id: id,
        kind: "track",
        name: definition.name,
        category: trackTypeLabel(definition.type),
        status: sample.status || "active",
        source: definition.liveFeed ? "OpenSky ADS-B" : TRACK_SOURCE_LABEL,
        lat: sample.lat,
        lon: sample.lon,
        detail: entityDetail(definition.type, definition, sample),
        selected: id === state.tracking.selectedId,
        color: trackStyle(definition.type).color.toCssColorString()
      });
    });

    return rows;
  }

  function entityDetail(type, item, sample) {
    if (type === "satellite" || type === "sat") {
      return formatAltitude(sample.height) + " / orbital";
    }
    if (type === "air") {
      return formatAltitude(sample.height) + " / HDG " + Math.round(sample.heading || 0);
    }
    if (type === "moving" && (item.category === "aircraft" || String(item.source || "").indexOf("OpenSky") !== -1)) {
      return formatAltitude(sample.height) + " / HDG " + Math.round(sample.heading || 0);
    }
    if (type === "sea" || type === "moving") {
      return "course " + Math.round(sample.heading || 0) + " / sea level";
    }
    if (type === "earthquake") {
      return "M" + (sample.magnitude || 0).toFixed(1) + " / " + Math.round(sample.depth || 0) + " km";
    }
    if (type === "camera") {
      return (item.category || "camera") + " / " + (item.stream_type || "stream");
    }
    if (item.kind === "arc") {
      return "intensity " + Math.round((item.intensity || 0) * 100) + "%";
    }
    return (Number(sample.lat) || 0).toFixed(3) + ", " + (Number(sample.lon) || 0).toFixed(3);
  }

  function renderIntelCategoryChips(rows) {
    if (!elements.intelCategoryChips) {
      return;
    }

    var categories = ["all"].concat(Array.from(new Set(rows.map(function (row) {
      return row.category;
    }))).sort());

    elements.intelCategoryChips.innerHTML = categories.map(function (category) {
      var active = state.intelCategory === category;
      return "<button type=\"button\" class=\"intel-chip " + (active ? "active" : "") + "\" data-category=\"" + escapeHtml(category) + "\">" + escapeHtml(category === "all" ? "All" : category) + "</button>";
    }).join("");
  }

  function renderIntelEntityList(force) {
    if (!elements.intelListPanel || !elements.intelEntityList || !elements.telemetryStack) {
      return;
    }

    var hasPlatformIntel = Object.keys(state.platformLayers).some(function (layerId) {
      return state.platformLayers[layerId];
    });
    var hasTrackingIntel = Object.keys(trackingEntities).some(function (id) {
      var record = trackingEntities[id];
      return record && record.definition && trackingVisible(record.definition);
    });
    var forceIntelList = window._onboardingForceIntelList === true;
    var showIntelList = forceIntelList || hasPlatformIntel || hasTrackingIntel;

    elements.intelListPanel.classList.toggle("hidden", !showIntelList);
    elements.telemetryStack.classList.toggle("hidden", showIntelList);

    if (!showIntelList) {
      if (elements.intelEntityCount) {
        elements.intelEntityCount.textContent = "0 objects";
      }
      elements.intelEntityList.innerHTML = "";
      if (elements.intelCategoryChips) {
        elements.intelCategoryChips.innerHTML = "<button type=\"button\" class=\"intel-chip active\" data-category=\"all\">All</button>";
      }
      return;
    }

    var now = performance.now();
    if (!force && now - lastIntelListRender < 700) {
      return;
    }
    lastIntelListRender = now;

    var rows = collectIntelEntityRows();
    renderIntelCategoryChips(rows);

    var filtered = rows.filter(function (row) {
      var matchesCategory = state.intelCategory === "all" || row.category === state.intelCategory;
      var haystack = [row.name, row.category, row.status, row.source, row.detail].join(" ").toLowerCase();
      return matchesCategory && (!state.intelSearch || haystack.indexOf(state.intelSearch) !== -1);
    });
    var rendered = filtered.slice(0, 1000);

    if (elements.intelEntityCount) {
      elements.intelEntityCount.textContent = filtered.length + " object" + (filtered.length === 1 ? "" : "s");
    }

    if (!rendered.length) {
      elements.intelEntityList.innerHTML = "<div class=\"intel-empty\">No selectable objects match this filter.</div>";
      return;
    }

    elements.intelEntityList.innerHTML = rendered.map(function (row) {
      return [
        "<button type=\"button\" class=\"intel-entity-row " + (row.selected ? "selected" : "") + "\" data-kind=\"" + row.kind + "\" data-id=\"" + escapeHtml(row.id) + "\" style=\"--row-color:" + escapeHtml(row.color) + "\">",
        "<span class=\"intel-row-dot\"></span>",
        "<span class=\"intel-row-main\"><strong>", escapeHtml(row.name), "</strong><small>", escapeHtml(row.detail), "</small></span>",
        "<span class=\"intel-row-meta\"><em>", escapeHtml(row.category), "</em><small>", escapeHtml(row.status), "</small></span>",
        "</button>"
      ].join("");
    }).join("");
  }

  window.refreshOrionIntelList = function () {
    renderIntelEntityList(true);
  };

  function findTrackDefinition(trackId) {
    return trackingDefinitions.find(function (definition) {
      return definition.id === trackId;
    });
  }

  function removeLegacyTrackRecord(record) {
    if (!viewer || !record) {
      return;
    }

    [record.trail, record.model, record.billboard, record.point, record.label].concat(record.subEntities || []).forEach(function (entity) {
      if (!entity) {
        return;
      }
      try {
        viewer.entities.remove(entity);
      } catch (error) {
      }
    });
  }

  function clearLegacyTrackingEntities() {
    Object.keys(trackingEntities).forEach(function (id) {
      removeLegacyTrackRecord(trackingEntities[id]);
    });
    trackingEntities = {};

    if (state.tracking.selectedId) {
      state.tracking.selectedId = null;
      state.tracking.follow = false;
      state.tracking.followReady = false;
    }
  }

  function trackingVisible(definition) {
    if (!legacyTrackingVisualsEnabled) {
      return false;
    }
    return state.tracking[definition.type] && (state.tracking.filter === "all" || state.tracking.filter === definition.type);
  }

  function buildTrackTrail(definition, time, style) {
    if (definition.liveHistory && definition.liveHistory.length) {
      return definition.liveHistory.map(function (sample) {
        return Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height);
      });
    }

    var positions = [];
    var sampleCount = style.trailSamples;
    var currentSample = sampleTrackPosition(definition, time);

    for (var index = sampleCount - 1; index >= 0; index--) {
      var offsetHours = style.trailHours * (index / Math.max(1, sampleCount - 1));
      var sample = sampleTrackPosition(definition, new Date(time.getTime() - offsetHours * MS_PER_HOUR));

      if (definition.type !== "sat") {
        if (sample.cycle !== currentSample.cycle || sample.routeProgress > currentSample.routeProgress + 0.001) {
          continue;
        }
      }

      positions.push(Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height));
    }

    if (!positions.length) {
      positions.push(Cesium.Cartesian3.fromDegrees(currentSample.lon, currentSample.lat, currentSample.height));
    }

    return positions;
  }

  function headingOrientation(lon, lat, headingDeg) {
    var hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(headingDeg),
      0,
      0
    );
    return Cesium.Transforms.headingPitchRollQuaternion(
      Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      hpr
    );
  }

  function createTrackRecord(definition) {
    var style = trackStyle(definition.type);
    var sample = sampleTrackPosition(definition, getTrackingTime());
    var position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height);
    var labelCondition = new Cesium.DistanceDisplayCondition(0, definition.type === "sat" ? 12000000 : 7200000);
    var modelCondition = new Cesium.DistanceDisplayCondition(0, style.modelMaxDistance);
    var billboardCondition = new Cesium.DistanceDisplayCondition(0, style.billboardMaxDistance);

    var currentPosition = Cesium.Cartesian3.clone(position);
    var targetPosition  = Cesium.Cartesian3.clone(position);

    var positionProperty = new Cesium.CallbackPositionProperty(function () {
      return currentPosition;
    }, false);

    var currentOrientation = headingOrientation(sample.lon, sample.lat, sample.heading);
    var orientationProperty = new Cesium.CallbackProperty(function () {
      return currentOrientation;
    }, false);

    var trail = viewer.entities.add({
      name: definition.name + " track history",
      polyline: {
        positions: buildTrackTrail(definition, getTrackingTime(), style),
        width: style.trailWidth,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.18,
          color: style.trailColor.withAlpha(style.trailAlpha)
        })
      }
    });

    var modelEntity;
    var subEntities = [];
    if (definition.type === "air") {
      modelEntity = viewer.entities.add({
        name: definition.name,
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        ellipsoid: {
          radii: new Cesium.Cartesian3(360, 2800, 260),
          material: style.color.withAlpha(0.92),
          outline: false,
          distanceDisplayCondition: modelCondition,
          slicePartitions: 16,
          stackPartitions: 8
        }
      });
      var wingsEntity = viewer.entities.add({
        name: definition.name + " wings",
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        ellipsoid: {
          radii: new Cesium.Cartesian3(8200, 520, 90),
          material: style.color.withAlpha(0.80),
          outline: false,
          distanceDisplayCondition: modelCondition,
          slicePartitions: 14,
          stackPartitions: 4
        }
      });
      wingsEntity.orionTrackId = definition.id;
      subEntities.push(wingsEntity);
      var tailEntity = viewer.entities.add({
        name: definition.name + " tail assembly",
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        box: {
          dimensions: new Cesium.Cartesian3(1700, 900, 980),
          material: style.color.withAlpha(0.74),
          outline: false,
          distanceDisplayCondition: modelCondition
        }
      });
      tailEntity.orionTrackId = definition.id;
      subEntities.push(tailEntity);
    } else if (definition.type === "sat") {
      modelEntity = viewer.entities.add({
        name: definition.name,
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        box: {
          dimensions: new Cesium.Cartesian3(5600, 4200, 2600),
          material: style.color.withAlpha(0.9),
          outline: false,
          distanceDisplayCondition: modelCondition
        }
      });
      var panelEntity = viewer.entities.add({
        name: definition.name + " panels",
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        box: {
          dimensions: new Cesium.Cartesian3(36000, 3600, 420),
          material: Cesium.Color.fromCssColorString("#2a4a8a").withAlpha(0.85),
          outline: false,
          distanceDisplayCondition: modelCondition
        }
      });
      panelEntity.orionTrackId = definition.id;
      subEntities.push(panelEntity);
      var antennaEntity = viewer.entities.add({
        name: definition.name + " antenna",
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        ellipsoid: {
          radii: new Cesium.Cartesian3(1200, 1200, 260),
          material: Cesium.Color.WHITE.withAlpha(0.68),
          outline: false,
          distanceDisplayCondition: modelCondition,
          slicePartitions: 16,
          stackPartitions: 6
        }
      });
      antennaEntity.orionTrackId = definition.id;
      subEntities.push(antennaEntity);
    } else {
      modelEntity = viewer.entities.add({
        name: definition.name,
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        ellipsoid: {
          radii: new Cesium.Cartesian3(620, 3800, 280),
          material: style.color.withAlpha(0.88),
          outline: false,
          distanceDisplayCondition: modelCondition,
          slicePartitions: 16,
          stackPartitions: 6
        }
      });
      var deckEntity = viewer.entities.add({
        name: definition.name + " deck",
        position: positionProperty,
        orientation: orientationProperty,
        show: false,
        box: {
          dimensions: new Cesium.Cartesian3(760, 2100, 360),
          material: Cesium.Color.WHITE.withAlpha(0.42),
          outline: false,
          distanceDisplayCondition: modelCondition
        }
      });
      deckEntity.orionTrackId = definition.id;
      subEntities.push(deckEntity);
    }

    var billboard = viewer.entities.add({
      name: definition.name + " icon",
      position: positionProperty,
      billboard: {
        image: style.icon,
        scale: style.iconScale * 0.7,
        rotation: Cesium.Math.toRadians(-sample.heading),
        alignedAxis: Cesium.Cartesian3.ZERO,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        distanceDisplayCondition: billboardCondition,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    if (billboard.billboard) {
      safeAssignBillboard(billboard.billboard, style.icon);
    }

    var point = viewer.entities.add({
      name: definition.name + " beacon",
      position: positionProperty,
      billboard: {
        image: markerIcon("soft-dot"),
        scale: clamp(style.pointSize / 24, 0.18, 0.28),
        color: style.color.withAlpha(0.94),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    if (point.billboard) {
      safeAssignBillboard(point.billboard, markerIcon("soft-dot"));
    }

    var label = viewer.entities.add({
      name: definition.name + " label",
      position: positionProperty,
      label: {
        text: definition.name + "\n" + trackTypeLabel(definition.type),
        font: "11px Inter, ui-sans-serif, system-ui, sans-serif",
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: style.color.withAlpha(0.92),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.82),
        outlineWidth: 4,
        pixelOffset: new Cesium.Cartesian2(0, -28),
        distanceDisplayCondition: labelCondition,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    [trail, modelEntity, billboard, point, label].forEach(function (entity) {
      entity.orionTrackId = definition.id;
    });

    return {
      definition: definition,
      style: style,
      trail: trail,
      model: modelEntity,
      billboard: billboard,
      point: point,
      label: label,
      subEntities: subEntities,
      currentPosition: currentPosition,
      targetPosition: targetPosition,
      currentOrientation: currentOrientation,
      followAnchor: null
    };
  }

  function updateTrackRecord(record, time, visible, trailKey) {
    var definition = record.definition;
    var sample = sampleTrackPosition(definition, time);
    var position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height);
    var selected = definition.id === state.tracking.selectedId;
    var labelText = definition.name + "\n" + (selected ? "Selected " : "") + trackTypeLabel(definition.type);

    if (sample.status && selected) {
      labelText += " / " + sample.status;
    }

    var position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height);
    Cesium.Cartesian3.clone(position, record.targetPosition);

    var newOrientation = headingOrientation(sample.lon, sample.lat, sample.heading);
    Cesium.Quaternion.clone(newOrientation, record.currentOrientation);

    record.billboard.billboard.rotation = Cesium.Math.toRadians(-sample.heading);
    record.billboard.billboard.scale = selected ? record.style.iconScale * 0.85 : record.style.iconScale * 0.7;

    record.point.billboard.color = (selected ? Cesium.Color.WHITE : record.style.color).withAlpha(0.94);
    record.point.billboard.scale = selected ? clamp(record.style.pointSize / 20, 0.22, 0.34) : clamp(record.style.pointSize / 24, 0.18, 0.28);
    record.label.label.text = labelText;
    record.label.label.fillColor = (selected ? Cesium.Color.WHITE : record.style.color).withAlpha(selected ? 1 : 0.92);

    var modelVisible = visible && selected;
    record.model.show = modelVisible;
    record.subEntities.forEach(function (e) { e.show = modelVisible; });

    if (selected) {
      updateTrackedTarget(definition, sample);
      if (state.tracking.follow && state.tracking.followReady) {
        followSelectedTrack(record, sample);
      }
    }

    if (visible && record.lastTrailKey !== trailKey) {
      record.trail.polyline.positions = buildTrackTrail(definition, time, record.style);
      record.lastTrailKey = trailKey;
    }

    record.trail.show = visible;
    record.billboard.show = visible && selected;
    record.point.show = visible;
    record.label.show = visible;
  }

  function updateTrackingLayer(force) {
    if (!viewer) {
      return;
    }

    var time = getTrackingTime();

    if (!legacyTrackingVisualsEnabled) {
      if (Object.keys(trackingEntities).length) {
        clearLegacyTrackingEntities();
      }
      updateTrackingTelemetry(activePlatformTrackingCount(), time);
      if (state.tracking.live) {
        updateTimelineLabels();
      }
      viewer.scene.requestRender();
      return;
    }

    maybeFetchLiveAircraft();

    var trailBucketHours = state.tracking.live ? 0.25 : state.speed >= 12 ? 6 : state.speed >= 6 ? 3 : state.speed >= 1 ? 1 : 0.25;
    var trailKey = Math.floor(time.getTime() / (trailBucketHours * MS_PER_HOUR));
    var trackingKey = [
      state.tracking.live ? "live:" + Math.floor(time.getTime() / 1000) : "timeline:" + Math.floor(state.date.getTime()),
      state.tracking.filter,
      state.tracking.air ? "air" : "noair",
      state.tracking.sat ? "sat" : "nosat",
      state.tracking.sea ? "sea" : "nosea",
      state.tracking.selectedId || "none"
    ].join("|");

    if (!force && !state.tracking.dirty && trackingKey === lastTrackingKey) {
      updateTrackingTelemetry(null, time);
      return;
    }

    lastTrackingKey = trackingKey;
    state.tracking.dirty = false;

    var visibleCount = 0;

    trackingDefinitions.forEach(function (definition) {
      if (!trackingEntities[definition.id]) {
        trackingEntities[definition.id] = createTrackRecord(definition);
      }

      var visible = trackingVisible(definition);

      if (visible) {
        visibleCount += 1;
      }

      updateTrackRecord(trackingEntities[definition.id], time, visible, trailKey);
    });

    updateTrackingTelemetry(visibleCount, time);
    if (state.tracking.live) {
      updateTimelineLabels();
    }
    viewer.scene.requestRender();
  }

  function updateTrackingTelemetry(visibleCount, time) {
    if (!elements.trackingModeLabel || !elements.trackingCount || !elements.trackingClock) {
      return;
    }

    var activeCount = visibleCount;

    if (activeCount === null || activeCount === undefined) {
      activeCount = legacyTrackingVisualsEnabled ? trackingDefinitions.filter(trackingVisible).length : activePlatformTrackingCount();
    }

    elements.trackingModeLabel.textContent = state.tracking.follow ? (state.tracking.live ? "Live follow" : "Timeline follow") : state.tracking.live ? "Live mode" : "Timeline sync";
    if (elements.trackingSource) {
      elements.trackingSource.textContent = trackingSourceLabel();
    }
    elements.trackingCount.textContent = legacyTrackingVisualsEnabled
      ? activeCount + " / " + trackingDefinitions.length
      : activeCount + " real";
    elements.trackingClock.textContent = state.tracking.live ? readableLiveDateTime(time || getTrackingTime()) : readableDateTime(time || getTrackingTime());
    renderIntelEntityList(false);
  }

  function initTrackingLayer() {
    if (!viewer) {
      return;
    }

    updateTrackingLayer(true);
    trackingTimer = window.setInterval(function () {
      updateTrackingLayer(false);
    }, 1000);
  }

  function maybeFetchLiveAircraft() {
    if (!state.tracking.live || !state.tracking.air || liveAircraftFetchPending) {
      return;
    }

    var now = Date.now();

    if (now - lastLiveAircraftFetch < 30000) {
      return;
    }

    liveAircraftFetchPending = true;
    lastLiveAircraftFetch = now;

    fetchJsonEndpoint("/live/aircraft")
      .then(applyLiveAircraftData)
      .catch(function () {
        liveAircraftActive = false;
        updateTrackingTelemetry(null, getTrackingTime());
      })
      .finally(function () {
        liveAircraftFetchPending = false;
      });
  }

  function applyLiveAircraftData(payload) {
    var states = Array.isArray(payload.states) ? payload.states : [];

    liveAircraftActive = states.length > 0;

    if (!states.length) {
      updateTrackingTelemetry(null, getTrackingTime());
      return;
    }

    states.slice(0, 80).forEach(function (aircraft) {
      var id = "air-live-" + String(aircraft.icao24 || aircraft.callsign || "").toLowerCase().replace(/[^a-z0-9-]/g, "");

      if (id === "air-live-") {
        return;
      }

      var definition = findTrackDefinition(id);
      var altitude = Number(aircraft.altitude);
      var sample = {
        lon: Number(aircraft.lon),
        lat: Number(aircraft.lat),
        height: Number.isFinite(altitude) ? Math.max(altitude, 900) : 9600,
        heading: Number.isFinite(Number(aircraft.heading)) ? Number(aircraft.heading) : 0,
        active: !aircraft.onGround,
        cycle: 0,
        routeProgress: 1,
        status: aircraft.onGround ? "Ground" : "Airborne"
      };

      if (!Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) {
        return;
      }

      if (!definition) {
        definition = {
          id: id,
          type: "air",
          name: String(aircraft.callsign || aircraft.icao24 || "LIVE AIRCRAFT").trim().slice(0, 18),
          detail: "OpenSky live ADS-B",
          liveFeed: true,
          livePosition: sample,
          liveHistory: []
        };
        trackingDefinitions.push(definition);
      }

      definition.name = String(aircraft.callsign || aircraft.icao24 || definition.name).trim().slice(0, 18);
      definition.detail = aircraft.country ? "OpenSky ADS-B / " + aircraft.country : "OpenSky live ADS-B";
      definition.livePosition = sample;
      definition.lastSeen = Date.now();
      definition.liveHistory = definition.liveHistory || [];
      definition.liveHistory.push(sample);

      if (definition.liveHistory.length > 24) {
        definition.liveHistory = definition.liveHistory.slice(definition.liveHistory.length - 24);
      }
    });

    state.tracking.dirty = true;
    updateTrackingLayer(true);
    updateTrackingTelemetry(null, getTrackingTime());
  }

  function trackingSourceLabel() {
    if (!legacyTrackingVisualsEnabled) {
      return "OpenSky / CelesTrak / AIS platform feeds";
    }
    return liveAircraftActive ? "OpenSky aircraft + synthetic sea/orbit" : TRACK_SOURCE_LABEL;
  }

  function setTrackFilter(filter) {
    state.tracking.filter = filter;
    state.intelCategory = "all";
    state.tracking.dirty = true;
    if (selectedPlatformEntityId) {
      var selectedLayerId = platformLayerFromEntityKey(selectedPlatformEntityId);
      if (isTrackingDomainLayer(selectedLayerId) && !trackingFilterMatchesPlatformLayer(selectedLayerId)) {
        clearPlatformSelection("TRACK FILTERED");
      }
    }
    syncTrackingControls();
    updateTrackingLayer(true);
    refreshPlatformLayersForLOD();
    renderIntelEntityList(true);
  }

  function setLiveMode(enabled) {
    state.tracking.live = enabled;
    state.tracking.dirty = true;

    if (enabled) {
      setPlaying(false);
      setDate(maxDate, true);
      ["air", "sat", "sea"].forEach(function (type) {
        if (state.tracking[type]) {
          setTrackingDomain(type, true);
        }
      });
    }

    syncTrackingControls();
    updateTrackingLayer(true);
    updatePlatformSystems(false);
    updateTimelineLabels();
    showToast(enabled ? "Live tracking clock engaged." : "Tracking synced to historical timeline.");
  }

  function selectTrackingObject(trackId) {
    var definition = findTrackDefinition(trackId);

    if (!definition) {
      return;
    }

    clearPlatformSelection(false);

    var sample = sampleTrackPosition(definition, getTrackingTime());
    var style = trackStyle(definition.type);
    var target = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height);
    var offset = new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(sample.heading),
      Cesium.Math.toRadians(style.followPitch),
      style.followRange
    );

    state.tracking.selectedId = trackId;
    state.tracking.follow = true;
    state.tracking.followReady = false;
    state.tracking.dirty = true;
    setTarget({
      name: definition.name + " / " + definition.detail,
      lat: sample.lat,
      lon: sample.lon
    });
    dropTargetMarker(sample.lat, sample.lon);
    updateTrackingLayer(true);

    function finishLock() {
      state.tracking.followReady = true;
      var record = trackingEntities[trackId];
      if (record) {
        record.followAnchor = null;
        followSelectedTrack(record, sample);
      }
    }

    if (typeof viewer.camera.flyToBoundingSphere === "function") {
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
        duration: 1.45,
        offset: offset,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        complete: finishLock
      });
    } else {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height + style.followRange),
        duration: 1.75,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        orientation: {
          heading: Cesium.Math.toRadians(sample.heading),
          pitch: Cesium.Math.toRadians(style.followPitch),
          roll: 0
        },
        complete: finishLock
      });
    }

    showToast(definition.name + " locked. Camera follow enabled.");
  }

  function followSelectedTrack(record, sample) {
    if (!viewer || !record || !sample) {
      return;
    }

    var entityPos = record.currentPosition;

    var enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(
      entityPos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Matrix4()
    );

    if (!record.followAnchor) {
      record.followAnchor = true;

      var style = record.style;
      var rangeM = style.followRange;
      var pitchRad = Cesium.Math.toRadians(style.followPitch);

      var hpr = new Cesium.HeadingPitchRange(0, pitchRad, rangeM);
      viewer.camera.lookAtTransform(enuTransform, hpr);
    }

    viewer.scene.requestRender();
  }

  function updateTrackedTarget(definition, sample) {
    state.target = {
      name: definition.name + " / " + definition.detail,
      lat: sample.lat,
      lon: sample.lon
    };

    if (targetEntity) {
      targetEntity.position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat);
    }

    updateTargetTelemetry();
  }

  function clearTrackingSelection() {
    if (state.tracking.selectedId && trackingEntities[state.tracking.selectedId]) {
      trackingEntities[state.tracking.selectedId].followAnchor = null;
    }

    state.tracking.selectedId = null;
    state.tracking.follow = false;
    state.tracking.followReady = false;
    state.tracking.dirty = true;
    clearPlatformSelection();

    if (viewer) {
      viewer.trackedEntity = undefined;
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    updateTrackingLayer(true);
  }

  function initViewer() {
    if (!window.Cesium) {
      showToast("CesiumJS did not load. Check network access to the CDN.");
      return;
    }

    if (Cesium.RequestScheduler) {
      Cesium.RequestScheduler.throttleRequests = true;
      Cesium.RequestScheduler.maximumRequests = 32;
      Cesium.RequestScheduler.maximumRequestsPerServer = 8;
    }

    viewer = new Cesium.Viewer("cesiumContainer", {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      creditContainer: elements.cesiumCredit,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      shouldAnimate: true,
      timeline: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider()
    });

    viewer.imageryLayers.removeAll(true);
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#05070c");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.maximumScreenSpaceError = 1.05;
    if (typeof viewer.scene.globe.tileCacheSize === "number") {
      viewer.scene.globe.tileCacheSize = 1500;
    }
    if (typeof viewer.scene.globe.preloadAncestors === "boolean") {
      viewer.scene.globe.preloadAncestors = true;
    }
    if (typeof viewer.scene.globe.preloadSiblings === "boolean") {
      viewer.scene.globe.preloadSiblings = true;
    }
    if (typeof viewer.scene.globe.loadingDescendantLimit === "number") {
      viewer.scene.globe.loadingDescendantLimit = 40;
    }
    viewer.scene.highDynamicRange = true;

    viewer.scene.postRender.addEventListener(function() {
      diagnosticsManager.updateFPS();
    });

    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }

    if (viewer.scene.fog) {
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.00008;
    }

    viewer.camera.setView({
      destination: homeRectangle()
    });

    syncImagerySplitMode();

    window.viewer = viewer;

    installGlobeClickHandler();
    installCameraTelemetry();
    installFallbackBaseLayer();
    installStreetDetailLayer();
    installImageryPrewarm();
    installImageryHealthMonitor();
    tryEnableIonTerrain();
    installTrackingFollowLoop();
    
    lodManager = new LODManager(viewer);
    cullingManager = new CullingManager(viewer);
    
    lodManager.subscribe(function(level, height) {
      console.log('LOD changed to:', level, 'at height:', Math.round(height), 'm');
      refreshPlatformLayersForLOD();
    });
    
    viewer.camera.moveEnd.addEventListener(function() {
      if (lodManager) {
        lodManager.update();
      }
    });
    
    viewer.scene.preRender.addEventListener(function(scene, time) {
      if (cullingManager) {
        cullingManager.update(time.secondsOfDay * 1000);
      }
    });
    
    intelCalloutPosScratch = new Cesium.Cartesian2();
    viewer.scene.postRender.addEventListener(syncIntelMapCallout);

    window.addEventListener("resize", function () {
      if (viewer) {
        syncImagerySplitMode();
      }
    });
    
    if (window.OrionLoadingManager) {
      window.OrionLoadingManager.markCesiumReady();
    }
    
    var imageryCheckAttempts = 0;
    var imageryCheckInterval = setInterval(function() {
      imageryCheckAttempts++;
      
      var hasImagery = viewer.imageryLayers.length > 0;
      var tilesLoading = viewer.scene.globe._surface._tilesToRender && 
                        viewer.scene.globe._surface._tilesToRender.length > 0;
      
      if ((hasImagery && tilesLoading) || imageryCheckAttempts >= 30) {
        clearInterval(imageryCheckInterval);
        syncImagerySplitMode();
        window.setTimeout(syncImagerySplitMode, 400);

        if (window.OrionLoadingManager) {
          window.OrionLoadingManager.markImageryReady();
        }
        
        setTimeout(function () {
          if (window.OrionLoadingManager && typeof window.OrionLoadingManager.markEntitiesReady === "function") {
            window.OrionLoadingManager.markEntitiesReady();
          }
        }, 1200);
      }
    }, 200);
  }

  function initializeCameraNet() {
    if (!window.CameraNet) {
      console.warn("CameraNet not available");
      return;
    }

    var toggle = document.getElementById("platformCameras");
    if (!toggle) {
      console.warn("Camera toggle not found");
      return;
    }

    if (toggle.checked) {
      setPlatformLayer("cameras", true);
    }
  }

  function installFallbackBaseLayer() {
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1628");

    if (Cesium.UrlTemplateImageryProvider) {
      fallbackBaseLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: "/esri/tile/{z}/{y}/{x}",
        minimumLevel: 0,
        maximumLevel: 12,
        credit: "Esri World Imagery fallback",
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        rectangle: Cesium.Rectangle.fromDegrees(-180, -85.05112878, 180, 85.05112878)
      }), 0);
      fallbackBaseLayer.alpha = 0.68;
      fallbackBaseLayer.brightness = 0.72;
      fallbackBaseLayer.contrast = 1.02;
      fallbackBaseLayer.saturation = 0.82;
      fallbackBaseLayer.splitDirection = Cesium.SplitDirection.NONE;
      setImageryLayerLinearSampling(fallbackBaseLayer);
    }

    viewer.scene.requestRender();
  }

    function installTrackingFollowLoop() {
      var scratchTransform = new Cesium.Matrix4();
      var scratchInverse   = new Cesium.Matrix4();
      var scratchOffset    = new Cesium.Cartesian3();
      var scratchLerp      = new Cesium.Cartesian3();

      viewer.scene.postRender.addEventListener(function () {
        var frameNow = performance.now();
        if (frameNow - lastPlatformMotionFrame > 240) {
          lastPlatformMotionFrame = frameNow;
          refreshPlatformMotionTargets();
        }

        var LERP = visualCohesionManager.getInterpolationFactor();

        var ids = Object.keys(trackingEntities);
        for (var i = 0; i < ids.length; i++) {
          var rec = trackingEntities[ids[i]];
          if (!rec || !rec.targetPosition) continue;

          Cesium.Cartesian3.lerp(rec.currentPosition, rec.targetPosition, LERP, scratchLerp);
          Cesium.Cartesian3.clone(scratchLerp, rec.currentPosition);
          
          visualCohesionManager.applyCinematicFocus(rec, rec.id === selectedPlatformEntityId);
        }

        var platformIds = Object.keys(platformEntities);
        for (var p = 0; p < platformIds.length; p++) {
          var platformRecord = platformEntities[platformIds[p]];
          if (!platformRecord || !platformRecord.targetPosition) continue;

          var projectionSec = visualCohesionManager.getPredictiveFactor(platformRecord.layerId);
          if (projectionSec > 0 && platformRecord.sample && platformRecord.sample.heading) {
          }

          Cesium.Cartesian3.lerp(platformRecord.currentPosition, platformRecord.targetPosition, LERP, scratchLerp);
          Cesium.Cartesian3.clone(scratchLerp, platformRecord.currentPosition);
          
          visualCohesionManager.applyCinematicFocus(platformRecord, platformRecord.id === selectedPlatformEntityId);
        }

        applyPlatformCulling();
        adaptiveIntelligenceManager.update();
        operationalIntelligenceManager.update();
        cognitiveOperationsManager.update();
        cognitiveGovernanceManager.update();
        stabilityManager.update();

        if (state.tracking.follow && state.tracking.followReady && state.tracking.selectedId) {
        var record = trackingEntities[state.tracking.selectedId];
        if (!record || !record.followAnchor) {
          clearTrackingSelection();
          return;
        }

        Cesium.Transforms.eastNorthUpToFixedFrame(
          record.currentPosition,
          Cesium.Ellipsoid.WGS84,
          scratchTransform
        );

        Cesium.Matrix4.inverse(scratchTransform, scratchInverse);
        Cesium.Matrix4.multiplyByPoint(
          scratchInverse,
          viewer.camera.positionWC,
          scratchOffset
        );

        viewer.camera.lookAtTransform(scratchTransform, scratchOffset);
        return;
      }

      if (!selectedPlatformEntityId || !platformFollowReady) {
        return;
      }

      var selectedPlatformRecord = platformEntities[selectedPlatformEntityId];
      if (!selectedPlatformRecord ||
          !selectedPlatformRecord.followAnchor ||
          !selectedPlatformRecord.currentPosition ||
          !layerStateManager.isLayerEnabled(selectedPlatformRecord.layerId) ||
          (selectedPlatformRecord.entity && !viewer.entities.contains(selectedPlatformRecord.entity))) {
        clearPlatformSelection("TRACK LOST");
        return;
      }

      Cesium.Transforms.eastNorthUpToFixedFrame(
        selectedPlatformRecord.currentPosition,
        Cesium.Ellipsoid.WGS84,
        scratchTransform
      );

      Cesium.Matrix4.inverse(scratchTransform, scratchInverse);
      Cesium.Matrix4.multiplyByPoint(
        scratchInverse,
        viewer.camera.positionWC,
        scratchOffset
      );

      viewer.camera.lookAtTransform(scratchTransform, scratchOffset);
    });
  }

  function installStreetDetailLayer() {
    if (!Cesium.UrlTemplateImageryProvider) {
      return;
    }

    streetDetailLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: isStaticHostMode()
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "/esri/tile/{z}/{y}/{x}",
      minimumLevel: 0,
      maximumLevel: 19,
      credit: "Esri World Imagery",
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      rectangle: Cesium.Rectangle.fromDegrees(-180, -85.05112878, 180, 85.05112878)
    }));

    streetDetailLayer.alpha = 0;
    streetDetailLayer.show = false;
    streetDetailLayer.brightness = 0.94;
    streetDetailLayer.contrast = 1.12;
    streetDetailLayer.saturation = 1.02;
    streetDetailLayer.splitDirection = Cesium.SplitDirection.NONE;
    setImageryLayerLinearSampling(streetDetailLayer);

    if (streetDetailLayer.imageryProvider && streetDetailLayer.imageryProvider.errorEvent) {
      streetDetailLayer.imageryProvider.errorEvent.addEventListener(function (tileProviderError) {
        tileProviderError.retry = tileProviderError.timesRetried < 1;
        
        if (tileProviderError.timesRetried === 0) {
          console.warn("ESRI tile error (will retry once):", tileProviderError.message);
        }
      });
    }

    streetRoadsLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: isStaticHostMode()
        ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        : "/osm/{z}/{x}/{y}.png",
      minimumLevel: 0,
      maximumLevel: 19,
      credit: "(c) OpenStreetMap contributors"
    }));

    streetRoadsLayer.alpha = 0;
    streetRoadsLayer.show = false;
    streetRoadsLayer.brightness = 0.96;
    streetRoadsLayer.contrast = 1.08;
    streetRoadsLayer.saturation = 0.85;
    streetRoadsLayer.splitDirection = Cesium.SplitDirection.NONE;
    setImageryLayerLinearSampling(streetRoadsLayer);

    if (streetRoadsLayer.imageryProvider && streetRoadsLayer.imageryProvider.errorEvent) {
      streetRoadsLayer.imageryProvider.errorEvent.addEventListener(function (tileProviderError) {
        tileProviderError.retry = tileProviderError.timesRetried < 1;
      });
    }

    raiseOperationalLayers();
  }

  function tryEnableIonTerrain() {
    var token = window.CESIUM_ION_TOKEN || window.localStorage.getItem("orion:cesiumIonToken");

    if (!token || !Cesium.createWorldTerrainAsync) {
      return;
    }

    Cesium.Ion.defaultAccessToken = token;
    Cesium.createWorldTerrainAsync()
      .then(function (terrainProvider) {
        viewer.terrainProvider = terrainProvider;
      })
      .catch(function () {
        showToast("Cesium ion terrain could not be enabled. Continuing with the satellite globe.");
      });
  }

  function createGibsProvider(definition, date) {
    var tileDate = definition.timed ? effectiveGibsDate(date) : date;
    var timeSegment = definition.timed ? formatDate(tileDate) : "default";
    var root = definition.root || GIBS_ROOT;
    var url = [
      root,
      definition.layer,
      "default",
      timeSegment,
      definition.matrixSet,
      "{z}",
      "{y}",
      "{x}." + definition.extension + "?orionTileFix=20260520"
    ].join("/");

    var provider = new Cesium.UrlTemplateImageryProvider({
      url: url,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: definition.maximumLevel,
      credit: "NASA GIBS"
    });

    if (provider.errorEvent) {
      provider.errorEvent.addEventListener(function (tileProviderError) {
        tileProviderError.retry = tileProviderError.timesRetried < 1;
      });
    }

    return provider;
  }

  function syncImagerySplitMode() {
    if (!viewer || !viewer.scene) {
      return;
    }

    viewer.scene.splitPosition = state.compareMode ? state.splitPosition : 1.0;

    if (viewer.imageryLayers && viewer.imageryLayers._layers) {
      viewer.imageryLayers._layers.forEach(function (layer) {
        if (!state.compareMode) {
          layer.splitDirection = Cesium.SplitDirection.NONE;
        }
      });
    }

    if (typeof viewer.resize === "function") {
      viewer.resize();
    }

    viewer.scene.requestRender();
  }

  function addLayer(key, date, splitDirection, fadeAlpha) {
    var definition = layerDefinitions[key];
    var imageryLayer = viewer.imageryLayers.addImageryProvider(createGibsProvider(definition, date));

    imageryLayer.orionKey = key;
    imageryLayer.orionTargetAlpha = definition.alpha;
    imageryLayer.orionFadeAlpha = fadeAlpha === undefined ? 1 : fadeAlpha;
    imageryLayer.brightness = definition.brightness;
    imageryLayer.contrast = definition.contrast;
    imageryLayer.saturation = definition.saturation;

    if (splitDirection === Cesium.SplitDirection.LEFT) {
      imageryLayer.splitDirection = Cesium.SplitDirection.LEFT;
    } else if (splitDirection === Cesium.SplitDirection.RIGHT) {
      imageryLayer.splitDirection = Cesium.SplitDirection.RIGHT;
    } else {
      imageryLayer.splitDirection = Cesium.SplitDirection.NONE;
    }

    setImageryLayerLinearSampling(imageryLayer);
    applyLayerDisplayAlpha(imageryLayer);
    return imageryLayer;
  }

  function cancelImageryTransition() {
    imageryTransitionToken++;
    window.cancelAnimationFrame(imageryFadeFrame);
    window.clearTimeout(swapCleanupTimer);
    stagedImageryLayers.forEach(function (layer) {
      if (layer && imageryLayerExists(layer)) {
        viewer.imageryLayers.remove(layer, true);
      }
    });
    stagedImageryLayers = [];
  }

  function findBaseImageryLayer() {
    var index;
    var layers = activeImageryLayers.concat(stagedImageryLayers);

    for (index = 0; index < layers.length; index++) {
      var key = layers[index].orionKey;
      if ((key === "trueColor" || key === "cleanEarth") && imageryLayerExists(layers[index])) {
        return layers[index];
      }
    }

    if (baseImageryLayer && imageryLayerExists(baseImageryLayer)) {
      return baseImageryLayer;
    }

    return null;
  }

  function buildImageryLayerList(fadeAlpha) {
    var layers = [];
    var fullAlpha = fadeAlpha === undefined ? 1 : fadeAlpha;
    var rightSplit = state.compareMode ? Cesium.SplitDirection.RIGHT : Cesium.SplitDirection.NONE;

    if (state.compareMode) {
      layers.push(addLayer("trueColor", state.compareDate, Cesium.SplitDirection.LEFT, fullAlpha));
    }

    if (state.layers.trueColor || state.compareMode) {
      if (state.cleanEarth) {
        layers.push(addLayer("cleanEarth", state.date, rightSplit, fullAlpha));
      } else {
        layers.push(addLayer("trueColor", state.date, rightSplit, fullAlpha));
      }
    }

    if (state.layers.sentinel) {
      layers.push(addLayer("sentinel", state.date, rightSplit, fullAlpha));
    }

    if (state.satelliteSource === "public-geostat") {
      layers.push(addLayer("goesEast", state.date, rightSplit, fullAlpha));
      layers.push(addLayer("goesWest", state.date, rightSplit, fullAlpha));
    }

    ["clouds", "infrared", "night"].forEach(function (key) {
      if (state.cleanEarth && (key === "clouds" || key === "infrared")) {
        return;
      }
      if (state.layers[key]) {
        layers.push(addLayer(key, state.date, rightSplit, fullAlpha));
      }
    });

    if (state.layers.labels) {
      layers.push(addLayer("labels", state.date, Cesium.SplitDirection.NONE, fullAlpha));
    }

    return layers;
  }

  function commitImageryLayers(newLayers) {
    newLayers.forEach(function (layer) {
      layer.orionFadeAlpha = 1;
      layer.orionAllowLowFade = false;
      layer.show = true;
      if (!state.compareMode) {
        layer.splitDirection = Cesium.SplitDirection.NONE;
      }
      applyLayerDisplayAlpha(layer);
    });

    activeImageryLayers = newLayers.filter(imageryLayerExists);
    stagedImageryLayers = [];
    baseImageryLayer = findBaseImageryLayer();
  }

  function removeOrionImageryLayers(exceptLayers) {
    var keep = exceptLayers || [];
    var removeList = [];
    var index;
    var layer;

    for (index = viewer.imageryLayers.length - 1; index >= 0; index--) {
      layer = viewer.imageryLayers.get(index);
      if (!layer || !layer.orionKey) {
        continue;
      }
      if (layer === streetDetailLayer || layer === streetRoadsLayer || layer === fallbackBaseLayer || layer === weatherRadarLayer || layer === zoomWeatherLayer) {
        continue;
      }
      if (keep.indexOf(layer) !== -1) {
        continue;
      }
      removeList.push(layer);
    }

    removeList.forEach(function (entry) {
      if (imageryLayerExists(entry)) {
        viewer.imageryLayers.remove(entry, true);
      }
    });
  }

  function hardResetImagery() {
    if (!viewer) {
      return;
    }

    cancelImageryTransition();
    removeOrionImageryLayers([]);

    var layers = buildImageryLayerList();
    if (!layers.length) {
      layers.push(addLayer("trueColor", state.date, Cesium.SplitDirection.NONE, 1));
    }

    commitImageryLayers(layers);
    syncImagerySplitMode();
    raiseOperationalLayers();
    viewer.scene.requestRender();
  }

  function simpleImageryApply() {
    if (!viewer) return;

    var date = state.date;
    var imagery = Orion.Renderer.Imagery;
    
    var baseLayerId = 'trueColor';
    if (state.layers.sentinel) baseLayerId = 'sentinel';
    else if (state.layers.trueColor) baseLayerId = 'trueColor';
    else if (state.layers.night) baseLayerId = 'night';
    else if (state.layers.infrared) baseLayerId = 'infrared';
    else if (state.cleanEarth) baseLayerId = 'cleanEarth';
    
    imagery.setBaseLayer(baseLayerId, date);
    
    imagery.setOverlayEnabled('labels', state.layers.labels, date);
    imagery.setOverlayEnabled('clouds', state.layers.clouds, date);
    imagery.setOverlayEnabled('boundaries', state.layers.boundaries, date);
    
    
    syncImagerySplitMode();
    raiseOperationalLayers();
    viewer.scene.requestRender();
  }

  function repairImageryHealth() {
    if (!viewer) {
      return;
    }

    var base = findBaseImageryLayer();

    if (!base) {
      console.warn("[Orion] No visible base imagery - hard reset");
      hardResetImagery();
      return;
    }

    if (base.orionFadeAlpha < 0.85 || base.alpha < 0.2 || base.show === false) {
      base.orionFadeAlpha = 1;
      base.show = true;
      applyLayerDisplayAlpha(base);
      syncImagerySplitMode();
      viewer.scene.requestRender();
    }
  }

  function installImageryHealthMonitor() {
    if (!viewer || !viewer.scene) {
      return;
    }

    viewer.scene.postRender.addEventListener(function () {
      var now = performance.now();
      if (now - lastImageryHealthCheck < 1800) {
        return;
      }
      lastImageryHealthCheck = now;
      repairImageryHealth();
    });
  }

  function rebuildImagery() {
    if (!viewer) {
      return;
    }

    imageryTransitionToken++;
    window.cancelAnimationFrame(imageryFadeFrame);
    window.clearTimeout(swapCleanupTimer);

    var token = imageryTransitionToken;
    var oldLayers = activeImageryLayers.filter(imageryLayerExists);
    stagedImageryLayers.forEach(function (layer) {
      if (layer && imageryLayerExists(layer)) {
        viewer.imageryLayers.remove(layer, true);
      }
    });

    var newLayers = buildImageryLayerList(0.02);
    if (!newLayers.length) {
      newLayers.push(addLayer("trueColor", state.date, Cesium.SplitDirection.NONE, 0.02));
    }

    newLayers.forEach(function (layer) {
      layer.orionAllowLowFade = true;
      layer.orionFadeAlpha = 0.02;
      layer.show = true;
      applyLayerDisplayAlpha(layer);
    });

    oldLayers.forEach(function (layer) {
      layer.orionAllowLowFade = true;
    });

    stagedImageryLayers = newLayers;
    syncImagerySplitMode();
    raiseOperationalLayers();
    viewer.scene.requestRender();

    var holdUntil = performance.now() + 360;
    var start = 0;
    var duration = state.timelineMode === "updates" ? 1650 : 1180;

    function animateImageryBlend(now) {
      if (token !== imageryTransitionToken) {
        return;
      }

      if (!start && now >= holdUntil) {
        start = now;
      }

      var progress = start ? clamp((now - start) / duration, 0, 1) : 0;
      var eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      newLayers.forEach(function (layer) {
        if (imageryLayerExists(layer)) {
          layer.orionFadeAlpha = Math.max(0.02, eased);
          applyLayerDisplayAlpha(layer);
        }
      });

      oldLayers.forEach(function (layer) {
        if (imageryLayerExists(layer)) {
          layer.orionFadeAlpha = clamp(1 - eased, 0, 1);
          applyLayerDisplayAlpha(layer);
        }
      });

      viewer.scene.requestRender();

      if (progress < 1) {
        imageryFadeFrame = window.requestAnimationFrame(animateImageryBlend);
        return;
      }

      oldLayers.forEach(function (layer) {
        if (imageryLayerExists(layer)) {
          viewer.imageryLayers.remove(layer, true);
        }
      });
      commitImageryLayers(newLayers);
      syncImagerySplitMode();
      raiseOperationalLayers();
      updateTelemetry();
      viewer.scene.requestRender();
    }

    imageryFadeFrame = window.requestAnimationFrame(animateImageryBlend);
    updateTelemetry();
  }

  function scheduleOldLayerRemoval(oldLayers, delay) {
    if (!oldLayers.length) {
      return;
    }

    swapCleanupTimer = window.setTimeout(function () {
      oldLayers.forEach(function (layer) {
        if (imageryLayerExists(layer)) {
          viewer.imageryLayers.remove(layer, true);
        }
      });

      stagedImageryLayers = stagedImageryLayers.filter(function (layer) {
        return oldLayers.indexOf(layer) === -1 && imageryLayerExists(layer);
      });
      viewer.scene.requestRender();
    }, delay);
  }

  function imageryLayerExists(layer) {
    var layers = viewer.imageryLayers;

    if (typeof layers.contains === "function") {
      return layers.contains(layer);
    }

    if (typeof layers.indexOf === "function") {
      return layers.indexOf(layer) !== -1;
    }

    for (var index = 0; index < layers.length; index++) {
      if (layers.get(index) === layer) {
        return true;
      }
    }

    return false;
  }

  function scheduleImageryRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(rebuildImagery, 48);
  }

  function installImageryPrewarm() {
    if (!viewer || !viewer.camera) {
      return;
    }

    var lastPrewarmAt = 0;

    viewer.camera.moveStart.addEventListener(function () {
      state.cameraMoving = true;
    });

    viewer.camera.moveEnd.addEventListener(function () {
      state.cameraMoving = false;
      state.cameraMovingFast = false;
      lastCameraCartesian = null;
      var endHeight = viewer.camera.positionCartographic.height;
      updateStreetDetailBlend(endHeight);
      syncImagerySplitMode();
      viewer.scene.requestRender();
    });

    viewer.camera.changed.addEventListener(function () {
      var now = performance.now();
      var cartesian = viewer.camera.positionWC;

      if (lastCameraCartesian && cartesian) {
        var delta = Cesium.Cartesian3.distance(lastCameraCartesian, cartesian);
        var dt = Math.max(16, now - lastCameraMotionAt);
        var speed = delta / dt;
        state.cameraMovingFast = speed > 1800 || state.cameraMoving;
        lastCameraMotionAt = now;
      }

      lastCameraCartesian = cartesian ? Cesium.Cartesian3.clone(cartesian) : null;

      if (now - lastPrewarmAt < 130) {
        return;
      }

      lastPrewarmAt = now;
      prefetchStreetDetailTiles(viewer.camera.positionCartographic.height);
      viewer.scene.requestRender();
    });
  }

  function renderSavedLocations() {
    elements.savedLocations.innerHTML = "";

    if (!savedLocations.length) {
      var empty = document.createElement("div");
      empty.className = "saved-empty";
      empty.textContent = "No saved locations";
      elements.savedLocations.appendChild(empty);
      return;
    }

    var fragment = document.createDocumentFragment();

    savedLocations.forEach(function (location, index) {
      var item = document.createElement("div");
      var launchButton = document.createElement("button");
      var removeButton = document.createElement("button");

      item.className = "saved-location";

      launchButton.className = "saved-location-main";
      launchButton.type = "button";
      launchButton.textContent = location.name;
      launchButton.title = location.name + " / " + location.lat.toFixed(4) + ", " + location.lon.toFixed(4);
      launchButton.addEventListener("click", function () {
        setPlaying(false);
        flyToLocation(location);
      });

      removeButton.className = "saved-location-remove";
      removeButton.type = "button";
      removeButton.textContent = "X";
      removeButton.setAttribute("aria-label", "Remove " + location.name);
      removeButton.addEventListener("click", function () {
        removeSavedLocation(index);
      });

      item.appendChild(launchButton);
      item.appendChild(removeButton);
      fragment.appendChild(item);
    });

    elements.savedLocations.appendChild(fragment);
  }

  function saveCurrentLocation() {
    var location = currentViewLocation();

    if (!location) {
      showToast("No location target available.");
      return;
    }

    savedLocations.unshift(location);
    savedLocations = savedLocations.slice(0, 18);
    persistSavedLocations();
    renderSavedLocations();
    showToast(location.name + " saved.");
  }

  function removeSavedLocation(index) {
    var removed = savedLocations.splice(index, 1)[0];
    persistSavedLocations();
    renderSavedLocations();

    if (removed) {
      showToast(removed.name + " removed.");
    }
  }

  function currentViewLocation() {
    var lat = state.target.lat;
    var lon = state.target.lon;
    var name = state.target.name;

    if (typeof lat !== "number" || typeof lon !== "number") {
      var center = viewer && viewer.scene ? new Cesium.Cartesian2(viewer.scene.canvas.clientWidth / 2, viewer.scene.canvas.clientHeight / 2) : null;
      var cartesian = center ? viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid) : null;

      if (!cartesian) {
        return null;
      }

      var cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      lat = Cesium.Math.toDegrees(cartographic.latitude);
      lon = Cesium.Math.toDegrees(cartographic.longitude);
      name = "View " + lat.toFixed(2) + ", " + lon.toFixed(2);
    }

    if (!name || name === "Global scan" || name === "Manual acquisition" || name === "Coordinates") {
      name = "View " + lat.toFixed(2) + ", " + lon.toFixed(2);
    }

    return {
      id: Date.now() + "-" + Math.random().toString(16).slice(2),
      name: name,
      lat: lat,
      lon: lon,
      height: viewer ? clamp(viewer.camera.positionCartographic.height, 1200, 12000000) : 650000
    };
  }

  function bindEvents() {
    elements.searchForm.addEventListener("submit", handleSearch);

    if (elements.intelMapCalloutClose) {
      elements.intelMapCalloutClose.addEventListener("click", function (event) {
        event.stopPropagation();
        hideIntelMapCallout();
      });
    }

    if (elements.saveLocationButton) {
      elements.saveLocationButton.addEventListener("click", saveCurrentLocation);
    }

    [
      ["layerTrueColor", "trueColor"],
      ["layerSentinel", "sentinel"],
      ["layerClouds", "clouds"],
      ["layerInfrared", "infrared"],
      ["layerNight", "night"],
      ["layerLabels", "labels"],
      ["layerBoundaries", "boundaries"]
    ].forEach(function (pair) {
      elements[pair[0]].addEventListener("change", function (event) {
        state.layers[pair[1]] = event.target.checked;
        if ((pair[1] === "clouds" || pair[1] === "infrared") && event.target.checked) {
          state.cleanEarth = false;
        }
        if (pair[1] === "boundaries") {
          updateBoundaryLayer();
          syncControlState();
          return;
        }
        scheduleImageryRefresh();
      });
    });

    if (elements.layerCleanEarth) {
      elements.layerCleanEarth.addEventListener("change", function (event) {
        state.cleanEarth = event.target.checked;
        if (state.cleanEarth) {
          state.layers.clouds = false;
          state.layers.infrared = false;
        }
        scheduleImageryRefresh();
        syncControlState();
        updateTelemetry();
      });
    }

    if (elements.weatherMapModeSelect) {
      elements.weatherMapModeSelect.addEventListener("change", function (event) {
        applyWeatherMapMode(event.target.value);
      });
    }

    if (elements.satelliteSourceSelect) {
      elements.satelliteSourceSelect.addEventListener("change", function (event) {
        applySatelliteSource(event.target.value);
      });
    }

    Object.keys(platformLayerDefinitions).forEach(function (layerId) {
      var control = elements[platformLayerDefinitions[layerId].controlId];

      if (!control) {
        return;
      }

      control.addEventListener("change", function (event) {
        setPlatformLayer(layerId, event.target.checked);
      });
    });

    if (elements.scanModeSelect) {
      elements.scanModeSelect.addEventListener("change", function (event) {
        setScanMode(event.target.value);
      });
    }

    if (elements.timelapseRecord) {
      elements.timelapseRecord.addEventListener("click", recordTimelapse);
    }

    if (elements.earthquakeFeedSelect) {
      elements.earthquakeFeedSelect.addEventListener("change", function (event) {
        state.earthquakeFeed = event.target.value;
        clearPlatformLayer("earthquakes");
        if (state.platformLayers.earthquakes) {
          refreshPlatformLayer("earthquakes", true);
        }
      });
    }

    if (elements.earthquakeMagnitudeSelect) {
      elements.earthquakeMagnitudeSelect.addEventListener("change", function (event) {
        state.earthquakeMinMagnitude = Number(event.target.value) || 0;
        clearPlatformLayer("earthquakes");
        if (state.platformLayers.earthquakes) {
          refreshPlatformLayer("earthquakes", true);
        }
      });
    }

    if (elements.radarOpacityRange) {
      elements.radarOpacityRange.addEventListener("input", function (event) {
        state.radarOpacity = Number(event.target.value);
        if (weatherRadarLayer) {
          weatherRadarLayer.alpha = state.radarOpacity;
          raiseOperationalLayers();
          viewer.scene.requestRender();
        }
        if (zoomWeatherLayer && zoomWeatherMode) {
          zoomWeatherLayer.alpha = zoomWeatherLayerAlpha(zoomWeatherMode);
          raiseOperationalLayers();
          viewer.scene.requestRender();
        }
      });
    }

    if (elements.radarAnimateToggle) {
      elements.radarAnimateToggle.addEventListener("click", function () {
        state.radarAnimating = !state.radarAnimating;
        elements.radarAnimateToggle.classList.toggle("active", state.radarAnimating);
        syncWeatherRadarAnimation();
      });
    }

    if (elements.intelSearch) {
      elements.intelSearch.addEventListener("input", function (event) {
        state.intelSearch = event.target.value.toLowerCase();
        renderIntelEntityList(true);
      });
    }

    if (elements.intelCategoryChips) {
      elements.intelCategoryChips.addEventListener("click", function (event) {
        var button = event.target.closest("[data-category]");
        if (!button) {
          return;
        }
        state.intelCategory = button.dataset.category || "all";
        renderIntelEntityList(true);
      });
    }

    if (elements.intelEntityList) {
      elements.intelEntityList.addEventListener("click", function (event) {
        var row = event.target.closest(".intel-entity-row");
        if (!row) {
          return;
        }
        if (row.dataset.kind === "track") {
          selectTrackingObject(row.dataset.id);
        } else if (row.dataset.kind === "cameraNet" && window.CameraNet && typeof CameraNet.selectCameraById === "function") {
          CameraNet.selectCameraById(viewer, row.dataset.id);
        } else {
          selectPlatformEntity(row.dataset.id);
        }
        renderIntelEntityList(true);
      });
      elements.intelEntityList.addEventListener("dblclick", function (event) {
        var row = event.target.closest(".intel-entity-row");
        if (!row) {
          return;
        }
        if (row.dataset.kind === "track") {
          selectTrackingObject(row.dataset.id);
        } else if (row.dataset.kind === "cameraNet" && window.CameraNet && typeof CameraNet.selectCameraById === "function") {
          CameraNet.selectCameraById(viewer, row.dataset.id);
        } else {
          selectPlatformEntity(row.dataset.id);
        }
      });
    }

    elements.compareToggle.addEventListener("click", function () {
      setCompareMode(!state.compareMode);
    });

    elements.homeButton.addEventListener("click", function () {
      setPlaying(false);
      flyHome();
    });

    (function () {
      var PANEL_STORAGE_KEY = "orion:panelCollapsed";

      function loadCollapsed() {
        try { return JSON.parse(window.localStorage.getItem(PANEL_STORAGE_KEY) || "{}"); } catch (e) { return {}; }
      }

      function saveCollapsed(state) {
        try { window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      }

      function initPanelToggle(panelId, btnId, collapseIcon, expandIcon) {
        var panel = document.getElementById(panelId);
        var btn = document.getElementById(btnId);
        if (!panel || !btn) return;

        var collapsed = loadCollapsed();
        if (collapsed[panelId]) {
          panel.classList.add("collapsed");
          btn.textContent = expandIcon;
          btn.setAttribute("aria-label", "Expand " + panelId.replace("Panel", "") + " panel");
        }

        btn.addEventListener("click", function () {
          var isCollapsed = panel.classList.toggle("collapsed");
          btn.textContent = isCollapsed ? expandIcon : collapseIcon;
          btn.setAttribute("aria-label", (isCollapsed ? "Expand " : "Collapse ") + panelId.replace("Panel", "") + " panel");
          var s = loadCollapsed();
          s[panelId] = isCollapsed;
          saveCollapsed(s);
        });
      }

      initPanelToggle("commandPanel",   "commandPanelToggle",   "<", ">");
      initPanelToggle("telemetryPanel", "telemetryPanelToggle", ">", "<");
    }());

    (function () {
      var timelineHud = document.getElementById("timelineHud");
      var timelineBtn = document.getElementById("timelineHudToggle");
      if (timelineHud && timelineBtn) {
        var TIMELINE_KEY = "orion:timelineCollapsed";
        if (window.localStorage.getItem(TIMELINE_KEY) === "1") {
          timelineHud.classList.add("collapsed");
          timelineBtn.textContent = "^";
          timelineBtn.setAttribute("aria-label", "Expand timeline");
        }
        timelineBtn.addEventListener("click", function () {
          var isCollapsed = timelineHud.classList.toggle("collapsed");
          timelineBtn.textContent = isCollapsed ? "^" : "v";
          timelineBtn.setAttribute("aria-label", isCollapsed ? "Expand timeline" : "Collapse timeline");
          try { window.localStorage.setItem(TIMELINE_KEY, isCollapsed ? "1" : "0"); } catch (e) {}
        });
      }
    }());

    (function () {
      var HUD_HIDDEN_KEY = "orion:hudHidden";
      var hideBtn = document.getElementById("hudHideToggle");

      function setHudHidden(hidden) {
        document.body.classList.toggle("hud-hidden", hidden);
        if (hideBtn) {
          hideBtn.textContent = hidden ? "[+]" : "[-]";
          hideBtn.setAttribute("aria-label", hidden ? "Show all panels" : "Hide all panels");
        }
        try { window.localStorage.setItem(HUD_HIDDEN_KEY, hidden ? "1" : "0"); } catch (e) {}
      }

      if (window.localStorage.getItem(HUD_HIDDEN_KEY) === "1") {
        setHudHidden(true);
      }

      if (hideBtn) {
        hideBtn.addEventListener("click", function () {
          setHudHidden(!document.body.classList.contains("hud-hidden"));
        });
      }

      document.addEventListener("keydown", function (event) {
        if (event.target && ["INPUT", "SELECT", "TEXTAREA"].indexOf(event.target.tagName) !== -1) return;
        if (event.code === "KeyH" && !event.ctrlKey && !event.metaKey) {
          setHudHidden(!document.body.classList.contains("hud-hidden"));
        }
      });
    }());

    [
      ["trackFilterAll", "all"],
      ["trackFilterAir", "air"],
      ["trackFilterSat", "sat"],
      ["trackFilterSea", "sea"]
    ].forEach(function (pair) {
      elements[pair[0]].addEventListener("click", function () {
        setTrackFilter(pair[1]);
      });
    });

    [
      ["trackAircraft", "air"],
      ["trackSatellites", "sat"],
      ["trackVessels", "sea"]
    ].forEach(function (pair) {
      function syncDomainFromToggle(event) {
        setTrackingDomain(pair[1], event.target.checked);
      }
      elements[pair[0]].addEventListener("change", syncDomainFromToggle);
      elements[pair[0]].addEventListener("input", syncDomainFromToggle);
      elements[pair[0]].addEventListener("click", syncDomainFromToggle);
    });

    var trackingToggleGrid = document.querySelector(".tracking-toggle-grid");
    if (trackingToggleGrid) {
      trackingToggleGrid.addEventListener("click", function () {
        window.setTimeout(function () {
          [
            ["trackAircraft", "air"],
            ["trackSatellites", "sat"],
            ["trackVessels", "sea"]
          ].forEach(function (pair) {
            var control = elements[pair[0]];
            if (control) {
              setTrackingDomain(pair[1], control.checked);
            }
          });
        }, 0);
      });
    }

    if (elements.orbitalDatasetSelect) {
      elements.orbitalDatasetSelect.addEventListener("change", function (event) {
        setOrbitalDataset(event.target.value);
      });
    }

    elements.liveModeToggle.addEventListener("click", function () {
      setLiveMode(!state.tracking.live);
    });

    if (elements.unlockCamera) {
      elements.unlockCamera.addEventListener("click", function () {
        clearTrackingSelection();
        clearPlatformSelection("Camera follow released.");
        updatePlatformSystems(false);
      });
    }

    if (elements.cameraClose) {
      elements.cameraClose.addEventListener("click", closeCameraWindow);
    }

    if (elements.timelineModeHourly) {
      elements.timelineModeHourly.addEventListener("click", function () {
        setTimelineMode("hourly");
      });
    }

    if (elements.timelineModeUpdates) {
      elements.timelineModeUpdates.addEventListener("click", function () {
        setTimelineMode("updates");
      });
    }

    elements.timelineRange.addEventListener("input", function (event) {
      setPlaying(false);
      if (state.tracking.live) {
        setLiveMode(false);
      }
      setDate(dateFromRange(event.target.value), true);
    });

    elements.compareRange.addEventListener("input", function (event) {
      var previousTileDate = formatDate(state.compareDate);
      state.compareDate = clampDate(dateFromRange(event.target.value));
      updateTimelineLabels();

      if (formatDate(state.compareDate) !== previousTileDate) {
        scheduleImageryRefresh();
      }
    });

    elements.splitRange.addEventListener("input", function (event) {
      state.splitPosition = Number(event.target.value);
      updateSplitPosition();
      if (viewer) {
        viewer.scene.splitPosition = state.splitPosition;
        viewer.scene.requestRender();
      }
    });

    elements.prevDay.addEventListener("click", function () {
      setPlaying(false);
      if (state.tracking.live) {
        setLiveMode(false);
      }
      advanceDate(-1, false);
    });

    elements.nextDay.addEventListener("click", function () {
      setPlaying(false);
      if (state.tracking.live) {
        setLiveMode(false);
      }
      advanceDate(1, false);
    });

    elements.playPause.addEventListener("click", function () {
      if (state.tracking.live) {
        setLiveMode(false);
      }
      setPlaying(!state.playing);
    });

    elements.speedSelect.addEventListener("change", function (event) {
      state.speed = Number(event.target.value);
    });

    document.addEventListener("keydown", function (event) {
      if (event.target && ["INPUT", "SELECT", "TEXTAREA"].indexOf(event.target.tagName) !== -1) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (state.tracking.live) {
          setLiveMode(false);
        }
        setPlaying(!state.playing);
      }
    });
  }

  function installGlobeClickHandler() {
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction(function (movement) {
      var picked = viewer.scene.pick(movement.position);

      if (window.CameraNet && CameraNet.onClick(viewer, picked)) {
        if (targetEntity) {
          viewer.entities.remove(targetEntity);
          targetEntity = null;
        }
        return;
      }

      if (picked && picked.id && picked.id.orionTrackId) {
        if (targetEntity) {
          viewer.entities.remove(targetEntity);
          targetEntity = null;
        }
        selectTrackingObject(picked.id.orionTrackId);
        return;
      }

      if (picked && picked.id && picked.id.orionPlatformEntityId) {
        if (targetEntity) {
          viewer.entities.remove(targetEntity);
          targetEntity = null;
        }
        selectPlatformEntity(picked.id.orionPlatformEntityId);
        return;
      }

      var primitivePickId = picked && picked.primitive && picked.primitive.id;
      if (primitivePickId && primitivePickId.orionPlatformEntityId) {
        if (targetEntity) {
          viewer.entities.remove(targetEntity);
          targetEntity = null;
        }
        selectPlatformEntity(primitivePickId.orionPlatformEntityId);
        return;
      }

      var cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);

      if (!cartesian) {
        return;
      }

      var cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      var lat = Cesium.Math.toDegrees(cartographic.latitude);
      var lon = Cesium.Math.toDegrees(cartographic.longitude);

      setTarget({
        name: "Manual acquisition",
        lat: lat,
        lon: lon
      });
      clearTrackingSelection();
      dropTargetMarker(lat, lon);
      showToast("Target locked at " + lat.toFixed(4) + ", " + lon.toFixed(4));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function installCameraTelemetry() {
    viewer.scene.postRender.addEventListener(function () {
      var now = performance.now();

      if (now - lastCameraUpdate < 90) {
        return;
      }

      lastCameraUpdate = now;
      syncOrionDebugOverlay();
      updateCameraAltitude();
      if (state.platformLayers.weatherRadar) {
        raiseOperationalLayers();
      }

      if (state.platformLayers.cameras && viewer && viewer.camera) {
        var previousKey = lastCameraRegionKey;
        cameraRegionQuery();

        if (previousKey && lastCameraRegionKey && previousKey !== lastCameraRegionKey && now - lastCameraRegionFetchTime > 3500) {
          lastCameraRegionFetchTime = now;
          refreshPlatformLayer("cameras", true);
        }
      }
    });
  }

  function parseCoordinates(query) {
    var match = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);

    if (!match) {
      return null;
    }

    var lat = Number(match[1]);
    var lon = Number(match[2]);

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return null;
    }

    return { lat: lat, lon: lon };
  }

  function handleSearch(event) {
    event.preventDefault();

    var query = elements.searchInput.value.trim();

    if (!query) {
      return;
    }

    var coordinates = parseCoordinates(query);

    if (coordinates) {
      flyToLocation({
        name: "Coordinates",
        lat: coordinates.lat,
        lon: coordinates.lon,
        height: 520000
      });
      return;
    }

    resolveLocation(query);
  }

  function resolveLocation(query) {
    var endpoint = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query);

    showToast("Resolving location signal...");

    fetch(endpoint, {
      headers: {
        Accept: "application/json"
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Search failed");
        }
        return response.json();
      })
      .then(function (results) {
        if (!results.length) {
          showToast("No location match found.");
          return;
        }

        var result = results[0];
        var name = shortenDisplayName(result.display_name || query);

        flyToLocation({
          name: name,
          lat: Number(result.lat),
          lon: Number(result.lon),
          height: heightFromBoundingBox(result.boundingbox)
        });
      })
      .catch(function () {
        showToast("Location search is unavailable. Coordinates still work.");
      });
  }

  function shortenDisplayName(name) {
    return name.split(",").slice(0, 2).join(",").trim();
  }

  function heightFromBoundingBox(boundingBox) {
    if (!Array.isArray(boundingBox) || boundingBox.length < 4) {
      return 650000;
    }

    var south = Number(boundingBox[0]);
    var north = Number(boundingBox[1]);
    var west = Number(boundingBox[2]);
    var east = Number(boundingBox[3]);
    var span = Math.max(Math.abs(north - south), Math.abs(east - west));

    return clamp(span * 125000, 90000, 4500000);
  }

  function flyToLocation(location) {
    clearTrackingSelection();
    setTarget(location);
    dropTargetMarker(location.lat, location.lon);

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(location.lon, location.lat, location.height || 650000),
      duration: 2.35,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-58),
        roll: 0
      }
    });
  }

  function flyHome() {
    clearTrackingSelection();
    setTarget({ name: "Global scan", lat: null, lon: null });

    if (targetEntity) {
      viewer.entities.remove(targetEntity);
      targetEntity = null;
    }

    viewer.camera.flyTo({
      destination: homeRectangle(),
      duration: 2.4,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
    });
  }

  function homeRectangle() {
    return Cesium.Rectangle.fromDegrees(EARTH_HOME.west, EARTH_HOME.south, EARTH_HOME.east, EARTH_HOME.north);
  }

  function setTarget(target) {
    state.target = {
      name: target.name || "Manual acquisition",
      lat: typeof target.lat === "number" ? target.lat : null,
      lon: typeof target.lon === "number" ? target.lon : null
    };
    updateTargetTelemetry();
  }

  function dropTargetMarker(lat, lon) {
    if (targetEntity) {
      viewer.entities.remove(targetEntity);
    }

    targetEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      billboard: {
        image: (window.OrionTextureManager && typeof OrionTextureManager.getIcon === "function") ? 
          OrionTextureManager.getIcon('target') : "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cpath d='M32 18 V26 M32 38 V46 M18 32 H26 M38 32 H46' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E",
        scale: 0.5,
        color: Cesium.Color.WHITE.withAlpha(0.9),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    if (targetEntity.billboard && window.OrionTextureManager) {
       safeAssignBillboard(targetEntity.billboard, OrionTextureManager.getIcon('target'));
    }
  }

  function setDate(date, refresh) {
    var previousTileDate = formatDate(state.date);
    state.date = clampDate(date);
    elements.timelineRange.value = String(rangeFromDate(state.date));
    updateTimelineLabels();
    updateTrackingLayer(false);
    updatePlatformSystems(false);

    if (refresh && formatDate(state.date) !== previousTileDate) {
      scheduleImageryRefresh();
    }
  }

  function advanceDate(delta, loop) {
    var nextDate = addTimelineUnits(state.date, delta);

    if (nextDate > maxDate) {
      nextDate = loop ? minDate : maxDate;
    }

    if (nextDate < minDate) {
      nextDate = loop ? maxDate : minDate;
    }

    if (nextDate.getTime() === state.date.getTime()) {
      return;
    }

    setDate(nextDate, true);
  }

  function setCommandButton(button, label, icon) {
    if (!button) {
      return;
    }

    button.textContent = label;

    if (icon) {
      button.dataset.icon = icon;
    }
  }

  function setPlaying(isPlaying) {
    state.playing = isPlaying;
    setCommandButton(elements.playPause, isPlaying ? "PAUSE" : "PLAY", isPlaying ? "||" : ">");
    elements.playPause.setAttribute("aria-label", isPlaying ? "Pause timeline" : "Play timeline");

    window.cancelAnimationFrame(playbackFrame);
    lastPlaybackTimestamp = 0;
    updatePlaybackAccumulator = 0;

    if (!isPlaying) {
      return;
    }

    if (state.date.getTime() >= maxDate.getTime()) {
      setDate(minDate, true);
    }

    playbackFrame = window.requestAnimationFrame(playbackStep);
  }

  function playbackStep(timestamp) {
    if (!state.playing) {
      return;
    }

    if (!lastPlaybackTimestamp) {
      lastPlaybackTimestamp = timestamp;
    }

    var elapsedSeconds = Math.min((timestamp - lastPlaybackTimestamp) / 1000, 0.2);

    lastPlaybackTimestamp = timestamp;

    if (state.timelineMode === "updates") {
      updatePlaybackAccumulator += elapsedSeconds * state.speed;

      if (updatePlaybackAccumulator >= 1) {
        var wholeUpdates = Math.floor(updatePlaybackAccumulator);
        updatePlaybackAccumulator -= wholeUpdates;
        advanceDate(wholeUpdates, false);

        if (state.date.getTime() >= maxDate.getTime()) {
          setPlaying(false);
          return;
        }
      }

      playbackFrame = window.requestAnimationFrame(playbackStep);
      return;
    }

    var nextTime = state.date.getTime() + elapsedSeconds * state.speed * MS_PER_HOUR;

    if (nextTime > maxDate.getTime()) {
      setDate(maxDate, true);
      setPlaying(false);
      return;
    }

    setDate(new Date(nextTime), true);
    playbackFrame = window.requestAnimationFrame(playbackStep);
  }

  function setTimelineMode(mode) {
    if (state.timelineMode === mode) {
      return;
    }

    setPlaying(false);
    state.timelineMode = mode;

    if (mode === "updates") {
      state.date = addHours(utcMidnight(state.date), 23);
      state.compareDate = addHours(utcMidnight(state.compareDate), 23);
    }

    syncTimelineModeControls();
    syncControlState();
    scheduleImageryRefresh();
    showToast(mode === "updates" ? "Timeline stepping by received map updates." : "Timeline stepping by hour.");
  }

  function syncTimelineModeControls() {
    if (!elements.timelineModeHourly || !elements.timelineModeUpdates) {
      return;
    }

    var updatesMode = state.timelineMode === "updates";
    elements.timelineModeHourly.classList.toggle("active", !updatesMode);
    elements.timelineModeUpdates.classList.toggle("active", updatesMode);
    elements.timelineRange.step = "1";
    elements.compareRange.step = "1";
    setCommandButton(elements.prevDay, updatesMode ? "1U" : "1H", "<");
    setCommandButton(elements.nextDay, updatesMode ? "1U" : "1H", ">");
    elements.prevDay.setAttribute("aria-label", updatesMode ? "Previous map update" : "Previous hour");
    elements.nextDay.setAttribute("aria-label", updatesMode ? "Next map update" : "Next hour");

    Array.prototype.forEach.call(elements.speedSelect.options, function (option) {
      option.textContent = option.value + (updatesMode ? " update/s" : " h/s");
    });
  }

  function setCompareMode(enabled) {
    state.compareMode = enabled;
    elements.compareControls.hidden = !enabled;
    elements.splitDivider.hidden = !enabled;
    elements.compareToggle.textContent = enabled ? "Exit compare" : "Split compare";
    updateSplitPosition();
    
    if (viewer) {
      syncImagerySplitMode();
    }

    scheduleImageryRefresh();
  }

  function updateSplitPosition() {
    document.documentElement.style.setProperty("--split-position", (state.splitPosition * 100).toFixed(1) + "%");
  }

  function updateTimelineLabels() {
    var updatesMode = state.timelineMode === "updates";
    var cursorUnits = updatesMode
      ? clamp(daysBetween(minDate, state.date), 0, timelineRangeMax())
      : clamp(Math.floor(hoursBetween(minDate, state.date)), 0, timelineRangeMax());
    var cursorDate = updatesMode ? addDays(minDate, cursorUnits) : addHours(minDate, cursorUnits);
    var liveTrackTime = getTrackingTime();

    elements.currentDateLabel.textContent = state.tracking.live ? "LIVE - " + readableLiveDateTime(liveTrackTime) : readableDateTime(cursorDate);
    elements.imageDate.textContent = formatDate(cursorDate) + " - " + formatHour(cursorDate) + " UTC";
    elements.compareDateLabel.textContent = readableDateTime(state.compareDate);
    elements.compareRange.value = String(rangeFromDate(state.compareDate));
    elements.timelineStartLabel.textContent = readableDate(minDate);
    elements.timelineCursorLabel.textContent = state.tracking.live ? "LIVE" : updatesMode ? "UPD " + String(cursorUnits).padStart(2, "0") : "T+" + String(cursorUnits).padStart(3, "0") + "H";
    elements.timelineEndLabel.textContent = readableDate(maxDate);

    var ageHours = Math.max(0, Math.round(hoursBetween(state.date, maxDate)));
    var ageDays = Math.floor(ageHours / 24);
    var remainingHours = ageHours % 24;

    if (state.tracking.live) {
      elements.feedMeta.textContent = "Live tracks / latest stable imagery";
    } else if (updatesMode) {
      elements.feedMeta.textContent = "Stepping by received daily map updates";
    } else if (ageHours === 0) {
      elements.feedMeta.textContent = "Latest stable NASA GIBS mosaic";
    } else if (ageDays > 0) {
      elements.feedMeta.textContent = ageDays + "D " + remainingHours + "H historical offset";
    } else {
      elements.feedMeta.textContent = ageHours + "H historical offset";
    }

    updateTrackingTelemetry(null, liveTrackTime);
  }

  function updateTargetTelemetry() {
    elements.targetName.textContent = state.target.name || "Global scan";
    elements.targetLat.textContent = (state.target.lat === null || isNaN(state.target.lat)) ? "--" : state.target.lat.toFixed(5);
    elements.targetLon.textContent = (state.target.lon === null || isNaN(state.target.lon)) ? "--" : state.target.lon.toFixed(5);
  }

  function syncOrionDebugOverlay() {
    if (typeof localStorage === "undefined" || localStorage.getItem("orionDebug") !== "1") {
      return;
    }

    var hud = document.getElementById("orionDebugHud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "orionDebugHud";
      hud.style.cssText =
        "position:fixed;bottom:12px;left:12px;z-index:99999;padding:8px 10px;" +
        "font:11px/1.45 monospace;color:#9ef;background:rgba(5,8,14,.88);" +
        "border:1px solid rgba(120,200,255,.35);border-radius:6px;pointer-events:none;max-width:360px;";
      document.body.appendChild(hud);
    }

    var height = viewer && viewer.camera ? viewer.camera.positionCartographic.height : 0;
    var camCount = 0;
    var clusterCount = 0;

    if (window.CameraNet && typeof window.CameraNet.getDebugStats === "function") {
      var stats = window.CameraNet.getDebugStats();
      camCount = stats.cameras || 0;
      clusterCount = stats.clusters || 0;
    }

    hud.textContent = [
      "imagery active: " + activeImageryLayers.length,
      "staged: " + stagedImageryLayers.length,
      "height: " + Math.round(height) + "m",
      "moving: " + (state.cameraMoving ? "yes" : "no"),
      "fast: " + (state.cameraMovingFast ? "yes" : "no"),
      "shader: " + (typeof currentImageryMode !== "undefined" ? currentImageryMode : "n/a"),
      "CameraNet cams: " + camCount + " clusters: " + clusterCount
    ].join("\n");
  }

  function updateTelemetry() {
    updateTargetTelemetry();
    updateTimelineLabels();
    updateCameraAltitude();

    elements.providerLabel.textContent = activeProviderLabel();
    elements.updateAge.textContent = updateAgeLabel();
    elements.cloudCoverage.textContent = state.cleanEarth ? "Cloud-free globe active" : (state.layers.clouds ? "Optical thickness layer active" : "Visual layer standby");
    elements.mapDetailLabel.textContent = mapDetailLabel();
    updateTrackingTelemetry(null, getTrackingTime());
    updatePlatformTelemetry();
  }

  function activeProviderLabel() {
    var activeNames = [];

    ["trueColor", "sentinel", "clouds", "infrared", "night"].forEach(function (key) {
      if (state.cleanEarth && (key === "clouds" || key === "infrared")) {
        return;
      }
      if (state.layers[key]) {
        activeNames.push(layerDefinitions[key].name);
      }
    });

    if (state.cleanEarth) {
      activeNames.push("Cloud-free globe");
    }

    if (state.satelliteSource === "public-geostat") {
      activeNames.push("NOAA GOES GeoColor NRT");
    }

    if (state.autoDetailActive) {
      activeNames.push("Adaptive tile detail");
    }

    if (streetDetailAlpha > 0.12) {
      activeNames.push("Aerial detail blend");
    }

    if (!activeNames.length && state.compareMode) {
      return "NASA GIBS / split true color";
    }

    if (!activeNames.length) {
      return "No imagery layer selected";
    }

    if (activeNames.length === 1) {
      return activeNames[0];
    }

    return activeNames[0] + " +" + String(activeNames.length - 1);
  }

  function updateAgeLabel() {
    var ageHours = Math.max(0, Math.round(hoursBetween(state.date, maxDate)));
    var ageDays = Math.floor(ageHours / 24);
    var remainingHours = ageHours % 24;

    if (ageHours <= 0) {
      return "Stable NRT mosaic";
    }

    if (ageDays <= 0) {
      return ageHours + (ageHours === 1 ? " hour historical" : " hours historical");
    }

    return ageDays + "d " + remainingHours + "h historical";
  }

  Orion.Interaction = {
    Camera: {
      updateAltitude: function() {
        if (!viewer) return;
        var height = viewer.camera.positionCartographic.height;
        elements.cameraAltitude.textContent = formatAltitude(height);
        this.updateZoomDetail(height);
      },
      
      updateZoomDetail: function(height) {
        var nextTier = "orbital", nextError = 1.15;
        if (height < 165000) { nextTier = "target"; nextError = 0.28; }
        else if (height < 650000) { nextTier = "local"; nextError = 0.38; }
        else if (height < 1400000) { nextTier = "regional"; nextError = 0.5; }

        var wasOrbital = state.detailTier === "orbital";
        if (nextTier === state.detailTier) {
          updateStreetDetailBlend(height);
          return;
        }

        state.detailTier = nextTier;
        state.autoDetailActive = nextTier !== "orbital";
        viewer.scene.globe.maximumScreenSpaceError = nextError;
        if (wasOrbital !== (nextTier === "orbital") || height >= ORBITAL_ALTITUDE_CUTOFF) syncImagerySplitMode();
        if (typeof viewer.scene.globe.tileCacheSize === "number") {
          viewer.scene.globe.tileCacheSize = nextTier === "target" ? 1300 : nextTier === "local" ? 1000 : 700;
        }
        viewer.scene.requestRender();
        updateStreetDetailBlend(height);
        updateTelemetry();
      }
    },
    
    Toast: {
      timer: null,
      show: function(message) {
        if (!elements.toast) return;
        elements.toast.textContent = message;
        elements.toast.classList.add("visible");
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(function() { elements.toast.classList.remove("visible"); }, 2600);
      }
    }
  };

  Orion.Replay = {
    active: false,
    snapshots: [],
    
    init: function() {
      console.log('[Orion.Replay] Initialized');
    },
    
    takeSnapshot: function(label) {
      var snapshot = {
        label: label || 'Manual',
        timestamp: Date.now(),
        simulationTime: state.date.getTime(),
        layerState: JSON.parse(JSON.stringify(layerStateManager.layerStates)),
        contexts: JSON.parse(JSON.stringify(adaptiveIntelligenceManager.activeContexts))
      };
      this.snapshots.push(snapshot);
      console.log('[Replay] Snapshot taken:', snapshot.label);
      return snapshot;
    },
    
    playSnapshot: function(index) {
      var s = this.snapshots[index];
      if (!s) return;
      this.active = true;
      state.date = new Date(s.simulationTime);
      console.log('[Replay] Playing snapshot:', s.label);
    }
  };

  var replayManager = Orion.Replay;

  Orion.Session = {
    save: function() {
      var session = {
        missionContext: Orion.Intelligence.OperationalNarrative.missionContext,
        scanMode: state.scanMode,
        layers: state.platformLayers,
        camera: viewer ? {
          lat: Cesium.Math.toDegrees(viewer.camera.positionCartographic.latitude),
          lon: Cesium.Math.toDegrees(viewer.camera.positionCartographic.longitude),
          height: viewer.camera.positionCartographic.height
        } : null
      };
      localStorage.setItem('orion_session_state', JSON.stringify(session));
      console.log('[Orion.Session] State persisted');
    },
    
    restore: function() {
      try {
        var stored = localStorage.getItem('orion_session_state');
        if (!stored) return;
        var session = JSON.parse(stored);
        if (session.missionContext) Orion.Intelligence.OperationalNarrative.setMissionContext(session.missionContext);
        if (session.scanMode) setScanMode(session.scanMode);
      } catch (e) { console.warn('[Orion.Session] Restore failed'); }
    }
  };

  function showToast(msg) { Orion.Interaction.Toast.show(msg); }
  window.showToast = showToast;
  function updateCameraAltitude() { Orion.Interaction.Camera.updateAltitude(); }


  function shouldBlendStreetImagery(height) {
    if (state.cleanEarth) {
      return height < 2800000;
    }

    return height < ORBITAL_ALTITUDE_CUTOFF;
  }

  function targetStreetDetailAlpha(height) {
    if (!shouldBlendStreetImagery(height)) {
      return 0;
    }

    if (state.cleanEarth) {
      return state.platformLayers.weatherRadar ? 0.58 : 0.9;
    }

    if (height > 820000) {
      return smoothstep((ORBITAL_ALTITUDE_CUTOFF - height) / (ORBITAL_ALTITUDE_CUTOFF - 820000)) * 0.24;
    }

    if (height > 520000) {
      return 0.24 + smoothstep((820000 - height) / 300000) * 0.66;
    }

    return 0.9;
  }

  function targetStreetRoadsAlpha(height) {
    var alpha = 0;

    if (height > 60000) {
      alpha = 0;
    } else if (height > 18000) {
      alpha = smoothstep((60000 - height) / 42000) * 0.35;
    } else if (height > 6000) {
      alpha = 0.35 + smoothstep((18000 - height) / 12000) * 0.65;
    } else {
      alpha = 1.0;
    }

    if (state.platformLayers.weatherRadar) {
      alpha = Math.min(alpha, 0.28);
    }

    return alpha;
  }

  function prefetchStreetDetailTiles(height) {
    if (!streetDetailLayer || !shouldBlendStreetImagery(height) || height < 400000) {
      return;
    }

    if (streetDetailAlpha < 0.04) {
      streetDetailLayer.show = true;
      streetDetailLayer.alpha = 0.005;
      streetDetailLayer.splitDirection = Cesium.SplitDirection.NONE;
    }
    
  }

  function updateStreetDetailBlend(height) {
    if (!streetDetailLayer) {
      return;
    }

    if (!shouldBlendStreetImagery(height)) {
      window.cancelAnimationFrame(detailBlendFrame);
      applyStreetDetailAlpha(0);
      applyStreetRoadsAlpha(0);
      syncImagerySplitMode();
      return;
    }

    prefetchStreetDetailTiles(height);

    var targetAlpha = targetStreetDetailAlpha(height);
    var targetRoadsAlpha = targetStreetRoadsAlpha(height);

    var detailDone = Math.abs(targetAlpha - streetDetailAlpha) < 0.012;
    var roadsDone = Math.abs(targetRoadsAlpha - streetRoadsAlpha) < 0.012;

    if (detailDone && roadsDone) {
      applyStreetDetailAlpha(targetAlpha);
      applyStreetRoadsAlpha(targetRoadsAlpha);
      return;
    }

    window.cancelAnimationFrame(detailBlendFrame);

    function animateBlend() {
      var k = 0.3;
      streetDetailAlpha += (targetAlpha - streetDetailAlpha) * k;
      streetRoadsAlpha += (targetRoadsAlpha - streetRoadsAlpha) * k;
      applyStreetDetailAlpha(streetDetailAlpha);
      applyStreetRoadsAlpha(streetRoadsAlpha);

      var stillGoing =
        Math.abs(targetAlpha - streetDetailAlpha) > 0.012 ||
        Math.abs(targetRoadsAlpha - streetRoadsAlpha) > 0.012;

      if (stillGoing) {
        detailBlendFrame = window.requestAnimationFrame(animateBlend);
      } else {
        applyStreetDetailAlpha(targetAlpha);
        applyStreetRoadsAlpha(targetRoadsAlpha);
      }
    }

    animateBlend();
  }

  function applyStreetDetailAlpha(alpha) {
    var height = viewer && viewer.camera ? viewer.camera.positionCartographic.height : 0;

    if (!shouldBlendStreetImagery(height)) {
      streetDetailAlpha = 0;
      if (streetDetailLayer) {
        streetDetailLayer.show = false;
        streetDetailLayer.alpha = 0;
        streetDetailLayer.splitDirection = Cesium.SplitDirection.NONE;
      }
    } else {
      streetDetailAlpha = clamp(alpha, 0, 0.9);
      var detailCross = smoothstep(clamp(streetDetailAlpha / 0.96, 0, 1));
      var tilesReady = viewer && viewer.scene && viewer.scene.globe &&
        (viewer.scene.globe.tilesLoaded !== false);
      var showDetail = detailCross > 0.02 && (detailCross > 0.42 || tilesReady);

      if (streetDetailLayer) {
        streetDetailLayer.show = showDetail;
        streetDetailLayer.alpha = showDetail ? detailCross * 0.96 : 0;
        streetDetailLayer.splitDirection = Cesium.SplitDirection.NONE;
      }
    }

    activeImageryLayers.concat(stagedImageryLayers).forEach(function (layer) {
      if (!imageryLayerExists(layer)) {
        return;
      }

      applyLayerDisplayAlpha(layer);
    });

    if (viewer) {
      viewer.scene.requestRender();
    }

    if (elements.mapDetailLabel) {
      elements.mapDetailLabel.textContent = mapDetailLabel();
    }
  }

  function applyStreetRoadsAlpha(alpha) {
    streetRoadsAlpha = clamp(alpha, 0, 1.0);
    var roadCross = smoothstep(clamp(streetRoadsAlpha, 0, 1));

    if (streetRoadsLayer) {
      streetRoadsLayer.show = roadCross > 0.01;
      streetRoadsLayer.alpha = roadCross;
    }

    activeImageryLayers.concat(stagedImageryLayers).forEach(function (layer) {
      if (imageryLayerExists(layer)) {
        applyLayerDisplayAlpha(layer);
      }
    });

    if (viewer) {
      raiseOperationalLayers();
      viewer.scene.requestRender();
    }
  }

  function applyLayerDisplayAlpha(layer) {
    if (!layer) {
      return;
    }

    var targetAlpha = typeof layer.orionTargetAlpha === "number" ? layer.orionTargetAlpha : 1;
    var fadeAlpha = typeof layer.orionFadeAlpha === "number" ? layer.orionFadeAlpha : 1;
    var height = viewer && viewer.camera ? viewer.camera.positionCartographic.height : 0;

    if (layer.orionKey === "trueColor" || layer.orionKey === "cleanEarth") {
      fadeAlpha = layer.orionAllowLowFade ? Math.max(fadeAlpha, 0.02) : Math.max(fadeAlpha, 0.92);
      var baseAlpha = targetAlpha * fadeAlpha;

      if (shouldBlendStreetImagery(height) && streetDetailLayer && streetDetailLayer.show && streetDetailAlpha > 0.55) {
        var detailCross = smoothstep(clamp(streetDetailAlpha / 0.96, 0, 1));
        baseAlpha = baseAlpha * clamp(1 - detailCross * 0.72, 0.88, 1);
      }

      layer.alpha = layer.orionAllowLowFade ? Math.max(baseAlpha, 0.02) : Math.max(baseAlpha, 0.9);
      layer.show = true;
      return;
    }

    fadeAlpha = layer.orionAllowLowFade ? Math.max(fadeAlpha, 0) : Math.max(fadeAlpha, 0.2);

    if (!shouldBlendStreetImagery(height)) {
      layer.alpha = targetAlpha * fadeAlpha;
      return;
    }

    var detailCross = smoothstep(clamp(streetDetailAlpha / 0.96, 0, 1));
    var roadCross = smoothstep(clamp(streetRoadsAlpha, 0, 1));
    var detailFadeStrength = layer.orionKey === "labels" || layer.orionKey === "sentinel" ? 0.55 : 0.45;

    if (layer.orionKey === "clouds" || layer.orionKey === "infrared" || layer.orionKey === "night") {
      detailFadeStrength = 0.25;
    }

    var osmFadeStrength = layer.orionKey === "labels" ? 0.35 : 0.2;
    var combinedFade = clamp(
      (1 - detailCross * detailFadeStrength) * (1 - roadCross * osmFadeStrength),
      0.35, 1
    );

    layer.alpha = targetAlpha * fadeAlpha * combinedFade;
  }

  function mapDetailLabel() {
    if (streetRoadsAlpha > 0.3) {
      return "Satellite + street overlay";
    }

    if (streetRoadsAlpha > 0.05) {
      return "Hybrid aerial + roads";
    }

    if (streetDetailAlpha > 0.58) {
      return "Aerial detail blend";
    }

    if (streetDetailAlpha > 0.12) {
      return "Hybrid aerial detail";
    }

    if (state.detailTier === "target") {
      return "Target detail";
    }

    if (state.detailTier === "local") {
      return "Local detail";
    }

    if (state.detailTier === "regional") {
      return "Regional detail";
    }

    return "Orbital overview";
  }

  function getCompassDirection(degrees) {
    var directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    var index = Math.round(degrees / 45) % 8;
    return directions[index];
  }

  function formatAltitude(meters) {
    if (!Number.isFinite(meters)) {
      return "--";
    }

    if (meters >= 1000000) {
      return (meters / 1000000).toFixed(2) + " Mm";
    }

    if (meters >= 1000) {
      return Math.round(meters / 1000).toLocaleString() + " km";
    }

    return Math.round(meters).toLocaleString() + " m";
  }



  function showFileModeNotice() {
    document.body.classList.add("launch-blocked");

    var notice = document.createElement("section");
    notice.className = "file-mode-notice";
    notice.setAttribute("role", "alert");
    notice.innerHTML = [
      "<div class=\"brand-mark\" aria-hidden=\"true\"></div>",
      "<p class=\"eyebrow\">Launch protocol required</p>",
      "<h2>Run Project Orion from localhost</h2>",
      "<p>CesiumJS uses browser workers and live satellite tile requests, which browsers block from file URLs.</p>",
      "<code>powershell -ExecutionPolicy Bypass -File .\\start-orion.ps1</code>",
      "<p>Then open <strong>http://127.0.0.1:4174/</strong>.</p>"
    ].join("");

    document.body.appendChild(notice);
  }

  function syncTrackingControls() {
    Object.keys(trackFilterIds).forEach(function (filter) {
      var button = elements[trackFilterIds[filter]];

      if (button) {
        button.classList.toggle("active", state.tracking.filter === filter);
      }
    });

    if (elements.trackAircraft) elements.trackAircraft.checked = state.tracking.air;
    if (elements.trackSatellites) elements.trackSatellites.checked = state.tracking.sat;
    if (elements.trackVessels) elements.trackVessels.checked = state.tracking.sea;
    if (elements.orbitalDatasetSelect) elements.orbitalDatasetSelect.value = state.orbitalDataset;
    if (elements.liveModeToggle) {
      elements.liveModeToggle.classList.toggle("active", state.tracking.live);
      elements.liveModeToggle.setAttribute("aria-pressed", state.tracking.live ? "true" : "false");
    }
  }

  function syncPlatformControls() {
    Object.keys(platformLayerDefinitions).forEach(function (layerId) {
      var control = elements[platformLayerDefinitions[layerId].controlId];

      if (control) {
        control.checked = !!state.platformLayers[layerId];
      }
    });
  }

  function syncControlState() {
    elements.timelineRange.max = String(timelineRangeMax());
    elements.compareRange.max = String(timelineRangeMax());
    elements.timelineRange.value = String(rangeFromDate(state.date));
    elements.compareRange.value = String(rangeFromDate(state.compareDate));
    elements.splitRange.value = String(state.splitPosition);

    elements.layerTrueColor.checked = state.layers.trueColor;
    elements.layerSentinel.checked = state.layers.sentinel;
    if (elements.layerCleanEarth) {
      elements.layerCleanEarth.checked = state.cleanEarth;
    }
    elements.layerClouds.checked = state.layers.clouds;
    elements.layerInfrared.checked = state.layers.infrared;
    elements.layerNight.checked = state.layers.night;
    elements.layerLabels.checked = state.layers.labels;
    if (elements.layerBoundaries) {
      elements.layerBoundaries.checked = state.layers.boundaries;
    }
    if (elements.weatherMapModeSelect) {
      elements.weatherMapModeSelect.value = state.weatherMapMode;
    }
    document.body.dataset.weatherMap = state.weatherMapMode;
    if (elements.satelliteSourceSelect) {
      elements.satelliteSourceSelect.value = state.satelliteSource;
    }

    syncTimelineModeControls();
    syncTrackingControls();
    syncPlatformControls();
    if (elements.scanModeSelect) {
      elements.scanModeSelect.value = state.scanMode;
    }
    if (elements.earthquakeFeedSelect) {
      elements.earthquakeFeedSelect.value = state.earthquakeFeed;
    }
    if (elements.earthquakeMagnitudeSelect) {
      elements.earthquakeMagnitudeSelect.value = String(state.earthquakeMinMagnitude);
    }
    if (elements.radarOpacityRange) {
      elements.radarOpacityRange.value = String(state.radarOpacity);
    }
    if (elements.radarAnimateToggle) {
      elements.radarAnimateToggle.classList.toggle("active", state.radarAnimating);
    }
    if (elements.timelapseStart) {
      elements.timelapseStart.value = formatDate(addDays(maxDate, -7));
    }
    if (elements.timelapseEnd) {
      elements.timelapseEnd.value = formatDate(maxDate);
    }
    updateSplitPosition();
    updateTelemetry();
    updateTrackingLayer(true);
    updatePlatformSystems(false);
  }

  var isInitialized = false;

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    if (window.location.protocol === "file:") {
      showFileModeNotice();
      return;
    }

    if (!isValidDate(maxDate)) {
      maxDate = latestStableGibsTime(new Date());
      minDate = addDays(maxDate, -30);
    }

    if (!isValidDate(state.date)) {
      state.date = maxDate;
    }

    if (!isValidDate(state.compareDate)) {
      state.compareDate = addDays(maxDate, -7);
    }

    cacheElements();
    document.body.dataset.scanMode = state.scanMode;
    document.body.dataset.weatherMap = state.weatherMapMode;
    enhancePlatformLayerUi();
    renderSavedLocations();
    bindEvents();
    initCameraWindowControls();

    console.log("DEBUG INIT", {
      Runtime: !!Orion.Runtime,
      Renderer: !!Orion.Renderer,
      TextureManager: !!Orion.Renderer?.TextureManager,
      Orbital: !!Orion.Renderer?.Orbital,
      Environment: !!Orion.Renderer?.Environment,
      Infrastructure: !!Orion.Renderer?.Infrastructure,
      RFHeatmap: !!Orion.Renderer?.RFHeatmap,
      Maritime: !!Orion.Renderer?.Maritime,
      Aviation: !!Orion.Renderer?.Aviation,
      Telemetry: !!Orion.Telemetry,
      CameraNet: !!Orion.Telemetry?.CameraNet
    });
    
    if (typeof Orion.Runtime.validateBoot === 'function') {
      Orion.Runtime.validateBoot();
    }

    diagnosticsManager.init();
    hardeningManager.init();
    Orion.Runtime.RenderScheduler.init();
    initViewer();
    Orion.Renderer.Orbital.init(viewer);
    Orion.Renderer.Infrastructure.CyberNetwork.init(viewer);
    Orion.Renderer.Infrastructure.UnderseaCables.init(viewer);
    Orion.Renderer.Infrastructure.PowerGrid.init(viewer);
    Orion.Renderer.Environment.SmokeSystem.init(viewer);
    Orion.Renderer.Environment.LightningSystem.init(viewer);
    Orion.Renderer.Imagery.init(viewer);
    Orion.Renderer.Maritime.init(viewer);
    Orion.Renderer.Aviation.init(viewer);
    Orion.Renderer.Cameras.init();
    
    
    Orion.Renderer.Effects.init();
    initEntityPools();
    initImageryShaders();
    providerHealthTracker.init();
    layerStateManager.init();
    cognitiveOperationsManager.init();
    cognitiveGovernanceManager.init();
    stabilityManager.init();
    replayManager.init();
    Orion.Session.restore();
    initTrackingLayer();
    initPlatformSystems();
    syncControlState();
    
    state.compareMode = false;
    elements.compareControls.hidden = true;
    elements.splitDivider.hidden = true;
    elements.compareToggle.textContent = "Split compare";
    
    hardResetImagery();
    if (isZoomWeatherMapMode(state.weatherMapMode)) {
      setZoomWeatherMapMode(state.weatherMapMode, true);
    }
    syncImagerySplitMode();
    window.setTimeout(syncImagerySplitMode, 250);
    window.setTimeout(function () {
      syncImagerySplitMode();
      repairImageryHealth();
    }, 1200);
  }

  window.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", function () {
    cognitiveOperationsManager.saveMemory();
    Orion.Session.save();
    window.cancelAnimationFrame(playbackFrame);
    window.cancelAnimationFrame(detailBlendFrame);
    window.cancelAnimationFrame(imageryFadeFrame);
    window.clearTimeout(swapCleanupTimer);
    window.clearInterval(trackingTimer);
    window.clearInterval(platformLayerTimer);
    window.clearInterval(weatherRadarTimer);
    window.clearInterval(weatherRadarAnimationTimer);
    window.clearInterval(zoomWeatherTimer);
    window.cancelAnimationFrame(weatherEffectFrame);

    if (soundEngine) {
      soundEngine.oscillator.stop();
      soundEngine.context.close();
      soundEngine = null;
    }

    if (clickHandler) {
      clickHandler.destroy();
    }
  });

  window.OrionImagery = {
    hardReset: hardResetImagery,
    rebuild: rebuildImagery,
    repair: repairImageryHealth,
    syncSplit: syncImagerySplitMode,
    getState: function () {
      return {
        active: activeImageryLayers.length,
        staged: stagedImageryLayers.length,
        gibsDate: formatDate(effectiveGibsDate(state.date)),
        timelineDate: formatDate(state.date)
      };
    }
  };
})();
