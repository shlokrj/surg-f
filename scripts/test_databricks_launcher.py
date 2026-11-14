import unittest
from databricks.sdk.service.jobs import NotebookTask, Run, RunTask, RunState, RunResultState
from run_databricks_features import validate_smoke


class SmokeGateTests(unittest.TestCase):
    def setUp(self):
        self.task = RunTask(task_key='extract', existing_cluster_id='gpu',
                            state=RunState(result_state=RunResultState.SUCCESS),
                            notebook_task=NotebookTask(notebook_path='/snapshot/extract_databricks',
                                base_parameters={'case_id': 'VID01', 'full_case': 'false',
                                                 'device': 'cuda', 'module_dir': '/Workspace/snapshot'}))

    def check(self):
        validate_smoke(Run(tasks=[self.task]), 'gpu', '/snapshot', 'VID01')

    def test_matching_success(self):
        self.check()

    def test_unfinished_run(self):
        self.task.state = RunState()
        with self.assertRaises(ValueError): self.check()

    def test_failed_run(self):
        self.task.state.result_state = RunResultState.FAILED
        with self.assertRaises(ValueError): self.check()

    def test_other_cluster(self):
        self.task.existing_cluster_id = 'other'
        with self.assertRaises(ValueError): self.check()

    def test_other_revision(self):
        self.task.notebook_task.notebook_path = '/old/extract_databricks'
        with self.assertRaises(ValueError): self.check()

    def test_other_case(self):
        self.task.notebook_task.base_parameters['case_id'] = 'VID02'
        with self.assertRaises(ValueError): self.check()

    def test_full_run_is_not_smoke(self):
        self.task.notebook_task.base_parameters['full_case'] = 'true'
        with self.assertRaises(ValueError): self.check()


if __name__ == '__main__':
    unittest.main()
