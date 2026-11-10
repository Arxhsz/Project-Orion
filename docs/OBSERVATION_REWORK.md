# Observation workspace rework — 2026-10-01

## Implemented behavior

- Live location uses a single cancelable camera flight to a geographic target. Tracking and prior transforms are released; the final view centers the target. Ellipsoid terrain uses zero altitude instead of a coarse mesh height, which previously moved the target vertically.
- Weather playback uses NOAA's published WMS time dimension. Slider positions correspond to real available frames, including irregular radar intervals. NOAA `TIME` changes with each frame; current-only imagery is no longer presented as historical animation.
- Latest follows new frames; scrubbing and playback enter replay. Switching modes cancels obsolete metadata requests. Requests time out after 35 seconds and failures appear in the legend with automatic retry.
- Weather maps include visible/infrared satellite, global infrared, HD daily imagery, radar, precipitation, wind, gusts, temperature, feels-like, wet-bulb temperature, humidity, dew point, pressure, cloud cover, rain and snow. Forecast choices are Open-Meteo best match, NOAA GFS and DWD ICON.
- Forecasts have hourly values, two past days and seven forecast days (216 hourly frames). Wind traces follow the selected frame's geographic vectors. Their animation is accelerated for visibility, not a transport forecast.
- The command panel has keyboard-accessible Explore/Layers/Controls tabs and layer filtering. Source, state, coverage and time are visible. Mobile panels and timeline collapse to preserve map space.
- USGS earthquakes retain event time and magnitude, with illustrative wave rings. NASA EONET wildfire reports have animated illustrative smoke. USGS US volcano status has 3D cone markers and published notices. A volcano advisory does not imply eruption or ash, so no plume is invented from an alert level.
- Local weather and hazard APIs validate allowed modes, bound responses, cache requests and return explicit upstream failures. Pages reads public CORS-enabled feeds directly for these products. Synthetic intel generation and embedded demonstration incidents are off by default; upstream failures no longer substitute invented incidents.

## Buffered playback and map coverage

- Black/grayscale interface restored, with a default-on Loop control.
- The player buffers decoded images before playback, with three concurrent downloads and visible progress. Forecast canvases are cached without repeatedly PNG-encoding them. The next two frames are also staged for GPU upload ahead of the playhead. The previous image remains visible until its replacement texture is loaded; the clock waits instead of racing past unloaded frames.
- NOAA observations are requested as complete geographic images instead of replacing an incomplete tile mosaic. GPU staging refreshes after camera movement; decoded historical frames remain cached within the memory budget. The next image uses the new viewport. Regional GOES images include timestamp-matched global infrared context; visible regional images fade out at night, and coverage edges are feathered into that context. This does not turn the global source into a 5-minute product.
- Forecast grids wrap longitude at the date line. Missing values stay missing rather than converting to zero.
- NASA daily/HD cloud imagery also uses decoded-image caching and load-dependent swaps. Selecting optical/thermal cloud imagery activates its NASA daily timeline instead of leaving a checked but hidden layer behind the weather map. Its real cadence remains daily. A provider failure retains the prior image and offers a retry rather than silently showing an empty globe.
- Cache limits: 512 weather entries within a 192 MiB mobile / 384 MiB desktop decoded-memory budget, and 160 NASA entries within 384 MiB. Buffering may take time on a cold connection. 24 fps is the requested playback rate; rendering readiness can reduce actual playback speed, avoiding skipped/blank frames. Satellite history is limited to the timestamps NOAA actually publishes; no extra observations are fabricated.

## Sources researched and used

| Source | Implemented product | Actual cadence/coverage |
| --- | --- | --- |
| [NOAA nowCOAST satellite WMS](https://nowcoast.noaa.gov/geoserver/observations/satellite/ows?service=WMS&request=GetCapabilities) | GOES visible, GOES longwave, global longwave mosaic | GOES frames roughly 5 minutes over regional US/Pacific sectors; visible requires daylight. Global infrared is hourly and the service describes 2–3 hours of latency. The composite retains separate regional/global timestamps, selects only global frames at or before the regional time, and uses IR at night. |
| [NOAA nowCOAST radar WMS](https://nowcoast.noaa.gov/geoserver/observations/weather_radar/ows?service=WMS&request=GetCapabilities) | MRMS base reflectivity | Contiguous US, approximately 4-minute frames in the verified feed. Rolling history only. |
| [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | HD polar-orbiting daily mosaics, base imagery | Daily/product-dependent, not a 5-minute live photograph. |
| [Open-Meteo forecast API](https://open-meteo.com/en/docs) | All forecast fields above, model selection | Hourly valid times; model update cycles differ. Cache 30 minutes. Public API usage limits and noncommercial terms apply. |
| [USGS earthquake feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | Earthquake locations, magnitude, depth, time | Summary feeds updated about once a minute, global reported events. |
| [NASA EONET](https://eonet.gsfc.nasa.gov/docs/v3) | Open wildfire reports within 30 days | Curated event reports; not live thermal pixels, fire perimeters, or confirmation that every reported fire is still burning. |
| [USGS Volcano API](https://volcanoes.usgs.gov/vsc/api/volcanoApi/) | US volcano status and notices | US coverage; refresh check every 5 minutes. Alert dates can be old because an unchanged status is not a new observation. |
| Public CameraNet providers | Existing playable stream/approved embed adapters preserved | The checked Pages build returned 5,015 catalog entries across CA, FL, IA, LA, MD, NV and WI. Catalog inclusion does not guarantee every stream is online at every moment. |

## Reference products and next source choices

[Zoom Earth](https://zoom.earth/) was reviewed for mode selection and timeline behavior. Its map labels and source descriptions show different satellite, radar and forecast update rates. Orion uses documented provider endpoints; it does not fetch Zoom Earth's private tiles or copy its assets.

[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) and its [source inventory](https://github.com/bilawalsidhu/gods-eye-view/blob/main/DATA_SOURCES.md) informed the timestamp-driven weather and source-aware 3D view. No third-party code/assets were imported. Google photorealistic tiles and other credentialed services are not enabled without credentials and applicable terms.

For finer wildfire coverage, [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/) provides thermal detections, subject to a MAP_KEY and sensor latency. [NIFC's incident map](https://www.nifc.gov/nicc/incident-information/national-incident-map) is a source for US incidents/perimeters. Neither is represented by the current EONET dots or illustrative smoke. Global volcano inventory/status integration needs a separate adapter; the present source covers US volcanoes.

## Material limits and remaining work

This is an integrated repair and substantial rework, not full feature parity with Zoom Earth or a replacement of every backend subsystem.

- Forecast maps sample 162 points at 20-degree spacing (80S–80N). They are broad overview fields; zooming cannot reveal local forecast detail. Native forecast raster/vector tiles and viewport-aware higher-resolution sampling remain future work.
- No all-50-state camera coverage claim. Some providers require credentials, prohibit embedding, expose snapshots only, or currently fail. The verified build reported a New York provider parse failure; those records were omitted.
- Volcano cones are markers, not surveyed terrain models. Fire smoke and earthquake rings are explicitly illustrative, not measured hazard extent or dispersal.
- NASA daily imagery cannot animate clouds every five minutes. Use the regional NOAA modes for frequent observations; global IR has a coarser cadence.
- Provider outages, rate limits and tile latency can affect playback. Satellite visible is dark at night and has regional coverage.
- Existing non-weather intel adapters remain provider-dependent. Their disabled/empty states do not mean there are no real-world events.
- The original rework was developed in a restored source archive. Git history was reconnected before the November reliability release, and deployment is handled by the repository's GitHub Pages workflow.

## Development and verification

```sh
python3 -m pip install -r requirements.txt
python3 dev_server.py 4174
npm ci
npm run check:js
npm test
npm run test:python
npm run test:browser
node tests/browser-playback.mjs
python3 build_pages_data.py
```

The browser check uses Playwright and an installed Chromium browser. Set `ORION_BROWSER_EXECUTABLE` to its path, or install Playwright Chromium with `npx playwright install chromium`. Set `ORION_TEST_URL` to change the default local URL. It uses live public feeds and will fail during upstream outages. Screenshots go to ignored `artifacts/`. No production keys are needed for these checks.

Local APIs: `GET /live/weather/forecast?mode=temperature&model=best_match`, `GET /live/hazards?type=volcanoes`, existing `GET /live/wildfires`. Unknown modes/models/categories return 400; upstream failures return 503. The existing same-origin Pages/local routing remains intact.

## Verification results

- `npm run check:js`: passed.
- `npm test`: 37 JavaScript tests passed, including buffer concurrency, failed-load retry, decoded-provider contract, texture readiness, null cells, and camera targeting.
- `npm run test:python`: 18 Python tests passed; Python compilation passed for changed backend modules.
- `npm run test:browser`: passed the mode sweep, centered-location test, hazard feeds, layer filtering and mobile panel checks against live public feeds.
- `npm run test:playback`: passed requested 24 fps playback, preservation of a complete loaded image, loop wraparound, stopping at the final frame with loop off, and 216-frame precipitation availability. The loop regression uses an eight-frame real satellite subset to reach wraparound quickly; production retains the provider's full available list.
- NASA HD check: 31 daily images buffered and playback started; optical and thermal cloud controls both loaded their NASA overlays.
- `python3 build_pages_data.py`: completed (88.8 seconds in the last run). New York camera data returned a parse error and was omitted; this is an upstream limitation, not an all-state coverage success.
- `npm audit --omit=dev`: no production dependency vulnerabilities reported.
- Live preview returned HTTP 200; private dotfile request returned 404; automatic browser reload after a stylesheet edit was verified.

Some cold public-feed requests timed out during development. Retrying succeeded. The final player retains the preceding image and shows a retry message on failure rather than claiming an unloaded frame is visible. The restored work was reviewed against the public repository after Git history was reconnected.
