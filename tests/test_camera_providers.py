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


if __name__ == "__main__":
    unittest.main()
