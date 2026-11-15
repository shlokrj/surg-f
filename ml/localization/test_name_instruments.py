import tempfile
import unittest
from pathlib import Path

from name_instruments import instrument_seconds, name_tools

A, B = [0.1, 0.1, 0.3, 0.3], [0.6, 0.6, 0.9, 0.9]


class NamingTests(unittest.TestCase):
    def test_single_instrument_second_names_top_box_only(self):
        out, stats = name_tools([(10.0, [(A, .9), (B, .7)])], {10: {'hook'}}, offset=0, mode='carry')
        self.assertEqual([(n, r) for _, _, n, r in out[0]], [('hook', 'only remaining name')])
        self.assertEqual(stats['dropped_ambiguous'], 1)

    def test_no_listed_instrument_drops_boxes(self):
        out, stats = name_tools([(5.0, [(A, .9)])], {}, offset=0, mode='carry')
        self.assertEqual(out, [[]])
        self.assertEqual(stats['dropped_no_instrument_listed'], 1)

    def test_names_carry_by_overlap_into_two_instrument_seconds(self):
        moved = [0.11, 0.1, 0.31, 0.3]
        frames = [(10.0, [(A, .9)]), (10.24, [(moved, .8), (B, .85)])]
        seconds = {10: {'grasper'}}
        out, _ = name_tools(frames, {**seconds, 11: set()}, offset=0, mode='carry')
        self.assertEqual(out[0][0][2], 'grasper')
        seconds = {10: {'grasper', 'hook'}}
        out, stats = name_tools([(9.0, [(A, .9)]), (10.0, [(moved, .8), (B, .85)])], {9: {'grasper'}, **seconds}, offset=0, mode='carry')
        self.assertEqual(sorted((n, r) for _, _, n, r in out[1]), [('grasper', 'carried'), ('hook', 'only remaining name')])
        self.assertEqual(out[1][1][0], B, 'the leftover name goes to the other box')
        self.assertEqual(stats['named_carried'], 1)

    def test_two_instruments_without_history_stay_unnamed(self):
        out, stats = name_tools([(10.0, [(A, .9), (B, .8)])], {10: {'grasper', 'hook'}}, offset=0, mode='carry')
        self.assertEqual(out, [[]])
        self.assertEqual(stats['dropped_ambiguous'], 2)

    def test_offset_maps_video_time_to_dataset_seconds(self):
        out, _ = name_tools([(9.99, [(A, .9)])], {10: {'clipper'}}, offset=-0.04, mode='carry')
        self.assertEqual(out[0][0][2], 'clipper')
        out, _ = name_tools([(9.99, [(A, .9)])], {10: {'clipper'}}, offset=0.08, mode='carry')
        self.assertEqual(out, [[]])

    def test_csv_intervals_are_end_exclusive_and_validated(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 't.csv'
            path.write_text('case_id,start_sec,end_sec,instrument,verb,target,source\nVID01,2,4,hook,dissect,gallbladder,annotation\n'
                            'VID01,3,5,grasper,grasp,gallbladder,annotation\nVID02,0,9,hook,null_verb,null_target,annotation\n')
            self.assertEqual(instrument_seconds(path, 'VID01'), {2: {'hook'}, 3: {'hook', 'grasper'}, 4: {'grasper'}})
            with self.assertRaises(ValueError):
                instrument_seconds(path, 'VID07')
        with self.assertRaises(ValueError):
            name_tools([(2.0, []), (1.0, [])], {}, offset=0, mode='carry')


class StrictModeTests(unittest.TestCase):
    def test_names_only_when_one_listed_and_one_detected(self):
        frames = [(1.0, [(A, .9)]), (2.0, [(A, .9), (B, .8)]), (3.0, [(A, .9)]), (4.0, [(B, .7)])]
        seconds = {1: {'hook'}, 2: {'hook'}, 3: {'hook', 'grasper'}}
        out, stats = name_tools(frames, seconds, offset=0)
        self.assertEqual([[n for _, _, n, _ in f] for f in out], [['hook'], [], [], []])
        self.assertEqual((stats['mode'], stats['named_strict'], stats['dropped_ambiguous'], stats['dropped_no_instrument_listed']),
                         ('strict', 1, 3, 1))
        with self.assertRaises(ValueError):
            name_tools(frames, seconds, offset=0, mode='guess')


if __name__ == '__main__':
    unittest.main()
