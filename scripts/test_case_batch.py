import unittest
from process_ml_cases import refresh_pending


class BatchTests(unittest.TestCase):
    def test_refresh_preserves_active_case_snapshot(self):
        state = {'revision': 'old', 'remote': '/old', 'results': {
            'VID04': {'smoke': 123, 'full': 456}, 'VID05': {}}}
        refresh_pending(state, 'new', '/new')
        self.assertEqual(state['results']['VID04']['revision'], 'old')
        self.assertEqual(state['results']['VID04']['remote'], '/old')
        self.assertEqual(state['revision'], 'new')
        self.assertNotIn('revision', state['results']['VID05'])
        refresh_pending(state, 'newer', '/newer')
        self.assertEqual(state['results']['VID04']['revision'], 'old')


if __name__ == '__main__':
    unittest.main()
