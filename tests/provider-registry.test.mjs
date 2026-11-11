import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");

function loadBrowserModules(files) {
  const window = {
    location: { search: "", hostname: "arxhsz.github.io", protocol: "https:" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    Orion: {
      Runtime: {},
      Renderer: {},
      Telemetry: {},
      Intelligence: {},
      Diagnostics: {},
      Providers: {}
    },
    console
  };
  window.window = window;
  const context = vm.createContext({
    window,
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Math
  });

  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }
  return context.window.Orion;
}

test("first-run defaults keep heavy live layers off", () => {
  const Orion = loadBrowserModules(["orion-config.js"]);
  const defaults = Orion.Config.DefaultState;

  for (const layer of [
    "weatherRadar",
    "wildfires",
    "volumetricWeather",
    "lightning",
    "cameras",
    "liveAircraft",
    "realtimeSatellites",
    "starlink",
    "debris"
  ]) {
    assert.equal(defaults.platformLayers[layer], false, `${layer} should default off`);
  }

  assert.equal(defaults.tracking.air, false);
  assert.equal(defaults.tracking.sat, false);
});

test("provider registry exposes prompt-required provider state metadata", () => {
  const Orion = loadBrowserModules([
    "orion-config.js",
    "orion-provider-registry.js",
    "orion-telemetry-health.js"
  ]);

  Orion.Telemetry.ProviderHealth.init();
  const state = Orion.Telemetry.ProviderHealth.getProviderState("weatherRadar");

  assert.equal(state.id, "weatherRadar");
  assert.equal(state.supportsStaticMode, true);
  assert.equal(state.supportsLive, true);
  assert.equal(state.supportsHistorical, true);
  assert.equal(state.timeCapability, "historical-query");
  assert.match(state.attribution, /NOAA/);
  assert.equal(Orion.Telemetry.ProviderHealth.getTimeUntilRetry("weatherRadar"), 0);
});

test("tracking provider capabilities distinguish propagated from live-only data", () => {
  const Orion = loadBrowserModules([
    "orion-config.js",
    "orion-provider-registry.js",
    "orion-telemetry-health.js"
  ]);
  Orion.Telemetry.ProviderHealth.init();

  const aircraft = Orion.Telemetry.ProviderHealth.getProviderState("liveAircraft");
  const satellites = Orion.Telemetry.ProviderHealth.getProviderState("realtimeSatellites");

  assert.equal(aircraft.supportsHistorical, false);
  assert.equal(aircraft.timeCapability, "live-only");
  assert.equal(satellites.supportsHistorical, true);
  assert.equal(satellites.timeCapability, "propagated");
});

test("infrastructure providers are active selectable layers", () => {
  const Orion = loadBrowserModules([
    "orion-config.js",
    "orion-provider-registry.js",
    "orion-telemetry-health.js"
  ]);
  Orion.Telemetry.ProviderHealth.init();

  for (const layerId of ["underseaCables", "powerGrid"]) {
    const layer = Orion.Config.PlatformLayerDefinitions[layerId];
    const provider = Orion.Telemetry.ProviderHealth.getProviderState(layerId);

    assert.ok(layer, `${layerId} layer should exist`);
    assert.notEqual(layer.retired, true, `${layerId} should not be retired`);
    assert.equal(Orion.Config.DefaultState.platformLayers[layerId], false, `${layerId} should default off`);
    assert.equal(provider.supportsStaticMode, true, `${layerId} should support static Pages snapshots`);
    assert.equal(provider.supportsLive, true, `${layerId} should support local live mode`);
    assert.ok(provider.attribution, `${layerId} should expose attribution`);
  }
});

test("runtime code no longer contains removed weather tile providers", () => {
  const checkedFiles = [
    "app.js",
    "orion_server.py",
    "build_pages_data.py",
    "orion-config.js"
  ];
  const forbidden = [
    "tilecache.rainviewer.com",
    "tiles.zoom.earth",
    "ZOOM_EARTH",
    "RAINVIEWER"
  ];

  for (const file of checkedFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${file} should not include ${token}`);
    }
  }
});

test("credential-dependent AIS integration is removed", () => {
  const source = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");
  const config = fs.readFileSync(path.join(root, "orion-config.js"), "utf8");

  assert.equal(source.includes('"liveShips"'), false);
  assert.equal(config.includes("liveShips"), false);
});

test("live provider fetches tolerate incomplete upstream reads", () => {
  const source = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");

  assert.match(source, /http\.client\.IncompleteRead/);
  assert.match(source, /UPSTREAM_PAYLOAD_ERRORS/);
  assert.equal(source.includes("except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error"), false);
});

test("power grid refreshes when the viewport region changes", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");

  assert.match(source, /lastViewportRegionKeys/);
  assert.match(source, /cameraRegionQuery\("powerGrid"\)/);
  assert.match(source, /cameraHeight > 7500000/);
  assert.match(source, /return "&detail=global"/);
  assert.match(source, /"&detail=" \+ \(\(east - west <= 0\.24/);
  assert.match(source, /viewportBoundPlatformLayers\.forEach/);
  assert.match(source, /refreshPlatformLayer\(layerId, true\)/);
  assert.match(server, /ThreadPoolExecutor\(max_workers=len\(line_endpoints\) \+ 1\)/);
  assert.match(server, /if not any\(feature\.get\("kind"\) == "line" for feature in features\)/);
  assert.match(server, /"stale": True/);
});

test("timeline swaps imagery once per provider frame and owns the final layer set", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(source, /return formatDate\(effectiveGibsDate\(date\)\)/);
  assert.match(source, /layer\.orionFrameKey = requestedFrameKey/);
  assert.match(source, /candidate\.orionProviderFrameKey === providerFrameKey/);
  assert.match(source, /requestedSignature === committedImagerySignature/);
  assert.match(source, /stagedImageryLayers = incomingLayers/);
  assert.match(source, /Imagery transaction rolled back/);
  assert.match(source, /uploadTimeout && retainedFrameReady/);
  assert.match(source, /keeping the last complete map while playback continues/);
  assert.doesNotMatch(source, /formatDate\(date\) \+ "T" \+ formatHour\(date\)/);
});

test("transient basemap tile retries do not warn-spam the console", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(source, /debugLog\("ESRI tile retry:"/);
  assert.match(source, /isStaticHostMode\(\)[\s\S]*?https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile/);
  assert.equal(source.includes("console.warn(\"ESRI tile error"), false);
});

test("observed weather uses documented NOAA times and WMS layers instead of static GOES composites", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const weather = fs.readFileSync(path.join(root, "orion-weather.js"), "utf8");
  assert.match(weather, /nowcoast\.noaa\.gov/);
  assert.match(weather, /GetCapabilities/);
  assert.match(weather, /goes_visible_imagery/);
  assert.match(source, /Orion\.FrameBuffer\.decode/);
  assert.match(source, /request: "GetMap"/);
  assert.match(source, /time: payload\.selected_time/);
  assert.doesNotMatch(source, /layers\.push\(addLayer\("goesComposite"/);
});

test("static hosting uses WMS snapshots for sparse timed GIBS products", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(source, /GIBS_WMS_ROOT = "https:\/\/gibs\.earthdata\.nasa\.gov\/wms\/epsg4326\/best\/wms\.cgi"/);
  assert.match(source, /var useWmsSnapshot = definition\.providerType === "wmsSnapshot" \|\| \(definition\.timed && \(state\.playing \|\| gibsPreloadCollector\)/);
  assert.match(source, /gibsFrameBuffer\.get\(snapshotUrl/);
  assert.match(source, /definition\.layers \|\| \[definition\.layer\]/);
  assert.match(source, /: formatDate\(effectiveGibsDate\(date\)\)/);
});

test("historical timeline labels live-only aircraft as latest snapshot", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const primitiveRenderer = fs.readFileSync(path.join(root, "orion-renderer-primitive.js"), "utf8");

  assert.match(app, /function historicalAvailabilityLabel/);
  assert.match(app, /latest snapshot/);
  assert.match(app, /propagated/);
  assert.match(app, /Aircraft history is not available/);
  assert.match(primitiveRenderer, /var liveMode = simulationMode === "live"/);
  assert.match(primitiveRenderer, /Orion\.Telemetry\.Samplers\.intel\(item, time\) \|\| record\.current \|\| item/);
});

test("platform renderers are rebound and guarded after boot recovery", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(source, /function ensureRuntimeBootDependencies/);
  assert.match(source, /Orion\.Runtime\.RenderScheduler =/);
  assert.match(source, /Orion\.Telemetry\.ProviderHealth =/);
  assert.match(source, /Orion\.Renderer\.TextureManager =/);
  assert.match(source, /function bindPlatformRendererModules/);
  assert.match(source, /function renderWithPlatformRenderer/);
  assert.equal(source.includes("AviationRenderer.render("), false);
  assert.equal(source.includes("MaritimeRenderer.render("), false);
  assert.equal(source.includes("OrbitalRenderer.render("), false);
  assert.match(source, /renderer unavailable/);
});

test("html asset version is bumped for updated runtime modules", () => {
  const source = fs.readFileSync(path.join(root, "index.html"), "utf8");

  assert.match(source, /app\.js\?v=20261111-context6/);
  assert.match(source, /orion-config\.js\?v=20261110-reliability1/);
  assert.match(source, /orion-onboarding\.js\?v=20261110-reliability1/);
  assert.match(source, /cameranet_frontend\.js\?v=20261111-spatial1/);
  assert.match(source, /orion-renderer-primitive\.js\?v=20261110-reliability1/);
  assert.match(source, /orion-telemetry-health\.js\?v=20261110-reliability1/);
  assert.equal(source.includes("20260701-hardening3"), false);
});

test("camera and orbital layers have a single viewport and control owner", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const configSource = fs.readFileSync(path.join(root, "orion-config.js"), "utf8");
  const cameraSource = fs.readFileSync(path.join(root, "cameranet_frontend.js"), "utf8");

  assert.match(appSource, /viewportBoundPlatformLayers = \["powerGrid"\]/);
  assert.match(appSource, /state\.orbitalDataset === "all" \? \["realtimeSatellites"\]/);
  assert.match(appSource, /if \(!viewer \|\| imageryTransitionActive\)/);
  assert.equal(cameraSource.includes("prefetchContinentalUS"), false);
  assert.equal(cameraSource.includes("camera.changed.addEventListener"), false);
  assert.match(cameraSource, /requestVersion !== cameraNetState\.requestVersion/);
  assert.match(cameraSource, /activeFetchController\.abort\(\)/);
  assert.match(cameraSource, /function screenClusterCameras/);
  assert.match(cameraSource, /new Cesium\.EllipsoidalOccluder/);
  assert.match(appSource, /if \(layerId === "cameras"\) \{[\s\S]*?clearPlatformLayer\(layerId\);[\s\S]*?renderCamerasAsPrimitives\(items\)/);
  assert.match(appSource, /if \(layerId === "cameras" && window\.CameraNet\) \{\s*return;/);
  assert.match(configSource, /satInternet:[\s\S]*?controlId: null/);
  assert.match(appSource, /var lastIntelListSignature = ""/);
  assert.match(appSource, /if \(listSignature === lastIntelListSignature\)/);
});

test("operational feeds are session-scoped and do not restore at boot", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const sessionRestore = appSource.match(/restore: function\(\) \{[\s\S]*?\n    \}\n  \};/);

  assert.doesNotMatch(appSource, /applyKnownBooleanMap\(target\.platformLayers, saved\.platformLayers/);
  assert.doesNotMatch(appSource, /applyKnownBooleanMap\(target\.tracking, saved\.tracking/);
  assert.doesNotMatch(appSource, /platformLayers: state\.platformLayers/);
  assert.match(appSource, /target\.platformLayers\[layerId\] = false/);
  assert.ok(sessionRestore, "session restore implementation should exist");
  assert.equal(sessionRestore[0].includes("setScanMode(session.scanMode)"), false);
  assert.match(sessionRestore[0], /state\.scanMode =/);
});

test("provider health takes precedence over fallback diagnostics", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(appSource, /var providerStatus = String\(payload\.provider_health \|\| ""\)\.toLowerCase\(\)/);
  assert.match(appSource, /"online", "degraded", "fallback", "unavailable", "empty"/);
  assert.doesNotMatch(appSource, /payload\.provider_health === "degraded"/);
});

test("satellite primitives use stable pick ids and globe depth testing", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const primitiveSource = fs.readFileSync(path.join(root, "orion-renderer-primitive.js"), "utf8");

  assert.match(appSource, /platformEntityKey\(layerId, item && \(item\.id \|\| item\.name\) \|\| index\)/);
  assert.match(primitiveSource, /disableDepthTestDistance: 0/);
  assert.match(primitiveSource, /this\.renderTime = time instanceof Date/);
  assert.equal((primitiveSource.match(/height > 26000000/g) || []).length, 2);
  assert.equal(primitiveSource.includes("height > 12000000"), false);
});

test("orbital dataset switches preserve satellite tracking atomically", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(appSource, /var satellitesEnabled = state\.tracking\.sat/);
  assert.match(appSource, /if \(satellitesEnabled\) \{\s*trackingDomainSyncPaused = true/);
  assert.match(appSource, /trackingDomainSyncPaused = false;\s*state\.tracking\.sat = true/);
});

test("CameraNet publishes verified live video without still-image fallback or synthetic fill", () => {
  const providersSource = fs.readFileSync(path.join(root, "camera_providers.py"), "utf8");
  const cameraSource = fs.readFileSync(path.join(root, "cameranet_frontend.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");
  const pagesSource = fs.readFileSync(path.join(root, "build_pages_data.py"), "utf8");

  assert.equal(providersSource.includes("USCoverageFillProvider"), false);
  assert.match(providersSource, /publicwebcam-wptv-pbi/);
  assert.match(cameraSource, /function includeTargetInBbox/);
  assert.match(cameraSource, /function renderEmbeddedFeed/);
  assert.match(cameraSource, /function cameraHasLiveVideo/);
  assert.match(cameraSource, /function renderLiveUnavailable/);
  assert.equal(cameraSource.includes("function renderSnapshot"), false);
  assert.equal(cameraSource.includes("periodic image"), false);
  assert.equal(cameraSource.includes("SNAPSHOT FALLBACK"), false);
  assert.match(cameraSource, /isStaticHostMode\(\) \|\| !camera\.stream_url/);
  assert.match(providersSource, /def camera_has_live_video/);
  assert.match(pagesSource, /live_camera_record\(camera, allow_resolver=False\)/);
  assert.match(pagesSource, /get_all_cameras\(None, None, None\)/);
  assert.match(serverSource, /def camera_priority\(camera\)/);
  assert.match(serverSource, /media_priority = 0 if camera\.get\("embed_url"\) else 1/);
  assert.equal(serverSource.includes('if self.path.startswith("/camera/snapshot")'), false);
  assert.equal(serverSource.includes("def proxy_camera_snapshot"), false);
});

test("wildfire provider reports upstream failure instead of substituting fabricated incidents", () => {
  const server = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");
  const pages = fs.readFileSync(path.join(root, "build_pages_data.py"), "utf8");
  assert.match(server, /self\.send_json\(hazards\("wildfires"\)/);
  assert.match(server, /"Event provider unavailable"/);
  assert.doesNotMatch(server, /self\.send_json\(wildfire_fallback_payload/);
  assert.match(pages, /ORION_SYNTHETIC_INTEL", "0"/);
});

test("Open-Meteo field modes render a real global grid", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");
  const pages = fs.readFileSync(path.join(root, "build_pages_data.py"), "utf8");

  assert.match(app, /function buildWeatherFieldTexture/);
  assert.match(app, /new Cesium\.SingleTileImageryProvider/);
  assert.match(server, /def fetch_open_meteo_weather_grid/);
  assert.match(server, /"mode": "live-global-grid"/);
  assert.match(pages, /orion_server\.open_meteo_weather_field_payload/);
  assert.doesNotMatch(server, /"mode": "metadata-only"/);
});

test("satellite details convert radians per minute into orbital period", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(app, /return \(Math\.PI \* 2\) \/ radiansPerMinute/);
  assert.match(app, /\["Element age", item\.tleEpoch \? detailAgeValue/);
  assert.doesNotMatch(app, /1440 \/ Math\.max\(0\.0001, item\.satrec\.no\)/);
});

test("compact HUD panels collapse peers before expanding", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(app, /window\.matchMedia\("\(max-width: 760px\)"\)\.matches/);
  assert.match(app, /collapseCompactPanel\("telemetryPanel"/);
  assert.match(app, /collapseCompactTimeline\(\)/);
  assert.match(app, /function normalizeCompactHudStartup\(\)/);
});
