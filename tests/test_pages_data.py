import json
import tempfile
import unittest
from pathlib import Path

from build_pages_data import build_camera_tile_payloads, write_camera_catalog


class PagesDataTests(unittest.TestCase):
    def test_camera_catalog_is_partitioned_into_spatial_tiles(self):
        cameras = [
            {"id": "west", "lat": 34.1, "lon": -118.2},
            {"id": "east", "lat": 40.7, "lon": -74.0},
            {"id": "east-2", "lat": 41.0, "lon": -73.8},
        ]
        tiles, payloads = build_camera_tile_payloads(cameras)
        self.assertEqual(2, len(tiles))
        self.assertEqual(3, sum(tile["count"] for tile in tiles))
        self.assertEqual(3, sum(payload["count"] for payload in payloads.values()))

        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            write_camera_catalog({"source": "test", "count": 3, "total": 3, "cameras": cameras}, out)
            index = json.loads((out / "cameras-index.json").read_text())
            manifest = json.loads((out / "cameras.json").read_text())
            self.assertEqual(3, index["total"])
            self.assertEqual(2, len(index["tiles"]))
            self.assertEqual([], manifest["cameras"])
            self.assertEqual(2, len(list((out / "camera-tiles").glob("*.json"))))

if __name__ == "__main__":
    unittest.main()
