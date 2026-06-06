# Changelog

## v1.1.0 - 2026-06-06

- Added live location tracking through the browser Geolocation API.
- Added an Orion-styled live location marker with an updating accuracy ring.
- Kept the live location marker independent from aircraft, vessel, satellite, search, and saved-location markers.
- Added deterministic test access through `window.OrionLiveLocation.testPosition(...)`.
- Retired degraded experimental controls for cyber arcs, sea cables, airspace, power grid, RF heat, emergency/event heat, and air routes.
- Updated timeline Updates mode to use the active map cadence: 20-minute satellite steps, 5-minute radar snapshots, 10-minute Zoom Earth forecast snapshots, and 12-hour HD satellite steps.
- Added active-layer render budgets so the globe stays smoother when several live layers are enabled together.
- Quieted production console noise behind `?orionDebug=1` / `localStorage.orionDebug=1`.
- Refreshed the README brand panel and added app screenshots for the loading, globe, and timeline views.
- Published matching v1.1.0 release notes in the in-app changelog.
- Refreshed asset cache versions for GitHub Pages.

## v1.0.0 - 2026-05-28

- Initial public Project Orion release with Cesium globe visualization, live weather map modes, timeline playback, orbital and platform intelligence layers, CameraNet, saved locations, and GitHub Pages static mode.
