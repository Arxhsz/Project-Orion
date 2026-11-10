"""Bounded, cached forecast frames shared by local Orion clients."""
import json
import math
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

FIELDS = {
    'precipitation': ('precipitation', 'mm/h'), 'wind': ('wind_speed_10m', 'mph'),
    'gusts': ('wind_gusts_10m', 'mph'), 'temperature': ('temperature_2m', '°F'),
    'feels-like': ('apparent_temperature', '°F'), 'humidity': ('relative_humidity_2m', '%'),
    'wet-bulb': ('wet_bulb_temperature_2m', '°F'),
    'dewpoint': ('dew_point_2m', '°F'), 'pressure': ('pressure_msl', 'hPa'),
    'clouds': ('cloud_cover', '%'), 'snow': ('snowfall', 'cm/h'), 'rain': ('rain', 'mm/h'),
}
POINTS = [(lat, lon) for lat in range(-80, 81, 20) for lon in range(-170, 171, 20)]
_LOCK = threading.Lock()
_CACHE = {}


def normalize_forecast(records, mode, now=None):
    if mode not in FIELDS:
        raise ValueError('Unsupported weather mode')
    if not isinstance(records, list) or len(records) != len(POINTS):
        raise ValueError('Incomplete forecast grid')
    variable, unit = FIELDS[mode]
    times = (records[0].get('hourly') or {}).get('time') or []
    def sample(record, variable, index, stamp):
        hourly = record.get('hourly') or {}
        stamps, values = hourly.get('time') or [], hourly.get(variable) or []
        if index >= len(stamps) or stamps[index] != stamp or index >= len(values):
            return None
        value = values[index]
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None

    frames = []
    for i, stamp in enumerate(times[:240]):
        values = [sample(record, variable, i, stamp) for record in records]
        if not any(value is not None for value in values):
            continue
        frames.append({
            'time': datetime.fromtimestamp(stamp, timezone.utc).isoformat().replace('+00:00', 'Z'),
            'winds': {key: [sample(record, field, i, stamp) for record in records] for key, field in [('speed', 'wind_speed_10m'), ('direction', 'wind_direction_10m')]},
            'grid': {'width': 18, 'height': 9, 'west': -170, 'south': -80, 'east': 170, 'north': 80, 'unit': unit, 'values': values},
        })
    if not frames:
        raise ValueError('Forecast has no usable frames')
    now = time.time() if now is None else now
    past = [f for f in frames if datetime.fromisoformat(f['time'].replace('Z', '+00:00')).timestamp() <= now]
    return {
        'weather_mode': mode, 'frames': frames, 'latest': (past or frames)[-1 if past else 0],
        'provider': 'Open-Meteo', 'coverage': 'Global model · sampled 20° grid', 'unit': unit,
        'mode': 'forecast', 'refresh_seconds': 1800, 'supportsHistorical': True,
        'generated': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    }


def forecast(mode, model="best_match"):
    if model not in ("best_match", "gfs_seamless", "icon_seamless"):
        raise ValueError("Unsupported model")
    if mode not in FIELDS:
        raise ValueError('Unsupported weather mode')
    # A single lock coalesces concurrent requests; do not multiply global API calls per mode.
    with _LOCK:
        entry = _CACHE.get(model)
        if entry is None or time.monotonic() - entry[0] > 1800:
            query = urlencode({
                'latitude': ','.join(str(p[0]) for p in POINTS),
                'longitude': ','.join(str(p[1]) for p in POINTS),
                'hourly': ','.join(sorted({v[0] for v in FIELDS.values()} | {'wind_direction_10m'})),
                'past_days': 2, 'forecast_days': 7, 'temperature_unit': 'fahrenheit',
                'wind_speed_unit': 'mph', 'timezone': 'UTC', 'timeformat': 'unixtime', 'models': model,
            })
            req = Request('https://api.open-meteo.com/v1/forecast?' + query, headers={'User-Agent': 'Project-Orion/1.2', 'Accept': 'application/json'})
            with urlopen(req, timeout=25) as response:
                raw = response.read(12 * 1024 * 1024 + 1)
            if len(raw) > 12 * 1024 * 1024:
                raise ValueError('Forecast response exceeds size limit')
            records = json.loads(raw)
            normalize_forecast(records, mode)
            entry = (time.monotonic(), records)
            _CACHE[model] = entry
        payload = normalize_forecast(entry[1], mode)
        payload['coverage'] += ' · ' + model.replace('_seamless', '').replace('_', ' ').upper()
        return payload
