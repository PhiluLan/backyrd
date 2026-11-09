"""Fail-closed supervision of one owned local MLX process group on macOS.

Allocator limits are guidelines, not an OS memory guarantee. A separate small
watchdog kills the model group if monitoring dies or misses its heartbeat.
Never kills unrelated apps, alters Docker settings, or restarts a stopped run.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import select
import signal
import shutil
import subprocess
import sys
import tempfile
import time

GIB = 1024 ** 3
POLL_SECONDS = 1
HEARTBEAT_SECONDS = 10
MAX_RUN_SECONDS = 14000
BOOTSTRAP = ("import mlx.core as mx,runpy,sys;"
             "mx.set_memory_limit(24*1024**3);mx.set_cache_limit(256*1024**2);"
             "sys.argv=[sys.argv[1],*sys.argv[2:]];runpy.run_module(sys.argv[0],run_name='__main__')")


def read_host(model_pid=None, disk_paths=()):
    pressure = int(subprocess.check_output(
        ["/usr/sbin/sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True, timeout=1).strip())
    swap = subprocess.check_output(["/usr/sbin/sysctl", "-n", "vm.swapusage"], text=True, timeout=1)
    match = re.search(r"used\s*=\s*([\d.]+)M", swap)
    if not match:
        raise ValueError("nuknuk_host_swap_unreadable")
    processes = subprocess.check_output(["/bin/ps", "-axo", "pid=,pgid=,rss=,comm="], text=True, timeout=1)
    own_rss = 0
    docker = False
    for line in processes.splitlines():
        fields = line.split(None, 3)
        if len(fields) != 4:
            continue
        docker |= "/Docker.app/" in fields[3] or "com.docker.backend" in fields[3]
        if int(fields[1]) == model_pid:
            own_rss += int(fields[2]) * 1024
    return {"pressure": pressure, "swapUsedBytes": int(float(match[1]) * 1024 ** 2),
            "diskFreeBytes": min(shutil.disk_usage(p).free for p in (Path.cwd(), *disk_paths)),
            "modelRssBytes": own_rss, "dockerRunning": docker}


def stop_reason(sample, initial, warnings=0):
    if sample["pressure"] >= 4:
        return "CRITICAL_HOST_MEMORY_PRESSURE"
    if sample["pressure"] != 1 or warnings:
        return "HOST_MEMORY_WARNING"
    if sample.get("dockerRunning"):
        return "DOCKER_RUNNING"
    if sample.get("diskFreeBytes", 100 * GIB) < 30 * GIB:
        return "DISK_RESERVE_BELOW_30_GIB"
    if sample.get("modelRssBytes", 0) > 28 * GIB:
        return "MODEL_GROUP_RSS_OVER_28_GIB"
    if sample["swapUsedBytes"] - initial["swapUsedBytes"] > GIB // 2:
        return "SWAP_GROWTH_OVER_512_MIB"
    return None


def terminate_owned(process, immediate=False):
    # Signal the group even if its leader has exited: workers must not survive.
    try:
        os.killpg(process.pid, signal.SIGKILL if immediate else signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=2)


def watchdog(group_pid, heartbeat_fd, event_path, timeout=HEARTBEAT_SECONDS):
    """Independent lifeline. EOF also handles supervisor SIGKILL/crash."""
    reason = "SUPERVISOR_HEARTBEAT_LOST"
    while True:
        ready, _, _ = select.select([heartbeat_fd], [], [], timeout)
        if not ready:
            break
        if not os.read(heartbeat_fd, 4096):
            reason = "SUPERVISOR_DISCONNECTED"
            break
    try:
        os.killpg(group_pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    event = {"resourceStop": reason, "groupPid": group_pid}
    print(json.dumps(event), file=sys.stderr, flush=True)
    try:
        with Path(event_path).open("x") as file:
            os.chmod(event_path, 0o600)
            json.dump(event, file)
            file.flush()
            os.fsync(file.fileno())
    except OSError:
        pass  # Killing the model must never depend on a writable disk.


def supervisor_lock():
    path = Path(tempfile.gettempdir()) / f"backyrd-nuknuk-{os.getuid()}.lock"
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise ValueError("nuknuk_another_guarded_run_active") from None
    return fd


def supervise(module, arguments, receipt):
    if module not in ("mlx_vlm.train", "mlx_vlm.server") or sys.platform != "darwin":
        raise ValueError("nuknuk_guard_platform_or_module_invalid")
    lock_fd = supervisor_lock()
    try:
        return supervise_locked(module, arguments, receipt.resolve())
    finally:
        os.close(lock_fd)


def supervise_locked(module, arguments, receipt):
    initial = read_host()
    reason = stop_reason(initial, initial)
    if reason:
        raise ValueError("nuknuk_host_not_ready:" + reason)
    journal_path = receipt.with_suffix(".samples.jsonl")
    event_path = receipt.with_suffix(".watchdog.json")
    stop_path = receipt.with_suffix(".stop")
    if any(p.exists() for p in (receipt, journal_path, event_path, stop_path)):
        raise ValueError("nuknuk_resource_receipt_exists")
    receipt.parent.mkdir(parents=True, exist_ok=True)
    # Check the output volume as well as cwd before loading any model weights.
    initial = read_host(disk_paths=(receipt.parent,))
    reason = stop_reason(initial, initial)
    if reason:
        raise ValueError("nuknuk_host_not_ready:" + reason)
    process = None
    watcher = None
    read_fd, write_fd = os.pipe()
    previous = {}
    reason = None
    samples = []
    started = time.monotonic()
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    try:
        with journal_path.open("x") as journal:
            journal_path.chmod(0o600)
            def record(sample):
                samples.append({"elapsedSeconds": round(time.monotonic() - started, 2), **sample})
                journal.write(json.dumps(samples[-1]) + "\n")
                journal.flush()
                os.fsync(journal.fileno())
            record(initial)
            previous = {s: signal.signal(s, interrupted) for s in (signal.SIGTERM, signal.SIGINT)}
            process = subprocess.Popen([sys.executable, "-u", "-c", BOOTSTRAP, module, *arguments], start_new_session=True)
            watcher = subprocess.Popen([sys.executable, "-u", str(Path(__file__).resolve()), "--watchdog",
                                        str(process.pid), str(read_fd), str(event_path)],
                                       pass_fds=(read_fd,), start_new_session=True)
            os.close(read_fd)
            read_fd = None
            os.write(write_fd, b".")
            print(json.dumps({"resourceGuard": "ACTIVE", "groupPid": process.pid,
                              "manualStopFile": str(stop_path)}), flush=True)
            while process.poll() is None:
                if watcher.poll() is not None:
                    reason = "INDEPENDENT_WATCHDOG_UNAVAILABLE"
                    break
                if stop_path.exists():
                    reason = "MANUAL_STOP_REQUESTED"
                    break
                try:
                    process.wait(timeout=POLL_SECONDS)
                    break
                except subprocess.TimeoutExpired:
                    pass
                current = read_host(process.pid, (receipt.parent,))
                # Decide before I/O: full disk/log errors must not delay a stop.
                reason = stop_reason(current, initial)
                if time.monotonic() - started > MAX_RUN_SECONDS:
                    reason = reason or "OWNED_PROCESS_TIME_BOUND"
                if reason:
                    terminate_owned(process, immediate=True)
                record(current)
                if reason:
                    break
                os.write(write_fd, b".")
    except KeyboardInterrupt:
        reason = "SUPERVISOR_INTERRUPTED"
    except (OSError, ValueError, subprocess.SubprocessError):
        reason = reason or "HOST_MONITOR_OR_JOURNAL_UNAVAILABLE"
    finally:
        # Keep cleanup protected from a second Ctrl-C/SIGTERM.
        for signum in previous:
            signal.signal(signum, signal.SIG_IGN)
        try:
            if process is not None:
                terminate_owned(process, immediate=True)
        finally:
            os.close(write_fd)
            if read_fd is not None:
                os.close(read_fd)
            if watcher is not None:
                try:
                    watcher.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    watcher.kill()
                    watcher.wait(timeout=2)
            for signum, handler in previous.items():
                signal.signal(signum, handler)
    if event_path.exists() and not reason:
        reason = json.loads(event_path.read_text())["resourceStop"]
    status = reason or ("FINISHED" if process is not None and process.returncode == 0 else "PROCESS_FAILED")
    try:
        with receipt.open("x") as file:
            receipt.chmod(0o600)
            json.dump({"version": 3, "module": module, "pid": process.pid if process else None,
                       "allocatorGuidelineGiB": 24, "cacheLimitMiB": 256,
                       "status": status, "returncode": process.returncode if process else None,
                       "pollSeconds": POLL_SECONDS, "heartbeatTimeoutSeconds": HEARTBEAT_SECONDS,
                       "samples": samples}, file, indent=2)
            file.flush()
            os.fsync(file.fileno())
    except OSError:
        reason = reason or "RESOURCE_RECEIPT_UNAVAILABLE"
    print(json.dumps({"resourceGuard": "STOPPED", "status": reason or status}), flush=True)
    return 75 if reason else (process.returncode if process else 75)


if __name__ == "__main__":
    if len(sys.argv) == 5 and sys.argv[1] == "--watchdog":
        watchdog(int(sys.argv[2]), int(sys.argv[3]), sys.argv[4])
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--receipt", type=Path, required=True)
        parser.add_argument("module", choices=["mlx_vlm.train", "mlx_vlm.server"])
        parser.add_argument("arguments", nargs=argparse.REMAINDER)
        args = parser.parse_args()
        try:
            sys.exit(supervise(args.module, args.arguments, args.receipt))
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            print(str(error) if str(error).startswith("nuknuk_") else "nuknuk_resource_preflight_failed", file=sys.stderr)
            sys.exit(75)
