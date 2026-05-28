(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Config = {};
  var staticHost = new URLSearchParams(window.location.search || "").get("orionStatic") === "1" ||
    !/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(window.location.hostname || "");
  var gibsRoot = staticHost
    ? "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
    : "/gibs/wmts/epsg3857/best";
  var gibsNrtRoot = staticHost
    ? "https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt"
    : "/gibs/wmts/epsg3857/nrt";

  Orion.Config.LayerDefinitions = {
    trueColor: {
      name: "NASA GIBS / VIIRS NOAA-20",
      layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
      matrixSet: "GoogleMapsCompatible_Level9",
      extension: "jpg",
      maximumLevel: 9,
      alpha: 0.98,
      brightness: 0.94,
      contrast: 1.12,
      saturation: 1.08,
      timed: true
    },
    sentinel: {
      name: "NASA HLS / Sentinel-2 MSI",
      layer: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance",
      matrixSet: "GoogleMapsCompatible_Level12",
      extension: "png",
      maximumLevel: 12,
      alpha: 0.52,
      brightness: 0.98,
      contrast: 1.2,
      saturation: 1.16,
      timed: true
    },
    clouds: {
      name: "NASA GIBS / VIIRS NOAA-20 cloud optical thickness",
      layer: "VIIRS_NOAA20_Cloud_Optical_Thickness",
      matrixSet: "GoogleMapsCompatible_Level7",
      extension: "png",
      maximumLevel: 7,
      alpha: 0.36,
      brightness: 1.02,
      contrast: 1.25,
      saturation: 0.92,
      timed: true
    },
    infrared: {
      name: "NASA GIBS / MODIS thermal cloud tops",
      layer: "MODIS_Terra_Cloud_Top_Temp_Day",
      matrixSet: "GoogleMapsCompatible_Level6",
      extension: "png",
      maximumLevel: 6,
      alpha: 0.42,
      brightness: 1.05,
      contrast: 1.28,
      saturation: 1.04,
      timed: true
    },
    night: {
      name: "NASA GIBS / VIIRS NOAA-20 day-night band",
      layer: "VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance",
      matrixSet: "GoogleMapsCompatible_Level8",
      extension: "png",
      maximumLevel: 8,
      alpha: 0.58,
      brightness: 1.12,
      contrast: 1.2,
      saturation: 0.78,
      timed: true
    },
    labels: {
      name: "NASA GIBS / reference labels",
      layer: "Reference_Labels",
      matrixSet: "GoogleMapsCompatible_Level9",
      extension: "png",
      maximumLevel: 9,
      alpha: 0.82,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      timed: false
    },
    cleanEarth: {
      name: "NASA GIBS / Blue Marble (Cloud-free)",
      layer: "BlueMarble_ShadedRelief_Bathymetry",
      matrixSet: "GoogleMapsCompatible_Level8",
      extension: "jpg",
      maximumLevel: 8,
      alpha: 1.0,
      brightness: 1.0,
      contrast: 1.1,
      saturation: 1.0,
      timed: false
    },
    goesEast: {
      name: "NOAA GOES-East GeoColor NRT",
      root: gibsNrtRoot,
      layer: "GOES-East_ABI_GeoColor_v0_NRT",
      matrixSet: "GoogleMapsCompatible_Level7",
      extension: "png",
      maximumLevel: 7,
      alpha: 0.9,
      brightness: 1.0,
      contrast: 1.08,
      saturation: 1.06,
      timed: false
    },
    goesWest: {
      name: "NOAA GOES-West GeoColor NRT",
      root: gibsNrtRoot,
      layer: "GOES-West_ABI_GeoColor_v0_NRT",
      matrixSet: "GoogleMapsCompatible_Level7",
      extension: "png",
      maximumLevel: 7,
      alpha: 0.9,
      brightness: 1.0,
      contrast: 1.08,
      saturation: 1.06,
      timed: false
    }
  };

  Orion.Config.PlatformLayerDefinitions = {
    realtimeSatellites: {
      label: "Real satellites",
      source: "CelesTrak",
      type: "satellite",
      endpoint: "/live/satellites?group=stations",
      controlId: "platformSatellites",
      maxItems: 12000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#f3c46b",
      trail: true
    },
    starlink: {
      label: "Starlink shell",
      source: "CelesTrak Starlink",
      type: "satellite",
      endpoint: "/live/satellites?group=starlink",
      controlId: "platformStarlink",
      maxItems: 12000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#f7f7f7",
      trail: true
    },
    debris: {
      label: "Orbital debris",
      source: "CelesTrak debris",
      type: "satellite",
      endpoint: "/live/satellites?group=debris",
      controlId: "platformDebris",
      maxItems: 16000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#ff8f76",
      trail: true
    },
    satInternet: {
      label: "Internet constellations",
      source: "CelesTrak Starlink / OneWeb / Iridium / IoT",
      type: "satellite",
      endpoint: "/live/satellites?group=internet",
      controlId: "platformSatellites",
      maxItems: 30000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#f7f7f7",
      trail: true
    },
    satCommunications: {
      label: "Communications sats",
      source: "CelesTrak communications groups",
      type: "satellite",
      endpoint: "/live/satellites?group=communications",
      controlId: "platformSatellites",
      maxItems: 24000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#d8dcff",
      trail: true
    },
    satPositioning: {
      label: "Positioning / GNSS",
      source: "CelesTrak GNSS groups",
      type: "satellite",
      endpoint: "/live/satellites?group=positioning",
      controlId: "platformSatellites",
      maxItems: 16000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#9be7ff",
      trail: true
    },
    satEarthImaging: {
      label: "Earth imaging",
      source: "CelesTrak resource / Planet / Spire",
      type: "satellite",
      endpoint: "/live/satellites?group=earth-imaging",
      controlId: "platformSatellites",
      maxItems: 18000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#b7f7c6",
      trail: true
    },
    satWeather: {
      label: "Weather satellites",
      source: "CelesTrak weather groups",
      type: "satellite",
      endpoint: "/live/satellites?group=weather",
      controlId: "platformSatellites",
      maxItems: 12000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#ffffff",
      trail: true
    },
    satScience: {
      label: "Science satellites",
      source: "CelesTrak science groups",
      type: "satellite",
      endpoint: "/live/satellites?group=science",
      controlId: "platformSatellites",
      maxItems: 12000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#ead8ff",
      trail: true
    },
    satIot: {
      label: "IoT constellations",
      source: "CelesTrak IoT groups",
      type: "satellite",
      endpoint: "/live/satellites?group=iot",
      controlId: "platformSatellites",
      maxItems: 12000,
      refreshMs: 6 * 60 * 60 * 1000,
      color: "#ffe29a",
      trail: true
    },
    earthquakes: {
      label: "Earthquakes",
      source: "USGS",
      type: "earthquake",
      endpoint: "/live/earthquakes",
      controlId: "platformEarthquakes",
      maxItems: 5000,
      refreshMs: 60 * 1000,
      color: "#ffb0a6"
    },
    cameras: {
      label: "CameraNet USA",
      source: "Public DOT/511 CameraNet",
      type: "camera",
      endpoint: "/live/cameras?provider=all",
      controlId: "platformCameras",
      maxItems: 30000,
      refreshMs: 45 * 1000,
      color: "#ffffff"
    },
    weatherRadar: {
      label: "Weather radar",
      source: "RainViewer",
      type: "weatherRadar",
      endpoint: "/live/weather/radar",
      controlId: "platformWeatherRadar",
      refreshMs: 5 * 60 * 1000,
      color: "#ffffff"
    },
    liveShips: {
      label: "AIS vessels",
      source: "AIS stream adapter",
      type: "moving",
      endpoint: "/live/intel?layer=liveShips",
      controlId: "platformLiveShips",
      maxItems: 10000,
      refreshMs: 60 * 1000,
      color: "#a6b7ff",
      trail: true
    },
    liveAircraft: {
      label: "ADSB aircraft",
      source: "OpenSky / FlightAware adapter",
      type: "moving",
      endpoint: "/live/aircraft",
      controlId: "platformAircraft",
      maxItems: 10000,
      refreshMs: 30 * 1000,
      color: "#c8d2ff",
      trail: true
    },
    wildfires: {
      label: "Wildfires",
      source: "NASA EONET",
      type: "intel",
      endpoint: "/live/wildfires",
      controlId: "platformWildfires",
      maxItems: 5000,
      refreshMs: 5 * 60 * 1000,
      color: "#ff8f76"
    },
    cyberNetwork: {
      label: "Cyber arcs",
      source: "Cloudflare / RIPE / BGP adapter",
      type: "intel",
      endpoint: "/live/intel?layer=cyberNetwork",
      controlId: "platformCyber",
      maxItems: 5000,
      refreshMs: 2 * 60 * 1000,
      color: "#d8dcff"
    },
    defenseAirspace: {
      label: "Defense airspace",
      source: "FAA NOTAM / TFR adapter",
      type: "intel",
      endpoint: "/live/intel?layer=defenseAirspace",
      controlId: "platformAirspace",
      maxItems: 5000,
      refreshMs: 5 * 60 * 1000,
      color: "#fff0a5"
    },
    underseaCables: {
      label: "Undersea cables",
      source: "Submarine cable GeoJSON adapter",
      type: "intel",
      endpoint: "/live/intel?layer=underseaCables",
      controlId: "platformCables",
      maxItems: 5000,
      refreshMs: 15 * 60 * 1000,
      color: "#b7ecff"
    },
    powerGrid: {
      label: "Power grid",
      source: "EIA / GridStatus / ENTSO-E adapter",
      type: "intel",
      endpoint: "/live/intel?layer=powerGrid",
      controlId: "platformPower",
      maxItems: 5000,
      refreshMs: 5 * 60 * 1000,
      color: "#ffe29a"
    },
    rfHeatmap: {
      label: "RF heatmap",
      source: "OpenCellID / WiGLE adapter",
      type: "intel",
      endpoint: "/live/intel?layer=rfHeatmap",
      controlId: "platformRf",
      maxItems: 5000,
      refreshMs: 10 * 60 * 1000,
      color: "#d3f2ff"
    },
    emergencyIncidents: {
      label: "Emergency incidents",
      source: "NWS active alerts / emergency adapter",
      type: "intel",
      endpoint: "/live/intel?layer=emergencyIncidents",
      controlId: "platformEmergency",
      maxItems: 5000,
      refreshMs: 2 * 60 * 1000,
      color: "#ffb3a8"
    },
    volumetricWeather: {
      label: "Weather volume",
      source: "NOAA / RainViewer adapter",
      type: "intel",
      endpoint: "/live/intel?layer=volumetricWeather",
      controlId: "platformWeatherVolume",
      maxItems: 5000,
      refreshMs: 5 * 60 * 1000,
      color: "#ffffff"
    },
    lightning: {
      label: "Lightning",
      source: "Blitzortung / NOAA adapter",
      type: "intel",
      endpoint: "/live/intel?layer=lightning",
      controlId: "platformLightning",
      maxItems: 5000,
      refreshMs: 45 * 1000,
      color: "#f8fbff"
    },
    socialEvents: {
      label: "Event heat",
      source: "Ticketmaster / Meetup adapter",
      type: "intel",
      endpoint: "/live/intel?layer=socialEvents",
      controlId: "platformEvents",
      maxItems: 5000,
      refreshMs: 10 * 60 * 1000,
      color: "#ead8ff"
    },
    airCorridors: {
      label: "Air corridors",
      source: "FAA / OpenSky routes",
      type: "intel",
      endpoint: "/live/intel?layer=airCorridors",
      controlId: "platformAirCorridors",
      maxItems: 5000,
      refreshMs: 10 * 60 * 1000,
      color: "#c8d2ff"
    },
    traffic: {
      label: "Traffic flow",
      source: "FL511 public congestion / provider adapter",
      type: "intel",
      endpoint: "/live/intel?layer=traffic",
      controlId: "platformTraffic",
      maxItems: 5000,
      refreshMs: 2 * 60 * 1000,
      color: "#ffffff"
    },
    cities3d: {
      label: "3D cities",
      source: "Cesium OSM Buildings",
      type: "tileset",
      controlId: "platformCities",
      refreshMs: 24 * 60 * 60 * 1000,
      color: "#ffffff"
    },
    soundscape: {
      label: "Sound engine",
      source: "Orion procedural sound engine",
      type: "sound",
      controlId: "platformSound",
      refreshMs: 24 * 60 * 60 * 1000,
      color: "#ffffff"
    }
  };

  Orion.Config.PlatformLayerCategories = {
    realtimeSatellites: "Orbital",
    starlink: "Orbital",
    debris: "Orbital",
    satInternet: "Orbital",
    satCommunications: "Orbital",
    satPositioning: "Orbital",
    satEarthImaging: "Orbital",
    satWeather: "Orbital",
    satScience: "Orbital",
    satIot: "Orbital",
    liveShips: "Air / Sea",
    liveAircraft: "Air / Sea",
    airCorridors: "Air / Sea",
    weatherRadar: "Environment",
    earthquakes: "Environment",
    wildfires: "Environment",
    volumetricWeather: "Environment",
    lightning: "Environment",
    cameras: "Ground Cameras",
    cyberNetwork: "Cyber",
    underseaCables: "Cyber",
    defenseAirspace: "Airspace",
    powerGrid: "Infrastructure",
    cities3d: "Infrastructure",
    rfHeatmap: "Heatmaps",
    emergencyIncidents: "Heatmaps",
    socialEvents: "Heatmaps",
    traffic: "Heatmaps",
    soundscape: "Mission"
  };

  Object.keys(Orion.Config.PlatformLayerDefinitions).forEach(function (layerId) {
    Orion.Config.PlatformLayerDefinitions[layerId].category = Orion.Config.PlatformLayerCategories[layerId] || "Intel";
  });

  Orion.Config.TrackingDefinitions = [
    {
      id: "air-orion-121",
      type: "air",
      name: "ORION 121",
      detail: "Recon aircraft",
      periodHours: 8.4,
      phase: 0.08,
      route: [[-122.38, 37.62, 11200], [-104.67, 39.86, 11600], [-87.9, 41.98, 10900], [-73.78, 40.64, 10300]]
    },
    {
      id: "air-pacific-echo",
      type: "air",
      name: "PACIFIC ECHO",
      detail: "Long-haul aircraft",
      periodHours: 10.8,
      phase: 0.41,
      route: [[139.78, 35.55, 11800], [158.2, 40.8, 12000], [-168.6, 47.4, 11700], [-149.99, 61.17, 10800]]
    },
    {
      id: "air-atlantic-7",
      type: "air",
      name: "ATLANTIC 7",
      detail: "Cargo aircraft",
      periodHours: 7.6,
      phase: 0.64,
      route: [[-0.45, 51.47, 11300], [-24.8, 53.0, 11400], [-52.75, 47.62, 11100], [-73.57, 45.5, 10500]]
    },
    {
      id: "air-desert-med",
      type: "air",
      name: "DESERT MED",
      detail: "Med aircraft",
      periodHours: 6.7,
      phase: 0.23,
      route: [[55.36, 25.25, 10400], [43.8, 29.4, 10800], [32.0, 30.1, 9800], [12.25, 41.8, 9400]]
    },
    {
      id: "sat-iss-vector",
      type: "sat",
      name: "ISS VECTOR",
      detail: "Orbital platform",
      periodHours: 1.55,
      phase: 0.17,
      inclination: 51.6,
      longitudeRate: 232,
      longitudeOffset: -32,
      height: 420000
    },
    {
      id: "sat-sentinel-2a",
      type: "sat",
      name: "SENTINEL 2A",
      detail: "Earth observation",
      periodHours: 1.69,
      phase: 0.52,
      inclination: 98.6,
      longitudeRate: 214,
      longitudeOffset: 64,
      height: 786000
    },
    {
      id: "sat-landsat-9",
      type: "sat",
      name: "LANDSAT 9",
      detail: "Earth observation",
      periodHours: 1.65,
      phase: 0.76,
      inclination: 98.2,
      longitudeRate: 219,
      longitudeOffset: 118,
      height: 705000
    },
    {
      id: "sat-relay-44",
      type: "sat",
      name: "RELAY 44",
      detail: "Comms satellite",
      periodHours: 1.48,
      phase: 0.34,
      inclination: 53.0,
      longitudeRate: 248,
      longitudeOffset: -128,
      height: 550000
    },
    {
      id: "sea-arctic-meridian",
      type: "sea",
      name: "ARCTIC MERIDIAN",
      detail: "Container vessel",
      periodHours: 86,
      phase: 0.13,
      route: [[4.46, 51.95, 30], [-5.8, 49.4, 30], [-22.0, 46.8, 30], [-45.0, 42.2, 30], [-72.2, 40.1, 30]]
    },
    {
      id: "sea-suez-pilot",
      type: "sea",
      name: "SUEZ PILOT",
      detail: "Tanker",
      periodHours: 64,
      phase: 0.49,
      route: [[32.34, 29.95, 30], [33.4, 25.7, 30], [38.9, 18.5, 30], [48.7, 14.2, 30], [56.3, 23.7, 30]]
    },
    {
      id: "sea-pacific-trader",
      type: "sea",
      name: "PACIFIC TRADER",
      detail: "Bulk carrier",
      periodHours: 118,
      phase: 0.72,
      route: [[-122.7, 37.6, 30], [-139.0, 37.8, 30], [-162.0, 35.2, 30], [166.0, 33.8, 30], [140.4, 34.7, 30]]
    },
    {
      id: "sea-gulf-watch",
      type: "sea",
      name: "GULF WATCH",
      detail: "Patrol vessel",
      periodHours: 42,
      phase: 0.31,
      route: [[-94.6, 28.8, 30], [-90.0, 28.4, 30], [-85.3, 27.8, 30], [-82.2, 25.2, 30], [-87.2, 23.8, 30]]
    }
  ];

  Orion.Config.Constants = {
    MS_PER_DAY: 24 * 60 * 60 * 1000,
    MS_PER_HOUR: 60 * 60 * 1000,
    GIBS_IMAGERY_LAG_DAYS: 1,
    GIBS_ROOT: gibsRoot,
    STATIC_HOST: staticHost,
    EARTH_HOME: { west: -168, south: -56, east: 24, north: 76 },
    SAVED_LOCATIONS_KEY: "orion:savedLocations",
    TRACK_EPOCH: Date.UTC(2026, 0, 1, 0, 0, 0),
    TRACK_SOURCE_LABEL: "Synthetic mission feed"
  };

  window.Orion = Orion;

})(window);
