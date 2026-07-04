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
    "liveShips",
    "realtimeSatellites",
    "starlink",
    "debris"
  ]) {
    assert.equal(defaults.platformLayers[layer], false, `${layer} should default off`);
  }

  assert.equal(defaults.tracking.air, false);
  assert.equal(defaults.tracking.sat, false);
  assert.equal(defaults.tracking.sea, false);
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
  assert.equal(state.supportsHistorical, false);
  assert.equal(state.timeCapability, "live-only");
  assert.equal(state.requiresApiKey, false);
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
  const vessels = Orion.Telemetry.ProviderHealth.getProviderState("liveShips");
  const satellites = Orion.Telemetry.ProviderHealth.getProviderState("realtimeSatellites");

  assert.equal(aircraft.supportsHistorical, false);
  assert.equal(aircraft.timeCapability, "live-only");
  assert.equal(vessels.supportsHistorical, false);
  assert.equal(vessels.timeCapability, "live-only");
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
    assert.equal(provider.requiresApiKey, false, `${layerId} should not require frontend keys`);
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

test("production AIS provider is unavailable instead of synthetic fallback", () => {
  const source = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");
  const liveShipsBlock = source.match(/"liveShips": \{[\s\S]*?\n    \},\n    "cyberNetwork"/);

  assert.ok(liveShipsBlock, "liveShips server payload should be declared");
  assert.match(liveShipsBlock[0], /"provider_health": "unavailable"/);
  assert.match(liveShipsBlock[0], /"features": \[\]/);
  assert.equal(liveShipsBlock[0].includes("ATLANTIC MERCHANT"), false);
  assert.equal(liveShipsBlock[0].includes("AISStream/AISHub adapter fallback"), false);
});

test("live provider fetches tolerate incomplete upstream reads", () => {
  const source = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");

  assert.match(source, /http\.client\.IncompleteRead/);
  assert.match(source, /UPSTREAM_PAYLOAD_ERRORS/);
  assert.equal(source.includes("except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error"), false);
});

test("power grid refreshes when the viewport region changes", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(source, /lastViewportRegionKeys/);
  assert.match(source, /cameraRegionQuery\("powerGrid"\)/);
  assert.match(source, /viewportBoundPlatformLayers\.forEach/);
  assert.match(source, /refreshPlatformLayer\(layerId, true\)/);
});

test("transient basemap tile retries do not warn-spam the console", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(source, /debugLog\("ESRI tile retry:"/);
  assert.equal(source.includes("console.warn(\"ESRI tile error"), false);
});

test("historical timeline labels live-only aircraft as latest snapshot", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const primitiveRenderer = fs.readFileSync(path.join(root, "orion-renderer-primitive.js"), "utf8");

  assert.match(app, /function historicalAvailabilityLabel/);
  assert.match(app, /latest snapshot/);
  assert.match(app, /propagated/);
  assert.match(app, /Aircraft history is not available/);
  assert.match(primitiveRenderer, /var liveMode = simulationMode === "live"/);
  assert.match(primitiveRenderer, /liveMode \? self\.interpolateRecord\(record\) : Orion\.Telemetry\.Samplers\.intel\(item, time\)/);
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

  assert.match(source, /app\.js\?v=20260704-audit1/);
  assert.match(source, /orion-renderer-primitive\.js\?v=20260704-audit1/);
  assert.match(source, /orion-telemetry-health\.js\?v=20260704-audit1/);
  assert.equal(source.includes("20260701-hardening3"), false);
});

test("wildfire provider falls back to usable reference features", () => {
  const server = fs.readFileSync(path.join(root, "orion_server.py"), "utf8");
  const pages = fs.readFileSync(path.join(root, "build_pages_data.py"), "utf8");

  assert.match(server, /def wildfire_fallback_payload/);
  assert.match(server, /provider_health": "fallback"/);
  assert.match(server, /self\.send_json\(wildfire_fallback_payload/);
  assert.match(pages, /orion_server\.wildfire_fallback_payload/);
});
