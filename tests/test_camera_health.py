import io
import unittest
from unittest.mock import patch
import camera_health

class Response(io.BytesIO):
    headers = {'Content-Type':'application/vnd.apple.mpegurl'}

class HealthTests(unittest.TestCase):
    def setUp(self):
        camera_health._cache.clear()
    def test_playlist_is_cached_without_claiming_live_before_playback(self):
        with patch('camera_health.urlopen',return_value=Response(b'#EXTM3U\n#EXT-X-VERSION:3')) as request:
            c={'id':'test','stream_type':'hls','upstream_stream_url':'https://agency.example/live.m3u8'}
            a=camera_health.check_camera(c);b=camera_health.check_camera(c)
            self.assertEqual(a['status'],'UNKNOWN');self.assertIsNone(a['capture_time']);self.assertEqual(a,b);self.assertEqual(request.call_count,1)
    def test_failed_endpoint_is_cooled_down(self):
        with patch('camera_health.urlopen',side_effect=OSError('offline')) as request:
            c={'id':'test','stream_type':'hls','upstream_stream_url':'https://agency.example/live.m3u8'}
            self.assertEqual(camera_health.check_camera(c)['status'],'OFFLINE')
            camera_health.check_camera(c);self.assertEqual(request.call_count,1)
    def test_embed_does_not_claim_availability(self):
        with patch('camera_health.urlopen') as request:
            self.assertEqual(camera_health.check_camera({'id':'embed','stream_type':'embed'})['status'],'UNKNOWN');request.assert_not_called()
    def test_snapshot_record_is_not_probed(self):
        with patch('camera_health.urlopen') as request:
            result = camera_health.check_camera({'id':'still','stream_type':'snapshot','snapshot_url':'https://agency.example/image.jpg'})
            self.assertEqual(result['status'],'UNKNOWN');request.assert_not_called()
