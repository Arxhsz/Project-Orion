from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json
import os
import time

os.environ.setdefault("ORION_SYNTHETIC_INTEL", "1")

from camera_providers import get_all_cameras
import orion_server


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "pages-data" / "live"


class TleClient:
    fetch_tle_group = orion_server.OrionHandler.fetch_tle_group
    filter_tle_by_name = orion_server.OrionHandler.filter_tle_by_name


class AircraftClient:
    normalize_adsb_aircraft = orion_server.OrionHandler.normalize_adsb_aircraft


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def fetch_json(url, timeout=20):
    request = Request(url, headers={"User-Agent": "Project-Orion-Pages/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def build_satellites():
    client = TleClient()
    for requested_group, group in orion_server.CELESTRAK_GROUPS.items():
        try:
            raw = client.fetch_tle_group(group)
            payload = {
                "source": "CelesTrak",
                "group": requested_group,
                "groups": group if isinstance(group, list) else [group],
                "generated": int(time.time()),
                "mode": "pages-snapshot",
                "count": max(0, len([line for line in raw.splitlines() if line.startswith("1 ")])),
                "fetched": int(time.time()),
                "tle": raw,
            }
        except Exception as error:
            payload = {
                "source": "CelesTrak",
                "group": requested_group,
                "groups": group if isinstance(group, list) else [group],
                "error": type(error).__name__,
                "generated": int(time.time()),
                "mode": "pages-error",
                "count": 0,
                "fetched": None,
                "tle": "",
            }
        write_json(OUT / "satellites" / f"{requested_group}.json", payload)


def build_earthquakes():
    for feed, url in orion_server.USGS_EARTHQUAKE_FEEDS.items():
        try:
            upstream = fetch_json(url, timeout=15)
            features = upstream.get("features") or []
            payload = {
                "source": "USGS",
                "feed": feed,
                "generated": upstream.get("metadata", {}).get("generated"),
                "count": len(features),
                "mode": "pages-snapshot",
                "fallback": False,
                "features": features[:200],
            }
        except Exception as error:
            payload = {
                "source": "USGS",
                "feed": feed,
                "error": type(error).__name__,
                "generated": None,
                "count": 0,
                "mode": "pages-error",
                "fallback": False,
                "features": [],
            }
        write_json(OUT / "earthquakes" / f"{feed}.json", payload)


def build_weather_radar():
    payload = {
        "source": "NOAA/NWS",
        "provider": "radar_base_reflectivity",
        "map_service": orion_server.NOAA_RADAR_MAPSERVER_URL,
        "generated": int(time.time()),
        "count": 1,
        "mode": "pages-map-service",
        "fallback": False,
        "supportsHistorical": False,
        "refresh_seconds": 300,
        "latest": {
            "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "url": orion_server.NOAA_RADAR_MAPSERVER_URL,
        },
        "frames": [],
        "attribution": "NOAA / National Weather Service",
    }
    write_json(OUT / "weather" / "radar.json", payload)


def build_weather_fields():
    modes = ["precipitation", "wind", "temperature", "humidity", "pressure"]
    for mode in modes:
        payload = {
            "source": "Open-Meteo",
            "provider": "Open-Meteo Forecast API",
            "api": orion_server.OPEN_METEO_FORECAST_URL,
            "weather_mode": mode,
            "generated": int(time.time()),
            "refresh_seconds": 600,
            "count": 0,
            "mode": "metadata-only",
            "fallback": False,
            "latest": None,
            "frames": [],
            "tile_template": None,
            "supportsHistorical": True,
            "supportsLive": True,
            "attribution": "Open-Meteo",
            "message": "Documented Open-Meteo JSON fields are approved, but Orion has no approved raster tile renderer for this mode yet.",
        }
        write_json(OUT / "weather" / f"field-{mode}.json", payload)


def build_wildfires():
    try:
        upstream = fetch_json(orion_server.NASA_EONET_WILDFIRES_URL, timeout=15)
        features = []
        for event in upstream.get("events") or []:
            geometry = (event.get("geometry") or [])[-1:] or []
            if not geometry:
                continue
            coords = geometry[0].get("coordinates")
            if not isinstance(coords, list) or len(coords) < 2:
                continue
            features.append({
                "id": event.get("id"),
                "name": event.get("title") or "Wildfire",
                "kind": "event",
                "category": "wildfire",
                "lat": coords[1],
                "lon": coords[0],
                "intensity": 0.7,
                "time": geometry[0].get("date"),
            })
        payload = {
            "source": "NASA EONET",
            "generated": int(time.time()),
            "count": len(features[:40]),
            "mode": "pages-snapshot",
            "fallback": False,
            "features": features[:40],
        }
    except Exception as error:
        payload = {
            "source": "NASA EONET",
            "error": type(error).__name__,
            "generated": int(time.time()),
            "count": 0,
            "mode": "pages-error",
            "fallback": False,
            "features": [],
        }
    write_json(OUT / "wildfires.json", payload)


def build_aircraft():
    seen = set()
    states = []
    generated = int(time.time())
    client = AircraftClient()
    errors = []
    for provider_url in orion_server.ADSB_POINT_PROVIDERS:
        provider_name = "adsb.lol" if "adsb.lol" in provider_url else "airplanes.live"
        for area_name, lat, lon, radius in orion_server.ADSB_SAMPLE_POINTS:
            try:
                upstream = fetch_json(provider_url.format(lat=lat, lon=lon, radius=radius), timeout=6)
            except Exception as error:
                errors.append(type(error).__name__)
                continue
            for aircraft in upstream.get("ac") or []:
                normalized = client.normalize_adsb_aircraft(aircraft, generated, provider_name, area_name)
                if not normalized:
                    continue
                key = normalized.get("icao24") or f"{normalized.get('lat')},{normalized.get('lon')},{normalized.get('callsign')}"
                if key in seen:
                    continue
                seen.add(key)
                states.append(normalized)
        if states:
            break
    payload = {
        "source": "ADS-B public point feeds",
        "mode": "pages-snapshot" if states else "pages-error",
        "time": generated,
        "count": len(states),
        "states": states[:8000],
    }
    if errors and not states:
        payload["error"] = errors[-1]
    write_json(OUT / "aircraft.json", payload)


def build_cameras():
    try:
        cameras, providers = get_all_cameras((-125.2, 24.1, -66.7, 49.6), None, None)
        clean = []
        for camera in cameras[:30000]:
            item = dict(camera)
            for key in ("stream_url", "proxy_stream_url", "snapshot_url", "proxy_snapshot_url"):
                value = item.get(key)
                if isinstance(value, str) and value.startswith("/"):
                    item.pop(key, None)
            clean.append(item)
        payload = {
            "source": "CameraNet pages snapshot",
            "mode": "pages-snapshot",
            "count": len(clean),
            "total": len(clean),
            "providers": providers,
            "cached": False,
            "generated": int(time.time()),
            "cameras": clean,
        }
    except Exception as error:
        payload = {
            "source": "CameraNet pages snapshot",
            "mode": "pages-error",
            "error": type(error).__name__,
            "count": 0,
            "total": 0,
            "providers": [],
            "generated": int(time.time()),
            "cameras": [],
        }
    write_json(OUT / "cameras.json", payload)


def build_intel():
    live_functions = {
        "emergencyIncidents": orion_server.nws_alerts_payload,
        "volumetricWeather": orion_server.nws_weather_volume_payload,
        "lightning": orion_server.nws_lightning_payload,
        "underseaCables": orion_server.submarine_cables_payload,
    }
    layers = [
        "liveShips",
        "cyberNetwork",
        "defenseAirspace",
        "underseaCables",
        "powerGrid",
        "rfHeatmap",
        "emergencyIncidents",
        "volumetricWeather",
        "lightning",
        "airCorridors",
    ]
    for layer in layers:
        try:
            if layer in live_functions:
                payload = live_functions[layer](force=True)
                if not payload.get("count"):
                    fallback_mode = "pages-snapshot" if not payload.get("error") else (payload.get("mode") or "pages-fallback")
                    payload = orion_server.static_intel_payload(layer, mode=fallback_mode, error=payload.get("error"))
            else:
                payload = orion_server.static_intel_payload(layer, mode="pages-snapshot")
        except Exception as error:
            payload = orion_server.static_intel_payload(layer, mode="pages-fallback", error=type(error).__name__)
        if not payload:
            payload = {
                "source": "Orion pages snapshot",
                "mode": "pages-error",
                "error": "Unavailable",
                "generated": int(time.time()),
                "count": 0,
                "features": [],
            }
        write_json(OUT / "intel" / f"{layer}.json", payload)


def main():
    build_satellites()
    build_earthquakes()
    build_weather_radar()
    build_weather_fields()
    build_wildfires()
    build_aircraft()
    build_cameras()
    build_intel()


if __name__ == "__main__":
    main()
