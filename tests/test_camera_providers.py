import unittest
import os
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
        return ["valid", "metadata-only", "invalid", "discarded"]

    def normalize_camera(self, raw):
        if raw == "discarded":
            return None
        if raw == "invalid":
            return {"id": raw, "lat": 200, "lon": -80, "snapshot_url": "https://example.test/cam.jpg"}
        if raw == "metadata-only":
            return {"id": raw, "lat": 30, "lon": -80}
        return {"id": raw, "lat": 30, "lon": -80, "snapshot_url": "https://example.test/cam.jpg"}


class CameraProviderTests(unittest.TestCase):
    def test_registry_has_no_synthetic_state_fill(self):
        self.assertNotIn("us_fill", camera_providers.CAMERA_PROVIDERS)
        self.assertFalse(any(provider.id == "us_fill" for provider in camera_providers.CAMERA_PROVIDERS.values()))

    def test_verified_alaska_provider_is_registered(self):
        provider = camera_providers.CAMERA_PROVIDERS["ak511"]

        self.assertEqual("Alaska 511", provider.name)
        self.assertEqual("AK", provider.state_code)
        self.assertEqual("https://511.alaska.gov/List/GetData/Cameras", provider.api_url)

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

    def test_local_proxy_without_upstream_is_not_media(self):
        camera = {
            "id": "metadata-only",
            "lat": 30,
            "lon": -80,
            "snapshot_url": "/camera/snapshot?id=metadata-only",
            "stream_url": "/camera/resolve?id=metadata-only",
        }

        self.assertFalse(camera_providers.camera_has_media(camera))

    def test_drivenc_without_key_is_unavailable_not_failed(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DRIVENC_API_KEY", None)
            provider = camera_providers.NorthCarolinaDOTProvider()

        self.assertFalse(provider.is_configured())
        self.assertEqual([], provider.get_cameras())
        self.assertEqual("unavailable", provider.health)

    def test_drivenc_normalizes_documented_camera_shape(self):
        provider = camera_providers.NorthCarolinaDOTProvider()
        camera = provider.normalize_camera({
            "Id": 4061,
            "Roadway": "Other",
            "Direction": "Southbound",
            "Latitude": 36.06909,
            "Longitude": -79.51618,
            "Location": "BUR-BOONE_STMARKS",
            "Views": [{
                "Id": 4062,
                "Url": "https://example.test/map/Cctv/4062",
                "Status": "Enabled",
                "Description": "BUR-BOONE_STMARKS",
                "VideoUrl": "",
            }],
        })

        self.assertEqual("ncdot-4061", camera["id"])
        self.assertEqual("snapshot_only", camera["status"])
        self.assertEqual("https://example.test/map/Cctv/4062", camera["upstream_snapshot_url"])


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
