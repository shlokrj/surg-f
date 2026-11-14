import unittest
from unittest.mock import Mock, patch
import contextlib
import io
import gpu_run
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


class ServerlessTests(unittest.TestCase):
    def setUp(self):
        self.w = Mock()
        self.w.jobs.submit.return_value.response.run_id = 123
        self.w.jobs.get_run.return_value.run_page_url = 'https://example.test/run/123'

    def start(self, full=False, smoke=None):
        with patch.object(gpu_run, 'client', return_value=self.w), \
             patch.object(gpu_run, 'snapshot', return_value=('revision', '/snapshot')), \
             patch.object(gpu_run, 'deploy'), contextlib.redirect_stdout(io.StringIO()):
            gpu_run.start('VID01', full, 15, True, smoke)

    def test_cpu_request_has_cpu_packages_and_explicit_device(self):
        self.start()
        request = self.w.jobs.submit.call_args.kwargs
        task = request['tasks'][0]
        self.assertIsNone(task.compute)
        self.assertEqual(task.notebook_task.base_parameters['device'], 'cpu')
        self.assertEqual(task.notebook_task.base_parameters['module_dir'], '/Workspace/snapshot')
        self.assertEqual(request['environments'][0].spec.base_environment,
                         'workspace-base-environments/databricks_ml_v6')
        self.assertEqual(request['environments'][0].spec.dependencies, ['ijson==3.6.0'])
        self.assertEqual(request['timeout_seconds'], 900)
        self.assertEqual(task.max_retries, 0)

    def test_full_without_smoke_is_not_submitted(self):
        with self.assertRaises(SystemExit): self.start(full=True)
        self.w.jobs.submit.assert_not_called()

    def test_gpu_smoke_does_not_authorize_cpu_full_run(self):
        task = RunTask(task_key='extract', state=RunState(result_state=RunResultState.SUCCESS),
                       notebook_task=NotebookTask(notebook_path='/snapshot/extract_databricks',
                         base_parameters={'case_id': 'VID01', 'full_case': 'false',
                                          'device': 'cuda', 'module_dir': '/Workspace/snapshot'}))
        self.w.jobs.get_run.return_value = Run(tasks=[task])
        with self.assertRaises(SystemExit): self.start(full=True, smoke=42)
        self.w.jobs.submit.assert_not_called()


if __name__ == '__main__':
    unittest.main()
