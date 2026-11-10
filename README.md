<p align="center">
  <img src="assets/orion-logo.svg" alt="Project Orion" width="760" style="max-width: 100%; height: auto;">
</p>

# Project Orion

Project Orion is a real-time planetary command map built on CesiumJS. It combines NASA GIBS satellite imagery, NOAA/NWS radar, orbital tracking, aircraft, CameraNet, environmental monitoring, saved locations, live device location, and historical timeline playback in a dark glass command interface.

Current version: v1.1.2 + reliability release (2026-11-10)

See [the rework report](docs/OBSERVATION_REWORK.md) for the implemented fixes, source research, verification steps, and remaining coverage limits.

## Architecture

Orion has two runtime modes:

- Static GitHub Pages mode serves the frontend and prebuilt `pages-data/` JSON snapshots. Public NOAA weather, Open-Meteo forecast, USGS hazard and NASA EONET feeds are fetched directly where CORS permits. Services requiring a proxy remain local-only.
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
- Satellite animation and radar: NOAA nowCOAST timestamped regional GOES with hourly global infrared context, and CONUS MRMS WMS layers. Playback buffers decoded frames and supports looping.
- Satellites: CelesTrak GP/TLE data.
- Earthquakes: USGS GeoJSON summary feeds.
- Wildfires: NASA EONET event metadata.
- Weather fields: Open-Meteo 216-frame hourly forecasts on a cached, coarse 20° global sample grid, including wind/gusts, precipitation, temperature/feels-like/wet-bulb, humidity, dew point, pressure, clouds, rain and snow.
- Volcanoes: USGS US volcano status and notices; 3D cones are illustrative markers.
- Cameras: public DOT/511/open-data providers through CameraNet adapters.
- Power infrastructure: OpenInfraMap global OpenStreetMap-derived vector tiles, with the official U.S. transmission-line ArcGIS service as a regional fallback.
- Aircraft: public ADS-B point feeds through the local backend and generated Pages catalog.

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for the source matrix and attribution notes.

## Defaults

Heavy live and environment layers are off on first load:

- Aircraft, satellites, debris, CameraNet, wildfires, radar, volumetric weather, lightning, and earthquakes.
- User layer choices persist in local storage after deliberate toggles.
- A visible in-app Data Sources and Attribution block appears in the telemetry panel.

## Run Locally

For a live preview that refreshes after source edits and restarts after Python changes:

```bash
python3 dev_server.py 4174
```

Use Python directly without development reload:

```bash
python3 -m pip install -r requirements.txt
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

The bundled integrations require no user-supplied setup secrets. Optional local settings are:

- `ORION_ALLOWED_ORIGINS` for production backend CORS.
- `ORION_SYNTHETIC_INTEL=1` only when intentionally building demo fallback intel data.

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
- Current Open-Meteo precipitation, wind, temperature, humidity, and pressure overlays.
- CelesTrak satellite OMM snapshots with legacy TLE fallback.
- USGS earthquakes.
- NASA EONET wildfire event metadata.
- CameraNet discovery, verified public embeds, and browser-playable HLS/MJPEG live video.
- Global high-voltage power lines, cables, substations, plants, generators, and local grid assets where source detail supports them.
- Local backend mode for richer same-origin provider access.

Known limits:

- Open-Meteo weather-field overlays are current global grids rather than provider-native raster tiles or historical animations.
- Timelapse exports WebM plus metadata in-browser; MP4 requires a future backend ffmpeg pipeline.
- Some CameraNet live streams are provider-limited, blocked, or expire; failures are shown as unavailable and never replaced with still images.
- No free official source provides normalized live camera media for all 50 states. Orion reports actual provider coverage and omits metadata-only/fabricated camera markers.
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
python3 -m py_compile orion_server.py camera_providers.py build_pages_data.py
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
- If an aircraft feed is unavailable, check the provider status and retry after the displayed backoff period.
- If a provider is unavailable, check the telemetry panel provider status and [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
