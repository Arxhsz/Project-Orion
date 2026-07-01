# Project Orion Audit

Audit date: 2026-07-01

## Scope

This audit covers the static CesiumJS frontend, optional Python backend, GitHub Pages workflow, static data builder, CameraNet adapters, render modules, styles, launcher scripts, and documentation currently present in the repository.

## Architecture Summary

- Static entry point: `index.html`.
- Primary application controller: `app.js` at 11,547 lines.
- Configuration: `orion-config.js`.
- Modular renderers: `orion-renderer-*.js`.
- Runtime/diagnostics/health modules: `orion-core.js`, `orion-runtime-state.js`, `orion-telemetry-health.js`, `orion-performance-budget.js`, `orion-diagnostics.js`.
- CameraNet frontend: `cameranet_frontend.js`.
- Local backend: `orion_server.py`.
- Camera providers: `camera_providers.py`.
- GitHub Pages data builder: `build_pages_data.py`.
- Deployment: `.github/workflows/pages.yml`.

## Console Error Inventory

Static inspection found these active or likely console failures:

- `app.js` calls `providerHealthTracker.getTimeUntilRetry(layerId)`, but `orion-telemetry-health.js` does not define that method. This can throw during provider retry/backoff.
- Static-host radar builds tile URLs directly to `https://tilecache.rainviewer.com`, which is known to return browser CORS/rate-limit failures and can spam Cesium imagery errors.
- Weather modes use `tiles.zoom.earth` and `/zoom-earth/*` paths. These are not documented public API endpoints for reuse and violate the project rule against private network endpoints.
- `orion-core.js`, `orion-diagnostics.js`, `orion-renderer-imagery.js`, `orion-renderer-primitive.js`, `orion-texture-manager.js`, and `loading_screen.js` contain production `console.log` or `console.warn` calls. Some are debug-only, but several run at every boot.
- `orion-core.js` creates placeholder renderer/replay/session methods during boot validation and logs placeholder warnings. This masks missing modules rather than expressing feature availability.

Browser validation still needs to compare a live pre-change and post-change console capture. The baseline static code paths above are the primary known error sources.

## 404 Asset Request Inventory

Repository assets present:

- `assets/orion-logo.svg`
- `assets/screenshots/orion-earth.png`
- `assets/screenshots/orion-loading.png`
- `assets/screenshots/orion-timeline.png`
- `loading_images/earth1.jpg`
- `loading_images/earth1.svg`
- `loading_images/earth2.jpg`
- `loading_images/earth3.jpg`
- `loading_images/earth4.jpg`

No repository reference was found for the prompt's missing assets `0.png`, `1.jpg`, `2.png`, `2.jpg`, `3.png`, `3.jpg`, `4.png`, `5.png`, `6.png`, `7.png`, or `9.png`. Those requests likely came from an older loading-screen revision or a remote deployment cache. The current loading screen references only `earth1.jpg` through `earth4.jpg`.

## CORS and API Failure Inventory

- RainViewer tile requests are made directly from GitHub Pages in `app.js`. This is the highest-risk CORS/rate-limit path.
- Zoom Earth weather requests are made through direct static tile templates and a local proxy. They are undocumented for third-party app reuse.
- Nominatim search is called directly from the browser.
- NASA GIBS is called directly on static host and through `/gibs` locally.
- OpenStreetMap raster tiles are called directly on static host and through `/osm` locally.
- Esri World Imagery is called directly on static host and through `/esri` locally.
- CameraNet providers include several DOT/511 and open data services with mixed CORS and schema stability.

## Endpoints Used by Frontend

- `/live/satellites?group=...`
- `/live/earthquakes?feed=...`
- `/live/weather/radar`
- `/live/weather/zoom-earth?mode=...`
- `/live/wildfires`
- `/live/aircraft`
- `/live/cameras?provider=all&bbox=...`
- `/live/intel?layer=...`
- `/gibs/...`
- `/rainviewer/...`
- `/zoom-earth/...`
- `/osm/{z}/{x}/{y}.png`
- `/esri/...`
- `/camera/...`
- `https://gibs.earthdata.nasa.gov/wmts/...`
- `https://tilecache.rainviewer.com/...`
- `https://tiles.zoom.earth/...`
- `https://nominatim.openstreetmap.org/search`
- `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/...`

## Python Proxy Routes

`orion_server.py` routes:

- `/gibs/*`
- `/live/*`
- `/osm/*`
- `/esri/*`
- `/rainviewer/*`
- `/zoom-earth/*`
- `/camera/*`
- static file fallback from repository root

Backend provider constants include NASA GIBS, Esri, OpenSky, ADS-B point providers, CelesTrak, USGS, RainViewer, Zoom Earth, NASA EONET, NWS alerts, ArcGIS camera feeds, Seattle/NYC open data, geographic boundaries, submarine cable GeoJSON, and OpenStreetMap/Overpass power-grid queries.

## Disabled or Retired Layers

Retired in `orion-config.js`:

- `cyberNetwork`
- `defenseAirspace`
- `rfHeatmap`
- `emergencyIncidents`
- `airCorridors`

Reactivated after the initial hardening pass:

- `underseaCables`
- `powerGrid`

Hidden by `enhancePlatformLayerUi()`:

- Any retired platform layer with a visible matching label.

Enabled by first-run JavaScript state:

- Imagery: true color, labels.

HTML checked attributes still mark tracking domain toggles checked for aircraft, satellites, and vessels, even though JavaScript state overrides them to false. This is a duplicate default source and should be removed.

## Heavy Layers and Defaults

Heavy environment and live layers are off in the JavaScript first-run state:

- Weather radar
- Wildfires
- Volumetric weather
- Lightning
- Earthquakes
- CameraNet
- Aircraft
- Ships
- Satellites and debris
- 3D cities

The default-state source is still scattered between HTML attributes and `app.js`. It should be centralized in `orion-config.js`.

## UI Controls With Partial or Missing Behavior

- `radarAnimateToggle` is active in HTML even when the radar layer is off.
- Weather map modes select a private Zoom Earth tile implementation for precipitation/wind/temperature/humidity/pressure.
- Timelapse records a WebM stream plus metadata, not MP4. It has no cancel button and no backend ffmpeg path.
- Scan presets can enable multiple heavy layers at once; this is user initiated, but should surface provider health and unavailable states.
- Retired layers remain in config and backend fallbacks even when hidden in the UI.

## Duplicate Controls

- Live tracking domain toggles mirror platform layer toggles for aircraft, vessels, and orbital layers. This is intentional as a merged workflow, but the default states are duplicated.
- Orbital dataset selection also toggles orbital platform layers. This is intentional but should remain synchronized from one default-state source.

## Placeholder, Demo, or Synthetic Paths

- `Orion.Config.TrackingDefinitions` is a synthetic mission feed and is labeled as such in telemetry.
- `STATIC_INTEL_LAYERS` in `orion_server.py` contains fallback/synthetic features for live ships, cyber arcs, defense airspace, undersea cables, power grid, RF heatmap, emergency incidents, weather volume, lightning, events, air corridors, and traffic.
- Several backend fallback payloads set `fallback` or `mode` fields, but frontend badges do not consistently expose source/freshness/attribution to the user.
- `orion-core.js` creates placeholder runtime modules if modules are missing.

## Hardcoded Values Needing Configuration

- Provider roots and endpoint URLs in `orion_server.py`.
- Refresh cadences in `orion-config.js` and `app.js`.
- Performance limits in `orion-performance-budget.js`.
- GIBS imagery lag and timeline window in `orion-config.js` and `app.js`.
- Static-vs-local routing in `orion-config.js` and `app.js`.
- Cesium asset version query strings in `index.html`.
- Camera region refetch timing in `app.js`.

## Timers and Refresh Intervals

- Loading screen image rotation: 5 seconds.
- Loading fact rotation: 4 seconds.
- Loading progress interval: 50 ms.
- Viewer imagery refresh timer: scheduled by `scheduleImageryRefresh()`.
- Platform layer system loop: 5 seconds.
- Weather radar refresh: 5 minutes.
- Weather radar animation: 1.1 seconds.
- Zoom/weather mode refresh: provider/config dependent, minimum 60 seconds.
- Camera region refresh: controlled by camera region key/time checks.
- Diagnostics stability monitor: 60 seconds.
- Loading fallback timeout: 18 seconds.
- Cesium health monitor post-render throttle: 1.8 seconds.

## Cesium Collections and Entity Types

- `Cesium.Viewer`
- `Cesium.UrlTemplateImageryProvider`
- `Cesium.WebMercatorTilingScheme`
- `Cesium.BillboardCollection`
- `Cesium.PointPrimitiveCollection`
- `Cesium.PolylineCollection`
- `Cesium.CustomDataSource`
- Entity billboards, labels, ellipses, polygons, polylines, point primitives, and callback position properties.
- Optional Cesium ion terrain and OSM Buildings.

## Global Window Objects

- `window.Orion`
- `window.viewer`
- `window.appState`
- `window.platformFeeds`
- `window.trackIcon`
- `window.platformIcon`
- `window.markerIcon`
- `window.selectedPlatformEntityId`
- `window.OrionHardening`
- `window.OrionIntelligence`
- `window.OrionOperational`
- `window.OrionCognitive`
- `window.OrionGovernance`
- `window.orionSystems`
- `window.showToast`
- `window.OrionImagery`
- `window.OrionLiveLocation`
- `window.OrionLoadingManager`
- `window.orionLoadingComplete`
- `window.CameraNet`
- `window.OrionTextureManager`
- `window.CESIUM_BASE_URL`
- `window.CESIUM_ION_TOKEN` optional

## Files Larger Than 1,000 Lines

- `app.js` - 11,547 lines
- `orion_server.py` - 3,878 lines
- `styles.css` - 2,382 lines
- `camera_providers.py` - 1,491 lines
- `orion-onboarding.js` - 1,234 lines
- `cameranet_frontend.js` - 1,108 lines

## Static vs Local Differences

- Static host rewrites `/live/*` JSON requests to `pages-data/*`.
- Static host uses public NASA GIBS and OpenStreetMap URLs directly.
- Local host proxies GIBS, OSM, Esri, RainViewer, Zoom Earth, CameraNet, and live provider requests.
- GitHub Pages workflow builds data snapshots before deploy.
- Local mode can resolve camera streams and proxy tiles; static mode cannot safely proxy CORS-limited provider tiles.
