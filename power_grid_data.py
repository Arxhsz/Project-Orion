import hashlib
import json
import math
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


OPENINFRAMAP_POWER_TILE = "https://openinframap.org/map/power/0/0/0.pbf"
ARCGIS_US_TRANSMISSION_QUERY = (
    "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/"
    "US_Electric_Power_Transmission_Lines/FeatureServer/0/query"
)
USER_AGENT = "Project-Orion/1.1 (+https://github.com/Arxhsz/Project-Orion)"


def _voltage_kv(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _keep_global_line(properties):
    voltage = _voltage_kv(properties.get("voltage"))
    if voltage >= 275:
        return True
    if properties.get("type") == "cable" and voltage >= 200:
        return True
    if voltage < 220:
        return False

    osm_id = str(properties.get("osm_id") or "")
    digest = hashlib.sha1(osm_id.encode("ascii", errors="ignore")).digest()
    return digest[0] % 8 == 0


def _tile_point_to_lonlat(point, zoom=0, tile_x=0, tile_y=0, extent=4096):
    tiles = 2 ** zoom
    x = (tile_x + float(point[0]) / extent) / tiles
    y = (tile_y + (extent - float(point[1])) / extent) / tiles
    lon = x * 360.0 - 180.0
    mercator = math.pi * (1.0 - 2.0 * y)
    lat = math.degrees(math.atan(math.sinh(mercator)))
    return [round(lon, 5), round(lat, 5), 64]


def decode_openinframap_power_tile(payload):
    try:
        import mapbox_vector_tile
    except ImportError as error:
        raise RuntimeError("mapbox-vector-tile is required to build the global power snapshot") from error

    decoded = mapbox_vector_tile.decode(payload)
    layer = decoded.get("power_line") or {}
    extent = int(layer.get("extent") or 4096)
    features = []

    for feature in layer.get("features") or []:
        properties = feature.get("properties") or {}
        if not _keep_global_line(properties):
            continue

        geometry = feature.get("geometry") or {}
        geometry_type = geometry.get("type")
        coordinates = geometry.get("coordinates") or []
        paths = coordinates if geometry_type == "MultiLineString" else [coordinates]
        voltage_kv = _voltage_kv(properties.get("voltage"))

        for path_index, path in enumerate(paths):
            normalized = [_tile_point_to_lonlat(point, extent=extent) for point in path]
            if len(normalized) < 2:
                continue

            osm_id = properties.get("osm_id") or len(features)
            category = properties.get("type") or "line"
            features.append({
                "id": f"oim-global-{osm_id}-{path_index}",
                "name": properties.get("name") or f"{voltage_kv:g} kV {category}",
                "kind": "line",
                "category": category,
                "status": "construction" if properties.get("construction") else "active",
                "source": "OpenInfraMap global vector tiles",
                "provider": "OpenInfraMap / OpenStreetMap contributors",
                "voltage": int(voltage_kv * 1000),
                "points": normalized,
                "metadata": {
                    "osm_id": properties.get("osm_id"),
                    "operator": properties.get("operator"),
                    "frequency": properties.get("frequency"),
                    "location": properties.get("location"),
                },
            })

    return features


def fetch_openinframap_global_power():
    request = Request(OPENINFRAMAP_POWER_TILE, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/vnd.mapbox-vector-tile, application/x-protobuf",
    })
    with urlopen(request, timeout=35) as response:
        features = decode_openinframap_power_tile(response.read())

    return {
        "source": "OpenInfraMap global power vector tiles",
        "provider": "OpenInfraMap / OpenStreetMap contributors",
        "provider_health": "online",
        "mode": "global-backbone",
        "fallback": False,
        "cached": False,
        "generated": int(time.time()),
        "count": len(features),
        "features": features,
        "attribution": "OpenInfraMap; OpenStreetMap contributors",
    }


def load_bundled_global_power(root=None):
    root_path = Path(root) if root else Path(__file__).resolve().parent
    snapshot_path = root_path / "pages-data" / "live" / "intel" / "powerGrid.json"
    with snapshot_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    payload["cached"] = True
    payload["generated"] = int(payload.get("generated") or time.time())
    payload["count"] = len(payload.get("features") or [])
    return payload


def filter_power_features_to_bbox(payload, bbox, limit=6000):
    selected = []
    west, south, east, north = bbox["west"], bbox["south"], bbox["east"], bbox["north"]

    for feature in payload.get("features") or []:
        points = feature.get("points") or []
        if any(west <= point[0] <= east and south <= point[1] <= north for point in points):
            selected.append(feature)
        if len(selected) >= limit:
            break

    return selected


def fetch_arcgis_us_transmission(bbox, limit=1600):
    if bbox["east"] < -180 or bbox["west"] > -50 or bbox["north"] < 15 or bbox["south"] > 75:
        return []

    params = {
        "f": "geojson",
        "where": "1=1",
        "geometry": ",".join(str(bbox[key]) for key in ("west", "south", "east", "north")),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "ID,TYPE,STATUS,OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,SOURCE",
        "returnGeometry": "true",
        "resultRecordCount": str(limit),
    }
    request = Request(ARCGIS_US_TRANSMISSION_QUERY + "?" + urlencode(params), headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/geo+json, application/json",
    })
    with urlopen(request, timeout=24) as response:
        upstream = json.loads(response.read().decode("utf-8", errors="replace"))

    normalized = []
    for index, feature in enumerate(upstream.get("features") or []):
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        paths = coordinates if geometry.get("type") == "MultiLineString" else [coordinates]
        voltage_kv = _voltage_kv(properties.get("VOLTAGE"))

        for path_index, path in enumerate(paths):
            points = [[round(float(point[0]), 6), round(float(point[1]), 6), 58] for point in path]
            if len(points) < 2:
                continue
            normalized.append({
                "id": f"arcgis-us-{properties.get('ID') or index}-{path_index}",
                "name": " - ".join(filter(None, [properties.get("SUB_1"), properties.get("SUB_2")])) or "U.S. transmission line",
                "kind": "line",
                "category": str(properties.get("TYPE") or "line").lower(),
                "status": properties.get("STATUS") or "unknown",
                "source": "U.S. Electric Power Transmission Lines",
                "provider": "ArcGIS Living Atlas / EIA-HIFLD",
                "voltage": int(voltage_kv * 1000),
                "points": points,
                "metadata": {
                    "owner": properties.get("OWNER"),
                    "voltage_class": properties.get("VOLT_CLASS"),
                    "source_record": properties.get("SOURCE"),
                },
            })

    return normalized
