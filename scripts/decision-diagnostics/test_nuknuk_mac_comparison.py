"""CPU-only maintenance failure paths. Never calls launchctl or loads a model."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('mac',Path(__file__).with_name('nuknuk-mac-comparison.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_gpu_completion_is_required_before_any_live_inspection(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c=root/'candidate';c.mkdir();(c/'conversion.json').write_text('{}');p=root/'completion.json';p.write_text('{"status":"TRAINING"}')
   with patch.object(m,'health')as health:
    with self.assertRaisesRegex(ValueError,'secured_training_completion_required'):m.preflight(root,c,p,Path('/python'))
    health.assert_not_called()
 def test_reused_guard_pid_cannot_terminate_an_unrelated_process(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);receipt=root/'resource.json';(root/'owned-guard.json').write_text(json.dumps({'pid':123,'receipt':str(receipt)}))
   with patch.object(m.subprocess,'run',return_value=Mock(stdout='/unrelated/app')),patch.object(m.os,'kill')as kill:
    m.stop_owned(root);kill.assert_not_called();self.assertFalse(receipt.with_suffix('.stop').exists())
 def test_watchdog_restores_on_controller_pipe_eof(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'session.json').write_text(json.dumps({'deadline':time.time()+5}));r,w=os.pipe();os.close(w)
   try:
    with patch.object(m,'restore')as restore:m.watchdog(root,r);restore.assert_called_once_with(root)
   finally:os.close(r)
 def test_watchdog_restores_after_deadline_but_does_not_repeat_completed_restoration(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'session.json').write_text(json.dumps({'deadline':time.time()-1}));r,w=os.pipe()
   try:
    with patch.object(m,'restore')as restore:m.watchdog(root,r);restore.assert_called_once_with(root)
    (root/'restored.json').write_text('{}')
    with patch.object(m,'restore')as restore:m.watchdog(root,r);restore.assert_not_called()
   finally:os.close(r);os.close(w)
 def test_failure_to_pause_original_still_enters_restoration_finally(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);process=Mock();cfg={'deadline':time.time()+1200,'parentDirectories':[]}
   with patch.object(m,'preflight',return_value=cfg),patch.object(m.subprocess,'Popen',return_value=process),patch.object(m,'wait_until'),patch.object(m,'agent',return_value=Mock(returncode=1)),patch.object(m,'restore')as restore:
    self.assertEqual(m.run(root,root/'candidate',root/'completion',Path('/python')),1);restore.assert_called_once_with(root)
    self.assertIn('original_bootout_failed',json.loads((root/'test-error.json').read_text())['error']);process.terminate.assert_called()
 def test_completed_restore_is_idempotent_without_service_mutations(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'restored.json').write_text('{}')
   with patch.object(m,'agent')as agent,patch.object(m,'stop_owned')as stop:m.restore(root);agent.assert_not_called();stop.assert_not_called()
 def test_stale_pid_never_authorizes_terminating_an_unrelated_process(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);receipt=root/'parent-resources.json';(root/'owned-guard.json').write_text(json.dumps({'pid':123,'receipt':str(receipt)}))
   with patch.object(m.subprocess,'run',return_value=Mock(stdout='unrelated worker')),patch.object(m.os,'kill')as kill:
    m.stop_owned(root);kill.assert_not_called();self.assertFalse(receipt.with_suffix('.stop').exists())
 def test_preflight_rejects_incomplete_gpu_training_before_reading_live_service(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);candidate=root/'model';candidate.mkdir();(candidate/'conversion.json').write_text(json.dumps({'hfAdapterSha256':'a'*64}));completion=root/'completion.json';completion.write_text(json.dumps({'status':'TRAINING','candidateSha256':'a'*64}))
   with patch.object(m,'health')as health,patch.object(m,'agent')as agent:
    with self.assertRaisesRegex(ValueError,'secured_training_completion_required'):m.preflight(root,candidate,completion,Path('/python'))
    health.assert_not_called();agent.assert_not_called()
 def test_changed_original_launchagent_is_not_silently_started(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'session.json').write_text(json.dumps({'plistSha256':'expected'}))
   with patch.object(m,'stop_owned'),patch.object(m,'sha',return_value='changed'),patch.object(m,'agent')as agent:
    with self.assertRaisesRegex(RuntimeError,'original_agent_changed'):m.restore(root)
    agent.assert_not_called()
if __name__=='__main__':unittest.main()
