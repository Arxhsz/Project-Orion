<p align="center">
  <img src="assets/orion-logo.svg" alt="Project Orion" width="760" style="max-width: 100%; height: auto;">
</p>

# Project Orion

Project Orion is a real-time planetary command map built on CesiumJS. It combines NASA GIBS satellite imagery, NOAA/NWS radar, orbital tracking, aircraft and vessel adapters, CameraNet, environmental monitoring, saved locations, live device location, and historical timeline playback in a dark glass command interface.

Current version: v1.1.1

## Architecture

Orion has two runtime modes:

- Static GitHub Pages mode serves the frontend and prebuilt `pages-data/` JSON snapshots. Static mode must not call provider tile services that require backend proxying.
- Local Python mode serves the same frontend through `orion_server.py` and can proxy same-origin imagery, CameraNet media, and provider workflows that require local request handling.

Important files:

```text
index.html                  Main application shell
app.js                      Cesium app, timeline, layers, controls, telemetry
orion-config.js             Layer definitions, defaults, provider metadata
orion-provider-registry.js  Provider capability/state registry
orion-telemetry-health.js   Provider health, retry, and backoff state
orion_server.py             Local API and proxy server
camera_providers.py         CameraNet provider adapters
build_pages_data.py         GitHub Pages JSON snapshot builder
docs/                       Audit, issues, data sources, architecture, plan
```

## Data Sources

- Imagery: NASA GIBS / NASA ESDIS WMTS.
- Radar: NOAA/NWS `radar_base_reflectivity` ArcGIS map service.
- Satellites: CelesTrak GP/TLE data.
- Earthquakes: USGS GeoJSON summary feeds.
- Wildfires: NASA EONET event metadata.
- Weather fields: Open-Meteo is documented as the approved JSON provider, but raster weather tiles for precipitation, wind, temperature, humidity, and pressure are currently marked unavailable until an approved renderer is implemented.
- Cameras: public DOT/511/open-data providers through CameraNet adapters.
- Aircraft and AIS: backend adapters only; credentials must remain server-side.

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for the source matrix and attribution notes.

## Defaults

Heavy live and environment layers are off on first load:

- Aircraft, vessels, satellites, debris, CameraNet, wildfires, radar, volumetric weather, lightning, earthquakes, and 3D cities.
- User layer choices persist in local storage after deliberate toggles.
- A visible in-app Data Sources and Attribution block appears in the telemetry panel.

## Run Locally

Use Python directly:

```bash
python3 orion_server.py 4174
```

Then open:

```text
http://127.0.0.1:4174/
```

On Windows, the included launcher is still supported:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-orion.ps1
```

## Environment Variables

Copy `.env.example` for local reference. Do not commit real secrets.

Optional variables include:

- `CESIUM_ION_TOKEN` for optional OSM Buildings / terrain.
- `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` for OpenSky OAuth-backed aircraft access.
- `AIS_PROVIDER` and `AIS_API_KEY` for licensed AIS integrations.
- `ORION_ALLOWED_ORIGINS` for production backend CORS.
- `ORION_SYNTHETIC_INTEL=1` only when intentionally building demo fallback intel snapshots.

## GitHub Pages

The hosted site runs at:

```text
https://arxhsz.github.io/Project-Orion/
```

The Pages workflow deploys on pushes to `main`:

1. Check out the repository.
2. Run `python build_pages_data.py`.
3. Upload the static site and generated `pages-data/` artifact.
4. Deploy to GitHub Pages.

## Supported and Unsupported

Supported:

- Static NASA GIBS imagery.
- Local and static NOAA/NWS current radar map service.
- CelesTrak satellite TLE snapshots.
- USGS earthquakes.
- NASA EONET wildfire event metadata.
- CameraNet discovery and stream/snapshot handling where providers allow it.
- Local backend mode for richer same-origin provider access.

Known limits:

- Weather field modes beyond radar are metadata-only until an approved map renderer is built.
- Timelapse exports WebM plus metadata in-browser; MP4 requires a future backend ffmpeg pipeline.
- Licensed AIS and higher-volume aircraft feeds require server-side provider credentials.
- Some CameraNet streams are provider-limited, blocked, expired, or snapshot-only.
- NOAA radar current service is not historical/time-enabled in this implementation.

## Performance

Performance budgets are centralized in `orion-performance-budget.js` and provider metadata in `orion-config.js`. Large live collections remain off by default, and provider refreshes use health/backoff state to reduce repeated failures.

## Validation

JavaScript syntax:

```bash
npm run check:js
```

Node tests:

```bash
npm test
```

Python syntax:

```bash
python3 -m py_compile orion_server.py camera_providers.py intel_layers_expanded.py build_pages_data.py
```

Build Pages snapshots:

```bash
python3 build_pages_data.py
```

Local smoke check:

```bash
python3 orion_server.py 4174
curl -I http://127.0.0.1:4174/
curl http://127.0.0.1:4174/live/weather/radar
```

## Troubleshooting

- If the app is opened from `file://`, launch it from localhost instead.
- If optional 3D buildings are unavailable, set a local `CESIUM_ION_TOKEN`.
- If aircraft or AIS feeds are unavailable, verify backend credentials and provider rate limits.
- If a provider is unavailable, check the telemetry panel provider status and [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
