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
  assert.equal(state.requiresApiKey, false);
  assert.match(state.attribution, /NOAA/);
  assert.equal(Orion.Telemetry.ProviderHealth.getTimeUntilRetry("weatherRadar"), 0);
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
