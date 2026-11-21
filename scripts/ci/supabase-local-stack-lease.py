#!/usr/bin/env python3
"""Bound the lifetime of one disposable Backyrd Supabase stack.

The detached watcher survives its owning shell. It stops only a project whose
identifier matches the narrow disposable Current Candidate namespace. No
production reference, persistent developer stack, or unrelated Docker project
can pass this boundary.
"""

import argparse
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

PROJECT_PATTERN = re.compile(r"backyrd-current-[A-Za-z0-9-]+")
MIN_TTL_SECONDS = 60
MAX_TTL_SECONDS = 4 * 60 * 60


def validate(project_id: str, ttl_seconds: int, cli: Path) -> None:
    if not PROJECT_PATTERN.fullmatch(project_id):
        raise ValueError("supabase_local_lease_project_id_invalid")
    if not MIN_TTL_SECONDS <= ttl_seconds <= MAX_TTL_SECONDS:
        raise ValueError("supabase_local_lease_ttl_invalid")
    if not cli.is_absolute() or not cli.is_file() or not os.access(cli, os.X_OK):
        raise ValueError("supabase_local_lease_cli_invalid")


def owner_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def watch(project_id: str, owner_pid: int, ttl_seconds: int, cli: Path,
          keep_after_owner: bool) -> int:
    validate(project_id, ttl_seconds, cli)
    deadline = time.monotonic() + ttl_seconds
    while time.monotonic() < deadline:
        if not keep_after_owner and not owner_alive(owner_pid):
            break
        time.sleep(min(5, max(0, deadline - time.monotonic())))
    result = subprocess.run(
        [str(cli), "stop", "--project-id", project_id, "--no-backup", "--yes"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=90,
        check=False,
    )
    return result.returncode


def arm(project_id: str, owner_pid: int, ttl_seconds: int, cli: Path,
        keep_after_owner: bool) -> int:
    validate(project_id, ttl_seconds, cli)
    command = [
        sys.executable, str(Path(__file__).resolve()), "watch",
        "--project-id", project_id,
        "--owner-pid", str(owner_pid),
        "--ttl-seconds", str(ttl_seconds),
        "--cli", str(cli),
    ]
    if keep_after_owner:
        command.append("--keep-after-owner")
    process = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        close_fds=True,
    )
    return process.pid


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("arm", "watch"))
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--owner-pid", required=True, type=int)
    parser.add_argument("--ttl-seconds", required=True, type=int)
    parser.add_argument("--cli", required=True, type=Path)
    parser.add_argument("--keep-after-owner", action="store_true")
    args = parser.parse_args()
    try:
        if args.mode == "arm":
            print(arm(args.project_id, args.owner_pid, args.ttl_seconds,
                      args.cli.resolve(), args.keep_after_owner))
            return 0
        return watch(args.project_id, args.owner_pid, args.ttl_seconds,
                     args.cli.resolve(), args.keep_after_owner)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(str(error) if str(error).startswith("supabase_local_lease_")
              else "supabase_local_lease_failed", file=sys.stderr)
        return 75


if __name__ == "__main__":
    raise SystemExit(main())
