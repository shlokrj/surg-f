import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from export_anatomy_video import detections_for, frame_indices, iter_frames, probe_video, thresholds_for

FFMPEG = os.environ.get('SURGF_FFMPEG') or shutil.which('ffmpeg')


class FakeTensor(list):
    def tolist(self):
        return list(self)


class ExportTests(unittest.TestCase):
    def test_player_seconds_map_to_decoded_frames(self):
        self.assertEqual(frame_indices([674, 674.01, 0, 1.5], 25, 0), [0, 38, 16850])
        with self.assertRaises(ValueError):
            frame_indices([0], 25, 0.5)

    def test_class_thresholds_and_box_filtering(self):
        thresholds = thresholds_for(.3, {'cystic duct': .7})
        self.assertEqual(thresholds, {'cystic duct': .7, 'gallbladder': .3})
        with self.assertRaises(ValueError):
            thresholds_for(.3, {'liver': .5})
        result = dict(boxes=FakeTensor([[10, 10, 50, 40], [0, 0, 5, 5], [-5, 0, 100, 200], [3, 3, 3, 9]]),
                      labels=FakeTensor([1, 1, 2, 2]), scores=FakeTensor([.8, .5, .4, .9]))
        detections = detections_for(result, (100, 50), 7, thresholds)
        self.assertEqual([d['label'] for d in detections], ['cystic duct', 'gallbladder'])
        self.assertEqual(detections[0]['bbox_xyxy'], [.1, .2, .5, .8])
        self.assertEqual(detections[1]['bbox_xyxy'], [0, 0, 1, 1])
        self.assertEqual(detections[0]['instance_id'], '000007-0')

    def test_tool_boxes_are_set_aside_for_naming(self):
        names = {1: 'cystic duct', 2: 'gallbladder', 3: 'tool'}
        thresholds = thresholds_for(.3, {'tool': .5}, names)
        result = dict(boxes=FakeTensor([[10, 10, 50, 40], [20, 5, 60, 45], [0, 0, 5, 5]]),
                      labels=FakeTensor([2, 3, 3]), scores=FakeTensor([.9, .8, .4]))
        tools = []
        detections = detections_for(result, (100, 50), 3, thresholds, names, tools)
        self.assertEqual([d['label'] for d in detections], ['gallbladder'])
        self.assertEqual(tools, [([.2, .1, .6, .9], .8)])

    @unittest.skipUnless(FFMPEG, 'set SURGF_FFMPEG or install ffmpeg')
    def test_single_pass_extracts_exact_frames(self):
        with tempfile.TemporaryDirectory() as temporary:
            video = Path(temporary) / 'counter.mp4'
            # Frame n has red level 10 * n, so each extracted frame identifies its index.
            subprocess.run([FFMPEG, '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=32x16:r=25:d=1',
                            '-vf', "geq=r='10*N':g=0:b=0", '-c:v', 'libx264', '-qp', '0',
                            '-pix_fmt', 'yuv444p', str(video)], check=True)
            stream = probe_video(FFMPEG, video)
            self.assertEqual((stream['width'], stream['height'], stream['fps'], stream['start_sec']), (32, 16, 25.0, 0.0))
            decoded = list(iter_frames(FFMPEG, video, [2, 9, 20], 32, 16))
            self.assertEqual([index for index, _, _ in decoded], [2, 9, 20])
            for index, image, digest in decoded:
                self.assertLessEqual(abs(image.getpixel((16, 8))[0] - 10 * index), 3)
                self.assertEqual(len(digest), 64)
            with self.assertRaisesRegex(ValueError, 'decoded 1 frames, expected 2'):
                list(iter_frames(FFMPEG, video, [3, 99], 32, 16))

if __name__ == '__main__':
    unittest.main()
