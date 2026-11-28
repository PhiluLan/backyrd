"""Cache speed scope, lifecycle and installed hybrid-checkpoint boundaries."""
from contextlib import contextmanager
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prefix_speed', Path(__file__).with_name('nuknuk-prefix-speed.py'))
prefix = importlib.util.module_from_spec(spec); spec.loader.exec_module(prefix)


class PrefixBoundaries(unittest.TestCase):
    def test_roster_has21_requests18_measured_and_bound_pair_order(self):
        rows = prefix.roster()
        self.assertEqual((len(rows), sum(r['warmup'] for r in rows)), (21, 3))
        self.assertEqual([r['cacheCondition'] for r in rows[3:9]], ['cold', 'cached', 'cached', 'cold', 'cold', 'cached'])
        for case in range(3):
            self.assertEqual([r['cacheCondition'] for r in rows if r['mode'] == 'actual_grammar' and r['case'] == case],
                             ['cold', 'cached', 'cached', 'cold'])

    def test_scope_cannot_enable_optimizer_or_new_matrix(self):
        payload = {'evaluation': [{'id': str(i)} for i in range(33)]}
        required = ['speed-source','speed-tests','speed-trace-preflight','prefix-source','prefix-tests',
                    'prefix-preflight','stage1-plan','stage1-review','apc-design']
        plan = {'prefixConfig': prefix.CONFIG, 'optimizerAllowed': False, 'benchmarkRoster': prefix.roster(),
                'speedRowIds': ['0','12','32'], 'files': {k: {'path': 'synthetic'} for k in required}}
        pre = {'status':'PASS','boundary':1968,'cases':[{'sharedPrefixSha256':prefix.PREFIX_SHA,'systemTokens':3957}]*3}
        with patch.object(Path, 'read_text', return_value=__import__('json').dumps(pre)):
            prefix.verify(plan,payload)
            for key,value in [('optimizerAllowed',True),('benchmarkRoster',[]),('prefixConfig',{})]:
                with self.assertRaisesRegex(ValueError,'scope_invalid'):
                    prefix.verify({**plan,key:value},payload)

    def test_bad_boundary_or_changed_prefix_rejected(self):
        for ids in ([], [1]*1968, [1]*4000):
            with self.assertRaisesRegex(ValueError,'identity_changed'):
                prefix.validate_prefix(ids)

    def test_exact_hit_required_not_longer_or_silent_miss(self):
        for condition,expected in [('prime',0),('cold',0),('cached',1968)]:
            prefix.check_cached_tokens(expected,condition)
            for wrong in (None, expected+1):
                with self.assertRaisesRegex(ValueError,'unexpected_cached'):
                    prefix.check_cached_tokens(wrong,condition)

    def test_observer_separates_full_input_and_reused_suffix(self):
        seen=[]
        @contextmanager
        def original(model,ids,actual):
            seen.append(ids); actual.extend(ids); yield
        ids=list(range(4000))
        with patch.object(prefix,'PREFIX_SHA',prefix.digest(ids[:1968])):
            for condition in ('cold','cached'):
                with prefix.suffix_observer(original,condition)(None,ids,[]): pass
        self.assertEqual(seen,[ids,ids[1968:]])

    def test_stream_error_and_close_restore_guard_and_close_inner(self):
        ids=list(range(4000)); manager=SimpleNamespace(exact_cache_guard_tokens=1)
        coordinator=SimpleNamespace(enabled=True,strategy='checkpoint',checkpoint_len=lambda *_:1968,
                                    checkpoint_lengths=lambda *_:[1968])
        closed=[]
        def original(*args,**kwargs):
            try:
                self.assertIs(kwargs['apc_manager'],manager)
                yield SimpleNamespace(finish_reason=None)
                raise RuntimeError('synthetic')
            finally:closed.append(True)
        with patch.object(prefix,'PREFIX_SHA',prefix.digest(ids[:1968])):
            for fail in (False,True):
                gen=prefix.injected_stream(original,manager,coordinator,ids,'job',{} )()
                next(gen);self.assertEqual(manager.exact_cache_guard_tokens,2032)
                if fail:
                    with self.assertRaisesRegex(RuntimeError,'synthetic'):next(gen)
                else:gen.close()
                self.assertEqual(manager.exact_cache_guard_tokens,1)
        self.assertEqual(closed,[True,True])

    def test_snapshot_cannot_retain_user_tail(self):
        manager=SimpleNamespace(_exact_cache={0:SimpleNamespace(token_ids=[1]*3999,prompt_cache=[None]*32)})
        with self.assertRaisesRegex(ValueError,'user_tail'):prefix.cache_receipt(manager)

    def test_changed_output_never_claims_equivalent_meaning(self):
        base={'mode':'actual_grammar','case':0,'repeat':1,'warmup':False,'prefixSha256':'same',
              'finishReason':'stop','jsonParses':True,'ttftSeconds':9,'completeSeconds':18,
              'outputTokensIncludingEos':2,'outputTokenIds':[1,2]}
        rows=[{**base,'cacheCondition':'cold'},{**base,'cacheCondition':'cached','outputTokenIds':[3,2],'ttftSeconds':5}]
        pair=prefix.pairs(rows)[0]
        self.assertFalse(pair['outputTokenIdsIdentical']);self.assertFalse(pair['meaningOrHostEquivalentProven'])
        self.assertEqual(pair['ttftSecondsSaved'],4)

    def test_manager_release_actually_clears_resident_snapshots_before_close(self):
        events=[]
        manager=SimpleNamespace(clear=lambda:events.append('clear'),close=lambda:events.append('close'))
        prefix.release_manager(manager)
        self.assertEqual(events,['clear','close'])

    def test_recipe_b_rejected_before_live_operations(self):
        source=Path(__file__).with_name('nuknuk-native-learning.py')
        s=importlib.util.spec_from_file_location('native_prefix_test',source)
        native=importlib.util.module_from_spec(s);s.loader.exec_module(native)
        with self.assertRaisesRegex(ValueError,'no_second_recipe'):
            native.execute(SimpleNamespace(native_plan=Path('/synthetic/plan.json'),recipe='B'),{'kind':prefix.KIND})


class InstalledHybridPolicy(unittest.TestCase):
    def test_variable_full_length_keeps_only1968_installed_checkpoint(self):
        import mlx.core as mx
        mx.set_default_device(mx.cpu)
        from mlx_vlm.apc_coordinator import APCCoordinator
        from mlx_vlm.models.cache import ArraysCache, KVCache
        model=SimpleNamespace(make_cache=lambda:[ArraysCache(size=2) if i%4!=3 else KVCache() for i in range(32)])
        manager=prefix.make_manager()
        try:
            coordinator=APCCoordinator(manager,model)
            self.assertEqual(coordinator.strategy,'checkpoint')
            for length in (3988,3999,3991):
                ids=list(range(length))
                with patch.object(prefix,'PREFIX_SHA',prefix.digest(ids[:1968])):
                    with prefix.checkpoint_policy(manager,coordinator,ids):
                        self.assertEqual(manager.exact_cache_guard_tokens,length-1968)
                        self.assertEqual(coordinator.checkpoint_lengths(ids,set()),[1968])
                self.assertEqual(manager.exact_cache_guard_tokens,1)
        finally:manager.close()


if __name__=='__main__':unittest.main()
