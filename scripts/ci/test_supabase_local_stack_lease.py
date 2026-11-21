"""Tests for the disposable local Supabase lifetime boundary."""

import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "supabase_local_stack_lease",
    Path(__file__).with_name("supabase-local-stack-lease.py"),
)
lease = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lease)


class SupabaseLocalStackLeaseTests(unittest.TestCase):
    def fake_cli(self, root: Path) -> tuple[Path, Path]:
        output = root / "called.txt"
        cli = root / "supabase"
        cli.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$LEASE_TEST_OUTPUT"\n')
        cli.chmod(0o700)
        return cli, output

    def test_rejects_non_disposable_project_and_unbounded_ttl(self):
        with tempfile.TemporaryDirectory() as tmp:
            cli, _ = self.fake_cli(Path(tmp))
            for project, ttl, expected in (
                ("backyrd", 60, "project_id_invalid"),
                ("hjgcrrzfjchzqoegcywn", 60, "project_id_invalid"),
                ("backyrd-current-test", 59, "ttl_invalid"),
                ("backyrd-current-test", 14401, "ttl_invalid"),
            ):
                with self.subTest(project=project, ttl=ttl), self.assertRaisesRegex(ValueError, expected):
                    lease.validate(project, ttl, cli)

    def test_orphaned_owner_stops_only_exact_disposable_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            cli, output = self.fake_cli(Path(tmp))
            previous = os.environ.get("LEASE_TEST_OUTPUT")
            os.environ["LEASE_TEST_OUTPUT"] = str(output)
            try:
                result = lease.watch("backyrd-current-test-123", 99999999, 60, cli, False)
            finally:
                if previous is None:
                    os.environ.pop("LEASE_TEST_OUTPUT", None)
                else:
                    os.environ["LEASE_TEST_OUTPUT"] = previous
            self.assertEqual(result, 0)
            self.assertEqual(output.read_text().splitlines(), [
                "stop", "--project-id", "backyrd-current-test-123", "--no-backup", "--yes",
            ])


if __name__ == "__main__":
    unittest.main()
