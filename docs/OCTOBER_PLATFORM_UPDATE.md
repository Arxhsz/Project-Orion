# October 5 platform update

This is a functional incremental update, not completion of every requirement in the full platform brief. Preview: `python3 dev_server.py 4174`. No credentials were added. The work originated in an extracted source archive; Git history was reconnected and the completed reliability release is deployed through the repository's GitHub Pages workflow.

## Implemented

- Decoded frame cache now uses least-recently-used eviction and a decoded-memory budget (192 MiB narrow screens, 384 MiB desktop for weather). Historical frames survive camera and mode changes when space permits. Failed requests remain retryable. Frame keys distinguish source, time, viewport, resolution, and forecast generation.
- Prefetch both preceding and following observations while paused; stage the next two textures during playback. Continue displaying the old image until the new texture is ready. Existing loop and cancellation behavior retained.
- Observed weather imagery progressively requests 1024, 2048, then 4096 pixels once idle. Resolution and viewport are separate cache keys. Movement interrupts upgrades and prioritizes coarse globe tiles; movement end automatically requests sharper tiles. Power saving avoids idle weather upgrades. 4096 pixels is a request-resolution ceiling, not a claim that every source has that native detail.
- NASA daily imagery uses buffered snapshots for playback and native GIBS tile requests when paused. Imagery source coverage and update rates still apply.
- Compact expandable legend, centered collapsed telemetry button, black controls and panels. Controls now include rotation and zoom enablement, north up, reset, timeline shortcuts, lighting, atmosphere, labels, render quality, and tutorial restart. Environmental presets select environmental datasets instead of generic false-color postprocessing.
- Tutorial completion closes synchronously, persists completion, invalidates delayed layout work, restores controls, supports Skip and Escape, and avoids duplicate resize listeners. Removed calls to the deleted `restoreTrackingDemo` function, which caused the completion exception. Tutorial steps activate the workspace tab containing their target.
- Added public Fintraffic AIS observations for **Finnish waters**, without an account or API key. Source positions refresh at most once a minute; metadata is cached for an hour. Older-than-30-minute reports and invalid AIS values are excluded. Positions are not extrapolated. Selected vessels show MMSI, available name/type/callsign, speed, reported bearing, source time, and coverage. Ships use a bow-up marker; heading rotation was corrected for moving layer billboards.
- CameraNet remains live-video only: HLS, MJPEG, and approved publisher embeds. Snapshot-only adapters and fabricated fallback coordinates are excluded.
- Camera panel includes favorites, copy coordinates, center, nearby loaded cameras, publisher link, feed type and availability. Unknown facing direction remains unknown; explicitly supplied heading can drive a direction indicator. Road travel direction is not treated as camera lens orientation.
- Independent backend availability probes are cached and bounded; failed live-media endpoints cool down for five minutes. The selected camera checks availability before starting media, while embeds remain UNKNOWN until the publisher/player can establish availability. Monitoring currently covers inspected cameras, not a fleet-wide scheduler.
- `camera-providers/discovery.json` records official agency links for all 50 states, sourced from FHWA. The directory is available under Layers. These are discovery links, **not 50-state embedded camera coverage**.
- GitHub Pages workflow packages an explicit list of public site assets rather than uploading the repository root. Environment files remain ignored. No secrets are needed for the new AIS or camera integrations.

## Validation actually run

- `npm run check:js`: passed.
- `npm test`: 40 tests passed, including AIS validation and cache memory/LRU checks.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 21 tests passed, including camera health cooldown and timestamp honesty.
- `node tests/browser-workspace.mjs`: mobile button centering, compact legend, quality control, complete tutorial, Skip and Restart passed.
- `node tests/browser-data-quality.mjs`: weather reached its 4096-pixel tier; real public AIS feed loaded 617 recent observations during the check. Counts vary.
- Playback regression with real NOAA and forecast data: retained imagery through a loop, stopped correctly with Loop Off, and buffered precipitation frames. An earlier run timed out waiting for remote imagery; diagnostic rerun passed.
- NASA playback check: buffered all 31 daily images with no page errors.
- `node tests/browser-cameras.mjs`: approved public live embed, favorites, centering and nearby-camera actions passed.
- `python3 build_pages_data.py`: generated the live-video-only camera catalog. Catalog ingestion does not guarantee every individual upstream stream remains online.
- `npm audit --omit=dev`: zero reported vulnerabilities.

## Remaining scope and limits

- Live-video camera coverage is not all 50 states. Further municipal, county, weather, aviation and state adapter integration and embedding review remain; still-image sources are intentionally omitted.
- Maritime coverage is Finnish waters, not worldwide AIS. The open service is documented here: https://www.digitraffic.fi/en/marine-traffic/ . It requires gzip transport but no API credential. Browsers negotiate compression automatically.
- Forecast fields still originate from the existing coarse 20-degree Open-Meteo sample grid. Increasing image dimensions does not add meteorological spatial detail. Replacing that grid with high-resolution forecast rasters is outstanding.
- No archival aircraft, vessel or camera database was added. Live-only layers must not be interpreted as historical observations during imagery playback. Satellites retain their existing orbital-element propagation and age reporting.
- No measured terrain or surveyed volcano models were introduced. Hazard visual effects remain illustrative.
- Memory limits may evict explored frames; requested 24 fps is not a guarantee of that frame rate on every GPU or connection.
- Backend availability checks do not run on GitHub Pages. Static clients use publisher media and player error states. No server credential should ever be moved into browser JavaScript to work around that limit.

## Sources

- Fintraffic public marine API and CC BY attribution: https://www.digitraffic.fi/en/marine-traffic/
- Official state discovery directory: https://www.fhwa.dot.gov/about/webstate.cfm
- Visual reference reviewed: https://zoom.earth/ . No proprietary map tiles or assets copied.

## October 6 loop-boundary repair

Playback now uses one resolution tier throughout the sequence (2048 pixels automatically, 4096 in Maximum detail, 1024 in Power saving). The first two decoded weather frames are preferentially retained within the same memory budget. The first frame is uploaded before becoming active, then blended over the still-visible final frame for 220 ms. It is raised above the outgoing frame during that blend and becomes the active frame only after the transition finishes. Daily imagery transitions also retain the outgoing image until the incoming image is ready, rather than dimming both toward the underlying globe. Physical day/night and cloud differences between observations are preserved.

The loop regression now exercises timestamps from both ends of the full source history and asserts that playback retains at least 2048-pixel imagery across the restart. Cache tests verify that loop-start preference cannot exceed the memory budget.

Final October 6 validation: the full-span NOAA loop regression passed with consistent playback resolution, no missing/cropped frames, correct Loop Off stopping, and precipitation playback. All 40 JavaScript and 21 Python tests passed; syntax checks passed. The public-only Pages bundle was assembled locally and checked to exclude environment files, backend Python, node_modules, and artifacts. Preview returned HTTP 200.

## October 6 Live Mode coverage correction

The Live Mode button previously selected the NASA daily `maxDate`, which was then clamped to the beginning of the NOAA weather timeline. That explains the screenshot showing Live Mode alongside REPLAY and an eight-hour-old regional frame. It now selects the active timeline's latest observation and enables weather follow-latest behavior. At globe-scale camera heights, satellite imagery requests cover the whole globe rather than retaining a viewport rectangle. Close-range views can still request detailed viewport imagery.

`node tests/browser-live-coverage.mjs` reproduces the regression by selecting the oldest infrared frame and engaging Live Mode. It checks the latest timestamp, global infrared context, full-width globe coverage, and the final 4096-pixel texture. This does not imply identical native resolution between regional GOES imagery and the hourly global infrared source.


## October 6 zoom, rendering and controls follow-up

- Playback holds its current timestamp during camera movement and resumes automatically after the new viewport frame is ready. Zooming no longer cancels Play. Satellite and radar use 2048-pixel requests by default and refine to 4096 while paused; Power saving remains 1024. These dimensions describe the requested raster, not native sensor resolution.
- If a decoded replacement texture cannot attach to every visible terrain tile before the bounded upload timeout, Orion discards that incomplete replacement, retains the last complete map, and continues playback instead of stopping or flashing back to the base map.
- Replacement readiness now includes the imagery attached to every intersecting visible terrain tile, not only the GPU texture cache. This uses isolated Cesium 1.141 internals in `orion-frame-buffer.js`; revalidate on Cesium upgrades. The outgoing frame stays until readiness passes. Cancelled requests cannot dispose a staged layer adopted by a newer request.
- Cache factories retain the viewport used in their key. Viewport padding scales with zoom, historical context is not inherited from a different timestamp, repeated requests retain already-sharp imagery, and same-frame requests still schedule refinement. NASA snapshot and native-tile cache identities are distinct.
- Forecast rasters redraw from their original values for the visible region at local zoom. This removes enlargement of a small globe texture but **does not improve the underlying 20-degree forecast sampling**. Global infrared and regional GOES also have different native resolution and cadence. Better local forecast data remains separate work.
- Workspace tabs now sit outside the scroll area. Side-panel height follows the measured timeline height, mobile telemetry collapses when entering a narrow viewport, and tracking controls use one column. Control checkboxes synchronize with the globe. Render-quality changes trigger weather updates immediately.
- The prior satellite.js 5.0.0 browser build lacked `json2satrec`, so valid OMM catalogs were silently empty. The compatible 6.0.1 browser build is pinned with a SHA-384 integrity check. A missing decoder now produces a useful error. Source: https://github.com/shashwatak/satellite-js/releases/tag/6.0.1 .
- Orbital points previously refreshed only with catalog/LOD updates. They now propagate on the tracking clock using existing points, without recreating their collection each second. Valid propagated altitudes are preserved rather than clamped to an arbitrary orbit band.

Validation for this follow-up: `npm run check:js`; `npm test` (44 passed); `python3 -m unittest discover -s tests -p 'test_*.py'` (21 passed); `node tests/browser-zoom.mjs` (infrared and radar at three zoom heights, preserved playback, no unready frame replacements, final 4096-pixel refinement); `node tests/browser-playback.mjs` (loop, stop-at-end, and precipitation); workspace and tracking checks are recorded below. There is no compile/build step for this plain JavaScript app. This archive has no Git metadata; changes were reviewed against local baseline copies. No credentials or deployment were added.

October 7 closeout: removed animated panel-height resizing, which could briefly let panels overlap the timeline during a viewport resize. `node tests/browser-controls-tracking.mjs` now passes: functional rotation/zoom/atmosphere/lighting/labels, 114 real science-catalog satellites with position changes, satellite toggle-off, and separate navigation/content/timeline bounds at 1440, 900, 615 and 390 pixels. `node tests/browser-workspace.mjs` passed tutorial Finish/Skip/restart, compact legend and mobile centering. Final syntax checks, 44 JavaScript tests and 21 Python tests passed again. Local preview was restarted on port 4174. Browser checks used Chrome; this pass has not independently verified Safari GPU rendering or every third-party feed.

## October 8 live aircraft and vessel movement

Aircraft billboards now update between received reports on the existing render clock. Previously interpolation only ran when the feed or camera triggered a render update. Interpolation stays between actual reported positions, crosses the dateline along the shorter arc, preserves visual continuity when another report arrives, rejects older reports, and stops at the final known position. Aircraft no longer pass through the generic speed/heading extrapolator. Individual report timestamps are retained, headings rotate clockwise, and ground altitude is not replaced with a made-up flight altitude.

Live aircraft and maritime polling no longer slows down at globe-scale zoom. Existing cadences remain 30 seconds for aircraft requests (the local backend has a 45-second cache) and 60 seconds for AIS. Pending feed requests are deduplicated instead of being aborted by subsequent polling ticks; requests have a bounded timeout. Vessels remain at reported AIS coordinates until the next report; stationary vessels correctly remain stationary. Marine coverage remains Finnish waters ([Fintraffic source documentation](https://www.digitraffic.fi/en/marine-traffic/)). GitHub Pages aircraft files remain published snapshots; this change does not turn a static file into a real-time backend feed.

Changed: `app.js`, `orion-renderer-primitive.js`, transport regression tests, and npm test shortcuts. No credentials or production deployment added.

Transport validation: JavaScript syntax checks passed; `npm test` passed 47 tests; Python discovery passed 21 tests. `node tests/browser-live-transport.mjs` loaded 1,372 aircraft and 690 vessels, then observed 1,003 aircraft markers and 252 vessel markers change position through ordinary polling with no camera interaction or forced refresh. The first live test sampled too early, after a cached aircraft response; the regression now waits for fresh-report movement before asserting. Added deterministic tests for interpolation stopping at the last report, no rewind from older reports, dateline handling, and normal live polling cadence at orbital zoom. Preview remained available on port 4174.

## November 10 reliability closeout

- Restored the strict CameraNet live-video contract. Published camera records are HLS, MJPEG, or approved embeds; still-image fields, snapshot rendering, and the snapshot proxy route are excluded.
- A staged map texture that misses the bounded terrain-attachment deadline no longer stops playback or replaces the complete map. Orion keeps the last complete frame and continues.
- Browser checks cover static and local modes, timeline playback, three zoom levels, current observations, live transport motion, responsive workspace behavior, controls, satellites, hazards, and live CameraNet embeds.
- GitHub Pages now assembles an explicit public-only artifact and removes operating-system metadata before upload. Public assets use the `20261110-reliability1` cache version.
