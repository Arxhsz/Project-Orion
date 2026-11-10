"""Bounded, cached availability probes for catalog-owned public URLs only."""
from collections import OrderedDict
from datetime import datetime, timezone
import threading
import time
from urllib.request import Request, urlopen

_cache = OrderedDict()
_lock = threading.Lock()


def check_camera(camera):
    camera_id = str(camera.get('id') or '')
    now = time.time()
    with _lock:
        old = _cache.get(camera_id)
        if old and now - old['last_checked'] < (300 if old['status'] == 'OFFLINE' else 60):
            return dict(old)
        result = {'id': camera_id, 'status': 'UNKNOWN', 'last_checked': int(now), 'capture_time': None}
        # Only caller-resolved catalog records are accepted, never a query-string URL.
        media = str(camera.get('stream_type') or '').lower()
        url = camera.get('upstream_stream_url')
        if media == 'embed' or not url or not url.startswith(('http://', 'https://')):
            result['message'] = 'Availability must be confirmed by the publisher player'
        elif media not in ('hls', 'mjpeg'):
            result['message'] = 'Camera record does not expose supported live video'
        else:
            try:
                request = Request(url, headers={'User-Agent': 'Project-Orion/1.0', 'Range': 'bytes=0-4095'})
                with urlopen(request, timeout=6) as response:
                    body = response.read(4096)
                    content_type = response.headers.get('Content-Type', '')
                if media == 'mjpeg':
                    if not content_type.startswith('image/') and b'image/jpeg' not in body:
                        raise ValueError('Non-image response')
                    result['message'] = 'MJPEG endpoint responds; playback confirms live availability'
                elif b'#EXTM3U' in body:
                    result['status'] = 'UNKNOWN'
                    result['message'] = 'Playlist available; playback not yet confirmed'
                    for line in body.decode('utf-8', errors='replace').splitlines():
                        if line.startswith('#EXT-X-PROGRAM-DATE-TIME:'):
                            stamp = datetime.fromisoformat(line.split(':', 1)[1].replace('Z', '+00:00'))
                            result['capture_time'] = stamp.isoformat()
                            age = (datetime.now(timezone.utc) - stamp).total_seconds()
                            result['status'] = 'LIVE' if age <= 120 else 'DELAYED' if age <= 600 else 'STALE'
                else:
                    raise ValueError('Non-playlist response')
            except Exception:
                result['status'] = 'OFFLINE'
                result['message'] = 'Endpoint did not return usable media; retry after five minutes'
        _cache[camera_id] = result
        _cache.move_to_end(camera_id)
        while len(_cache) > 2048:
            _cache.popitem(last=False)
        return dict(result)
