from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen
import html
import json
import math
import os
import io
import copy
from datetime import datetime, timedelta
import re
import struct
import sys
import threading
import time
import zlib

try:
    from PIL import Image, ImageStat
except Exception:
    Image = None
    ImageStat = None


try:
    from camera_providers import get_all_cameras, get_provider_status, CAMERA_PROVIDERS, resolve_camera_provider_stream
    CAMERANET_AVAILABLE = True
except ImportError:
    CAMERANET_AVAILABLE = False
    print("Warning: camera_providers.py not found. CameraNet will use fallback mode.")


ROOT = Path(__file__).resolve().parent
GIBS_ORIGIN = "https://gibs.earthdata.nasa.gov"
ESRI_IMAGERY_ORIGIN = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"
ADSB_POINT_PROVIDERS = (
    "https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}",
    "https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}",
)
ADSB_SAMPLE_POINTS = (
    ("New York", 40.6413, -73.7781, 250),
    ("Atlanta", 33.6407, -84.4277, 250),
    ("Chicago", 41.9742, -87.9073, 250),
    ("Dallas", 32.8998, -97.0403, 250),
    ("Los Angeles", 33.9416, -118.4085, 250),
    ("Seattle", 47.4502, -122.3088, 250),
    ("Miami", 25.7959, -80.2870, 250),
    ("London", 51.4700, -0.4543, 250),
    ("Frankfurt", 50.0379, 8.5622, 250),
    ("Tokyo", 35.5494, 139.7798, 250),
)
CELESTRAK_GROUPS = {
    "stations": "stations",
    "active": "active",
    "starlink": "starlink",
    "debris": "cosmos-2251-debris",
    "internet": ["starlink", "oneweb", "iridium-NEXT", "orbcomm", "globalstar", "swarm"],
    "communications": ["geo", "intelsat", "ses", "iridium", "iridium-NEXT", "globalstar", "orbcomm", "amateur"],
    "positioning": ["gnss", "gps-ops", "glo-ops", "galileo", "beidou", "sbas"],
    "earth-imaging": ["resource", "planet", "spire"],
    "weather": ["weather", "noaa", "goes"],
    "science": ["science", "geodetic", "engineering", "stations"],
    "iot": ["swarm", "orbcomm", "globalstar"],
}
CELESTRAK_TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle"
CELESTRAK_SUPPLEMENTAL_URL = "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE={file}&FORMAT=tle"
USGS_EARTHQUAKE_FEEDS = {
    "1.0_day": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.0_day.geojson",
    "2.5_day": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    "4.5_day": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
    "2.5_week": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson",
    "4.5_week": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    "all_day": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "all_week": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
}
RAINVIEWER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json"
RAINVIEWER_ORIGIN = "https://tilecache.rainviewer.com"
ZOOM_EARTH_TILE_ORIGIN = "https://tiles.zoom.earth"
ZOOM_EARTH_TIMES_ORIGIN = "https://tiles.zoom.earth/times"
ZOOM_EARTH_MODEL = "icon"
ZOOM_EARTH_MODEL_VERSION = "v1"
ZOOM_EARTH_MODE_MAP = {
    "precipitation": ("precipitation", "surface"),
    "wind": ("wind-speed", "10m"),
    "wind-speed": ("wind-speed", "10m"),
    "temperature": ("temperature", "2m"),
    "humidity": ("humidity", "2m"),
    "pressure": ("pressure", "msl"),
}
ZOOM_EARTH_TILE_PREFIXES = (
    "/icon/",
    "/gfs/",
    "/radar/reflectivity/",
    "/radar/coverage/",
    "/static/land/",
    "/static/bluemarble/",
)
NASA_EONET_WILDFIRES_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=200"
NWS_ACTIVE_ALERTS_URL = "https://api.weather.gov/alerts/active?status=actual&message_type=alert"
FL511_CAMERA_LAYER_URL = "https://services.arcgis.com/3wFbqsFPLeKqOlIK/ArcGIS/rest/services/FL511_Traffic_Cameras/FeatureServer/0"
FL511_CONGESTION_LAYER_URL = "https://services.arcgis.com/3wFbqsFPLeKqOlIK/ArcGIS/rest/services/Road_Closures/FeatureServer/5"

SEATTLE_CAMERAS_URL = "https://data.seattle.gov/resource/65fc-btcc.json"
NYC_CAMERAS_URL = "https://data.cityofnewyork.us/resource/qcdj-rwhu.json"

COUNTRIES_GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
US_STATES_GEOJSON_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"
SUBMARINE_CABLE_GEOJSON_URL = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json"
CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self' blob: https://cdn.jsdelivr.net 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; "
    "script-src-elem 'self' blob: https://cdn.jsdelivr.net 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; "
    "script-src-attr 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: blob: https://cdn.jsdelivr.net https://gibs.earthdata.nasa.gov https://server.arcgisonline.com https://images-dim.divas.cloud https://*.divas.cloud https://*.divas.cloud:8200 https://images.unsplash.com; "
    "media-src 'self' blob: https://divas.cloud https://*.divas.cloud https://*.divas.cloud:8200; "
    "connect-src 'self' data: https://cdn.jsdelivr.net https://gibs.earthdata.nasa.gov https://server.arcgisonline.com https://nominatim.openstreetmap.org https://fl511.com https://divas.cloud https://*.divas.cloud https://*.divas.cloud:8200 https://data.seattle.gov https://data.cityofnewyork.us; "
    "worker-src 'self' blob: data: https://cdn.jsdelivr.net; "
    "child-src blob:; "
    "font-src 'self' data: https://cdn.jsdelivr.net; "
    "object-src 'none'; "
    "base-uri 'self'"
)
CAMERA_STREAM_BOUNDARY = "orion-camera-frame"
CLIENT_DISCONNECT_ERRORS = (BrokenPipeError, ConnectionAbortedError, ConnectionResetError)
AIRCRAFT_CACHE = {"timestamp": 0, "payload": None}
FEED_CACHE = {}
CAMERA_CACHE = {"timestamp": 0, "payload": None, "providers": []}
CAMERA_RESPONSE_CACHE = {}
CAMERA_BY_ID = {}
FL511_VERIFICATION_CACHE = {"timestamp": 0, "token": ""}
TILE_CACHE_ROOT = ROOT / ".orion_tile_cache"
GIBS_NEGATIVE_CACHE = {}
GIBS_NEGATIVE_CACHE_SEC = 600
GIBS_DATED_PATH_RE = re.compile(r"/default/(\d{4}-\d{2}-\d{2})/")
GIBS_TRUECOLOR_FALLBACK_LAYER = (
    ("VIIRS_NOAA20_CorrectedReflectance_TrueColor", "MODIS_Terra_CorrectedReflectance_TrueColor"),
    ("VIIRS_SNPP_CorrectedReflectance_TrueColor", "MODIS_Terra_CorrectedReflectance_TrueColor"),
)


def png_chunk(kind, payload):
    header = kind + payload
    return struct.pack(">I", len(payload)) + header + struct.pack(">I", zlib.crc32(header) & 0xFFFFFFFF)


def transparent_png(width=256, height=256):
    scanline = b"\x00" + (b"\x00\x00\x00\x00" * width)
    raw = scanline * height
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(raw, 9))
        + png_chunk(b"IEND", b"")
    )


TRANSPARENT_PNG = transparent_png()


def is_blank_gibs_tile(target_path, payload):
    if not payload:
        return True
    if "CorrectedReflectance_TrueColor" in target_path:
        if len(payload) <= 2200:
            return True
        if Image and ImageStat:
            try:
                with Image.open(io.BytesIO(payload)) as image:
                    stats = ImageStat.Stat(image.convert("L"))
                    luminance = stats.mean[0]
                    median = stats.median[0]
                    if luminance < 45 and median < 40:
                        return True
            except Exception:
                pass
    return False


def prepare_gibs_tile_for_client(target_path, payload, suffix):
    if "CorrectedReflectance_TrueColor" not in target_path or not Image:
        return payload, suffix

    try:
        with Image.open(io.BytesIO(payload)) as image:
            rgba = image.convert("RGBA")
            pixels = rgba.load()
            width, height = rgba.size

            for y in range(height):
                for x in range(width):
                    r, g, b, a = pixels[x, y]
                    luminance = (r * 299 + g * 587 + b * 114) / 1000
                    chroma = max(r, g, b) - min(r, g, b)
                    if luminance < 42 or (luminance < 62 and chroma < 28):
                        pixels[x, y] = (r, g, b, 0)
                    elif luminance < 78 and chroma < 36:
                        pixels[x, y] = (r, g, b, int(a * 0.3))

            output = io.BytesIO()
            rgba.save(output, format="PNG", optimize=True)
            return output.getvalue(), ".png"
    except Exception:
        return payload, suffix


STATIC_INTEL_LAYERS = {
    "liveShips": {
        "source": "AIS adapter / high-density fallback",
        "features": [
            {"id": "ais-north-atlantic-01", "name": "ATLANTIC MERCHANT", "kind": "moving", "category": "container", "periodHours": 92, "phase": 0.16, "route": [[-74.0, 40.5, 28], [-52.0, 43.8, 28], [-25.0, 49.0, 28], [-5.5, 50.2, 28], [4.3, 51.9, 28]]},
            {"id": "ais-pacific-02", "name": "PACIFIC RUNNER", "kind": "moving", "category": "bulk", "periodHours": 120, "phase": 0.48, "route": [[140.3, 35.0, 28], [166.0, 34.0, 28], [-162.0, 35.2, 28], [-139.0, 37.8, 28], [-122.7, 37.6, 28]]},
            {"id": "ais-suez-03", "name": "SUEZ VECTOR", "kind": "moving", "category": "tanker", "periodHours": 58, "phase": 0.71, "route": [[32.3, 29.9, 28], [34.2, 25.3, 28], [39.2, 18.4, 28], [48.7, 14.2, 28], [56.3, 23.7, 28]]},
            {"id": "ais-north-sea-04", "name": "NORDIC STAR", "kind": "moving", "category": "cargo", "periodHours": 42, "phase": 0.22, "route": [[4.5, 52.4, 28], [2.1, 54.6, 28], [-1.2, 57.8, 28]]},
            {"id": "ais-med-05", "name": "MEDITERRANEAN ECHO", "kind": "moving", "category": "passenger", "periodHours": 76, "phase": 0.88, "route": [[12.5, 41.9, 28], [14.3, 38.1, 28], [24.1, 37.2, 28]]},
            {"id": "ais-gulf-06", "name": "ARABIAN EXPRESS", "kind": "moving", "category": "oil", "periodHours": 110, "phase": 0.05, "route": [[55.3, 25.2, 28], [62.4, 22.8, 28], [72.1, 18.9, 28]]},
            {"id": "ais-singapore-07", "name": "MALACCA SPIRIT", "kind": "moving", "category": "container", "periodHours": 64, "phase": 0.34, "route": [[103.8, 1.3, 28], [101.2, 2.5, 28], [98.5, 5.2, 28]]}
        ],
    },
    "cyberNetwork": {
        "source": "Cloudflare / RIPE / BGP adapter fallback",
        "features": [
            {"id": "cyber-na-eu", "name": "Transatlantic packet arc", "kind": "arc", "intensity": 0.82, "points": [[-74.0, 40.7, 90000], [-30.0, 52.0, 440000], [0.1, 51.5, 90000]]},
            {"id": "cyber-apac-us", "name": "Pacific routing burst", "kind": "arc", "intensity": 0.67, "points": [[139.7, 35.6, 90000], [178.0, 42.0, 520000], [-122.4, 37.8, 90000]]},
            {"id": "cyber-gulf-eu", "name": "Regional outage watch", "kind": "arc", "intensity": 0.52, "points": [[55.3, 25.2, 70000], [31.2, 36.0, 260000], [13.4, 52.5, 70000]]},
            {"id": "cyber-eu-asia", "name": "Eurasia fiber hub", "kind": "arc", "intensity": 0.74, "points": [[12.5, 41.9, 80000], [60.0, 55.0, 380000], [116.4, 39.9, 80000]]},
            {"id": "cyber-br-us", "name": "Southern Hemisphere uplink", "kind": "arc", "intensity": 0.58, "points": [[-43.2, -22.9, 70000], [-60.0, 10.0, 290000], [-74.0, 40.7, 70000]]},
            {"id": "cyber-za-eu", "name": "African backbone spike", "kind": "arc", "intensity": 0.45, "points": [[18.4, -33.9, 70000], [15.0, 10.0, 310000], [2.3, 48.8, 70000]]},
            {"id": "cyber-jp-au", "name": "Tok-Syd express lane", "kind": "arc", "intensity": 0.61, "points": [[139.7, 35.6, 80000], [150.0, 0.0, 420000], [151.2, -33.8, 80000]]}
        ],
    },
    "defenseAirspace": {
        "source": "FAA NOTAM/TFR adapter fallback",
        "features": [
            {"id": "tfr-dc", "name": "Restricted airspace DC", "kind": "area", "lat": 38.9, "lon": -77.04, "radius": 72000, "intensity": 0.86},
            {"id": "tfr-vandenberg", "name": "Launch corridor west", "kind": "area", "lat": 34.74, "lon": -120.57, "radius": 96000, "intensity": 0.48},
            {"id": "tfr-groom", "name": "High security airspace", "kind": "area", "lat": 37.24, "lon": -115.81, "radius": 142000, "intensity": 0.92},
            {"id": "tfr-kennedy", "name": "Cape Canaveral ops", "kind": "area", "lat": 28.57, "lon": -80.64, "radius": 84000, "intensity": 0.65},
            {"id": "tfr-norfolk", "name": "Fleet support perimeter", "kind": "area", "lat": 36.85, "lon": -76.28, "radius": 56000, "intensity": 0.54},
            {"id": "tfr-san-diego", "name": "Pacific fleet maneuvers", "kind": "area", "lat": 32.71, "lon": -117.16, "radius": 78000, "intensity": 0.42}
        ],
    },
    "underseaCables": {
        "source": "Submarine cable GeoJSON fallback",
        "features": [
            {"id": "cable-atlantic-01", "name": "Atlantic fiber trunk", "kind": "line", "points": [[-74.0, 40.5, 0], [-45.0, 43.2, 0], [-12.0, 50.0, 0], [-5.5, 50.2, 0]]},
            {"id": "cable-pacific-01", "name": "Pacific fiber trunk", "kind": "line", "points": [[139.7, 35.6, 0], [170.0, 38.0, 0], [-170.0, 42.0, 0], [-122.4, 37.8, 0]]},
            {"id": "cable-indian-01", "name": "Indian Ocean trunk", "kind": "line", "points": [[72.8, 19.0, 0], [60.0, 10.0, 0], [43.2, -12.0, 0], [18.4, -34.0, 0]]},
            {"id": "cable-med-01", "name": "Mediterranean express", "kind": "line", "points": [[-5.6, 36.1, 0], [12.5, 38.0, 0], [29.9, 31.2, 0]]},
            {"id": "cable-asia-01", "name": "ASEAN network fiber", "kind": "line", "points": [[103.8, 1.3, 0], [114.1, 22.3, 0], [121.5, 25.0, 0]]}
        ],
    },
    "powerGrid": {
        "source": "Global high-voltage corridor fallback",
        "features": [
            {"id": "grid-us-east", "name": "Eastern interconnect", "kind": "line", "points": [[-87.6, 41.8, 1200], [-83.0, 39.9, 1200], [-77.0, 38.9, 1200], [-74.0, 40.7, 1200]]},
            {"id": "grid-us-west", "name": "Western transmission", "kind": "line", "points": [[-122.4, 37.8, 1200], [-118.2, 34.0, 1200], [-112.0, 33.4, 1200]]},
            {"id": "grid-eu-core", "name": "Central Europe transfer", "kind": "line", "points": [[2.35, 48.85, 1200], [7.4, 46.9, 1200], [11.58, 48.14, 1200], [14.4, 50.1, 1200]]},
            {"id": "grid-jp", "name": "Japan HV corridor", "kind": "line", "points": [[139.7, 35.6, 1200], [137.4, 35.2, 1200], [135.5, 34.7, 1200]]},
            {"id": "grid-au", "name": "NSW power spine", "kind": "line", "points": [[151.2, -33.8, 1200], [149.1, -35.2, 1200], [144.9, -37.8, 1200]]}
        ],
    },
    "rfHeatmap": {
        "source": "OpenCellID / WiGLE dense urban fallback",
        "features": [
            {"id": "rf-nyc", "name": "NYC dense urban mesh", "kind": "heat", "lat": 40.75, "lon": -73.98, "radius": 82000, "intensity": 0.94},
            {"id": "rf-chicago", "name": "Chicago signal core", "kind": "heat", "lat": 41.87, "lon": -87.62, "radius": 74000, "intensity": 0.82},
            {"id": "rf-la", "name": "LA RF canopy", "kind": "heat", "lat": 34.05, "lon": -118.24, "radius": 112000, "intensity": 0.76},
            {"id": "rf-london", "name": "London coverage mesh", "kind": "heat", "lat": 51.5, "lon": -0.12, "radius": 88000, "intensity": 0.88},
            {"id": "rf-paris", "name": "Paris spectral density", "kind": "heat", "lat": 48.85, "lon": 2.35, "radius": 68000, "intensity": 0.74},
            {"id": "rf-tokyo", "name": "Tokyo hyper-urban mesh", "kind": "heat", "lat": 35.68, "lon": 139.76, "radius": 104000, "intensity": 0.92},
            {"id": "rf-singapore", "name": "Singapore signal saturation", "kind": "heat", "lat": 1.35, "lon": 103.81, "radius": 52000, "intensity": 0.96},
            {"id": "rf-sydney", "name": "Sydney coastal coverage", "kind": "heat", "lat": -33.86, "lon": 151.2, "radius": 72000, "intensity": 0.72}
        ],
    },
    "emergencyIncidents": {
        "source": "NWS alerts / emergency fallback",
        "features": [
            {"id": "alert-storm-01", "name": "Severe Thunderstorm", "kind": "event", "category": "emergency", "lat": 28.5, "lon": -81.4, "radius": 42000, "intensity": 0.88, "severity": "Severe"},
            {"id": "alert-flood-02", "name": "Flash Flood Watch", "kind": "event", "category": "emergency", "lat": 30.2, "lon": -97.7, "radius": 56000, "intensity": 0.74, "severity": "Moderate"},
            {"id": "alert-wind-03", "name": "High Wind Warning", "kind": "event", "category": "emergency", "lat": 40.7, "lon": -74.0, "radius": 92000, "intensity": 0.62, "severity": "Minor"}
        ],
    },
    "volumetricWeather": {
        "source": "NOAA / RainViewer volumetric adapter fallback",
        "features": [
            {"id": "storm-atlantic", "name": "Atlantic convective cell", "kind": "volume", "lat": 29.2, "lon": -67.0, "radius": 380000, "height": 115000, "intensity": 0.62},
            {"id": "storm-pacific", "name": "Pacific storm column", "kind": "volume", "lat": 42.4, "lon": -151.0, "radius": 520000, "height": 145000, "intensity": 0.54},
            {"id": "storm-indian", "name": "Monsoon cloud mass", "kind": "volume", "lat": 12.5, "lon": 82.0, "radius": 460000, "height": 130000, "intensity": 0.58},
        ],
    },
    "lightning": {
        "source": "Blitzortung / NOAA lightning adapter fallback",
        "features": [
            {"id": "lt-atlantic-01", "name": "Lightning strike cluster", "kind": "event", "lat": 28.9, "lon": -66.2, "intensity": 0.91, "category": "lightning"},
            {"id": "lt-gulf-01", "name": "Gulf strike front", "kind": "event", "lat": 27.0, "lon": -90.3, "intensity": 0.74, "category": "lightning"},
            {"id": "lt-sea-01", "name": "South China Sea strikes", "kind": "event", "lat": 14.0, "lon": 113.0, "intensity": 0.68, "category": "lightning"},
        ],
    },
    "socialEvents": {
        "source": "Ticketmaster / events fallback",
        "features": [
            {"id": "event-festival-01", "name": "Global Tech Summit", "kind": "event", "category": "social", "lat": 37.7, "lon": -122.4, "radius": 18000, "intensity": 0.92},
            {"id": "event-concert-02", "name": "Starlight Festival", "kind": "event", "category": "social", "lat": 51.5, "lon": -0.12, "radius": 24000, "intensity": 0.84},
            {"id": "event-sports-03", "name": "World Cup Arena", "lat": 25.3, "lon": 51.5, "radius": 32000, "intensity": 0.96}
        ],
    },
    "airCorridors": {
        "source": "FAA / OpenSky route adapter fallback",
        "features": [
            {"id": "route-atlantic-nat", "name": "North Atlantic track", "kind": "line", "points": [[-73.8, 40.6, 10800], [-52.0, 49.0, 11200], [-25.0, 53.0, 11200], [-0.45, 51.47, 10600]]},
            {"id": "route-pacific", "name": "Pacific flight corridor", "kind": "line", "points": [[139.78, 35.55, 11200], [160.0, 41.0, 11600], [-170.0, 47.0, 11600], [-149.99, 61.17, 10600]]},
            {"id": "route-gulf-eu", "name": "Gulf Europe corridor", "kind": "line", "points": [[55.36, 25.25, 10800], [43.8, 29.4, 11000], [32.0, 30.1, 10400], [12.25, 41.8, 9800]]},
        ],
    },
    "traffic": {
        "source": "Global traffic flow fallback",
        "features": [
            {"id": "traffic-la", "name": "Los Angeles congestion", "kind": "line", "intensity": 0.88, "points": [[-118.49, 34.01, 100], [-118.34, 34.05, 100], [-118.18, 34.11, 100]]},
            {"id": "traffic-nyc", "name": "New York road flow", "kind": "line", "intensity": 0.74, "points": [[-74.02, 40.7, 100], [-73.98, 40.75, 100], [-73.92, 40.8, 100]]},
            {"id": "traffic-london", "name": "London arterial flow", "kind": "line", "intensity": 0.63, "points": [[-0.3, 51.48, 100], [-0.12, 51.5, 100], [0.05, 51.52, 100]]},
            {"id": "traffic-tokyo", "name": "Shuto Expressway flow", "kind": "line", "intensity": 0.91, "points": [[139.6, 35.6, 100], [139.7, 35.7, 100], [139.8, 35.8, 100]]}
        ],
    },
}


GLOBAL_HUBS = [
    ("New York", -74.006, 40.713), ("London", -0.127, 51.507), ("Paris", 2.352, 48.857),
    ("Frankfurt", 8.682, 50.110), ("Dubai", 55.270, 25.205), ("Mumbai", 72.878, 19.076),
    ("Singapore", 103.819, 1.352), ("Tokyo", 139.650, 35.676), ("Sydney", 151.209, -33.869),
    ("Los Angeles", -118.244, 34.052), ("San Francisco", -122.419, 37.775), ("Seattle", -122.332, 47.606),
    ("Chicago", -87.630, 41.878), ("Dallas", -96.797, 32.777), ("Atlanta", -84.388, 33.749),
    ("Miami", -80.192, 25.762), ("Sao Paulo", -46.633, -23.550), ("Mexico City", -99.133, 19.433),
    ("Toronto", -79.383, 43.653), ("Johannesburg", 28.047, -26.204), ("Nairobi", 36.821, -1.292),
    ("Cairo", 31.236, 30.044), ("Istanbul", 28.978, 41.008), ("Seoul", 126.978, 37.566),
    ("Hong Kong", 114.169, 22.319), ("Jakarta", 106.845, -6.208), ("Rio", -43.173, -22.907),
    ("Buenos Aires", -58.381, -34.603), ("Lagos", 3.379, 6.524), ("Madrid", -3.704, 40.417),
]

PORTS = [
    ("New York Harbor", -74.01, 40.70), ("Rotterdam", 4.12, 51.95), ("Hamburg", 9.99, 53.55),
    ("Los Angeles Port", -118.27, 33.74), ("Oakland", -122.31, 37.80), ("Seattle", -122.34, 47.60),
    ("Tokyo Bay", 139.78, 35.56), ("Shanghai", 121.50, 31.20), ("Singapore", 103.82, 1.26),
    ("Hong Kong", 114.16, 22.30), ("Dubai Jebel Ali", 55.05, 25.01), ("Mumbai", 72.84, 18.95),
    ("Suez", 32.55, 29.95), ("Gibraltar", -5.35, 36.14), ("Cape Town", 18.42, -33.92),
    ("Sydney", 151.22, -33.86), ("Auckland", 174.76, -36.84), ("Panama", -79.90, 9.08),
    ("Santos", -46.30, -23.95), ("Buenos Aires", -58.36, -34.60), ("Vancouver", -123.12, 49.29),
    ("Busan", 129.04, 35.10), ("Manila", 120.98, 14.59), ("Jakarta", 106.80, -6.10),
]

SHIP_LANES = [
    [[-74.01, 40.70, 12], [-62.5, 42.2, 12], [-42.0, 47.6, 12], [-18.4, 49.8, 12], [4.12, 51.95, 12]],
    [[-118.27, 33.74, 10], [-137.5, 35.2, 10], [-164.0, 36.5, 10], [166.0, 35.4, 10], [139.78, 35.56, 10]],
    [[121.50, 31.20, 10], [123.6, 27.5, 10], [121.3, 22.4, 10], [114.16, 22.30, 10], [103.82, 1.26, 10]],
    [[103.82, 1.26, 10], [92.0, 5.4, 10], [80.6, 7.0, 10], [72.84, 18.95, 10], [55.05, 25.01, 10]],
    [[55.05, 25.01, 10], [58.4, 20.1, 10], [49.5, 13.8, 10], [42.0, 12.6, 10], [32.55, 29.95, 10]],
    [[32.55, 29.95, 10], [24.0, 33.0, 10], [12.0, 36.2, 10], [-5.35, 36.14, 10], [4.12, 51.95, 10]],
    [[-79.90, 9.08, 8], [-80.8, 17.2, 8], [-79.2, 25.8, 8], [-74.01, 40.70, 8]],
    [[-46.30, -23.95, 9], [-35.0, -28.0, 9], [-12.0, -31.5, 9], [18.42, -33.92, 9]],
    [[151.22, -33.86, 10], [158.0, -36.4, 10], [168.0, -37.0, 10], [174.76, -36.84, 10]],
    [[-122.34, 47.60, 9], [-126.7, 45.0, 9], [-124.0, 40.2, 9], [-122.31, 37.80, 9], [-118.27, 33.74, 9]],
    [[129.04, 35.10, 10], [126.0, 33.2, 10], [121.50, 31.20, 10], [114.16, 22.30, 10]],
    [[106.80, -6.10, 10], [110.5, -7.8, 10], [121.0, -9.4, 10], [151.22, -33.86, 10]],
]

def generated_at():
    return int(time.time())


def interpolate_route(start, end, height=0, bend=0.0):
    lon1, lat1 = start
    lon2, lat2 = end
    mid_lon = (lon1 + lon2) / 2 + bend
    mid_lat = (lat1 + lat2) / 2 + (abs(lon1 - lon2) % 18) * 0.18
    return [[round(lon1, 3), round(lat1, 3), height], [round(mid_lon, 3), round(mid_lat, 3), height], [round(lon2, 3), round(lat2, 3), height]]


def arc_route(start, end, height=90000, apex=460000):
    lon1, lat1 = start
    lon2, lat2 = end
    return [
        [round(lon1, 3), round(lat1, 3), height],
        [round((lon1 + lon2) / 2, 3), round((lat1 + lat2) / 2 + 6, 3), apex],
        [round(lon2, 3), round(lat2, 3), height],
    ]


def distance_km(lat1, lon1, lat2, lon2):
    radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_float(value, fallback=None):
    try:
        number = float(value)
        if math.isfinite(number):
            return number
    except (TypeError, ValueError):
        pass
    return fallback


def parse_bbox_value(value):
    if not value:
        return None

    try:
        west, south, east, north = [float(part) for part in str(value).split(",")]
    except ValueError:
        return None

    if not all(math.isfinite(part) for part in (west, south, east, north)):
        return None

    return {
        "west": min(west, east),
        "south": min(south, north),
        "east": max(west, east),
        "north": max(south, north),
    }


def point_in_bbox(item, bbox):
    if not bbox:
        return True

    lat = parse_float(item.get("lat"))
    lon = parse_float(item.get("lon"))

    if lat is None or lon is None:
        return False

    return bbox["west"] <= lon <= bbox["east"] and bbox["south"] <= lat <= bbox["north"]


def cached_payload(key, ttl):
    cached = FEED_CACHE.get(key)
    if not cached or time.time() - cached["timestamp"] > ttl:
        return None
    return cached["payload"]


def store_payload(key, payload):
    FEED_CACHE[key] = {"timestamp": time.time(), "payload": payload}


def fetch_arcgis_features(layer_url, cache_key, ttl=300, page_size=2000, max_records=12000, force=False):
    if not force:
        cached = cached_payload(cache_key, ttl)
        if cached is not None:
            return cached, True

    features = []
    offset = 0

    while offset < max_records:
        query = (
            f"{layer_url}/query?where=1%3D1&outFields=*&f=json&returnGeometry=true&outSR=4326"
            f"&resultRecordCount={page_size}&resultOffset={offset}"
        )
        request = Request(query, headers={"User-Agent": "Project-Orion/1.0"})

        with urlopen(request, timeout=18) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))

        batch = payload.get("features") or []
        features.extend(batch)

        if len(batch) < page_size:
            break

        offset += page_size

    store_payload(cache_key, features)
    return features, False


def camera_status_from_snapshot(snapshot_url):
    return "snapshot_only" if snapshot_url else "unknown"


def normalize_fl511_camera(feature):
    attributes = feature.get("attributes") or {}
    geometry = feature.get("geometry") or {}
    camera_id = str(attributes.get("ID") or attributes.get("OBJECTID") or attributes.get("OBJECTID_1") or "")
    lat = parse_float(attributes.get("LATITUDE"), parse_float(geometry.get("y")))
    lon = parse_float(attributes.get("LONGITUDE"), parse_float(geometry.get("x")))

    if lat is None or lon is None:
        return None

    snapshot_url = str(attributes.get("IMAGE") or "").strip()
    road = str(attributes.get("HIGHWAY") or "").strip()
    direction = str(attributes.get("DIRECTION") or "").strip()
    county = str(attributes.get("COUNTY") or "").strip()
    description = str(attributes.get("DESCRIPT") or f"FL511 camera {camera_id}").strip().lower()
    
    is_intersection = any(keyword in description for keyword in ["intersection", "at ", " & ", " and ", "cross"])
    camera_type = "intersection" if is_intersection else "highway"

    return {
        "id": "fl511-" + camera_id,
        "name": str(attributes.get("DESCRIPT") or f"FL511 camera {camera_id}").strip(),
        "provider": "FL511",
        "state": "FL",
        "country": "US",
        "lat": lat,
        "lon": lon,
        "category": "highway" if road else "traffic",
        "camera_type": camera_type,
        "road": road,
        "direction": direction,
        "county": county,
        "status": camera_status_from_snapshot(snapshot_url),
        "snapshot_url": snapshot_url,
        "stream_url": "",
        "stream_type": "snapshot" if snapshot_url else "unknown",
        "last_updated": attributes.get("TIMESTAMP") or "",
        "source_url": FL511_CAMERA_LAYER_URL,
        "metadata": attributes,
    }


def normalize_seattle_camera(feature):
    """Normalize Seattle DOT camera data"""
    try:
        camera_id = str(feature.get("cameraid", ""))
        lat = parse_float(feature.get("latitude"))
        lon = parse_float(feature.get("longitude"))
        
        if not camera_id or lat is None or lon is None:
            return None
        
        name = str(feature.get("cameraname", "Seattle intersection camera")).strip()
        upstream_snapshot_url = str(feature.get("imageurl", "")).strip()
        
        return {
            "id": f"seattle-{camera_id}",
            "name": name,
            "provider": "Seattle DOT",
            "state": "WA",
            "city": "Seattle",
            "country": "US",
            "lat": lat,
            "lon": lon,
            "category": "traffic",
            "camera_type": "intersection",
            "road": str(feature.get("roadname", "")).strip(),
            "direction": str(feature.get("direction", "")).strip(),
            "status": "snapshot_only" if upstream_snapshot_url else "unknown",
            "snapshot_url": f"/camera/snapshot?id=seattle-{camera_id}",
            "upstream_snapshot_url": upstream_snapshot_url,
            "stream_url": "",
            "stream_type": "snapshot",
            "last_updated": str(feature.get("last_updated", "")).strip(),
            "source_url": SEATTLE_CAMERAS_URL,
            "metadata": feature,
        }
    except Exception:
        return None


def normalize_nyc_camera(feature):
    """Normalize NYC DOT camera data"""
    try:
        camera_id = str(feature.get("camera_id", ""))
        lat = parse_float(feature.get("latitude"))
        lon = parse_float(feature.get("longitude"))
        
        if not camera_id or lat is None or lon is None:
            return None
        
        name = str(feature.get("name", "NYC intersection camera")).strip()
        upstream_snapshot_url = str(feature.get("url", "")).strip()
        
        return {
            "id": f"nyc-{camera_id}",
            "name": name,
            "provider": "NYC DOT",
            "state": "NY",
            "city": "New York",
            "country": "US",
            "lat": lat,
            "lon": lon,
            "category": "traffic",
            "camera_type": "intersection",
            "road": str(feature.get("roadway", "")).strip(),
            "direction": str(feature.get("direction", "")).strip(),
            "status": "snapshot_only" if upstream_snapshot_url else "unknown",
            "snapshot_url": f"/camera/snapshot?id=nyc-{camera_id}",
            "upstream_snapshot_url": upstream_snapshot_url,
            "stream_url": "",
            "stream_type": "snapshot",
            "last_updated": str(feature.get("last_updated", "")).strip(),
            "source_url": NYC_CAMERAS_URL,
            "metadata": feature,
        }
    except Exception:
        return None


def normalize_static_camera(camera):
    record = dict(camera)
    record.setdefault("state", "")
    record.setdefault("country", "")
    record.setdefault("road", "")
    record.setdefault("direction", "")
    record.setdefault("last_updated", "")
    record.setdefault("source_url", "")
    record.setdefault("metadata", {})
    record.setdefault("fallback", True)
    record["provider"] = record.get("provider") or "StaticFallbackUSA"
    record["stream_type"] = record.get("stream_type") or "snapshot"
    record["status"] = record.get("status") or "snapshot_only"
    return record


def get_cameranet_registry(force=False):
    now = time.time()
    if not force and CAMERA_CACHE["payload"] is not None and now - CAMERA_CACHE["timestamp"] < 10 * 60:
        return CAMERA_CACHE["payload"], CAMERA_CACHE["providers"], True

    cameras = []
    providers = []

    try:
        features, cached = fetch_arcgis_features(FL511_CAMERA_LAYER_URL, "fl511:cameras", force=force)
    except Exception:
        features = None
        cached = False

    if features is None:
        providers.append({
            "id": "fl511",
            "name": "FL511",
            "requires_token": False,
            "supports_bbox": True,
            "status": "error",
            "count": 0,
            "source": FL511_CAMERA_LAYER_URL,
        })
    else:
        normalized = [normalize_fl511_camera(feature) for feature in features]
        normalized = [camera for camera in normalized if camera]
        cameras.extend(normalized)
        providers.append({
            "id": "fl511",
            "name": "FL511",
            "requires_token": False,
            "supports_bbox": True,
            "status": "active",
            "count": len(normalized),
            "cached": cached,
            "source": FL511_CAMERA_LAYER_URL,
        })

    try:
        request = Request(SEATTLE_CAMERAS_URL + "?$limit=5000", headers={"User-Agent": "Mozilla/5.0 (Project Orion)"})
        with urlopen(request, timeout=10) as response:
            seattle_data = json.loads(response.read().decode("utf-8"))
        
        seattle_cameras = [normalize_seattle_camera(cam) for cam in seattle_data]
        seattle_cameras = [cam for cam in seattle_cameras if cam]
        cameras.extend(seattle_cameras)
        
        providers.append({
            "id": "seattle",
            "name": "Seattle DOT",
            "requires_token": False,
            "supports_bbox": True,
            "status": "active",
            "count": len(seattle_cameras),
            "cached": False,
            "source": SEATTLE_CAMERAS_URL,
        })
    except Exception as e:
        print(f"Seattle cameras error: {e}")
        providers.append({
            "id": "seattle",
            "name": "Seattle DOT",
            "status": "error",
            "count": 0,
            "source": SEATTLE_CAMERAS_URL,
        })

    try:
        request = Request(NYC_CAMERAS_URL + "?$limit=5000", headers={"User-Agent": "Mozilla/5.0 (Project Orion)"})
        with urlopen(request, timeout=10) as response:
            nyc_data = json.loads(response.read().decode("utf-8"))
        
        nyc_cameras = [normalize_nyc_camera(cam) for cam in nyc_data]
        nyc_cameras = [cam for cam in nyc_cameras if cam]
        cameras.extend(nyc_cameras)
        
        providers.append({
            "id": "nyc",
            "name": "NYC DOT",
            "requires_token": False,
            "supports_bbox": True,
            "status": "active",
            "count": len(nyc_cameras),
            "cached": False,
            "source": NYC_CAMERAS_URL,
        })
    except Exception as e:
        print(f"NYC cameras error: {e}")
        providers.append({
            "id": "nyc",
            "name": "NYC DOT",
            "status": "error",
            "count": 0,
            "source": NYC_CAMERAS_URL,
        })

    providers.append({
        "id": "arcgis-generic",
        "name": "ArcGISGeneric",
        "requires_token": False,
        "supports_bbox": True,
        "status": "available",
        "count": 0,
        "source": "configurable FeatureServer adapter",
    })

    CAMERA_CACHE["timestamp"] = now
    CAMERA_CACHE["payload"] = cameras
    CAMERA_CACHE["providers"] = providers
    CAMERA_BY_ID.clear()
    CAMERA_BY_ID.update({str(camera.get("id")): camera for camera in cameras})
    return cameras, providers, False


def congestion_intensity(severity):
    text = str(severity or "").lower()
    if "major" in text or "severe" in text:
        return 0.92
    if "moderate" in text:
        return 0.68
    if "minor" in text:
        return 0.46
    return 0.55


def congestion_route(lon, lat, direction):
    direction = str(direction or "").lower()
    span = 0.042
    dx, dy = span, span * 0.36

    if direction.startswith("n"):
        dx, dy = 0, span
    elif direction.startswith("s"):
        dx, dy = 0, -span
    elif direction.startswith("e"):
        dx, dy = span, 0
    elif direction.startswith("w"):
        dx, dy = -span, 0

    return [
        [round(lon - dx, 5), round(lat - dy, 5), 8],
        [round(lon, 5), round(lat, 5), 8],
        [round(lon + dx, 5), round(lat + dy, 5), 8],
    ]


def normalize_fl511_congestion(feature):
    attributes = feature.get("attributes") or {}
    geometry = feature.get("geometry") or {}
    lat = parse_float(attributes.get("LATITUDE"), parse_float(geometry.get("y")))
    lon = parse_float(attributes.get("LONGITUDE"), parse_float(geometry.get("x")))

    if lat is None or lon is None:
        return None

    severity = attributes.get("SEVERITY") or "current"
    intensity = congestion_intensity(severity)
    name = attributes.get("NAME") or attributes.get("HIGHWAY") or "FL511 congestion"
    road = attributes.get("HIGHWAY") or ""
    direction = attributes.get("DIRECTION") or ""

    return {
        "id": "fl511-congestion-" + str(attributes.get("ID") or attributes.get("OBJECTID") or name).replace(" ", "-"),
        "name": str(name),
        "kind": "line",
        "category": "traffic",
        "source": "FL511 public ArcGIS",
        "provider": "FL511",
        "road": road,
        "direction": direction,
        "severity": severity,
        "status": attributes.get("TYPE") or "current",
        "description": attributes.get("DESCRIPT") or "",
        "timestamp": attributes.get("TIMESTAMP") or attributes.get("UPDATED") or "",
        "lat": lat,
        "lon": lon,
        "radius": 18000 + int(intensity * 22000),
        "intensity": intensity,
        "points": congestion_route(lon, lat, direction),
        "metadata": attributes,
    }


def fl511_congestion_payload(force=False):
    features, cached = fetch_arcgis_features(FL511_CONGESTION_LAYER_URL, "fl511:congestion", ttl=90, max_records=10000, force=force)
    rendered = [normalize_fl511_congestion(feature) for feature in features]
    rendered = [item for item in rendered if item]
    return {
        "source": "FL511 public ArcGIS congestion",
        "mode": "public_no_token",
        "fallback": False,
        "cached": cached,
        "generated": generated_at(),
        "count": len(rendered),
        "features": rendered,
    }


def flatten_geometry_points(coordinates, points):
    if not isinstance(coordinates, list):
        return

    if len(coordinates) >= 2 and all(isinstance(value, (int, float)) for value in coordinates[:2]):
        lon, lat = float(coordinates[0]), float(coordinates[1])
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            points.append((lon, lat))
        return

    for child in coordinates:
        flatten_geometry_points(child, points)


def geometry_centroid(geometry):
    points = []
    flatten_geometry_points((geometry or {}).get("coordinates"), points)

    if not points:
        return None

    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def geometry_extent_radius(geometry, minimum=18000, maximum=280000):
    points = []
    flatten_geometry_points((geometry or {}).get("coordinates"), points)

    if not points:
        return minimum

    lons = [point[0] for point in points]
    lats = [point[1] for point in points]
    avg_lat = sum(lats) / len(lats)
    lat_span_m = max(0.0, (max(lats) - min(lats)) * 111000)
    lon_span_m = max(0.0, (max(lons) - min(lons)) * 111000 * max(0.18, math.cos(math.radians(avg_lat))))
    radius = max(minimum, min(maximum, max(lat_span_m, lon_span_m) * 0.52))
    return int(radius)


def alert_intensity(severity, urgency, certainty):
    severity_score = {
        "extreme": 1.0,
        "severe": 0.86,
        "moderate": 0.62,
        "minor": 0.42,
        "unknown": 0.34,
    }.get(str(severity or "").lower(), 0.46)
    urgency_bonus = 0.08 if str(urgency or "").lower() in ("immediate", "expected") else 0
    certainty_bonus = 0.05 if str(certainty or "").lower() in ("observed", "likely") else 0
    return round(max(0.22, min(1.0, severity_score + urgency_bonus + certainty_bonus)), 2)


STORM_ALERT_TERMS = (
    "thunderstorm",
    "tornado",
    "storm",
    "hurricane",
    "cyclone",
    "snow squall",
    "blizzard",
    "winter storm",
    "flash flood",
    "flood",
    "marine warning",
    "waterspout",
)

LIGHTNING_ALERT_TERMS = (
    "thunderstorm",
    "lightning",
    "tornado",
    "severe weather",
    "storm",
    "marine warning",
)


def alert_text_matches(properties, terms):
    haystack = " ".join(str(properties.get(key) or "") for key in (
        "event",
        "headline",
        "description",
        "instruction",
        "areaDesc",
    )).lower()
    return any(term in haystack for term in terms)


def nws_alerts_payload(force=False):
    cache_key = "nws:active-alerts"
    cached = FEED_CACHE.get(cache_key)

    if not force and cached and time.time() - cached["timestamp"] < 120:
        payload = dict(cached["payload"])
        payload["cached"] = True
        return payload

    request = Request(NWS_ACTIVE_ALERTS_URL, headers={
        "User-Agent": "Project-Orion/1.0 (local planetary intelligence app)",
        "Accept": "application/geo+json, application/json",
    })
    with urlopen(request, timeout=15) as response:
        upstream = json.loads(response.read().decode("utf-8"))

    rendered = []
    for index, feature in enumerate(upstream.get("features") or []):
        properties = feature.get("properties") or {}
        centroid = geometry_centroid(feature.get("geometry"))
        if not centroid:
            continue

        event = properties.get("event") or "Weather alert"
        severity = properties.get("severity") or "Unknown"
        intensity = alert_intensity(severity, properties.get("urgency"), properties.get("certainty"))
        lon, lat = centroid
        rendered.append({
            "id": properties.get("id") or feature.get("id") or f"nws-alert-{index}",
            "name": event,
            "kind": "event",
            "category": "emergency",
            "source": "National Weather Service",
            "provider": "NWS",
            "lat": lat,
            "lon": lon,
            "radius": int(14000 + intensity * 32000),
            "intensity": intensity,
            "severity": severity,
            "status": properties.get("status") or "actual",
            "event": event,
            "area": properties.get("areaDesc") or "",
            "timestamp": properties.get("sent") or properties.get("effective") or "",
            "expires": properties.get("expires") or "",
            "description": properties.get("description") or properties.get("headline") or "",
            "instruction": properties.get("instruction") or "",
            "metadata": {
                "urgency": properties.get("urgency"),
                "certainty": properties.get("certainty"),
                "messageType": properties.get("messageType"),
                "senderName": properties.get("senderName"),
            },
        })

        if len(rendered) >= 90:
            break

    payload = {
        "source": "National Weather Service active alerts",
        "mode": "public_no_token",
        "fallback": False,
        "cached": False,
        "generated": generated_at(),
        "count": len(rendered),
        "features": rendered,
    }
    FEED_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
    return payload


def nws_weather_volume_payload(force=False):
    cache_key = "nws:storm-volumes"
    cached = FEED_CACHE.get(cache_key)

    if not force and cached and time.time() - cached["timestamp"] < 120:
        payload = dict(cached["payload"])
        payload["cached"] = True
        return payload

    request = Request(NWS_ACTIVE_ALERTS_URL, headers={
        "User-Agent": "Project-Orion/1.0 (local planetary intelligence app)",
        "Accept": "application/geo+json, application/json",
    })
    with urlopen(request, timeout=15) as response:
        upstream = json.loads(response.read().decode("utf-8"))

    rendered = []
    for index, feature in enumerate(upstream.get("features") or []):
        properties = feature.get("properties") or {}
        if not alert_text_matches(properties, STORM_ALERT_TERMS):
            continue

        centroid = geometry_centroid(feature.get("geometry"))
        if not centroid:
            continue

        event = properties.get("event") or "Storm system"
        severity = properties.get("severity") or "Unknown"
        intensity = alert_intensity(severity, properties.get("urgency"), properties.get("certainty"))
        lon, lat = centroid
        radius = geometry_extent_radius(feature.get("geometry"), minimum=36000, maximum=420000)
        category = "thunderstorm" if "thunder" in event.lower() else ("tropical" if any(term in event.lower() for term in ("hurricane", "cyclone")) else "storm")
        rendered.append({
            "id": properties.get("id") or feature.get("id") or f"nws-storm-{index}",
            "name": event,
            "kind": "volume",
            "category": category,
            "source": "National Weather Service active alerts",
            "provider": "NWS",
            "lat": lat,
            "lon": lon,
            "radius": radius,
            "height": int(24000 + intensity * 52000),
            "intensity": intensity,
            "severity": severity,
            "status": properties.get("status") or "actual",
            "area": properties.get("areaDesc") or "",
            "timestamp": properties.get("sent") or properties.get("effective") or "",
            "expires": properties.get("expires") or "",
            "description": properties.get("description") or properties.get("headline") or "",
            "metadata": {
                "urgency": properties.get("urgency"),
                "certainty": properties.get("certainty"),
                "messageType": properties.get("messageType"),
                "senderName": properties.get("senderName"),
            },
        })

        if len(rendered) >= 140:
            break

    payload = {
        "source": "National Weather Service active storm alerts",
        "mode": "public_no_token",
        "fallback": False,
        "cached": False,
        "generated": generated_at(),
        "count": len(rendered),
        "features": rendered,
    }
    FEED_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
    return payload


def nws_lightning_payload(force=False):
    cache_key = "nws:lightning-risk"
    cached = FEED_CACHE.get(cache_key)

    if not force and cached and time.time() - cached["timestamp"] < 75:
        payload = dict(cached["payload"])
        payload["cached"] = True
        return payload

    request = Request(NWS_ACTIVE_ALERTS_URL, headers={
        "User-Agent": "Project-Orion/1.0 (local planetary intelligence app)",
        "Accept": "application/geo+json, application/json",
    })
    with urlopen(request, timeout=15) as response:
        upstream = json.loads(response.read().decode("utf-8"))

    rendered = []
    for index, feature in enumerate(upstream.get("features") or []):
        properties = feature.get("properties") or {}
        if not alert_text_matches(properties, LIGHTNING_ALERT_TERMS):
            continue

        centroid = geometry_centroid(feature.get("geometry"))
        if not centroid:
            continue

        event = properties.get("event") or "Electrical storm risk"
        severity = properties.get("severity") or "Unknown"
        intensity = alert_intensity(severity, properties.get("urgency"), properties.get("certainty"))
        lon, lat = centroid
        radius = geometry_extent_radius(feature.get("geometry"), minimum=8000, maximum=95000)
        rendered.append({
            "id": properties.get("id") or feature.get("id") or f"nws-lightning-{index}",
            "name": event,
            "kind": "event",
            "category": "lightning",
            "source": "National Weather Service active thunderstorm alerts",
            "provider": "NWS",
            "lat": lat,
            "lon": lon,
            "radius": radius,
            "intensity": intensity,
            "severity": severity,
            "status": properties.get("status") or "actual",
            "area": properties.get("areaDesc") or "",
            "timestamp": properties.get("sent") or properties.get("effective") or "",
            "expires": properties.get("expires") or "",
            "description": properties.get("headline") or properties.get("description") or "",
            "metadata": {
                "urgency": properties.get("urgency"),
                "certainty": properties.get("certainty"),
                "messageType": properties.get("messageType"),
                "senderName": properties.get("senderName"),
            },
        })

        if len(rendered) >= 180:
            break

    payload = {
        "source": "National Weather Service active thunderstorm alerts",
        "mode": "public_no_token",
        "fallback": False,
        "cached": False,
        "generated": generated_at(),
        "count": len(rendered),
        "features": rendered,
    }
    FEED_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
    return payload


def downsample_path(points, max_points=52):
    if len(points) <= max_points:
        return points

    step = max(1, math.ceil(len(points) / max_points))
    sampled = points[::step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def line_paths_from_geometry(geometry, height=0, max_points=52):
    geom_type = (geometry or {}).get("type")
    coordinates = (geometry or {}).get("coordinates") or []
    paths = []

    def normalize_line(line):
        path = []
        for coord in line or []:
            if not isinstance(coord, (list, tuple)) or len(coord) < 2:
                continue
            try:
                lon = float(coord[0])
                lat = float(coord[1])
            except (TypeError, ValueError):
                continue
            if -180 <= lon <= 180 and -90 <= lat <= 90:
                path.append([round(lon, 5), round(lat, 5), height])
        return downsample_path(path, max_points) if len(path) >= 2 else []

    if geom_type == "LineString":
        path = normalize_line(coordinates)
        if path:
            paths.append(path)
    elif geom_type == "MultiLineString":
        for line in coordinates:
            path = normalize_line(line)
            if path:
                paths.append(path)

    return paths


def submarine_cables_payload(force=False):
    cache_key = "submarine:cables"
    cached = FEED_CACHE.get(cache_key)

    if not force and cached and time.time() - cached["timestamp"] < 24 * 60 * 60:
        payload = dict(cached["payload"])
        payload["cached"] = True
        return payload

    request = Request(SUBMARINE_CABLE_GEOJSON_URL, headers={
        "User-Agent": "Project-Orion/1.0 (local infrastructure visualization)",
        "Accept": "application/geo+json, application/json",
    })
    with urlopen(request, timeout=20) as response:
        upstream = json.loads(response.read().decode("utf-8", errors="replace"))

    rendered = []
    for index, feature in enumerate(upstream.get("features") or []):
        properties = feature.get("properties") or {}
        paths = line_paths_from_geometry(feature.get("geometry"), height=0, max_points=58)
        if not paths:
            continue

        for segment_index, path in enumerate(paths[:2]):
            rendered.append({
                "id": properties.get("feature_id") or f"{properties.get('id') or 'cable'}-{index}-{segment_index}",
                "name": properties.get("name") or "Submarine cable",
                "kind": "line",
                "category": "submarine-cable",
                "source": "Submarine Cable Map public GeoJSON",
                "provider": "Submarine Cable Map",
                "intensity": 0.48 + ((index + segment_index) % 6) * 0.07,
                "status": "active",
                "points": path,
                "metadata": {
                    "cable_id": properties.get("id"),
                    "color": properties.get("color"),
                },
            })

        if len(rendered) >= 420:
            break

    payload = {
        "source": "Submarine Cable Map public GeoJSON",
        "mode": "public_no_token",
        "fallback": False,
        "cached": False,
        "generated": generated_at(),
        "count": len(rendered),
        "features": rendered,
    }
    FEED_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
    return payload


def ticketmaster_events_payload(force=False):
    """Live public events from Ticketmaster Discovery (requires free API key in env)."""
    cache_key = "ticketmaster:discovery-us"
    cached = FEED_CACHE.get(cache_key)
    if not force and cached and time.time() - cached["timestamp"] < 300:
        payload = dict(cached["payload"])
        payload["cached"] = True
        return payload

    api_key = os.environ.get("TICKETMASTER_API_KEY", "").strip()
    if not api_key:
        return {
            "source": "Ticketmaster Discovery - set environment variable TICKETMASTER_API_KEY for live US events",
            "mode": "no_credentials",
            "fallback": False,
            "cached": False,
            "generated": generated_at(),
            "count": 0,
            "features": [],
        }

    query = urlencode({
        "apikey": api_key,
        "countryCode": "US",
        "size": "45",
        "sort": "date,asc",
    })
    url = f"https://app.ticketmaster.com/discovery/v2/events.json?{query}"
    request = Request(url, headers={"User-Agent": "Project-Orion/1.0"})
    with urlopen(request, timeout=22) as response:
        data = json.loads(response.read().decode("utf-8", errors="replace"))

    rendered = []
    events = ((data.get("_embedded") or {}).get("events")) or []
    for index, ev in enumerate(events):
        venues = ((ev.get("_embedded") or {}).get("venues")) or []
        venue = venues[0] if venues else {}
        loc = venue.get("location") or {}
        lat, lon = loc.get("latitude"), loc.get("longitude")
        if lat is None or lon is None:
            continue
        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            continue

        image_url = ""
        for im in ev.get("images") or []:
            w = im.get("width") or 0
            if w >= 400:
                image_url = str(im.get("url") or "")
                break
        if not image_url and ev.get("images"):
            image_url = str(ev["images"][0].get("url") or "")

        classifications = ev.get("classifications") or [{}]
        segment = ((classifications[0].get("segment") or {}).get("name")) or ""
        genre = ((classifications[0].get("genre") or {}).get("name")) or ""
        start = ((ev.get("dates") or {}).get("start") or {})

        rendered.append({
            "id": str(ev.get("id") or f"tm-{index}"),
            "name": str(ev.get("name") or "Event"),
            "kind": "event",
            "category": "cultural",
            "source": "Ticketmaster",
            "provider": "Ticketmaster",
            "lat": lat_f,
            "lon": lon_f,
            "radius": 15000,
            "intensity": 0.74,
            "url": str(ev.get("url") or ""),
            "image_url": image_url,
            "venue": str(venue.get("name") or ""),
            "timestamp": str(start.get("dateTime") or start.get("localDate") or ""),
            "description": str(ev.get("pleaseNote") or ev.get("info") or ""),
            "metadata": {"segment": segment, "genre": genre},
        })
        if len(rendered) >= 50:
            break

    payload = {
        "source": "Ticketmaster Discovery API",
        "mode": "public_api",
        "fallback": False,
        "cached": False,
        "generated": generated_at(),
        "count": len(rendered),
        "features": rendered,
    }
    FEED_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
    return payload


def canonical_camera_id(camera_id):
    value = str(camera_id or "").strip()
    if value.startswith("fl511-"):
        return value[6:]
    return value


def find_camera_record(camera_id):
    normalized_id = str(camera_id or "").strip()
    if not normalized_id:
        return None

    if normalized_id in CAMERA_BY_ID:
        return CAMERA_BY_ID[normalized_id]

    raw_id = canonical_camera_id(normalized_id)
    prefixed_id = "fl511-" + raw_id
    if prefixed_id in CAMERA_BY_ID:
        return CAMERA_BY_ID[prefixed_id]

    if CAMERANET_AVAILABLE:
        try:
            provider_prefix = normalized_id.split("-", 1)[0] if "-" in normalized_id else "fl511"
            state_filter = "FL" if provider_prefix == "fl511" else None
            provider_filter = provider_prefix if provider_prefix in CAMERA_PROVIDERS else "fl511"
            cameras, _providers = get_all_cameras(None, provider_filter, state_filter)
            CAMERA_BY_ID.update({str(camera.get("id")): camera for camera in cameras})
            return CAMERA_BY_ID.get(prefixed_id) or CAMERA_BY_ID.get(normalized_id)
        except Exception:
            return None

    return None


def fl511_request_token():
    now = time.time()
    cached = FL511_VERIFICATION_CACHE.get("token")
    if cached and now - FL511_VERIFICATION_CACHE.get("timestamp", 0) < 30 * 60:
        return cached

    request = Request("https://fl511.com/", headers={
        "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
        "Accept": "text/html,application/xhtml+xml",
    })

    with urlopen(request, timeout=16) as response:
        page = response.read().decode("utf-8", errors="replace")

    match = re.search(r'name=["\']__RequestVerificationToken["\'][^>]+value=["\']([^"\']+)["\']', page, re.I)
    token = match.group(1) if match else ""
    FL511_VERIFICATION_CACHE["timestamp"] = now
    FL511_VERIFICATION_CACHE["token"] = token
    return token


def fl511_tooltip_video_url(camera_id):
    cache_key = f"fl511:tooltip:{camera_id}"
    cached = cached_payload(cache_key, 6 * 60 * 60)
    if cached:
        return cached

    request = Request(f"https://fl511.com/tooltip/Cameras/{quote(str(camera_id), safe='')}?lang=en", headers={
        "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
        "Referer": "https://fl511.com/",
        "Accept": "text/html,*/*",
    })

    with urlopen(request, timeout=16) as response:
        body = response.read().decode("utf-8", errors="replace")

    match = re.search(r'data-videourl=["\']([^"\']+)["\']', body, re.I)
    stream_type_match = re.search(r'data-streamtype=["\']([^"\']+)["\']', body, re.I)
    video_url = html.unescape(match.group(1)) if match else ""
    stream_type = html.unescape(stream_type_match.group(1)) if stream_type_match else "application/x-mpegURL"
    payload = {"video_url": video_url, "stream_type": stream_type}
    store_payload(cache_key, payload)
    return payload


def resolve_fl511_hls(camera_id):
    raw_id = canonical_camera_id(camera_id)
    if not raw_id:
        raise ValueError("Missing camera id")

    tooltip = fl511_tooltip_video_url(raw_id)
    base_url = tooltip.get("video_url") or ""
    if not base_url:
        raise ValueError("FL511 camera has no live HLS base URL")

    token_request = Request(f"https://fl511.com/Camera/GetVideoUrl?imageId={quote(raw_id, safe='')}&_={int(time.time() * 1000)}", headers={
        "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
        "Referer": "https://fl511.com/",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
    })

    with urlopen(token_request, timeout=12) as response:
        token_payload = json.loads(response.read().decode("utf-8", errors="replace"))

    if isinstance(token_payload, str):
        return {
            "provider": "FL511",
            "camera_id": raw_id,
            "stream_type": "hls",
            "mime_type": tooltip.get("stream_type") or "application/x-mpegURL",
            "stream_url": token_payload,
            "base_url": base_url,
            "generated": generated_at(),
        }

    verification_token = fl511_request_token()
    secure_body = json.dumps(token_payload, separators=(",", ":")).encode("utf-8")
    secure_request = Request(
        "https://divas.cloud/VDS-API/SecureTokenUri/GetSecureTokenUriBySourceId",
        data=secure_body,
        method="POST",
        headers={
            "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
            "Content-Type": "application/json",
            "Origin": "https://fl511.com",
            "Referer": "https://fl511.com/",
            "Accept": "application/json,*/*",
            "__RequestVerificationToken": verification_token,
        },
    )

    with urlopen(secure_request, timeout=12) as response:
        secure_payload = json.loads(response.read().decode("utf-8", errors="replace"))

    secure_query = str(secure_payload or "")
    if secure_query and not secure_query.startswith("?"):
        secure_query = "?" + secure_query.lstrip("&?")

    if not secure_query or "token=" not in secure_query:
        raise ValueError("FL511 did not return a secure HLS token")

    return {
        "provider": "FL511",
        "camera_id": raw_id,
        "source_id": token_payload.get("sourceId"),
        "system_source_id": token_payload.get("systemSourceId"),
        "stream_type": "hls",
        "mime_type": tooltip.get("stream_type") or "application/x-mpegURL",
        "stream_url": base_url + secure_query,
        "base_url": base_url,
        "expires_in": 60,
        "generated": generated_at(),
    }


def augment_layer(layer, target_count, factory):
    payload = STATIC_INTEL_LAYERS[layer]
    features = payload.setdefault("features", [])
    seen = {feature.get("id") for feature in features}
    index = 0
    while len(features) < target_count:
        feature = factory(index)
        index += 1
        if feature.get("id") in seen:
            continue
        seen.add(feature.get("id"))
        features.append(feature)
    payload["count"] = len(features)
    payload["mode"] = payload.get("mode", "adapter-fallback-expanded")
    payload["fallback"] = True


def build_expanded_intel_layers():
    """Optional denser demo data. Off by default so emergency/events stay API-only."""
    if os.environ.get("ORION_SYNTHETIC_INTEL", "").lower() not in ("1", "true", "yes"):
        for layer_payload in STATIC_INTEL_LAYERS.values():
            layer_payload.setdefault("generated", generated_at())
            layer_payload["count"] = len(layer_payload.get("features") or [])
        return

    ship_pairs = [(0, 1), (0, 2), (3, 6), (3, 8), (4, 20), (5, 6), (6, 7), (7, 8), (8, 10), (8, 11), (10, 12), (12, 13), (13, 1), (14, 18), (15, 16), (17, 0), (17, 18), (18, 19), (20, 3), (21, 6), (21, 7), (22, 8), (22, 9), (23, 8), (2, 12), (1, 13), (15, 23), (16, 23), (10, 11), (14, 12), (19, 14), (5, 20), (7, 21), (9, 22), (11, 23), (6, 22)]
    def ship_factory(index):
        lane = SHIP_LANES[index % len(SHIP_LANES)]
        category = ["container", "tanker", "bulk", "ro-ro", "cruise"][index % 5]
        route = [
            [round(point[0] + ((index % 5) - 2) * 0.08, 3), round(point[1] + ((index % 7) - 3) * 0.045, 3), 8 + (index % 4) * 4]
            for point in lane
        ]
        return {
            "id": f"ais-expanded-{index + 1:02d}",
            "name": f"{category.upper()} {300 + index}",
            "kind": "moving",
            "category": category,
            "periodHours": 34 + (index % 18) * 5,
            "phase": round((index * 0.137) % 1, 3),
            "route": route,
            "status": "underway",
            "provider": "AISStream/AISHub adapter fallback",
        }
    augment_layer("liveShips", 96, ship_factory)

    cyber_pairs = [(i % len(GLOBAL_HUBS), (i * 7 + 5) % len(GLOBAL_HUBS)) for i in range(50)]
    def cyber_factory(index):
        a, b = cyber_pairs[index % len(cyber_pairs)]
        start = GLOBAL_HUBS[a]
        end = GLOBAL_HUBS[b]
        return {
            "id": f"cyber-expanded-{index + 1:02d}",
            "name": f"{start[0]} - {end[0]} traffic arc",
            "kind": "arc",
            "category": "network",
            "intensity": round(0.35 + (index % 13) * 0.045, 2),
            "points": arc_route((start[1], start[2]), (end[1], end[2]), 90000, 320000 + (index % 6) * 42000),
        }
    augment_layer("cyberNetwork", 42, cyber_factory)

    def airspace_factory(index):
        city = GLOBAL_HUBS[(index * 4 + 2) % len(GLOBAL_HUBS)]
        return {
            "id": f"airspace-expanded-{index + 1:02d}",
            "name": f"{city[0]} restricted operating zone",
            "kind": "area",
            "category": "restricted-airspace",
            "lat": round(city[2], 3),
            "lon": round(city[1], 3),
            "radius": 64000 + (index % 7) * 9000,
            "intensity": round(0.36 + (index % 8) * 0.055, 2),
            "status": ["TFR", "NOTAM", "defense-watch"][index % 3],
        }
    augment_layer("defenseAirspace", 24, airspace_factory)

    cable_pairs = [(i % len(PORTS), (i + 9) % len(PORTS)) for i in range(60)]
    def cable_factory(index):
        a, b = cable_pairs[index % len(cable_pairs)]
        start = PORTS[a]
        end = PORTS[b]
        return {
            "id": f"cable-expanded-{index + 1:02d}",
            "name": f"{start[0]} / {end[0]} fiber span",
            "kind": "line",
            "category": "submarine-cable",
            "provider": ["TAT", "TPC", "SEA-ME-WE", "Regional", "Pacific Ring"][index % 5],
            "points": interpolate_route((start[1], start[2]), (end[1], end[2]), -10, (index % 7 - 3) * 1.4),
        }
    augment_layer("underseaCables", 54, cable_factory)

    grid_regions = [GLOBAL_HUBS[i:i + 4] for i in range(0, len(GLOBAL_HUBS) - 4, 2)]
    def grid_factory(index):
        cluster = grid_regions[index % len(grid_regions)]
        points = [[round(city[1], 3), round(city[2], 3), 48 + (index % 4) * 8] for city in cluster]
        return {
            "id": f"grid-expanded-{index + 1:02d}",
            "name": f"{cluster[0][0]} regional transmission",
            "kind": "line",
            "category": "transmission",
            "intensity": round(0.42 + (index % 9) * 0.052, 2),
            "points": points,
        }
    augment_layer("powerGrid", 44, grid_factory)

    def heat_factory(prefix, category, radius_base):
        def factory(index):
            city = GLOBAL_HUBS[index % len(GLOBAL_HUBS)]
            return {
                "id": f"{prefix}-{index + 1:02d}",
                "name": f"{city[0]} {category} density",
                "kind": "heat",
                "category": category,
                "lat": round(city[2] + ((index % 5) - 2) * 0.06, 3),
                "lon": round(city[1] + ((index % 7) - 3) * 0.06, 3),
                "radius": radius_base + (index % 5) * 9000,
                "intensity": round(0.42 + (index % 11) * 0.048, 2),
            }
        return factory
    augment_layer("rfHeatmap", 36, heat_factory("rf-expanded", "rf", 52000))

    storm_centers = [(-72, 24), (-89, 27), (-98, 36), (119, 17), (82, 13), (146, -18), (18, -34), (58, -20), (134, 12), (-43, -22), (-151, 42), (12, 44)]
    def storm_factory(index):
        lon, lat = storm_centers[index % len(storm_centers)]
        return {
            "id": f"storm-expanded-{index + 1:02d}",
            "name": f"Volumetric storm cell {index + 1:02d}",
            "kind": "volume",
            "category": ["hurricane", "convective", "monsoon", "front"][index % 4],
            "lat": round(lat + ((index % 5) - 2) * 1.2, 3),
            "lon": round(lon + ((index % 7) - 3) * 1.4, 3),
            "radius": 260000 + (index % 7) * 42000,
            "height": 78000 + (index % 6) * 16000,
            "intensity": round(0.44 + (index % 9) * 0.052, 2),
        }
    augment_layer("volumetricWeather", 24, storm_factory)

    lightning_centers = storm_centers + [(101, 4), (30, 0), (-60, -3), (115, -7), (-85, 15)]
    def lightning_factory(index):
        lon, lat = lightning_centers[index % len(lightning_centers)]
        return {
            "id": f"lightning-expanded-{index + 1:02d}",
            "name": f"Lightning cluster {index + 1:02d}",
            "kind": "event",
            "category": "lightning",
            "lat": round(lat + ((index % 9) - 4) * 0.62, 3),
            "lon": round(lon + ((index % 11) - 5) * 0.62, 3),
            "radius": 22000 + (index % 8) * 5000,
            "intensity": round(0.48 + (index % 10) * 0.052, 2),
        }
    augment_layer("lightning", 56, lightning_factory)

    def air_factory(index):
        start = GLOBAL_HUBS[index % len(GLOBAL_HUBS)]
        end = GLOBAL_HUBS[(index * 5 + 11) % len(GLOBAL_HUBS)]
        return {
            "id": f"air-route-expanded-{index + 1:02d}",
            "name": f"{start[0]} - {end[0]} corridor",
            "kind": "line",
            "category": "flight-route",
            "points": arc_route((start[1], start[2]), (end[1], end[2]), 10600 + (index % 5) * 400, 70000 + (index % 6) * 8000),
        }
    augment_layer("airCorridors", 34, air_factory)

    def traffic_factory(index):
        city = GLOBAL_HUBS[(index * 2) % len(GLOBAL_HUBS)]
        spread = 0.08 + (index % 5) * 0.025
        return {
            "id": f"traffic-expanded-{index + 1:02d}",
            "name": f"{city[0]} road flow",
            "kind": "line",
            "category": "traffic",
            "intensity": round(0.28 + (index % 12) * 0.055, 2),
            "points": [
                [round(city[1] - spread, 3), round(city[2] - spread / 2, 3), 6],
                [round(city[1], 3), round(city[2], 3), 6],
                [round(city[1] + spread, 3), round(city[2] + spread / 2, 3), 6],
            ],
        }
    augment_layer("traffic", 44, traffic_factory)

    for layer_payload in STATIC_INTEL_LAYERS.values():
        layer_payload.setdefault("generated", generated_at())
        layer_payload["count"] = len(layer_payload.get("features") or [])


build_expanded_intel_layers()


def static_intel_payload(layer, mode="fallback-static", error=None):
    """Return the registered Orion layer dataset as a clearly marked degraded fallback."""
    source_payload = STATIC_INTEL_LAYERS.get(layer)
    if not source_payload:
        return None

    payload = copy.deepcopy(source_payload)
    features = payload.get("features") or []
    payload["generated"] = int(time.time())
    payload["count"] = len(features)
    payload["mode"] = mode
    payload["provider_health"] = "degraded"
    payload["fallback"] = True
    if error:
        payload["error"] = error
    return payload



def external_camera_url(camera, key):
    value = (camera.get(key) or "").strip()
    parsed = urlparse(value)

    if parsed.scheme in ("http", "https") and parsed.netloc:
        return value

    return ""


def camera_frame_svg(camera, frame_index=0):
    now = time.gmtime()
    name = html.escape(camera.get("name") or "Camera node")
    provider = html.escape(camera.get("provider") or "Orion camera registry")
    category = html.escape(camera.get("category") or "camera")
    status = html.escape(camera.get("status") or "online")
    camera_id = str(camera.get("id") or "camera")
    seed = sum(ord(char) for char in camera_id)
    hue = seed % 360
    pulse_x = 120 + ((frame_index * 37 + seed * 3) % 1040)
    pulse_y = 120 + ((frame_index * 23 + seed * 5) % 450)
    scan_y = (frame_index * 19 + seed) % 720
    clock = time.strftime("%Y-%m-%d %H:%M:%S UTC", now)
    lat = camera.get("lat", "--")
    lon = camera.get("lon", "--")
    upstream = "UPSTREAM PROXY" if external_camera_url(camera, "stream_url") else "GENERATED LIVE"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl({hue}, 36%, 18%)"/>
      <stop offset="0.46" stop-color="#111821"/>
      <stop offset="1" stop-color="#05070b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="72%">
      <stop offset="0" stop-color="rgba(255,255,255,.28)"/>
      <stop offset=".48" stop-color="rgba(255,255,255,.06)"/>
      <stop offset="1" stop-color="rgba(0,0,0,.44)"/>
    </radialGradient>
    <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M46 0H0V46" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1"/>
    </pattern>
    <filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="1280" height="720" fill="url(#sky)"/>
  <rect width="1280" height="720" fill="url(#glow)"/>
  <path d="M0 516C160 462 286 438 452 468C648 504 760 612 946 590C1076 575 1182 506 1280 488V720H0Z" fill="rgba(115,132,118,.72)"/>
  <path d="M0 558C182 524 320 514 484 540C690 574 830 680 1048 646C1148 631 1222 592 1280 568V720H0Z" fill="rgba(47,67,62,.88)"/>
  <path d="M0 586L1280 418V484L0 650Z" fill="rgba(34,47,43,.82)"/>
  <path d="M0 616L1280 448" stroke="rgba(255,255,255,.34)" stroke-width="12" stroke-linecap="round"/>
  <path d="M0 616L1280 448" stroke="rgba(255,255,255,.12)" stroke-width="44" stroke-linecap="round"/>
  <path d="M-50 448C190 420 350 368 542 260C736 150 930 118 1330 90" fill="none" stroke="rgba(164,185,205,.18)" stroke-width="78"/>
  <path d="M-20 454C220 426 388 376 568 278C748 180 946 142 1320 112" fill="none" stroke="rgba(213,229,241,.22)" stroke-width="24"/>
  <rect width="1280" height="720" fill="url(#grid)" opacity=".58"/>
  <rect x="0" y="{scan_y}" width="1280" height="28" fill="rgba(255,255,255,.13)"/>
  <circle cx="{pulse_x}" cy="{pulse_y}" r="58" fill="hsl({hue}, 82%, 72%)" opacity=".16" filter="url(#soft)"/>
  <circle cx="{pulse_x}" cy="{pulse_y}" r="8" fill="rgba(255,255,255,.92)"/>
  <path d="M610 360H670M640 330V390" stroke="rgba(255,255,255,.72)" stroke-width="2"/>
  <circle cx="640" cy="360" r="76" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2"/>
  <circle cx="640" cy="360" r="132" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="2"/>
  <rect x="28" y="24" width="430" height="118" rx="18" fill="rgba(3,5,9,.66)" stroke="rgba(255,255,255,.18)"/>
  <text x="52" y="61" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800">{name}</text>
  <text x="52" y="94" fill="rgba(255,255,255,.74)" font-family="Arial, Helvetica, sans-serif" font-size="17">{provider} / {category} / {status}</text>
  <text x="52" y="122" fill="rgba(255,255,255,.54)" font-family="Arial, Helvetica, sans-serif" font-size="15">{lat}, {lon}</text>
  <rect x="954" y="24" width="298" height="92" rx="18" fill="rgba(3,5,9,.66)" stroke="rgba(255,255,255,.18)"/>
  <circle cx="989" cy="57" r="9" fill="#ffffff"/>
  <text x="1010" y="64" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800">LIVE</text>
  <text x="982" y="94" fill="rgba(255,255,255,.64)" font-family="Arial, Helvetica, sans-serif" font-size="14">{clock}</text>
  <text x="34" y="686" fill="rgba(255,255,255,.58)" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="800" letter-spacing="3">{upstream} / FRAME {frame_index:04d}</text>
</svg>""".encode("utf-8")


def fallback_wildfire_features():
    centers = [
        ("Pacific Northwest thermal perimeter", -121.4, 44.2, 0.78),
        ("Northern California active fire complex", -122.1, 39.2, 0.82),
        ("Sierra Nevada smoke column", -119.8, 37.4, 0.64),
        ("Rocky Mountain incident zone", -106.7, 39.4, 0.58),
        ("Canadian boreal fire front", -112.4, 56.3, 0.74),
        ("Amazon basin hotspot", -62.3, -7.8, 0.66),
        ("Patagonia grassfire watch", -70.1, -45.2, 0.44),
        ("Mediterranean wildfire watch", 23.8, 38.1, 0.61),
        ("Southern Africa savanna burn", 28.2, -24.8, 0.54),
        ("Australia bushfire cell", 149.1, -35.3, 0.68),
        ("Siberian taiga hotspot", 103.5, 59.2, 0.57),
        ("Southeast Asia peat fire", 103.2, -1.4, 0.63),
    ]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return [
        {
            "id": f"wildfire-fallback-{index + 1:02d}",
            "name": name,
            "kind": "event",
            "category": "wildfire",
            "lon": lon,
            "lat": lat,
            "radius": 42000 + (index % 5) * 9000,
            "intensity": intensity,
            "time": now,
            "status": "thermal-watch",
        }
        for index, (name, lon, lat, intensity) in enumerate(centers)
    ]


class OrionHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        requested = super().translate_path(path)
        relative = os.path.relpath(requested, os.getcwd())
        return str(ROOT / relative)

    def do_GET(self):
        if self.path.startswith("/gibs/"):
            self.proxy_gibs()
            return

        if self.path.startswith("/rainviewer/"):
            self.proxy_rainviewer()
            return

        if self.path.startswith("/zoom-earth/"):
            self.proxy_zoom_earth_tile()
            return

        if self.path.startswith("/osm/"):
            self.proxy_osm()
            return

        if self.path.startswith("/esri/"):
            self.proxy_esri()
            return

        if self.path.startswith("/geo/countries"):
            self.proxy_geojson("countries")
            return

        if self.path.startswith("/geo/us-states"):
            self.proxy_geojson("us-states")
            return

        if self.path.startswith("/camera/resolve"):
            self.resolve_camera_stream()
            return

        if self.path.startswith("/camera/snapshot"):
            self.proxy_camera_snapshot()
            return

        if self.path.startswith("/camera/hls"):
            self.proxy_camera_hls()
            return

        if self.path.startswith("/live/aircraft"):
            self.proxy_aircraft()
            return

        if self.path.startswith("/live/satellites"):
            self.proxy_satellites()
            return

        if self.path.startswith("/live/earthquakes"):
            self.proxy_earthquakes()
            return

        if self.path.startswith("/live/cameras/providers"):
            self.proxy_camera_providers()
            return
        
        if self.path.startswith("/live/cameras/metadata"):
            self.proxy_cameras_metadata()
            return
        
        if self.path.startswith("/api/camera/stream/"):
            self.resolve_camera_stream()
            return
        
        if self.path.startswith("/live/cameras"):
            self.proxy_cameras()
            return

        if self.path.startswith("/live/weather/radar"):
            self.proxy_weather_radar()
            return

        if self.path.startswith("/live/weather/zoom-earth"):
            self.proxy_zoom_earth_weather()
            return

        if self.path.startswith("/live/wildfires"):
            self.proxy_wildfires()
            return

        if self.path.startswith("/live/intel"):
            self.proxy_intel_layer()
            return

        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/live/cameras/refresh"):
            self.refresh_camera_cache()
            return

        self.send_response(404)
        self.end_headers()

    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP_HEADER)

        if self.path in ("/", "/index.html") or self.path.startswith("/app.js") or self.path.startswith("/styles.css"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")

        super().end_headers()

    def gibs_path_candidates(self, target_path):
        """Try earlier dates when NASA has not published the requested day yet."""
        candidates = [target_path]
        match = GIBS_DATED_PATH_RE.search(target_path)
        if match:
            date_str = match.group(1)
            try:
                base = datetime.strptime(date_str, "%Y-%m-%d").date()
                for offset in range(1, 5):
                    prior_str = (base - timedelta(days=offset)).isoformat()
                    candidates.append(
                        target_path[: match.start(1)]
                        + prior_str
                        + target_path[match.end(1) :]
                    )
            except ValueError:
                pass

        for source_layer, fallback_layer in GIBS_TRUECOLOR_FALLBACK_LAYER:
            if source_layer in target_path:
                candidates.append(target_path.replace(source_layer, fallback_layer, 1))

        seen = set()
        ordered = []
        for candidate in candidates:
            if candidate not in seen:
                seen.add(candidate)
                ordered.append(candidate)
        return ordered

    def fetch_gibs_tile(self, target_path):
        cache_path = TILE_CACHE_ROOT / "gibs" / target_path.strip("/").replace("..", "")
        if cache_path.exists():
            payload = cache_path.read_bytes()
            if is_blank_gibs_tile(target_path, payload):
                try:
                    cache_path.unlink()
                except Exception:
                    pass
            else:
                return prepare_gibs_tile_for_client(target_path, payload, cache_path.suffix.lower())

        target_url = GIBS_ORIGIN + quote(target_path, safe="/:?=&._-")
        request = Request(target_url, headers={"User-Agent": "Project-Orion/1.0"})
        with urlopen(request, timeout=18) as response:
            payload = response.read()
            if len(payload) < 900 or is_blank_gibs_tile(target_path, payload):
                raise HTTPError(target_url, 404, "Tile too small", response.headers, None)
            try:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_bytes(payload)
            except Exception:
                pass
            return prepare_gibs_tile_for_client(target_path, payload, cache_path.suffix.lower())

    def proxy_gibs(self):
        target_path = self.path[len("/gibs") :]
        if "?" in target_path:
            target_path = target_path.split("?")[0]

        neg_expiry = GIBS_NEGATIVE_CACHE.get(target_path)
        if neg_expiry and neg_expiry > time.time():
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=300")
            self.send_header("X-Orion-Tile-Fallback", "transparent")
            self.send_header("Content-Length", str(len(TRANSPARENT_PNG)))
            self.end_headers()
            self.write_payload(TRANSPARENT_PNG)
            return

        for candidate_path in self.gibs_path_candidates(target_path):
            cache_path = TILE_CACHE_ROOT / "gibs" / candidate_path.strip("/").replace("..", "")
            if cache_path.exists():
                payload = cache_path.read_bytes()
                if is_blank_gibs_tile(candidate_path, payload):
                    try:
                        cache_path.unlink()
                    except Exception:
                        pass
                else:
                    payload, suffix = prepare_gibs_tile_for_client(candidate_path, payload, cache_path.suffix.lower())
                    content_type = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
                    self.send_response(200)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Cache-Control", "public, max-age=604800")
                    if candidate_path != target_path:
                        self.send_header("X-Orion-Gibs-Fallback-Date", "1")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.write_payload(payload)
                    return

            try:
                payload, suffix = self.fetch_gibs_tile(candidate_path)
                content_type = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "public, max-age=86400")
                if candidate_path != target_path:
                    self.send_header("X-Orion-Gibs-Fallback-Date", "1")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.write_payload(payload)
                return
            except (HTTPError, URLError, TimeoutError, OSError):
                continue

        GIBS_NEGATIVE_CACHE[target_path] = time.time() + GIBS_NEGATIVE_CACHE_SEC
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("X-Orion-Tile-Fallback", "transparent")
        self.send_header("Content-Length", str(len(TRANSPARENT_PNG)))
        self.end_headers()
        self.write_payload(TRANSPARENT_PNG)

    def proxy_osm(self):
        tile_path = self.path[len("/osm"):]  # e.g. /12/2048/1365.png

        if "?" in tile_path:
            tile_path = tile_path.split("?")[0]

        parts = tile_path.strip("/").split("/")
        try:
            x_val = int(parts[1]) if len(parts) >= 3 else 0
            subdomain = ["a", "b", "c"][x_val % 3]
        except (ValueError, IndexError):
            subdomain = "a"

        target_url = f"https://{subdomain}.tile.openstreetmap.org{tile_path}"
        cache_path = TILE_CACHE_ROOT / "osm" / tile_path.strip("/")
        if cache_path.exists():
            payload = cache_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=604800")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)
            return

        request = Request(target_url, headers={
            "User-Agent": "Project-Orion/1.0 (educational use)",
            "Referer": "http://127.0.0.1:4174/"
        })

        try:
            with urlopen(request, timeout=5) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "image/png")
                try:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_bytes(payload)
                except Exception:
                    pass
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.write_payload(payload)
        except Exception:
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=60")
            self.send_header("Content-Length", str(len(TRANSPARENT_PNG)))
            self.end_headers()
            self.write_payload(TRANSPARENT_PNG)

    def proxy_esri(self):
        target_path = self.path[len("/esri"):]
        if "?" in target_path:
            target_path = target_path.split("?")[0]

        target_url = ESRI_IMAGERY_ORIGIN + quote(target_path, safe="/:?=&._-")
        cache_path = TILE_CACHE_ROOT / "esri" / (target_path.strip("/").replace("/", "_") + ".jpg")
        if cache_path.exists():
            payload = cache_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "public, max-age=604800")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)
            return

        request = Request(target_url, headers={
            "User-Agent": "Project-Orion/1.0",
            "Referer": "http://127.0.0.1:4174/"
        })

        try:
            with urlopen(request, timeout=12) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "image/jpeg")
                try:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_bytes(payload)
                except Exception as cache_error:
                    print(f"Warning: Failed to cache ESRI tile {target_path}: {cache_error}", file=sys.stderr, flush=True)
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.write_payload(payload)
        except Exception as e:
            print(f"Error fetching ESRI tile {target_path}: {e}", file=sys.stderr, flush=True)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=60")
            self.send_header("X-Orion-Tile-Fallback", "transparent")
            self.send_header("Content-Length", str(len(TRANSPARENT_PNG)))
            self.end_headers()
            self.write_payload(TRANSPARENT_PNG)

    def proxy_rainviewer(self):
        target_path = self.path[len("/rainviewer") :]

        if "?" in target_path:
            target_path = target_path.split("?")[0]

        target_url = RAINVIEWER_ORIGIN + quote(target_path, safe="/:?=&._-")
        cache_path = TILE_CACHE_ROOT / "rainviewer" / target_path.strip("/").replace("..", "")
        if cache_path.exists():
            payload = cache_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=1800")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)
            return

        request = Request(target_url, headers={"User-Agent": "Project-Orion/1.0"})

        try:
            with urlopen(request, timeout=14) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "image/png")
                try:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_bytes(payload)
                except Exception:
                    pass
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "public, max-age=300")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.write_payload(payload)
        except Exception:
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=60")
            self.send_header("X-Orion-Tile-Fallback", "transparent")
            self.send_header("Content-Length", str(len(TRANSPARENT_PNG)))
            self.end_headers()
            self.write_payload(TRANSPARENT_PNG)

    def zoom_earth_iso(self, epoch_seconds):
        return datetime.utcfromtimestamp(int(epoch_seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def fetch_zoom_earth_times(self, kind):
        cache_key = f"zoom-earth:times:{kind}"
        ttl = 90 if kind == "radar" else 600
        cached = self.cached_feed(cache_key, ttl)
        if cached is not None:
            return cached

        url = f"{ZOOM_EARTH_TIMES_ORIGIN}/{kind}.json"
        request = Request(url, headers={
            "User-Agent": "Mozilla/5.0 Project-Orion/1.0",
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://zoom.earth/",
        })
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))

        self.store_cached_feed(cache_key, payload)
        return payload

    def select_zoom_earth_forecast(self, times_payload, layer_name, level_name):
        layer_payload = (times_payload or {}).get(layer_name) or {}
        level_payload = layer_payload.get(level_name) or {}
        now = time.time()
        best = None

        for run_epoch, forecast_hours in level_payload.items():
            try:
                run_ts = int(run_epoch)
            except (TypeError, ValueError):
                continue

            if not isinstance(forecast_hours, list):
                continue

            for hour in forecast_hours:
                try:
                    forecast_hour = int(hour)
                except (TypeError, ValueError):
                    continue

                valid_ts = run_ts + forecast_hour * 3600
                is_past = valid_ts <= now
                score = (0 if is_past else 10 ** 9) + abs(now - valid_ts)
                if best is None or score < best["score"]:
                    best = {
                        "score": score,
                        "run_ts": run_ts,
                        "forecast_hour": forecast_hour,
                        "valid_ts": valid_ts,
                    }

        if best is None:
            return None

        run_dt = datetime.utcfromtimestamp(best["run_ts"])
        run_path = run_dt.strftime("%Y-%m-%d/%H%M")
        forecast_path = f"f{best['forecast_hour']:03d}"
        tile_path = (
            f"/zoom-earth/{ZOOM_EARTH_MODEL}/{ZOOM_EARTH_MODEL_VERSION}/"
            f"{layer_name}/webp/{level_name}/{run_path}/{forecast_path}/"
            "{z}/{y}/{x}.webp"
        )
        return {
            "path": tile_path,
            "run_time": self.zoom_earth_iso(best["run_ts"]),
            "valid_time": self.zoom_earth_iso(best["valid_ts"]),
            "forecast_hour": best["forecast_hour"],
        }

    def select_zoom_earth_radar_frames(self, times_payload):
        reflectivity = (times_payload or {}).get("reflectivity") or {}
        frames = []
        now = time.time()

        for epoch, tile_hash in reflectivity.items():
            try:
                ts = int(epoch)
            except (TypeError, ValueError):
                continue
            if not tile_hash:
                continue
            frames.append((ts, str(tile_hash)))

        frames.sort(key=lambda entry: entry[0])
        past_frames = [entry for entry in frames if entry[0] <= now]
        selected = (past_frames or frames)[-12:]
        payload_frames = []

        for ts, tile_hash in selected:
            stamp = datetime.utcfromtimestamp(ts)
            payload_frames.append({
                "time": self.zoom_earth_iso(ts),
                "hash": tile_hash,
                "path": (
                    f"/zoom-earth/radar/reflectivity/{stamp.strftime('%Y-%m-%d')}/"
                    f"{stamp.strftime('%H%M')}/{tile_hash}/" + "{z}/{y}/{x}.webp"
                ),
            })

        return payload_frames

    def proxy_zoom_earth_weather(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        mode = (params.get("mode") or ["wind"])[0].strip().lower()

        try:
            if mode == "radar":
                times_payload = self.fetch_zoom_earth_times("radar")
                frames = self.select_zoom_earth_radar_frames(times_payload)
                latest = frames[-1] if frames else None
                payload = {
                    "source": "Zoom Earth",
                    "provider": "Zoom Earth radar",
                    "mode": "live",
                    "weather_mode": "radar",
                    "generated": int(time.time()),
                    "refresh_seconds": 600,
                    "count": len(frames),
                    "latest": latest,
                    "frames": frames,
                    "tile_template": latest["path"] if latest else None,
                    "fallback": False,
                }
                self.send_json(payload, cache_seconds=60)
                return

            if mode not in ZOOM_EARTH_MODE_MAP:
                mode = "wind"

            layer_name, level_name = ZOOM_EARTH_MODE_MAP[mode]
            times_payload = self.fetch_zoom_earth_times(ZOOM_EARTH_MODEL)
            frame = self.select_zoom_earth_forecast(times_payload, layer_name, level_name)

            if not frame:
                raise ValueError(f"No Zoom Earth frame for {mode}")

            payload = {
                "source": "Zoom Earth",
                "provider": "DWD ICON via Zoom Earth",
                "mode": "live",
                "weather_mode": mode,
                "zoom_layer": layer_name,
                "level": level_name,
                "generated": int(time.time()),
                "refresh_seconds": 600,
                "count": 1,
                "latest": frame,
                "frames": [frame],
                "tile_template": frame["path"],
                "fallback": False,
            }
            self.send_json(payload, cache_seconds=120)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
            self.send_json({
                "source": "Zoom Earth",
                "provider": "Zoom Earth",
                "mode": "error",
                "weather_mode": mode,
                "generated": int(time.time()),
                "refresh_seconds": 600,
                "count": 0,
                "latest": None,
                "frames": [],
                "tile_template": None,
                "fallback": False,
                "error": type(error).__name__,
                "message": str(error),
            }, cache_seconds=20)

    def proxy_zoom_earth_tile(self):
        target_path = unquote(self.path[len("/zoom-earth") :])

        if "?" in target_path:
            target_path = target_path.split("?")[0]

        if not target_path.startswith("/") or ".." in target_path or not target_path.endswith((".webp", ".png", ".jpg", ".jpeg")):
            self.send_response(404)
            self.end_headers()
            return

        if not any(target_path.startswith(prefix) for prefix in ZOOM_EARTH_TILE_PREFIXES):
            self.send_response(404)
            self.end_headers()
            return

        target_url = ZOOM_EARTH_TILE_ORIGIN + quote(target_path, safe="/:?=&._-")
        cache_path = TILE_CACHE_ROOT / "zoom-earth" / target_path.strip("/").replace("..", "")
        suffix = Path(target_path).suffix.lower()
        content_type = {
            ".webp": "image/webp",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        }.get(suffix, "application/octet-stream")

        if cache_path.exists():
            payload = cache_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "public, max-age=604800")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)
            return

        request = Request(target_url, headers={
            "User-Agent": "Mozilla/5.0 Project-Orion/1.0",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Referer": "https://zoom.earth/",
        })

        try:
            with urlopen(request, timeout=12) as response:
                payload = response.read()
                response_type = response.headers.get("Content-Type", content_type)
                if not payload or len(payload) < 16:
                    raise HTTPError(target_url, 404, "Empty tile", response.headers, None)
                try:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_bytes(payload)
                except Exception:
                    pass
                self.send_response(200)
                self.send_header("Content-Type", response_type)
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.write_payload(payload)
        except Exception:
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=120")
            self.send_header("X-Orion-Tile-Fallback", "transparent")
            self.send_header("Content-Length", str(len(TRANSPARENT_PNG)))
            self.end_headers()
            self.write_payload(TRANSPARENT_PNG)

    def proxy_geojson(self, kind):
        if kind == "countries":
            source_url = COUNTRIES_GEOJSON_URL
            cache_key = "geo:countries"
        else:
            source_url = US_STATES_GEOJSON_URL
            cache_key = "geo:us-states"

        cached = FEED_CACHE.get(cache_key)
        if cached and time.time() - cached["timestamp"] < 7 * 24 * 60 * 60:
            payload = cached["payload"]
        else:
            try:
                request = Request(source_url, headers={
                    "User-Agent": "Project-Orion/1.0",
                    "Accept": "application/geo+json,application/json,*/*",
                })
                with urlopen(request, timeout=18) as response:
                    raw_payload = response.read()
                
                try:
                    geojson_data = json.loads(raw_payload.decode("utf-8", errors="replace"))
                    geojson_data = self.sanitize_geojson_coordinates(geojson_data)
                    payload = json.dumps(geojson_data).encode("utf-8")
                except Exception as e:
                    print(f"Error sanitizing GeoJSON: {e}")
                    payload = raw_payload
                
                FEED_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
            except Exception:
                payload = b'{"type":"FeatureCollection","features":[]}'

        self.send_response(200)
        self.send_header("Content-Type", "application/geo+json")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.write_payload(payload)
    
    def sanitize_geojson_coordinates(self, geojson):
        """Recursively validate and sanitize GeoJSON coordinates"""
        if not isinstance(geojson, dict):
            return geojson
        
        if geojson.get("type") == "FeatureCollection":
            features = geojson.get("features", [])
            valid_features = []
            for feature in features:
                sanitized = self.sanitize_geojson_coordinates(feature)
                if sanitized:
                    valid_features.append(sanitized)
            geojson["features"] = valid_features
            return geojson
        
        if geojson.get("type") == "Feature":
            geometry = geojson.get("geometry")
            if geometry:
                sanitized_geometry = self.sanitize_geometry(geometry)
                if sanitized_geometry:
                    geojson["geometry"] = sanitized_geometry
                    return geojson
            return None
        
        return geojson
    
    def sanitize_geometry(self, geometry):
        """Sanitize geometry coordinates"""
        if not isinstance(geometry, dict):
            return None
        
        geom_type = geometry.get("type")
        coordinates = geometry.get("coordinates")
        
        if not coordinates:
            return None
        
        try:
            if geom_type == "Point":
                if self.is_valid_coordinate_pair(coordinates):
                    return geometry
                print(f"Filtered invalid Point: {coordinates}")
                return None
            
            elif geom_type in ("LineString", "MultiPoint"):
                valid_coords = [c for c in coordinates if self.is_valid_coordinate_pair(c)]
                invalid_count = len(coordinates) - len(valid_coords)
                if invalid_count > 0:
                    print(f"Filtered {invalid_count} invalid coordinates from {geom_type}")
                if len(valid_coords) >= 2:  # LineString needs at least 2 points
                    geometry["coordinates"] = valid_coords
                    return geometry
                print(f"Filtered entire {geom_type}: insufficient valid points")
                return None
            
            elif geom_type == "Polygon":
                valid_rings = []
                for ring_idx, ring in enumerate(coordinates):
                    valid_coords = [c for c in ring if self.is_valid_coordinate_pair(c)]
                    invalid_count = len(ring) - len(valid_coords)
                    if invalid_count > 0:
                        print(f"Filtered {invalid_count} invalid coordinates from Polygon ring {ring_idx}")
                    if len(valid_coords) >= 4:  # Polygon ring needs at least 4 points (closed)
                        if valid_coords[0] != valid_coords[-1]:
                            valid_coords.append(valid_coords[0])
                        valid_rings.append(valid_coords)
                    else:
                        print(f"Filtered Polygon ring {ring_idx}: insufficient valid points ({len(valid_coords)}/4)")
                
                if valid_rings:
                    geometry["coordinates"] = valid_rings
                    return geometry
                print(f"Filtered entire Polygon: no valid rings")
                return None
            
            elif geom_type == "MultiLineString":
                valid_lines = []
                for line_idx, line in enumerate(coordinates):
                    valid_coords = [c for c in line if self.is_valid_coordinate_pair(c)]
                    invalid_count = len(line) - len(valid_coords)
                    if invalid_count > 0:
                        print(f"Filtered {invalid_count} invalid coordinates from MultiLineString line {line_idx}")
                    if len(valid_coords) >= 2:
                        valid_lines.append(valid_coords)
                
                if valid_lines:
                    geometry["coordinates"] = valid_lines
                    return geometry
                print(f"Filtered entire MultiLineString: no valid lines")
                return None
            
            elif geom_type == "MultiPolygon":
                valid_polygons = []
                for poly_idx, polygon in enumerate(coordinates):
                    valid_rings = []
                    for ring_idx, ring in enumerate(polygon):
                        valid_coords = [c for c in ring if self.is_valid_coordinate_pair(c)]
                        invalid_count = len(ring) - len(valid_coords)
                        if invalid_count > 0:
                            print(f"Filtered {invalid_count} invalid coordinates from MultiPolygon[{poly_idx}] ring {ring_idx}")
                        if len(valid_coords) >= 4:
                            if valid_coords[0] != valid_coords[-1]:
                                valid_coords.append(valid_coords[0])
                            valid_rings.append(valid_coords)
                    
                    if valid_rings:
                        valid_polygons.append(valid_rings)
                
                if valid_polygons:
                    geometry["coordinates"] = valid_polygons
                    return geometry
                print(f"Filtered entire MultiPolygon: no valid polygons")
                return None
            
        except Exception as e:
            print(f"Error sanitizing geometry type {geom_type}: {e}")
            return None
        
        return geometry
    
    def is_valid_coordinate_pair(self, coord):
        """Check if a coordinate pair [lon, lat] is valid"""
        try:
            if not isinstance(coord, (list, tuple)) or len(coord) < 2:
                return False
            
            lon, lat = float(coord[0]), float(coord[1])
            
            if not (math.isfinite(lon) and math.isfinite(lat)):
                return False
            
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                return False
            
            return True
        except (TypeError, ValueError, IndexError):
            return False

    def write_payload(self, payload):
        try:
            self.wfile.write(payload)
        except CLIENT_DISCONNECT_ERRORS:
            pass

    def proxy_aircraft(self):
        now = time.time()

        if AIRCRAFT_CACHE["payload"] and now - AIRCRAFT_CACHE["timestamp"] < 45:
            self.send_json(AIRCRAFT_CACHE["payload"])
            return

        adsb_error = None
        try:
            payload = self.fetch_adsb_point_payload()
            AIRCRAFT_CACHE["timestamp"] = now
            AIRCRAFT_CACHE["payload"] = payload
            self.send_json(payload)
            return
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            adsb_error = type(error).__name__

        try:
            request = Request(OPENSKY_STATES_URL, headers={"User-Agent": "Project-Orion/1.0"})

            with urlopen(request, timeout=5) as response:
                raw = response.read()

            upstream = json.loads(raw.decode("utf-8"))
            payload = {
                "source": "OpenSky Network",
                "time": upstream.get("time"),
                "states": self.normalize_aircraft_states(upstream.get("states") or []),
            }
            if payload["states"]:
                AIRCRAFT_CACHE["timestamp"] = now
                AIRCRAFT_CACHE["payload"] = payload
                self.send_json(payload)
                return
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            opensky_error = type(error).__name__
        else:
            opensky_error = "EmptyOpenSkyStateVector"

        if AIRCRAFT_CACHE["payload"] and now - AIRCRAFT_CACHE["timestamp"] < 15 * 60:
            payload = dict(AIRCRAFT_CACHE["payload"])
            payload["cached"] = True
            payload["stale"] = True
            payload["mode"] = "degraded"
            payload["provider_health"] = "degraded"
            payload["error"] = opensky_error
            payload["adsb_error"] = adsb_error
            self.send_json(payload, cache_seconds=15)
            return

        payload = {
            "source": "OpenSky Network / ADS-B public point feeds",
            "error": opensky_error,
            "adsb_error": adsb_error,
            "time": None,
            "states": [],
        }
        self.send_json(payload, cache_seconds=10)

    def proxy_satellites(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        requested_group = (params.get("group") or ["stations"])[0].strip().lower()
        group = CELESTRAK_GROUPS.get(requested_group, "stations")
        group_label = ",".join(group) if isinstance(group, list) else str(group)
        cache_key = f"tle:{requested_group}:{group_label}"

        cached = self.cached_feed(cache_key, 6 * 60 * 60)
        if cached is not None:
            self.send_json(cached, cache_seconds=300)
            return

        try:
            raw = self.fetch_tle_group(group)

            payload = {
                "source": "CelesTrak",
                "group": requested_group,
                "groups": group if isinstance(group, list) else [group],
                "generated": int(time.time()),
                "mode": "live",
                "count": max(0, len([line for line in raw.splitlines() if line.startswith("1 ") ])),
                "fetched": int(time.time()),
                "tle": raw,
            }
            self.store_cached_feed(cache_key, payload)
            self.send_json(payload, cache_seconds=300)
        except (HTTPError, URLError, TimeoutError) as error:
            if requested_group == "starlink":
                try:
                    raw = self.filter_tle_by_name(self.fetch_tle_group("active"), "STARLINK", 300)
                    payload = {
                        "source": "CelesTrak",
                        "group": "starlink",
                        "fallback": "active-filtered",
                        "generated": int(time.time()),
                        "mode": "fallback",
                        "count": max(0, len([line for line in raw.splitlines() if line.startswith("1 ") ])),
                        "fetched": int(time.time()),
                        "tle": raw,
                    }
                    self.store_cached_feed(cache_key, payload)
                    self.send_json(payload, cache_seconds=300)
                    return
                except (HTTPError, URLError, TimeoutError):
                    pass

            payload = {
                "source": "CelesTrak",
                "group": requested_group,
                "groups": group if isinstance(group, list) else [group],
                "error": type(error).__name__,
                "generated": int(time.time()),
                "mode": "error",
                "count": 0,
                "fetched": None,
                "tle": "",
            }
            self.send_json(payload, cache_seconds=30)

    def proxy_earthquakes(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        feed_type = (params.get("feed") or ["2.5_day"])[0].strip()
        
        if feed_type not in USGS_EARTHQUAKE_FEEDS:
            feed_type = "2.5_day"
        
        cache_key = f"earthquakes:{feed_type}"
        cached = self.cached_feed(cache_key, 60)
        if cached is not None:
            self.send_json(cached, cache_seconds=30)
            return

        try:
            request = Request(USGS_EARTHQUAKE_FEEDS[feed_type], headers={"User-Agent": "Project-Orion/1.0"})

            with urlopen(request, timeout=12) as response:
                upstream = json.loads(response.read().decode("utf-8"))

            features = upstream.get("features") or []
            payload = {
                "source": "USGS",
                "feed": feed_type,
                "generated": upstream.get("metadata", {}).get("generated"),
                "count": len(features),
                "mode": "live",
                "fallback": False,
                "features": features[:200],
            }
            self.store_cached_feed(cache_key, payload)
            self.send_json(payload, cache_seconds=30)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            payload = {
                "source": "USGS",
                "feed": feed_type,
                "error": type(error).__name__,
                "generated": None,
                "count": 0,
                "mode": "error",
                "fallback": False,
                "features": [],
            }
            self.send_json(payload, cache_seconds=10)

    def proxy_weather_radar(self):
        cached = self.cached_feed("weather:rainviewer", 5 * 60)
        if cached is not None:
            self.send_json(cached, cache_seconds=120)
            return

        try:
            request = Request(RAINVIEWER_MAPS_URL, headers={"User-Agent": "Project-Orion/1.0"})

            with urlopen(request, timeout=12) as response:
                upstream = json.loads(response.read().decode("utf-8"))

            past = upstream.get("radar", {}).get("past") or []
            nowcast = upstream.get("radar", {}).get("nowcast") or []
            frames = (past + nowcast)[-12:]
            latest = frames[-1] if frames else None
            payload = {
                "source": "RainViewer",
                "generated": upstream.get("generated"),
                "count": len(frames),
                "mode": "live",
                "fallback": False,
                "host": upstream.get("host") or RAINVIEWER_ORIGIN,
                "latest": latest,
                "frames": frames,
            }
            self.store_cached_feed("weather:rainviewer", payload)
            self.send_json(payload, cache_seconds=120)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            stale = self.cached_feed_stale("weather:rainviewer", 30 * 60)
            if stale is not None:
                stale["error"] = type(error).__name__
                self.send_json(stale, cache_seconds=45)
                return

            self.send_json({
                "source": "RainViewer",
                "error": type(error).__name__,
                "generated": int(time.time()),
                "count": 0,
                "mode": "degraded-empty",
                "provider_health": "offline",
                "fallback": False,
                "latest": None,
                "frames": [],
            }, cache_seconds=30)

    def proxy_wildfires(self):
        cached = self.cached_feed("wildfires:eonet", 5 * 60)
        if cached is not None:
            self.send_json(cached, cache_seconds=120)
            return

        try:
            request = Request(NASA_EONET_WILDFIRES_URL, headers={"User-Agent": "Project-Orion/1.0"})

            with urlopen(request, timeout=12) as response:
                upstream = json.loads(response.read().decode("utf-8"))

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
                "mode": "live",
                "fallback": False,
                "features": features[:40],
            }
            self.store_cached_feed("wildfires:eonet", payload)
            self.send_json(payload, cache_seconds=120)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            stale = self.cached_feed_stale("wildfires:eonet", 24 * 60 * 60)
            if stale is not None:
                stale["error"] = type(error).__name__
                self.send_json(stale, cache_seconds=45)
                return

            self.send_json({
                "source": "NASA EONET",
                "error": type(error).__name__,
                "generated": int(time.time()),
                "count": 0,
                "mode": "degraded-empty",
                "provider_health": "offline",
                "fallback": False,
                "features": [],
            }, cache_seconds=30)

    def proxy_intel_layer(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        layer = (params.get("layer") or [""])[0]

        if layer == "emergencyIncidents":
            try:
                payload = nws_alerts_payload()
                self.store_cached_feed("intel:emergencyIncidents", payload)
                self.send_json(payload, cache_seconds=45)
                return
            except Exception as error:
                stale = self.cached_feed_stale("intel:emergencyIncidents", 60 * 60)
                if stale is not None:
                    stale["error"] = type(error).__name__
                    self.send_json(stale, cache_seconds=30)
                    return
                fallback = static_intel_payload(layer, error=type(error).__name__)
                if fallback is not None:
                    self.send_json(fallback, cache_seconds=45)
                    return
                self.send_json({
                    "source": "National Weather Service active alerts",
                    "error": type(error).__name__,
                    "mode": "error",
                    "fallback": False,
                    "generated": int(time.time()),
                    "count": 0,
                    "features": [],
                }, cache_seconds=25)
                return

        if layer == "volumetricWeather":
            try:
                payload = nws_weather_volume_payload()
                if payload.get("count", 0) > 0:
                    self.store_cached_feed("intel:volumetricWeather", payload)
                    self.send_json(payload, cache_seconds=45)
                    return
                self.send_json(payload, cache_seconds=45)
                return
            except Exception as error:
                stale = self.cached_feed_stale("intel:volumetricWeather", 60 * 60)
                if stale is not None:
                    stale["error"] = type(error).__name__
                    self.send_json(stale, cache_seconds=30)
                    return
                fallback = static_intel_payload(layer, error=type(error).__name__)
                if fallback is not None:
                    self.send_json(fallback, cache_seconds=45)
                    return
                self.send_json({
                    "source": "National Weather Service active storm alerts",
                    "error": type(error).__name__,
                    "mode": "error",
                    "fallback": False,
                    "generated": int(time.time()),
                    "count": 0,
                    "features": [],
                }, cache_seconds=25)
                return

        if layer == "lightning":
            try:
                payload = nws_lightning_payload()
                if payload.get("count", 0) > 0:
                    self.store_cached_feed("intel:lightning", payload)
                    self.send_json(payload, cache_seconds=30)
                    return
                self.send_json(payload, cache_seconds=30)
                return
            except Exception as error:
                stale = self.cached_feed_stale("intel:lightning", 45 * 60)
                if stale is not None:
                    stale["error"] = type(error).__name__
                    self.send_json(stale, cache_seconds=25)
                    return
                fallback = static_intel_payload(layer, error=type(error).__name__)
                if fallback is not None:
                    self.send_json(fallback, cache_seconds=45)
                    return
                self.send_json({
                    "source": "National Weather Service active thunderstorm alerts",
                    "error": type(error).__name__,
                    "mode": "error",
                    "fallback": False,
                    "generated": int(time.time()),
                    "count": 0,
                    "features": [],
                }, cache_seconds=20)
                return

        if layer == "socialEvents":
            try:
                payload = ticketmaster_events_payload()
                if payload.get("count"):
                    self.store_cached_feed("intel:socialEvents", payload)
                    self.send_json(payload, cache_seconds=45)
                    return
                fallback = static_intel_payload(layer, mode=payload.get("mode") or "fallback-static", error=payload.get("error") or "NoPublicCredential")
                if fallback is not None:
                    self.send_json(fallback, cache_seconds=120)
                    return
                self.send_json(payload, cache_seconds=120)
                return
            except Exception as error:
                stale = self.cached_feed_stale("intel:socialEvents", 60 * 60)
                if stale is not None:
                    stale["error"] = type(error).__name__
                    self.send_json(stale, cache_seconds=30)
                    return
                fallback = static_intel_payload(layer, error=type(error).__name__)
                if fallback is not None:
                    self.send_json(fallback, cache_seconds=90)
                    return
                self.send_json({
                    "source": "Ticketmaster Discovery API",
                    "error": type(error).__name__,
                    "mode": "error",
                    "fallback": False,
                    "generated": int(time.time()),
                    "count": 0,
                    "features": [],
                }, cache_seconds=35)
                return

        if layer == "traffic":
            try:
                payload = fl511_congestion_payload()
                if payload.get("count", 0) > 0:
                    self.store_cached_feed("intel:traffic", payload)
                    self.send_json(payload, cache_seconds=45)
                    return
            except Exception as error:
                stale = self.cached_feed_stale("intel:traffic", 30 * 60)
                if stale is not None:
                    stale["error"] = type(error).__name__
                    self.send_json(stale, cache_seconds=30)
                    return
                fallback = static_intel_payload(layer, error=type(error).__name__)
                if fallback is not None:
                    self.send_json(fallback, cache_seconds=45)
                    return
                self.send_json({
                    "source": "FL511 public ArcGIS congestion",
                    "error": type(error).__name__,
                    "generated": int(time.time()),
                    "count": 0,
                    "mode": "degraded-empty",
                    "provider_health": "offline",
                    "fallback": False,
                    "features": [],
                }, cache_seconds=20)
                return

        if layer == "underseaCables":
            try:
                payload = submarine_cables_payload()
                if payload.get("count", 0) > 0:
                    self.store_cached_feed("intel:underseaCables", payload)
                    self.send_json(payload, cache_seconds=300)
                    return
                self.send_json(payload, cache_seconds=180)
                return
            except Exception as error:
                stale = self.cached_feed_stale("intel:underseaCables", 7 * 24 * 60 * 60)
                if stale is not None:
                    stale["error"] = type(error).__name__
                    self.send_json(stale, cache_seconds=120)
                    return
                fallback = static_intel_payload(layer, error=type(error).__name__)
                if fallback is not None:
                    self.send_json(fallback, cache_seconds=90)
                    return
                self.send_json({
                    "source": "Submarine Cable Map public GeoJSON",
                    "error": type(error).__name__,
                    "generated": int(time.time()),
                    "count": 0,
                    "mode": "error",
                    "fallback": False,
                    "features": [],
                }, cache_seconds=30)
                return

        payload = STATIC_INTEL_LAYERS.get(layer)

        if not payload:
            self.send_json({
                "source": "Orion layer registry",
                "error": "UnknownLayer",
                "generated": int(time.time()),
                "count": 0,
                "mode": "error",
                "fallback": False,
                "features": [],
            }, cache_seconds=15)
            return

        fallback = static_intel_payload(layer, error="ProviderAdapterUnavailable")
        if fallback is not None:
            self.send_json(fallback, cache_seconds=60)
            return

        self.send_json({
            "source": (payload or {}).get("source") or "Orion layer registry",
            "error": "ProviderAdapterUnavailable",
            "generated": int(time.time()),
            "count": 0,
            "mode": "provider-unavailable",
            "fallback": False,
            "features": [],
        }, cache_seconds=60)

    def fetch_tle_group(self, group):
        if isinstance(group, list):
            chunks = []
            seen_catalog_ids = set()
            last_error = None

            for child_group in group:
                try:
                    child_raw = self.fetch_tle_group(child_group)
                except (HTTPError, URLError, TimeoutError) as error:
                    last_error = error
                    continue

                lines = [line.rstrip() for line in child_raw.splitlines() if line.strip()]
                for index in range(0, max(0, len(lines) - 2), 3):
                    name = lines[index]
                    line1 = lines[index + 1]
                    line2 = lines[index + 2]

                    if not (line1.startswith("1 ") and line2.startswith("2 ")):
                        continue

                    catalog_id = line1[2:7].strip() or name
                    if catalog_id in seen_catalog_ids:
                        continue

                    seen_catalog_ids.add(catalog_id)
                    chunks.extend([name, line1, line2])

            if chunks:
                return "\n".join(chunks) + "\n"

            if last_error is not None:
                raise last_error

            raise URLError("No CelesTrak aggregate groups loaded")

        if group == "starlink":
            request = Request(
                CELESTRAK_SUPPLEMENTAL_URL.format(file="starlink"),
                headers={"User-Agent": "Project-Orion/1.0"},
            )

            with urlopen(request, timeout=20) as response:
                return response.read().decode("utf-8", errors="replace")

        request = Request(
            CELESTRAK_TLE_URL.format(group=quote(group, safe="")),
            headers={"User-Agent": "Project-Orion/1.0"},
        )

        with urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8", errors="replace")

    def filter_tle_by_name(self, raw, needle, max_records):
        lines = [line.rstrip() for line in raw.splitlines() if line.strip()]
        filtered = []

        for index in range(0, max(0, len(lines) - 2), 3):
            name = lines[index]
            line1 = lines[index + 1]
            line2 = lines[index + 2]

            if line1.startswith("1 ") and line2.startswith("2 ") and needle.upper() in name.upper():
                filtered.extend([name, line1, line2])

            if len(filtered) >= max_records * 3:
                break

        return "\n".join(filtered) + ("\n" if filtered else "")

    def proxy_cameras_metadata(self):
        """Lightweight camera metadata endpoint for fast initial load."""
        if not CAMERANET_AVAILABLE:
            self.send_json({
                "source": "CameraNet",
                "error": "Camera providers not available",
                "cameras": [],
                "count": 0,
                "lightweight": True,
            }, cache_seconds=10)
            return

        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        bbox_str = (params.get("bbox") or [""])[0]
        bbox = None
        if bbox_str:
            try:
                parts = [float(p) for p in bbox_str.split(",")]
                if len(parts) == 4:
                    bbox = tuple(parts)  # (west, south, east, north)
            except ValueError:
                pass

        requested_provider = (params.get("provider") or ["all"])[0]
        provider_filter = None if requested_provider == "all" else requested_provider
        requested_state = (params.get("state") or [""])[0].strip().upper()
        state_filter = requested_state or None

        cache_key = f"metadata|{requested_provider}|{requested_state}|{bbox_str or 'global'}"
        cached = CAMERA_RESPONSE_CACHE.get(cache_key)
        if cached and time.time() - cached["timestamp"] < 300:
            self.send_json(cached["payload"], cache_seconds=120)
            return

        try:
            cameras, providers_used = get_all_cameras(bbox, provider_filter, state_filter)
            
            metadata = [
                {
                    "id": cam.get("id"),
                    "lat": cam.get("lat"),
                    "lon": cam.get("lon"),
                    "provider": cam.get("provider"),
                    "name": cam.get("name", "Camera"),
                }
                for cam in cameras[:2000]  # Limit to 2000 cameras for initial load
            ]

            payload = {
                "source": "CameraNet",
                "cameras": metadata,
                "count": len(metadata),
                "total": len(cameras),
                "providers": providers_used,
                "lightweight": True,
                "truncated": len(cameras) > 2000,
                "generated": int(time.time()),
                "bbox": bbox_str if bbox_str else None,
            }
            
            CAMERA_RESPONSE_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
            if len(CAMERA_RESPONSE_CACHE) > 100:
                oldest_key = min(CAMERA_RESPONSE_CACHE, key=lambda key: CAMERA_RESPONSE_CACHE[key]["timestamp"])
                CAMERA_RESPONSE_CACHE.pop(oldest_key, None)
            
            self.send_json(payload, cache_seconds=180)
        except Exception as e:
            print(f"CameraNet metadata error: {e}")
            self.send_json({
                "source": "CameraNet",
                "error": str(e),
                "cameras": [],
                "count": 0,
                "lightweight": True,
            }, cache_seconds=10)

    def proxy_cameras(self):
        """CameraNet endpoint - returns region-filtered cameras from real providers."""
        if not CAMERANET_AVAILABLE:
            self.send_json({
                "source": "CameraNet",
                "mode": "error",
                "error": "Camera providers not available",
                "count": 0,
                "cameras": [],
                "providers": [],
                "generated": int(time.time()),
            }, cache_seconds=10)
            return

        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        bbox_str = (params.get("bbox") or [""])[0]
        bbox = None
        if bbox_str:
            try:
                parts = [float(p) for p in bbox_str.split(",")]
                if len(parts) == 4:
                    bbox = tuple(parts)  # (west, south, east, north)
            except ValueError:
                pass

        requested_provider = (params.get("provider") or ["all"])[0]
        provider_filter = None if requested_provider == "all" else requested_provider
        requested_state = (params.get("state") or [""])[0].strip().upper()
        state_filter = requested_state or ("FL" if provider_filter == "fl511" else None)

        try:
            limit = max(1, min(50000, int((params.get("limit") or ["1800"])[0])))
        except ValueError:
            limit = 1800

        if bbox is None:
            limit = min(limit, 800)

        cache_key = "|".join([
            requested_provider,
            requested_state,
            bbox_str or "global",
            str(limit),
        ])
        cached = CAMERA_RESPONSE_CACHE.get(cache_key)
        if cached and time.time() - cached["timestamp"] < 180:
            self.send_json(cached["payload"], cache_seconds=45)
            return

        try:
            cameras, providers_used = get_all_cameras(bbox, provider_filter, state_filter)
            total_matches = len(cameras)
            cameras = cameras[:limit]
            CAMERA_BY_ID.update({str(camera.get("id")): camera for camera in cameras})

            payload = {
                "source": "CameraNet",
                "mode": "public_no_token",
                "count": len(cameras),
                "total": total_matches,
                "cameras": cameras,
                "providers": providers_used,
                "cached": True,
                "truncated": total_matches > len(cameras),
                "requires_bbox": bbox is None,
                "generated": int(time.time()),
                "bbox": bbox_str if bbox_str else None,
            }
            CAMERA_RESPONSE_CACHE[cache_key] = {"timestamp": time.time(), "payload": payload}
            if len(CAMERA_RESPONSE_CACHE) > 80:
                oldest_key = min(CAMERA_RESPONSE_CACHE, key=lambda key: CAMERA_RESPONSE_CACHE[key]["timestamp"])
                CAMERA_RESPONSE_CACHE.pop(oldest_key, None)
            self.send_json(payload, cache_seconds=120)
        except Exception as e:
            print(f"CameraNet error: {e}")
            self.send_json({
                "source": "CameraNet",
                "mode": "error",
                "error": str(e),
                "count": 0,
                "cameras": [],
                "providers": [],
                "generated": int(time.time()),
            }, cache_seconds=10)

    def proxy_camera_providers(self):
        """Return available camera providers and their status"""
        if not CAMERANET_AVAILABLE:
            self.send_json({
                "source": "CameraNet",
                "error": "CameraNet not available",
                "providers": []
            })
            return
        
        try:
            status = get_provider_status()
            self.send_json({
                "source": "CameraNet",
                "providers": status,
                "generated": int(time.time()),
            })
        except Exception as e:
            self.send_json({
                "source": "CameraNet",
                "error": str(e),
                "providers": [],
            })

    def refresh_camera_cache(self):
        """Force CameraNet provider cache refresh."""
        if not CAMERANET_AVAILABLE:
            self.send_json({"source": "CameraNet", "mode": "error", "error": "CameraNet not available"}, status=503)
            return

        try:
            for provider in CAMERA_PROVIDERS.values():
                provider.cache = {"timestamp": 0, "data": []}

            CAMERA_RESPONSE_CACHE.clear()
            cameras, providers_used = get_all_cameras(None, None, None)
            CAMERA_BY_ID.clear()
            CAMERA_BY_ID.update({str(camera.get("id")): camera for camera in cameras})
            self.send_json({
                "source": "CameraNet",
                "mode": "refreshed",
                "count": len(cameras),
                "providers": providers_used,
                "generated": int(time.time()),
            }, cache_seconds=5)
        except Exception as error:
            self.send_json({
                "source": "CameraNet",
                "mode": "error",
                "error": type(error).__name__,
                "message": str(error),
                "generated": int(time.time()),
            }, status=500, cache_seconds=5)

    def proxy_camera_snapshot(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        camera_id = (params.get("id") or [""])[0]
        camera = find_camera_record(camera_id)
        raw_id = canonical_camera_id(camera_id)
        upstream = ""

        if camera:
            upstream = camera.get("upstream_snapshot_url") or camera.get("snapshot_source_url") or ""

        if not upstream and CAMERANET_AVAILABLE:
            try:
                resolved = resolve_camera_provider_stream(camera_id)
                if resolved:
                    if camera:
                        camera.update({key: value for key, value in resolved.items() if value or key == "metadata"})
                    else:
                        camera = resolved
                    CAMERA_BY_ID[str(camera.get("id") or camera_id)] = camera
                    upstream = camera.get("upstream_snapshot_url") or camera.get("snapshot_source_url") or ""
            except Exception:
                upstream = ""

        if not upstream and raw_id and (str(camera_id).startswith("fl511-") or "-" not in str(camera_id)):
            upstream = f"https://fl511.com/map/Cctv/{quote(raw_id, safe='')}"

        if not upstream:
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            payload = camera_frame_svg({"id": camera_id, "name": "Camera feed", "lat": 0, "lon": 0, "provider": "FL511", "category": "snapshot", "status": "unavailable"}, 0)
            self.send_header("Cache-Control", "private, max-age=10")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)
            return

        try:
            request = Request(upstream, headers={
                "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
                "Referer": "https://fl511.com/",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            })
            with urlopen(request, timeout=12) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "image/jpeg")

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "private, max-age=15")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)
        except Exception:
            payload = camera_frame_svg(camera or {"id": camera_id, "name": "Camera feed", "lat": 0, "lon": 0, "provider": "FL511", "category": "snapshot", "status": "unavailable"}, 0)
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Cache-Control", "private, max-age=10")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)

    def is_allowed_hls_url(self, upstream_url):
        parsed = urlparse(upstream_url)
        host = (parsed.hostname or "").lower()
        return (
            parsed.scheme == "https"
            and (
                host == "divas.cloud"
                or host.endswith(".divas.cloud")
                or host.endswith(".dot.ca.gov")
                or host.endswith(".its.nv.gov")
                or host.endswith(".navigator.dot.ga.gov")
                or host.endswith(".maryland.gov")
                or host.endswith(".dot.wi.gov")
                or host.endswith(".dotd.la.gov")
                or host.endswith(".skyvdn.com")
            )
        )

    def rewrite_hls_playlist(self, payload, upstream_url, camera_id=None):
        text = payload.decode("utf-8", "ignore")

        def proxied_url(absolute):
            local = "/camera/hls?url=" + quote(absolute, safe="")
            if camera_id:
                local += "&cid=" + quote(camera_id, safe="")
            return local

        def rewrite_uri(match):
            absolute = urljoin(upstream_url, match.group(1))
            if not self.is_allowed_hls_url(absolute):
                return match.group(0)
            return 'URI="' + proxied_url(absolute) + '"'

        rewritten = []
        for line in text.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                absolute = urljoin(upstream_url, stripped)
                if self.is_allowed_hls_url(absolute):
                    line = proxied_url(absolute)
            elif "URI=\"" in line:
                line = re.sub(r'URI="([^"]+)"', rewrite_uri, line)
            rewritten.append(line)

        return ("\n".join(rewritten) + "\n").encode("utf-8")

    def proxy_camera_hls(self):
        """Same-origin HLS proxy for FL511/Divas playlists and media segments."""
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        camera_id = (params.get("id") or params.get("cid") or [""])[0]
        upstream_url = unquote((params.get("url") or [""])[0])

        try:
            if not upstream_url and camera_id:
                upstream_url = resolve_fl511_hls(camera_id)["stream_url"]

            if not upstream_url or not self.is_allowed_hls_url(upstream_url):
                self.send_response(400)
                payload = b"Invalid CameraNet HLS URL"
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.write_payload(payload)
                return

            def fetch_hls(url):
                request = Request(url, headers={
                    "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
                    "Referer": "https://fl511.com/",
                    "Origin": "https://fl511.com",
                    "Accept": "*/*",
                })
                with urlopen(request, timeout=18) as response:
                    return response.read(), response.headers.get("Content-Type", "")

            try:
                payload, content_type = fetch_hls(upstream_url)
            except HTTPError as error:
                if error.code not in (401, 403, 404, 410, 429, 500, 502, 503, 504) or not camera_id:
                    raise

                fresh = resolve_fl511_hls(camera_id)["stream_url"]
                fresh_token = (parse_qs(urlparse(fresh).query).get("token") or [""])[0]
                if not fresh_token:
                    raise

                parsed_upstream = urlparse(upstream_url)
                query = parse_qs(parsed_upstream.query)
                query["token"] = [fresh_token]
                upstream_url = urlunparse(parsed_upstream._replace(query=urlencode(query, doseq=True)))
                payload, content_type = fetch_hls(upstream_url)
            except (URLError, TimeoutError):
                if not camera_id:
                    raise
                fresh = resolve_fl511_hls(camera_id)["stream_url"]
                fresh_token = (parse_qs(urlparse(fresh).query).get("token") or [""])[0]
                if not fresh_token:
                    raise
                parsed_upstream = urlparse(upstream_url)
                query = parse_qs(parsed_upstream.query)
                query["token"] = [fresh_token]
                upstream_url = urlunparse(parsed_upstream._replace(query=urlencode(query, doseq=True)))
                payload, content_type = fetch_hls(upstream_url)

            is_playlist = (
                ".m3u8" in urlparse(upstream_url).path
                or "mpegurl" in content_type.lower()
                or payload.startswith(b"#EXTM3U")
            )

            if is_playlist:
                payload = self.rewrite_hls_playlist(payload, upstream_url, camera_id)
                content_type = "application/vnd.apple.mpegurl"
                cache_seconds = 3
            else:
                content_type = content_type or "video/mp2t"
                cache_seconds = 12

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", f"private, max-age={cache_seconds}")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)
        except Exception as error:
            path = urlparse(upstream_url).path if upstream_url else ""
            is_playlist = self.path.startswith("/camera/hls?id=") or path.endswith(".m3u8")
            if is_playlist:
                payload = b"#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-ENDLIST\n"
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                self.send_header("X-Orion-HLS-Fallback", type(error).__name__)
            else:
                payload = b""
                self.send_response(204)
                self.send_header("Content-Type", "video/mp2t")
                self.send_header("X-Orion-HLS-Fallback", type(error).__name__)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.write_payload(payload)

    def resolve_camera_stream(self):
        """Resolve FL511 tokenized HLS URL only after the user selects a camera."""
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        provider = "fl511"
        camera_id = (params.get("id") or params.get("camera_id") or [""])[0]

        if self.path.startswith("/api/camera/stream/"):
            parts = parsed.path.split("/")
            if len(parts) >= 6:
                provider = parts[4]
                camera_id = parts[5]

        if provider == "fl511" and "-" in camera_id and not camera_id.startswith("fl511-"):
            provider = camera_id.split("-", 1)[0]

        camera = find_camera_record(camera_id)
        if camera and provider != "fl511":
            upstream_url = camera.get("upstream_stream_url") or ""
            if not upstream_url and CAMERANET_AVAILABLE:
                try:
                    resolved = resolve_camera_provider_stream(camera_id)
                    if resolved:
                        camera.update({key: value for key, value in resolved.items() if value or key == "metadata"})
                        CAMERA_BY_ID[str(camera.get("id") or camera_id)] = camera
                        upstream_url = camera.get("upstream_stream_url") or ""
                except Exception:
                    upstream_url = ""

            if not upstream_url or not self.is_allowed_hls_url(upstream_url):
                self.send_json({
                    "ok": False,
                    "source": "CameraNet resolver",
                    "mode": "error",
                    "error": "Stream unavailable",
                    "message": "This provider did not expose a browser-playable HLS stream for the selected camera.",
                    "snapshot_url": camera.get("snapshot_url") or "",
                    "generated": int(time.time()),
                }, status=200, cache_seconds=10)
                return

            self.send_json({
                "ok": True,
                "source": "CameraNet resolver",
                "mode": "live_hls",
                "provider": camera.get("provider") or provider,
                "camera_id": camera.get("id") or camera_id,
                "upstream_stream_url": upstream_url,
                "stream_url": "/camera/hls?url=" + quote(upstream_url, safe="") + "&cid=" + quote(camera.get("id") or camera_id, safe=""),
                "snapshot_url": camera.get("snapshot_url") or "",
                "generated": int(time.time()),
            }, cache_seconds=45)
            return

        if provider != "fl511":
            self.send_json({
                "source": "CameraNet",
                "mode": "error",
                "error": "Provider not supported for stream resolution",
                "provider": provider,
            }, status=400, cache_seconds=5)
            return

        try:
            payload = resolve_fl511_hls(camera_id)
            prefixed_id = "fl511-" + payload["camera_id"]
            upstream_url = payload.get("stream_url") or ""
            payload["ok"] = True
            payload["upstream_stream_url"] = upstream_url
            payload["stream_url"] = "/camera/hls?id=" + quote(prefixed_id, safe="")
            payload["source"] = "CameraNet FL511 resolver"
            payload["mode"] = "live_hls"
            payload["snapshot_url"] = f"/camera/snapshot?id={quote(prefixed_id, safe='')}"
            self.send_json(payload, cache_seconds=45)
        except HTTPError as error:
            self.send_json({
                "ok": False,
                "source": "CameraNet FL511 resolver",
                "mode": "error",
                "error": f"HTTP {error.code}",
                "message": "FL511 temporarily rejected the stream token request",
                "snapshot_url": f"/camera/snapshot?id=fl511-{quote(canonical_camera_id(camera_id), safe='')}",
                "generated": int(time.time()),
            }, status=200, cache_seconds=5)
        except (URLError, TimeoutError) as error:
            self.send_json({
                "ok": False,
                "source": "CameraNet FL511 resolver",
                "mode": "error",
                "error": type(error).__name__,
                "message": str(error),
                "snapshot_url": f"/camera/snapshot?id=fl511-{quote(canonical_camera_id(camera_id), safe='')}",
                "generated": int(time.time()),
            }, status=200, cache_seconds=5)
        except Exception as error:
            self.send_json({
                "ok": False,
                "source": "CameraNet FL511 resolver",
                "mode": "error",
                "error": type(error).__name__,
                "message": str(error),
                "snapshot_url": f"/camera/snapshot?id=fl511-{quote(canonical_camera_id(camera_id), safe='')}",
                "generated": int(time.time()),
            }, status=200, cache_seconds=5)

    def cached_feed(self, key, ttl):
        cached = FEED_CACHE.get(key)

        if not cached:
            return None

        if time.time() - cached["timestamp"] > ttl:
            return None

        return cached["payload"]

    def cached_feed_stale(self, key, max_age):
        cached = FEED_CACHE.get(key)

        if not cached:
            return None

        age = time.time() - cached["timestamp"]
        if age > max_age:
            return None

        payload = dict(cached["payload"])
        payload["cached"] = True
        payload["stale"] = True
        payload["stale_age_seconds"] = int(age)
        payload["mode"] = "degraded"
        payload["provider_health"] = "degraded"
        payload["fallback"] = False
        return payload

    def store_cached_feed(self, key, payload):
        FEED_CACHE[key] = {
            "timestamp": time.time(),
            "payload": payload,
        }

    def fetch_adsb_point_payload(self):
        seen = set()
        states = []
        provider_used = None
        generated = int(time.time())
        last_error = None

        for provider_url in ADSB_POINT_PROVIDERS:
            provider_states = []
            provider_name = "adsb.lol" if "adsb.lol" in provider_url else "airplanes.live"

            for area_name, lat, lon, radius in ADSB_SAMPLE_POINTS:
                try:
                    url = provider_url.format(lat=lat, lon=lon, radius=radius)
                    request = Request(url, headers={
                        "User-Agent": "Project-Orion/1.0 (local aircraft visualization)",
                        "Accept": "application/json",
                    })
                    with urlopen(request, timeout=4) as response:
                        upstream = json.loads(response.read().decode("utf-8", errors="replace"))
                except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
                    last_error = error
                    continue

                for aircraft in upstream.get("ac") or []:
                    normalized = self.normalize_adsb_aircraft(aircraft, generated, provider_name, area_name)
                    if not normalized:
                        continue
                    key = normalized.get("icao24") or f"{normalized.get('lat')},{normalized.get('lon')},{normalized.get('callsign')}"
                    if key in seen:
                        continue
                    seen.add(key)
                    provider_states.append(normalized)

                if len(provider_states) >= 1800:
                    break

            if provider_states:
                provider_used = provider_name
                states = provider_states[:8000]
                break

        if not states:
            if last_error is not None:
                raise last_error
            raise URLError("No public ADS-B point data returned")

        return {
            "source": f"{provider_used} public ADS-B point feeds",
            "mode": "public_no_token",
            "time": generated,
            "count": len(states),
            "states": states,
        }

    def normalize_adsb_aircraft(self, aircraft, generated, provider, area_name):
        lon = aircraft.get("lon")
        lat = aircraft.get("lat")

        try:
            lon = float(lon)
            lat = float(lat)
        except (TypeError, ValueError):
            return None

        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            return None

        raw_alt = aircraft.get("alt_geom")
        if raw_alt is None:
            raw_alt = aircraft.get("alt_baro")

        on_ground = str(raw_alt).lower() == "ground"
        try:
            altitude_m = 0 if on_ground else max(0.0, float(raw_alt) * 0.3048)
        except (TypeError, ValueError):
            altitude_m = 0

        try:
            velocity = float(aircraft.get("gs") or 0) * 0.514444
        except (TypeError, ValueError):
            velocity = 0

        try:
            heading = float(aircraft.get("track") or aircraft.get("true_heading") or aircraft.get("mag_heading") or 0)
        except (TypeError, ValueError):
            heading = 0

        hex_id = str(aircraft.get("hex") or "").strip()
        callsign = str(aircraft.get("flight") or aircraft.get("r") or hex_id or "ADSB").strip()

        return {
            "icao24": hex_id,
            "callsign": callsign,
            "country": aircraft.get("dbFlags") or provider,
            "timestamp": generated,
            "lon": lon,
            "lat": lat,
            "altitude": altitude_m,
            "onGround": on_ground,
            "velocity": velocity,
            "heading": heading,
            "verticalRate": aircraft.get("baro_rate"),
            "category": aircraft.get("category") or aircraft.get("t") or "aircraft",
            "registration": aircraft.get("r"),
            "aircraftType": aircraft.get("t"),
            "provider": provider,
            "coverageArea": area_name,
        }

    def normalize_aircraft_states(self, states):
        normalized = []

        for state in states:
            if len(state) < 11:
                continue

            lon = state[5]
            lat = state[6]

            if lon is None or lat is None:
                continue

            normalized.append(
                {
                    "icao24": state[0],
                    "callsign": (state[1] or state[0] or "AIRCRAFT").strip(),
                    "country": state[2],
                    "timestamp": state[3] or state[4],
                    "lon": lon,
                    "lat": lat,
                    "altitude": state[13] if len(state) > 13 and state[13] is not None else state[7],
                    "onGround": state[8],
                    "velocity": state[9],
                    "heading": state[10],
                    "verticalRate": state[11] if len(state) > 11 else None,
                    "category": state[17] if len(state) > 17 else None,
                }
            )

            if len(normalized) >= 8000:
                break

        return normalized

    def send_json(self, payload, cache_seconds=15, status=200):
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", f"private, max-age={cache_seconds}")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.write_payload(encoded)

    def log_message(self, fmt, *args):
        if self.path.startswith("/gibs/") or self.path.startswith("/live/") or self.path.startswith("/osm/") or self.path.startswith("/esri/") or self.path.startswith("/rainviewer/") or self.path.startswith("/zoom-earth/") or self.path.startswith("/camera/"):
            return

        super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("127.0.0.1", port), OrionHandler)
    print(f"Project Orion server running at http://127.0.0.1:{port}/", flush=True)
    if CAMERANET_AVAILABLE:
        threading.Thread(
            target=lambda: get_all_cameras((-125.2, 24.1, -66.7, 49.6), None, None),
            name="orion-cameranet-prewarm",
            daemon=True,
        ).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
