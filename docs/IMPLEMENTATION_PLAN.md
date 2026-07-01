# Implementation Plan

## Phase A - Immediate Production Hardening

1. Centralize first-run defaults in `orion-config.js`.
2. Remove duplicate checked defaults for heavy tracking toggles in `index.html`.
3. Expand provider metadata and health state to include status, retry-after, static support, live/historical support, and attribution.
4. Implement missing provider-health helpers and bounded logging/backoff.
5. Replace direct static RainViewer tile loading with a documented NOAA/NWS radar provider or explicit unavailable state.
6. Disable undocumented Zoom Earth weather tile paths and replace them with documented/unavailable provider states until an approved source is implemented.
7. Add visible Data Sources and Attribution UI.
8. Update README with static/local behavior, data sources, unsupported features, and validation commands.

## Phase B - Provider Refactor

1. Add a provider registry module.
2. Move provider-specific metadata and capabilities out of `app.js`.
3. Add abort/cancellation handling per provider request.
4. Add static-mode provider gating so unavailable providers do not issue requests.
5. Add source/freshness/attribution labels to telemetry and diagnostics.

## Phase C - Verification

1. Run Python syntax checks.
2. Run JavaScript syntax checks.
3. Generate Pages snapshot data.
4. Run local server smoke checks.
5. Run browser smoke checks for zero boot exceptions and no repeated 404/CORS provider spam.
6. Verify GitHub Pages workflow will build after push.

## Phase D - Later Refactors

1. Extract timeline, provider refresh, selection, and timelapse controllers from `app.js`.
2. Move satellite propagation to a Web Worker.
3. Add Playwright browser tests.
4. Implement MP4 timelapse export through backend ffmpeg where available.
5. Implement licensed or explicitly configured submarine cable and power-grid providers.
