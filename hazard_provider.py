"""Public event metadata; visual effects are illustrative, never hazard forecasts."""
import json
import math
import threading
import time
from urllib.request import Request, urlopen

_CACHE = {}
_LOCK = threading.Lock()


def normalize_events(data, category):
    features = []
    for event in (data.get('events') or [])[:200]:
        points = [g for g in event.get('geometry', []) if g.get('type') == 'Point' and len(g.get('coordinates', [])) >= 2]
        if not points:
            continue
        point = max(points, key=lambda g: g.get('date') or '')
        lon, lat = point['coordinates'][:2]
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat)) or abs(lat) > 90 or abs(lon) > 180:
            continue
        features.append({
            'id': event.get('id'), 'name': event.get('title') or category, 'kind': 'event',
            'category': category, 'lat': lat, 'lon': lon, 'time': point.get('date'),
            'source': 'NASA EONET', 'status': 'Open event report',
            'description': 'Reported event location. 3D shape and smoke are illustrative, not measured plume or terrain data.',
            'sources': event.get('sources') or [],
        })
    return {'source': 'NASA EONET', 'generated': int(time.time()), 'count': len(features), 'mode': 'event-reports', 'fallback': False, 'features': features}



def normalize_volcanoes(data):
    features = []
    for feature in (data.get('features') or [])[:500]:
        geometry = feature.get('geometry') or {}
        coords = geometry.get('coordinates') or []
        if geometry.get('type') != 'Point' or len(coords) < 2:
            continue
        lon, lat = coords[:2]
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (lon, lat)) or abs(lat) > 90 or abs(lon) > 180:
            continue
        props = feature.get('properties') or {}
        features.append({
            'id': 'usgs-volcano-' + str(props.get('vnum') or props.get('volcanoCd')),
            'name': props.get('volcanoName') or 'Volcano', 'kind': 'event',
            'category': 'volcanoes', 'lat': lat, 'lon': lon,
            'time': props.get('alertDate'), 'source': 'USGS Volcano Hazards Program',
            'status': str(props.get('alertLevel') or 'UNASSIGNED') + ' / ' + str(props.get('colorCode') or 'UNASSIGNED'),
            'description': props.get('noticeSynopsis') or 'No current notice supplied by USGS.',
            'showPlume': False,
            'sources': [{'id': 'USGS', 'url': props.get('noticeUrl') or props.get('volcanoUrl')}],
        })
    return {'source': 'USGS Volcano Hazards Program', 'generated': int(time.time()), 'count': len(features), 'mode': 'status-reports', 'fallback': False, 'features': features}


def hazards(category):
    if category not in ('volcanoes', 'wildfires'):
        raise ValueError('Unsupported hazard category')
    with _LOCK:
        cached = _CACHE.get(category)
        if cached and time.monotonic() - cached[0] < 300:
            return cached[1]
        url = ('https://volcanoes.usgs.gov/vsc/api/volcanoApi/geojson' if category == 'volcanoes' else
               'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&days=30&status=open&limit=200')
        with urlopen(Request(url, headers={'User-Agent': 'Project-Orion/1.2'}), timeout=15) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('Event response exceeds size limit')
        payload = normalize_volcanoes(json.loads(raw)) if category == 'volcanoes' else normalize_events(json.loads(raw), category)
        _CACHE[category] = (time.monotonic(), payload)
        return payload
