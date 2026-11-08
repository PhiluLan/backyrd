"""Supervise one owned local MLX process; stop on host pressure, never Docker.

MLX limits are allocator guidelines, not a hard host-RAM guarantee. macOS pressure
and swap growth therefore remain independent stop signals. Old swap alone does
not block a healthy host. No other applications are killed or reconfigured.
"""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

GIB = 1024 ** 3


def read_host():
    pressure = int(subprocess.check_output(
        ["/usr/sbin/sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True).strip())
    swap = subprocess.check_output(["/usr/sbin/sysctl", "-n", "vm.swapusage"], text=True)
    match = re.search(r"used\s*=\s*([\d.]+)M", swap)
    if not match:
        raise ValueError("nuknuk_host_swap_unreadable")
    processes = subprocess.check_output(["/bin/ps", "-axo", "pid=,rss=,comm="], text=True)
    if any("/Docker.app/" in line or "com.docker.backend" in line for line in processes.splitlines()):
        raise ValueError("nuknuk_docker_must_be_stopped")
    return {"pressure": pressure, "swapUsedBytes": int(float(match[1]) * 1024 ** 2)}


def stop_reason(sample, initial, warnings):
    if sample["pressure"] >= 4:
        return "CRITICAL_HOST_MEMORY_PRESSURE"
    if warnings >= 3:
        return "SUSTAINED_HOST_MEMORY_PRESSURE"
    if sample["swapUsedBytes"] - initial["swapUsedBytes"] > 2 * GIB:
        return "SWAP_GROWTH_OVER_2_GIB"
    return None


def terminate_owned(process):
    if process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=10)


def supervise(module, arguments, receipt):
    if module not in ("mlx_vlm.train", "mlx_vlm.server") or sys.platform != "darwin":
        raise ValueError("nuknuk_guard_platform_or_module_invalid")
    initial = read_host()
    if initial["pressure"] != 1:
        raise ValueError("nuknuk_host_not_ready")
    if receipt.exists():
        raise ValueError("nuknuk_resource_receipt_exists")
    # Imported inside the owned child, before loading weights. Cache is capped;
    # set_memory_limit alone does NOT impose an absolute process memory ceiling.
    bootstrap = ("import mlx.core as mx,runpy,sys;"
                 "mx.set_memory_limit(32*1024**3);mx.set_cache_limit(512*1024**2);"
                 "sys.argv=[sys.argv[1],*sys.argv[2:]];runpy.run_module(sys.argv[0],run_name='__main__')")
    process = subprocess.Popen([sys.executable, "-u", "-c", bootstrap, module, *arguments], start_new_session=True)
    samples = [{"elapsedSeconds": 0, **initial}]
    started = time.monotonic()
    warnings = 0
    reason = None
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    previous = {s: signal.signal(s, interrupted) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        while process.poll() is None:
            try:
                process.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                pass
            current = read_host()
            warnings = warnings + 1 if current["pressure"] != 1 else 0
            samples.append({"elapsedSeconds": round(time.monotonic() - started, 1), **current})
            reason = stop_reason(current, initial, warnings)
            if reason:
                print(json.dumps({"resourceStop": reason}), flush=True)
                break
    except KeyboardInterrupt:
        reason = "SUPERVISOR_INTERRUPTED"
    except (OSError, ValueError, subprocess.SubprocessError):
        reason = "HOST_MONITOR_UNAVAILABLE"
    finally:
        terminate_owned(process)
        for signum, handler in previous.items():
            signal.signal(signum, handler)
        receipt.parent.mkdir(parents=True, exist_ok=True)
        with receipt.open("x") as file:
            json.dump({"version": 1, "module": module, "pid": process.pid,
                       "allocatorGuidelineGiB": 32, "cacheLimitMiB": 512,
                       "status": reason or ("FINISHED" if process.returncode == 0 else "PROCESS_FAILED"),
                       "returncode": process.returncode, "samples": samples}, file, indent=2)
        receipt.chmod(0o600)
    return 75 if reason else process.returncode


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("module", choices=["mlx_vlm.train", "mlx_vlm.server"])
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    sys.exit(supervise(args.module, args.arguments, args.receipt))
