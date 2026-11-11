# Changelog

## Unreleased - 2026-11-10

- Rebuilt the application shell around a map-first operational layout inspired by Godsview's workflow and information architecture.
- Added a compact desktop command dock, search/status header, map tool stack, task-specific layer and intelligence drawers, and contained timeline surface.
- Added a runtime-driven feed activity popover and loading strip sourced from active provider state instead of decorative status values.
- Made major workspace surfaces mutually exclusive, with automatic intelligence opening for selected map objects and `Escape` returning to the map.
- Added mobile bottom navigation with mutually exclusive map, layer, intelligence, timeline, and control surfaces.
- Added continuously synchronized `#orion` globe URLs for camera position, active Intel layers, place labels, imagery mode, and timeline position.
- Added keyboard commands for search, layers, intelligence, and timeline access.
- Added Lucide control icons with text fallbacks and a neutral interface palette with distinct live, active, warning, and error accents.
- Added browser coverage for desktop boundaries, drawer stacking, mobile surface transitions, layer shortcuts, zoom controls, feed status, and shared-view links.

## v1.1.2 - 2026-07-01

- Reactivated selectable submarine cable and power-grid Intel layers with visible controls, provider metadata, adapter modules, and selectable-intelligence rows.
- Added bounded OpenStreetMap/Overpass local backend support for power-grid viewport queries, with static Pages fallback snapshots for broad/static views.
- Fixed timeline refresh keys so hourly selections trigger map redraws instead of only changing labels within the same day.
- Added `Orion.SimulationClock` as the shared live/historical/playback clock state.
- Updated live aircraft rendering to keep a keyed aircraft store and update Cesium billboards in place with stale visual marking.

## v1.1.1 - 2026-07-01

- Added repository audit docs for architecture, issue inventory, data sources, and implementation planning.
- Centralized first-run layer defaults and provider metadata in `orion-config.js`.
- Added `orion-provider-registry.js` and expanded provider health state with static/live/historical support, retry-after, attribution, and backoff helpers.
- Replaced RainViewer browser tile usage with the documented NOAA/NWS radar base reflectivity map service.
- Removed undocumented Zoom Earth tile/time provider paths from frontend, backend, and Pages data generation.
- Marked non-radar weather fields as explicit Open-Meteo metadata-only unavailable states until an approved renderer is implemented.
- Added request cancellation for platform provider fetches when layers are disabled.
- Removed heavy tracking defaults from HTML and persisted deliberate user layer choices in local storage.
- Added an in-app Data Sources and Attribution panel.
- Added `.env.example`, `package.json`, and Node tests for provider defaults and removed weather tile providers.
- Refreshed GitHub Pages cache-busting asset versions.

## v1.1.0 - 2026-06-06

- Added live location tracking through the browser Geolocation API.
- Added an Orion-styled live location marker with an updating accuracy ring.
- Kept the live location marker independent from aircraft, vessel, satellite, search, and saved-location markers.
- Added deterministic test access through `window.OrionLiveLocation.testPosition(...)`.
- Retired degraded experimental controls for cyber arcs, sea cables, airspace, power grid, RF heat, emergency/event heat, and air routes.
- Updated timeline Updates mode to use the active map cadence: 20-minute satellite steps, 5-minute radar snapshots, 10-minute Zoom Earth forecast snapshots, and 12-hour HD satellite steps.
- Fixed timeline frame selection so Zoom Earth weather maps stay on the selected historical update instead of snapping back to the previous/latest tile.
- Added active-layer render budgets so the globe stays smoother when several live layers are enabled together.
- Quieted production console noise behind `?orionDebug=1` / `localStorage.orionDebug=1`.
- Refreshed the README brand panel and added app screenshots for the loading, globe, and timeline views.
- Published matching v1.1.0 release notes in the in-app changelog.
- Refreshed asset cache versions for GitHub Pages.

## v1.0.0 - 2026-05-28

- Initial public Project Orion release with Cesium globe visualization, live weather map modes, timeline playback, orbital and platform intelligence layers, CameraNet, saved locations, and GitHub Pages static mode.
