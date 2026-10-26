import unittest
from datetime import datetime

from fastapi.testclient import TestClient

from app.main import app


class SimulatorAPITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_dashboard_serves_current_assets(self):
        self.assertIn('source-mode', self.client.get('/').text)
        self.assertIn('fetchFleet', self.client.get('/app.js').text)
        self.assertIn('source-controls', self.client.get('/style.css').text)
        self.assertEqual(self.client.get('/health').json()['status'], 'ok')

    def test_catalog_and_scenarios(self):
        machines = self.client.get('/machines').json()['machines']
        self.assertEqual(len(machines), 4)
        self.assertIn('baseline', machines[0])
        self.assertIn('coolant_loss', self.client.get('/fault-scenarios').json()['fault_scenarios'])

    def test_fleet_is_continuous_and_fault_stays_on_target(self):
        normal = self.client.get('/fleet/telemetry?start=5&count=3').json()['samples']
        fault = self.client.get('/fleet/telemetry?start=5&count=3&scenario=heat_excess').json()['samples']
        self.assertEqual([sample['elapsed'] for sample in fault], [5, 6, 7])
        for baseline, elevated in zip(normal, fault):
            self.assertGreater(elevated['readings'][0]['temperature_c'], baseline['readings'][0]['temperature_c'])
            for index in range(1, 4):
                self.assertEqual(elevated['readings'][index]['temperature_c'], baseline['readings'][index]['temperature_c'])
                self.assertEqual(elevated['readings'][index]['scenario'], 'normal')
        continued = self.client.get('/fleet/telemetry?start=7&scenario=heat_excess').json()['samples'][0]
        self.assertEqual(continued['readings'][0]['vibration_mm_s'], fault[-1]['readings'][0]['vibration_mm_s'])

    def test_bad_inputs_return_http_errors(self):
        for path, status in [('/machines/missing', 404), ('/machines/missing/snapshot', 404),
                             ('/fleet/telemetry?target=missing', 404), ('/fleet/telemetry?scenario=bad', 422),
                             ('/fleet/telemetry?count=61', 422), ('/fleet/telemetry?start=-1', 422),
                             ('/machines/extruder-01/telemetry?sample_rate_hz=0', 422),
                             ('/machines/extruder-01/telemetry?scenario=bad', 422),
                             ('/machines/extruder-01/telemetry?duration_minutes=60&sample_rate_hz=10', 422)]:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, status)

    def test_sample_rate_and_snapshot(self):
        samples = self.client.get('/machines/extruder-01/telemetry?duration_minutes=0.1&sample_rate_hz=2').json()['telemetry']
        self.assertEqual(len(samples), 12)
        self.assertEqual((datetime.fromisoformat(samples[1]['timestamp']) - datetime.fromisoformat(samples[0]['timestamp'])).total_seconds(), .5)
        self.assertEqual(self.client.get('/machines/coating-01/snapshot').status_code, 200)


if __name__ == '__main__':
    unittest.main()
