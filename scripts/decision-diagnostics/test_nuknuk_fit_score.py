"""Decision-span alignment checks without loading MLX or model weights."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("fit_score", Path(__file__).with_name("nuknuk-fit-score.py"))
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


class Tokenizer:
    def __init__(self, pieces):
        self.pieces = pieces

    def decode(self, ids, **_kwargs):
        return "".join(self.pieces[i] for i in ids)


class SpanTests(unittest.TestCase):
    def test_repeated_instruction_marker_cannot_replace_completion(self):
        pieces = ['"modality":"NOT_REQUIRED"', ' prompt ', '"modality":"', 'NOT', '_REQUIRED', '"']
        self.assertEqual(score.span_positions(list(range(6)), Tokenizer(pieces),
                                             '"modality":"NOT_REQUIRED"', 'NOT_REQUIRED', 2), [3, 4])

    def test_embedded_unicode_and_boundary_tokens_are_scored(self):
        pieces = ['assistant ', '"text":"Get', 'rän', 'ke"']
        self.assertEqual(score.span_positions(list(range(4)), Tokenizer(pieces),
                                             '"text":"Getränke"', 'Getränke', 1), [1, 2, 3])

    def test_missing_or_unsupervised_marker_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'span_missing'):
            score.span_positions([0], Tokenizer(['wrong']), '"scope":"GROUP_TOTAL"', 'GROUP_TOTAL', 0)
        with self.assertRaisesRegex(ValueError, 'outside_completion'):
            score.span_positions([0, 1], Tokenizer(['"scope":"GROUP_TOTAL"', ' answer']),
                                 '"scope":"GROUP_TOTAL"', 'GROUP_TOTAL', 1)


if __name__ == '__main__':
    unittest.main()
