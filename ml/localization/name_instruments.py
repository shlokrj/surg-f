"""Name generic tool boxes using CholecT50's per-second instrument labels.

The detector finds instruments but not their type (Endoscapes only has a generic `tool`
class). CholecT50 says which instruments are visible each second but not where. This module
combines them with three explicit rules, applied to sampled frames in time order:

1. no instrument is listed for that second  -> drop every tool box (likely a false alarm)
2. a box overlapping (IoU >= link_iou) a box named in the previous sampled frame keeps that
   name, if the name is still listed for this second ("carried")
3. if exactly one listed name is still unused, the highest-scoring remaining box gets it
   ("only remaining name"); this covers every single-instrument second
Anything else stays unnamed and is dropped, so a shown name is never a guess between two
listed instruments. Names are therefore inferred, not detected: a box can be named correctly
only when the labels make it unambiguous.
"""
import csv
import math

INSTRUMENTS = ('grasper', 'bipolar', 'hook', 'scissors', 'clipper', 'irrigator')


def instrument_seconds(csv_path, case_id):
    """{second: {instrument, ...}} from shared/triplets.annotation.csv ([start, end) seconds)."""
    seconds = {}
    with open(csv_path, newline='') as stream:
        for row in csv.DictReader(stream):
            if row['case_id'] != case_id:
                continue
            if row['instrument'] not in INSTRUMENTS:
                raise ValueError(f"unknown instrument {row['instrument']}")
            for second in range(int(row['start_sec']), int(row['end_sec'])):
                seconds.setdefault(second, set()).add(row['instrument'])
    if not seconds:
        raise ValueError(f'no instrument rows for {case_id}')
    return seconds


def iou(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    inter = w * h
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter)


def name_tools(frames, seconds, offset, link_iou=0.5):
    """frames: [(timestamp_sec, [(bbox_xyxy, score), ...]), ...] in time order.

    `offset` maps dataset seconds to video time (video = dataset + offset).
    Returns ([[(bbox, score, name, rule), ...] per frame], stats).
    """
    stats = dict(candidates=0, named_only_remaining=0, named_carried=0, dropped_no_instrument_listed=0,
                 dropped_ambiguous=0)
    previous, output, last_time = [], [], -math.inf
    for timestamp, boxes in frames:
        if timestamp <= last_time:
            raise ValueError('frames must be in increasing time order')
        last_time = timestamp
        present = seconds.get(math.floor(timestamp - offset + 1e-9), set())
        boxes = sorted(boxes, key=lambda item: -item[1])
        stats['candidates'] += len(boxes)
        if not present:
            stats['dropped_no_instrument_listed'] += len(boxes)
            output.append([]); previous = []
            continue
        named, used, taken = [], set(), set()
        for prev_box, _, prev_name, _ in sorted(previous, key=lambda item: -item[1]):
            if prev_name not in present or prev_name in used:
                continue
            best, best_iou = None, link_iou
            for index, (box, _) in enumerate(boxes):
                overlap = iou(box, prev_box)
                if index not in taken and overlap >= best_iou:
                    best, best_iou = index, overlap
            if best is not None:
                taken.add(best); used.add(prev_name)
                named.append((boxes[best][0], boxes[best][1], prev_name, 'carried'))
                stats['named_carried'] += 1
        left = sorted(present - used)
        remaining = [index for index in range(len(boxes)) if index not in taken]
        if len(left) == 1 and remaining:
            index = remaining.pop(0)  # highest score: boxes are sorted
            named.append((boxes[index][0], boxes[index][1], left[0], 'only remaining name'))
            stats['named_only_remaining'] += 1
        stats['dropped_ambiguous'] += len(remaining)
        output.append(named)
        previous = named
    return output, stats
