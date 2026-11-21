"""Fail-closed supervision of one owned local MLX process group on macOS.

Allocator limits are guidelines, not an OS memory guarantee. A separate small
watchdog kills the model group if monitoring dies or misses its heartbeat.
Never kills unrelated apps, alters Docker settings, or restarts a stopped run.
"""
import argparse
import ctypes
from collections import deque
import errno
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
MEMORY_WARNING_SAMPLES = 3
MEMORY_WARNING_SWAP_GROWTH_BYTES = 128 * 1024 * 1024
DOCKER_FOOTPRINT_LIMIT_BYTES = 8 * GIB
COMBINED_FOOTPRINT_LIMIT_BYTES = 34 * GIB
SUPERVISOR_LOCK_PATH = Path(tempfile.gettempdir()) / f"backyrd-nuknuk-{os.getuid()}.lock"
BOOTSTRAP = ("import mlx.core as mx,runpy,sys;"
             "mx.set_memory_limit(24*1024**3);mx.set_cache_limit(256*1024**2);mx.set_wired_limit(24*1024**3);"
             "sys.argv=[sys.argv[1],*sys.argv[2:]];runpy.run_module(sys.argv[0],run_name='__main__')")


class RusageV0(ctypes.Structure):
    # Apple SDK sys/resource.h RUSAGE_INFO_V0. Includes compressed/charged
    # footprint; ps RSS and MLX allocator peaks are different measurements.
    _fields_ = [("uuid", ctypes.c_ubyte * 16)] + [
        (name, ctypes.c_uint64) for name in (
            "user_time", "system_time", "idle_wakes", "interrupt_wakes",
            "pageins", "wired_size", "resident_size", "phys_footprint",
            "start_time", "exit_time")]


def physical_footprint(pid):
    lib = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    usage = RusageV0()
    query = lib.proc_pid_rusage
    query.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
    query.restype = ctypes.c_int
    if query(pid, 0, ctypes.byref(usage)) != 0:
        code = ctypes.get_errno()
        if code == errno.ESRCH:
            return 0  # Worker exited between ps and this query.
        raise OSError(code, "nuknuk_physical_footprint_unavailable")
    return usage.phys_footprint


def read_host(model_pid=None, disk_paths=()):
    pressure = int(subprocess.check_output(
        ["/usr/sbin/sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True, timeout=1).strip())
    swap = subprocess.check_output(["/usr/sbin/sysctl", "-n", "vm.swapusage"], text=True, timeout=1)
    match = re.search(r"used\s*=\s*([\d.]+)M", swap)
    if not match:
        raise ValueError("nuknuk_host_swap_unreadable")
    process_text = subprocess.check_output(
        ["/bin/ps", "-axo", "pid=,ppid=,pgid=,rss=,comm="], text=True, timeout=1)
    processes = {}
    for line in process_text.splitlines():
        fields = line.split(None, 4)
        if len(fields) == 5:
            pid, ppid, pgid, rss = map(int, fields[:4])
            processes[pid] = (ppid, pgid, rss * 1024, fields[4])
    docker_pids = {
        pid for pid, (_, _, _, command) in processes.items()
        if "/Docker.app/" in command or Path(command).name.startswith("com.docker.")
    }
    # Docker's macOS VM runs as an Apple XPC binary. Attribute it through its
    # Docker-owned parent chain rather than treating every system VM as Docker.
    changed = True
    while changed:
        descendants = {
            pid for pid, (ppid, _, _, _) in processes.items()
            if ppid in docker_pids and pid not in docker_pids
        }
        changed = bool(descendants)
        docker_pids.update(descendants)
    own_rss = 0
    own_footprint = 0
    docker_rss = 0
    docker_footprint = 0
    docker_footprint_fallbacks = 0
    for pid, (_, pgid, rss, _) in processes.items():
        if pgid == model_pid:
            own_rss += rss
            own_footprint += physical_footprint(pid)
        if pid in docker_pids:
            docker_rss += rss
            try:
                docker_footprint += physical_footprint(pid)
            except OSError:
                # macOS protects the Docker-owned Apple VM XPC process from
                # proc_pid_rusage. RSS is conservative enough for its fallback.
                docker_footprint += rss
                docker_footprint_fallbacks += 1
    # top MEM uses the OS memory ledger, rather than ps RSS. Store bounded
    # process names and figures only (no argv/user content) for attribution.
    top = subprocess.check_output(["/usr/bin/top", "-l", "1", "-o", "mem", "-n", "8",
                                   "-stats", "pid,command,mem,cmprs"], text=True, timeout=2)
    return {"pressure": pressure, "swapUsedBytes": int(float(match[1]) * 1024 ** 2),
            "diskFreeBytes": min(shutil.disk_usage(p).free for p in (Path.cwd(), *disk_paths)),
            "modelRssBytes": own_rss, "modelPhysicalFootprintBytes": own_footprint,
            "dockerRssBytes": docker_rss, "dockerPhysicalFootprintBytes": docker_footprint,
            "dockerFootprintFallbackPids": docker_footprint_fallbacks,
            "topMemorySnapshot": top[-4000:], "dockerRunning": docker_footprint > 0}


def stop_reason(sample, initial, warnings=0):
    if sample["pressure"] >= 4:
        return "CRITICAL_HOST_MEMORY_PRESSURE"
    if (sample["pressure"] != 1 and warnings >= MEMORY_WARNING_SAMPLES
            and sample["swapUsedBytes"] - initial["swapUsedBytes"] > MEMORY_WARNING_SWAP_GROWTH_BYTES):
        return "HOST_MEMORY_WARNING_WITH_SWAP_GROWTH"
    if sample.get("diskFreeBytes", 100 * GIB) < 30 * GIB:
        return "DISK_RESERVE_BELOW_30_GIB"
    if sample.get("modelPhysicalFootprintBytes", 0) > 28 * GIB:
        return "MODEL_GROUP_PHYSICAL_FOOTPRINT_OVER_28_GIB"
    if sample.get("modelRssBytes", 0) > 28 * GIB:
        return "MODEL_GROUP_RSS_OVER_28_GIB"
    if sample.get("dockerPhysicalFootprintBytes", 0) > DOCKER_FOOTPRINT_LIMIT_BYTES:
        return "DOCKER_PHYSICAL_FOOTPRINT_OVER_8_GIB"
    if (sample.get("modelPhysicalFootprintBytes", 0)
            + sample.get("dockerPhysicalFootprintBytes", 0) > COMBINED_FOOTPRINT_LIMIT_BYTES):
        return "MODEL_AND_DOCKER_PHYSICAL_FOOTPRINT_OVER_34_GIB"
    if sample["swapUsedBytes"] - initial["swapUsedBytes"] > GIB // 2:
        return "SWAP_GROWTH_OVER_512_MIB"
    return None


def preflight_reason(sample):
    if sample["pressure"] != 1:
        return "HOST_MEMORY_WARNING"
    return stop_reason(sample, sample)


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
    fd = os.open(SUPERVISOR_LOCK_PATH, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise ValueError("nuknuk_another_guarded_run_active") from None
    return fd


def supervise(module, arguments, receipt, *, persistent_serving=False):
    if module not in ("mlx_vlm.train", "mlx_vlm.server", "backyrd.nuknuk-memory-probe", "backyrd.nuknuk-fit-score") or sys.platform != "darwin":
        raise ValueError("nuknuk_guard_platform_or_module_invalid")
    if persistent_serving and module != "mlx_vlm.server":
        raise ValueError("nuknuk_persistent_mode_requires_server")
    lock_fd = supervisor_lock()
    try:
        return supervise_locked(module, arguments, receipt.resolve(), persistent_serving=persistent_serving)
    finally:
        os.close(lock_fd)


def supervise_locked(module, arguments, receipt, *, persistent_serving=False):
    initial = read_host()
    reason = preflight_reason(initial)
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
    reason = preflight_reason(initial)
    if reason:
        raise ValueError("nuknuk_host_not_ready:" + reason)
    process = None
    watcher = None
    read_fd, write_fd = os.pipe()
    previous = {}
    reason = None
    samples = deque(maxlen=60) if persistent_serving else []
    last_recorded = None
    warning_samples = 0
    started = time.monotonic()
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    try:
        with journal_path.open("x") as journal:
            journal_path.chmod(0o600)
            def record(sample, *, force=False):
                nonlocal last_recorded
                elapsed = time.monotonic() - started
                if persistent_serving and not force and last_recorded is not None and elapsed - last_recorded < 60:
                    return
                last_recorded = elapsed
                samples.append({"elapsedSeconds": round(elapsed, 2), **sample})
                if persistent_serving:
                    journal.seek(0)
                    journal.truncate()
                    journal.writelines(json.dumps(row) + "\n" for row in samples)
                else:
                    journal.write(json.dumps(samples[-1]) + "\n")
                journal.flush()
                os.fsync(journal.fileno())
            record(initial)
            previous = {s: signal.signal(s, interrupted) for s in (signal.SIGTERM, signal.SIGINT)}
            bootstrap = BOOTSTRAP
            if module in ("backyrd.nuknuk-memory-probe", "backyrd.nuknuk-fit-score"):
                probe_path = str(Path(__file__).with_name(module.split(".")[-1] + ".py").resolve())
                bootstrap = bootstrap.replace("runpy.run_module(sys.argv[0],run_name='__main__')",
                                              f"runpy.run_path({probe_path!r},run_name='__main__')")
            process = subprocess.Popen([sys.executable, "-u", "-c", bootstrap, module, *arguments], start_new_session=True)
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
                warning_samples = warning_samples + 1 if current["pressure"] != 1 else 0
                # Decide before I/O: full disk/log errors must not delay a stop.
                reason = stop_reason(current, initial, warning_samples)
                if not persistent_serving and time.monotonic() - started > MAX_RUN_SECONDS:
                    reason = reason or "OWNED_PROCESS_TIME_BOUND"
                if reason:
                    terminate_owned(process, immediate=True)
                record(current, force=bool(reason))
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
            json.dump({"version": 5, "module": module, "pid": process.pid if process else None,
                       "allocatorGuidelineGiB": 24, "cacheLimitMiB": 256,
                       "wiredResidencyBudgetGiB": None if module == "backyrd.nuknuk-memory-probe" else 24,
                       "status": status, "returncode": process.returncode if process else None,
                       "pollSeconds": POLL_SECONDS, "heartbeatTimeoutSeconds": HEARTBEAT_SECONDS,
                       "samples": list(samples)}, file, indent=2)
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
        parser.add_argument("--persistent-serving", action="store_true")
        parser.add_argument("module", choices=["mlx_vlm.train", "mlx_vlm.server", "backyrd.nuknuk-memory-probe", "backyrd.nuknuk-fit-score"])
        parser.add_argument("arguments", nargs=argparse.REMAINDER)
        args = parser.parse_args()
        try:
            sys.exit(supervise(args.module, args.arguments, args.receipt,
                               persistent_serving=args.persistent_serving))
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            print(str(error) if str(error).startswith("nuknuk_") else "nuknuk_resource_preflight_failed", file=sys.stderr)
            sys.exit(75)
