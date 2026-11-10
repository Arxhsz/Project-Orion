import unittest
from unittest.mock import patch
import weather_provider as weather
from hazard_provider import normalize_events, normalize_volcanoes


class WeatherProviderTests(unittest.TestCase):
    def records(self):
        return [{'hourly': {'time': [1790856000, 1790859600], 'temperature_2m': [60, 70]}} for _ in weather.POINTS]

    def test_volcano_alert_does_not_fabricate_eruption(self):
        result = normalize_volcanoes({'features': [{'geometry': {'type': 'Point', 'coordinates': [-155, 19]}, 'properties': {'vnum': '1', 'alertLevel': 'ADVISORY', 'colorCode': 'YELLOW'}}]})
        self.assertEqual(result['features'][0]['status'], 'ADVISORY / YELLOW')
        self.assertFalse(result['features'][0]['showPlume'])
        self.assertIsNone(result['features'][0]['time'])

    def test_wind_samples_with_mismatched_time_are_missing(self):
        records = self.records()
        records[1]['hourly'] = {'time': [1, 2], 'wind_speed_10m': [40, 50]}
        result = weather.normalize_forecast(records, 'temperature')
        self.assertIsNone(result['frames'][0]['winds']['speed'][1])

    def test_frames_preserve_time_and_nulls(self):
        records = self.records()
        records[0]['hourly']['temperature_2m'][0] = None
        payload = weather.normalize_forecast(records, 'temperature', now=1790856000)
        self.assertEqual(len(payload['frames']), 2)
        self.assertIsNone(payload['frames'][0]['grid']['values'][0])
        self.assertEqual(payload['frames'][1]['grid']['values'][0], 70)
        self.assertEqual(payload['latest']['time'], payload['frames'][0]['time'])

    def test_invalid_and_incomplete_grids_rejected(self):
        for records, mode in [([], 'wind'), (self.records(), 'unknown')]:
            with self.assertRaises(ValueError):
                weather.normalize_forecast(records, mode)

    def test_invalid_model_never_reaches_network(self):
        with patch.object(weather, 'urlopen') as request:
            with self.assertRaises(ValueError):
                weather.forecast('wind', 'https://attacker.invalid')
            request.assert_not_called()

    def test_no_fabricated_hazards_and_latest_geometry(self):
        self.assertEqual(normalize_events({'events': []}, 'volcanoes')['features'], [])
        result = normalize_events({'events': [{'id': 'x', 'geometry': [
            {'type': 'Point', 'coordinates': [10, 20], 'date': '2026-09-01'},
            {'type': 'Point', 'coordinates': [11, 21], 'date': '2026-10-01'}]}]}, 'volcanoes')
        self.assertEqual(result['features'][0]['lon'], 11)
        self.assertEqual(result['features'][0]['time'], '2026-10-01')


if __name__ == '__main__':
    unittest.main()
