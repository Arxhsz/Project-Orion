# Architecture

## Runtime Modes

Project Orion runs in two modes:

- Static GitHub Pages mode: `index.html` and JavaScript run from a static host. Live JSON requests are rewritten to `pages-data/*` snapshots. Provider-dependent tile services must either be CORS-safe public services or disabled with a visible status.
- Local Python mode: `orion_server.py` serves the static app and proxies selected upstreams from localhost. This mode can handle same-origin tiles, CameraNet stream resolution, caching, and provider credentials.

## Frontend Flow

1. `index.html` loads Cesium, HLS.js, satellite.js, runtime modules, provider adapters, renderers, CameraNet, and `app.js`.
2. `orion-config.js` defines imagery layers, platform layers, provider metadata, tracking definitions, and constants.
3. `app.js` owns the main state object and `Orion.SimulationClock`, binds controls, initializes Cesium, loads imagery, refreshes providers, renders layers, and updates telemetry.
4. `orion-telemetry-health.js` tracks provider health and retry/backoff.
5. Renderer modules manage Cesium primitives for imagery, environment, infrastructure, aircraft, maritime, and orbital layers.
6. `orion-provider-submarine-cables.js` and `orion-provider-power-grid.js` normalize infrastructure payloads before Cesium rendering and selectable-intelligence rows.
7. `cameranet_frontend.js` manages camera discovery, clustering, selection, media playback, and snapshot fallback.

## Backend Flow

1. `orion_server.py` handles static files and API/proxy routes.
2. Live endpoints fetch or synthesize provider payloads with in-memory caches. Infrastructure routes include cached submarine-cable GeoJSON and bounded OpenStreetMap/Overpass power-grid viewport queries.
3. Camera provider adapters live in `camera_providers.py`.
4. `build_pages_data.py` runs during the Pages workflow and writes snapshot JSON into `pages-data/live/*`.

## State Ownership

Current state ownership is mixed:

- `orion-config.js` owns definitions and constants.
- `app.js` owns runtime state and first-run defaults.
- `index.html` still contains checked attributes that duplicate defaults.
- `orion-runtime-state.js` owns enabled/disabled layer state for platform layers.
- `orion-telemetry-health.js` owns provider health state.

Target state ownership:

- `orion-config.js` should contain authoritative defaults and provider metadata.
- `app.js` should consume defaults and persist user choices.
- Provider health should expose a single provider-state shape across static and local modes.

## Deployment

GitHub Pages deploys on pushes to `main` through `.github/workflows/pages.yml`:

1. Checkout.
2. Run `python build_pages_data.py`.
3. Configure Pages.
4. Upload the repository root as the Pages artifact.
5. Deploy to GitHub Pages.
