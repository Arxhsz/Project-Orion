from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
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
    try:
        upstream = fetch_json(orion_server.RAINVIEWER_MAPS_URL, timeout=15)
        past = upstream.get("radar", {}).get("past") or []
        nowcast = upstream.get("radar", {}).get("nowcast") or []
        frames = (past + nowcast)[-12:]
        payload = {
            "source": "RainViewer",
            "generated": upstream.get("generated"),
            "count": len(frames),
            "mode": "pages-snapshot",
            "fallback": False,
            "host": upstream.get("host") or orion_server.RAINVIEWER_ORIGIN,
            "latest": frames[-1] if frames else None,
            "frames": frames,
        }
    except Exception as error:
        payload = {
            "source": "RainViewer",
            "error": type(error).__name__,
            "generated": int(time.time()),
            "count": 0,
            "mode": "pages-error",
            "fallback": False,
            "latest": None,
            "frames": [],
        }
    write_json(OUT / "weather" / "radar.json", payload)


def zoom_iso(seconds):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(seconds)))


def build_zoom_forecast_frames(times_payload, layer_name, level_name, limit=72):
    level_payload = ((times_payload or {}).get(layer_name) or {}).get(level_name) or {}
    now = time.time()
    candidates = []
    for run_key, hours in level_payload.items():
        try:
            run_ts = int(run_key)
        except (TypeError, ValueError):
            continue
        if not isinstance(hours, list):
            continue
        for value in hours:
            try:
                forecast_hour = int(value)
            except (TypeError, ValueError):
                continue
            valid_ts = run_ts + forecast_hour * 3600
            candidates.append({
                "run_ts": run_ts,
                "forecast_hour": forecast_hour,
                "valid_ts": valid_ts,
            })
    deduped = {}
    for entry in candidates:
        current = deduped.get(entry["valid_ts"])
        if current is None or entry["run_ts"] > current["run_ts"]:
            deduped[entry["valid_ts"]] = entry
    candidates = sorted(deduped.values(), key=lambda entry: (entry["valid_ts"], entry["run_ts"]))
    selected = ([entry for entry in candidates if entry["valid_ts"] <= now] or candidates)[-limit:]
    frames = []
    for entry in selected:
        run_path = time.strftime("%Y-%m-%d/%H%M", time.gmtime(entry["run_ts"]))
        forecast_path = f"f{entry['forecast_hour']:03d}"
        frames.append({
            "path": f"https://tiles.zoom.earth/icon/v1/{layer_name}/webp/{level_name}/{run_path}/{forecast_path}/" + "{z}/{y}/{x}.webp",
            "run_time": zoom_iso(entry["run_ts"]),
            "valid_time": zoom_iso(entry["valid_ts"]),
            "forecast_hour": entry["forecast_hour"],
        })
    return frames


def select_zoom_forecast(times_payload, layer_name, level_name):
    frames = build_zoom_forecast_frames(times_payload, layer_name, level_name, limit=1)
    return frames[-1] if frames else None


def select_zoom_radar(times_payload):
    reflectivity = (times_payload or {}).get("reflectivity") or {}
    now = time.time()
    frames = []
    for key, tile_hash in reflectivity.items():
        try:
            ts = int(key)
        except (TypeError, ValueError):
            continue
        if tile_hash:
            frames.append((ts, str(tile_hash)))
    frames.sort(key=lambda entry: entry[0])
    selected = ([entry for entry in frames if entry[0] <= now] or frames)[-12:]
    output = []
    for ts, tile_hash in selected:
        day = time.strftime("%Y-%m-%d", time.gmtime(ts))
        hm = time.strftime("%H%M", time.gmtime(ts))
        output.append({
            "time": zoom_iso(ts),
            "hash": tile_hash,
            "path": f"https://tiles.zoom.earth/radar/reflectivity/{day}/{hm}/{tile_hash}/" + "{z}/{y}/{x}.webp",
        })
    return output


def build_zoom_weather():
    modes = {
        "precipitation": ("precipitation", "surface"),
        "wind": ("wind-speed", "10m"),
        "temperature": ("temperature", "2m"),
        "humidity": ("humidity", "2m"),
        "pressure": ("pressure", "msl"),
    }
    try:
        radar_times = fetch_json(f"{orion_server.ZOOM_EARTH_TIMES_ORIGIN}/radar.json", timeout=15)
        frames = select_zoom_radar(radar_times)
        latest = frames[-1] if frames else None
        write_json(OUT / "weather" / "zoom-radar.json", {
            "source": "Zoom Earth",
            "provider": "Zoom Earth radar",
            "mode": "pages-snapshot",
            "weather_mode": "radar",
            "generated": int(time.time()),
            "refresh_seconds": 300,
            "count": len(frames),
            "latest": latest,
            "frames": frames,
            "tile_template": latest["path"] if latest else None,
            "fallback": False,
        })
    except Exception as error:
        write_json(OUT / "weather" / "zoom-radar.json", {
            "source": "Zoom Earth",
            "provider": "Zoom Earth radar",
            "mode": "pages-error",
            "weather_mode": "radar",
            "generated": int(time.time()),
            "refresh_seconds": 300,
            "count": 0,
            "latest": None,
            "frames": [],
            "tile_template": None,
            "fallback": False,
            "error": type(error).__name__,
        })
    try:
        icon_times = fetch_json(f"{orion_server.ZOOM_EARTH_TIMES_ORIGIN}/icon.json", timeout=15)
    except Exception as error:
        icon_times = None
        icon_error = type(error).__name__
    else:
        icon_error = None
    for mode, mapping in modes.items():
        frames = build_zoom_forecast_frames(icon_times, mapping[0], mapping[1]) if icon_times else []
        frame = frames[-1] if frames else None
        payload = {
            "source": "Zoom Earth",
            "provider": "DWD ICON via Zoom Earth",
            "mode": "pages-snapshot" if frame else "pages-error",
            "weather_mode": mode,
            "zoom_layer": mapping[0],
            "level": mapping[1],
            "generated": int(time.time()),
            "refresh_seconds": 600,
            "count": len(frames),
            "latest": frame,
            "frames": frames,
            "tile_template": frame["path"] if frame else None,
            "fallback": False,
        }
        if icon_error:
            payload["error"] = icon_error
        write_json(OUT / "weather" / f"zoom-{mode}.json", payload)


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
    build_zoom_weather()
    build_wildfires()
    build_aircraft()
    build_cameras()
    build_intel()


if __name__ == "__main__":
    main()
