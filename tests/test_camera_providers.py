import unittest
from unittest.mock import patch

import camera_providers
import orion_server


class StubCameraProvider(camera_providers.CameraProvider):
    def __init__(self):
        super().__init__()
        self.id = "stub"
        self.name = "Stub"
        self.state_bbox = (-90, 20, -70, 40)

    def fetch_cameras(self, bbox=None):
        return ["valid", "snapshot-only", "metadata-only", "invalid", "discarded"]

    def normalize_camera(self, raw):
        if raw == "discarded":
            return None
        if raw == "invalid":
            return {"id": raw, "lat": 200, "lon": -80, "stream_type": "hls", "upstream_stream_url": "https://example.test/live.m3u8"}
        if raw == "metadata-only":
            return {"id": raw, "lat": 30, "lon": -80}
        if raw == "snapshot-only":
            return {"id": raw, "lat": 30, "lon": -80, "stream_type": "snapshot", "snapshot_url": "https://example.test/cam.jpg"}
        return {"id": raw, "lat": 30, "lon": -80, "stream_type": "hls", "upstream_stream_url": "https://example.test/live.m3u8"}


class CameraProviderTests(unittest.TestCase):
    def test_registry_has_no_synthetic_state_fill(self):
        self.assertNotIn("us_fill", camera_providers.CAMERA_PROVIDERS)
        self.assertFalse(any(provider.id == "us_fill" for provider in camera_providers.CAMERA_PROVIDERS.values()))
        self.assertNotIn("ncdot", camera_providers.CAMERA_PROVIDERS)

    def test_registry_omits_snapshot_only_adapters(self):
        for provider_id in ("ak511", "az511", "ctroads", "gdot", "id511", "ildot", "midrive", "newengland", "or511", "sdot"):
            self.assertNotIn(provider_id, camera_providers.CAMERA_PROVIDERS)

    def test_curated_webcams_are_verified_embeds(self):
        provider = camera_providers.CuratedPublicWebcamProvider()
        cameras = provider.get_cameras()

        self.assertEqual(4, len(cameras))
        self.assertTrue(any(camera["id"] == "publicwebcam-wptv-pbi" for camera in cameras))
        for camera in cameras:
            self.assertEqual("embed", camera["stream_type"])
            self.assertTrue(camera["embed_url"].startswith("https://g1.ipcamlive.com/"))
            self.assertEqual("publisher-area", camera["location_accuracy"])

    def test_aggregation_filters_invalid_and_metadata_only_records(self):
        provider = StubCameraProvider()
        with patch.dict(camera_providers.CAMERA_PROVIDERS, {"stub": provider}, clear=True):
            cameras, providers = camera_providers.get_all_cameras((-85, 25, -75, 35))

        self.assertEqual(["stub"], providers)
        self.assertEqual(["valid"], [camera["id"] for camera in cameras])
        self.assertEqual("online", provider.health)

    def test_empty_provider_health_is_not_reported_online(self):
        class EmptyProvider(StubCameraProvider):
            def fetch_cameras(self, bbox=None):
                return []

        provider = EmptyProvider()
        self.assertEqual([], provider.get_cameras())
        self.assertEqual("empty", provider.health)

    def test_local_proxy_without_verified_stream_is_not_live_video(self):
        camera = {
            "id": "metadata-only",
            "lat": 30,
            "lon": -80,
            "stream_type": "hls",
            "stream_url": "/camera/resolve?id=metadata-only",
        }

        self.assertFalse(camera_providers.camera_has_live_video(camera))

    def test_verified_local_resolver_is_live_only_in_local_catalog(self):
        camera = {
            "id": "resolver-live",
            "stream_type": "hls",
            "stream_url": "/camera/resolve?id=resolver-live",
            "stream_available": True,
            "snapshot_url": "https://example.test/still.jpg",
        }

        self.assertTrue(camera_providers.camera_has_live_video(camera))
        self.assertFalse(camera_providers.camera_has_live_video(camera, allow_resolver=False))
        record = camera_providers.live_camera_record(camera)
        self.assertNotIn("snapshot_url", record)

    def test_snapshot_only_camera_is_never_live_video(self):
        camera = {
            "id": "still",
            "stream_type": "snapshot",
            "snapshot_url": "https://example.test/still.jpg",
        }

        self.assertFalse(camera_providers.camera_has_live_video(camera))

    def test_live_camera_proxy_allows_registered_stream_hosts(self):
        allowed = orion_server.OrionHandler.is_allowed_hls_url

        self.assertTrue(allowed(None, "https://video3.iowadot.gov:8888/camera/playlist.m3u8"))
        self.assertTrue(allowed(None, "https://strmr5.sha.maryland.gov/live/playlist.m3u8"))
        self.assertFalse(allowed(None, "https://example.test/live/playlist.m3u8"))


class PowerGridTests(unittest.TestCase):
    def test_power_grid_rejects_unbounded_or_oversized_queries(self):
        self.assertEqual((None, "ViewportBoundsRequired"), orion_server.bounded_power_bbox(None))
        bbox, error = orion_server.bounded_power_bbox({"west": -120, "south": 20, "east": -70, "north": 50})
        self.assertIsNone(bbox)
        self.assertEqual("ViewportTooLarge", error)

    def test_voltage_normalization(self):
        self.assertEqual(230000, orion_server.parse_osm_voltage("115000;230000"))
        self.assertEqual(500000, orion_server.parse_osm_voltage("500"))
        self.assertIsNone(orion_server.parse_osm_voltage("unknown"))


class WeatherFieldTests(unittest.TestCase):
    def test_weather_field_payload_uses_shared_grid_values(self):
        grid = {
            "generated": 123,
            "valid_time": "2026-08-10T02:00",
            "width": 2,
            "height": 2,
            "values": {"temperature_2m": [60.0, 65.0, 70.0, 75.0]},
        }

        with patch.object(orion_server, "fetch_open_meteo_weather_grid", return_value=grid):
            payload = orion_server.open_meteo_weather_field_payload("temperature")

        self.assertEqual("live-global-grid", payload["mode"])
        self.assertEqual("online", payload["provider_health"])
        self.assertEqual(4, payload["count"])
        self.assertEqual("F", payload["grid"]["unit"])
        self.assertEqual([60.0, 65.0, 70.0, 75.0], payload["grid"]["values"])


if __name__ == "__main__":
    unittest.main()
