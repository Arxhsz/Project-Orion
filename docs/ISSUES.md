# Issue Inventory

## P0

1. `ProviderHealth.getTimeUntilRetry()` is missing but called by `app.js` during platform refresh backoff.
2. Static weather radar directly requests RainViewer tilecache URLs, causing known CORS/429 console failures.
3. Weather map modes use undocumented Zoom Earth tile/time endpoints in both frontend and backend.

## P1

1. Provider health state is incomplete. It tracks failures and backoff, but does not expose the requested provider metadata shape: status, last success/failure, failure count, retry-after, static support, historical support, live support, and attribution.
2. Heavy/live layer defaults are scattered between HTML `checked` attributes and JavaScript state.
3. Static Pages can build weather snapshots whose tile templates still point to non-owned provider tile services.
4. Timelapse exports WebM and metadata only, with no MP4 path, cancellation UI, size limits, or backend ffmpeg path.
5. Backend static fallback data can be presented alongside live data unless the frontend status panel clearly labels fallback mode.
6. Production console output is noisy across core, diagnostics, renderer, and texture modules.

## P2

1. Retired layer definitions remain in config and backend fallback payloads.
2. `app.js` remains too large and owns state, providers, rendering, UI, telemetry, timeline, and timelapse behavior.
3. CameraNet has many provider parsers but limited per-provider health details in the visible diagnostics panel.
4. OpenStreetMap and Nominatim browser calls should document policy considerations and rate limits.
5. Static snapshots do not currently persist a source matrix or build manifest for user-facing traceability.

## Placeholders and Fallbacks to Label or Remove

- Synthetic mission feed in `orion-config.js`.
- Static intel fallback layers in `orion_server.py`.
- Placeholder runtime modules created by `orion-core.js`.
- Fallback imagery and transparent tile responses in `orion_server.py`.
- Camera snapshot fallback paths in `cameranet_frontend.js`.

## Retired Features Hidden or Pending Removal

- Cyber arcs
- Defense airspace
- Undersea cables
- Power grid
- RF heatmap
- Emergency incidents
- Air corridors

The UI hides retired layers, but config/backend support remains for future reactivation or documented removal.
