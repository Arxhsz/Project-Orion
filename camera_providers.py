
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
import json
import time
import gzip
import re
import html
import math
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError


STATE_NAME_TO_CODE = {
    "Hawaii": "HI", "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}


def state_bbox_intersects(left, right):
    if not left or not right:
        return True
    west, south, east, north = left
    other_west, other_south, other_east, other_north = right
    return not (east < other_west or west > other_east or north < other_south or south > other_north)


def fetch_json(url, timeout=20, data=None, referer=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
        "Accept": "application/json,text/javascript,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
        headers["X-Requested-With"] = "XMLHttpRequest"

    request = Request(url, data=data, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        payload = response.read()

    if payload[:2] == b"\x1f\x8b" or (response.headers.get("Content-Encoding") or "").lower() == "gzip":
        payload = gzip.decompress(payload)

    text = payload.decode("utf-8", errors="replace").strip()
    if text and not text.startswith(("{", "[")) and "(" in text and text.endswith(")"):
        text = text[text.find("(") + 1:-1]
    return json.loads(text)


def fetch_text(url, timeout=20, referer=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Project Orion CameraNet)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    request = Request(url, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        payload = response.read()
    if payload[:2] == b"\x1f\x8b":
        payload = gzip.decompress(payload)
    return payload.decode("utf-8", errors="replace")


def strip_markup(value):
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    return " ".join(html.unescape(text).split())


def parse_wkt_point(raw):
    text = str(raw or "")
    match = re.search(r"POINT\s*\(\s*([-0-9.]+)\s+([-0-9.]+)\s*\)", text, re.I)
    if not match:
        return None, None
    return float(match.group(1)), float(match.group(2))


def proxied_snapshot(camera_id, upstream_url):
    if not upstream_url:
        return "", ""
    return f"/camera/snapshot?id={camera_id}", upstream_url


class CameraProvider:
    
    def __init__(self):
        self.name = "Unknown"
        self.id = "unknown"
        self.supports_bbox = False
        self.state_bbox = None
        self.cache = {"timestamp": 0, "data": []}
        self.cache_ttl = 600
        self.health = "unknown"
        self.last_error = None
        self.last_success = None
        self.last_failure = None
        self.consecutive_failures = 0
        self.consecutive_successes = 0
        self.stale_ttl = 24 * 60 * 60
    
    def fetch_cameras(self, bbox=None):
        raise NotImplementedError
    
    def normalize_camera(self, raw_camera):
        raise NotImplementedError

    def get_cameras(self, bbox=None):
        if bbox and self.state_bbox and not state_bbox_intersects(bbox, self.state_bbox):
            return []

        now = time.time()
        if now - self.cache["timestamp"] < self.cache_ttl and self.cache["data"]:
            cameras = self.cache["data"]
        else:
            try:
                raw_cameras = self.fetch_cameras(bbox)
                cameras = []
                for raw_camera in raw_cameras:
                    if not raw_camera:
                        continue
                    normalized = self.normalize_camera(raw_camera)
                    if normalized:
                        cameras.append(normalized)
                self.cache = {"timestamp": now, "data": cameras}
                self.health = "online" if cameras else "empty"
                self.last_error = None
                self.last_success = now
                self.consecutive_failures = 0
                self.consecutive_successes += 1
            except Exception as e:
                print(f"Error fetching {self.name}: {e}")
                self.health = "degraded" if self.cache.get("data") else "offline"
                self.last_error = str(e)
                self.last_failure = now
                self.consecutive_failures += 1
                self.consecutive_successes = 0

                if self.cache.get("data") and now - self.cache["timestamp"] < self.stale_ttl:
                    cameras = self.cache["data"]
                else:
                    return []
        
        if bbox and not self.supports_bbox and cameras:
            west, south, east, north = bbox
            cameras = [c for c in cameras if west <= c["lon"] <= east and south <= c["lat"] <= north]
        
        return cameras


class FL511Provider(CameraProvider):
    
    def __init__(self):
        super().__init__()
        self.name = "Florida 511"
        self.id = "fl511"
        self.supports_bbox = False
        self.state_bbox = (-87.8, 24.1, -79.5, 31.2)
        self.layer_url = "https://services.arcgis.com/3wFbqsFPLeKqOlIK/ArcGIS/rest/services/FL511_Traffic_Cameras/FeatureServer/0"
        self.cache_ttl = 300
    
    def fetch_cameras(self, bbox=None):
        cameras = []
        offset = 0
        page_size = 2000

        while True:
            query = (
                f"{self.layer_url}/query?where=1%3D1&outFields=*&f=json"
                f"&returnGeometry=true&outSR=4326&resultRecordCount={page_size}"
                f"&resultOffset={offset}"
            )
            request = Request(query, headers={
                "User-Agent": "Project-Orion/1.0",
                "Accept": "application/json",
            })

            with urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8", errors="replace"))

            batch = data.get("features") or []
            cameras.extend(batch)

            if len(batch) < page_size:
                break

            offset += page_size

        print(f"FL511: Fetched {len(cameras)} cameras from public ArcGIS")
        return cameras
    
    def normalize_camera(self, raw):
        try:
            attrs = raw.get("attributes") or {}
            geom = raw.get("geometry") or {}
            camera_id = str(attrs.get("ID") or attrs.get("OBJECTID_1") or attrs.get("OBJECTID") or "").strip()
            lat = float(attrs.get("LATITUDE") if attrs.get("LATITUDE") is not None else geom.get("y"))
            lon = float(attrs.get("LONGITUDE") if attrs.get("LONGITUDE") is not None else geom.get("x"))
            snapshot_url = (attrs.get("IMAGE") or "").strip()
            road = (attrs.get("HIGHWAY") or "").strip()
            direction = (attrs.get("DIRECTION") or "").strip()
            county = (attrs.get("COUNTY") or "").strip()
            
            return {
                "id": f"fl511-{camera_id}",
                "name": (attrs.get("DESCRIPT") or f"FL511 Camera {camera_id}").strip(),
                "provider": "FL511",
                "state": "FL",
                "country": "US",
                "district": "",
                "county": county,
                "lat": lat,
                "lon": lon,
                "category": "highway",
                "road": road,
                "direction": direction,
                "status": "stream_available" if snapshot_url else "unknown",
                "snapshot_url": f"/camera/snapshot?id=fl511-{camera_id}",
                "upstream_snapshot_url": snapshot_url,
                "stream_url": f"/camera/resolve?id=fl511-{camera_id}",
                "stream_available": True,
                "stream_type": "hls",
                "last_updated": attrs.get("TIMESTAMP") or "",
                "source_url": self.layer_url,
                "metadata": {
                    "imageId": camera_id,
                    "hasVideo": True,
                    "district": "",
                    "county": county,
                    "raw": attrs,
                }
            }
        except Exception as e:
            print(f"Error normalizing FL511 camera: {e}")
            return None


class NYCDOTProvider(CameraProvider):
    
    def __init__(self):
        super().__init__()
        self.name = "NYC DOT"
        self.id = "nycdot"
        self.supports_bbox = False
        self.api_url = "https://webcams.nyctmc.org/api/cameras"
    
    def fetch_cameras(self, bbox=None):
        data = fetch_json(self.api_url, timeout=15)
        return data if isinstance(data, list) else data.get("cameras", [])

    def normalize_camera(self, raw):
        try:
            return {
                "id": f"nycdot-{raw.get('id', 'unknown')}",
                "name": raw.get("name", "NYC Camera"),
                "provider": "NYC DOT",
                "state": "NY",
                "country": "US",
                "lat": float(raw.get("lat", raw.get("latitude"))),
                "lon": float(raw.get("lon", raw.get("longitude"))),
                "category": "traffic",
                "road": raw.get("road", ""),
                "direction": "",
                "city": "New York City",
                "county": raw.get("area"),
                "status": "snapshot_only",
                "snapshot_url": raw.get("imageUrl", ""),
                "upstream_snapshot_url": raw.get("imageUrl", ""),
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://webcams.nyctmc.org",
                "metadata": raw
            }
        except Exception as e:
            return None


class CaliforniaDOTProvider(CameraProvider):
    
    def __init__(self):
        super().__init__()
        self.name = "Caltrans"
        self.id = "caltrans"
        self.supports_bbox = False
        self.state_bbox = (-124.6, 32.3, -114.1, 42.1)
        self.api_url = "https://cwwp2.dot.ca.gov/data/d11/cctv/cctvStatusD11.json"
    
    def fetch_cameras(self, bbox=None):
        all_cameras = []
        districts = [
            (f"d{district}", f"https://cwwp2.dot.ca.gov/data/d{district}/cctv/cctvStatusD{district:02d}.json")
            for district in range(1, 13)
        ]
        
        def load_district(district_id, url):
            try:
                data = fetch_json(url, timeout=15, referer="https://cwwp2.dot.ca.gov/")
                return data.get("data", []) if isinstance(data, dict) else []
            except Exception as e:
                print(f"Caltrans {district_id} error: {e}")
                return []

        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = [executor.submit(load_district, district_id, url) for district_id, url in districts]
            for future in as_completed(futures):
                all_cameras.extend(future.result())
        
        return all_cameras
    
    def normalize_camera(self, raw):
        try:
            cctv = raw.get("cctv", raw)
            location = cctv.get("location", {})
            image_data = cctv.get("imageData", {})
            static_data = image_data.get("static", {})
            index = str(cctv.get("index") or raw.get("index") or raw.get("id") or "unknown").strip()
            district = str(location.get("district") or "").strip()
            camera_id = f"caltrans-d{district}-{index}" if district else f"caltrans-{index}"
            snapshot_url, upstream_snapshot_url = proxied_snapshot(camera_id, static_data.get("currentImageURL", raw.get("imageURL", "")))
            upstream_stream_url = image_data.get("streamingVideoURL", raw.get("streamingVideoURL", ""))
            return {
                "id": camera_id,
                "name": location.get("locationName") or raw.get("location", raw.get("name", "Caltrans Camera")),
                "provider": "Caltrans",
                "state": "CA",
                "country": "US",
                "lat": float(location.get("latitude", raw.get("latitude", raw.get("lat", 0)))),
                "lon": float(location.get("longitude", raw.get("longitude", raw.get("lon", 0)))),
                "category": "highway",
                "road": location.get("route", ""),
                "direction": location.get("direction", raw.get("direction", "")),
                "status": "stream_available" if upstream_stream_url else ("snapshot_only" if upstream_snapshot_url else "unknown"),
                "snapshot_url": snapshot_url,
                "upstream_snapshot_url": upstream_snapshot_url,
                "stream_url": f"/camera/resolve?id={camera_id}" if upstream_stream_url else "",
                "upstream_stream_url": upstream_stream_url,
                "stream_type": "hls" if upstream_stream_url else "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://cwwp2.dot.ca.gov",
                "metadata": {
                    "district": district,
                    "county": location.get("county", ""),
                    "nearbyPlace": location.get("nearbyPlace", ""),
                    "raw": raw,
                }
            }
        except Exception as e:
            return None


class TexasDOTProvider(CameraProvider):
    
    def __init__(self):
        super().__init__()
        self.name = "TxDOT"
        self.id = "txdot"
        self.supports_bbox = False
        self.api_url = "https://its.txdot.gov/ITS_WEB/FrontEnd/default.html"
    
    def fetch_cameras(self, bbox=None):
        return self._get_fallback_texas()
    
    def _get_fallback_texas(self):
        return [
            {"id": "1", "name": "I-35 @ Austin Downtown", "lat": 30.2672, "lon": -97.7431},
            {"id": "2", "name": "I-10 @ Houston Downtown", "lat": 29.7604, "lon": -95.3698},
            {"id": "3", "name": "I-35E @ Dallas Downtown", "lat": 32.7767, "lon": -96.7970},
            {"id": "4", "name": "I-10 @ San Antonio", "lat": 29.4241, "lon": -98.4936},
            {"id": "5", "name": "I-45 @ Houston North", "lat": 29.8833, "lon": -95.4011},
            {"id": "6", "name": "I-35 @ Austin North", "lat": 30.3922, "lon": -97.7431},
            {"id": "7", "name": "I-635 @ Dallas", "lat": 32.9265, "lon": -96.8353},
            {"id": "8", "name": "US-290 @ Houston", "lat": 29.7863, "lon": -95.5927},
        ]
    
    def normalize_camera(self, raw):
        try:
            return {
                "id": f"txdot-{raw.get('id', 'unknown')}",
                "name": raw.get("name", "TxDOT Camera"),
                "provider": "TxDOT",
                "state": "TX",
                "country": "US",
                "lat": float(raw.get("lat", 0)),
                "lon": float(raw.get("lon", 0)),
                "category": "highway",
                "road": "",
                "direction": "",
                "status": "online",
                "snapshot_url": "",
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://its.txdot.gov",
                "metadata": raw
            }
        except Exception as e:
            return None


class GeorgiaDOTProvider(CameraProvider):
    
    def __init__(self):
        super().__init__()
        self.name = "Georgia NaviGAtor"
        self.id = "gdot"
        self.supports_bbox = False
        self.api_url = "https://511ga.org/api/v2/get/cameras"
    
    def fetch_cameras(self, bbox=None):
        try:
            request = Request(self.api_url, headers={"User-Agent": "Project-Orion/1.0"})
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
            return data if isinstance(data, list) else []
        except:
            return self._get_fallback_georgia()
    
    def _get_fallback_georgia(self):
        return [
            {"id": "1", "name": "I-85 @ Atlanta Downtown", "lat": 33.7490, "lon": -84.3880},
            {"id": "2", "name": "I-75 @ Atlanta", "lat": 33.7676, "lon": -84.4200},
            {"id": "3", "name": "I-285 @ Perimeter", "lat": 33.9137, "lon": -84.3350},
            {"id": "4", "name": "I-20 @ Atlanta", "lat": 33.7490, "lon": -84.3880},
        ]
    
    def normalize_camera(self, raw):
        try:
            return {
                "id": f"gdot-{raw.get('id', 'unknown')}",
                "name": raw.get("name", "GDOT Camera"),
                "provider": "Georgia NaviGAtor",
                "state": "GA",
                "country": "US",
                "lat": float(raw.get("lat", raw.get("latitude", 0))),
                "lon": float(raw.get("lon", raw.get("longitude", 0))),
                "category": "highway",
                "road": raw.get("road", ""),
                "direction": "",
                "status": "online",
                "snapshot_url": raw.get("url", ""),
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://511ga.org",
                "metadata": raw
            }
        except Exception as e:
            return None


class ChicagoOpenDataProvider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Chicago Open Data"
        self.id = "chicago"
        self.state_bbox = (-88.1, 41.55, -87.4, 42.05)
        self.api_url = "https://data.cityofchicago.org/resource/thvf-6diy.json?$limit=1000"
    
    def fetch_cameras(self, bbox=None):
        try:
            request = Request(self.api_url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
            print(f"Chicago: Fetched {len(data)} cameras")
            return data if isinstance(data, list) else []
        except Exception as e:
            print(f"Chicago fetch error: {e}")
            return []
    
    def normalize_camera(self, raw):
        try:
            return {
                "id": f"chicago-{raw.get('intersection', 'unknown').replace(' ', '-')}",
                "name": f"Chicago {raw.get('intersection', 'Camera')}",
                "provider": "Chicago Open Data",
                "state": "IL",
                "country": "US",
                "lat": float(raw.get("latitude", 0)),
                "lon": float(raw.get("longitude", 0)),
                "category": "traffic",
                "road": raw.get("intersection", ""),
                "direction": raw.get("first_approach", ""),
                "status": "online",
                "snapshot_url": "",
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://data.cityofchicago.org",
                "metadata": raw
            }
        except Exception as e:
            print(f"Error normalizing Chicago camera: {e}")
            return None


class IowaDOTProvider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Iowa DOT"
        self.id = "iowa"
        self.api_url = "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/CCTV_View/FeatureServer/0/query?where=1=1&outFields=*&f=json&outSR=4326"
    
    def fetch_cameras(self, bbox=None):
        try:
            request = Request(self.api_url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
            features = data.get("features", [])
            print(f"Iowa: Fetched {len(features)} cameras")
            return features
        except Exception as e:
            print(f"Iowa fetch error: {e}")
            return []
    
    def normalize_camera(self, raw):
        try:
            attrs = raw.get("attributes", {})
            geom = raw.get("geometry", {})
            return {
                "id": f"iowa-{attrs.get('OBJECTID', 'unknown')}",
                "name": attrs.get("CAMERANAME", "Iowa Camera"),
                "provider": "Iowa DOT",
                "state": "IA",
                "country": "US",
                "lat": float(geom.get("y", 0)),
                "lon": float(geom.get("x", 0)),
                "category": "highway",
                "road": attrs.get("ROUTE", ""),
                "direction": "",
                "status": "online",
                "snapshot_url": attrs.get("IMAGEURL", ""),
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://511ia.org",
                "metadata": attrs
            }
        except Exception as e:
            print(f"Error normalizing Iowa camera: {e}")
            return None


class MarylandDOTProvider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Maryland DOT"
        self.id = "maryland"
        self.state_bbox = (-79.6, 37.8, -74.9, 39.9)
        self.api_url = "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getCameraMapDataJSON.do"
    
    def fetch_cameras(self, bbox=None):
        try:
            data = fetch_json(self.api_url, timeout=20, referer="https://chart.maryland.gov/DataFeeds/GetDataFeeds")
            cameras = data.get("data", []) if isinstance(data, dict) else []
            print(f"Maryland: Fetched {len(cameras)} cameras")
            return cameras
        except Exception as e:
            print(f"Maryland fetch error: {e}")
            return []
    
    def normalize_camera(self, raw):
        try:
            camera_id = f"maryland-{raw.get('id', 'unknown')}"
            video_host = raw.get("cctvIp") or ""
            upstream_stream_url = f"https://{video_host}/rtplive/{raw.get('id')}/playlist.m3u8" if video_host and raw.get("id") else ""
            return {
                "id": camera_id,
                "name": raw.get("name", "Maryland Camera"),
                "provider": "Maryland DOT",
                "state": "MD",
                "country": "US",
                "lat": float(raw.get("lat", raw.get("latitude", 0))),
                "lon": float(raw.get("lon", raw.get("longitude", 0))),
                "category": "highway",
                "road": " ".join([str(raw.get("routePrefix") or ""), str(raw.get("routeNumber") or ""), str(raw.get("routeSuffix") or "")]).strip(),
                "direction": "",
                "status": "stream_available" if upstream_stream_url else "unknown",
                "snapshot_url": "",
                "stream_url": f"/camera/resolve?id={camera_id}" if upstream_stream_url else "",
                "upstream_stream_url": upstream_stream_url,
                "stream_type": "hls" if upstream_stream_url else "snapshot",
                "last_updated": raw.get("lastCachedDataUpdateTime") or int(time.time()),
                "source_url": raw.get("publicVideoURL") or "https://chart.maryland.gov",
                "metadata": raw
            }
        except Exception as e:
            print(f"Error normalizing Maryland camera: {e}")
            return None


class Iteris511Provider(CameraProvider):

    def __init__(self, provider_id, name, state_code, base_url, state_bbox, use_map_icons=False):
        super().__init__()
        self.id = provider_id
        self.name = name
        self.state_code = state_code
        self.base_url = base_url.rstrip("/")
        self.state_bbox = state_bbox
        self.use_map_icons = use_map_icons
        self.api_url = self.base_url + "/List/GetData/Cameras"
        self.cache_ttl = 420

    def fetch_cameras(self, bbox=None):
        if self.use_map_icons:
            data = fetch_json(self.base_url + "/map/mapIcons/Cameras", timeout=25, referer=self.base_url)
            cameras = data.get("item2", []) if isinstance(data, dict) else []
            print(f"{self.name}: Fetched {len(cameras)} camera map icons")
            return cameras

        cameras = []
        start = 0
        page_size = 100
        total = None
        failures = 0

        while True:
            form = urlencode({
                "draw": "1",
                "start": str(start),
                "length": str(page_size),
                "search[value]": "",
                "search[regex]": "false",
            }).encode("utf-8")
            try:
                data = fetch_json(self.api_url, timeout=25, data=form, referer=self.base_url + "/list/cameras")
            except Exception:
                failures += 1
                if cameras and failures <= 4:
                    start += page_size
                    if total and start >= int(total):
                        break
                    continue
                if cameras:
                    break
                raise
            batch = data.get("data", []) if isinstance(data, dict) else []
            total = data.get("recordsFiltered") or data.get("recordsTotal") or total
            failures = 0
            cameras.extend(batch)

            if not batch:
                break

            start += len(batch)
            if total and start >= int(total):
                break

        print(f"{self.name}: Fetched {len(cameras)} cameras")
        return cameras

    def normalize_camera(self, raw):
        try:
            raw_id = str(raw.get("id") or raw.get("itemId") or raw.get("DT_RowId") or "unknown")
            camera_id = f"{self.id}-{raw_id}"
            lon, lat = parse_wkt_point(((raw.get("latLng") or {}).get("geography") or {}).get("wellKnownText"))
            if lat is None or lon is None:
                loc = raw.get("location")
                if isinstance(loc, (list, tuple)) and len(loc) >= 2:
                    lat = float(loc[0])
                    lon = float(loc[1])

            if lat is None or lon is None:
                return None

            images = raw.get("images") or []
            image = images[0] if images else {}
            image_url = image.get("imageUrl") or raw.get("imageUrl") or raw.get("url") or ""
            upstream_snapshot = urljoin(self.base_url, image_url) if image_url else ""
            snapshot_url, upstream_snapshot_url = proxied_snapshot(camera_id, upstream_snapshot)
            upstream_stream_url = image.get("videoUrl") or raw.get("videoUrl") or ""
            has_stream = bool(upstream_stream_url) and not image.get("videoDisabled") and not image.get("blocked")
            image_description = strip_markup(image.get("description") or "")
            if image_description.lower() in {"n/a", "na", "none", "unknown"}:
                image_description = ""
            raw_location = raw.get("location")
            location_name = raw_location if isinstance(raw_location, str) else ""
            name = image_description or raw.get("title") or location_name or raw.get("cameraName") or raw.get("roadway") or f"{self.name} Camera {raw_id}"
            raw_state = raw.get("state")
            state_code = STATE_NAME_TO_CODE.get(raw_state, self.state_code) if isinstance(raw_state, str) else self.state_code

            return {
                "id": camera_id,
                "name": name,
                "provider": self.name,
                "state": state_code,
                "country": "US",
                "lat": float(lat),
                "lon": float(lon),
                "category": "highway",
                "road": raw.get("roadway") or "",
                "direction": raw.get("direction") or "",
                "status": "stream_available" if has_stream else ("snapshot_only" if upstream_snapshot_url else "unknown"),
                "snapshot_url": snapshot_url,
                "upstream_snapshot_url": upstream_snapshot_url,
                "stream_url": f"/camera/resolve?id={camera_id}" if has_stream else "",
                "upstream_stream_url": upstream_stream_url if has_stream else "",
                "stream_type": "hls" if has_stream else "snapshot",
                "last_updated": raw.get("lastUpdated") or int(time.time()),
                "source_url": self.base_url,
                "metadata": raw,
            }
        except Exception as e:
            print(f"Error normalizing {self.name} camera: {e}")
            return None

    def resolve_camera(self, camera_id):
        raw_id = str(camera_id or "").strip()
        prefix = self.id + "-"
        if raw_id.startswith(prefix):
            raw_id = raw_id[len(prefix):]
        if not raw_id:
            return None

        tooltip_url = f"{self.base_url}/tooltip/Cameras/{raw_id}?lang=en&noCss=true"
        page = fetch_text(tooltip_url, timeout=18, referer=self.base_url + "/map")
        video_match = re.search(r'data-videourl=["\']([^"\']+)["\']', page, re.I)
        image_match = re.search(r'data-lazy=["\']([^"\']+)["\']', page, re.I)
        image_id_match = re.search(r'data-camera-id=["\']([^"\']+)["\']', page, re.I)
        title_match = re.search(r"<strong>\s*(.*?)\s*</strong>", page, re.I | re.S)

        upstream_stream_url = html.unescape(video_match.group(1)) if video_match else ""
        image_path = html.unescape(image_match.group(1)) if image_match else ""
        if not image_path and image_id_match:
            image_path = "/map/Cctv/" + image_id_match.group(1)

        camera_key = f"{self.id}-{raw_id}"
        snapshot_url, upstream_snapshot_url = proxied_snapshot(camera_key, urljoin(self.base_url, image_path) if image_path else "")
        name = strip_markup(title_match.group(1)) if title_match else f"{self.name} Camera {raw_id}"

        return {
            "id": camera_key,
            "name": name,
            "provider": self.name,
            "state": self.state_code,
            "country": "US",
            "status": "stream_available" if upstream_stream_url else ("snapshot_only" if upstream_snapshot_url else "unknown"),
            "snapshot_url": snapshot_url,
            "upstream_snapshot_url": upstream_snapshot_url,
            "stream_url": f"/camera/resolve?id={camera_key}" if upstream_stream_url else "",
            "upstream_stream_url": upstream_stream_url,
            "stream_type": "hls" if upstream_stream_url else "snapshot",
            "source_url": tooltip_url,
            "metadata": {
                "resolvedFromTooltip": True,
                "siteId": raw_id,
                "imageId": image_id_match.group(1) if image_id_match else "",
            },
        }


class Colorado511Provider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Colorado 511"
        self.id = "co511"
        self.api_url = "https://data.cotrip.org/xml/cameras.xml"
    
    def fetch_cameras(self, bbox=None):
        return []
    
    def normalize_camera(self, raw):
        return None


class Arizona511Provider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Arizona 511"
        self.id = "az511"
        self.api_url = "https://az511.gov/map/mapIcons/Cameras"
    
    def fetch_cameras(self, bbox=None):
        try:
            request = Request(self.api_url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
            return data if isinstance(data, list) else []
        except:
            return []
    
    def normalize_camera(self, raw):
        try:
            return {
                "id": f"az511-{raw.get('ID', 'unknown')}",
                "name": raw.get("Description", "AZ Camera"),
                "provider": "AZ511",
                "state": "AZ",
                "country": "US",
                "lat": float(raw.get("Latitude", 0)),
                "lon": float(raw.get("Longitude", 0)),
                "category": "highway",
                "road": raw.get("RoadwayName", ""),
                "status": "online",
                "snapshot_url": raw.get("ImageURL", ""),
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://az511.gov",
                "metadata": raw
            }
        except:
            return None


class Nevada511Provider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Nevada 511"
        self.id = "nv511"
        self.api_url = "https://www.nvroads.com/List/GetData/Cameras"
    
    def fetch_cameras(self, bbox=None):
        try:
            request = Request(self.api_url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
            return data.get("data", []) if isinstance(data, dict) else []
        except:
            return []
    
    def normalize_camera(self, raw):
        try:
            return {
                "id": f"nv511-{raw.get('id', 'unknown')}",
                "name": raw.get("name", "NV Camera"),
                "provider": "NV511",
                "state": "NV",
                "country": "US",
                "lat": float(raw.get("latitude", 0)),
                "lon": float(raw.get("longitude", 0)),
                "category": "highway",
                "road": raw.get("roadway", ""),
                "status": "online",
                "snapshot_url": raw.get("url", ""),
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://nvroads.com",
                "metadata": raw
            }
        except:
            return None


class Utah511Provider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Utah 511"
        self.id = "ut511"
        self.api_url = "https://udottraffic.utah.gov/map/mapIcons/Cameras"
    
    def fetch_cameras(self, bbox=None):
        try:
            request = Request(self.api_url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
            return data if isinstance(data, list) else []
        except:
            return []
    
    def normalize_camera(self, raw):
        try:
            return {
                "id": f"ut511-{raw.get('ID', 'unknown')}",
                "name": raw.get("Description", "UT Camera"),
                "provider": "UT511",
                "state": "UT",
                "country": "US",
                "lat": float(raw.get("Latitude", 0)),
                "lon": float(raw.get("Longitude", 0)),
                "category": "highway",
                "road": raw.get("RoadwayName", ""),
                "status": "online",
                "snapshot_url": raw.get("ImageURL", ""),
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://udottraffic.utah.gov",
                "metadata": raw
            }
        except:
            return None


class Oregon511Provider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Oregon 511"
        self.id = "or511"
        self.state_bbox = (-124.8, 41.9, -116.3, 46.4)
        self.api_url = "https://www.tripcheck.com/Scripts/map/data/cctvinventory.js"
    
    def fetch_cameras(self, bbox=None):
        try:
            request = Request(self.api_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json,text/javascript,*/*"})
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
            return data.get("features", []) if isinstance(data, dict) else []
        except Exception as error:
            print(f"Oregon fetch error: {error}")
            return []
    
    def normalize_camera(self, raw):
        try:
            attrs = raw.get("attributes", raw)
            camera_id = str(attrs.get("cameraId") or attrs.get("publishedImageId") or "unknown")
            filename = str(attrs.get("filename") or "").strip()
            upstream = f"https://tripcheck.com/RoadCams/cams/{filename}" if filename else ""
            snapshot_url, upstream_snapshot_url = proxied_snapshot(f"or511-{camera_id}", upstream)
            return {
                "id": f"or511-{camera_id}",
                "name": attrs.get("title", "Oregon Camera"),
                "provider": "Oregon 511",
                "state": "OR",
                "country": "US",
                "lat": float(attrs.get("latitude", 0)),
                "lon": float(attrs.get("longitude", 0)),
                "category": "highway",
                "road": attrs.get("route", ""),
                "status": "snapshot_only" if upstream_snapshot_url else "unknown",
                "snapshot_url": snapshot_url,
                "upstream_snapshot_url": upstream_snapshot_url,
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://tripcheck.com",
                "metadata": attrs
            }
        except:
            return None


class MichiganDOTProvider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Michigan Mi Drive"
        self.id = "midrive"
        self.state_bbox = (-90.5, 41.6, -82.1, 48.4)
        self.api_url = "https://mdotjboss.state.mi.us/MiDrive//camera/list"

    def fetch_cameras(self, bbox=None):
        data = fetch_json(self.api_url, timeout=22, referer="https://mdotjboss.state.mi.us/MiDrive/map")
        return data if isinstance(data, list) else []

    def normalize_camera(self, raw):
        try:
            county_html = raw.get("county") or ""
            image_html = raw.get("image") or ""
            lat_match = re.search(r"lat=([-0-9.]+)", county_html)
            lon_match = re.search(r"lon=([-0-9.]+)", county_html)
            id_match = re.search(r"id=(\d+)", county_html) or re.search(r'id=["\'](\d+)Img["\']', image_html)
            src_match = re.search(r'src=["\']([^"\']+)["\']', image_html)
            if not lat_match or not lon_match or not id_match:
                return None
            camera_id = f"midrive-{id_match.group(1)}"
            snapshot_url, upstream_snapshot_url = proxied_snapshot(camera_id, html.unescape(src_match.group(1)) if src_match else "")
            route = strip_markup(raw.get("route") or "")
            location = strip_markup(raw.get("location") or "")
            return {
                "id": camera_id,
                "name": (route + " " + location).strip() or f"Michigan Camera {id_match.group(1)}",
                "provider": "Michigan Mi Drive",
                "state": "MI",
                "country": "US",
                "lat": float(lat_match.group(1)),
                "lon": float(lon_match.group(1)),
                "category": "highway",
                "road": route,
                "direction": strip_markup(raw.get("direction") or ""),
                "status": "snapshot_only" if upstream_snapshot_url else "unknown",
                "snapshot_url": snapshot_url,
                "upstream_snapshot_url": upstream_snapshot_url,
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": int(time.time()),
                "source_url": "https://mdotjboss.state.mi.us/MiDrive",
                "metadata": raw
            }
        except Exception as error:
            print(f"Error normalizing Michigan camera: {error}")
            return None


class IowaDOTLiveProvider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Iowa DOT"
        self.id = "iadot"
        self.state_bbox = (-96.7, 40.3, -90.0, 43.7)
        self.layer_url = "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0"

    def fetch_cameras(self, bbox=None):
        features = []
        offset = 0
        page_size = 2000
        while True:
            query = (
                f"{self.layer_url}/query?where=1%3D1&outFields=*&returnGeometry=true"
                f"&outSR=4326&f=json&resultRecordCount={page_size}&resultOffset={offset}"
            )
            data = fetch_json(query, timeout=18, referer="https://www.511ia.org/")
            batch = data.get("features", []) if isinstance(data, dict) else []
            features.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
        return features

    def normalize_camera(self, raw):
        try:
            attrs = raw.get("attributes") or {}
            geom = raw.get("geometry") or {}
            camera_id = str(attrs.get("FID") or attrs.get("device_id") or attrs.get("COMMON_ID") or "unknown")
            snapshot_url, upstream_snapshot_url = proxied_snapshot(f"iadot-{camera_id}", attrs.get("ImageURL") or "")
            upstream_stream_url = attrs.get("VideoURL") or attrs.get("VideoURL_HD") or attrs.get("VideoURL_HB") or ""
            return {
                "id": f"iadot-{camera_id}",
                "name": attrs.get("Desc_") or attrs.get("ImageName") or f"Iowa DOT Camera {camera_id}",
                "provider": "Iowa DOT",
                "state": "IA",
                "country": "US",
                "lat": float(attrs.get("latitude") or geom.get("y")),
                "lon": float(attrs.get("longitude") or geom.get("x")),
                "category": "highway",
                "road": attrs.get("Route") or "",
                "direction": "",
                "status": "stream_available" if upstream_stream_url else ("snapshot_only" if upstream_snapshot_url else "unknown"),
                "snapshot_url": snapshot_url,
                "upstream_snapshot_url": upstream_snapshot_url,
                "stream_url": f"/camera/resolve?id=iadot-{camera_id}" if upstream_stream_url else "",
                "upstream_stream_url": upstream_stream_url,
                "stream_type": "hls" if upstream_stream_url else "snapshot",
                "last_updated": attrs.get("UpdateDate") or int(time.time()),
                "source_url": self.layer_url,
                "metadata": attrs
            }
        except Exception as error:
            print(f"Error normalizing Iowa camera: {error}")
            return None


class IllinoisDOTProvider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Illinois DOT"
        self.id = "ildot"
        self.state_bbox = (-91.6, 36.8, -87.0, 42.6)
        self.layer_url = "https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0"

    def fetch_cameras(self, bbox=None):
        features = []
        offset = 0
        page_size = 2000
        while True:
            query = (
                f"{self.layer_url}/query?where=y%20%3E%200&outFields=*&returnGeometry=true"
                f"&outSR=4326&f=json&resultRecordCount={page_size}&resultOffset={offset}"
            )
            data = fetch_json(query, timeout=18, referer="https://www.travelmidwest.com/")
            batch = data.get("features", []) if isinstance(data, dict) else []
            features.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
        return features

    def normalize_camera(self, raw):
        try:
            attrs = raw.get("attributes") or {}
            geom = raw.get("geometry") or {}
            camera_id = str(attrs.get("OBJECTID") or attrs.get("CameraLocation") or "unknown")
            snapshot_url, upstream_snapshot_url = proxied_snapshot(f"ildot-{camera_id}", attrs.get("SnapShot") or "")
            return {
                "id": f"ildot-{camera_id}",
                "name": attrs.get("CameraLocation") or f"Illinois Camera {camera_id}",
                "provider": "Illinois DOT",
                "state": "IL",
                "country": "US",
                "lat": float(attrs.get("y") or geom.get("y")),
                "lon": float(attrs.get("x") or geom.get("x")),
                "category": "highway",
                "road": "",
                "direction": attrs.get("CameraDirection") or "",
                "status": "snapshot_only" if upstream_snapshot_url else "unknown",
                "snapshot_url": snapshot_url,
                "upstream_snapshot_url": upstream_snapshot_url,
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": attrs.get("AgeInMinutes") or int(time.time()),
                "source_url": self.layer_url,
                "metadata": attrs
            }
        except Exception as error:
            print(f"Error normalizing Illinois camera: {error}")
            return None


class SeattleDOTProvider(CameraProvider):
    def __init__(self):
        super().__init__()
        self.name = "Seattle DOT"
        self.id = "sdot"
        self.state_bbox = (-122.6, 47.3, -121.9, 47.9)
        self.layer_url = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Traffic_Cameras_CDL/FeatureServer/0"

    def fetch_cameras(self, bbox=None):
        query = (
            f"{self.layer_url}/query?where=1%3D1&outFields=*&returnGeometry=true"
            "&outSR=4326&f=json&resultRecordCount=2000"
        )
        data = fetch_json(query, timeout=18, referer="https://www.seattle.gov/transportation/")
        return data.get("features", []) if isinstance(data, dict) else []

    def normalize_camera(self, raw):
        try:
            attrs = raw.get("attributes") or {}
            geom = raw.get("geometry") or {}
            camera_id = str(attrs.get("OBJECTID") or attrs.get("UNITID") or "unknown")
            snapshot_url, upstream_snapshot_url = proxied_snapshot(f"sdot-{camera_id}", (attrs.get("URL") or "").replace("http://www.seattle.gov/", "https://www.seattle.gov/"))
            return {
                "id": f"sdot-{camera_id}",
                "name": attrs.get("LOCATION") or attrs.get("NAME") or f"Seattle Camera {camera_id}",
                "provider": "Seattle DOT",
                "state": "WA",
                "country": "US",
                "lat": float(geom.get("y")),
                "lon": float(geom.get("x")),
                "category": "traffic",
                "road": attrs.get("LOCATION") or "",
                "direction": "",
                "status": "snapshot_only" if upstream_snapshot_url else "unknown",
                "snapshot_url": snapshot_url,
                "upstream_snapshot_url": upstream_snapshot_url,
                "stream_url": "",
                "stream_type": "snapshot",
                "last_updated": attrs.get("EDIT_DATE") or int(time.time()),
                "source_url": self.layer_url,
                "metadata": attrs
            }
        except Exception as error:
            print(f"Error normalizing Seattle camera: {error}")
            return None


class CuratedPublicWebcamProvider(CameraProvider):

    def __init__(self):
        super().__init__()
        self.name = "Verified public webcams"
        self.id = "publicwebcam"
        self.supports_bbox = False
        self.state_bbox = (-80.20, 26.50, -80.00, 27.10)
        self.cache_ttl = 24 * 60 * 60
        self._static = [
            {
                "id": "publicwebcam-wptv-pbi",
                "name": "PBI Airport / Downtown Camera",
                "provider": "WPTV First Alert Weather",
                "state": "FL",
                "country": "US",
                "district": "Palm Beach County",
                "county": "Palm Beach",
                "lat": 26.6832,
                "lon": -80.0956,
                "category": "airport",
                "road": "Palm Beach International Airport area",
                "direction": "",
                "status": "embed_available",
                "snapshot_url": "",
                "upstream_snapshot_url": "",
                "stream_url": "",
                "embed_url": "https://g1.ipcamlive.com/player/player.php?alias=wptv3&autoplay=1",
                "stream_available": True,
                "stream_type": "embed",
                "last_updated": "publisher managed",
                "source_url": "https://www.wptv.com/weather/weather-cams",
                "location_accuracy": "publisher-area",
                "metadata": {"publisher_label": "PBI Airport / Downtown Camera"},
            },
            {
                "id": "publicwebcam-wptv-intracoastal",
                "name": "Intracoastal / Downtown West Palm Beach",
                "provider": "WPTV First Alert Weather",
                "state": "FL",
                "country": "US",
                "district": "West Palm Beach",
                "county": "Palm Beach",
                "lat": 26.7153,
                "lon": -80.0534,
                "category": "scenic",
                "road": "Intracoastal Waterway",
                "direction": "",
                "status": "embed_available",
                "snapshot_url": "",
                "upstream_snapshot_url": "",
                "stream_url": "",
                "embed_url": "https://g1.ipcamlive.com/player/player.php?alias=wptv6&autoplay=1",
                "stream_available": True,
                "stream_type": "embed",
                "last_updated": "publisher managed",
                "source_url": "https://www.wptv.com/weather/weather-cams",
                "location_accuracy": "publisher-area",
                "metadata": {"publisher_label": "Intracoastal / Downtown WPB"},
            },
            {
                "id": "publicwebcam-wptv-peanut-island",
                "name": "Peanut Island Camera",
                "provider": "WPTV First Alert Weather",
                "state": "FL",
                "country": "US",
                "district": "Riviera Beach",
                "county": "Palm Beach",
                "lat": 26.7735,
                "lon": -80.0462,
                "category": "marina",
                "road": "Lake Worth Lagoon",
                "direction": "",
                "status": "embed_available",
                "snapshot_url": "",
                "upstream_snapshot_url": "",
                "stream_url": "",
                "embed_url": "https://g1.ipcamlive.com/player/player.php?alias=wptv5&autoplay=1",
                "stream_available": True,
                "stream_type": "embed",
                "last_updated": "publisher managed",
                "source_url": "https://www.wptv.com/weather/weather-cams",
                "location_accuracy": "publisher-area",
                "metadata": {"publisher_label": "Peanut Island"},
            },
            {
                "id": "publicwebcam-wptv-jupiter",
                "name": "Jupiter Inlet Camera",
                "provider": "WPTV First Alert Weather",
                "state": "FL",
                "country": "US",
                "district": "Jupiter",
                "county": "Palm Beach",
                "lat": 26.9431,
                "lon": -80.0725,
                "category": "inlet",
                "road": "Jupiter Inlet",
                "direction": "",
                "status": "embed_available",
                "snapshot_url": "",
                "upstream_snapshot_url": "",
                "stream_url": "",
                "embed_url": "https://g1.ipcamlive.com/player/player.php?alias=wptv4&autoplay=1",
                "stream_available": True,
                "stream_type": "embed",
                "last_updated": "publisher managed",
                "source_url": "https://www.wptv.com/weather/weather-cams",
                "location_accuracy": "publisher-area",
                "metadata": {"publisher_label": "Jupiter"},
            },
        ]

    def fetch_cameras(self, bbox=None):
        return list(self._static)

    def normalize_camera(self, raw):
        return dict(raw) if raw and raw.get("id") else None


CAMERA_PROVIDERS = {
    "fl511": FL511Provider(),
    "caltrans": CaliforniaDOTProvider(),
    "maryland": MarylandDOTProvider(),
    "iadot": IowaDOTLiveProvider(),
    "publicwebcam": CuratedPublicWebcamProvider(),
    "nv511": Iteris511Provider("nv511", "Nevada 511", "NV", "https://www.nvroads.com", (-120.2, 35.0, -114.0, 42.1)),
    "ny511": Iteris511Provider("ny511", "New York 511", "NY", "https://511ny.org", (-79.8, 40.4, -71.7, 45.1)),
    "wi511": Iteris511Provider("wi511", "Wisconsin 511", "WI", "https://511wi.gov", (-92.9, 42.4, -86.7, 47.2)),
    "la511": Iteris511Provider("la511", "Louisiana 511", "LA", "https://www.511la.org", (-94.1, 28.8, -88.7, 33.1)),
}


def is_valid_coordinate(lat, lon):
    try:
        lat_float = float(lat)
        lon_float = float(lon)
        
        if not (math.isfinite(lat_float) and math.isfinite(lon_float)):
            return False
        
        if not (-90 <= lat_float <= 90):
            return False
        if not (-180 <= lon_float <= 180):
            return False
        
        return True
    except (TypeError, ValueError):
        return False


def camera_has_live_video(camera, allow_resolver=True):
    if not camera:
        return False

    stream_type = str(camera.get("stream_type") or "").lower()
    if stream_type == "embed":
        return str(camera.get("embed_url") or "").startswith("https://")
    if stream_type not in {"hls", "mjpeg"}:
        return False

    if any(
        str(camera.get(key) or "").startswith(("https://", "http://"))
        for key in ("upstream_stream_url", "stream_url")
    ):
        return True

    resolver_url = str(camera.get("stream_url") or "")
    return bool(
        allow_resolver
        and camera.get("stream_available") is True
        and resolver_url.startswith("/camera/resolve")
    )


def live_camera_record(camera, allow_resolver=True):
    """Return a browser-playable live-video record with all still-image fields removed."""
    if not camera_has_live_video(camera, allow_resolver=allow_resolver):
        return None

    record = dict(camera)
    for key in ("snapshot_url", "proxy_snapshot_url", "upstream_snapshot_url", "snapshot_source_url"):
        record.pop(key, None)
    record["status"] = "stream_available"
    record["last_checked"] = None
    record["camera_type"] = record.get("category") or "public"
    record["attribution"] = record.get("provider")
    # Road direction is not necessarily the direction the lens faces.
    heading = record.get("heading")
    try:
        record["heading"] = float(heading) % 360 if heading is not None and math.isfinite(float(heading)) else None
    except (ValueError, TypeError):
        record["heading"] = None
    return record


def get_all_cameras(bbox=None, provider_filter=None, state_filter=None):
    all_cameras = []
    providers_used = []
    
    providers = CAMERA_PROVIDERS.values()
    if provider_filter:
        providers = [CAMERA_PROVIDERS.get(provider_filter)]
        providers = [p for p in providers if p]

    providers = list(providers)
    if bbox:
        providers = [
            provider for provider in providers
            if not getattr(provider, "state_bbox", None) or state_bbox_intersects(bbox, provider.state_bbox)
        ]

    def load_provider(provider):
        try:
            cameras = provider.get_cameras(bbox)
            if state_filter:
                cameras = [c for c in cameras if c.get("state") == state_filter]
            
            valid_cameras = []
            for camera in cameras:
                lat = camera.get("lat")
                lon = camera.get("lon")
                public_camera = live_camera_record(camera)
                if is_valid_coordinate(lat, lon) and public_camera:
                    valid_cameras.append(public_camera)
                elif not is_valid_coordinate(lat, lon):
                    print(f"Filtered invalid coordinates for camera {camera.get('id')}: lat={lat}, lon={lon}")
            
            return provider.id, valid_cameras
        except Exception as e:
            print(f"Provider {provider.name} failed: {e}")
            return provider.id, []

    if len(providers) > 1:
        executor = ThreadPoolExecutor(max_workers=min(24, len(providers)))
        futures = [executor.submit(load_provider, provider) for provider in providers]
        wait_seconds = 18 if bbox else 90
        try:
            for future in as_completed(futures, timeout=wait_seconds):
                provider_id, cameras = future.result()
                all_cameras.extend(cameras)
                if cameras:
                    providers_used.append(provider_id)
        except FutureTimeoutError:
            for provider, future in zip(providers, futures):
                if not future.done():
                    future.cancel()
                    provider.health = "degraded" if provider.cache.get("data") else "loading"
                    provider.last_error = f"Camera provider exceeded {wait_seconds}s aggregation deadline"
                    cached = list(provider.cache.get("data") or [])
                    if bbox and cached:
                        west, south, east, north = bbox
                        cached = [camera for camera in cached if west <= camera["lon"] <= east and south <= camera["lat"] <= north]
                    if state_filter:
                        cached = [camera for camera in cached if camera.get("state") == state_filter]
                    cached = [camera for camera in (live_camera_record(item) for item in cached) if camera]
                    if cached:
                        all_cameras.extend(cached)
                        providers_used.append(provider.id)
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
    else:
        for provider in providers:
            provider_id, cameras = load_provider(provider)
            all_cameras.extend(cameras)
            if cameras:
                providers_used.append(provider_id)
    
    return all_cameras, providers_used


def get_provider_status():
    status = []
    for provider_id, provider in CAMERA_PROVIDERS.items():
        cached_cameras = provider.cache.get("data", [])
        status.append({
            "id": provider_id,
            "name": provider.name,
            "supports_bbox": provider.supports_bbox,
            "active": True,
            "health": getattr(provider, "health", "unknown"),
            "last_error": getattr(provider, "last_error", None),
            "last_success": getattr(provider, "last_success", None),
            "last_failure": getattr(provider, "last_failure", None),
            "consecutive_failures": getattr(provider, "consecutive_failures", 0),
            "cached": provider.cache["timestamp"] > 0,
            "stale": provider.cache["timestamp"] > 0 and time.time() - provider.cache["timestamp"] >= provider.cache_ttl,
            "cache_age": int(time.time() - provider.cache["timestamp"]) if provider.cache["timestamp"] > 0 else None,
            "camera_count": len(cached_cameras),
            "live_video_count": sum(1 for camera in cached_cameras if camera_has_live_video(camera)),
            "states": sorted({str(camera.get("state")) for camera in cached_cameras if camera.get("state")}),
        })
    return status


def resolve_camera_provider_stream(camera_id):
    normalized_id = str(camera_id or "").strip()
    if "-" not in normalized_id:
        return None

    provider_id = normalized_id.split("-", 1)[0]
    provider = CAMERA_PROVIDERS.get(provider_id)
    if provider and hasattr(provider, "resolve_camera"):
        return provider.resolve_camera(normalized_id)
    return None
