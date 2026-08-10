# Data Sources and Attribution

This matrix documents the providers currently used or approved for use. It separates documented public sources from provider-dependent or unsupported paths.

| Provider | Product | Update interval | Delay | Coverage | Historical | Auth | CORS/static support | Backend required | License/terms | Attribution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NASA GIBS | WMTS satellite imagery, labels, Blue Marble, cloud/thermal layers | Product dependent | Product dependent; app uses stable lag | Global for selected layers | Yes, by time dimension where layer supports it | No for public imagery | Yes for WMTS | Optional local tile proxy | NASA Earthdata/GIBS open data policy | NASA GIBS / NASA ESDIS |
| NOAA/NWS mapservices | Radar base reflectivity ArcGIS MapServer | Service states 5-10 minutes | Near real time | CONUS, Alaska, Caribbean, Guam, Hawaii and adjacent coverage per service | Current service is not time enabled | No | Browser support depends on ArcGIS service CORS | Optional for production hardening | NOAA/NWS public data | NOAA, National Weather Service |
| NWS API | Weather alerts | Lifecycle/cache dependent | Near real time | United States | Active alerts and API-specific history | No | JSON API supports browser access but should be cache friendly | Optional | NOAA/NWS API terms | National Weather Service |
| USGS Earthquake Hazards | GeoJSON summary feeds | Feed dependent | Near real time | Global | Recent day/week/month feeds | No | Yes | No | USGS public data | USGS Earthquake Hazards Program |
| CelesTrak | GP data in CCSDS OMM JSON, with legacy TLE snapshot fallback | Provider updates every 2 hours | Element epoch dependent | Public active catalog and selected groups | Current GP sets | No | Local/Pages snapshots avoid repeated browser downloads | Optional snapshot/proxy | CelesTrak usage policy and GP documentation | CelesTrak |
| OpenSky Network | Aircraft state vectors | Rate limited; current state vectors | Live/current, with limits | Network coverage dependent | Authenticated users can request recent history within documented limits | OAuth client credentials recommended | Direct browser use not suitable for secrets | Yes for credentials/rate control | OpenSky terms and credits | OpenSky Network |
| ADS-B public point feeds | Aircraft point queries | Provider dependent | Live/current | Area/radius dependent | No | No embedded frontend keys | Backend only | Yes | Provider-specific | Provider name in payload |
| Licensed AIS provider | Vessel positions | Provider dependent | Live/current | Provider coverage dependent | Provider dependent | Yes | No embedded frontend keys | Yes | Yes | Provider-specific AIS terms | Configured AIS provider |
| NASA EONET | Natural event metadata, wildfires | Event metadata dependent | Curated event delay | Global events | Event history via API | No | Yes | Optional | NASA | NASA EONET |
| Open-Meteo | Weather model point/area fields | Hourly/model dependent | Model dependent | Global | Forecast and historical APIs | No for standard usage | JSON API supports static-compatible requests | Optional cache recommended | Open-Meteo terms | Open-Meteo |
| CameraNet DOT/511/open data | Traffic cameras | Provider dependent | Provider dependent | Regional | Usually current metadata/snapshots | Some providers require tokens or blocked media | Mixed | Yes for stream/snapshot resolution | Provider-specific | Provider name |
| WPTV First Alert Weather / IPCamLive | PBI Airport/Downtown, Intracoastal, Peanut Island, and Jupiter public camera embeds | Publisher managed | Publisher dependent | Palm Beach County, Florida | No | No | Embeddable publisher player | No | WPTV and IPCamLive player terms | WPTV First Alert Weather |
| OpenStreetMap / Overpass | Power transmission lines within current viewport | OSM diff dependent; app cache 20 minutes | Community update dependent | Global OSM coverage where tagged | Current OSM data | No | Static Pages uses generated fallback snapshot; local mode uses bounded backend queries | Yes for live viewport queries | ODbL and OSM/Overpass usage policies | OpenStreetMap contributors |
| Submarine Cable Map public GeoJSON | Global submarine cable routes | Provider dataset dependent; app cache 24 hours | Dataset snapshot dependent | Global routes in feed | Current feed snapshot | No frontend key | Static Pages uses generated snapshot; local mode proxies JSON | Yes for live/cached local mode | Provider terms for public GeoJSON reuse | Submarine Cable Map |
| NOAA Submarine Cable Areas | U.S. and affiliated territories cable areas | Dataset dependent | Dataset dependent | U.S. waters and affiliated territories | Dataset snapshot | No | WMS/OGC/GeoJSON support varies | Optional | U.S. government/open data terms | NOAA / data.gov dataset |

## Removed or Disabled Provider Paths

- Zoom Earth tile/time endpoints are not approved for production use because the code used undocumented tile and JSON paths.
- Direct RainViewer tilecache requests from GitHub Pages are not approved because they trigger CORS and HTTP 429 failures in browsers. Local proxying can remain only if rate limited, cached, and labeled.

## Source Notes

- NASA GIBS documents public WMTS/WMS/TWMS/XYZ access and time dimensions.
- NOAA/NWS documents public API access at `https://api.weather.gov` and radar map services through weather.gov/radar and NOAA map services.
- USGS documents GeoJSON earthquake summary feeds.
- CelesTrak documents OMM JSON as the forward-compatible GP format. Orion uses `json2satrec` for OMM propagation and retains legacy TLE snapshots only as stale-if-error compatibility data.
- OpenSky documents state vector bounding-box requests, OAuth credentials, rate limits, and retry-after behavior.
- Live AIS is intentionally disabled until a licensed provider is configured server-side; Orion must not emit synthetic vessel tracks in production mode.
- OpenStreetMap/Overpass use must respect OSMF and Overpass policies; Project Orion only queries bounded local viewports and falls back to static data for broad views.
- Submarine cable rendering uses the configured public GeoJSON endpoint through local cache or generated Pages snapshots, with attribution shown in provider metadata.
- CameraNet exposes only records with a real snapshot, stream resolver, or approved public embed. The current no-credential adapters provide verified media in 21 states; they do not represent all 50 states, and Orion does not fabricate points for uncovered states.
- WPTV labels the curated Palm Beach feeds on its public weather-camera page. Coordinates are publisher-area placements rather than claims about the exact camera mast.
- DeFlock was reviewed as a spatial-clustering and camera-direction UX reference. Its OpenStreetMap surveillance-device data is not live camera media and is therefore not merged into CameraNet.
