from export_triplets import intervals


def test_merges_runs_and_splits_gaps():
    g = 'grasper,grasp,gallbladder'
    h = 'hook,null_verb,null_target'
    rows = intervals({'VID01': {0: [g], 1: [g, h], 2: [h], 4: [g]}})
    assert rows == [
        ('VID01', 0, 2, 'grasper', 'grasp', 'gallbladder'),
        ('VID01', 1, 3, 'hook', 'null_verb', 'null_target'),
        ('VID01', 4, 5, 'grasper', 'grasp', 'gallbladder'),
    ]
